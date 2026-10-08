import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { formatWindow, toLocalInput } from "../../lib/format";
import { ErrorNotice, PageLoading, StatusTag, useAction, useLoad } from "../../components/ui";

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
        <p className="mt-10 text-muted">No elections yet. Create one to start taking voter registrations.</p>
      ) : (
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {data.elections.map((e) => (
            <li key={e.id}>
              <Link to={`/admin/elections/${e.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-4 hover:bg-sheet sm:px-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold group-hover:text-violet">{e.title}</span>
                  <span className="block text-sm text-muted">{formatWindow(e.startTime, e.endTime)}</span>
                </span>
                <StatusTag status={e.status} admin />
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
        <input id="title" required maxLength={200} className="field" value={form.title} onChange={set("title")} placeholder="SRC General Elections 2026" />
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
      <p className="text-xs text-muted">Registration stays open until voting opens. Times are in your computer's time zone.</p>
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
      <Link to="/admin" className="text-sm font-semibold text-muted hover:text-ink">All elections</Link>
      <h1 className="mt-3">New election</h1>
      <p className="mt-2 text-muted">
        This creates a draft. Students can register for it straight away. You'll add candidates next, and publish it to
        the blockchain before voting opens.
      </p>
      <div className="panel mt-6 p-6">
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
      <Link to="/admin" className="text-sm font-semibold text-muted hover:text-ink">All elections</Link>
      <h1 className="mt-3">Relay statistics</h1>
      <p className="mt-2 max-w-prose text-muted">
        Transactions the server submitted and paid for. Latency is the time from receiving a ballot to its confirmation on
        the blockchain. Nothing here identifies voters.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 text-muted">Nothing has been relayed yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-y border-rule text-left text-sm">
            <thead className="border-b border-rule text-muted">
              <tr>
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 pr-4 text-right font-semibold">Accepted</th>
                <th className="py-2 pr-4 text-right font-semibold">Rejected</th>
                <th className="py-2 pr-4 text-right font-semibold">Failed</th>
                <th className="py-2 pr-4 text-right font-semibold">Average gas</th>
                <th className="py-2 text-right font-semibold">Average latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map(([kind, s]) => (
                <tr key={kind}>
                  <td className="py-2.5 pr-4 font-semibold">{LABELS[kind] ?? kind}</td>
                  <td className="py-2.5 pr-4 text-right">{s.success}</td>
                  <td className="py-2.5 pr-4 text-right">{s.rejected}</td>
                  <td className="py-2.5 pr-4 text-right">{s.failed}</td>
                  <td className="py-2.5 pr-4 text-right">{s.avgGasUsed?.toLocaleString() ?? "–"}</td>
                  <td className="py-2.5 text-right">{s.avgLatencyMs != null ? `${s.avgLatencyMs.toLocaleString()} ms` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
