// controllers/electionController.js
const db = require("../config/db");

// Create a new election
exports.createElection = async (req, res) => {
  const { name } = req.body;

  try {
    const result = await db.query(
      "INSERT INTO Elections (name) VALUES (@name)",
      {
        name,
      }
    );
    res.status(201).json({ message: "Election created successfully" });
  } catch (error) {
    console.error("Error creating election:", error);
    res.status(500).json({ message: "Failed to create election" });
  }
};

// Get all elections
exports.getElections = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM Elections");
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error fetching elections:", error);
    res.status(500).json({ message: "Failed to fetch elections" });
  }
};
