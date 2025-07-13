const { ethers } = require("ethers");
const { pool, sql, poolConnect } = require("../config/db");
const votingContract = require("../config/contract");
const { query } = require("../config/db");

// 🗳 Cast a vote
const castVote = async (req, res) => {
    try {
        const { voter_address, candidate_id, election_id } = req.body;

        // 🛡 Validate input
        if (!voter_address || !candidate_id || !election_id) {
            return res.status(400).json({
                error: "voter_address, candidate_id, and election_id are required",
            });
        }

        // 🔄 Check if voter already voted in this election
        const existingVote = await query(
            `SELECT * FROM Votes 
             WHERE voter_address = @voter_address AND election_id = @election_id`,
            { voter_address, election_id }
        );

        if (existingVote.recordset.length > 0) {
            return res.status(400).json({
                error: "You have already voted in this election",
            });
        }

        // ✅ Insert vote
        await query(
            `INSERT INTO Votes (voter_address, candidate_id, election_id) 
             VALUES (@voter_address, @candidate_id, @election_id)`,
            { voter_address, candidate_id, election_id }
        );

        res.status(201).json({ message: "✅ Vote cast successfully" });
    } catch (error) {
        console.error("🔥 Error casting vote:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

// 📥 Get all votes for an election
const getVotesByElection = async (req, res) => {
    const { election_id } = req.params;

    try {
        const result = await query(
            `SELECT * FROM Votes WHERE election_id = @election_id`,
            { election_id: parseInt(election_id) }
        );

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("🔥 Error fetching votes:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

// 📊 Count votes by candidate for an election
const countVotesByElection = async (req, res) => {
    const { election_id } = req.params;

    try {
        const result = await query(
            `SELECT 
                Candidates.id AS candidate_id,
                Candidates.name AS candidate_name,
                COUNT(Votes.id) AS vote_count
             FROM Votes
             JOIN Candidates ON Votes.candidate_id = Candidates.id
             WHERE Votes.election_id = @election_id
             GROUP BY Candidates.id, Candidates.name`,
            { election_id: parseInt(election_id) }
        );

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("🔥 Error counting votes:", error);
        res.status(500).json({ error: "❌ Internal server error" });
    }
};

module.exports = {
    castVote,
    getVotesByElection,
    countVotesByElection,
};
