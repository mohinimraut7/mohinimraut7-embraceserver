const Citizen = require("../models/Citizen");
const generateJwt = require("../utils/generateJwt");

function publicCitizen(citizen) {
  return {
    id: citizen._id,
    fullName: citizen.fullName,
    mobile: citizen.mobile,
    email: citizen.email,
    selectedPlan: citizen.selectedPlan,
    assignedCaretakerId: citizen.assignedCaretakerId,
    status: citizen.status,
    profile: citizen.profile,
    createdAt: citizen.createdAt,
  };
}

// POST /api/citizens  — register (mirrors frontend createCitizen(data))
// body: { mobile, fullName, email, ...all other registrationConfig.js fields }
exports.createCitizen = async (req, res) => {
  try {
    const { mobile, fullName, email, ...profileFields } = req.body;

    if (!mobile || !/^\d{10}$/.test(String(mobile).trim())) {
      return res.status(400).json({ success: false, message: "Valid 10 digit mobile number required." });
    }

    const trimmedMobile = String(mobile).trim();
    const existing = await Citizen.findOne({ mobile: trimmedMobile });
    if (existing) {
      // Already registered — treat like a successful "login" so a re-submit
      // (e.g. refresh mid-flow) doesn't break the UI.
      const token = generateJwt(existing, "citizen");
      return res.status(200).json({ success: true, token, citizen: publicCitizen(existing) });
    }

    const citizen = await Citizen.create({
      mobile: trimmedMobile,
      fullName: fullName || profileFields.fullName || "",
      email: email || profileFields.email || "",
      profile: { mobile: trimmedMobile, fullName, email, ...profileFields },
    });

    const token = generateJwt(citizen, "citizen");
    return res.status(201).json({ success: true, token, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("createCitizen Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens/:id
exports.getCitizenById = async (req, res) => {
  try {
    const citizen = await Citizen.findById(req.params.id);
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("getCitizenById Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens/by-mobile/:mobile
exports.getCitizenByMobile = async (req, res) => {
  try {
    const citizen = await Citizen.findOne({ mobile: req.params.mobile });
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("getCitizenByMobile Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// GET /api/citizens
exports.getAllCitizens = async (req, res) => {
  try {
    const citizens = await Citizen.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, citizens: citizens.map(publicCitizen) });
  } catch (error) {
    console.error("getAllCitizens Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/citizens/:id  — generic update (mirrors frontend updateCitizen)
exports.updateCitizen = async (req, res) => {
  try {
    const citizen = await Citizen.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("updateCitizen Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/citizens/:id/plan  — mirrors frontend setCitizenPlan(id, planName)
// body: { id, name, maxHouses, price }
exports.setCitizenPlan = async (req, res) => {
  try {
    const citizen = await Citizen.findByIdAndUpdate(
      req.params.id,
      { selectedPlan: req.body },
      { new: true, runValidators: true }
    );
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("setCitizenPlan Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// PATCH /api/citizens/:id/assign-caretaker  — mirrors assignCaretakerToCitizen
// body: { caretakerId }
exports.assignCaretakerToCitizen = async (req, res) => {
  try {
    const citizen = await Citizen.findByIdAndUpdate(
      req.params.id,
      { assignedCaretakerId: req.body.caretakerId },
      { new: true, runValidators: true }
    );
    if (!citizen) return res.status(404).json({ success: false, message: "Citizen not found." });
    return res.status(200).json({ success: true, citizen: publicCitizen(citizen) });
  } catch (error) {
    console.error("assignCaretakerToCitizen Error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
