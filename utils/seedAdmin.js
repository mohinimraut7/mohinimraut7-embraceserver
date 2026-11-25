const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

// Creates the first/default admin account from .env the first time the
// server runs against an empty Admin collection — there is no public admin
// registration page (admin accounts are provisioned, not self-registered).
// Safe to call on every boot: it's a no-op once an admin already exists.
async function seedAdmin() {
  try {
    const existing = await Admin.countDocuments();
    if (existing > 0) return;

    const username = process.env.ADMIN_USERNAME || "admin";
    const mobile = process.env.ADMIN_MOBILE || "";
    const rawPassword = process.env.ADMIN_PASSWORD || "admin@123";

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    await Admin.create({ username, mobile, password: hashedPassword });
    console.log(`👤 Default admin account created — username: "${username}". Change ADMIN_PASSWORD in .env for production.`);
  } catch (error) {
    console.error("seedAdmin Error:", error.message);
  }
}

module.exports = seedAdmin;
