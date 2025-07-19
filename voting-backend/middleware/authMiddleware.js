const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ error: "No token provided" });

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({ error: "Invalid token format" });
    }

    const token = parts[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });

        req.user = decoded; // { wallet / id, role }
        next();
    });
};

// Check if Admin
exports.isAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin privileges required" });
    }
};

// Check if Voter
exports.isVoter = (req, res, next) => {
    if (req.user.role !== "voter") {
        return res.status(403).json({ error: "Voter privileges required" });
    }
};
