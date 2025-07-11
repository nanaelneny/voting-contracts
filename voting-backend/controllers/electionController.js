// controllers/electionController.js
const { pool } = require("../config/db"); // Updated import for pg

// Create a new election
exports.createElection = async (req, res) => {
    const { name } = req.body;

    try {
        const query = `
            INSERT INTO elections (name)
            VALUES ($1)
            RETURNING id
        `;
        const values = [name];

        const result = await pool.query(query, values);
        console.log("✅ Election created with ID:", result.rows[0].id);

        res.status(201).json({ message: "✅ Election created successfully", electionId: result.rows[0].id });
    } catch (error) {
        console.error("❌ Error creating election:", error);
        res.status(500).json({ message: "❌ Failed to create election" });
    }
};

// Get all elections
exports.getElections = async (req, res) => {
    try {
        const query = `SELECT * FROM elections ORDER BY id DESC`;
        const result = await pool.query(query);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching elections:", error);
        res.status(500).json({ message: "❌ Failed to fetch elections" });
    }
};
