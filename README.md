# Online Voting System with Blockchain Integration

BSc Computer Science final year project (KNUST), building on a diploma-year prototype.

A web voting platform for institutional elections (SRC, departmental, association elections).
Votes are recorded and tallied by an Ethereum smart contract; election metadata lives in SQL Server.

## Repository layout

| Path | What it is |
|---|---|
| `contracts/VotingV2.sol` | Current voting contract (multi-election, approved voters only) |
| `contracts/Voting.sol` | Original diploma contract, kept until the frontend is migrated |
| `test/VotingV2.test.js` | Contract test suite |
| `scripts/voterTree.js` | Builds the approved-voter Merkle tree and voter proofs |
| `scripts/deployV2.js` | Deploys VotingV2 and copies the ABI/address to the frontend and backend |
| `voting-backend/` | Node/Express API (auth, elections, candidates) on SQL Server |
| `frontend/voting-frontend/` | React + Tailwind web app with MetaMask |

## VotingV2 at a glance

- **Many elections per contract.** Each has an id, a title, the matching SQL `Elections.id`, and fixed open/close times.
- **Only approved voters can vote.** Before an election opens, the admin publishes a Merkle root of approved wallet addresses. A voter submits a proof with their vote; wallets not on the list are rejected.
- **The admin's power ends when voting opens.** After the start time, candidates and the voter list are locked, and the election cannot be ended early, reset, or cancelled.
- **Anyone can finalize.** After the close time, any account can call `finalize`, so results don't depend on the admin. Ties are reported as ties.

Lifecycle: `Setup → Voting → Ended → Finalized` (or `Setup → Cancelled`), driven by block time.

**Privacy limitation:** votes are still linked to wallet addresses (pseudonymous, not anonymous). A zero-knowledge extension to remove that link is planned.

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
npm run deploy:demo   # terminal 2: deploy + demo election (opens in 60s, accounts #1-#5 approved)
```

`npm run deploy:local` deploys without the demo election.

## Status

- [x] VotingV2 contract and test suite
- [ ] Backend: voter approval workflow, Merkle root publishing, proof endpoint; remove SQL `Votes` table
- [ ] Frontend: migrate to VotingV2 (election picker, proof fetch, results/winners)
- [ ] Public testnet deployment and gas/latency evaluation
- [ ] Zero-knowledge ballot privacy
