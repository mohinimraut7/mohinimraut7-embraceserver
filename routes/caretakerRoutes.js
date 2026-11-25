const express = require("express");
const router = express.Router();

const {
  createCaretaker,
  getAllCaretakers,
  getCaretakerById,
  findAvailableCaretaker,
  approveCaretaker,
  rejectCaretaker,
  loginWithCredentials,
} = require("../controllers/caretakerController");

router.post("/", createCaretaker);
router.post("/login", loginWithCredentials);
router.get("/", getAllCaretakers);
router.get("/available", findAvailableCaretaker);
router.get("/:id", getCaretakerById);
router.patch("/:id/approve", approveCaretaker);
router.patch("/:id/reject", rejectCaretaker);

module.exports = router;
