// Small shared pieces of UI.
import { useCallback, useEffect, useState } from "react";

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
