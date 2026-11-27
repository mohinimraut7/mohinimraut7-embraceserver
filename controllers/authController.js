const bcrypt = require("bcryptjs");
const Citizen = require("../models/Citizen");
const Caretaker = require("../models/Caretaker");
const Admin = require("../models/Admin");
const generateOtp = require("../utils/generateOtp");
const sendOtp = require("../utils/sendOtp");
const { setOtp, verifyOtp: checkOtp } = require("../utils/otpStore");
const generateJwt = require("../utils/generateJwt");
const { publicCitizen, publicCaretaker } = require("../services/care");

const MOBILE_REGEX = /^\d{10}$/;

// ══════════════════════════════════════════════
//  SEND OTP — login or registration verification, for "citizen" or "caretaker"
// ══════════════════════════════════════════════
// POST /api/auth/send-otp  { mobile, role, purpose }
//   role: "citizen" | "caretaker"   purpose: "login" (default) | "registration"
exports.sendLoginOtp = async (req, res) => {
  try {
    const { mobile, role, purpose } = req.body;

    if (!mobile || !MOBILE_REGEX.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
    }
    if (!["citizen", "caretaker"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'citizen' or 'caretaker'." });
    }

    const trimmedMobile = String(mobile).trim();
    const otp = generateOtp();
    const storeKey = `${role}:${trimmedMobile}`;

    setOtp(storeKey, otp);
    await sendOtp(trimmedMobile, otp, purpose === "registration" ? "registration" : "login");

    return res.status(200).json({ success: true, message: "OTP sent successfully." });
  } catch (error) {
    console.error("sendLoginOtp Error:", error);
    return res.status(500).json({ success: false, message: "Error sending OTP." });
  }
};

// ══════════════════════════════════════════════
//  VERIFY OTP — tells the frontend whether to log the user straight in
//  (existing account) or send them to the registration flow (new account).
// ══════════════════════════════════════════════
// POST /api/auth/verify-otp  { mobile, otp, role }
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { mobile, otp, role } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ success: false, message: "Mobile number and OTP are required." });
    }
    if (!["citizen", "caretaker"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'citizen' or 'caretaker'." });
    }

    const trimmedMobile = String(mobile).trim();
    const storeKey = `${role}:${trimmedMobile}`;

    const result = checkOtp(storeKey, otp);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.reason });
    }

    if (role === "citizen") {
      const citizen = await Citizen.findOne({ mobile: trimmedMobile });

      if (!citizen) {
        // Mobile verified, but no account yet — frontend sends them to /register/citizen
        return res.status(200).json({ success: true, exists: false, mobile: trimmedMobile });
      }

      const token = generateJwt(citizen, "citizen");
      return res.status(200).json({
        success: true,
        exists: true,
        token,
        role: "citizen",
        user: publicCitizen(citizen),
      });
    }

    // role === "caretaker"
    const caretaker = await Caretaker.findOne({ mobile: trimmedMobile });

    if (!caretaker) {
      return res.status(200).json({ success: true, exists: false, mobile: trimmedMobile });
    }

    if (caretaker.status === "pending") {
      return res.status(200).json({
        success: true,
        exists: true,
        status: "pending",
        message: "Your application is still awaiting admin approval.",
      });
    }

    if (caretaker.status === "rejected") {
      return res.status(200).json({
        success: true,
        exists: true,
        status: "rejected",
        message: "Your application was not approved. Please contact support.",
      });
    }

    const token = generateJwt(caretaker, "caretaker");
    return res.status(200).json({
      success: true,
      exists: true,
      status: "approved",
      token,
      role: "caretaker",
      user: publicCaretaker(caretaker),
    });
  } catch (error) {
    console.error("verifyLoginOtp Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ══════════════════════════════════════════════
//  ADMIN LOGIN — username or mobile + password. Admin accounts are
//  provisioned (seeded from .env on first boot — see utils/seedAdmin.js),
//  not self-registered, so there's no OTP step here, just a real password
//  check (replaces the old "Sign In" button that navigated straight to
//  /admin without checking anything).
// ══════════════════════════════════════════════
// POST /api/auth/admin-login  { identifier, password }
exports.loginAdmin = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Username/mobile and password are required." });
    }

    const value = String(identifier).trim();
    const admin = await Admin.findOne({ $or: [{ username: value }, { mobile: value }] });

    if (!admin) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    const token = generateJwt(admin, "admin");
    return res.status(200).json({
      success: true,
      token,
      role: "admin",
      user: { id: admin._id, username: admin.username, mobile: admin.mobile },
    });
  } catch (error) {
    console.error("loginAdmin Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ══════════════════════════════════════════════
//  CHECK MOBILE — optional helper (mirrors the reference project's checkMobile)
// ══════════════════════════════════════════════
exports.checkMobile = async (req, res) => {
  try {
    const { mobile, role } = req.body;
    if (!mobile || !MOBILE_REGEX.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
    }

    const trimmedMobile = String(mobile).trim();
    const Model = role === "caretaker" ? Caretaker : Citizen;
    const user = await Model.findOne({ mobile: trimmedMobile });

    return res.status(200).json({ success: true, exists: !!user });
  } catch (error) {
    console.error("checkMobile Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
