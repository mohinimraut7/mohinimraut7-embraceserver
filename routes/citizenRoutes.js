const express = require("express");
const router = express.Router();

const {
  createCitizen,
  getCitizenById,
  getCitizenByMobile,
  getAllCitizens,
  updateCitizen,
  setCitizenPlan,
  assignCaretakerToCitizen,
} = require("../controllers/citizenController");

router.post("/", createCitizen);
router.get("/", getAllCitizens);
router.get("/by-mobile/:mobile", getCitizenByMobile);
router.get("/:id", getCitizenById);
router.patch("/:id", updateCitizen);
router.patch("/:id/plan", setCitizenPlan);
router.patch("/:id/assign-caretaker", assignCaretakerToCitizen);

module.exports = router;
