const express = require("express");
const router = express.Router();
const electionController = require("../controllers/electionController");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

router.get("/", electionController.getElections);
router.post("/", verifyToken, isAdmin, electionController.createElection);
router.put("/:id", verifyToken, isAdmin, electionController.updateElection);
router.delete("/:id", verifyToken, isAdmin, electionController.deleteElection);

module.exports = router;
