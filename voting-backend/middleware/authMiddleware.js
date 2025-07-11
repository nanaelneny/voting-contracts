const jwt = require("jsonwebtoken");
const secretKey = process.env.JWT_SECRET || "supersecretkey"; // Fallback to env var

// ✅ Verify JWT token
exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "❌ Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded; // Attach user info to request
        next();
    } catch (error) {
        console.error("❌ Invalid token:", error);
        res.status(401).json({ message: "❌ Invalid or expired token." });
    }
};

// ✅ Check if user is admin
exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    } else {
        return res.status(403).json({ message: "❌ Access denied. Admins only." });
    }
};
