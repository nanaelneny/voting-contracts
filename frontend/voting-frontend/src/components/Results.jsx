// Vote counts read from the blockchain, as horizontal bars.
import { useEffect } from "react";
import { api } from "../lib/api";
import { ErrorNotice, Spinner, useLoad } from "./ui";

export default function Results({ electionId, refreshMs = 0 }) {
  const { data, error, loading, reload } = useLoad(() => api.getResults(electionId), [electionId]);

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
        <p className="text-sm text-muted">
          {data.totalVotes} of {data.voterCount} registered voters
          {data.turnout !== null && ` (${data.turnout}% turnout)`}
        </p>
      </div>

      {finalized && data.tie && (
        <p className="mt-2 text-sm font-semibold text-warn">The top candidates are tied.</p>
      )}
      {data.phase === "ended" && (
        <p className="mt-2 text-sm text-muted">Voting has closed. The result becomes final once an election officer records it.</p>
      )}

      <ol className="mt-4 space-y-3">
        {data.candidates.map((c, i) => {
          const won = finalized && winners.has(c.id);
          return (
            <li key={c.id ?? i}>
              <div className="flex items-end justify-between gap-3 text-sm">
                <span className="font-semibold">
                  {c.name}
                  {won && <span className="ml-2 rounded bg-violet px-1.5 py-0.5 text-xs font-semibold text-white">{data.tie ? "Tied" : "Elected"}</span>}
                  {c.party && <span className="block text-xs font-normal text-muted">{c.party}</span>}
                </span>
                <span className="font-semibold">{c.votes}</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-paper" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${won ? "bg-violet" : "bg-ink/70"}`}
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
