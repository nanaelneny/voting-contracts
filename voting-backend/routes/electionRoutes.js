const { ethers } = require("ethers");
const { CONTRACT_ADDRESS, RPC_URL, PRIVATE_KEY } = process.env;

const Voting = require("../artifacts/contracts/Voting.sol/Voting.json");

// Connect to blockchain
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const votingContract = new ethers.Contract(CONTRACT_ADDRESS, Voting.abi, wallet);

const express = require("express");
const router = express.Router();

// Import PostgreSQL pool
const pool = require("../config/db");

// GET all elections
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM elections");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching elections:", err);
    res.status(500).json({ error: "Failed to fetch elections" });
  }
});

// POST - Create a new election
router.post("/", async (req, res) => {
  const { name, description, start_date, end_date } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: "Name, start_date, and end_date are required" });
  }

  try {
    await pool.query(
      `
      INSERT INTO elections (name, description, start_date, end_date)
      VALUES ($1, $2, $3, $4)
      `,
      [name, description || "", start_date, end_date]
    );

    res.status(201).json({ message: "Election created successfully" });
  } catch (err) {
    console.error("❌ Error creating election:", err);
    res.status(500).json({ error: "Failed to create election" });
  }
});

// PUT - Update an election
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, start_date, end_date } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE elections
      SET name = $1,
          description = $2,
          start_date = $3,
          end_date = $4
      WHERE id = $5
      `,
      [name, description, start_date, end_date, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Election not found" });
    }

    res.status(200).json({ message: "Election updated successfully" });
  } catch (err) {
    console.error("❌ Error updating election:", err);
    res.status(500).json({ error: "Failed to update election" });
  }
});

// DELETE - Delete an election
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM elections WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Election not found" });
    }

    res.status(200).json({ message: "Election deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting election:", err);
    res.status(500).json({ error: "Failed to delete election" });
  }
});

// POST - Add candidate to the smart contract
router.post("/candidates", async (req, res) => {
  console.log("✅ POST /api/elections/candidates called");
  console.log("📥 Request body:", req.body);

  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Candidate name is required" });
  }

  try {
    console.log("⏳ Adding candidate to smart contract...");
    const tx = await votingContract.addCandidate(name);
    console.log("📤 Transaction hash:", tx.hash);

    await tx.wait();
    console.log("✅ Candidate added on blockchain");

    res.status(201).json({ message: "Candidate added successfully" });
  } catch (err) {
    console.error("❌ Error adding candidate:", err);
    res.status(500).json({ error: "Failed to add candidate" });
  }
});

module.exports = router;
