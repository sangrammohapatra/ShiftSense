import { alpha, createTheme } from "@mui/material/styles";

const accent = "#f0a500";
const accentSoft = alpha(accent, 0.16);
const surface = "#161b22";
const elevated = "#1f2732";
const border = "rgba(255, 255, 255, 0.08)";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: accent,
      dark: "#b37a00",
      light: "#ffc94a",
      contrastText: "#0d1117",
    },
    secondary: {
      main: "#58a6ff",
    },
    background: {
      default: "#0d1117",
      paper: surface,
    },
    text: {
      primary: "#e6edf3",
      secondary: "#98a6b7",
    },
    divider: border,
    error: {
      main: "#f85149",
    },
    success: {
      main: "#3fb950",
    },
    warning: {
      main: accent,
    },
    info: {
      main: "#58a6ff",
    },
  },
  shape: {
    borderRadius: 18,
  },
  spacing: 8,
  typography: {
    fontFamily: '"IBM Plex Sans", sans-serif',
    h1: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h2: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h3: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
    },
    h4: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
    },
    h5: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
    },
    h6: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 700,
    },
    button: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 600,
      textTransform: "none",
      letterSpacing: "0.01em",
    },
    overline: {
      fontFamily: '"IBM Plex Mono", monospace',
      fontWeight: 600,
      letterSpacing: "0.14em",
    },
    caption: {
      color: "#7f8b99",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: "100%",
        },
        body: {
          minHeight: "100%",
          backgroundColor: "#0d1117",
          backgroundImage:
            "radial-gradient(circle at top right, rgba(240,165,0,0.14), transparent 28%), radial-gradient(circle at bottom left, rgba(88,166,255,0.12), transparent 24%)",
        },
        "#root": {
          minHeight: "100%",
        },
        "*::-webkit-scrollbar": {
          width: 10,
          height: 10,
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(255, 255, 255, 0.14)",
          borderRadius: 10,
          border: "2px solid transparent",
          backgroundClip: "padding-box",
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: "transparent",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${border}`,
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.22)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha(surface, 0.96),
          backdropFilter: "blur(16px)",
          borderRight: `1px solid ${border}`,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        containedPrimary: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        outlined: {
          borderColor: border,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          marginBottom: 4,
          "&.Mui-selected": {
            backgroundColor: accentSoft,
            border: `1px solid ${alpha(accent, 0.18)}`,
          },
          "&.Mui-selected:hover": {
            backgroundColor: alpha(accent, 0.22),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 600,
          letterSpacing: "0.04em",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "0.72rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#7f8b99",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${border}`,
          backgroundColor: elevated,
        },
      },
    },
  },
});

export default theme;
