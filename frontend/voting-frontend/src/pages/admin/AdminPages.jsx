import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { formatWindow, toLocalInput } from "../../lib/format";
import { Chevron, EmptyState, ErrorNotice, PageLoading, StatusTag, useAction, useLoad } from "../../components/ui";

export function AdminHome() {
  const { data, error, loading } = useLoad(() => api.listElections(), []);
  if (loading) return <PageLoading />;
  if (error) return <ErrorNotice error={error} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Manage elections</h1>
        <div className="flex gap-2">
          <Link to="/admin/stats" className="btn-secondary">Relay statistics</Link>
          <Link to="/admin/elections/new" className="btn-primary">New election</Link>
        </div>
      </div>

      {data.elections.length === 0 ? (
        <EmptyState
          title="No elections yet"
          className="mt-8"
          action={<Link to="/admin/elections/new" className="btn-primary">Create your first election</Link>}
        >
          Start with a draft: add candidates and approve voters, then publish it to the blockchain.
        </EmptyState>
      ) : (
        <ul className="group-list mt-8">
          {data.elections.map((e) => (
            <li key={e.id}>
              <Link to={`/admin/elections/${e.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/70 focus-visible:-outline-offset-4">
                <span className="min-w-0 flex-1">
                  <span className="mb-1.5 block sm:hidden"><StatusTag status={e.status} admin /></span>
                  <span className="block font-semibold tracking-tight">{e.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{formatWindow(e.startTime, e.endTime)}</span>
                </span>
                <span className="hidden sm:block"><StatusTag status={e.status} admin /></span>
                <Chevron className="text-muted/50" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Title, description and voting window. Used to create and to edit a draft. */
export function ElectionForm({ initial, submitLabel, onSubmit, busy, error }) {
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
  inTwoDays.setHours(8, 0, 0, 0);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    start: toLocalInput(initial?.startTime ?? inTwoDays),
    end: toLocalInput(initial?.endTime ?? new Date(inTwoDays.getTime() + 9 * 3_600_000)),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title: form.title,
          description: form.description || null,
          startTime: new Date(form.start).toISOString(),
          endTime: new Date(form.end).toISOString(),
        });
      }}
    >
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" required maxLength={200} className="field" value={form.title} onChange={set("title")} placeholder="e.g. Executive elections 2026" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" rows={3} maxLength={4000} className="field" value={form.description} onChange={set("description")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start" className="label">Voting opens</label>
          <input id="start" type="datetime-local" required className="field" value={form.start} onChange={set("start")} />
        </div>
        <div>
          <label htmlFor="end" className="label">Voting closes</label>
          <input id="end" type="datetime-local" required className="field" value={form.end} onChange={set("end")} />
        </div>
      </div>
      <ErrorNotice error={error} />
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export function NewElection() {
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  return (
    <div className="max-w-2xl">
      <Link to="/admin" className="back-link">All elections</Link>
      <h1 className="mt-4">New election</h1>
      <div className="panel mt-8 p-6 sm:p-7">
        <ElectionForm
          submitLabel="Create draft"
          busy={busy}
          error={error}
          onSubmit={(body) =>
            run(async () => {
              const { election } = await api.createElection(body);
              navigate(`/admin/elections/${election.id}`);
            })
          }
        />
      </div>
    </div>
  );
}

export function RelayStats() {
  const { data, error, loading } = useLoad(() => api.relayStats(), []);
  if (loading) return <PageLoading />;
  if (error) return <ErrorNotice error={error} />;
  const rows = Object.entries(data.stats);
  const LABELS = { vote: "Ballots", finalize: "Finalize result" };

  return (
    <div>
      <Link to="/admin" className="back-link">All elections</Link>
      <h1 className="mt-4">Relay statistics</h1>
      <p className="mt-2 max-w-prose text-muted">Transactions the server has paid gas for on voters' behalf.</p>
      {rows.length === 0 ? (
        <EmptyState title="Nothing relayed yet" className="mt-8">
          Figures appear here after the first ballot is cast.
        </EmptyState>
      ) : (
        <div className="panel mt-8 overflow-x-auto px-5 py-2">
          <table className="w-full min-w-[36rem] text-left text-sm tabular-nums">
            <thead className="border-b border-rule text-muted">
              <tr>
                <th className="py-3 pr-4 font-medium">Type</th>
                <th className="py-3 pr-4 text-right font-medium">Accepted</th>
                <th className="py-3 pr-4 text-right font-medium">Rejected</th>
                <th className="py-3 pr-4 text-right font-medium">Failed</th>
                <th className="py-3 pr-4 text-right font-medium">Average gas</th>
                <th className="py-3 text-right font-medium">Average latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map(([kind, s]) => (
                <tr key={kind}>
                  <td className="py-3.5 pr-4 font-semibold">{LABELS[kind] ?? kind}</td>
                  <td className="py-3.5 pr-4 text-right">{s.success}</td>
                  <td className="py-3.5 pr-4 text-right">{s.rejected}</td>
                  <td className="py-3.5 pr-4 text-right">{s.failed}</td>
                  <td className="py-3.5 pr-4 text-right">{s.avgGasUsed?.toLocaleString() ?? "–"}</td>
                  <td className="py-3.5 text-right">{s.avgLatencyMs != null ? `${s.avgLatencyMs.toLocaleString()} ms` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
