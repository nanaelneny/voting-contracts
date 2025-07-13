const express = require("express");
const router = express.Router();
const candidateController = require("../controllers/candidateController");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

// POST: Add candidate
router.post("/", verifyToken, isAdmin, candidateController.addCandidate);

// GET: All candidates
router.get("/", candidateController.getAllCandidates);

// GET: Candidates by election
router.get("/:election_id", candidateController.getCandidatesByElection);

module.exports = router;
