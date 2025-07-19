const express = require("express");
const router = express.Router();
const voteController = require("../controllers/voteController");
const { verifyToken, isVoter } = require("../middleware/authMiddleware");

// Cast a vote (only voter can do this)
router.post("/cast", verifyToken, isVoter, voteController.castVote);

// View votes (admin or voter)
router.get("/election/:election_id", verifyToken, voteController.getVotesByElection);

// Count votes (admin only)
router.get("/election/:election_id/count", verifyToken, isAdmin, voteController.countVotesByElection);

module.exports = router;
