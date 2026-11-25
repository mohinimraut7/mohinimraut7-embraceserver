const mongoose = require("mongoose");

// Mirrors the shape eldercareFrontend's src/data/citizens.js already builds
// (fullName, mobile, email, selectedPlan, assignedCaretakerId, status, profile),
// so the frontend's existing citizen objects map onto this 1:1.
const citizenSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    mobile: { type: String, trim: true, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: "" },

    selectedPlan: {
      id: { type: String, default: null },
      name: { type: String, default: null },
      maxHouses: { type: Number, default: null },
      price: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    assignedCaretakerId: { type: String, default: null },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Every field from the multi-section registration form
    // (src/data/registrationConfig.js) — kept schemaless/flexible since that
    // form's fields evolve independently of the backend.
    profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Citizen", citizenSchema);
