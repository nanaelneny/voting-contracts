# Secret Ballot: privacy-preserving blockchain voting

BSc Computer Science final year project (KNUST), building on a diploma-year prototype.

A web voting platform for any institution's elections: student councils, workplaces, unions,
associations, churches. Voters cast ballots anonymously using zero-knowledge proofs ([Semaphore](https://semaphore.pse.dev));
the ballots are verified and counted by an Ethereum smart contract. A relayer pays the transaction
fees, so voters need no crypto wallet. Accounts and election drafts live in SQL Server.

## Setting it up for an institution

In `voting-backend/.env`:

| Setting | Example | What it does |
|---|---|---|
| `ORGANISATION_NAME` | `KNUST SRC` | Shown in the website header and on the home page |
| `MEMBER_ID_LABEL` | `Staff number` | What the sign-up form calls a member's ID (default `Member ID`). Each ID can only be used once. |
| `ALLOWED_EMAIL_DOMAINS` | `company.com` | Only these email addresses can sign up (empty: any) |
| `MIN_VOTERS` | `3` | Fewest registered voters an election can be published with |

## Repository layout

| Path | What it is |
|---|---|
| `contracts/VotingV2.sol` | The voting contract: multiple elections, anonymous ballots, time-locked phases |
| `contracts/semaphore/SemaphoreDeps.sol` | Pulls Semaphore's contracts into the build for local deployment |
| `scripts/deployV2.js` | Deploys the contracts and gives the backend the address and ABI |
| `voting-backend/` | Node/Express API and gas-paying relayer on SQL Server. See its [README](voting-backend/README.md) |
| `frontend/voting-frontend/` | React web app (Vite). See its [README](frontend/voting-frontend/README.md) |
| `test/VotingV2.test.js` | Contract tests |
| `test/backend/` | Backend tests: end-to-end API + relayer, and database tests |
| `test/helpers/semaphore.js` | Deploys Semaphore locally and generates vote proofs for tests |

## How voting works

1. **Registration.** In the browser, each voter creates a Semaphore *identity*: a secret that never leaves their device, plus a public *commitment* derived from it. Only the commitment is sent to the server. Each election gets its own identity.
2. **Setup.** The election officer creates the election, adds candidates, approves registrations, and publishes: the election, candidates and approved commitments go on-chain.
3. **Voting.** The voter's browser downloads the voter list, checks it against the root stored on-chain, and builds a zero-knowledge proof: "I own one of the commitments in this group, and I choose candidate *X*", without revealing which commitment. The ballot is sent **without the voter's login**; the relayer submits it and pays the gas.
4. **Results.** The count is public on-chain throughout. After voting closes, anyone can call `finalize` to record the winners; ties are reported as ties.

What the contract guarantees:

- **One vote per voter.** Each proof carries a *nullifier*, unique per voter per election. A second vote is rejected.
- **Anonymity.** Nothing on-chain links a ballot to a voter's commitment or to who submitted it.
- **The relayer can't alter votes.** The candidate is bound into the proof, so changing it invalidates the proof.
- **No cross-election linking.** A voter's nullifiers differ between elections and between deployments.
- **The admin's power ends when voting opens.** Candidates and the voter list lock, and the election can't be ended early, reset, or cancelled.

**Limitations** (state these in the report):
- A proof works as a receipt, so the system doesn't prevent vote-buying or coercion (it isn't receipt-free).
- The running count is visible during voting.
- The server receiving a ballot sees the request's IP address and timing; see the backend README.
- A voter who loses their device without a backup can't vote once the election is published.

## Running it (Windows, Git Bash)

Requires Node.js 18+ and SQL Server. First time:

```bash
npm run setup     # installs the root, backend and frontend packages
```

Then set up the backend's `.env` and database (see [voting-backend/README.md](voting-backend/README.md)).

Each time, use four terminals:

| Terminal | Folder | Command | |
|---|---|---|---|
| 1 | project root | `npm run node` | Local blockchain. Keep it running |
| 2 | project root | `npm run deploy:local` | Deploys the contracts, then finishes |
| 3 | `voting-backend` | `npm run dev` | The API. Keep it running |
| 4 | `frontend/voting-frontend` | `npm run dev` | The website at http://localhost:3000 |

The local blockchain starts empty every time it restarts. After restarting terminal 1, run
terminal 2 again, then `npm run db:reset` in `voting-backend` to clear the old elections (accounts are kept).

**Demo without SQL Server:** in terminal 3 run `npm run demo` instead of `npm run dev`. Everything
is kept in memory and lost when it stops. Log in as `admin@demo.test` / `demo-admin-123`.

## Tests

```bash
npm test               # everything: contracts + backend
npm run test:contracts
npm run test:backend
npm run test:db        # database tests against your SQL Server
npm run coverage       # contract coverage report
npm run test:gas       # gas cost per function
```

## On a public test network

Live deployments (source code verified on the explorers):

| Network | Contract |
|---|---|
| Base Sepolia (L2) | [`0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A`](https://sepolia.basescan.org/address/0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A) |
| Ethereum Sepolia (L1) | [`0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A`](https://sepolia.etherscan.io/address/0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A) |

Both use the Semaphore team's official contract, so only VotingV2 is deployed. Keys and the
Etherscan API key go in the root `.env` (see `.env.example`); never commit it.

```bash
npm run deploy:base-sepolia     # or deploy:sepolia
npm run verify:base-sepolia     # publish the source on basescan (or verify:sepolia)
```

To run the website against a test network, set `RPC_URL` and the admin/relayer keys in
`voting-backend/.env` (see the Base Sepolia section of `voting-backend/.env.example`), then
`npm run db:reset` in `voting-backend`. No local blockchain is needed.

## Evaluation

```bash
ETH_PRICE_USD=2500 npm run evaluate                      # one full election on the network in voting-backend/.env
ETH_PRICE_USD=2500 VOTING_SECONDS=600 npm run evaluate   # on Ethereum Sepolia (12-second blocks)
ETH_PRICE_USD=2500 npm run compare                       # Base vs Ethereum, with real-network cost estimates
```

Results are saved in `evaluation/results/`. Summary of the runs on 12–13 October 2026
(10 voters, median per vote):

| | Base Sepolia (L2) | Ethereum Sepolia (L1) |
|---|---|---|
| Vote confirmed | 2.7 s | 12.3 s |
| Gas per vote | 335,821 | 521,161 (after Sepolia's Glamsterdam gas changes) |
| Estimated real-network cost per vote | $0.005 | $0.13 (at that day's low gas price) |

Voters pay nothing on either; the relayer pays. A double vote is refused before anything is sent.

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
- [x] Backend: accounts, voter registration, admin approval, publishing on-chain, gas-paying relayer, results
- [x] Frontend: registration with in-browser voter keys and backup, ballot with in-browser proofs, admin screens, results, relay statistics
- [x] Base Sepolia (L2) and Ethereum Sepolia deployments, verified source, gas/latency/cost evaluation
- [x] Candidate photos; configurable for any institution (name, member ID label, email domains)
- [ ] Written report
