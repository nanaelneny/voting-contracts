const express = require("express");
const router = express.Router();
const voteController = require("../controllers/voteController");
const { verifyToken } = require("../middleware/authMiddleware");

// Cast a vote
router.post("/cast", verifyToken, voteController.castVote);

// Get all votes for a specific election
router.get("/election/:election_id", verifyToken, voteController.getVotesByElection);

// Get vote counts for each candidate in an election
router.get("/election/:election_id/count", verifyToken, voteController.countVotesByElection);

module.exports = router;
