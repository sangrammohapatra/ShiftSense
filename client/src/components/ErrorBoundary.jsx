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

import { AlertTriangle } from "lucide-react";
import { Component } from "react";
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

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
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCode: Date.now().toString(36).toUpperCase(),
    });
    window.location.href = "/dashboard";
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, errorCode } = this.state;
    const isProd = import.meta.env.PROD;

    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: 6,
          bgcolor: "background.default",
          backgroundImage:
            "radial-gradient(circle at top right, rgba(240,165,0,0.12), transparent 24%), radial-gradient(circle at bottom left, rgba(88,166,255,0.12), transparent 20%)",
        }}
      >
        <Container maxWidth="sm">
          <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 1 }}>
            <Stack spacing={3}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: 1,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha("#f85149", 0.14),
                  color: "error.main",
                }}
              >
                <AlertTriangle size={24} />
              </Box>

              <Box>
                <Typography variant="h5">Something went wrong</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  An unexpected error occurred in the ShiftSense dashboard. Your
                  data is safe; this is a display error only.
                </Typography>
              </Box>

              {!isProd && error ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 1,
                    bgcolor: alpha("#ffffff", 0.03),
                  }}
                >
                  <Typography variant="overline" color="text.secondary">
                    Error details (development only)
                  </Typography>
                  <Typography
                    component="pre"
                    sx={{
                      mt: 1.5,
                      mb: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "error.main",
                      fontSize: 12,
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {error.toString()}
                    {errorInfo?.componentStack}
                  </Typography>
                </Paper>
              ) : null}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  onClick={this.handleReset}
                  variant="contained"
                  sx={{ flex: 1, borderRadius: 10 }}
                >
                  Return to Dashboard
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outlined"
                  color="inherit"
                  sx={{ borderRadius: 10 }}
                >
                  Reload
                </Button>
              </Stack>

              <Typography
                variant="caption"
                sx={{
                  textAlign: "center",
                  color: "text.secondary",
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
              >
                If this keeps happening, contact support with error code: {errorCode}
              </Typography>
            </Stack>
          </Paper>
        </Container>
      </Box>
    );
  }
}

export default ErrorBoundary;
