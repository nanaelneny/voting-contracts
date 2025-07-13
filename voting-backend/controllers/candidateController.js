const { query } = require("../config/db");

// Add a candidate
exports.addCandidate = async (req, res) => {
    const { name, party } = req.body;
    try {
        await query(
            "INSERT INTO Candidates (name, party) VALUES (@name, @party)",
            { name, party }
        );
        res.status(201).json({ message: "Candidate added successfully" });
    } catch (err) {
        console.error("Error adding candidate:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Get all candidates
exports.getAllCandidates = async (req, res) => {
    try {
        const result = await query("SELECT * FROM Candidates");
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error("Error fetching candidates:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};
