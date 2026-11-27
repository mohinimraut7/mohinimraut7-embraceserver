const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middlewares/auth");

const {
  createCaretaker,
  getAllCaretakers,
  getCaretakerById,
  findAvailableCaretaker,
  approveCaretaker,
  rejectCaretaker,
  updateCaretaker,
  loginWithCredentials,
  getMyOverview,
} = require("../controllers/caretakerController");
const { getAvailability } = require("../controllers/assignmentController");

const admin = [protect, allowRoles("admin")];

router.post("/", createCaretaker); // application (public)
router.post("/login", loginWithCredentials); // public
router.get("/me/overview", protect, allowRoles("caretaker"), getMyOverview);
router.get("/availability", ...admin, getAvailability);
router.get("/available", ...admin, findAvailableCaretaker); // legacy
router.get("/", ...admin, getAllCaretakers);
router.get("/:id", protect, getCaretakerById);
router.patch("/:id/approve", ...admin, approveCaretaker);
router.patch("/:id/reject", ...admin, rejectCaretaker);
router.patch("/:id", ...admin, updateCaretaker);

module.exports = router;
