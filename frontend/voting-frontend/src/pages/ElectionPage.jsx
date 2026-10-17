import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatWindow, relative } from "../lib/format";
import { backupFile, createIdentity, importBackup, loadIdentity, loadReceipt, saveReceipt } from "../lib/identity";
import Results from "../components/Results";
import Avatar from "../components/Avatar";
import Thumbprint from "../components/Thumbprint";
import { Check, ErrorNotice, Notice, PageLoading, PhaseTrack, Spinner, StatusTag, useAction, useLoad } from "../components/ui";

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
      <Link to="/" className="back-link">All elections</Link>
      <header className="mt-4">
        <StatusTag status={election.status} />
        <h1 className="mt-3 max-w-2xl">{election.title}</h1>
        {election.description && <p className="mt-3 max-w-prose text-lg text-muted">{election.description}</p>}
        <p className="mt-3 text-[0.9375rem]">
          <span className="text-muted">Voting</span> {formatWindow(election.startTime, election.endTime)}
        </p>
        <div className="mt-8 max-w-xl">
          <PhaseTrack election={election} />
        </div>
        {user?.role === "admin" && (
          <Link to={`/admin/elections/${electionId}`} className="btn-link mt-3 inline-block text-sm">Manage this election</Link>
        )}
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <div>
          {election.status === "cancelled" ? (
            <Notice title="This election was cancelled." />
          ) : !user ? (
            <Notice tone="accent">
              <Link to="/login" state={{ from: location.pathname }} className="btn-link">Log in</Link> or{" "}
              <Link to="/register" className="btn-link">create an account</Link> to register and vote.
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
            <div className="panel p-6">
              <Results electionId={electionId} refreshMs={election.status === "open" ? 10_000 : 0} />
            </div>
          ) : (
            <CandidateList candidates={candidates} />
          )}
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
        <ul className="group-list mt-4">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={c.name} photoUrl={c.photoUrl} size="md" />
              <span className="min-w-0">
                <span className="block font-semibold leading-tight tracking-tight">{c.name}</span>
                {c.party && <span className="block text-sm text-muted">{c.party}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
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
        <p className="mt-2 text-muted">Register from the device you'll vote on.</p>
        <button type="button" className="btn-primary mt-4" disabled={busy} onClick={register}>
          {busy ? "Registering…" : "Register for this election"}
        </button>
        <ErrorNotice error={error} className="mt-4" />
      </section>
    );
  }

  const opens = relative(election.startTime);
  const status = registration.onChain
    ? { tone: "good", title: "You're on the voter list.", body: `Voting opens ${opens}.` }
    : registration.status === "approved"
      ? { tone: "good", title: "Your registration is approved.", body: "You'll be added to the voter list soon." }
      : registration.status === "rejected"
        ? { tone: "bad", title: "Your registration wasn't approved.", body: "Contact the election officer if this is a mistake." }
        : { tone: "info", title: "Waiting for approval.", body: null };

  return (
    <section aria-labelledby="reg" className="space-y-5">
      <h2 id="reg">Your registration</h2>
      <Notice tone={status.tone} title={status.title}>{status.body}</Notice>

      {keyMatches ? (
        registration.status !== "rejected" && (
          <div className="panel p-6">
            <h3>Back up your voter key</h3>
            <p className="mt-1 text-sm text-muted">Needed to vote from another device. Keep it private.</p>
            <button type="button" className="btn-secondary mt-4" onClick={() => downloadBackup(identity, election)}>
              Download backup file
            </button>
          </div>
        )
      ) : (
        <div className="panel space-y-4 p-6">
          <Notice tone="warn" title="This browser doesn't have your voter key." />
          <RestoreBackup election={election} user={user} registration={registration} onRestored={setIdentity} />
          {!registration.onChain && registrationOpen && (
            <div>
              <p className="text-sm text-muted">No backup? Register again here. Your old key will stop working.</p>
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
  const { data: chain } = useLoad(() => api.getChain(), []);
  if (receipt.already) {
    return (
      <Notice tone="good" title="You've already voted in this election." />
    );
  }
  return (
    <Notice tone="good" title="Your ballot was counted.">
      {receipt.txHash && (
        <p>
          Transaction <code className="break-all text-xs">{receipt.txHash}</code>
        </p>
      )}
      {receipt.txHash && chain?.explorerUrl && (
        <p className="mt-1">
          <a className="btn-link" href={`${chain.explorerUrl}/tx/${receipt.txHash}`} target="_blank" rel="noreferrer">
            View it on the blockchain
          </a>
        </p>
      )}
    </Notice>
  );
}

function BallotSection({ election, candidates, registration, user }) {
  const [identity, setIdentity] = useLocalIdentity(user.id, election.id);
  const [receipt, setReceipt] = useState(() => loadReceipt(user.id, election.id));

  if (receipt) return <Receipt receipt={receipt} />;
  if (!registration || !registration.onChain) {
    return (
      <Notice title="You're not on the voter list for this election." />
    );
  }
  if (!identity || identity.commitment.toString() !== registration.commitment) {
    return (
      <div className="space-y-4">
        <Notice tone="warn" title="This browser doesn't have your voter key." />
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
          <div className="absolute inset-x-8 top-10 -z-0 h-40 rounded-2xl bg-accent-wash shadow-soft ring-1 ring-accent/20" aria-hidden="true">
            <div className="animate-flap h-16 rounded-t-2xl border-b border-accent/25 bg-accent-wash" />
          </div>
        )}

        <form
          className={`relative overflow-hidden rounded-[1.25rem] bg-sheet shadow-lift ring-1 ring-ink/5 ${sealed ? "animate-seal" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (choice !== null) setConfirming(true);
          }}
        >
          <div className="border-b border-ink/15 px-6 pb-4 pt-5">
            <p className="text-xs font-medium text-muted">Ballot paper</p>
            <h2 id="ballot-heading" className="mt-0.5 text-xl">{election.title}</h2>
          </div>

          <fieldset disabled={working || confirming}>
            <legend className="sr-only">Choose one candidate</legend>
            <p className="px-6 pb-2 pt-4 text-sm text-muted">Thumbprint the box beside one candidate.</p>
            <div>
              {candidates.map((c, i) => {
                const selected = choice === c.chainIndex;
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-stretch border-t border-ink/15 transition-colors duration-200 first:border-t-0 motion-reduce:transition-none ${selected ? "bg-accent-wash/60" : "hover:bg-paper/70"}`}
                  >
                    <input
                      type="radio"
                      name="candidate"
                      value={c.chainIndex}
                      checked={selected}
                      onChange={() => setChoice(c.chainIndex)}
                      className="peer sr-only"
                    />
                    <span className="grid w-12 shrink-0 place-items-center text-sm font-medium text-muted tabular-nums" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-3.5 py-4">
                      <Avatar name={c.name} photoUrl={c.photoUrl} size="lg" />
                      <span className="min-w-0">
                        <span className="block text-lg font-semibold leading-tight tracking-tight">{c.name}</span>
                        {c.party && <span className="mt-0.5 block text-sm text-muted">{c.party}</span>}
                      </span>
                    </span>
                    <span
                      className={`my-3 mr-4 grid w-16 shrink-0 place-items-center rounded-xl border bg-sheet text-accent transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent/55 motion-reduce:transition-none sm:w-20 ${
                        selected ? "border-accent/40" : "border-ink/20"
                      }`}
                      aria-hidden="true"
                    >
                      {selected && <Thumbprint className="animate-press h-14 w-12 -rotate-6" />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="border-t border-ink/15 bg-paper/60 px-6 py-5">
            {!confirming ? (
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={choice === null}>
                Cast ballot
              </button>
            ) : !working ? (
              <div>
                <p className="font-semibold">You're voting for {chosen?.name}.</p>
                <p className="text-sm text-muted">A ballot can't be changed once it's cast.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={cast}>Confirm and cast</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Change my choice</button>
                </div>
              </div>
            ) : (
              <ol className="space-y-2.5 text-sm" aria-live="polite">
                {STEPS.map((s, i) => {
                  const current = STEPS.findIndex((x) => x.key === step);
                  const state = i < current ? "done" : i === current ? "active" : "todo";
                  return (
                    <li key={s.key} className={`flex items-center gap-2.5 ${state === "todo" ? "text-muted" : ""}`}>
                      {state === "done" ? (
                        <span className="grid size-4 place-items-center rounded-full bg-good text-white">
                          <Check className="size-3" />
                          <span className="sr-only">Done:</span>
                        </span>
                      ) : state === "active" ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-rule border-t-accent motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <span className="size-4 rounded-full border-2 border-rule" aria-hidden="true" />
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
