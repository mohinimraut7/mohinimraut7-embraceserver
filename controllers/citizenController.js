const Citizen = require("../models/Citizen");
const Booking = require("../models/Booking");
const Assignment = require("../models/Assignment");
const ServiceRequest = require("../models/ServiceRequest");
const ActivityLog = require("../models/ActivityLog");
const generateJwt = require("../utils/generateJwt");
const {
  publicCitizen,
  publicBooking,
  publicAssignment,
  publicRequest,
  publicActivity,
  logActivity,
  refreshExpired,
} = require("../services/care");

// Mandatory citizen fields (mirrors the * fields in registrationConfig.js)
const REQUIRED_FIELDS = {
  fullName: "Full Name",
  age: "Age",
  dob: "Date of Birth",
  gender: "Gender",
  fullAddress: "Full Address",
  cityPincode: "City & Pincode",
  emergencyContactName: "Emergency Contact Name",
  emergencyContactNumber: "Emergency Contact Number",
};

function isEmpty(v) {
  return v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
}

// POST /api/citizens  — register (public; mobile already OTP-verified on the frontend)
exports.createCitizen = async (req, res) => {
  try {
    const { mobile, fullName, email, ...profileFields } = req.body;

    if (!mobile || !/^\d{10}$/.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
    }

    const trimmedMobile = String(mobile).trim();
    const existing = await Citizen.findOne({ mobile: trimmedMobile });
    if (existing) {
      // Already registered — treat like a successful "login" so a re-submit
      // (e.g. refresh mid-flow) doesn't break the UI.
      const token = generateJwt(existing, "citizen");
      return res.status(200).json({ success: true, token, citizen: publicCitizen(existing) });
    }

    const all = { fullName, ...profileFields };
    const missing = Object.entries(REQUIRED_FIELDS).filter(([k]) => isEmpty(all[k])).map(([, l]) => l);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Please fill: ${missing.join(", ")}` });
    }
    if (profileFields.emergencyContactNumber && !/^\d{10}$/.test(String(profileFields.emergencyContactNumber))) {
      return res.status(400).json({ success: false, message: "Emergency contact number must be 10 digits." });
    }

    const citizen = await Citizen.create({
      mobile: trimmedMobile,
      fullName: fullName || "",
      email: email || "",
      profile: { mobile: trimmedMobile, fullName, email, ...profileFields },
    });

    await logActivity({
      type: "citizen.registered",
      message: `New citizen registered — ${citizen.fullName}${profileFields.age ? ` (${profileFields.age} yrs)` : ""}`,
      actorRole: "citizen",
      actorId: String(citizen._id),
      citizen: citizen._id,
    });

    const token = generateJwt(citizen, "citizen");
    return res.status(201).json({ success: true, token, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("createCitizen Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// Everything about one citizen: current booking + caretakers on duty + history
async function citizenOverview(citizenId) {
  await refreshExpired();
  const citizen = await Citizen.findById(citizenId);
  if (!citizen) return null;
  const [bookings, assignments, requests, activity] = await Promise.all([
    Booking.find({ citizen: citizen._id }).sort({ startDate: -1 }),
    Assignment.find({ citizen: citizen._id }).populate("caretaker").sort({ createdAt: -1 }),
    ServiceRequest.find({ citizen: citizen._id }).populate("caretaker").sort({ createdAt: -1 }),
    ActivityLog.find({ citizen: citizen._id }).sort({ createdAt: -1 }).limit(200),
  ]);
  const active = assignments.filter((a) => a.status === "active");
  const pub = bookings.map((b) => publicBooking(b, active));
  const currentBooking =
    pub.find((b) => b.status === "active") || pub.find((b) => b.status === "pending_assignment") || null;
  return {
    citizen: publicCitizen(citizen),
    currentBooking,
    bookings: pub,
    activeAssignments: active.map(publicAssignment),
    assignments: assignments.map(publicAssignment),
    requests: requests.map(publicRequest),
    activity: activity.map(publicActivity),
  };
}

// GET /api/citizens/me/overview — logged-in citizen
exports.getMyOverview = async (req, res) => {
  try {
    const data = await citizenOverview(req.user.id);
    if (!data) return res.status(404).json({ success: false, message: "Citizen not found." });
    delete data.activity; // internal log is for admin
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    console.error("getMyOverview Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens/:id — admin (full overview) or the citizen themself
exports.getCitizenById = async (req, res) => {
  try {
    if (req.user.role !== "admin" && String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const data = await citizenOverview(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    console.error("getCitizenById Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens/by-mobile/:mobile — admin
exports.getCitizenByMobile = async (req, res) => {
  try {
    const citizen = await Citizen.findOne({ mobile: req.params.mobile });
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("getCitizenByMobile Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens — admin
exports.getAllCitizens = async (req, res) => {
  try {
    const citizens = await Citizen.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, citizens: citizens.map(publicCitizen) });
  } catch (error) {
    console.error("getAllCitizens Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/citizens/:id — admin or self. Only profile/contact fields can
// change here; plan & caretaker go through bookings/assignments.
exports.updateCitizen = async (req, res) => {
  try {
    if (req.user.role !== "admin" && String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    const citizen = await Citizen.findById(req.params.id);
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });

    const { fullName, email, profile } = req.body;
    if (fullName !== undefined) citizen.fullName = fullName;
    if (email !== undefined) citizen.email = email;
    if (profile && typeof profile === "object") {
      citizen.profile = { ...(citizen.profile || {}), ...profile, mobile: citizen.mobile };
      citizen.markModified("profile");
    }
    if (req.user.role === "admin" && ["active", "inactive"].includes(req.body.status)) {
      citizen.status = req.body.status;
    }
    await citizen.save();
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("updateCitizen Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
