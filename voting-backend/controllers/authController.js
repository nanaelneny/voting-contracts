const { pool } = require("../config/db"); // Updated for pg
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register User
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = `
            INSERT INTO users (username, email, password) 
            VALUES ($1, $2, $3)
            RETURNING id
        `;
        const values = [username, email, hashedPassword];

        const result = await pool.query(query, values);
        console.log("✅ User created with ID:", result.rows[0].id);

        res.status(201).json({ message: "✅ User registered successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "❌ Server error" });
    }
};

// Login User
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const query = `SELECT * FROM users WHERE email = $1`;
        const result = await pool.query(query, [email]);

        const user = result.rows[0];
        if (!user) {
            return res.status(400).json({ error: "❌ Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "❌ Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ message: "✅ Login successful", token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "❌ Server error" });
    }
};
