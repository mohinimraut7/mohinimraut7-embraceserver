const mongoose = require("mongoose");

// Every important event between citizens, caretakers and admin — admin's
// "Activity & History" screen reads from here.
const activityLogSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true }, // e.g. assignment.created
    message: { type: String, required: true },
    actorRole: { type: String, default: "system" }, // admin | citizen | caretaker | system
    actorId: { type: String, default: null },
    citizen: { type: mongoose.Schema.Types.ObjectId, ref: "Citizen", default: null, index: true },
    caretaker: { type: mongoose.Schema.Types.ObjectId, ref: "Caretaker", default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
