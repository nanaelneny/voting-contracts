const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const electionRoutes = require("./routes/electionRoutes");
const voteRoutes = require("./routes/voteRoutes");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "http://localhost:3000", // React dev server
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/votes", voteRoutes);

// Serve frontend build
app.use(express.static(path.join(__dirname, "../frontend/voting-frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/voting-frontend/build", "index.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
