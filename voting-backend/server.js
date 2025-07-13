const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const electionRoutes = require("./routes/electionRoutes");
const voteRoutes = require("./routes/voteRoutes");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/votes", voteRoutes);

app.get("/", (req, res) => {
    res.send("✅ Blockchain Voting API is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
