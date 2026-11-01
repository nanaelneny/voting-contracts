import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatWindow, relative, shortHash } from "../lib/format";
import { backupFile, createIdentity, hasBackup, importBackup, loadIdentity, loadReceipt, markBackedUp, saveReceipt } from "../lib/identity";
import Results from "../components/Results";
import Avatar from "../components/Avatar";
import Thumbprint from "../components/Thumbprint";
import { Check, EmptyState, ErrorNotice, Notice, PageLoading, PhaseTrack, Spinner, StatusTag, useAction, useLoad } from "../components/ui";

const PUBLISHED = ["upcoming", "open", "closed"];

export default function ElectionPage() {
  const { id } = useParams();
  const electionId = Number(id);
  const { user } = useAuth();
  const location = useLocation();

  const detail = useLoad(() => api.getElection(electionId), [electionId]);
  const reg = useLoad(() => (user ? api.getMyRegistration(electionId) : Promise.resolve({ registration: null })), [electionId, user?.id]);
  const [resultsKey, setResultsKey] = useState(0);

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
            <BallotSection election={election} candidates={candidates} registration={registration} user={user} onVoted={() => setResultsKey((k) => k + 1)} />
          ) : election.status === "closed" ? (
            <ClosedSection election={election} user={user} />
          ) : (
            <RegistrationSection election={election} registration={registration} user={user} onChange={reg.reload} />
          )}
        </div>

        <aside className="space-y-8">
          {PUBLISHED.includes(election.status) ? (
            <div className="panel p-6">
              <Results key={resultsKey} electionId={electionId} refreshMs={election.status === "open" ? 10_000 : 0} />
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
        <EmptyState icon="person" title="No candidates yet" className="mt-4">They'll appear here once the election officer announces them.</EmptyState>
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

/**
 * Where the voter's registration has got to, as a short timeline:
 * registered → approved → on the voter list → vote.
 */
function RegistrationTrack({ election, registration }) {
  const rejected = registration.status === "rejected";
  const approved = registration.status === "approved";
  const steps = [
    { label: "Registered", detail: "Your browser made your voter key", state: "done" },
    {
      label: rejected ? "Not approved" : "Approved by the election officer",
      detail: rejected ? "Contact the election officer if this is a mistake" : approved ? "Done" : "Waiting for the officer to check your details",
      state: rejected ? "failed" : approved ? "done" : "now",
    },
    {
      label: "Added to the voter list",
      detail: registration.onChain ? "Recorded on the blockchain" : "When the election is published",
      state: registration.onChain ? "done" : approved ? "now" : "later",
    },
    { label: "Vote", detail: `Voting opens ${relative(election.startTime)}`, state: "later" },
  ];
  const visible = rejected ? steps.slice(0, 2) : steps;

  return (
    <ol className="panel p-6" aria-label="Registration progress">
      {visible.map((s, i) => (
        <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0" aria-current={s.state === "now" ? "step" : undefined}>
          {i < visible.length - 1 && (
            <span className={`absolute left-[11px] top-7 bottom-1 w-0.5 rounded-full ${s.state === "done" ? "bg-good/40" : "bg-rule"}`} aria-hidden="true" />
          )}
          <span
            className={`relative grid size-6 shrink-0 place-items-center rounded-full ${
              s.state === "done" ? "bg-good text-white"
              : s.state === "failed" ? "bg-bad text-white"
              : s.state === "now" ? "border-2 border-accent bg-sheet"
              : "border-2 border-rule bg-sheet"
            }`}
            aria-hidden="true"
          >
            {s.state === "done" && <Check className="size-3.5" />}
            {s.state === "failed" && <span className="text-sm font-bold leading-none">!</span>}
            {s.state === "now" && <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />}
          </span>
          <div className="-mt-0.5">
            <p className={`font-semibold ${s.state === "later" ? "text-muted" : s.state === "failed" ? "text-bad" : ""}`}>
              {s.label}
              <span className="sr-only">{{ done: " (done)", now: " (in progress)", failed: "", later: " (not yet)" }[s.state]}</span>
            </p>
            <p className="text-sm text-muted">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function KeyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="16.5" r="4" />
      <path d="M10.4 13.6 20 4M16.5 7.5l2.5 2.5M13.8 10.2l1.8 1.8" />
    </svg>
  );
}

/** The backup card. Loud until the voter has downloaded a backup, then quiet. */
function BackupCard({ election, user, identity }) {
  const [saved, setSaved] = useState(() => hasBackup(user.id, election.id, identity));
  const download = () => {
    downloadBackup(identity, election);
    markBackedUp(user.id, election.id, identity);
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-good-wash px-5 py-4" role="status">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-good text-white" aria-hidden="true">
          <Check className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-good">Voter key backed up</p>
          <p className="text-sm text-muted">Keep the file private. Anyone who has it can vote in your place.</p>
        </div>
        <button type="button" className="btn-link text-sm" onClick={download}>Download again</button>
      </div>
    );
  }

  return (
    <div className="panel p-6">
      <div className="flex gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warn-wash text-warn">
          <KeyIcon className="size-6" />
        </span>
        <div>
          <h3>Back up your voter key</h3>
          <p className="mt-1 text-[0.9375rem] text-muted">
            Your key lives only in this browser. Without a backup, you can't vote from another device or after clearing your browser.
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-good" />Save the file somewhere only you can open</li>
        <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-good" />Don't send it to anyone: whoever has it can vote in your place</li>
      </ul>
      <button type="button" className="btn-primary mt-6 w-full sm:w-auto" onClick={download}>
        Download backup file
      </button>
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
      <section aria-labelledby="reg" className="panel p-6 sm:p-7">
        <h2 id="reg">Register to vote</h2>
        <p className="mt-2 text-muted">
          Your browser will make a private voter key for this election. It never leaves this device, so register from the device you'll vote on.
        </p>
        <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} onClick={register}>
          {busy ? "Registering…" : "Register for this election"}
        </button>
        <ErrorNotice error={error} className="mt-4" />
      </section>
    );
  }

  return (
    <section aria-labelledby="reg" className="space-y-5">
      <h2 id="reg">Your registration</h2>
      <RegistrationTrack election={election} registration={registration} />

      {keyMatches ? (
        registration.status !== "rejected" && <BackupCard election={election} user={user} identity={identity} />
      ) : (
        <MissingKey election={election} user={user} registration={registration} onRestored={setIdentity}>
          {!registration.onChain && registrationOpen && (
            <div className="border-t border-rule pt-4">
              <p className="text-sm text-muted">No backup? Register again here. Your old key will stop working.</p>
              <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={register}>
                Register again from this browser
              </button>
            </div>
          )}
          <ErrorNotice error={error} />
        </MissingKey>
      )}
    </section>
  );
}

/** Shown when the voter is registered but this browser doesn't hold their key. */
function MissingKey({ election, user, registration, onRestored, children }) {
  return (
    <div className="panel space-y-4 p-6">
      <div className="flex gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warn-wash text-warn">
          <KeyIcon className="size-6" />
        </span>
        <div>
          <h3>This browser doesn't have your voter key</h3>
          <p className="mt-1 text-[0.9375rem] text-muted">Open the backup file you downloaded when you registered.</p>
        </div>
      </div>
      <RestoreBackup election={election} user={user} registration={registration} onRestored={onRestored} />
      {children}
    </div>
  );
}

// ───────────────────────────────── Voting ─────────────────────────────────

/** The receipt's mark: the blue thumbprint in a seal, with a tick. */
function SealMark({ tone = "accent" }) {
  return (
    <span className="relative mx-auto grid size-20 place-items-center rounded-full bg-accent-wash text-accent" aria-hidden="true">
      <Thumbprint className="animate-press h-12 w-10 -rotate-6" />
      <span className={`animate-pop absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full text-white ring-4 ring-sheet ${tone === "good" ? "bg-good" : "bg-accent"}`}>
        <Check className="size-4" />
      </span>
    </span>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-full bg-fill px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-rule"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the full value is still selectable on the page */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> {label}</span>
    </button>
  );
}

function Receipt({ receipt, election, fresh = false }) {
  const { data: chain } = useLoad(() => api.getChain(), []);
  const heading = useRef(null);

  // Right after voting, move focus to the receipt so screen readers announce it
  // (the ballot it replaces had focus) and the page scrolls to it.
  useEffect(() => {
    if (fresh) heading.current?.focus();
  }, [fresh]);

  if (receipt.already) {
    return (
      <section aria-labelledby="receipt-heading" className="panel px-6 py-10 text-center">
        <SealMark tone="good" />
        <h2 id="receipt-heading" ref={heading} tabIndex={-1} className="mt-6 text-2xl focus:outline-none">You've already voted</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">This election has already counted a ballot from you. Each voter can cast one.</p>
      </section>
    );
  }

  const explorer = receipt.txHash && chain?.explorerUrl ? `${chain.explorerUrl}/tx/${receipt.txHash}` : null;
  return (
    <section aria-labelledby="receipt-heading" className="panel overflow-hidden">
      <div className="px-6 pb-7 pt-10 text-center">
        <SealMark tone="good" />
        <h2 id="receipt-heading" ref={heading} tabIndex={-1} className="mt-6 text-2xl focus:outline-none">Your ballot is in the box</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          It has been counted, and no one can tell it came from you. This receipt doesn't show your choice either.
        </p>
      </div>

      <dl className="mx-6 divide-y divide-rule border-t border-rule text-sm">
        <div className="flex justify-between gap-4 py-3.5">
          <dt className="text-muted">Election</dt>
          <dd className="text-right font-medium">{election.title}</dd>
        </div>
        {receipt.at && (
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-muted">Cast</dt>
            <dd className="text-right font-medium">{formatDateTime(receipt.at)}</dd>
          </div>
        )}
        {receipt.txHash && (
          <div className="flex items-center justify-between gap-4 py-3.5">
            <dt className="text-muted">Transaction</dt>
            <dd className="flex items-center gap-2.5">
              <code className="font-mono text-[0.8125rem]" title={receipt.txHash}>{shortHash(receipt.txHash)}</code>
              <CopyButton text={receipt.txHash} label="transaction ID" />
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-2 flex flex-col gap-2 border-t border-rule bg-paper/60 px-6 py-5 sm:flex-row">
        {explorer && (
          <a className="btn-primary" href={explorer} target="_blank" rel="noreferrer">
            Check it on the blockchain<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <Link to="/" className="btn-secondary">Back to elections</Link>
      </div>
    </section>
  );
}

function BallotSection({ election, candidates, registration, user, onVoted }) {
  const [identity, setIdentity] = useLocalIdentity(user.id, election.id);
  const [receipt, setReceipt] = useState(() => loadReceipt(user.id, election.id));
  const [justCast, setJustCast] = useState(false);

  if (receipt) return <Receipt receipt={receipt} election={election} fresh={justCast} />;
  if (!registration || !registration.onChain) {
    return (
      <EmptyState title="You're not on the voter list for this election">
        Only voters who registered and were approved before voting opened can vote.
      </EmptyState>
    );
  }
  if (!identity || identity.commitment.toString() !== registration.commitment) {
    return <MissingKey election={election} user={user} registration={registration} onRestored={setIdentity} />;
  }

  return (
    <BallotPaper
      election={election}
      candidates={candidates}
      identity={identity}
      onCast={(r) => {
        saveReceipt(user.id, election.id, r);
        setJustCast(true);
        setReceipt(r);
        onVoted?.(); // refresh the live count so it includes this ballot
      }}
    />
  );
}

const STEPS = [
  { key: "verify", label: "Checking the voter list against the blockchain" },
  { key: "prove", label: "Sealing your ballot with a zero-knowledge proof" },
  { key: "submit", label: "Submitting it anonymously to be counted" },
];

/**
 * The confirm-and-seal sheet. A native <dialog>: the browser traps focus inside it,
 * Esc closes it, and the page behind it is hidden from screen readers.
 */
function ConfirmSheet({ open, candidate, step, onConfirm, onClose }) {
  const ref = useRef(null);
  const working = step !== null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const current = STEPS.findIndex((x) => x.key === step);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc: only allowed before sealing starts
        if (!working) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !working) onClose(); // tap on the dimmed backdrop
      }}
    >
      <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-rule sm:hidden" aria-hidden="true" />
      {!working ? (
        <div className="px-6 pb-6 pt-6 text-center sm:pt-8">
          {candidate && <Avatar name={candidate.name} photoUrl={candidate.photoUrl} size="xl" className="mx-auto" />}
          <p className="mt-5 text-sm text-muted">You're voting for</p>
          <h2 id="sheet-title" className="mt-0.5 text-2xl">{candidate?.name}</h2>
          {candidate?.party && <p className="mt-0.5 text-muted">{candidate.party}</p>}
          <p className="mx-auto mt-5 max-w-xs rounded-xl bg-paper px-4 py-3 text-sm">
            A ballot can't be changed once it's cast.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" className="btn-primary py-3 text-base" onClick={onConfirm}>Confirm and cast</button>
            <button type="button" className="btn-secondary py-3 text-base" onClick={onClose}>Change my choice</button>
          </div>
        </div>
      ) : (
        <div className="px-6 pb-8 pt-7 sm:pt-8">
          <h2 id="sheet-title" className="text-xl">Sealing your ballot</h2>
          <p className="mt-1 text-sm text-muted">Keep this page open. It takes a few seconds.</p>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
            <div
              className="h-full origin-left rounded-full bg-accent transition-transform duration-700 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${(current + 1) / (STEPS.length + 0.5)})` }}
            />
          </div>
          <ol className="mt-6 space-y-3.5 text-[0.9375rem]" aria-live="polite">
            {STEPS.map((s, i) => {
              const state = i < current ? "done" : i === current ? "active" : "todo";
              return (
                <li key={s.key} className={`flex items-start gap-3 ${state === "todo" ? "text-muted" : ""}`}>
                  {state === "done" ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-good text-white">
                      <Check className="size-3.5" />
                      <span className="sr-only">Done:</span>
                    </span>
                  ) : state === "active" ? (
                    <span className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-accent/20 border-t-accent motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-rule" aria-hidden="true" />
                  )}
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </dialog>
  );
}

function BallotPaper({ election, candidates, identity, onCast }) {
  const [choice, setChoice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState(null);
  const [sealed, setSealed] = useState(null);
  const [error, setError] = useState(null);
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
      setConfirming(false);
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

          <fieldset disabled={step !== null || sealed !== null}>
            <legend className="sr-only">Choose one candidate</legend>
            <p className="px-6 pb-2 pt-4 text-sm text-muted">Thumbprint the box beside one candidate.</p>
            <div>
              {candidates.map((c, i) => {
                const selected = choice === c.chainIndex;
                return (
                  <label
                    key={c.id}
                    className={`relative flex cursor-pointer items-stretch border-t border-ink/15 transition-colors duration-200 first:border-t-0 motion-reduce:transition-none ${selected ? "bg-accent-wash/60" : "hover:bg-paper/70"}`}
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/15 bg-paper/60 px-6 py-5">
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={choice === null || sealed !== null}>
              Cast ballot
            </button>
            <p className="text-sm text-muted">{chosen ? `Selected: ${chosen.name}` : "Nothing selected yet"}</p>
          </div>
        </form>
      </div>

      <ConfirmSheet
        open={confirming}
        candidate={chosen}
        step={step}
        onConfirm={cast}
        onClose={() => setConfirming(false)}
      />
      {sealed && <p className="sr-only" role="status">Ballot accepted.</p>}
      <ErrorNotice error={error} className="mt-4 max-w-xl" />
    </section>
  );
}

function ClosedSection({ election, user }) {
  const receipt = loadReceipt(user.id, election.id);
  if (receipt) return <Receipt receipt={receipt} election={election} />;
  return (
    <EmptyState title="Voting has closed">
      The final count is shown{" "}
      <span className="lg:hidden">below</span>
      <span className="hidden lg:inline">beside this</span>.
    </EmptyState>
  );
}
