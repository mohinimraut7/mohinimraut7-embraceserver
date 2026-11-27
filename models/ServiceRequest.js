const mongoose = require("mongoose");

// Day-to-day requests from a citizen (milk, groceries, medicines, transport…)
// routed to the caretaker on duty, or complaints routed to admin.
const serviceRequestSchema = new mongoose.Schema(
  {
    citizen: { type: mongoose.Schema.Types.ObjectId, ref: "Citizen", required: true, index: true },
    caretaker: { type: mongoose.Schema.Types.ObjectId, ref: "Caretaker", default: null, index: true },
    category: { type: String, required: true },
    note: { type: String, default: "" },
    targetRole: { type: String, enum: ["caretaker", "admin"], default: "caretaker" },
    status: {
      type: String,
      enum: ["pending", "accepted", "in_progress", "completed"],
      default: "pending",
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
