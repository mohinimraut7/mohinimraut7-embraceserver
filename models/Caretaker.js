const mongoose = require("mongoose");

// Mirrors eldercareFrontend's src/data/caretakers.js shape (fullName, mobile,
// email, status, userId, password, assignedCitizenId, profile).
const caretakerSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    mobile: { type: String, trim: true, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Caretaker chooses their own userId/password at registration time
    // (see src/data/caretakerRegistrationConfig.js — fields "userId"/"password").
    userId: { type: String, trim: true, default: null },
    password: { type: String, default: null }, // stored hashed (bcrypt)

    assignedCitizenId: { type: String, default: null }, // legacy — see Assignment model

    // ── Work profile (used by admin to match & assign) ──
    serviceRole: {
      type: String,
      enum: ["caretaker", "nurse", "caretaker_nurse"],
      default: "caretaker",
    },
    experienceYears: { type: Number, default: 0 },
    shiftHours: { type: Number, default: 8 }, // max hours/day this person can work
    isActive: { type: Boolean, default: true }, // admin can pause a caretaker
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },

    // Every field from caretakerRegistrationConfig.js — kept flexible.
    profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

caretakerSchema.index({ userId: 1 });

module.exports = mongoose.model("Caretaker", caretakerSchema);
