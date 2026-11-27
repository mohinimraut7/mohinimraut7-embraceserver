// Plans, bookings, assignments, service requests, admin data & activity
const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middlewares/auth");

const { getPlans, createBooking, getBookings, getBookingById, cancelBooking } = require("../controllers/bookingController");
const { getAssignments, createAssignment, endAssignment, replaceAssignment } = require("../controllers/assignmentController");
const { createRequest, getRequests, updateRequestStatus } = require("../controllers/requestController");
const { getAdminData, getActivity } = require("../controllers/adminController");

const admin = [protect, allowRoles("admin")];

router.get("/plans", getPlans);

router.post("/bookings", protect, allowRoles("citizen", "admin"), createBooking);
router.get("/bookings", ...admin, getBookings);
router.get("/bookings/:id", ...admin, getBookingById);
router.patch("/bookings/:id/cancel", protect, allowRoles("citizen", "admin"), cancelBooking);

router.get("/assignments", ...admin, getAssignments);
router.post("/assignments", ...admin, createAssignment);
router.patch("/assignments/:id/end", ...admin, endAssignment);
router.post("/assignments/:id/replace", ...admin, replaceAssignment);

router.post("/requests", protect, allowRoles("citizen"), createRequest);
router.get("/requests", protect, getRequests);
router.patch("/requests/:id/status", protect, allowRoles("caretaker", "admin"), updateRequestStatus);

router.get("/admin/data", ...admin, getAdminData);
router.get("/activity", ...admin, getActivity);

module.exports = router;
