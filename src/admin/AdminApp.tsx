import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  ReceiptText,
  ClipboardList,
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import icon from "../assets/Icon-web.png";
import { AdminProvider, useAdmin } from "./context";
import AuthPages from "./AuthPages";
import OverviewPage from "./OverviewPage";
import LocationsPage from "./LocationsPage";
import MaintenancePage from "./MaintenancePage";
import CreditsPage from "./CreditsPage";
import TopupRefundsPage from "./TopupRefundsPage";
import CustomerMfaRecoveryPage from "./CustomerMfaRecoveryPage";
import TeamPage from "./TeamPage";
import TransactionsPage from "./TransactionsPage";
import AuditPage from "./AuditPage";
import { Loading, Notice } from "./ui";
import type { AdminApi, Identity } from "./types";
import { canAccessPage, portalRole } from "./permissions";
import "./admin.css";

const nav = [
  { path: "", label: "Overview", icon: LayoutDashboard },
  { path: "/locations", label: "Locations & Machines", icon: Building2 },
  { path: "/maintenance", label: "Maintenance", icon: Wrench },
  { path: "/refunds", label: "Loyalty Credits", icon: CircleDollarSign },
  { path: "/topup-refunds", label: "Top-Up Refunds", icon: ReceiptText },
  { path: "/account-recovery", label: "Account Recovery", icon: ShieldCheck },
  { path: "/transactions", label: "Transactions", icon: ReceiptText },
  { path: "/employees", label: "Team", icon: Users },
  { path: "/audit", label: "Audit Log", icon: ClipboardList },
];
function Workspace() {
  const { identity, loading, error, refresh, signOut, preview } = useAdmin();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(location.pathname);
  const [logoutError, setLogoutError] = useState("");
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  if (menuPathname !== location.pathname) {
    setMenuPathname(location.pathname);
    setOpen(false);
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const changed = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const menuTrigger = menuRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      menuTrigger?.focus();
    };
  }, [open, mobile]);
  const base = preview ? "/admin/preview" : "/home";
  const role = portalRole(identity);
  const home = role === "Maintenance" ? `${base}/maintenance` : base;
  const current =
    nav.find((item) => item.path && location.pathname.endsWith(item.path)) ??
    nav[0]!;
  useEffect(() => {
    document.title = `${current.label} · CleanStream Admin`;
  }, [location.pathname, current.label]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  if (loading)
    return (
      <div className="admin-portal">
        <Loading />
      </div>
    );
  if (!identity && error)
    return (
      <div className="admin-portal ap-access">
        <h1>Workspace access unavailable</h1>
        <Notice>{error}</Notice>
        <p>
          Your account must have Owner, Manager, or Maintenance access. No workspace data has
          been loaded.
        </p>
        <button className="ap-button ap-primary" onClick={() => void refresh()}>
          Retry access check
        </button>
        <button
          className="ap-button"
          onClick={() => void signOut().catch((e) => setLogoutError(String(e)))}
        >
          Sign out
        </button>
        {logoutError && <Notice>{logoutError}</Notice>}
        <Link to="/admin">Return to sign in</Link>
      </div>
    );
  if (!identity || !role) return <Navigate to="/admin" replace />;
  return (
    <div className="admin-portal ap-shell">
      <a className="ap-skip" href="#admin-main">
        Skip to content
      </a>
      {open && (
        <button
          className="ap-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`ap-sidebar ${open ? "is-open" : ""}`}
        inert={mobile && !open ? true : undefined}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-hidden={mobile && !open ? true : undefined}
        aria-label={mobile ? "Workspace navigation" : undefined}
        onKeyDown={(event) => {
          if (!mobile || !open || event.key !== "Tab") return;
          const elements = sidebarRef.current?.querySelectorAll<HTMLElement>(
            "a,button:not(:disabled)",
          );
          if (!elements?.length) return;
          const first = elements[0]!;
          const last = elements[elements.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <Link className="ap-brand" to={home}>
          <img src={icon} alt="" />
          <span>
            CleanStream<small>OPERATIONS</small>
          </span>
        </Link>
        <button
          className="ap-mobile-close ap-icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <p className="ap-nav-heading">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav
            .filter((item) => item.path !== "/account-recovery" || (!preview && identity.role === "Owner"))
            .filter((item) => canAccessPage(identity, item.path))
            .map((item) => (
              <NavLink
                key={item.path}
                to={`${base}${item.path}`}
                end={!item.path}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="ap-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            View public website
            <ArrowUpRight size={16} />
          </a>
          <div className="ap-user">
            <span className="ap-avatar">
              {(identity.name || identity.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{identity.name || identity.email}</strong>
              <small>{role} account</small>
            </div>
          </div>
          <button
            onClick={() =>
              void signOut().catch((e) => setLogoutError(String(e)))
            }
            disabled={preview}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="ap-workspace" inert={mobile && open ? true : undefined}>
        <header className="ap-topbar">
          <div>
            <button
              ref={menuRef}
              className="ap-mobile-menu ap-icon-button"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <span className="ap-breadcrumb">/</span>
            <strong>{current.label}</strong>
          </div>
          <span className="ap-access-label">
            <span />
            {preview ? `Sample ${role} workspace` : `${role} access`}
          </span>
        </header>
        <main id="admin-main" className="ap-main" tabIndex={-1}>
          {preview && (
            <Notice kind="info">
              Interactive preview · Synthetic data only. Changes are temporary
              and no emails or payments are sent.
            </Notice>
          )}
          {logoutError && <Notice>{logoutError}</Notice>}
          <Routes key={`${identity.id}:${role}`}>
            <Route index element={canAccessPage(identity, "") ? <OverviewPage base={base} /> : <Navigate to={home} replace />} />
            <Route path="locations" element={canAccessPage(identity, "/locations") ? <LocationsPage /> : <Navigate to={home} replace />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="refunds" element={canAccessPage(identity, "/refunds") ? <CreditsPage /> : <Navigate to={home} replace />} />
            <Route path="topup-refunds" element={canAccessPage(identity, "/topup-refunds") ? <TopupRefundsPage /> : <Navigate to={home} replace />} />
            <Route path="account-recovery" element={canAccessPage(identity, "/account-recovery") && !preview ? <CustomerMfaRecoveryPage /> : <Navigate to={home} replace />} />
            <Route path="transactions" element={canAccessPage(identity, "/transactions") ? <TransactionsPage /> : <Navigate to={home} replace />} />
            <Route
              path="audit"
              element={
                canAccessPage(identity, "/audit") ? (
                  <AuditPage />
                ) : (
                  <Navigate to={home} replace />
                )
              }
            />
            <Route
              path="employees"
              element={
                canAccessPage(identity, "/employees") ? (
                  <TeamPage />
                ) : (
                  <Navigate to={home} replace />
                )
              }
            />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>
        <footer className="ap-workspace-footer">
          CleanStream Laundry Solutions<span>Operations workspace</span>
        </footer>
      </div>
    </div>
  );
}
export function AdminWorkspace({
  fixture,
}: {
  fixture?: { api: AdminApi; identity: Identity };
}) {
  return (
    <AdminProvider {...(fixture ? { fixture } : {})}>
      <Workspace />
    </AdminProvider>
  );
}
export function AdminAuth() {
  return (
    <AdminProvider>
      <AuthPages />
    </AdminProvider>
  );
}
