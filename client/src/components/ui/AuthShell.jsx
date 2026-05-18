/**
 * components/ui/AuthShell.jsx — Outer layout wrapper for auth pages
 *
 * Renders the dark grid background, the ShiftSense wordmark, and centres
 * the card. All auth pages (Login, Register) use this as their root element.
 */

import { Box, Container, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

const AuthShell = ({ children }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 6,
        backgroundColor: "background.default",
        backgroundImage: `
          linear-gradient(${alpha(theme.palette.primary.main, 0.05)} 1px, transparent 1px),
          linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.05)} 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }}
    >
      <Container maxWidth="sm">
        <Stack spacing={3} alignItems="center">
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h4" sx={{ color: "primary.main", letterSpacing: "0.18em" }}>
              ShiftSense
            </Typography>
            <Typography variant="overline" sx={{ color: "text.secondary" }}>
              Wage Intelligence Platform
            </Typography>
          </Box>

          <Paper
            sx={{
              width: "100%",
              maxWidth: 560,
              p: { xs: 3, sm: 4 },
              borderRadius: 1,
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.4)",
            }}
          >
            {children}
          </Paper>

          <Typography
            variant="caption"
            sx={{
              textAlign: "center",
              color: "text.secondary",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            Copyright {new Date().getFullYear()} ShiftSense. Minimum Wages Act 1948
            aligned.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
};

export default AuthShell;
