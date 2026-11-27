const Booking = require("../models/Booking");
const Citizen = require("../models/Citizen");
const Assignment = require("../models/Assignment");
const { PLANS, DURATION_OPTIONS, SERVICE_ROLES, SERVICE_ROLE_LABELS, SHIFT_HOURS } = require("../config/plans");
const { toMinutes, startOfDay, addDays, datesOverlap } = require("../utils/slots");
const { publicBooking, publicAssignment, logActivity, refreshExpired, syncPrimaryCaretaker } = require("../services/care");

// GET /api/plans — public
exports.getPlans = (req, res) => {
  res.status(200).json({
    success: true,
    plans: PLANS,
    durationOptions: DURATION_OPTIONS,
    serviceRoles: SERVICE_ROLES.map((id) => ({ id, label: SERVICE_ROLE_LABELS[id] })),
    shiftHours: SHIFT_HOURS,
  });
};

// POST /api/bookings — citizen buys a package (or admin on behalf of a citizen)
// body: { planId, durationDays, startDate, preferredStartTime, serviceRole, notes, citizenId (admin only) }
exports.createBooking = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const citizenId = isAdmin ? req.body.citizenId : req.user.id;
    const { planId, durationDays, startDate, preferredStartTime, serviceRole = "caretaker", notes = "" } = req.body;

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return res.status(400).json({ success: false, message: "Please choose a valid care package." });

    const days = Number(durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({ success: false, message: "Number of days must be between 1 and 365." });
    }
    if (toMinutes(preferredStartTime) === null) {
      return res.status(400).json({ success: false, message: "Preferred start time is required (HH:MM)." });
    }
    if (!SERVICE_ROLES.includes(serviceRole)) {
      return res.status(400).json({ success: false, message: "Invalid service type." });
    }
    const start = startOfDay(startDate ? new Date(startDate) : new Date());
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid start date." });
    }
    if (start < startOfDay(new Date())) {
      return res.status(400).json({ success: false, message: "Start date cannot be in the past." });
    }
    const end = addDays(start, days - 1);

    const citizen = await Citizen.findById(citizenId);
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });

    await refreshExpired();
    const open = await Booking.find({ citizen: citizen._id, status: { $in: ["pending_assignment", "active"] } });
    const clash = open.find((b) => datesOverlap(b.startDate, b.endDate, start, end));
    if (clash) {
      return res.status(409).json({
        success: false,
        message: `You already have a ${clash.planName} booking till ${clash.endDate.toDateString()}. Choose a start date after that.`,
      });
    }

    const booking = await Booking.create({
      citizen: citizen._id,
      planId: plan.id,
      planName: plan.name,
      hoursPerDay: plan.hoursPerDay,
      durationDays: days,
      pricePerDay: plan.pricePerDay,
      totalPrice: plan.pricePerDay * days,
      startDate: start,
      endDate: end,
      preferredStartTime,
      serviceRole,
      notes,
      paymentStatus: "paid",
    });

    citizen.selectedPlan = {
      id: plan.id,
      name: plan.name,
      hoursPerDay: plan.hoursPerDay,
      durationDays: days,
      price: booking.totalPrice,
      startDate: start,
      endDate: end,
      bookingId: String(booking._id),
    };
    await citizen.save();

    await logActivity({
      type: "booking.created",
      message: `${citizen.fullName || "Citizen"} booked ${plan.name} (${SERVICE_ROLE_LABELS[serviceRole]}) for ${days} days from ${start.toDateString()}, start ${preferredStartTime} — waiting for caretaker assignment`,
      actorRole: req.user.role,
      actorId: req.user.id,
      citizen: citizen._id,
      meta: { bookingId: String(booking._id) },
    });

    return res.status(201).json({ success: true, booking: publicBooking(booking, []) });
  } catch (error) {
    console.error("createBooking Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/bookings?status=&citizenId= — admin
exports.getBookings = async (req, res) => {
  try {
    await refreshExpired();
    const filter = {};
    if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };
    if (req.query.citizenId) filter.citizen = req.query.citizenId;
    const bookings = await Booking.find(filter).populate("citizen").sort({ createdAt: -1 });
    const active = await Assignment.find({ status: "active" });
    return res.status(200).json({ success: true, bookings: bookings.map((b) => publicBooking(b, active)) });
  } catch (error) {
    console.error("getBookings Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/bookings/:id — admin
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("citizen");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    const assignments = await Assignment.find({ booking: booking._id })
      .populate("caretaker")
      .sort({ createdAt: -1 });
    const active = assignments.filter((a) => a.status === "active");
    return res.status(200).json({
      success: true,
      booking: publicBooking(booking, active),
      assignments: assignments.map(publicAssignment),
    });
  } catch (error) {
    console.error("getBookingById Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/bookings/:id/cancel — admin, or the citizen who owns it
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("citizen");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    if (req.user.role !== "admin" && String(booking.citizen._id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!["pending_assignment", "active"].includes(booking.status)) {
      return res.status(400).json({ success: false, message: "Only open bookings can be cancelled." });
    }
    booking.status = "cancelled";
    await booking.save();

    await Assignment.updateMany(
      { booking: booking._id, status: "active" },
      { $set: { status: "cancelled", endedAt: new Date(), endReason: req.body.reason || "Booking cancelled" } }
    );
    await syncPrimaryCaretaker(booking.citizen._id);

    await logActivity({
      type: "booking.cancelled",
      message: `${booking.planName} booking of ${booking.citizen.fullName || "citizen"} cancelled${req.body.reason ? ` — ${req.body.reason}` : ""}`,
      actorRole: req.user.role,
      actorId: req.user.id,
      citizen: booking.citizen._id,
      meta: { bookingId: String(booking._id) },
    });
    return res.status(200).json({ success: true, booking: publicBooking(booking, []) });
  } catch (error) {
    console.error("cancelBooking Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
