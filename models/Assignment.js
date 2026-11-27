const mongoose = require("mongoose");

// Which caretaker serves which citizen, for which daily time slot and dates.
// One booking can have several assignments (shift-wise caretakers) and one
// caretaker can have several assignments on the same day in different slots
// (e.g. Citizen A 08–10, B 10–14, C 14–18) up to their shift capacity.
const assignmentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    citizen: { type: mongoose.Schema.Types.ObjectId, ref: "Citizen", required: true, index: true },
    caretaker: { type: mongoose.Schema.Types.ObjectId, ref: "Caretaker", required: true, index: true },

    slotStart: { type: String, required: true }, // "HH:MM"
    slotEnd: { type: String, required: true },
    hours: { type: Number, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    status: { type: String, enum: ["active", "completed", "cancelled"], default: "active", index: true },
    assignedBy: { type: String, default: "admin" },
    endedAt: { type: Date, default: null },
    endReason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);
