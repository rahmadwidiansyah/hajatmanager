"use client";

import { createTheme } from "@mui/material/styles";

// Material 3 Expressive — seed Emerald hajatan (#059669 light / #34d399 dark)
// Secondary slate, tertiary sky. Shape + type selaras Plus Jakarta + Geist.
export const muiTheme = createTheme({
  cssVariables: {
    // Satu-satunya sumber tema = MUI via atribut data-mui-color-scheme di <html>.
    // WAJIB string penuh: shorthand "data" bikin provider pasang atribut
    // data-dark/data-light yang tak didengar CSS mana pun (toggle jadi tak mempan).
    colorSchemeSelector: "data-mui-color-scheme",
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#059669",
          contrastText: "#ffffff",
          light: "#34d399",
          dark: "#047857",
          container: "#d1fae5",
          onContainer: "#064e3b",
        },
        secondary: {
          main: "#64748b",
          contrastText: "#ffffff",
          container: "#e2e8f0",
          onContainer: "#334155",
        },
        tertiary: {
          main: "#0ea5e9",
          contrastText: "#ffffff",
          container: "#e0f2fe",
          onContainer: "#0c4a6e",
        },
        error: {
          main: "#dc2626",
          contrastText: "#ffffff",
          container: "#fee2e2",
          onContainer: "#7f1d1d",
        },
        warning: {
          main: "#d97706",
          contrastText: "#ffffff",
          container: "#fef3c7",
          onContainer: "#92400e",
        },
        background: {
          default: "#f8fafc",
          paper: "#ffffff",
        },
        text: {
          primary: "#0f172a",
          secondary: "#475569",
        },
        divider: "#cbd5e1",
        outline: "#94a3b8",
      } as never,
    },
    dark: {
      palette: {
        primary: {
          main: "#34d399",
          contrastText: "#022c22",
          light: "#6ee7b7",
          dark: "#059669",
          container: "#064e3b",
          onContainer: "#a7f3d0",
        },
        secondary: {
          main: "#94a3b8",
          contrastText: "#0f172a",
          container: "#1e2a3a",
          onContainer: "#cbd5e1",
        },
        tertiary: {
          main: "#38bdf8",
          contrastText: "#082f49",
          container: "#0c4a6e",
          onContainer: "#bae6fd",
        },
        error: {
          main: "#f87171",
          contrastText: "#450a0a",
          container: "#450a0a",
          onContainer: "#fecaca",
        },
        warning: {
          main: "#fbbf24",
          contrastText: "#451a03",
          container: "#451a03",
          onContainer: "#fde68a",
        },
        background: {
          default: "#0a0f1a",
          paper: "#111827",
        },
        text: {
          primary: "#e8eef5",
          secondary: "#94a3b8",
        },
        divider: "#1e2a3a",
        outline: "#475569",
      } as never,
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      "var(--font-plus-jakarta), var(--font-geist-sans), system-ui, sans-serif",
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 44,
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": { borderRadius: 12 },
        },
      },
    },
    MuiDialog: {
      defaultProps: { scroll: "paper" },
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, minHeight: 44 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
  },
});
