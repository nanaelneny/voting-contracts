// The voter's secret identity for an election.
//
// It is created in the browser and its secret never leaves this device. Only the
// public "commitment" is sent to the server when registering. Each election gets its
// own identity, so registrations in different elections can't be linked by commitment.
//
// The secret is kept in this browser's storage. If it's lost (cleared browser data,
// a different device), the voter can't vote unless they saved a backup, or re-register
// before the election is published to the blockchain.
import { Identity } from "@semaphore-protocol/identity";

const key = (userId, electionId) => `secret-ballot:identity:${userId}:${electionId}`;
const receiptKey = (userId, electionId) => `secret-ballot:receipt:${userId}:${electionId}`;

function read(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

export function loadIdentity(userId, electionId) {
  const saved = read(key(userId, electionId));
  if (!saved) return null;
  try {
    return Identity.import(saved);
  } catch {
    return null;
  }
}

export function createIdentity(userId, electionId) {
  const identity = new Identity();
  if (!write(key(userId, electionId), identity.export())) {
    throw new Error("This browser won't let the app save data (private mode?). Use a normal window to register.");
  }
  return identity;
}

/** A small file the voter can keep, to vote from another device or after clearing the browser. */
export function backupFile(identity, electionId, electionTitle) {
  const content = JSON.stringify(
    {
      app: "secret-ballot",
      electionId,
      electionTitle,
      commitment: identity.commitment.toString(),
      secret: identity.export(),
      note: "Keep this file private. Anyone who has it can cast your ballot in this election.",
    },
    null,
    2
  );
  return new Blob([content], { type: "application/json" });
}

/** Restores an identity from a backup file. Returns it if it matches the registered commitment. */
export async function importBackup(file, userId, electionId, expectedCommitment) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a voter backup.");
  }
  if (data.app !== "secret-ballot" || !data.secret) throw new Error("That file isn't a voter backup.");
  if (Number(data.electionId) !== Number(electionId)) throw new Error("That backup is for a different election.");

  const identity = Identity.import(data.secret);
  if (expectedCommitment && identity.commitment.toString() !== expectedCommitment) {
    throw new Error("That backup doesn't match your registration for this election.");
  }
  write(key(userId, electionId), identity.export());
  return identity;
}

// The receipt records only that a ballot was accepted and its transaction id, not the choice,
// so someone else using this browser can't see how the voter voted.
export function saveReceipt(userId, electionId, receipt) {
  write(receiptKey(userId, electionId), JSON.stringify(receipt));
}

export function loadReceipt(userId, electionId) {
  try {
    return JSON.parse(read(receiptKey(userId, electionId)));
  } catch {
    return null;
  }
}
