// backend/server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const originalUse = express.application.use;
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



// Serve React frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/build")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
  });
}

express.application.use = function(path, ...handlers) {
  console.log("app.use() called with:", path); // 👈 Add this
  if (typeof path === 'string' && path.startsWith('http')) {
    console.error("🚨 Invalid route path used in app.use():", path);
    throw new Error(`Invalid route path: ${path}`);
  }
  return originalUse.call(this, path, ...handlers);
};
