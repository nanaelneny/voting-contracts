const { query } = require("../config/db");

const addCandidate = async (req, res) => {
    try {
        const { name, party, age, position } = req.body;

        // 🛡 Validate required fields
        if (!name || !party || !age ) {
            return res.status(400).json({ 
                error: "Name, party and age are required" 
            });
        }

        // 📝 Insert candidate
        await query(
            "INSERT INTO Candidates (name, party, age) VALUES (@name, @party, @age)",
            { name, party, age }
        );

        res.status(201).json({ message: "Candidate added successfully" });
    } catch (error) {
        console.error("🔥 Error adding candidate:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const getAllCandidates = async (req, res) => {
    try {
        const result = await query("SELECT * FROM Candidates");
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("🔥 Error fetching candidates:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = { addCandidate, getAllCandidates };
