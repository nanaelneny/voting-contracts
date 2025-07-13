const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });

        req.user = decoded;
        next();
    });
};

exports.isAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin privileges required" });
    }
    next();
};
