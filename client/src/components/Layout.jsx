/**
 * components/Layout.jsx — ShiftSense employer dashboard shell
 *
 * Renders a fixed sidebar + scrollable main content area.
 * Mobile: sidebar hidden behind a hamburger overlay.
 * Desktop: always-visible 240px sidebar.
 *
 * Sidebar contains:
 *   - Wordmark + tagline
 *   - Employer name + plan badge (from Zustand)
 *   - Nav links with active state
 *   - Logout button at bottom
 */

import { useState }               from "react";
import { NavLink, useNavigate }   from "react-router-dom";
import {
  LayoutDashboard, Users, FileBarChart2,
  User, LogOut, Menu, X, ShieldCheck,
  ChevronRight,
}                                 from "lucide-react";

import useAuthStore from "@/store/authStore";

// ─── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/workers",   label: "Workers",   Icon: Users },
  { to: "/reports",   label: "Reports",   Icon: FileBarChart2 },
  { to: "/profile",   label: "Profile",   Icon: User },
];

// ─── Plan badge ────────────────────────────────────────────────────────────────
const PlanBadge = ({ plan }) => (
  <span
    className="text-xs font-bold tracking-widest px-2 py-0.5 uppercase"
    style={{
      fontFamily:   "var(--font-display)",
      background:   plan === "pro" ? "var(--accent)" : "var(--bg-elevated)",
      color:        plan === "pro" ? "#000"          : "var(--text-muted)",
      border:       plan === "pro" ? "none"          : "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
    }}
  >
    {plan === "pro" ? "● PRO" : "FREE"}
  </span>
);

// ─── Sidebar content (shared between desktop + mobile overlay) ─────────────────
const SidebarContent = ({ onNavClick }) => {
  const navigate  = useNavigate();
  const employer  = useAuthStore((s) => s.employer);
  const logout    = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Wordmark ─────────────────────────────────────────────────────── */}
      <div
        className="px-5 pt-6 pb-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="text-lg font-bold tracking-[0.18em] uppercase"
          style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
        >
          ShiftSense
        </div>
        <div
          className="text-xs tracking-widest mt-0.5 uppercase"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          Wage Intelligence
        </div>
      </div>

      {/* ── Employer identity strip ──────────────────────────────────────── */}
      {employer && (
        <div
          className="px-5 py-4 flex items-start gap-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {/* Avatar initials */}
          <div
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-xs font-bold"
            style={{
              background:   "var(--accent)",
              color:        "#000",
              fontFamily:   "var(--font-display)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {(employer.company_name ?? "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate leading-tight"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              {employer.company_name}
            </p>
            <div className="mt-1">
              <PlanBadge plan={employer.plan} />
            </div>
          </div>
        </div>
      )}

      {/* ── Nav links ────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150",
                isActive
                  ? "font-semibold"
                  : "font-normal",
              ].join(" ")
            }
            style={({ isActive }) => ({
              fontFamily:   "var(--font-display)",
              background:   isActive ? "var(--accent-glow)" : "transparent",
              color:        isActive ? "var(--accent)"      : "var(--text-secondary)",
              borderRadius: "var(--radius)",
              borderLeft:   isActive ? "2px solid var(--accent)" : "2px solid transparent",
            })}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={15}
                  style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                />
                <span className="flex-1">{label}</span>
                {isActive && (
                  <ChevronRight size={12} style={{ color: "var(--accent)" }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Compliance badge ─────────────────────────────────────────────── */}
      <div
        className="mx-3 mb-3 px-3 py-2.5 flex items-center gap-2"
        style={{
          background:   "rgba(240,165,0,0.06)",
          border:       "1px solid rgba(240,165,0,0.2)",
          borderRadius: "var(--radius)",
        }}
      >
        <ShieldCheck size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <p
          className="text-xs leading-tight"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          Minimum Wages Act 1948
          <br />compliant
        </p>
      </div>

      {/* ── Logout ───────────────────────────────────────────────────────── */}
      <div className="px-3 pb-5" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleLogout}
          className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150"
          style={{
            fontFamily:   "var(--font-display)",
            color:        "var(--text-muted)",
            borderRadius: "var(--radius)",
            background:   "transparent",
            border:       "none",
            cursor:       "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color      = "#f85149";
            e.currentTarget.style.background = "rgba(248,81,73,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color      = "var(--text-muted)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <LogOut size={15} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};

// ─── Layout ────────────────────────────────────────────────────────────────────
const Layout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-60 flex-shrink-0 h-full overflow-hidden"
        style={{
          background:  "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <SidebarContent onNavClick={undefined} />
      </aside>

      {/* ── Mobile overlay backdrop ──────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 z-50 h-full w-72 flex flex-col lg:hidden transition-transform duration-300"
        style={{
          background:   "var(--bg-surface)",
          borderRight:  "1px solid var(--border)",
          transform:    mobileOpen ? "translateX(0)" : "translateX(-100%)",
          boxShadow:    mobileOpen ? "4px 0 40px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded"
          style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "none", cursor: "pointer" }}
        >
          <X size={16} />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} />
      </aside>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header
          className="lg:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{
            background:   "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded"
            style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "none", cursor: "pointer" }}
          >
            <Menu size={18} />
          </button>
          <span
            className="text-sm font-bold tracking-widest uppercase"
            style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
          >
            ShiftSense
          </span>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto" style={{ padding: "0" }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
