const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middlewares/auth");

const {
  createCitizen,
  getCitizenById,
  getCitizenByMobile,
  getAllCitizens,
  updateCitizen,
  getMyOverview,
} = require("../controllers/citizenController");

router.post("/", createCitizen); // registration (public)
router.get("/me/overview", protect, allowRoles("citizen"), getMyOverview);
router.get("/", protect, allowRoles("admin"), getAllCitizens);
router.get("/by-mobile/:mobile", protect, allowRoles("admin"), getCitizenByMobile);
router.get("/:id", protect, getCitizenById);
router.patch("/:id", protect, updateCitizen);

module.exports = router;
