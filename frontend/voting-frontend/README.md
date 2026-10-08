# Voting frontend

React + Vite + Tailwind web app for voters and election officers. It only talks to the
backend (`/api`, forwarded to http://localhost:5000); it never connects to the blockchain itself.

```bash
npm install
npm run dev       # http://localhost:3000 (the backend must be running)
npm run build     # production build in dist/
```

`npm run dev` and `npm run build` first copy the zero-knowledge proving files from
`@zk-kit/semaphore-artifacts` into `public/semaphore` (about 65 MB, git-ignored), so voting works
without downloading them from the internet.

## Where things are

```
src/
  main.jsx                 routes
  lib/api.js               backend calls; ballots are sent with no login or cookies
  lib/identity.js          voter keys: create, store in this browser, backup file, restore
  lib/ballot.js            builds the zero-knowledge proof and submits the ballot
  lib/auth.jsx             login state
  pages/ElectionsPage.jsx  list of elections
  pages/ElectionPage.jsx   register, ballot paper, receipt, results
  pages/AuthPages.jsx      log in, create account
  pages/admin/             election officer screens
  components/              layout, results bars, shared UI
```

## Privacy notes

- The voter's secret key is created and kept in the browser (`localStorage`). Only the public
  commitment is sent to the server. The backup file contains the secret, so voters must keep it private.
- The ballot request is sent with `credentials: "omit"` and no `Authorization` header.
- After voting, the browser stores only the transaction hash, not the voter's choice.
- Before proving, the browser checks that the voter list from the server matches the root stored on-chain.
