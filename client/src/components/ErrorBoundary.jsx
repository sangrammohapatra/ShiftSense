/**
 * components/ErrorBoundary.jsx — React error boundary
 *
 * Catches unhandled JavaScript errors anywhere in the component tree and
 * renders a friendly fallback UI instead of a blank/crashed screen.
 *
 * Usage (in main.jsx, wrapping the entire app):
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * React error boundaries must be class components — the `componentDidCatch`
 * and `getDerivedStateFromError` lifecycle methods are not available in hooks.
 *
 * What it catches:
 *   - Rendering errors in child components
 *   - Errors in lifecycle methods
 *   - Errors in constructors of child components
 *
 * What it does NOT catch (handled by the browser/framework):
 *   - Event handlers (use try/catch inside handlers)
 *   - Async code (Promise rejections, setTimeout)
 *   - Errors in the error boundary itself
 *   - Server-side rendering errors
 */

import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError:    false,
      error:       null,
      errorInfo:   null,
    };
  }

  /**
   * Update state when an error is thrown during rendering.
   * This runs during the render phase — do not cause side effects here.
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /**
   * Called after an error has been thrown. Use for logging/reporting.
   * `errorInfo.componentStack` contains the React component stack trace.
   */
  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });

    // TODO: send to error tracking service (Sentry, Datadog, etc.)
    // if (window.Sentry) Sentry.captureException(error, { extra: errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Navigate to home as a clean reset
    window.location.href = "/dashboard";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo } = this.state;
    const isProd = import.meta.env.PROD;

    return (
      <div
        style={{
          minHeight:      "100vh",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "2rem",
          background:     "var(--bg-base)",
          backgroundImage: `
            linear-gradient(rgba(240,165,0,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(240,165,0,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      >
        <div
          style={{
            maxWidth:     "480px",
            width:        "100%",
            background:   "var(--bg-surface)",
            border:       "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding:      "2rem",
            boxShadow:    "0 24px 64px rgba(0,0,0,0.4)",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width:        "48px",
              height:       "48px",
              background:   "rgba(248,81,73,0.12)",
              borderRadius: "var(--radius)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              marginBottom: "1rem",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="#f85149" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          {/* Heading */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   "1.1rem",
              fontWeight: 700,
              color:      "var(--text-primary)",
              margin:     "0 0 0.5rem",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize:   "0.875rem",
              color:      "var(--text-secondary)",
              margin:     "0 0 1.5rem",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred in the ShiftSense dashboard.
            Your data is safe — this is a display error only.
          </p>

          {/* Error detail (dev only) */}
          {!isProd && error && (
            <details
              style={{
                marginBottom: "1.5rem",
                background:   "var(--bg-elevated)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding:      "0.75rem",
              }}
            >
              <summary
                style={{
                  cursor:     "pointer",
                  fontSize:   "0.75rem",
                  color:      "var(--text-muted)",
                  fontFamily: "var(--font-display)",
                  userSelect: "none",
                }}
              >
                Error details (development only)
              </summary>
              <pre
                style={{
                  marginTop:  "0.75rem",
                  fontSize:   "0.7rem",
                  color:      "#f85149",
                  overflow:   "auto",
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-display)",
                  lineHeight: 1.5,
                }}
              >
                {error.toString()}
                {errorInfo?.componentStack}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={this.handleReset}
              style={{
                flex:         1,
                background:   "var(--accent)",
                color:        "#000",
                border:       "none",
                borderRadius: "var(--radius-sm)",
                padding:      "0.625rem 1rem",
                fontSize:     "0.8125rem",
                fontWeight:   600,
                fontFamily:   "var(--font-display)",
                cursor:       "pointer",
                letterSpacing: "0.05em",
              }}
            >
              Return to Dashboard
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background:   "transparent",
                color:        "var(--text-secondary)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding:      "0.625rem 1rem",
                fontSize:     "0.8125rem",
                fontFamily:   "var(--font-display)",
                cursor:       "pointer",
              }}
            >
              Reload
            </button>
          </div>

          {/* Footer */}
          <p
            style={{
              marginTop:  "1.5rem",
              fontSize:   "0.7rem",
              color:      "var(--text-muted)",
              fontFamily: "var(--font-display)",
              textAlign:  "center",
            }}
          >
            If this keeps happening, contact support with error code:{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {Date.now().toString(36).toUpperCase()}
            </span>
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
