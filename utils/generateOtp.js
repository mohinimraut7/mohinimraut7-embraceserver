// 6-digit OTP generator (100000 - 999999) — the vendor/street-worker reference
// project already generated 6-digit OTPs this way; Embrace's web UI was the one
// still demoing 4 digits, which this backend fixes end-to-end.
const OTP_LENGTH = Number(process.env.OTP_LENGTH) || 6;

function generateOtp() {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

module.exports = generateOtp;
