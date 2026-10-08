import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatDateTime, formatWindow } from "../../lib/format";
import Results from "../../components/Results";
import { ErrorNotice, Notice, PageLoading, StatusTag, useAction, useLoad } from "../../components/ui";
import { ElectionForm } from "./AdminPages";

const EDITABLE = ["draft"];
const BEFORE_VOTING = ["draft", "publishing", "upcoming"];

export default function ManageElection() {
  const { id } = useParams();
  const electionId = Number(id);
  const detail = useLoad(() => api.getElection(electionId), [electionId]);
  const regs = useLoad(() => api.listRegistrations(electionId), [electionId]);
  const [resultsKey, setResultsKey] = useState(0);
  // The blockchain is the authority on whether the result has been recorded (anyone can record it).
  const chainResult = useLoad(() => api.getResults(electionId), [electionId, resultsKey]);

  if (detail.loading) return <PageLoading />;
  if (detail.error) return <ErrorNotice error={detail.error} />;

  const { election, candidates } = detail.data;
  const registrations = regs.data?.registrations ?? [];
  const reloadAll = async () => {
    await Promise.all([detail.reload(), regs.reload()]);
    setResultsKey((k) => k + 1);
  };

  return (
    <div>
      <Link to="/admin" className="text-sm font-semibold text-muted hover:text-ink">All elections</Link>
      <header className="mt-3 border-b border-rule pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl">{election.title}</h1>
          <StatusTag status={election.status} admin />
        </div>
        <p className="mt-3 text-sm"><span className="font-semibold">Voting:</span> {formatWindow(election.startTime, election.endTime)}</p>
        <Link to={`/elections/${election.id}`} className="btn-link mt-2 inline-block text-sm">See the voters' page</Link>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {EDITABLE.includes(election.status) && <SetupChecklist candidates={candidates} registrations={registrations} />}
          <Details election={election} onSaved={detail.reload} />
          <Candidates election={election} candidates={candidates} onChange={detail.reload} />
          <Registrations election={election} state={regs} />
        </div>
        <aside className="space-y-8">
          <ChainActions
            election={election}
            candidates={candidates}
            registrations={registrations}
            finalized={chainResult.data?.phase === "finalized"}
            onDone={reloadAll}
          />
          {["upcoming", "open", "closed"].includes(election.status) && (
            <div className="panel p-5">
              <Results key={resultsKey} electionId={electionId} refreshMs={election.status === "open" ? 10_000 : 0} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SetupChecklist({ candidates, registrations }) {
  const approved = registrations.filter((r) => r.status === "approved").length;
  const steps = [
    { done: candidates.length > 0, text: "Add the candidates" },
    { done: approved > 0, text: "Approve students' registrations" },
    { done: false, text: "Publish the election to the blockchain, at least a few minutes before voting opens" },
  ];
  return (
    <section aria-labelledby="setup" className="panel p-5">
      <h2 id="setup">Before voting opens</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-good text-white" : "border border-rule"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <span className={s.done ? "text-muted line-through" : ""}>{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">Students who register after publishing can still be approved and added until voting opens.</p>
    </section>
  );
}

function Details({ election, onSaved }) {
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const editable = EDITABLE.includes(election.status);

  return (
    <section aria-labelledby="details">
      <h2 id="details">Details</h2>
      {editable ? (
        <div className="panel mt-3 p-5">
          <ElectionForm
            key={`${election.title}|${election.startTime}|${election.endTime}`}
            initial={election}
            submitLabel="Save changes"
            busy={busy}
            error={error}
            onSubmit={(body) =>
              run(async () => {
                await api.updateElection(election.id, body);
                await onSaved();
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
              })
            }
          />
          {saved && <p className="mt-3 text-sm text-good" role="status">Changes saved.</p>}
        </div>
      ) : (
        <div className="mt-3 text-sm">
          {election.description ? <p className="max-w-prose">{election.description}</p> : <p className="text-muted">No description.</p>}
          <p className="mt-2 text-muted">These details are on the blockchain now and can't be changed.</p>
        </div>
      )}
    </section>
  );
}

function Candidates({ election, candidates, onChange }) {
  const editable = EDITABLE.includes(election.status);
  const [form, setForm] = useState({ name: "", party: "" });
  const { busy, error, run } = useAction();

  return (
    <section aria-labelledby="candidates">
      <h2 id="candidates">Candidates</h2>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No candidates yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.name}</span>
                {c.party && <span className="block text-sm text-muted">{c.party}</span>}
              </span>
              {editable && (
                <button
                  type="button"
                  className="text-sm font-semibold text-bad hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => run(async () => { await api.removeCandidate(election.id, c.id); await onChange(); })}
                >
                  Remove<span className="sr-only"> {c.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.addCandidate(election.id, { name: form.name, party: form.party || undefined });
              setForm({ name: "", party: "" });
              await onChange();
            });
          }}
        >
          <div className="min-w-48 flex-1">
            <label htmlFor="cand-name" className="label">Name</label>
            <input id="cand-name" required maxLength={150} className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="min-w-40 flex-1">
            <label htmlFor="cand-party" className="label">Party or slogan <span className="font-normal text-muted">(optional)</span></label>
            <input id="cand-party" maxLength={100} className="field" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} />
          </div>
          <button type="submit" className="btn-secondary" disabled={busy}>Add candidate</button>
        </form>
      )}
      <ErrorNotice error={error} className="mt-3" />
    </section>
  );
}

const TABS = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function Registrations({ election, state }) {
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState(new Set());
  const { busy, error, run } = useAction();
  const all = state.data?.registrations ?? [];
  const rows = all.filter((r) => r.status === tab);
  const canReview = BEFORE_VOTING.includes(election.status);
  const selectable = rows.filter((r) => !r.onChain);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const review = (status) =>
    run(async () => {
      await api.reviewRegistrations(election.id, [...selected], status);
      setSelected(new Set());
      await state.reload();
    });

  return (
    <section aria-labelledby="registrations">
      <h2 id="registrations">Voter registrations</h2>
      <p className="mt-1 text-sm text-muted">
        Check each student is eligible to vote in this election. Approved voters go on the blockchain voter list when you
        publish. After that their registration can't be changed.
      </p>

      <div className="mt-4 flex gap-1 border-b border-rule" role="tablist">
        {TABS.map((t) => {
          const count = all.filter((r) => r.status === t.key).length;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              type="button"
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.key ? "border-violet text-violet" : "border-transparent text-muted hover:text-ink"}`}
              onClick={() => { setTab(t.key); setSelected(new Set()); }}
            >
              {t.label} <span className="font-normal">({count})</span>
            </button>
          );
        })}
      </div>

      {state.error && <ErrorNotice error={state.error} className="mt-3" />}
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          {tab === "pending" ? "No registrations waiting. Students register from the election's page." : "None."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-rule">
                <th className="w-10 py-2">
                  {canReview && selectable.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selectable.every((r) => selected.has(r.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())}
                      className="size-4 accent-violet"
                    />
                  )}
                </th>
                <th className="py-2 pr-3 font-semibold">Student</th>
                <th className="py-2 pr-3 font-semibold">Student ID</th>
                <th className="py-2 pr-3 font-semibold">Registered</th>
                <th className="py-2 font-semibold">Voter list</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5">
                    {canReview && !r.onChain && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.user.fullName}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="size-4 accent-violet"
                      />
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block font-semibold">{r.user.fullName}</span>
                    <span className="block text-xs text-muted">{r.user.email}</span>
                  </td>
                  <td className="py-2.5 pr-3">{r.user.studentId || <span className="text-muted">–</span>}</td>
                  <td className="py-2.5 pr-3 text-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="py-2.5">{r.onChain ? <span className="font-semibold text-good">On blockchain</span> : <span className="text-muted">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canReview && selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{selected.size} selected</span>
          {tab !== "approved" && <button type="button" className="btn-primary" disabled={busy} onClick={() => review("approved")}>Approve</button>}
          {tab !== "rejected" && <button type="button" className="btn-danger" disabled={busy} onClick={() => review("rejected")}>Reject</button>}
        </div>
      )}
      <ErrorNotice error={error} className="mt-3" />
    </section>
  );
}

/** A button that asks for confirmation before running. */
function ConfirmButton({ className, label, confirmText, busyLabel, busy, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className={className} disabled={disabled || busy} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <div className="rounded-md border border-rule bg-paper p-3">
      <p className="text-sm">{confirmText}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className={className} disabled={busy} onClick={async () => { await onConfirm(); setAsking(false); }}>
          {busy ? busyLabel : `Yes, ${label.toLowerCase()}`}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setAsking(false)}>Not now</button>
      </div>
    </div>
  );
}

function ChainActions({ election, candidates, registrations, finalized, onDone }) {
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [message, setMessage] = useState(null);
  const approvedWaiting = registrations.filter((r) => r.status === "approved" && !r.onChain).length;
  const s = election.status;
  const act = (fn, done) => run(async () => { setMessage(null); const r = await fn(); setMessage(done(r)); await onDone(); });

  return (
    <section aria-labelledby="chain" className="panel space-y-5 p-5">
      <h2 id="chain">Blockchain</h2>

      {(s === "draft" || s === "publishing") && (
        <div>
          <h3>Publish</h3>
          <p className="mt-1 text-sm text-muted">
            Creates the election on the blockchain with {candidates.length} candidate{candidates.length === 1 ? "" : "s"} and{" "}
            {approvedWaiting} approved voter{approvedWaiting === 1 ? "" : "s"}. Details and candidates can't be changed afterwards.
          </p>
          {s === "publishing" && <Notice tone="warn" className="mt-2">A previous publish didn't finish. Publishing again picks up where it stopped.</Notice>}
          <div className="mt-3">
            <ConfirmButton
              className="btn-primary"
              label="Publish"
              busyLabel="Publishing…"
              confirmText="Publish this election to the blockchain? This can't be undone."
              busy={busy}
              disabled={candidates.length === 0}
              onConfirm={() => act(() => api.publish(election.id), (r) => `Published with ${r.candidates} candidates and ${r.votersAdded} voters.`)}
            />
          </div>
        </div>
      )}

      {s === "upcoming" && (
        <div>
          <h3>Add approved voters</h3>
          <p className="mt-1 text-sm text-muted">
            {approvedWaiting
              ? `${approvedWaiting} approved student${approvedWaiting === 1 ? " isn't" : "s aren't"} on the blockchain voter list yet.`
              : "Everyone you've approved is on the voter list."}{" "}
            The list locks when voting opens.
          </p>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy || approvedWaiting === 0}
            onClick={() => act(() => api.syncVoters(election.id), (r) => `Added ${r.added} voter${r.added === 1 ? "" : "s"}. ${r.voterCount} on the list.`)}
          >
            {busy ? "Adding…" : "Add to voter list"}
          </button>
        </div>
      )}

      {s === "open" && <p className="text-sm text-muted">Voting is open. Nothing can be changed until it closes {formatDateTime(election.endTime)}.</p>}

      {s === "closed" && finalized && (
        <p className="text-sm text-muted">The final result is recorded on the blockchain. Nothing more to do.</p>
      )}

      {s === "closed" && !finalized && (
        <div>
          <h3>Record the final result</h3>
          <p className="mt-1 text-sm text-muted">Counts the ballots on the blockchain and records the winner permanently. Anyone can check it.</p>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy}
            onClick={() => act(() => api.finalize(election.id), () => "Final result recorded.")}
          >
            {busy ? "Recording…" : "Record final result"}
          </button>
        </div>
      )}

      {BEFORE_VOTING.includes(s) && (
        <div className="border-t border-rule pt-5">
          <h3>Cancel election</h3>
          <p className="mt-1 text-sm text-muted">Only possible before voting opens. Voters will see that it was cancelled.</p>
          <div className="mt-3">
            <ConfirmButton
              className="btn-danger"
              label="Cancel election"
              busyLabel="Cancelling…"
              confirmText="Cancel this election? This can't be undone."
              busy={busy}
              onConfirm={() => act(() => api.cancel(election.id), () => "Election cancelled.")}
            />
          </div>
        </div>
      )}

      {s === "draft" && (
        <div className="border-t border-rule pt-5">
          <h3>Delete draft</h3>
          <p className="mt-1 text-sm text-muted">Removes the draft and its registrations completely.</p>
          <div className="mt-3">
            <ConfirmButton
              className="btn-danger"
              label="Delete draft"
              busyLabel="Deleting…"
              confirmText="Delete this draft and all its registrations?"
              busy={busy}
              onConfirm={() => run(async () => { await api.deleteElection(election.id); navigate("/admin"); })}
            />
          </div>
        </div>
      )}

      {message && <Notice tone="good">{message}</Notice>}
      <ErrorNotice error={error} />
    </section>
  );
}
