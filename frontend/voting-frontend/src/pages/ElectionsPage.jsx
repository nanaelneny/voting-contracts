import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatWindow, relative } from "../lib/format";
import Thumbprint from "../components/Thumbprint";
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
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api.listElections(), []);

  return (
    <div>
      {!user && <Intro />}

      {user ? <h1>Elections</h1> : <h2 className="mt-14 text-2xl">Elections</h2>}
      {loading ? (
        <PageLoading />
      ) : error ? (
        <ErrorNotice error={error} className="mt-6" />
      ) : (
        <ElectionGroups elections={data.elections} />
      )}
    </div>
  );
}

function ElectionGroups({ elections }) {
  if (elections.filter((e) => e.status !== "cancelled").length === 0) {
    return <p className="mt-6 text-muted">No elections yet. They'll appear here as soon as the election officer creates one.</p>;
  }
  return GROUPS.map(({ title, statuses }) => {
    const rows = elections.filter((e) => statuses.includes(e.status));
    if (rows.length === 0) return null;
    const live = statuses.includes("open");
    return (
      <section key={title} className="mt-8" aria-labelledby={`g-${title}`}>
        <h2 id={`g-${title}`} className="text-base text-muted">{title}</h2>
        <ul className="mt-3 space-y-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Link
                to={`/elections/${e.id}`}
                className={`group flex flex-wrap items-center gap-x-4 gap-y-1 border bg-sheet px-4 py-4 hover:border-ink ${
                  live ? "border-l-4 border-ink border-l-violet" : "border-rule"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold [font-stretch:108%] group-hover:text-violet">{e.title}</span>
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
  });
}

/** For visitors who aren't logged in: what this is and how it works. */
function Intro() {
  return (
    <section aria-labelledby="intro" className="border-b border-rule pb-14">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <h1 id="intro" className="max-w-xl text-4xl sm:text-5xl">Vote in secret. Check that it was counted.</h1>
          <p className="mt-5 max-w-lg text-lg text-muted">
            Student elections recorded on a public blockchain. Your ballot is proved valid without revealing who cast it,
            so not even the election officers can link a vote to a student.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary px-5 py-3 text-base">Create an account</Link>
            <Link to="/login" className="btn-secondary px-5 py-3 text-base">Log in</Link>
          </div>
        </div>
        <SampleBallot />
      </div>

      <ol className="mt-14 grid gap-8 sm:grid-cols-3">
        {[
          ["Register", "Sign up and register for an election. Your browser creates a private voter key that never leaves your device."],
          ["Thumbprint your choice", "Your device proves you're on the voter list without saying which voter you are."],
          ["Counted in public", "Your ballot goes on the blockchain. Anyone can check the count; no one can trace it back to you."],
        ].map(([title, text], i) => (
          <li key={title}>
            <span className="font-display text-3xl font-bold text-violet [font-stretch:115%]">{i + 1}</span>
            <h2 className="mt-1 text-lg">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A small printed ballot with one row thumbprinted. Decorative. */
function SampleBallot() {
  const rows = ["Ama Owusu", "Kofi Mensah", "Esi Boateng"];
  return (
    <div className="mx-auto w-full max-w-xs rotate-1 border-2 border-ink bg-sheet shadow-[6px_6px_0_var(--color-rule)]" aria-hidden="true">
      <div className="border-b-2 border-ink px-4 py-2.5 font-display text-sm font-bold [font-stretch:112%]">SRC President</div>
      {rows.map((name, i) => (
        <div key={name} className={`flex items-stretch ${i > 0 ? "border-t-2 border-ink" : ""}`}>
          <span className="grid w-7 place-items-center border-r-2 border-ink font-display text-xs font-bold">{i + 1}</span>
          <span className="flex flex-1 items-center gap-2 px-2.5 py-2">
            <span className="grid size-8 place-items-center rounded-sm bg-violet-wash font-display text-xs font-bold text-violet-dark">
              {name.split(" ").map((w) => w[0]).join("")}
            </span>
            <span className="font-display text-sm font-bold [font-stretch:108%]">{name}</span>
          </span>
          <span className="grid w-14 place-items-center border-l-2 border-ink text-violet">
            {i === 1 && <Thumbprint className="h-12 w-10 -rotate-6" />}
          </span>
        </div>
      ))}
    </div>
  );
}
