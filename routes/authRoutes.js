const express = require("express");
const router = express.Router();

const { sendLoginOtp, verifyLoginOtp, checkMobile, loginAdmin } = require("../controllers/authController");

// ── OTP auth — shared by Citizen and Caretaker logins/registration ──
router.post("/send-otp", sendLoginOtp);
router.post("/verify-otp", verifyLoginOtp);
router.post("/check-mobile", checkMobile);

// ── Admin — username/mobile + password only (no OTP, no self-registration) ──
router.post("/admin-login", loginAdmin);

module.exports = router;
