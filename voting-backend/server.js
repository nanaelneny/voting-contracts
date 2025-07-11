// backend/server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const electionRoutes = require("./routes/electionRoutes");
const voteRoutes = require("./routes/voteRoutes");

const app = express();

// Add these BEFORE routes
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing form data
const allowedOrigins = [
  "http://localhost:3000",            // React dev server
  "https://voting-contracts.vercel.app", // Your production frontend
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true, // allow cookies and authorization headers
}));


// API routes
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/votes", voteRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
