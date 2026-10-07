// POST /api/elections/:id/votes — the relay endpoint.
//
// This route deliberately has NO login. If voters had to be logged in to submit
// a ballot, the server could match the ballot to the student. The zero-knowledge
// proof is what proves the vote is from a registered voter.
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { asyncHandler } = require("../errors");
const v = require("./validate");

function voteRoutes({ relay, config }) {
  const router = express.Router();

  // Limits abuse of the relayer. The limiter keeps IP counts in memory only; nothing is logged.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: config.relayRateLimitPerMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many vote submissions, please wait a minute", code: "RATE_LIMITED" },
  });

  router.post("/:id/votes", limiter, asyncHandler(async (req, res) => {
    const result = await relay.relayVote(v.id(req.params.id, "election id"), req.body);
    res.status(201).json({ accepted: true, txHash: result.txHash, blockNumber: result.blockNumber });
  }));

  return router;
}

module.exports = { voteRoutes };
