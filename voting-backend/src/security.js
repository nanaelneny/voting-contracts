// Security settings shared by the whole API: browser safety headers and limits on
// password guessing. Kept in one file so they're easy to find and explain.
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

// Headers that tell the browser to be strict with our responses. The API only ever
// sends JSON and images, so it doesn't need to allow scripts, styles or frames at all.
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    // Candidate photos may be shown by a website on another address (when the frontend
    // and API are hosted separately), so images must be loadable cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}

const tooMany = (message) => ({ error: message, code: "RATE_LIMITED" });

/**
 * Limits on logging in and signing up, so nobody can guess passwords forever.
 *
 * Wrong passwords are counted two ways:
 *  - per account (IP + email): stops someone hammering one account, e.g. the admin's;
 *  - per IP address, much looser: stops one computer trying many accounts.
 * The per-IP limit is loose on purpose: a whole campus can share one IP address,
 * and one person's typos shouldn't lock everyone else out. Successful logins don't count.
 */
function authLimiters(config) {
  const windowMs = 15 * 60_000;
  const common = { windowMs, standardHeaders: "draft-7", legacyHeaders: false };
  const email = (req) => String(req.body?.email ?? "").trim().toLowerCase();

  const loginPerAccount = rateLimit({
    ...common,
    limit: config.loginAttemptsPerAccount ?? 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${req.ip}|${email(req)}`,
    message: tooMany("Too many wrong passwords for this account. Wait 15 minutes and try again."),
  });
  const loginPerIp = rateLimit({
    ...common,
    limit: config.loginAttemptsPerIp ?? 100,
    skipSuccessfulRequests: true,
    message: tooMany("Too many failed logins from your network. Wait 15 minutes and try again."),
  });
  const signupPerIp = rateLimit({
    ...common,
    windowMs: 60 * 60_000,
    limit: config.signupsPerIpPerHour ?? 50,
    message: tooMany("Too many sign-ups from your network. Wait an hour and try again."),
  });

  return { login: [loginPerIp, loginPerAccount], signup: signupPerIp };
}

module.exports = { securityHeaders, authLimiters };
