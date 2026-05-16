/**
 * components/ui/AuthShell.jsx — Outer layout wrapper for auth pages
 *
 * Renders the dark grid background, the ShiftSense wordmark, and centres
 * the card. All auth pages (Login, Register) use this as their root element.
 */

const AuthShell = ({ children }) => (
  <div
    className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
    style={{
      background: "var(--bg-base)",
      backgroundImage: `
        linear-gradient(rgba(240,165,0,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(240,165,0,0.03) 1px, transparent 1px)
      `,
      backgroundSize: "40px 40px",
    }}
  >
    {/* Wordmark */}
    <div className="mb-8 text-center">
      <div
        className="text-2xl font-bold tracking-[0.2em] uppercase"
        style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}
      >
        ShiftSense
      </div>
      <div
        className="text-xs tracking-widest mt-1 uppercase"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
      >
        Wage Intelligence Platform
      </div>
    </div>

    {/* Card */}
    <div
      className="ss-card auth-card w-full max-w-md p-8"
      style={{
        boxShadow: "0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>

    {/* Footer */}
    <p
      className="mt-6 text-xs text-center"
      style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
    >
      © {new Date().getFullYear()} ShiftSense · Compliant with Minimum Wages Act 1948
    </p>
  </div>
);

export default AuthShell;
