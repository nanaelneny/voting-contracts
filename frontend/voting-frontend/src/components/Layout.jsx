import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";

function Mark() {
  // A ballot box with a slot, and a ballot with a blue thumbprint going in: the app's mark.
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect x="3" y="12" width="26" height="17" rx="5" fill="var(--color-ink)" />
      <rect x="9" y="15.5" width="14" height="2" rx="1" fill="var(--color-paper)" opacity="0.5" />
      <rect x="10" y="3" width="12" height="11.5" rx="2" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="1.6" />
      <ellipse cx="16" cy="8.4" rx="2.5" ry="3" fill="var(--color-accent)" />
    </svg>
  );
}

const navClass = ({ isActive }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? "bg-fill text-ink" : "text-muted hover:text-ink"}`;

export default function Layout() {
  const { user, signOut } = useAuth();
  const { organisationName } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-full focus:bg-sheet focus:px-4 focus:py-2 focus:shadow-soft">
        Skip to content
      </a>
      <header className="frosted sticky top-0 z-20 border-b border-ink/[0.07]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
          <Link to="/" className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-tight">
            <Mark />
            Secret Ballot
          </Link>
          {organisationName && (
            <span className="-ml-2 hidden text-sm text-muted sm:inline">{organisationName}</span>
          )}
          <nav className={`items-center gap-1 ${user ? "flex" : "hidden sm:flex"}`} aria-label="Main">
            <NavLink to="/" end className={navClass}>Elections</NavLink>
            {user?.role === "admin" && <NavLink to="/admin" className={navClass}>Manage</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-muted sm:inline">{user.fullName}</span>
                <button
                  type="button"
                  className="btn-secondary px-3.5 py-1.5 text-sm"
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
                <Link to="/login" className="font-medium text-muted transition-colors hover:text-ink">Log in</Link>
                <Link to="/register" className="btn-primary px-3.5 py-1.5 text-sm">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" key={location.pathname} className="animate-page mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
        <Outlet />
      </main>
    </div>
  );
}
