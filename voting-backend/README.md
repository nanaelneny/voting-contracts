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

1. **Install packages.** From the project root, `npm install` also installs this folder's packages.

2. **Create `.env`.** Copy `.env.example` to `.env` in this folder and fill in:
   - `JWT_SECRET`: generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `DB_SERVER`, `DB_USER`, `DB_PASSWORD`: your SQL Server login (the same one you use in SSMS).
     SQL Server must accept SQL logins and TCP connections on port 1433. If connecting fails, enable
     *TCP/IP* in SQL Server Configuration Manager and restart the SQL Server service.
   - The blockchain keys in `.env.example` already match the local Hardhat node.

3. **Create the database and tables:** `npm run db:init`. This creates a new `voting_v2`
   database and leaves your diploma `voting_system` database untouched.

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

   The local Hardhat chain starts empty every time you restart it, so after restarting
   `npm run node`, redeploy (step 2). Elections published before the restart no longer
   exist on-chain, so reset the database too by running the `DELETE` statements in
   `test/backend/repository.test.js` against `voting_v2`, or drop and re-create it.

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
  db/memoryRepository.js same interface, in memory, for tests
  chain/votingClient.js  talks to VotingV2 (simulates before sending, decodes errors)
  services/electionService.js  publish, add voters, cancel, results
  services/relayService.js     submits anonymous ballots, logs performance
  routes/                HTTP endpoints
scripts/initDb.js, scripts/createAdmin.js
```
