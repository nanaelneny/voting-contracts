import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import { ErrorNotice, useAction } from "../components/ui";

function AuthShell({ title, intro, children, footer }) {
  return (
    <div className="mx-auto max-w-sm pt-2 sm:pt-8">
      <h1 className="text-center text-[2rem]">{title}</h1>
      {intro && <p className="mt-2 text-center text-muted">{intro}</p>}
      <div className="panel mt-8 p-6 sm:p-7">{children}</div>
      <p className="mt-6 text-center text-sm text-muted">{footer}</p>
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const { busy, error, run } = useAction();

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      signIn(await api.login(form));
      navigate(location.state?.from || "/", { replace: true });
    });
  };

  return (
    <AuthShell title="Log in" footer={<>No account yet? <Link to="/register" className="btn-link">Create one</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" required className="field"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="field"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <ErrorNotice error={error} />
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", memberId: "", email: "", password: "" });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const { memberIdLabel, allowedEmailDomains: domains } = useSettings();

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      signIn(await api.register(form));
      navigate("/", { replace: true });
    });
  };

  return (
    <AuthShell
      title="Create your account"
      footer={<>Already have an account? <Link to="/login" className="btn-link">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="label">Full name</label>
          <input id="fullName" autoComplete="name" required className="field" value={form.fullName} onChange={set("fullName")} />
        </div>
        <div>
          <label htmlFor="memberId" className="label">{memberIdLabel}</label>
          <input id="memberId" required className="field" value={form.memberId} onChange={set("memberId")} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" required className="field" value={form.email} onChange={set("email")}
            placeholder={domains.length ? `you@${domains[0]}` : undefined} />
          {domains.length > 0 && (
            <p className="mt-1 text-xs text-muted">Use your organisation email (ending in @{domains.join(" or @")}).</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} className="field"
            value={form.password} onChange={set("password")} />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        <ErrorNotice error={error} />
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}
