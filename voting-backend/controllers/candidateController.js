const { query } = require("../config/db");

// ✅ Add a candidate linked to an election
const addCandidate = async (req, res) => {
    try {
        const { name, party, age, position, election_id } = req.body;

        // 🛡 Validate required fields
        if (!name || !party || !age || !election_id) {
            return res.status(400).json({
                error: "Name, party, age, and election_id are required",
            });
        }

        // 📝 Insert candidate
        await query(
            `INSERT INTO Candidates (name, party, age, election_id) 
             VALUES (@name, @party, @age, @election_id)`,
            { name, party, age, election_id }
        );

        res.status(201).json({ message: "✅ Candidate added successfully" });
    } catch (error) {
        console.error("🔥 Error adding candidate:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

// ✅ Fetch all candidates
const getAllCandidates = async (req, res) => {
    try {
        const result = await query("SELECT * FROM Candidates");
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("🔥 Error fetching candidates:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

// ✅ Fetch candidates by election
const getCandidatesByElection = async (req, res) => {
    const { election_id } = req.params;

    try {
        const result = await query(
            "SELECT * FROM Candidates WHERE election_id = @election_id",
            { election_id: parseInt(election_id) }
        );

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("🔥 Error fetching candidates for election:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

module.exports = {
    addCandidate,
    getAllCandidates,
    getCandidatesByElection,
};
