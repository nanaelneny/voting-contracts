// /api/auth — account registration and login.
const express = require("express");
const bcrypt = require("bcryptjs");
const { asyncHandler, conflict, unauthorized, badRequest, DuplicateError } = require("../errors");
const { publicUser } = require("../auth/auth");
const v = require("./validate");

function authRoutes({ repo, auth, config }) {
  const router = express.Router();
  // e.g. ["st.knust.edu.gh"]. Empty means any email address is accepted.
  const domains = config.allowedEmailDomains || [];
  const idLabel = config.memberIdLabel || "Member ID";

  // Public sign-up always creates a voter. Admins are created with `npm run create-admin`.
  // One person, one account: the member ID (student ID, staff number...) is required and
  // must be unique, and the email can be limited to the institution's domain. The admin
  // still approves each registration.
  router.post("/register", asyncHandler(async (req, res) => {
    const fullName = v.text(req.body, "fullName", { max: 150 });
    const email = v.email(req.body);
    if (domains.length > 0 && !domains.some((d) => email.endsWith(`@${d}`))) {
      throw badRequest(`Use your organisation's email address (ending in @${domains.join(" or @")})`, "EMAIL_DOMAIN");
    }
    const memberId = v.text(req.body, "memberId", { max: 50 });
    const password = req.body?.password;
    if (typeof password !== "string" || password.length < 8) {
      throw badRequest("Password must be at least 8 characters", "VALIDATION");
    }

    try {
      const user = await repo.createUser({ fullName, email, memberId, passwordHash: await bcrypt.hash(password, 10), role: "voter" });
      res.status(201).json({ token: auth.issueToken(user), user: publicUser(user) });
    } catch (err) {
      if (err instanceof DuplicateError) {
        throw conflict(err.field === "memberId" ? `That ${idLabel} is already registered` : "That email is already registered", "DUPLICATE");
      }
      throw err;
    }
  }));

  router.post("/login", asyncHandler(async (req, res) => {
    const email = v.email(req.body);
    const password = String(req.body?.password ?? "");
    const user = await repo.findUserByEmail(email);
    // Same message either way, so the login form doesn't reveal which emails exist.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized("Incorrect email or password", "BAD_CREDENTIALS");
    }
    res.json({ token: auth.issueToken(user), user: publicUser(user) });
  }));

  router.get("/me", auth.requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}

module.exports = { authRoutes };
