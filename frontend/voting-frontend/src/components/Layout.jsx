import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

function Mark() {
  // A ballot box with a slot: the app's mark.
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect x="4" y="12" width="24" height="16" rx="2" fill="var(--color-ink)" />
      <rect x="9" y="15" width="14" height="2.5" rx="1.25" fill="var(--color-paper)" />
      <path d="M11 4h10v9H11z" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="2" />
      <path d="M13.5 8.5l2 2 3.5-4" fill="none" stroke="var(--color-violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const navClass = ({ isActive }) =>
  `rounded px-2 py-1 text-sm font-semibold ${isActive ? "text-violet" : "text-muted hover:text-ink"}`;

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-sheet focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <Mark />
            Secret Ballot
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={navClass}>Elections</NavLink>
            {user?.role === "admin" && <NavLink to="/admin" className={navClass}>Manage</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-muted sm:inline">{user.fullName}</span>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="font-semibold text-muted hover:text-ink">Log in</Link>
                <Link to="/register" className="btn-primary px-3 py-1.5">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-5xl px-4 py-5 text-xs text-muted">
          Ballots are verified with zero-knowledge proofs and counted on the blockchain. Nobody, including the election
          officers, can see who cast which ballot.
        </p>
      </footer>
    </div>
  );
}
