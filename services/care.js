// Shared business logic: serializers, activity log, coverage + availability.
const Citizen = require("../models/Citizen");
const Caretaker = require("../models/Caretaker");
const Booking = require("../models/Booking");
const Assignment = require("../models/Assignment");
const ActivityLog = require("../models/ActivityLog");
const { SERVICE_ROLE_LABELS } = require("../config/plans");
const { slotsOverlap, datesOverlap, startOfDay, toMinutes, toHHMM } = require("../utils/slots");

// ── Serializers ──────────────────────────────────────────────

// true when a ref path was populated (Citizen/Caretaker docs always have mobile)
const isDoc = (v) => !!v && typeof v === "object" && v.mobile !== undefined;

function publicCitizen(c) {
  if (!c) return null;
  return {
    id: String(c._id),
    fullName: c.fullName,
    mobile: c.mobile,
    email: c.email,
    selectedPlan: c.selectedPlan,
    assignedCaretakerId: c.assignedCaretakerId,
    status: c.status,
    profile: c.profile,
    createdAt: c.createdAt,
  };
}

function publicCaretaker(c) {
  if (!c) return null;
  return {
    id: String(c._id),
    fullName: c.fullName,
    mobile: c.mobile,
    email: c.email,
    status: c.status,
    userId: c.userId,
    assignedCitizenId: c.assignedCitizenId,
    serviceRole: c.serviceRole,
    serviceRoleLabel: SERVICE_ROLE_LABELS[c.serviceRole] || "Caretaker",
    experienceYears: c.experienceYears,
    shiftHours: c.shiftHours,
    isActive: c.isActive,
    approvedAt: c.approvedAt,
    rejectionReason: c.rejectionReason,
    profile: c.profile,
    createdAt: c.createdAt,
  };
}

// Small card used inside other objects (no full profile)
function caretakerCard(c) {
  if (!c) return null;
  return {
    id: String(c._id),
    fullName: c.fullName,
    mobile: c.mobile,
    serviceRole: c.serviceRole,
    serviceRoleLabel: SERVICE_ROLE_LABELS[c.serviceRole] || "Caretaker",
    experienceYears: c.experienceYears,
    shiftHours: c.shiftHours,
  };
}

function citizenCard(c) {
  if (!c) return null;
  return {
    id: String(c._id),
    fullName: c.fullName,
    mobile: c.mobile,
    age: c.profile?.age ?? null,
    address: c.profile?.fullAddress || "",
    chronicIllnesses: c.profile?.chronicIllnesses || [],
  };
}

function publicAssignment(a) {
  const ct = isDoc(a.caretaker) ? a.caretaker : null;
  const cz = isDoc(a.citizen) ? a.citizen : null;
  return {
    id: String(a._id),
    bookingId: String(a.booking?._id || a.booking),
    citizenId: String(cz ? cz._id : a.citizen),
    caretakerId: String(ct ? ct._id : a.caretaker),
    caretaker: ct ? caretakerCard(ct) : undefined,
    citizen: cz ? citizenCard(cz) : undefined,
    slotStart: a.slotStart,
    slotEnd: a.slotEnd,
    hours: a.hours,
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.status,
    endedAt: a.endedAt,
    endReason: a.endReason,
    notes: a.notes,
    createdAt: a.createdAt,
  };
}

// Covered hours = sum of active assignment hours for that booking
function coverageFor(booking, activeAssignments) {
  const mine = activeAssignments.filter((a) => String(a.booking?._id || a.booking) === String(booking._id));
  const coveredHours = Math.min(
    booking.hoursPerDay,
    mine.reduce((sum, a) => sum + a.hours, 0)
  );
  const remainingHours = Math.max(0, booking.hoursPerDay - coveredHours);

  // Suggest the next slot start: walk from preferred start through covered slots
  let next = toMinutes(booking.preferredStartTime) ?? 480;
  let guard = 0;
  while (guard++ < 24) {
    const hhmm = toHHMM(next);
    const hit = mine.find((a) => a.slotStart === hhmm);
    if (!hit) break;
    next += hit.hours * 60;
  }

  return { coveredHours, remainingHours, nextSlotStart: toHHMM(next), assignmentCount: mine.length };
}

function publicBooking(b, activeAssignments = []) {
  const cz = isDoc(b.citizen) ? b.citizen : null;
  return {
    id: String(b._id),
    citizenId: String(cz ? cz._id : b.citizen),
    citizen: cz ? citizenCard(cz) : undefined,
    planId: b.planId,
    planName: b.planName,
    hoursPerDay: b.hoursPerDay,
    durationDays: b.durationDays,
    pricePerDay: b.pricePerDay,
    totalPrice: b.totalPrice,
    startDate: b.startDate,
    endDate: b.endDate,
    preferredStartTime: b.preferredStartTime,
    serviceRole: b.serviceRole,
    serviceRoleLabel: SERVICE_ROLE_LABELS[b.serviceRole] || "Caretaker",
    notes: b.notes,
    status: b.status,
    paymentStatus: b.paymentStatus,
    createdAt: b.createdAt,
    coverage: coverageFor(b, activeAssignments),
  };
}

function publicRequest(r) {
  const ct = isDoc(r.caretaker) ? r.caretaker : null;
  const cz = isDoc(r.citizen) ? r.citizen : null;
  return {
    id: String(r._id),
    citizenId: String(cz ? cz._id : r.citizen),
    caretakerId: r.caretaker ? String(ct ? ct._id : r.caretaker) : null,
    citizen: cz ? citizenCard(cz) : undefined,
    caretaker: ct ? caretakerCard(ct) : undefined,
    category: r.category,
    note: r.note,
    targetRole: r.targetRole,
    status: r.status,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function publicActivity(l) {
  return {
    id: String(l._id),
    type: l.type,
    message: l.message,
    actorRole: l.actorRole,
    citizenId: l.citizen ? String(l.citizen) : null,
    caretakerId: l.caretaker ? String(l.caretaker) : null,
    meta: l.meta,
    createdAt: l.createdAt,
  };
}

// ── Activity log ─────────────────────────────────────────────

async function logActivity({ type, message, actorRole = "system", actorId = null, citizen = null, caretaker = null, meta = {} }) {
  try {
    await ActivityLog.create({ type, message, actorRole, actorId, citizen, caretaker, meta });
  } catch (err) {
    console.error("logActivity Error:", err.message); // never block the main action
  }
}

// ── Housekeeping: close assignments/bookings whose dates are over ──

async function refreshExpired() {
  const today = startOfDay(new Date());
  const expiredAssignments = await Assignment.find({ status: "active", endDate: { $lt: today } });
  for (const a of expiredAssignments) {
    a.status = "completed";
    a.endedAt = new Date();
    a.endReason = a.endReason || "Plan period ended";
    await a.save();
    await logActivity({
      type: "assignment.completed",
      message: `Duty completed (plan period ended) — slot ${a.slotStart}–${a.slotEnd}`,
      citizen: a.citizen,
      caretaker: a.caretaker,
      meta: { assignmentId: String(a._id) },
    });
  }
  await Booking.updateMany(
    { status: { $in: ["active", "pending_assignment"] }, endDate: { $lt: today } },
    { $set: { status: "completed" } }
  );
}

// Keep Citizen.assignedCaretakerId pointing at an active caretaker (legacy field)
async function syncPrimaryCaretaker(citizenId) {
  const first = await Assignment.findOne({ citizen: citizenId, status: "active" }).sort({ slotStart: 1 });
  await Citizen.updateOne({ _id: citizenId }, { assignedCaretakerId: first ? String(first.caretaker) : null });
}

// ── Availability ─────────────────────────────────────────────
// For a requested slot (start + hours) over a date range, tell admin which
// caretakers are free. Rules:
//   • approved + active
//   • role fits (nurse need → nurse or caretaker+nurse, etc.)
//   • no overlapping active slot on overlapping dates
//   • total booked hours on those dates + requested hours ≤ caretaker shiftHours
function roleFits(required, caretakerRole) {
  if (!required) return true;
  if (required === "caretaker") return ["caretaker", "caretaker_nurse"].includes(caretakerRole);
  if (required === "nurse") return ["nurse", "caretaker_nurse"].includes(caretakerRole);
  if (required === "caretaker_nurse") return caretakerRole === "caretaker_nurse";
  return true;
}

async function caretakerAvailability({ slotStart, hours, startDate, endDate, serviceRole, excludeAssignmentId = null }) {
  const caretakers = await Caretaker.find({ status: "approved" }).sort({ experienceYears: -1, createdAt: 1 });
  const active = await Assignment.find({ status: "active" }).populate("citizen", "fullName mobile profile");

  return caretakers.map((ct) => {
    const theirs = active.filter(
      (a) =>
        String(a.caretaker) === String(ct._id) &&
        String(a._id) !== String(excludeAssignmentId) &&
        datesOverlap(a.startDate, a.endDate, startDate, endDate)
    );
    const bookedHours = theirs.reduce((s, a) => s + a.hours, 0);
    const capacityHours = ct.shiftHours || 8;
    const freeHours = Math.max(0, capacityHours - bookedHours);
    const clashes = theirs.filter((a) => slotsOverlap(a.slotStart, a.hours, slotStart, hours));
    const roleMatch = roleFits(serviceRole, ct.serviceRole);

    const reasons = [];
    if (!ct.isActive) reasons.push("Paused by admin");
    if (!roleMatch) reasons.push(`Role is ${SERVICE_ROLE_LABELS[ct.serviceRole]}`);
    if (clashes.length) reasons.push(`Busy ${clashes.map((a) => `${a.slotStart}–${a.slotEnd}`).join(", ")}`);
    if (Number(hours) > freeHours) reasons.push(`Only ${freeHours} hr free (shift ${capacityHours} hr)`);

    return {
      caretaker: caretakerCard(ct),
      capacityHours,
      bookedHours,
      freeHours,
      roleMatch,
      available: reasons.length === 0,
      reasons,
      currentDuties: theirs.map((a) => ({
        id: String(a._id),
        slotStart: a.slotStart,
        slotEnd: a.slotEnd,
        hours: a.hours,
        citizenName: a.citizen?.fullName || "",
      })),
    };
  }).sort((a, b) => Number(b.available) - Number(a.available) || b.freeHours - a.freeHours);
}

module.exports = {
  publicCitizen,
  publicCaretaker,
  caretakerCard,
  citizenCard,
  publicAssignment,
  publicBooking,
  publicRequest,
  publicActivity,
  coverageFor,
  logActivity,
  refreshExpired,
  syncPrimaryCaretaker,
  caretakerAvailability,
  roleFits,
};
