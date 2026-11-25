const bcrypt = require("bcryptjs");
const Caretaker = require("../models/Caretaker");
const Citizen = require("../models/Citizen");
const generateJwt = require("../utils/generateJwt");

function publicCaretaker(caretaker) {
  return {
    id: caretaker._id,
    fullName: caretaker.fullName,
    mobile: caretaker.mobile,
    email: caretaker.email,
    status: caretaker.status,
    userId: caretaker.userId,
    assignedCitizenId: caretaker.assignedCitizenId,
    profile: caretaker.profile,
    createdAt: caretaker.createdAt,
  };
}

// POST /api/caretakers  — apply (mirrors frontend createCaretaker(data))
// body: { mobile, fullName, email, userId, password, ...caretakerRegistrationConfig.js fields }
exports.createCaretaker = async (req, res) => {
  try {
    const { mobile, fullName, email, userId, password, ...profileFields } = req.body;

    if (!mobile || !/^\d{10}$/.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
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

    const caretaker = await Caretaker.create({
      mobile: trimmedMobile,
      fullName: fullName || profileFields.fullName || "",
      email: email || profileFields.email || "",
      userId: chosenUserId,
      password: hashedPassword,
      status: "pending",
      profile: { mobile: trimmedMobile, fullName, email, userId: chosenUserId, ...profileFields },
    });

    return res.status(201).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("createCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers?status=pending|approved|rejected
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

// GET /api/caretakers/:id
exports.getCaretakerById = async (req, res) => {
  try {
    const caretaker = await Caretaker.findById(req.params.id);
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("getCaretakerById Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/caretakers/available?maxHouses=5 — mirrors findAvailableCaretaker
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

// PATCH /api/caretakers/:id/approve — mirrors approveCaretaker(id)
exports.approveCaretaker = async (req, res) => {
  try {
    const caretaker = await Caretaker.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("approveCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/caretakers/:id/reject — mirrors rejectCaretaker(id)
exports.rejectCaretaker = async (req, res) => {
  try {
    const caretaker = await Caretaker.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!caretaker) return res.status(404).json({ success: false, message: "Caretaker not found." });
    return res.status(200).json({ success: true, caretaker: publicCaretaker(caretaker) });
  } catch (error) {
    console.error("rejectCaretaker Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// POST /api/caretakers/login — username/mobile + password (the "Already
// Approved" tab's credentials login — mirrors verifyCaretakerLogin)
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
