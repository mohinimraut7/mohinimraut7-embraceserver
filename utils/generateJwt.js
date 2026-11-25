const jwt = require("jsonwebtoken");

function generateJwt(user, role) {
  return jwt.sign(
    {
      id: user._id,
      mobile: user.mobile,
      role: role || user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
}

module.exports = generateJwt;
