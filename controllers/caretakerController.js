const bcrypt = require("bcryptjs");
const Caretaker = require("../models/Caretaker");
const Citizen = require("../models/Citizen");
const Assignment = require("../models/Assignment");
const ServiceRequest = require("../models/ServiceRequest");
const ActivityLog = require("../models/ActivityLog");
const generateJwt = require("../utils/generateJwt");
const { SERVICE_ROLES, SERVICE_ROLE_LABELS, SHIFT_HOURS } = require("../config/plans");
const {
  publicCaretaker,
  publicAssignment,
  publicRequest,
  publicActivity,
  logActivity,
  refreshExpired,
} = require("../services/care");

// Fields the caretaker MUST fill (mirrors required fields of
// caretakerRegistrationConfig.js on the frontend).
const REQUIRED_FIELDS = {
  fullName: "Full Name",
  dob: "Date of Birth",
  gender: "Gender",
  address: "Address",
  emergencyContact: "Emergency Contact",
  idNumber: "PAN / Aadhaar Number",
  serviceRole: "Service Role",
  shiftHours: "Shift Hours",
  elderlyCareYears: "Years of Experience",
};

function readWorkProfile(src = {}) {
  const out = {};
  if (SERVICE_ROLES.includes(src.serviceRole)) out.serviceRole = src.serviceRole;
  const shift = Number(String(src.shiftHours ?? "").replace(/[^\d]/g, ""));
  if (SHIFT_HOURS.includes(shift)) out.shiftHours = shift;
  const yrs = Number(src.experienceYears ?? src.elderlyCareYears);
  if (Number.isFinite(yrs) && yrs >= 0 && String(src.experienceYears ?? src.elderlyCareYears ?? "") !== "") out.experienceYears = yrs;
  return out;
}

// POST /api/caretakers  — apply (public)
exports.createCaretaker = async (req, res) => {
  try {
    const { mobile, fullName, email, userId, password, ...profileFields } = req.body;

    if (!mobile || !/^\d{10}$/.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
    }
    const all = { fullName, ...profileFields };
    const missing = Object.entries(REQUIRED_FIELDS)
      .filter(([k]) => all[k] === undefined || all[k] === null || String(all[k]).trim() === "")
      .map(([, label]) => label);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Please fill: ${missing.join(", ")}` });
    }

    const trimmedMobile = String(mobile).trim();
    const existing = await Caretaker.findOne({ mobile: trimmedMobile });
    if (existing) {
      return res.status(200).json({ success: true, caretaker: publicCaretaker(existing) });
    }

    const chosenUserId = (userId || profileFields.userId || "").trim() || null;
    if (chosenUserId) {
      const userIdTaken = await Caretaker.findOne({ userId: chosenUserId });
      if (userIdTaken) {
        return res.status(409).json({ success: false, message: "That User ID is already taken." });
      }
    }

    const rawPassword = password || profileFields.password || "";
    const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
    delete profileFields.password; // never keep plain password inside profile

    const caretaker = await Caretaker.create({
      mobile: trimmedMobile,
      fullName: fullName || "",
      email: email || "",
      userId: chosenUserId,
      password: hashedPassword,
      status: "pending",
      ...readWorkProfile(profileFields),
      profile: { mobile: trimmedMobile, fullName, email, userId: chosenUserId, ...profileFields },
    });

    await logActivity({
      type: "caretaker.applied",
      message: `New ${SERVICE_ROLE_LABELS[caretaker.serviceRole]} application — ${caretaker.fullName} (${caretaker.experienceYears} yrs exp, ${caretaker.shiftHours} hr shift)`,
      actorRole: "caretaker",
      actorId: String(caretaker._id),
      caretaker: caretaker._id,
    });

    return res.status(201).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("createCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers?status=pending|approved|rejected — admin
exports.getAllCaretakers = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const caretakers = await Caretaker.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, caretakers: caretakers.map(publicCaretaker) });
  } catch (error) {
    console.error("getAllCaretakers Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers/:id — admin (full profile + duties + history) or self
exports.getCaretakerById = async (req, res) => {
  try {
    if (req.user.role !== "admin" && String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const caretaker = await Caretaker.findById(req.params.id);
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });

    await refreshExpired();
    const [assignments, requests, activity] = await Promise.all([
      Assignment.find({ caretaker: caretaker._id }).populate("citizen").sort({ createdAt: -1 }),
      ServiceRequest.find({ caretaker: caretaker._id }).populate("citizen").sort({ createdAt: -1 }),
      ActivityLog.find({ caretaker: caretaker._id }).sort({ createdAt: -1 }).limit(200),
    ]);
    return res.status(200).json({
      success: true,
      caretaker: publicCaretaker(caretaker),
      assignments: assignments.map(publicAssignment),
      requests: requests.map(publicRequest),
      activity: activity.map(publicActivity),
    });
  } catch (error) {
    console.error("getCaretakerById Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers/me/overview — logged-in caretaker's own dashboard data
exports.getMyOverview = async (req, res) => {
  try {
    await refreshExpired();
    const caretaker = await Caretaker.findById(req.user.id);
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });

    const assignments = await Assignment.find({ caretaker: caretaker._id }).populate("citizen").sort({ slotStart: 1 });
    const activeCitizenIds = assignments.filter((a) => a.status === "active").map((a) => a.citizen?._id);
    const requests = await ServiceRequest.find({
      $or: [{ caretaker: caretaker._id }, { citizen: { $in: activeCitizenIds }, targetRole: "caretaker", caretaker: null }],
    })
      .populate("citizen")
      .populate("caretaker")
      .sort({ createdAt: -1 });

    // Full citizen records for the households currently on duty (care notes etc.)
    const citizens = await Citizen.find({ _id: { $in: activeCitizenIds } });

    return res.status(200).json({
      success: true,
      caretaker: publicCaretaker(caretaker),
      assignments: assignments.map(publicAssignment),
      citizens: citizens.map((c) => ({
        id: String(c._id),
        fullName: c.fullName,
        mobile: c.mobile,
        selectedPlan: c.selectedPlan,
        profile: c.profile,
      })),
      requests: requests.map(publicRequest),
    });
  } catch (error) {
    console.error("getMyOverview Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers/available?maxHouses=5 — legacy (old house-based plans)
exports.findAvailableCaretaker = async (req, res) => {
  try {
    const maxHouses = Number(req.query.maxHouses) || 0;
    const approved = await Caretaker.find({ status: "approved" });

    for (const caretaker of approved) {
      const assignedCount = await Citizen.countDocuments({ assignedCaretakerId: String(caretaker._id) });
      if (assignedCount < maxHouses) {
        return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
      }
    }
    return res.status(200).json({ success: true, caretaker: null });
  } catch (error) {
    console.error("findAvailableCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/caretakers/:id/approve — admin. Optional body lets admin confirm
// the work profile while approving: { serviceRole, shiftHours, experienceYears }
exports.approveCaretaker = async (req, res) => {
  try {
    const update = { status: "approved", approvedAt: new Date(), rejectionReason: "", ...readWorkProfile(req.body || {}) };
    const caretaker = await Caretaker.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });

    await logActivity({
      type: "caretaker.approved",
      message: `${caretaker.fullName} approved as ${SERVICE_ROLE_LABELS[caretaker.serviceRole]} (${caretaker.shiftHours} hr shift)`,
      actorRole: "admin",
      actorId: req.user?.id,
      caretaker: caretaker._id,
    });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("approveCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/caretakers/:id/reject — admin  { reason? }
exports.rejectCaretaker = async (req, res) => {
  try {
    const caretaker = await Caretaker.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", rejectionReason: req.body?.reason || "" },
      { new: true }
    );
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });

    await logActivity({
      type: "caretaker.rejected",
      message: `${caretaker.fullName} application rejected${req.body?.reason ? ` — ${req.body.reason}` : ""}`,
      actorRole: "admin",
      actorId: req.user?.id,
      caretaker: caretaker._id,
    });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("rejectCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/caretakers/:id — admin edits work profile
// body: { serviceRole?, shiftHours?, experienceYears?, isActive? }
exports.updateCaretaker = async (req, res) => {
  try {
    const update = readWorkProfile(req.body || {});
    if (typeof req.body?.isActive === "boolean") update.isActive = req.body.isActive;
    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }
    const caretaker = await Caretaker.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });

    await logActivity({
      type: "caretaker.updated",
      message: `${caretaker.fullName} profile updated — ${SERVICE_ROLE_LABELS[caretaker.serviceRole]}, ${caretaker.experienceYears} yrs exp, ${caretaker.shiftHours} hr shift${caretaker.isActive ? "" : ", PAUSED"}`,
      actorRole: "admin",
      actorId: req.user.id,
      caretaker: caretaker._id,
    });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("updateCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// POST /api/caretakers/login — User ID/mobile + password (public)
exports.loginWithCredentials = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "User ID/mobile and password are required." });
    }

    const value = String(identifier).trim();
    let caretaker = await Caretaker.findOne({ userId: value, status: "approved" });
    if (!caretaker && /^\d{10}$/.test(value)) {
      caretaker = await Caretaker.findOne({ mobile: value, status: "approved" });
    }

    if (!caretaker || !caretaker.password) {
      return res.status(404).json({ success: false, message: "No approved account found for that User ID." });
    }

    const isMatch = await bcrypt.compare(password, caretaker.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password." });
    }

    const token = generateJwt(caretaker, "caretaker");
    return res.status(200).json({ success: true, token, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("loginWithCredentials Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
