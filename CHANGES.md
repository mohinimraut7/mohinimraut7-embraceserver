# Caretaker profile, hour packages & admin assignment — changes (27 Nov 2026)

## Flow
1. Caretaker applies (all * fields mandatory) → role (Caretaker / Nurse / Caretaker + Nurse),
   years of experience, shift hours/day (4/8/12/24) are saved on the caretaker.
2. Admin approves → caretaker appears in the available list.
3. Citizen registers (all * fields mandatory) → picks package 4/8/12/24 hrs per day,
   start date, daily start time, days, help type → pays (simulated) → booking = "Awaiting caretaker".
4. Admin → Care Bookings → "Assign from available list": shows every approved caretaker
   as Available / Not free (busy in slot, shift hours used up, role mismatch, paused).
   A citizen can get several caretakers (e.g. 24 hrs = 3 x 8 hrs); one caretaker can serve
   several citizens in different slots up to their shift hours (A 08–10, B 10–14, C 14–18).
5. When a caretaker's duty/hours finish → admin clicks End (hours become free again,
   booking shows "needs X hrs") or Replace (same slot, another caretaker from a date).
6. When the package period ends it closes automatically; citizen taps "Request more time"
   in the app → new booking → admin assigns again.
7. Every action is logged → Admin → Activity & History (filter by citizen / caretaker),
   plus "Assignment History" table (who served whom, which slot, which dates, why ended).

## New backend files
- config/plans.js            packages + prices (prices are placeholders — edit here)
- models/Booking.js, Assignment.js, ServiceRequest.js, ActivityLog.js
- services/care.js           availability, coverage, serializers, activity log
- controllers/bookingController.js, assignmentController.js, requestController.js, adminController.js
- routes/careRoutes.js       mounted at /api

## New / changed endpoints
- GET  /api/plans                                   public
- POST /api/bookings                                citizen
- GET  /api/bookings, /api/bookings/:id             admin
- PATCH /api/bookings/:id/cancel                    citizen (own) / admin
- GET  /api/caretakers/availability?bookingId=…     admin
- GET  /api/assignments, POST /api/assignments      admin
- PATCH /api/assignments/:id/end                    admin
- POST /api/assignments/:id/replace                 admin
- POST /api/requests (citizen), GET /api/requests (any role, scoped), PATCH /api/requests/:id/status (caretaker/admin)
- GET  /api/admin/data, GET /api/activity           admin
- GET  /api/citizens/me/overview                    citizen
- GET  /api/caretakers/me/overview                  caretaker
- PATCH /api/caretakers/:id                         admin (role, experience, shift, pause)
- Admin-only now (JWT required): GET /api/citizens, GET /api/caretakers, approve/reject.

## Deploy
Deploy backend and frontend together (frontend now sends the JWT on every call).
Users logged in on the old build are sent back to login once (old sessions have no token).
