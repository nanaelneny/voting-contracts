// Small shared pieces of UI.
import { useCallback, useEffect, useState } from "react";
import { relative } from "../lib/format";

/** Loads data with `load()` and re-runs it whenever `deps` change. */
export function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    try {
      const data = await run();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [run]);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [reload]);
  return { ...state, reload };
}

const TONES = {
  info: "bg-sheet text-ink shadow-soft",
  good: "bg-good-wash text-good",
  warn: "bg-warn-wash text-warn",
  bad: "bg-bad-wash text-bad",
  accent: "bg-accent-wash text-ink",
};

export function Notice({ tone = "info", title, children, className = "" }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-2xl px-4 py-3.5 text-[0.9375rem] ${TONES[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1 opacity-90" : ""}>{children}</div>}
    </div>
  );
}

/** A small right-pointing chevron, for rows that open another page. */
export function Chevron({ className = "" }) {
  return (
    <svg viewBox="0 0 8 14" className={`h-3.5 w-2 shrink-0 ${className}`} aria-hidden="true">
      <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A check mark, drawn rather than typed, so it looks the same on every device. */
export function Check({ className = "" }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorNotice({ error, className }) {
  if (!error) return null;
  return <Notice tone="bad" className={className}>{error.message}</Notice>;
}

export function Spinner({ label = "Loading" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-rule border-t-accent motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </span>
  );
}

export function PageLoading() {
  return (
    <div className="py-16">
      <Spinner />
    </div>
  );
}

// What each election status means, in words for voters and for admins.
// The dot carries the same meaning as the text, so colour is never the only signal.
const STATUS = {
  draft: { voter: "Registration open", admin: "Draft", tone: "text-accent-dark bg-accent-wash", dot: "bg-accent" },
  publishing: { voter: "Registration open", admin: "Publishing incomplete", tone: "text-warn bg-warn-wash", dot: "bg-warn" },
  upcoming: { voter: "Voting opens soon", admin: "Published", tone: "text-ink bg-fill", dot: "bg-muted" },
  open: { voter: "Voting open", admin: "Voting open", tone: "text-good bg-good-wash", dot: "bg-good animate-pulse motion-reduce:animate-none" },
  closed: { voter: "Closed", admin: "Closed", tone: "text-muted bg-fill", dot: "bg-muted/60" },
  cancelled: { voter: "Cancelled", admin: "Cancelled", tone: "text-bad bg-bad-wash", dot: "bg-bad" },
};

export function StatusTag({ status, admin = false }) {
  const s = STATUS[status] || { voter: status, admin: status, tone: "bg-fill", dot: "bg-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {admin ? s.admin : s.voter}
    </span>
  );
}

/** Runs an async action, tracking busy state and errors. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/**
 * Where an election is in its life: registration, then voting, then the result.
 * A real sequence, so it's shown as numbered steps with the current one marked.
 */
export function PhaseTrack({ election }) {
  if (election.status === "cancelled") return null;
  const { status, startTime, endTime } = election;
  const current = { draft: 0, publishing: 0, upcoming: 1, open: 1, closed: 2 }[status] ?? 0;
  const steps = [
    {
      label: "Registration",
      detail: current === 0 ? "Open now" : "Closed",
    },
    {
      label: "Voting",
      detail: status === "open" ? `Closes ${relative(endTime)}` : status === "closed" ? "Closed" : `Opens ${relative(startTime)}`,
    },
    { label: "Result", detail: status === "closed" ? "Votes counted" : "When voting closes" },
  ];
  // "upcoming" sits between steps: registration is over but voting hasn't started.
  const stateOf = (i) => {
    if (i < current) return "done";
    if (i === current) return status === "upcoming" ? "next" : status === "closed" ? "done" : "now";
    return "later";
  };

  return (
    <ol className="grid grid-cols-3 gap-3" aria-label="Election progress">
      {steps.map((s, i) => {
        const state = stateOf(i);
        return (
          <li key={s.label} className="relative" aria-current={state === "now" ? "step" : undefined}>
            <span
              className={`block h-1 rounded-full ${
                state === "done" ? "bg-ink/80" : state === "now" ? "bg-accent" : state === "next" ? "bg-accent/30" : "bg-rule"
              }`}
              aria-hidden="true"
            />
            <p className={`mt-3 text-sm font-semibold ${state === "later" ? "text-muted" : ""}`}>
              <span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>
              {s.label}
              {state === "now" && <span className="sr-only"> (current step)</span>}
            </p>
            <p className="text-xs text-muted">{s.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}
