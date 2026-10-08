import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatWindow, relative } from "../lib/format";
import { ErrorNotice, PageLoading, StatusTag, useLoad } from "../components/ui";

const GROUPS = [
  { title: "Voting now", statuses: ["open"] },
  { title: "Coming up", statuses: ["draft", "publishing", "upcoming"] },
  { title: "Closed", statuses: ["closed"] },
];

function hint(e) {
  if (e.status === "open") return `Closes ${relative(e.endTime)}`;
  if (e.status === "upcoming") return `Voting opens ${relative(e.startTime)}`;
  if (e.status === "draft" || e.status === "publishing") return "Register before voting opens";
  return null;
}

export default function ElectionsPage() {
  const { data, error, loading } = useLoad(() => api.listElections(), []);
  if (loading) return <PageLoading />;
  if (error) return <ErrorNotice error={error} />;

  const elections = data.elections;
  return (
    <div>
      <h1>Elections</h1>
      <p className="mt-2 max-w-prose text-muted">
        Register for an election before voting opens. When it opens, you can cast one secret ballot.
      </p>

      {elections.filter((e) => e.status !== "cancelled").length === 0 && (
        <p className="mt-10 text-muted">There are no elections yet. Check back when the election officer announces one.</p>
      )}

      {GROUPS.map(({ title, statuses }) => {
        const rows = elections.filter((e) => statuses.includes(e.status));
        if (rows.length === 0) return null;
        return (
          <section key={title} className="mt-10" aria-labelledby={`g-${title}`}>
            <h2 id={`g-${title}`} className="text-base text-muted">{title}</h2>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {rows.map((e) => (
                <li key={e.id}>
                  <Link to={`/elections/${e.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-4 hover:bg-sheet sm:px-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold group-hover:text-violet">{e.title}</span>
                      <span className="block text-sm text-muted">{formatWindow(e.startTime, e.endTime)}</span>
                    </span>
                    {hint(e) && <span className="text-sm text-muted">{hint(e)}</span>}
                    <StatusTag status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
