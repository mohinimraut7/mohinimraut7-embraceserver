const mongoose = require("mongoose");

// A care booking = one package purchase by a citizen (e.g. 8 hrs/day for 10
// days starting 01 Dec at 08:00). When it ends the citizen raises a new
// booking from the app ("request more time") and admin assigns again.
const bookingSchema = new mongoose.Schema(
  {
    citizen: { type: mongoose.Schema.Types.ObjectId, ref: "Citizen", required: true, index: true },

    planId: { type: String, required: true },
    planName: { type: String, required: true },
    hoursPerDay: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    pricePerDay: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }, // inclusive last day
    preferredStartTime: { type: String, required: true }, // "HH:MM"
    serviceRole: {
      type: String,
      enum: ["caretaker", "nurse", "caretaker_nurse"],
      default: "caretaker",
    },
    notes: { type: String, default: "" },

    // pending_assignment → active (admin assigned ≥1 caretaker) → completed
    status: {
      type: String,
      enum: ["pending_assignment", "active", "completed", "cancelled"],
      default: "pending_assignment",
      index: true,
    },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "paid" }, // payment is simulated for now
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
