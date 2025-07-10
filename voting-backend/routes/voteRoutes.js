// routes/voteRoutes.js
const express = require("express");
const router = express.Router();
const voteController = require("../controllers/voteController");
const { verifyToken } = require("../middleware/authMiddleware");

// Cast a vote
router.post("/cast", verifyToken, voteController.castVote);

module.exports = router;
