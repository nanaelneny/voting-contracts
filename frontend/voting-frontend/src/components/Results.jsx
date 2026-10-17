// Vote counts read from the blockchain, as horizontal bars.
import { useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Avatar from "./Avatar";
import { ErrorNotice, Spinner, useAction, useLoad } from "./ui";

export default function Results({ electionId, refreshMs = 0 }) {
  const { data, error, loading, reload } = useLoad(() => api.getResults(electionId), [electionId]);
  const { user } = useAuth();
  const finalize = useAction();

  useEffect(() => {
    if (!refreshMs) return undefined;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);

  if (loading && !data) return <Spinner label="Loading results" />;
  if (error && !data) return <ErrorNotice error={error} />;
  if (!data || data.phase === "draft" || data.phase === "cancelled") return null;

  const max = Math.max(1, ...data.candidates.map((c) => c.votes));
  const winners = new Set(data.winners || []);
  const finalized = data.phase === "finalized";

  return (
    <section aria-labelledby="results-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-heading">{finalized ? "Final result" : data.phase === "voting" ? "Live count" : "Count"}</h2>
        <p className="text-sm text-muted tabular-nums">
          {data.totalVotes} of {data.voterCount} registered voters
          {data.turnout !== null && ` (${data.turnout}% turnout)`}
        </p>
      </div>

      {finalized && data.tie && (
        <p className="mt-2 text-sm font-semibold text-warn">The top candidates are tied.</p>
      )}
      {data.phase === "ended" && (
        <div className="mt-2 text-sm text-muted">
          <p>Voting has closed. The final result hasn't been recorded on the blockchain yet.</p>
          {user && (
            <button
              type="button"
              className="btn-secondary mt-2"
              disabled={finalize.busy}
              onClick={() => finalize.run(async () => { await api.finalize(electionId); reload(); })}
            >
              {finalize.busy ? "Recording…" : "Record final result"}
            </button>
          )}
          <ErrorNotice error={finalize.error} />
        </div>
      )}

      <ol className="mt-5 space-y-4">
        {data.candidates.map((c, i) => {
          const won = finalized && winners.has(c.id);
          return (
            <li key={c.id ?? i}>
              <div className="flex items-center gap-3 text-sm">
                <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
                <span className="min-w-0 flex-1 font-semibold">
                  {c.name}
                  {won && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">{data.tie ? "Tied" : "Elected"}</span>}
                  {c.party && <span className="block text-xs font-normal text-muted">{c.party}</span>}
                </span>
                <span className="text-lg font-semibold tabular-nums tracking-tight">{c.votes}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
                <div
                  className={`animate-grow h-full rounded-full ${won ? "bg-accent" : "bg-ink/60"}`}
                  style={{ width: `${(c.votes / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
