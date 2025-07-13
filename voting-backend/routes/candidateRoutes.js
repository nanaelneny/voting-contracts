const express = require("express");
const router = express.Router();
const {
    addCandidate,
    getAllCandidates,
    getCandidatesByElection,
} = require("../controllers/candidateController");

// Add a candidate
router.post("/", addCandidate);

// Get all candidates
router.get("/", getAllCandidates);

// Get candidates by election
router.get("/election/:election_id", getCandidatesByElection);

module.exports = router;
