const { sql, poolPromise } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");

// Store nonces temporarily (in-memory; use DB in production)
const nonces = {};

// Admin: Register User
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required" });
    }

    try {
        const pool = await poolPromise;
        const existingUser = await pool.request()
            .input("email", sql.VarChar, email)
            .query(`SELECT id FROM Users WHERE email = @email`);

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ error: "❌ Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.request()
            .input("username", sql.VarChar, username)
            .input("email", sql.VarChar, email)
            .input("password", sql.VarChar, hashedPassword)
            .input("role", sql.VarChar, "admin")
            .query(`
                INSERT INTO Users (username, email, password, role) 
                VALUES (@username, @email, @password, @role)
            `);

        res.status(201).json({ message: "✅ Admin registered successfully" });
    } catch (err) {
        console.error("❌ Error registering admin:", err);
        res.status(500).json({ error: "❌ Server error" });
    }
};

// Admin: Login User
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
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

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({ message: "✅ Login successful", token });
    } catch (err) {
        console.error("❌ Error logging in admin:", err);
        res.status(500).json({ error: "❌ Server error" });
    }
};

// Voter: Get Nonce
exports.getNonce = (req, res) => {
    const { address } = req.query;
    if (!address) {
        return res.status(400).json({ error: "Wallet address is required" });
    }

    const nonce = Math.floor(Math.random() * 1000000).toString();
    nonces[address] = nonce;

    res.json({ nonce });
};

// Voter: Wallet Login
exports.loginWithWallet = async (req, res) => {
    const { address, signature } = req.body;

    if (!address || !signature) {
        return res.status(400).json({ error: "Wallet address and signature required" });
    }

    const nonce = nonces[address];
    if (!nonce) {
        return res.status(400).json({ error: "Nonce not found. Please request a new one." });
    }

    try {
        const message = `Login to Blockchain Voting System. Nonce: ${nonce}`;
        const recoveredAddress = ethers.utils.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: "Signature verification failed" });
        }

        // Issue JWT token
        const token = jwt.sign(
            { wallet: address, role: "voter" }, // attach role
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        delete nonces[address]; // Prevent reuse of nonce
        res.json({ message: "✅ Wallet login successful", token });
    } catch (err) {
        console.error("❌ Wallet login error:", err);
        res.status(500).json({ error: "❌ Server error" });
    }
};
