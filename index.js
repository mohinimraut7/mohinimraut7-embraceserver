require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const seedAdmin = require("./utils/seedAdmin");

const authRoutes = require("./routes/authRoutes");
const citizenRoutes = require("./routes/citizenRoutes");
const caretakerRoutes = require("./routes/caretakerRoutes");
const careRoutes = require("./routes/careRoutes");

const app = express();

// ── Middlewares ──
app.use(cors()); // dev: open CORS; restrict to CLIENT_URL in production if needed
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── DB Connect ──
connectDB().then(seedAdmin);

// ── Routes ──
app.use("/api/auth", authRoutes);
app.use("/api/citizens", citizenRoutes);
app.use("/api/caretakers", caretakerRoutes);
app.use("/api", careRoutes); // plans, bookings, assignments, requests, admin data, activity

// ── Health check ──
app.get("/", (req, res) => {
  res.send("✅ Embrace Backend (EmbraceCare eldercare platform) is running");
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Embrace backend running on port ${PORT}`);
});
