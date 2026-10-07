# Privacy-Preserving Blockchain Voting

BSc Computer Science final year project (KNUST), building on a diploma-year prototype.

A web voting platform for institutional elections (SRC, departmental, association elections).
Votes are cast anonymously with zero-knowledge proofs ([Semaphore](https://semaphore.pse.dev)) and
recorded and tallied by an Ethereum smart contract. Election metadata lives in SQL Server.

## Repository layout

| Path | What it is |
|---|---|
| `contracts/VotingV2.sol` | Current voting contract: multi-election, anonymous, relayer-friendly |
| `contracts/semaphore/SemaphoreDeps.sol` | Pulls Semaphore's contracts into the build for local deployment |
| `contracts/Voting.sol` | Original diploma contract, kept until the frontend is migrated |
| `test/VotingV2.test.js` | Contract test suite |
| `test/helpers/semaphore.js` | Deploys Semaphore locally and generates vote proofs for tests |
| `scripts/deployV2.js` | Deploys the contracts and copies the ABI/address to the frontend and backend |
| `voting-backend/` | Node/Express API (auth, elections, candidates) on SQL Server |
| `frontend/voting-frontend/` | React + Tailwind web app |

## How voting works

1. **Registration.** In the browser, each voter creates a Semaphore *identity*: a secret that never leaves their device, plus a public *commitment* derived from it. Only the commitment is sent to the admin.
2. **Setup.** The admin creates the election (title, open/close times), adds candidates, and adds the approved voters' commitments to the election's Semaphore group.
3. **Voting.** The voter's browser builds a zero-knowledge proof that says "I own one of the commitments in this group, and I choose candidate *X*", without revealing which commitment. Anyone can submit the proof; normally the backend relayer does, paying the gas so the voter needs no wallet or ETH.
4. **Results.** After the close time, anyone can call `finalize`. Winners are recorded on-chain, and ties are reported as ties.

What the contract guarantees:

- **One vote per voter.** Each proof carries a *nullifier* that is unique per voter per election. A second vote is rejected.
- **Anonymity.** Nothing on-chain links a ballot to a voter's commitment or to who submitted it.
- **The relayer can't alter votes.** The candidate is bound into the proof, so changing it invalidates the proof.
- **No cross-election linking.** A voter's nullifiers differ between elections and between contract deployments.
- **The admin's power ends when voting opens.** After the start time, candidates and the voter list are locked, and the election cannot be ended early, reset, or cancelled.

Lifecycle: `Setup → Voting → Ended → Finalized` (or `Setup → Cancelled`), driven by block time.

**Limitation:** a proof works as a receipt. A voter could show it to someone to prove how they voted, so the system does not prevent vote-buying or coercion (it is not receipt-free).

## Running it

Requires Node.js 18+.

```bash
npm install
npm test              # run the contract tests
npm run coverage      # coverage report
npm run test:gas      # gas cost per function
```

Local blockchain and deployment:

```bash
npm run node          # terminal 1: local Hardhat chain
npm run deploy:demo   # terminal 2: deploy + demo election (opens in 60s, 5 registered voters)
```

`npm run deploy:local` deploys without the demo election. To reuse an existing Semaphore
deployment (for example on a public testnet), set `SEMAPHORE_ADDRESS` before deploying.

The demo writes voter identities, **including their secrets**, to `deployments/demo-identities.json`.
That file is for local testing only and is git-ignored.

## Gas (local Hardhat measurements)

| Action | Gas (avg) |
|---|---|
| Create election | ~188k |
| Add voters (batch of 3) | ~299k |
| Anonymous vote | ~362k |
| Finalize | ~91k |

For comparison, the non-anonymous address-whitelist version cost ~96k per vote. Proof
verification is the main cost of privacy, which motivates Layer 2 deployment.

## Status

- [x] VotingV2 contract with zero-knowledge (Semaphore) anonymous voting, and test suite
- [ ] Backend: voter registration (commitments), election setup on-chain, gas-paying relayer; remove SQL `Votes` table
- [ ] Frontend: identity creation, proof generation in the browser, election picker, results
- [ ] Layer 2 testnet deployment and gas/latency evaluation
