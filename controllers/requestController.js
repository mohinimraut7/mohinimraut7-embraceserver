const ServiceRequest = require("../models/ServiceRequest");
const Assignment = require("../models/Assignment");
const Citizen = require("../models/Citizen");
const { segments } = require("../utils/slots");
const { publicRequest, logActivity, refreshExpired } = require("../services/care");

const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", in_progress: "In Progress", completed: "Completed" };

// Pick the caretaker whose slot covers "now", else the first active one.
async function caretakerOnDuty(citizenId) {
  const active = await Assignment.find({ citizen: citizenId, status: "active" }).sort({ slotStart: 1 });
  if (!active.length) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const onDuty = active.find((a) => segments(a.slotStart, a.hours).some(([s, e]) => nowMin >= s && nowMin < e));
  return (onDuty || active[0]).caretaker;
}

// POST /api/requests — citizen raises milk / grocery / medicine / complaint…
// body: { category, note, targetRole: 'caretaker' | 'admin' }
exports.createRequest = async (req, res) => {
  try {
    const { category, note = "", targetRole = "caretaker" } = req.body;
    if (!category) return res.status(400).json({ success: false, message: "Category is required." });

    await refreshExpired();
    const citizen = await Citizen.findById(req.user.id);
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });

    const toAdmin = targetRole === "admin";
    const caretakerId = toAdmin ? null : await caretakerOnDuty(citizen._id);

    const request = await ServiceRequest.create({
      citizen: citizen._id,
      caretaker: caretakerId,
      category,
      note,
      targetRole: toAdmin ? "admin" : "caretaker",
    });

    await logActivity({
      type: toAdmin ? "complaint.created" : "request.created",
      message: `${citizen.fullName || "Citizen"} raised ${category} request${note ? ` — "${note.slice(0, 80)}"` : ""}${!toAdmin && !caretakerId ? " (no caretaker on duty yet)" : ""}`,
      actorRole: "citizen",
      actorId: String(citizen._id),
      citizen: citizen._id,
      caretaker: caretakerId,
      meta: { requestId: String(request._id) },
    });

    const populated = await ServiceRequest.findById(request._id).populate("caretaker").populate("citizen");
    return res.status(201).json({ success: true, request: publicRequest(populated) });
  } catch (error) {
    console.error("createRequest Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/requests — admin: all (filters), citizen: own, caretaker: own households
exports.getRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "citizen") {
      filter.citizen = req.user.id;
    } else if (req.user.role === "caretaker") {
      const mine = await Assignment.find({ caretaker: req.user.id, status: "active" }).distinct("citizen");
      filter.$or = [{ caretaker: req.user.id }, { citizen: { $in: mine }, targetRole: "caretaker", caretaker: null }];
    } else {
      if (req.query.citizenId) filter.citizen = req.query.citizenId;
      if (req.query.caretakerId) filter.caretaker = req.query.caretakerId;
    }
    if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };

    const list = await ServiceRequest.find(filter).populate("caretaker").populate("citizen").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, requests: list.map(publicRequest) });
  } catch (error) {
    console.error("getRequests Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/requests/:id/status  { status } — caretaker (own) or admin
exports.updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_LABEL[status]) return res.status(400).json({ success: false, message: "Invalid status." });

    const request = await ServiceRequest.findById(req.params.id).populate("citizen").populate("caretaker");
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });

    if (req.user.role === "caretaker") {
      const servesCitizen = await Assignment.exists({ caretaker: req.user.id, citizen: request.citizen._id });
      const ownsRequest = request.caretaker && String(request.caretaker._id) === String(req.user.id);
      if (!ownsRequest && !servesCitizen) return res.status(403).json({ success: false, message: "Access denied." });
      if (!request.caretaker) request.caretaker = req.user.id; // claimed by this caretaker
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    request.status = status;
    request.completedAt = status === "completed" ? new Date() : null;
    await request.save();
    await request.populate("caretaker");

    await logActivity({
      type: "request.status",
      message: `${request.category} request of ${request.citizen?.fullName || "citizen"} marked ${STATUS_LABEL[status]} by ${req.user.role === "admin" ? "admin" : request.caretaker?.fullName || "caretaker"}`,
      actorRole: req.user.role,
      actorId: req.user.id,
      citizen: request.citizen?._id,
      caretaker: request.caretaker?._id || null,
      meta: { requestId: String(request._id), status },
    });

    return res.status(200).json({ success: true, request: publicRequest(request) });
  } catch (error) {
    console.error("updateRequestStatus Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
