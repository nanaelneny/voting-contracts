// Login tokens (JWT) and the middleware that checks them.
const jwt = require("jsonwebtoken");
const { unauthorized, forbidden, asyncHandler } = require("../errors");

function createAuth({ config, repo }) {
  const issueToken = (user) =>
    jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  const requireAuth = asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized("Your session has expired, please log in again", "INVALID_TOKEN");
    }
    // Load the user so a deleted account or changed role takes effect immediately.
    const user = await repo.findUserById(Number(payload.sub));
    if (!user) throw unauthorized("Account not found", "INVALID_TOKEN");
    req.user = user;
    next();
  });

  const requireAdmin = [
    requireAuth,
    (req, _res, next) => (req.user.role === "admin" ? next() : next(forbidden("Admins only", "ADMIN_ONLY"))),
  ];

  return { issueToken, requireAuth, requireAdmin };
}

/** The user fields that are safe to send to the browser. */
const publicUser = (u) => ({ id: u.id, fullName: u.fullName, email: u.email, studentId: u.studentId, role: u.role });

module.exports = { createAuth, publicUser };
