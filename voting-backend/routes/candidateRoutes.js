const express = require("express");
const router = express.Router();
const candidateController = require("../controllers/candidateController");

// Add candidate
router.post("/", candidateController.addCandidate);

// Get all candidates
router.get("/", candidateController.getAllCandidates);
module.exports = router;
