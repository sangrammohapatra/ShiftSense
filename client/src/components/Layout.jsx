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

import { useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";

import useAuthStore from "@/store/authStore";

const DRAWER_WIDTH = 280;

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/workers", label: "Workers", Icon: Users },
  { to: "/reports", label: "Reports", Icon: FileBarChart2 },
  { to: "/profile", label: "Profile", Icon: User },
];

const isSelectedPath = (pathname, to) =>
  pathname === to || pathname.startsWith(`${to}/`);

const PlanBadge = ({ plan }) => {
  const theme = useTheme();
  const isPro = String(plan).toLowerCase() === "pro";

  return (
    <Chip
      size="small"
      label={isPro ? "PRO" : "FREE"}
      color={isPro ? "primary" : "default"}
      sx={{
        borderRadius: 10,
        bgcolor: isPro ? theme.palette.primary.main : alpha("#fff", 0.04),
        color: isPro ? theme.palette.primary.contrastText : "text.secondary",
        border: isPro ? "none" : `1px solid ${theme.palette.divider}`,
      }}
    />
  );
};

const SidebarContent = ({ onClose }) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const employer = useAuthStore((state) => state.employer);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        p: 2,
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        sx={{ px: 1, pt: 1, pb: 2 }}
      >
        <Box>
          {/* <Typography variant="overline" sx={{ color: "primary.main" }}>
            ShiftSense
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Wage Intelligence
          </Typography> */}
          <img
            src="./shiftsense.png"
            alt="ShiftSense Logo"
            style={{ width: 62, height: 62, marginBottom: 4 }}
          />
        </Box>
        <IconButton
          onClick={onClose}
          sx={{ display: { lg: "none" }, color: "text.secondary" }}
        >
          <X size={18} />
        </IconButton>
      </Stack>

      {employer && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            borderColor: alpha(theme.palette.primary.main, 0.18),
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              sx={{
                width: 44,
                height: 44,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                fontFamily: '"IBM Plex Mono", monospace',
                fontWeight: 700,
              }}
            >
              {(employer.company_name ?? "?").charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Tooltip title={employer.company_name} placement="top">
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                  {employer.company_name}
                </Typography>
              </Tooltip>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mt: 0.75 }}
              >
                <PlanBadge plan={employer.plan} />
                <Typography variant="caption">Employer Console</Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      )}

      <List sx={{ px: 0, flexGrow: 1 }}>
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const selected = isSelectedPath(location.pathname, to);

          return (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              selected={selected}
              onClick={onClose}
              sx={{
                px: 1.5,
                py: 1.25,
                color: selected ? "primary.main" : "text.secondary",
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  color: selected ? "primary.main" : "text.secondary",
                }}
              >
                <Icon size={18} />
              </ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 14,
                  fontWeight: selected ? 700 : 500,
                }}
              />
              {selected ? <ChevronRight size={16} /> : null}
            </ListItemButton>
          );
        })}
      </List>

      <Paper
        variant="outlined"
        sx={{
          p: 1.75,
          mb: 2,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.success.main, 0.07),
          borderColor: alpha(theme.palette.success.main, 0.18),
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <ShieldCheck size={18} color={theme.palette.success.main} />
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "success.main", display: "block", lineHeight: 1.2 }}
            >
              Compliance Ready
            </Typography>
            <Typography variant="caption">
              Minimum Wages Act workflows are active for this workspace.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Divider sx={{ borderColor: "divider", mb: 2 }} />

      <Button
        onClick={handleLogout}
        variant="outlined"
        color="error"
        startIcon={<LogOut size={16} />}
        sx={{
          justifyContent: "flex-start",
          borderRadius: 1,
          py: 1.2,
        }}
      >
        Log Out
      </Button>
    </Box>
  );
};

const Layout = ({ children }) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleClose = () => {
    if (!isDesktop) {
      setMobileOpen(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Box
        component="nav"
        sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
            },
          }}
        >
          <SidebarContent onClose={handleClose} />
        </Drawer>

        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", lg: "block" },
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          <SidebarContent />
        </Drawer>
      </Box>

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{
            display: { xs: "block", lg: "none" },
            borderBottom: `1px solid ${theme.palette.divider}`,
            backdropFilter: "blur(18px)",
            bgcolor: alpha(theme.palette.background.paper, 0.86),
          }}
        >
          <Toolbar sx={{ minHeight: 72, px: 2 }}>
            <IconButton
              onClick={() => setMobileOpen(true)}
              color="inherit"
              edge="start"
              sx={{
                mr: 1.5,
                bgcolor: alpha(theme.palette.common.white, 0.04),
              }}
            >
              <Menu size={18} />
            </IconButton>
            <Box>
              <Typography variant="overline" sx={{ color: "primary.main" }}>
                ShiftSense
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", lineHeight: 1.2 }}
              >
                Employer workspace
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            pb: 4,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
