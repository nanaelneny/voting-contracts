# Voting backend (API + relayer)

Node/Express API on SQL Server. It manages accounts, election drafts and voter
registrations, publishes elections to the VotingV2 contract, and **relays** voters'
anonymous ballots to the blockchain, paying the gas so voters need no wallet.

Votes are never stored in the database. They exist only on-chain.

## How an election runs

| Step | Who | Endpoint |
|---|---|---|
| 1. Create election (draft) and add candidates | Admin | `POST /api/elections`, `POST /api/elections/:id/candidates` |
| 2. Register for the election with an identity commitment (made in the browser) | Voter (logged in) | `POST /api/elections/:id/registration` |
| 3. Approve or reject registrations | Admin | `GET /api/elections/:id/registrations`, `POST /api/elections/:id/registrations/review` |
| 4. Publish: create the election on-chain with candidates and approved voters | Admin | `POST /api/elections/:id/publish` |
| 5. Add late approvals (any time before voting opens) | Admin | `POST /api/elections/:id/sync-voters` |
| 6. Fetch the voter group, build a zero-knowledge proof in the browser | Voter's browser | `GET /api/elections/:id/group` |
| 7. Submit the ballot. **No login**, so the server can't link it to the student | Anyone | `POST /api/elections/:id/votes` |
| 8. After voting closes, record the result on-chain | Admin | `POST /api/elections/:id/finalize` |
| Live and final results, read from the blockchain | Anyone | `GET /api/elections/:id/results` |

Other endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`,
`GET /api/elections`, `GET /api/elections/:id`, `PUT/DELETE /api/elections/:id` (drafts only),
`POST /api/elections/:id/cancel` (before voting opens), `GET /api/admin/relay-stats`.

Errors come back as `{ "error": "message for the user", "code": "MACHINE_CODE" }`.

## Privacy notes

- The database knows which student registered which **commitment**. A ballot carries a
  zero-knowledge proof that hides which commitment cast it, so the database can't link
  ballots to students.
- The vote endpoint takes no login token, and nothing about the request (IP address, proof)
  is logged. The relay log keeps only election, transaction hash, outcome, gas and latency.
- **Remaining risk:** the server that receives a ballot also sees the request's IP address and
  timing. A malicious server operator could try to correlate those with logins. Running the
  relayer separately from the login server, or submitting through Tor, would reduce this.
  Worth stating as a limitation in the report.

## Setup (Windows, Git Bash)

1. **Install packages.** From the project root, run `npm run setup`. It installs the root, backend and frontend packages.

2. **Create `.env`.** Copy `.env.example` to `.env` in this folder and fill in:
   - `JWT_SECRET`: generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `DB_SERVER`, `DB_USER`, `DB_PASSWORD`: your SQL Server login (the same one you use in SSMS).
     SQL Server must accept SQL logins and TCP connections on port 1433. If connecting fails, enable
     *TCP/IP* in SQL Server Configuration Manager and restart the SQL Server service.
   - The blockchain keys in `.env.example` already match the local Hardhat node.

3. **Create the database and tables:** `npm run db:init`. This creates a new `voting_v2`
   database and leaves your diploma `VotingDB` database untouched.

4. **Create an admin account:**
   `npm run create-admin -- admin@knust.edu.gh "Election Officer" "a-strong-password"`

5. **Run it.** Use three Git Bash terminals:
   ```bash
   # terminal 1 (project root): local blockchain
   npm run node
   # terminal 2 (project root): deploy the contracts
   npm run deploy:local
   # terminal 3 (voting-backend): the API
   npm run dev
   ```
   The API runs at http://localhost:5000. Check http://localhost:5000/api/health.

   The local Hardhat chain starts empty every time you restart it. After restarting
   `npm run node`, run `npm run deploy:local` again (terminal 2), and clear the old elections
   from the database with `npm run db:reset` (in `voting-backend`). Accounts are kept.

   **Without SQL Server:** `npm run demo` instead of `npm run dev` runs the API with an in-memory
   database (lost when it stops). Log in as `admin@demo.test` / `demo-admin-123`.

   The frontend's README explains how to start the website.

## Blockchain timing

A blockchain's clock only moves when a block is mined. `npm run node` mines a block every
3 seconds, like a real network. The backend also corrects for small lags: if the current time is
past the opening time but the latest block isn't yet, it reports voting as open
(`effectivePhase` in `electionService.js`). Ballots themselves are always checked by the
contract against the time of the block they're mined in.

## Tests

From the project root:

```bash
npm run test:backend   # API + relayer against a local chain, plus database tests (in-memory)
npm run test:db        # the same database tests against YOUR SQL Server (uses a separate <DB_NAME>_test database)
```

Run `npm run test:db` once after setting up `.env`, to confirm the SQL Server queries work on your machine.

## Code layout

```
src/
  server.js              starts the API with SQL Server + blockchain
  app.js                 builds the Express app (used by server.js and the tests)
  config.js              reads .env
  errors.js              error types and handler
  auth/auth.js           JWT login tokens, requireAuth / requireAdmin
  db/schema.sql          SQL Server tables
  db/mssqlRepository.js  every SQL query
  db/memoryRepository.js same interface, in memory, for tests and demo mode
  chain/votingClient.js  talks to VotingV2 (simulates before sending, decodes errors)
  chain/provider.js      blockchain connection (response cache off, see the comment)
  services/electionService.js  publish, add voters, cancel, results, phase correction
  services/relayService.js     submits anonymous ballots, logs performance
  routes/                HTTP endpoints
scripts/
  initDb.js       npm run db:init       create the database and tables
  resetDb.js      npm run db:reset      clear elections, keep accounts
  createAdmin.js  npm run create-admin  create an election officer account
  demoServer.js   npm run demo          run without SQL Server
```
