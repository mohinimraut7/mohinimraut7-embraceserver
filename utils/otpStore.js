// ── Simple in-memory OTP store (same pattern as the reference street-vendor
//    backend's otpStore.js) — fine for a single-instance deployment; swap for
//    Redis if this ever runs across multiple server instances. ──
const otpMap = new Map();

const OTP_EXPIRY_MS = (Number(process.env.OTP_EXPIRY_MINUTES) || 5) * 60 * 1000;

exports.setOtp = (key, otp) => {
  otpMap.set(key, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, attempts: 0 });
};

exports.verifyOtp = (key, otp) => {
  const record = otpMap.get(key);
  if (!record) return { valid: false, reason: "OTP not found. Please resend it." };

  if (Date.now() > record.expiresAt) {
    otpMap.delete(key);
    return { valid: false, reason: "OTP expired. Please resend it." };
  }

  record.attempts += 1;
  if (record.attempts > 5) {
    otpMap.delete(key);
    return { valid: false, reason: "Too many incorrect attempts. Please resend the OTP." };
  }

  if (String(record.otp) !== String(otp)) {
    return { valid: false, reason: "Invalid OTP." };
  }

  otpMap.delete(key);
  return { valid: true };
};

exports.peekOtp = (key) => {
  const record = otpMap.get(key);
  return record && Date.now() <= record.expiresAt ? record.otp : null;
};
