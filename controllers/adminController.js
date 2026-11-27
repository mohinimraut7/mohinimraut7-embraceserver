const Citizen = require("../models/Citizen");
const Caretaker = require("../models/Caretaker");
const Booking = require("../models/Booking");
const Assignment = require("../models/Assignment");
const ServiceRequest = require("../models/ServiceRequest");
const ActivityLog = require("../models/ActivityLog");
const {
  publicCitizen,
  publicCaretaker,
  publicBooking,
  publicAssignment,
  publicRequest,
  publicActivity,
  refreshExpired,
} = require("../services/care");

// GET /api/admin/data — everything the admin panel needs in one call
exports.getAdminData = async (req, res) => {
  try {
    await refreshExpired();
    const [citizens, caretakers, bookings, assignments, requests, activity] = await Promise.all([
      Citizen.find().sort({ createdAt: -1 }),
      Caretaker.find().sort({ createdAt: -1 }),
      Booking.find().populate("citizen").sort({ createdAt: -1 }),
      Assignment.find().populate("caretaker").populate("citizen").sort({ createdAt: -1 }),
      ServiceRequest.find().populate("caretaker").populate("citizen").sort({ createdAt: -1 }),
      ActivityLog.find().sort({ createdAt: -1 }).limit(Number(req.query.activityLimit) || 300),
    ]);
    const active = assignments.filter((a) => a.status === "active");
    return res.status(200).json({
      success: true,
      citizens: citizens.map(publicCitizen),
      caretakers: caretakers.map(publicCaretaker),
      bookings: bookings.map((b) => publicBooking(b, active)),
      assignments: assignments.map(publicAssignment),
      requests: requests.map(publicRequest),
      activity: activity.map(publicActivity),
    });
  } catch (error) {
    console.error("getAdminData Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/activity?citizenId=&caretakerId=&limit= — admin history filter
exports.getActivity = async (req, res) => {
  try {
    const filter = {};
    if (req.query.citizenId) filter.citizen = req.query.citizenId;
    if (req.query.caretakerId) filter.caretaker = req.query.caretakerId;
    const list = await ActivityLog.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 200, 1000));
    return res.status(200).json({ success: true, activity: list.map(publicActivity) });
  } catch (error) {
    console.error("getActivity Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
