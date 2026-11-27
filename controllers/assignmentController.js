const Assignment = require("../models/Assignment");
const Booking = require("../models/Booking");
const Caretaker = require("../models/Caretaker");
const { slotEnd, toMinutes, startOfDay, addDays } = require("../utils/slots");
const {
  publicAssignment,
  publicBooking,
  logActivity,
  refreshExpired,
  syncPrimaryCaretaker,
  caretakerAvailability,
} = require("../services/care");

// GET /api/caretakers/availability?bookingId=&slotStart=&hours=&startDate=&endDate=&serviceRole=
// Admin: list of caretakers with free/busy status for the requested slot.
exports.getAvailability = async (req, res) => {
  try {
    await refreshExpired();
    let { slotStart, hours, startDate, endDate, serviceRole } = req.query;

    if (req.query.bookingId) {
      const booking = await Booking.findById(req.query.bookingId);
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
      const active = await Assignment.find({ booking: booking._id, status: "active" });
      const cov = publicBooking(booking, active).coverage;
      slotStart = slotStart || cov.nextSlotStart;
      hours = hours || cov.remainingHours || booking.hoursPerDay;
      const today = startOfDay(new Date());
      startDate = startDate || (booking.startDate > today ? booking.startDate : today);
      endDate = endDate || booking.endDate;
      serviceRole = serviceRole || booking.serviceRole;
    }

    if (toMinutes(slotStart) === null || !(Number(hours) > 0)) {
      return res.status(400).json({ success: false, message: "slotStart (HH:MM) and hours are required." });
    }
    const from = startOfDay(startDate || new Date());
    const to = startOfDay(endDate || from);

    const list = await caretakerAvailability({
      slotStart,
      hours: Number(hours),
      startDate: from,
      endDate: to,
      serviceRole,
      excludeAssignmentId: req.query.excludeAssignmentId,
    });
    return res.status(200).json({
      success: true,
      query: { slotStart, slotEnd: slotEnd(slotStart, hours), hours: Number(hours), startDate: from, endDate: to, serviceRole: serviceRole || null },
      caretakers: list,
    });
  } catch (error) {
    console.error("getAvailability Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/assignments?citizenId=&caretakerId=&status=&bookingId= — admin
exports.getAssignments = async (req, res) => {
  try {
    await refreshExpired();
    const filter = {};
    if (req.query.citizenId) filter.citizen = req.query.citizenId;
    if (req.query.caretakerId) filter.caretaker = req.query.caretakerId;
    if (req.query.bookingId) filter.booking = req.query.bookingId;
    if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };
    const list = await Assignment.find(filter)
      .populate("caretaker")
      .populate("citizen")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, assignments: list.map(publicAssignment) });
  } catch (error) {
    console.error("getAssignments Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// Validates + creates one assignment. Throws {status, message} on bad input.
async function createAssignmentCore({ booking, caretakerId, slotStart, hours, startDate, endDate, override, notes, excludeAssignmentId }) {
  if (!["pending_assignment", "active"].includes(booking.status)) {
    throw { status: 400, message: "This booking is not open for assignment." };
  }
  if (toMinutes(slotStart) === null) throw { status: 400, message: "Slot start time (HH:MM) is required." };
  hours = Number(hours);
  if (!(hours > 0) || hours > 24) throw { status: 400, message: "Hours must be between 1 and 24." };

  const caretaker = await Caretaker.findById(caretakerId);
  if (!caretaker || caretaker.status !== "approved") {
    throw { status: 400, message: "Caretaker not found or not approved." };
  }

  const activeForBooking = await Assignment.find({ booking: booking._id, status: "active", _id: { $ne: excludeAssignmentId } });
  const covered = activeForBooking.reduce((s, a) => s + a.hours, 0);
  if (covered + hours > booking.hoursPerDay) {
    throw {
      status: 400,
      message: `Booking needs ${booking.hoursPerDay} hrs/day; ${covered} hrs already covered, so max ${booking.hoursPerDay - covered} hrs can be assigned.`,
    };
  }
  if (activeForBooking.some((a) => String(a.caretaker) === String(caretaker._id))) {
    throw { status: 400, message: "This caretaker is already on duty for this booking. End that duty first or choose another caretaker." };
  }

  const today = startOfDay(new Date());
  const from = startOfDay(startDate || (booking.startDate > today ? booking.startDate : today));
  const to = startOfDay(endDate || booking.endDate);
  if (from < startOfDay(booking.startDate) || to > startOfDay(booking.endDate) || from > to) {
    throw { status: 400, message: "Assignment dates must be inside the booking period." };
  }

  const availability = await caretakerAvailability({
    slotStart,
    hours,
    startDate: from,
    endDate: to,
    serviceRole: booking.serviceRole,
    excludeAssignmentId,
  });
  const mine = availability.find((x) => x.caretaker.id === String(caretaker._id));
  const hardBlocks = mine.reasons.filter((r) => r.startsWith("Busy") || r.startsWith("Paused"));
  if (hardBlocks.length) throw { status: 409, message: `${caretaker.fullName}: ${hardBlocks.join("; ")}` };
  if (!mine.available && !override) {
    throw { status: 409, message: `${caretaker.fullName}: ${mine.reasons.join("; ")}. Tick "override" to assign anyway.`, canOverride: true };
  }

  const assignment = await Assignment.create({
    booking: booking._id,
    citizen: booking.citizen,
    caretaker: caretaker._id,
    slotStart,
    slotEnd: slotEnd(slotStart, hours),
    hours,
    startDate: from,
    endDate: to,
    notes: notes || "",
  });

  if (booking.status === "pending_assignment") {
    booking.status = "active";
    await booking.save();
  }
  await syncPrimaryCaretaker(booking.citizen);
  return { assignment, caretaker };
}

// POST /api/assignments — admin assigns a caretaker from the available list
// body: { bookingId, caretakerId, slotStart, hours, startDate?, endDate?, override?, notes? }
exports.createAssignment = async (req, res) => {
  try {
    await refreshExpired();
    const booking = await Booking.findById(req.body.bookingId).populate("citizen", "fullName");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    const citizenName = booking.citizen?.fullName || "citizen";
    booking.citizen = booking.citizen._id; // keep id for core

    const { assignment, caretaker } = await createAssignmentCore({ booking, ...req.body });

    await logActivity({
      type: "assignment.created",
      message: `${caretaker.fullName} assigned to ${citizenName} — ${assignment.slotStart}–${assignment.slotEnd} (${assignment.hours} hrs/day), ${assignment.startDate.toDateString()} to ${assignment.endDate.toDateString()}`,
      actorRole: "admin",
      actorId: req.user.id,
      citizen: booking.citizen,
      caretaker: caretaker._id,
      meta: { assignmentId: String(assignment._id), bookingId: String(booking._id) },
    });

    const populated = await Assignment.findById(assignment._id).populate("caretaker").populate("citizen");
    return res.status(201).json({ success: true, assignment: publicAssignment(populated) });
  } catch (error) {
    if (error && error.status) {
      return res.status(error.status).json({ success: false, message: error.message, canOverride: !!error.canOverride });
    }
    console.error("createAssignment Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/assignments/:id/end — admin ends a duty (shift over, caretaker
// unavailable, citizen asked for change…). Remaining hours then show up again
// on the booking so admin can assign someone from the available list.
exports.endAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate("caretaker").populate("citizen");
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    if (assignment.status !== "active") {
      return res.status(400).json({ success: false, message: "This duty is already closed." });
    }
    assignment.status = "completed";
    assignment.endedAt = new Date();
    assignment.endReason = req.body.reason || "Ended by admin";
    const today = startOfDay(new Date());
    if (assignment.endDate > today) assignment.endDate = today;
    await assignment.save();
    await syncPrimaryCaretaker(assignment.citizen._id);

    await logActivity({
      type: "assignment.ended",
      message: `${assignment.caretaker?.fullName} duty for ${assignment.citizen?.fullName} (${assignment.slotStart}–${assignment.slotEnd}) ended — ${assignment.endReason}`,
      actorRole: "admin",
      actorId: req.user.id,
      citizen: assignment.citizen._id,
      caretaker: assignment.caretaker?._id,
      meta: { assignmentId: String(assignment._id) },
    });
    return res.status(200).json({ success: true, assignment: publicAssignment(assignment) });
  } catch (error) {
    console.error("endAssignment Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// POST /api/assignments/:id/replace — admin swaps the caretaker for the same
// slot from tomorrow (or body.fromDate) till the end of the booking.
// body: { caretakerId, reason?, fromDate?, override? }
exports.replaceAssignment = async (req, res) => {
  try {
    const old = await Assignment.findById(req.params.id).populate("caretaker").populate("citizen");
    if (!old || old.status !== "active") {
      return res.status(400).json({ success: false, message: "Only an active duty can be replaced." });
    }
    const booking = await Booking.findById(old.booking);
    const today = startOfDay(new Date());
    let from = startOfDay(req.body.fromDate || addDays(today, 1));
    if (from < startOfDay(old.startDate)) from = startOfDay(old.startDate);
    if (from > startOfDay(booking.endDate)) {
      return res.status(400).json({ success: false, message: "Booking ends before the replacement date." });
    }

    const { assignment, caretaker } = await createAssignmentCore({
      booking,
      caretakerId: req.body.caretakerId,
      slotStart: old.slotStart,
      hours: old.hours,
      startDate: from,
      endDate: booking.endDate,
      override: req.body.override,
      notes: req.body.reason ? `Replacement: ${req.body.reason}` : "Replacement",
      excludeAssignmentId: old._id,
    });

    old.status = "completed";
    old.endedAt = new Date();
    old.endReason = req.body.reason || `Replaced by ${caretaker.fullName}`;
    old.endDate = addDays(from, -1) < old.startDate ? old.startDate : addDays(from, -1);
    await old.save();
    await syncPrimaryCaretaker(old.citizen._id);

    await logActivity({
      type: "assignment.replaced",
      message: `${old.caretaker?.fullName} replaced by ${caretaker.fullName} for ${old.citizen?.fullName} (${old.slotStart}–${old.slotEnd}) from ${from.toDateString()}${req.body.reason ? ` — ${req.body.reason}` : ""}`,
      actorRole: "admin",
      actorId: req.user.id,
      citizen: old.citizen._id,
      caretaker: caretaker._id,
      meta: { oldAssignmentId: String(old._id), assignmentId: String(assignment._id), previousCaretakerId: String(old.caretaker?._id) },
    });

    const populated = await Assignment.findById(assignment._id).populate("caretaker").populate("citizen");
    return res.status(201).json({ success: true, assignment: publicAssignment(populated), replaced: publicAssignment(old) });
  } catch (error) {
    if (error && error.status) {
      return res.status(error.status).json({ success: false, message: error.message, canOverride: !!error.canOverride });
    }
    console.error("replaceAssignment Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
