// /api/elections — elections, candidates, publishing, results.
const express = require("express");
const { asyncHandler, badRequest, notFound } = require("../errors");
const { electionStatus, assertEditable } = require("../services/electionService");
const v = require("./validate");

function electionRoutes({ repo, auth, elections, relay, chain, clock }) {
  const router = express.Router();

  async function load(req) {
    const election = await repo.getElection(v.id(req.params.id, "election id"));
    if (!election) throw notFound("Election not found");
    return election;
  }

  const summary = (e, now) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startTime: e.startTime,
    endTime: e.endTime,
    status: electionStatus(e, now),
    chainElectionId: e.chainElectionId,
  });

  // ── Public reads ──

  router.get("/", asyncHandler(async (_req, res) => {
    const now = await clock();
    res.json({ elections: (await repo.listElections()).map((e) => summary(e, now)) });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    const election = await load(req);
    const candidates = await repo.listCandidates(election.id);
    res.json({
      election: summary(election, await clock()),
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, chainIndex: c.chainIndex })),
    });
  }));

  router.get("/:id/results", asyncHandler(async (req, res) => {
    res.json(await elections.results(await load(req)));
  }));

  /**
   * Everything a voter's browser needs to build a vote proof: the ordered list of
   * registered commitments (to rebuild the Merkle tree), the scope, and the
   * on-chain root so the browser can check the list hasn't been tampered with.
   */
  router.get("/:id/group", asyncHandler(async (req, res) => {
    const election = await load(req);
    if (!election.publishedAt) throw notFound("This election hasn't been published yet");
    const state = await chain.getElection(election.chainElectionId);
    const [members, scope, root] = await Promise.all([
      repo.listGroupMembers(election.id),
      chain.scopeOf(election.chainElectionId),
      chain.getGroupRoot(state.groupId),
    ]);
    res.json({ chainElectionId: election.chainElectionId, groupId: state.groupId, scope, root, phase: state.phase, members });
  }));

  // ── Admin: elections ──

  router.post("/", auth.requireAdmin, asyncHandler(async (req, res) => {
    const title = v.text(req.body, "title", { max: 200 });
    const description = v.text(req.body, "description", { required: false, max: 4000 });
    const startTime = v.date(req.body, "startTime");
    const endTime = v.date(req.body, "endTime");
    if (endTime <= startTime) throw badRequest("End time must be after start time", "VALIDATION");

    const election = await repo.createElection({ title, description, startTime, endTime, createdBy: req.user.id });
    res.status(201).json({ election: summary(election, await clock()) });
  }));

  router.put("/:id", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    assertEditable(election);
    const fields = {
      title: req.body?.title !== undefined ? v.text(req.body, "title", { max: 200 }) : undefined,
      description: req.body?.description !== undefined ? v.text(req.body, "description", { required: false, max: 4000 }) : undefined,
      startTime: v.date(req.body, "startTime", { required: false }),
      endTime: v.date(req.body, "endTime", { required: false }),
    };
    if ((fields.endTime || election.endTime) <= (fields.startTime || election.startTime)) {
      throw badRequest("End time must be after start time", "VALIDATION");
    }
    const updated = await repo.updateElection(election.id, fields);
    res.json({ election: summary(updated, await clock()) });
  }));

  router.delete("/:id", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    assertEditable(election);
    await repo.deleteElection(election.id);
    res.status(204).end();
  }));

  // ── Admin: candidates ──

  router.post("/:id/candidates", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    assertEditable(election);
    const name = v.text(req.body, "name", { max: 150 });
    const party = v.text(req.body, "party", { required: false, max: 100 });
    const candidate = await repo.addCandidate(election.id, { name, party });
    res.status(201).json({ candidate: { id: candidate.id, name: candidate.name, party: candidate.party } });
  }));

  router.delete("/:id/candidates/:candidateId", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    assertEditable(election);
    const candidate = await repo.getCandidate(v.id(req.params.candidateId, "candidate id"));
    if (!candidate || candidate.electionId !== election.id) throw notFound("Candidate not found");
    await repo.deleteCandidate(candidate.id);
    res.status(204).end();
  }));

  // ── Admin: blockchain actions ──

  router.post("/:id/publish", auth.requireAdmin, asyncHandler(async (req, res) => {
    res.json(await elections.publish(await load(req)));
  }));

  router.post("/:id/sync-voters", auth.requireAdmin, asyncHandler(async (req, res) => {
    res.json(await elections.syncVoters(await load(req)));
  }));

  router.post("/:id/cancel", auth.requireAdmin, asyncHandler(async (req, res) => {
    await elections.cancel(await load(req));
    res.json({ cancelled: true });
  }));

  router.post("/:id/finalize", auth.requireAdmin, asyncHandler(async (req, res) => {
    const election = await load(req);
    const tx = await relay.finalize(election);
    res.json({ ...tx, results: await elections.results(election) });
  }));

  return router;
}

module.exports = { electionRoutes };
