const express = require("express");
const router = express.Router();
const electionController = require("../controllers/electionController");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

// Existing routes
router.get("/", electionController.getElections);
router.post("/", verifyToken, isAdmin, electionController.createElection); // ✅ /api/elections
router.post("/create", verifyToken, isAdmin, electionController.createElection); // ✅ /api/elections/create
router.put("/:id", verifyToken, isAdmin, electionController.updateElection);
router.delete("/:id", verifyToken, isAdmin, electionController.deleteElection);

module.exports = router;
