// Time-slot helpers. A slot is "HH:MM" start + N hours on a 24h clock; it can
// wrap past midnight (e.g. 22:00 + 8h = 22:00–06:00).

const DAY_MIN = 24 * 60;

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toHHMM(minutes) {
  const m = ((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function slotEnd(start, hours) {
  const s = toMinutes(start);
  if (s === null) return null;
  return toHHMM(s + Number(hours) * 60);
}

// Slot as list of [from, to) minute segments inside one day
function segments(start, hours) {
  const s = toMinutes(start);
  const len = Math.round(Number(hours) * 60);
  if (s === null || !(len > 0)) return [];
  if (len >= DAY_MIN) return [[0, DAY_MIN]];
  const e = s + len;
  return e <= DAY_MIN ? [[s, e]] : [[s, DAY_MIN], [0, e - DAY_MIN]];
}

function slotsOverlap(aStart, aHours, bStart, bHours) {
  const a = segments(aStart, aHours);
  const b = segments(bStart, bHours);
  return a.some(([a1, a2]) => b.some(([b1, b2]) => a1 < b2 && b1 < a2));
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Inclusive date-range overlap
function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

module.exports = { toMinutes, toHHMM, slotEnd, segments, slotsOverlap, startOfDay, addDays, datesOverlap };
