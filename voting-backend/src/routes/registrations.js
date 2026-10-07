// /api/elections/:id/registration(s) — voters sign up for an election, admins review them.
const express = require("express");
const { asyncHandler, badRequest, conflict, notFound, DuplicateError } = require("../errors");
const v = require("./validate");

function registrationRoutes({ repo, auth, clock }) {
  const router = express.Router();

  async function load(req) {
    const election = await repo.getElection(v.id(req.params.id, "election id"));
    if (!election) throw notFound("Election not found");
    return election;
  }

  const view = (r) => ({
    id: r.id, status: r.status, onChain: r.onChain, commitment: r.commitment, createdAt: r.createdAt, reviewedAt: r.reviewedAt,
  });

  /**
   * A voter submits the identity commitment their browser generated.
   * They can replace it (e.g. after losing the device) until it has been added on-chain.
   */
  router.post("/:id/registration", auth.requireAuth, asyncHandler(async (req, res) => {
    const election = await load(req);
    const commitment = v.commitment(req.body);
    if (election.cancelledAt) throw conflict("This election was cancelled", "ELECTION_CANCELLED");
    if ((await clock()) >= election.startTime) throw conflict("Registration has closed for this election", "REGISTRATION_CLOSED");

    const existing = await repo.getRegistration(election.id, req.user.id);
    if (existing?.onChain) {
      throw conflict("Your registration is already on the blockchain and can't be changed", "ALREADY_ON_CHAIN");
    }
    try {
      const reg = await repo.saveRegistration(election.id, req.user.id, commitment);
      res.status(existing ? 200 : 201).json({ registration: view(reg) });
    } catch (err) {
      if (err instanceof DuplicateError) throw conflict("That identity is already registered for this election", "DUPLICATE_COMMITMENT");
      throw err;
    }
  }));

  router.get("/:id/registration", auth.requireAuth, asyncHandler(async (req, res) => {
    const election = await load(req);
    const reg = await repo.getRegistration(election.id, req.user.id);
    res.json({ registration: reg ? view(reg) : null });
  }));

  // ── Admin ──

  router.get("/:id/registrations", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    const status = req.query.status;
    if (status && !["pending", "approved", "rejected"].includes(status)) throw badRequest("Unknown status filter", "VALIDATION");
    const regs = await repo.listRegistrations(election.id, { status });
    res.json({ registrations: regs.map((r) => ({ ...view(r), user: r.user })) });
  }));

  /** Body: { ids: [1, 2, 3], status: "approved" | "rejected" } */
  router.post("/:id/registrations/review", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    if (election.cancelledAt) throw conflict("This election was cancelled", "ELECTION_CANCELLED");
    const { ids, status } = req.body || {};
    if (!["approved", "rejected"].includes(status)) throw badRequest('"status" must be "approved" or "rejected"', "VALIDATION");
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000) throw badRequest('"ids" must be a list of 1 to 1000 registration ids', "VALIDATION");
    const updated = await repo.setRegistrationStatus(election.id, ids.map((x) => v.id(x, "registration id")), status, req.user.id);
    res.json({ updated });
  }));

  return router;
}

module.exports = { registrationRoutes };
