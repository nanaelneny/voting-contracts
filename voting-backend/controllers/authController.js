const { pool, sql, poolConnect } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register User
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        await poolConnect;
        const request = pool.request();

        const hashedPassword = await bcrypt.hash(password, 10);

        await request
            .input("username", sql.VarChar, username)
            .input("email", sql.VarChar, email)
            .input("password", sql.VarChar, hashedPassword)
            .query(`
                INSERT INTO Users (username, email, password) 
                OUTPUT Inserted.id
                VALUES (@username, @email, @password)
            `);

        console.log("✅ User registered successfully");
        res.status(201).json({ message: "✅ User registered successfully" });
    } catch (err) {
        console.error("❌ Error registering user:", err);
        res.status(500).json({ error: "❌ Server error" });
    }
};

// Login User
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        await poolConnect;
        const request = pool.request();

        const result = await request
            .input("email", sql.VarChar, email)
            .query(`SELECT * FROM Users WHERE email = @email`);

        const user = result.recordset[0];

        if (!user) {
            return res.status(400).json({ error: "❌ Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "❌ Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ message: "✅ Login successful", token });
    } catch (err) {
        console.error("❌ Error logging in:", err);
        res.status(500).json({ error: "❌ Server error" });
    }
};
