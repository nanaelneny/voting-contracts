// Builds the Express app from its parts. server.js passes the real database and
// blockchain; the tests pass an in-memory database and a local test chain.
const express = require("express");
const cors = require("cors");
const { errorHandler, notFound } = require("./errors");
const { securityHeaders } = require("./security");
const { createAuth } = require("./auth/auth");
const { createElectionService } = require("./services/electionService");
const { createRelayService } = require("./services/relayService");
const { authRoutes } = require("./routes/auth");
const { electionRoutes } = require("./routes/elections");
const { registrationRoutes } = require("./routes/registrations");
const { voteRoutes } = require("./routes/votes");

/**
 * @param deps.repo    repository (mssqlRepository or memoryRepository)
 * @param deps.chain   votingClient
 * @param deps.config  see config.js
 * @param deps.clock   async () => Date, the current time (defaults to the computer clock)
 */
function createApp({ repo, chain, config, clock = async () => new Date(), chainInfo = {} }) {
  const auth = createAuth({ config, repo });
  const elections = createElectionService({ repo, chain, clock, config });
  const relay = createRelayService({ repo, chain });
  const deps = { repo, chain, config, clock, auth, elections, relay };

  const app = express();
  app.disable("x-powered-by");
  // When hosted behind a proxy (most hosting services), this makes req.ip the visitor's
  // real address instead of the proxy's, so rate limits count each visitor separately.
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders());
  app.use(cors({ origin: config.corsOrigin }));
  // Photo uploads are bigger than other requests, so only their route gets a higher limit.
  app.use("/api/elections/:id/candidates/:candidateId/photo", express.json({ limit: "800kb" }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  // How this installation is set up for its institution (shown on the website).
  app.get("/api/settings", (_req, res) =>
    res.json({
      organisationName: config.organisationName || "",
      memberIdLabel: config.memberIdLabel || "Member ID",
      allowedEmailDomains: config.allowedEmailDomains || [],
    })
  );
  // Candidate photos are public, like the candidate list.
  app.get("/api/candidates/:id/photo", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const photo = Number.isInteger(id) && id > 0 ? await repo.getCandidatePhoto(id) : null;
      if (!photo) return next(notFound("No photo"));
      res.set("Content-Type", photo.contentType);
      res.set("Cache-Control", "public, max-age=31536000, immutable"); // the URL changes when the photo does
      res.set("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(photo.data));
    } catch (err) {
      next(err);
    }
  });
  app.get("/api/chain", (_req, res) => res.json({ contractAddress: chain.address, ...chainInfo }));

  app.use("/api/auth", authRoutes(deps));
  app.use("/api/elections", voteRoutes(deps));
  app.use("/api/elections", registrationRoutes(deps));
  app.use("/api/elections", electionRoutes(deps));

  app.get("/api/admin/relay-stats", auth.requireAdmin, async (_req, res, next) => {
    try {
      res.json({ stats: await repo.relayStats() });
    } catch (err) {
      next(err);
    }
  });

  app.use("/api", (_req, _res, next) => next(notFound("No such API endpoint")));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
