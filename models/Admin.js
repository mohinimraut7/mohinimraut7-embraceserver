const mongoose = require("mongoose");

// Admin accounts are provisioned (seeded from .env on first server start),
// not self-registered — there is no public "sign up as admin" flow.
const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    mobile: { type: String, trim: true, default: "" },
    password: { type: String, required: true }, // bcrypt hash
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
