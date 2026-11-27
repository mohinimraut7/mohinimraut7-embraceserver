// ══════════════════════════════════════════════
//  Care packages — hour based (per day).
//  Citizen picks one package + how many days + preferred start time.
//  Admin then assigns one or more caretakers from the available list so the
//  daily hours are covered (e.g. 24 hrs = 3 caretakers x 8 hrs).
//
//  Prices are PLACEHOLDERS (₹ per day) — change them here only; the frontend
//  reads this list from GET /api/plans.
// ══════════════════════════════════════════════
const PLANS = [
  {
    id: "care_4",
    name: "4 Hours Care",
    hoursPerDay: 4,
    pricePerDay: 600,
    tagline: "Half-day help for daily chores, medicines and errands.",
    features: ["4 hrs caretaker support daily", "Medicine & grocery help", "Chat with caretaker"],
  },
  {
    id: "care_8",
    name: "8 Hours Care",
    hoursPerDay: 8,
    pricePerDay: 1100,
    highlighted: true,
    tagline: "A full working-day shift with one dedicated caretaker.",
    features: ["8 hrs caretaker support daily", "Medicine, grocery & transport help", "Daily activity updates"],
  },
  {
    id: "care_12",
    name: "12 Hours Care",
    hoursPerDay: 12,
    pricePerDay: 1600,
    tagline: "Day + evening cover, can be split between caretakers.",
    features: ["12 hrs support daily", "1–2 caretakers in shifts", "Priority request handling"],
  },
  {
    id: "care_24",
    name: "24 Hours Care",
    hoursPerDay: 24,
    pricePerDay: 3000,
    tagline: "Round-the-clock care with caretakers in shifts.",
    features: ["24 hrs support daily", "Shift-wise caretakers (e.g. 3 x 8 hrs)", "Nurse available on request"],
  },
];

const DURATION_OPTIONS = [7, 10, 15, 30];

// What kind of help the citizen needs / what the caretaker can do
const SERVICE_ROLES = ["caretaker", "nurse", "caretaker_nurse"];
const SERVICE_ROLE_LABELS = {
  caretaker: "Caretaker",
  nurse: "Nurse",
  caretaker_nurse: "Caretaker + Nurse",
};

// Shift capacity a caretaker can do per day
const SHIFT_HOURS = [4, 8, 12, 24];

module.exports = { PLANS, DURATION_OPTIONS, SERVICE_ROLES, SERVICE_ROLE_LABELS, SHIFT_HOURS };
