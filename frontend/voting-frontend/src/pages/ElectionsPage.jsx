import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { formatWindow, relative } from "../lib/format";
import Thumbprint from "../components/Thumbprint";
import { Chevron, ErrorNotice, PageLoading, StatusTag, useLoad } from "../components/ui";

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

      {user ? <h1>Elections</h1> : <h2 className="mt-20 text-[1.75rem] font-bold tracking-tight">Elections</h2>}
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
    return (
      <section key={title} className="mt-10" aria-labelledby={`g-${title}`}>
        <h2 id={`g-${title}`} className="px-1 text-sm font-medium text-muted">{title}</h2>
        <ul className="group-list mt-2.5">
          {rows.map((e) => (
            <li key={e.id}>
              <Link
                to={`/elections/${e.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/70 focus-visible:-outline-offset-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="mb-1.5 block sm:hidden"><StatusTag status={e.status} /></span>
                  <span className="block text-[1.0625rem] font-semibold tracking-tight">{e.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {formatWindow(e.startTime, e.endTime)}
                    {hint(e) && <span className="block sm:inline sm:before:mx-2 sm:before:text-rule sm:before:content-['|']">{hint(e)}</span>}
                  </span>
                </span>
                <span className="hidden sm:block"><StatusTag status={e.status} /></span>
                <Chevron className="text-muted/50 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
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
  const { organisationName } = useSettings();
  return (
    <section aria-labelledby="intro">
      <div className="grid items-center gap-12 pt-4 md:grid-cols-[minmax(0,1fr)_21rem] md:gap-16 md:pt-10">
        <div>
          <h1 id="intro" className="max-w-xl text-[2.75rem] leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            Vote in secret. Check that it was counted.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted sm:text-xl">
            {organisationName ? `${organisationName} elections` : "Elections for your organisation"}, recorded on a public blockchain. Your ballot is proved valid without
            revealing who cast it, so not even the election officers can link a vote to a voter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary px-6 py-3 text-base">Create an account</Link>
            <Link to="/login" className="btn-secondary px-6 py-3 text-base">Log in</Link>
          </div>
        </div>
        <SampleBallot />
      </div>

      <ol className="mt-24 grid gap-10 border-t border-rule pt-10 sm:grid-cols-3 sm:gap-8">
        {[
          ["Register", "Sign up and register for an election. Your browser creates a private voter key that never leaves your device."],
          ["Thumbprint your choice", "Your device proves you're on the voter list without saying which voter you are."],
          ["Counted in public", "Your ballot goes on the blockchain. Anyone can check the count; no one can trace it back to you."],
        ].map(([title, text], i) => (
          <li key={title}>
            <span className="grid size-8 place-items-center rounded-full bg-accent-wash text-sm font-semibold text-accent tabular-nums">{i + 1}</span>
            <h3 className="mt-4 text-lg">{title}</h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{text}</p>
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
    <div className="mx-auto w-full max-w-xs rotate-[1.5deg] overflow-hidden rounded-2xl bg-sheet shadow-lift ring-1 ring-ink/5" aria-hidden="true">
      <div className="border-b border-ink/15 px-5 pb-3 pt-4">
        <p className="text-[0.6875rem] font-medium text-muted">Ballot paper</p>
        <p className="text-[0.9375rem] font-semibold tracking-tight">Chairperson</p>
      </div>
      {rows.map((name, i) => (
        <div key={name} className={`flex items-stretch ${i > 0 ? "border-t border-ink/15" : ""}`}>
          <span className="grid w-9 place-items-center text-xs font-medium text-muted tabular-nums">{i + 1}</span>
          <span className="flex flex-1 items-center gap-2.5 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#86868b] text-[0.6875rem] font-semibold text-white">
              {name.split(" ").map((w) => w[0]).join("")}
            </span>
            <span className="text-sm font-semibold tracking-tight">{name}</span>
          </span>
          <span className="m-2 grid w-14 place-items-center rounded-lg border border-ink/15 text-accent">
            {i === 1 && <Thumbprint className="h-11 w-9 -rotate-6" />}
          </span>
        </div>
      ))}
    </div>
  );
}
