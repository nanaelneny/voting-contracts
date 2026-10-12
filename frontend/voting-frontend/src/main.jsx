import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import { PageLoading } from "./components/ui";
import ElectionsPage from "./pages/ElectionsPage";
import ElectionPage from "./pages/ElectionPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { AdminHome, NewElection, RelayStats } from "./pages/admin/AdminPages";
import ManageElection from "./pages/admin/ManageElection";

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== "admin") return <p className="text-muted">This page is for election officers.</p>;
  return children;
}

function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p className="mt-2 text-muted">
        <Link to="/" className="btn-link">Go to the elections list</Link>
      </p>
    </div>
  );
}

function App() {
  const { loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ElectionsPage />} />
        <Route path="elections/:id" element={<ElectionPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="admin" element={<AdminOnly><AdminHome /></AdminOnly>} />
        <Route path="admin/elections/new" element={<AdminOnly><NewElection /></AdminOnly>} />
        <Route path="admin/elections/:id" element={<AdminOnly><ManageElection /></AdminOnly>} />
        <Route path="admin/stats" element={<AdminOnly><RelayStats /></AdminOnly>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
