import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorNotice, useAction } from "../components/ui";

function AuthShell({ title, intro, children, footer }) {
  return (
    <div className="mx-auto max-w-sm">
      <h1>{title}</h1>
      {intro && <p className="mt-2 text-muted">{intro}</p>}
      <div className="panel mt-6 p-6">{children}</div>
      <p className="mt-4 text-center text-sm text-muted">{footer}</p>
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
  const [form, setForm] = useState({ fullName: "", studentId: "", email: "", password: "" });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      signIn(await api.register({ ...form, studentId: form.studentId || undefined }));
      navigate("/", { replace: true });
    });
  };

  return (
    <AuthShell
      title="Create your account"
      intro="Your account lets you register for elections. Your ballot itself is never linked to it."
      footer={<>Already have an account? <Link to="/login" className="btn-link">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="label">Full name</label>
          <input id="fullName" autoComplete="name" required className="field" value={form.fullName} onChange={set("fullName")} />
        </div>
        <div>
          <label htmlFor="studentId" className="label">Student ID</label>
          <input id="studentId" className="field" value={form.studentId} onChange={set("studentId")} />
          <p className="mt-1 text-xs text-muted">The election officer uses this to check you're eligible.</p>
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" required className="field" value={form.email} onChange={set("email")} />
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
