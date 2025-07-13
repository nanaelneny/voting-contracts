const { pool, sql, poolConnect } = require("../config/db");

// Create a new election
exports.createElection = async (req, res) => {
    const { name, description, start_date, end_date } = req.body;

    if (!name || !start_date || !end_date) {
        return res.status(400).json({ error: "Name, start_date, and end_date are required" });
    }

    try {
        await poolConnect;
        const request = pool.request();

        await request
            .input("name", sql.VarChar, name)
            .input("description", sql.VarChar, description || "")
            .input("start_date", sql.DateTime, start_date)
            .input("end_date", sql.DateTime, end_date)
            .query(`
                INSERT INTO Elections (name, description, start_date, end_date)
                VALUES (@name, @description, @start_date, @end_date)
            `);

        console.log("✅ Election created successfully");
        res.status(201).json({ message: "✅ Election created successfully" });
    } catch (error) {
        console.error("❌ Error creating election:", error);
        res.status(500).json({ message: "❌ Failed to create election" });
    }
};

// Get all elections
exports.getElections = async (req, res) => {
    try {
        await poolConnect;
        const request = pool.request();

        const result = await request.query(`
            SELECT * FROM Elections ORDER BY id DESC
        `);

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("❌ Error fetching elections:", error);
        res.status(500).json({ message: "❌ Failed to fetch elections" });
    }
};

// Update an election
exports.updateElection = async (req, res) => {
    const { id } = req.params;
    const { name, description, start_date, end_date } = req.body;

    try {
        await poolConnect;
        const request = pool.request();

        const result = await request
            .input("id", sql.Int, id)
            .input("name", sql.VarChar, name)
            .input("description", sql.VarChar, description)
            .input("start_date", sql.DateTime, start_date)
            .input("end_date", sql.DateTime, end_date)
            .query(`
                UPDATE Elections
                SET name = @name,
                    description = @description,
                    start_date = @start_date,
                    end_date = @end_date
                WHERE id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Election not found" });
        }

        res.status(200).json({ message: "✅ Election updated successfully" });
    } catch (error) {
        console.error("❌ Error updating election:", error);
        res.status(500).json({ message: "❌ Failed to update election" });
    }
};

// Delete an election
exports.deleteElection = async (req, res) => {
    const { id } = req.params;

    try {
        await poolConnect;
        const request = pool.request();

        const result = await request
            .input("id", sql.Int, id)
            .query(`DELETE FROM Elections WHERE id = @id`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: "Election not found" });
        }

        res.status(200).json({ message: "✅ Election deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting election:", error);
        res.status(500).json({ message: "❌ Failed to delete election" });
    }
};
