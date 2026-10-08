import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatWindow, relative } from "../lib/format";
import { backupFile, createIdentity, importBackup, loadIdentity, loadReceipt, saveReceipt } from "../lib/identity";
import Results from "../components/Results";
import { ErrorNotice, Notice, PageLoading, Spinner, StatusTag, useAction, useLoad } from "../components/ui";

const PUBLISHED = ["upcoming", "open", "closed"];

export default function ElectionPage() {
  const { id } = useParams();
  const electionId = Number(id);
  const { user } = useAuth();
  const location = useLocation();

  const detail = useLoad(() => api.getElection(electionId), [electionId]);
  const reg = useLoad(() => (user ? api.getMyRegistration(electionId) : Promise.resolve({ registration: null })), [electionId, user?.id]);

  if (detail.loading) return <PageLoading />;
  if (detail.error) return <ErrorNotice error={detail.error} />;

  const { election, candidates } = detail.data;
  const registration = reg.data?.registration ?? null;

  return (
    <div>
      <Link to="/" className="text-sm font-semibold text-muted hover:text-ink">All elections</Link>
      <header className="mt-3 border-b border-rule pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl">{election.title}</h1>
          <StatusTag status={election.status} />
        </div>
        {election.description && <p className="mt-3 max-w-prose text-muted">{election.description}</p>}
        <p className="mt-3 text-sm">
          <span className="font-semibold">Voting:</span> {formatWindow(election.startTime, election.endTime)}
        </p>
        {user?.role === "admin" && (
          <Link to={`/admin/elections/${electionId}`} className="btn-link mt-3 inline-block text-sm">Manage this election</Link>
        )}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {election.status === "cancelled" ? (
            <Notice title="This election was cancelled.">No voting will take place.</Notice>
          ) : !user ? (
            <Notice tone="violet" title="Log in to take part">
              <p>
                You need an account to register for this election and to vote.{" "}
                <Link to="/login" state={{ from: location.pathname }} className="btn-link">Log in</Link> or{" "}
                <Link to="/register" className="btn-link">create an account</Link>.
              </p>
            </Notice>
          ) : reg.loading ? (
            <Spinner />
          ) : reg.error ? (
            <ErrorNotice error={reg.error} />
          ) : election.status === "open" ? (
            <BallotSection election={election} candidates={candidates} registration={registration} user={user} />
          ) : election.status === "closed" ? (
            <ClosedSection election={election} user={user} />
          ) : (
            <RegistrationSection election={election} registration={registration} user={user} onChange={reg.reload} />
          )}
        </div>

        <aside className="space-y-8">
          {PUBLISHED.includes(election.status) ? (
            <div className="panel p-5">
              <Results electionId={electionId} refreshMs={election.status === "open" ? 10_000 : 0} />
            </div>
          ) : (
            <CandidateList candidates={candidates} />
          )}
          <HowItWorks />
        </aside>
      </div>
    </div>
  );
}

function CandidateList({ candidates }) {
  return (
    <section aria-labelledby="cands">
      <h2 id="cands">Candidates</h2>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Candidates haven't been announced yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {candidates.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.name}</span>
              {c.party && <span className="block text-sm text-muted">{c.party}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how" className="text-sm text-muted">
      <h2 id="how" className="text-base text-ink">How your ballot stays secret</h2>
      <p className="mt-2">
        When you register, this browser creates a private voter key. Only a public fingerprint of it is sent to the
        election officer.
      </p>
      <p className="mt-2">
        When you vote, your browser proves you hold one of the registered keys without revealing which one. The ballot
        is sent without your login, so it can't be traced back to you, and the proof stops anyone voting twice.
      </p>
    </section>
  );
}

// ─────────────────────────────── Registration ───────────────────────────────

function useLocalIdentity(userId, electionId) {
  const [identity, setIdentity] = useState(() => loadIdentity(userId, electionId));
  return [identity, setIdentity];
}

function downloadBackup(identity, election) {
  const url = URL.createObjectURL(backupFile(identity, election.id, election.title));
  const a = document.createElement("a");
  a.href = url;
  a.download = `voter-key-election-${election.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RestoreBackup({ election, user, registration, onRestored }) {
  const input = useRef(null);
  const { busy, error, run } = useAction();
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Voter key backup file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) run(async () => onRestored(await importBackup(file, user.id, election.id, registration?.commitment)));
        }}
      />
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
        Restore from backup file
      </button>
      <ErrorNotice error={error} className="mt-3" />
    </div>
  );
}

function RegistrationSection({ election, registration, user, onChange }) {
  const [identity, setIdentity] = useLocalIdentity(user.id, election.id);
  const { busy, error, run } = useAction();
  const registrationOpen = new Date() < new Date(election.startTime);
  const keyMatches = identity && registration && identity.commitment.toString() === registration.commitment;

  const register = () =>
    run(async () => {
      const fresh = createIdentity(user.id, election.id);
      await api.registerForElection(election.id, fresh.commitment.toString());
      setIdentity(fresh);
      await onChange();
    });

  if (!registration) {
    if (!registrationOpen) return <Notice title="Registration has closed for this election." />;
    return (
      <section aria-labelledby="reg">
        <h2 id="reg">Register to vote</h2>
        <p className="mt-2 max-w-prose text-muted">
          Registering creates your private voter key in this browser and asks the election officer to add you to the
          voter list. Register on the device you plan to vote from, or keep the backup file we'll offer you.
        </p>
        <button type="button" className="btn-primary mt-5" disabled={busy} onClick={register}>
          {busy ? "Registering…" : "Register for this election"}
        </button>
        <ErrorNotice error={error} className="mt-4" />
      </section>
    );
  }

  const opens = relative(election.startTime);
  const status = registration.onChain
    ? { tone: "good", title: "You're on the voter list.", body: `Voting opens ${opens}, on ${formatDateTime(election.startTime)}. Come back then to cast your ballot.` }
    : registration.status === "approved"
      ? { tone: "good", title: "Your registration is approved.", body: "You'll be added to the voter list when the election officer publishes it." }
      : registration.status === "rejected"
        ? { tone: "bad", title: "Your registration wasn't approved.", body: "Contact the election officer if you think this is a mistake." }
        : { tone: "info", title: "Waiting for approval.", body: "The election officer will check your registration before voting opens." };

  return (
    <section aria-labelledby="reg" className="space-y-5">
      <h2 id="reg">Your registration</h2>
      <Notice tone={status.tone} title={status.title}>{status.body}</Notice>

      {keyMatches ? (
        registration.status !== "rejected" && (
          <div className="panel p-5">
            <h3>Back up your voter key</h3>
            <p className="mt-1 text-sm text-muted">
              Your key is stored only in this browser. To vote from another device, or if you clear your browser data,
              you'll need this file. Keep it private: anyone with it can cast your ballot.
            </p>
            <button type="button" className="btn-secondary mt-4" onClick={() => downloadBackup(identity, election)}>
              Download backup file
            </button>
          </div>
        )
      ) : (
        <div className="panel space-y-4 p-5">
          <Notice tone="warn" title="This browser doesn't have your voter key.">
            You registered from another device or browser, or this browser's data was cleared.
          </Notice>
          <RestoreBackup election={election} user={user} registration={registration} onRestored={setIdentity} />
          {!registration.onChain && registrationOpen && (
            <div>
              <p className="text-sm text-muted">No backup? You can register again from this browser. Your old key stops working.</p>
              <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={register}>
                Register again from this browser
              </button>
            </div>
          )}
          <ErrorNotice error={error} />
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────── Voting ─────────────────────────────────

function Receipt({ receipt }) {
  if (receipt.already) {
    return (
      <Notice tone="good" title="A ballot has already been cast with your voter key.">
        Each voter can cast one ballot per election, so your ballot is already counted.
      </Notice>
    );
  }
  return (
    <Notice tone="good" title="Your ballot was counted.">
      <p>It was recorded on the blockchain {receipt.at ? `on ${formatDateTime(receipt.at)}` : ""}.</p>
      {receipt.txHash && (
        <p className="mt-1">
          Transaction <code className="break-all text-xs">{receipt.txHash}</code>
        </p>
      )}
      <p className="mt-2">Your choice isn't stored in this browser or linked to your account.</p>
    </Notice>
  );
}

function BallotSection({ election, candidates, registration, user }) {
  const [identity, setIdentity] = useLocalIdentity(user.id, election.id);
  const [receipt, setReceipt] = useState(() => loadReceipt(user.id, election.id));

  if (receipt) return <Receipt receipt={receipt} />;
  if (!registration || !registration.onChain) {
    return (
      <Notice title="You're not on the voter list for this election.">
        Only students who registered and were approved before voting opened can vote.
      </Notice>
    );
  }
  if (!identity || identity.commitment.toString() !== registration.commitment) {
    return (
      <div className="space-y-4">
        <Notice tone="warn" title="This browser doesn't have your voter key.">
          Restore it from the backup file you downloaded when you registered.
        </Notice>
        <RestoreBackup election={election} user={user} registration={registration} onRestored={setIdentity} />
      </div>
    );
  }

  return (
    <BallotPaper
      election={election}
      candidates={candidates}
      identity={identity}
      onCast={(r) => {
        saveReceipt(user.id, election.id, r);
        setReceipt(r);
      }}
    />
  );
}

const STEPS = [
  { key: "verify", label: "Checking the voter list against the blockchain" },
  { key: "prove", label: "Sealing your ballot with a zero-knowledge proof" },
  { key: "submit", label: "Submitting it anonymously to be counted" },
];

function BallotPaper({ election, candidates, identity, onCast }) {
  const [choice, setChoice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState(null);
  const [sealed, setSealed] = useState(null);
  const [error, setError] = useState(null);
  const working = step !== null && !sealed;
  const chosen = candidates.find((c) => c.chainIndex === choice);

  useEffect(() => {
    if (!sealed) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => onCast(sealed), reduce ? 0 : 1300);
    return () => clearTimeout(t);
  }, [sealed, onCast]);

  const cast = async () => {
    setError(null);
    try {
      // The proof library is large, so it's only downloaded when someone casts a ballot.
      const { castBallot } = await import("../lib/ballot");
      const res = await castBallot({ electionId: election.id, identity, candidateIndex: choice, onStep: setStep });
      setSealed({ txHash: res.txHash, at: new Date().toISOString() });
    } catch (err) {
      setStep(null);
      setConfirming(false);
      if (err.code === "ALREADY_VOTED") {
        onCast({ txHash: null, at: null, already: true });
        return;
      }
      setError(err);
    }
  };

  return (
    <section aria-labelledby="ballot-heading">
      <div className="relative max-w-xl" style={{ perspective: "800px" }}>
        {/* The envelope the ballot drops into once it's sealed */}
        {sealed && (
          <div className="absolute inset-x-6 top-10 -z-0 h-40 rounded-md border-2 border-ink bg-violet-wash" aria-hidden="true">
            <div className="animate-flap h-16 rounded-t-md border-b-2 border-ink bg-violet-wash" />
          </div>
        )}

        <form
          className={`relative border-2 border-ink bg-sheet shadow-[6px_6px_0_var(--color-rule)] ${sealed ? "animate-seal" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (choice !== null) setConfirming(true);
          }}
        >
          <div className="border-b-2 border-ink px-5 py-4">
            <h2 id="ballot-heading" className="text-lg">Ballot paper</h2>
            <p className="text-sm text-muted">{election.title}</p>
          </div>

          <fieldset disabled={working || confirming} className="px-5 py-4">
            <legend className="sr-only">Choose one candidate</legend>
            <p className="mb-3 text-sm font-semibold">Mark one candidate.</p>
            <div className="divide-y divide-rule border-y border-rule">
              {candidates.map((c) => {
                const selected = choice === c.chainIndex;
                return (
                  <label key={c.id} className={`flex cursor-pointer items-center gap-4 py-3.5 ${selected ? "bg-violet-wash/60" : ""}`}>
                    <input
                      type="radio"
                      name="candidate"
                      value={c.chainIndex}
                      checked={selected}
                      onChange={() => setChoice(c.chainIndex)}
                      className="peer sr-only"
                    />
                    <span className="min-w-0 flex-1 pl-1">
                      <span className="block font-semibold">{c.name}</span>
                      {c.party && <span className="block text-sm text-muted">{c.party}</span>}
                    </span>
                    <span
                      className="mr-1 grid size-9 shrink-0 place-items-center border-2 border-ink bg-sheet peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet"
                      aria-hidden="true"
                    >
                      {selected && (
                        <svg viewBox="0 0 24 24" className="size-7">
                          <path d="M4 13l5 5L20 6" fill="none" stroke="var(--color-violet)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="border-t-2 border-ink px-5 py-4">
            {!confirming ? (
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={choice === null}>
                Cast ballot
              </button>
            ) : !working ? (
              <div>
                <p className="font-semibold">You're voting for {chosen?.name}.</p>
                <p className="text-sm text-muted">A ballot can't be changed once it's cast.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={cast}>Confirm and cast</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Change my choice</button>
                </div>
              </div>
            ) : (
              <ol className="space-y-2 text-sm" aria-live="polite">
                {STEPS.map((s, i) => {
                  const current = STEPS.findIndex((x) => x.key === step);
                  const state = i < current ? "done" : i === current ? "active" : "todo";
                  return (
                    <li key={s.key} className={`flex items-center gap-2 ${state === "todo" ? "text-muted" : ""}`}>
                      {state === "done" ? (
                        <span className="text-good" aria-label="done">✓</span>
                      ) : state === "active" ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-rule border-t-violet motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <span className="size-3.5 rounded-full border-2 border-rule" aria-hidden="true" />
                      )}
                      {s.label}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </form>
      </div>
      {sealed && <p className="sr-only" role="status">Ballot accepted.</p>}
      <ErrorNotice error={error} className="mt-4 max-w-xl" />
    </section>
  );
}

function ClosedSection({ election, user }) {
  const receipt = loadReceipt(user.id, election.id);
  return (
    <div className="space-y-4">
      <Notice title="Voting has closed." />
      {receipt && <Receipt receipt={receipt} />}
    </div>
  );
}
