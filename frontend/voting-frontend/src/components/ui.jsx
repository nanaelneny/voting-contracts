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
  info: "border-rule bg-sheet text-ink",
  good: "border-good/30 bg-good-wash text-good",
  warn: "border-warn/30 bg-warn-wash text-warn",
  bad: "border-bad/30 bg-bad-wash text-bad",
  violet: "border-violet/25 bg-violet-wash text-violet-dark",
};

export function Notice({ tone = "info", title, children, className = "" }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${TONES[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function ErrorNotice({ error, className }) {
  if (!error) return null;
  return <Notice tone="bad" className={className}>{error.message}</Notice>;
}

export function Spinner({ label = "Loading" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-rule border-t-violet motion-reduce:animate-none" aria-hidden="true" />
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
const STATUS = {
  draft: { voter: "Registration open", admin: "Draft", tone: "text-violet-dark bg-violet-wash" },
  publishing: { voter: "Registration open", admin: "Publishing incomplete", tone: "text-warn bg-warn-wash" },
  upcoming: { voter: "Voting opens soon", admin: "Published", tone: "text-ink bg-paper border border-rule" },
  open: { voter: "Voting open", admin: "Voting open", tone: "text-white bg-good" },
  closed: { voter: "Closed", admin: "Closed", tone: "text-muted bg-paper border border-rule" },
  cancelled: { voter: "Cancelled", admin: "Cancelled", tone: "text-bad bg-bad-wash" },
};

export function StatusTag({ status, admin = false }) {
  const s = STATUS[status] || { voter: status, admin: status, tone: "bg-paper" };
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${s.tone}`}>
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
    <ol className="grid grid-cols-3 gap-2" aria-label="Election progress">
      {steps.map((s, i) => {
        const state = stateOf(i);
        return (
          <li key={s.label} className="relative" aria-current={state === "now" ? "step" : undefined}>
            <div className="flex items-center">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border-2 font-display text-xs font-bold ${
                  state === "done" ? "border-ink bg-ink text-white"
                  : state === "now" ? "border-violet bg-violet text-white"
                  : state === "next" ? "border-violet bg-sheet text-violet"
                  : "border-rule bg-sheet text-muted"
                }`}
              >
                {i + 1}
              </span>
              {i < steps.length - 1 && <span className={`mx-2 h-0.5 flex-1 ${i < current ? "bg-ink" : "bg-rule"}`} aria-hidden="true" />}
            </div>
            <p className={`mt-2 text-sm font-semibold ${state === "later" ? "text-muted" : ""}`}>
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
