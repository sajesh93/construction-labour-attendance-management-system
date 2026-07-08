'use client';

import { createTheme, alpha } from '@mui/material/styles';

/**
 * CLAMS design tokens — calm, professional construction-ops palette.
 * Slate neutrals, deep indigo primary, restrained status colors.
 */
export const tokens = {
  primary: '#3E5BA9', // steel indigo
  primaryDark: '#2F4685',
  accent: '#B7791F', // safety amber, used sparingly
  bg: '#F4F5F7',
  paper: '#FFFFFF',
  border: '#E3E6EB',
  textPrimary: '#1C2430',
  textSecondary: '#5B6675',
  success: '#1E7F4F',
  warning: '#B7791F',
  error: '#C03434',
  info: '#2B6CB0',
  sidebarBg: '#151C28', // near-black slate — grounds the whole panel
  sidebarText: '#9AA5B5',
  sidebarActive: '#FFFFFF',
};

const fontStack =
  'var(--font-plex), "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.primary, dark: tokens.primaryDark },
    secondary: { main: tokens.accent },
    background: { default: tokens.bg, paper: tokens.paper },
    divider: tokens.border,
    text: { primary: tokens.textPrimary, secondary: tokens.textSecondary },
    success: { main: tokens.success },
    warning: { main: tokens.warning },
    error: { main: tokens.error },
    info: { main: tokens.info },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: fontStack,
    h4: { fontWeight: 650, letterSpacing: '-0.02em' },
    h5: { fontWeight: 650, letterSpacing: '-0.015em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    body2: { lineHeight: 1.55 },
    button: { fontWeight: 600 },
    caption: { letterSpacing: 0 },
    overline: { fontWeight: 600, letterSpacing: '0.08em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.bg },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#C6CCD6',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 8, paddingInline: 14 },
        containedPrimary: {
          '&:hover': { backgroundColor: tokens.primaryDark },
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.border}`,
          boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#FAFBFC',
            color: tokens.textSecondary,
            fontSize: '0.72rem',
            fontWeight: 650,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: `1px solid ${tokens.border}`,
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${tokens.border}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': { borderBottom: 0 },
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(tokens.primary, 0.035) },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
        sizeSmall: { height: 22, fontSize: '0.72rem' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 14, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 650 } },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#232B38', fontSize: '0.75rem', borderRadius: 8 },
        arrow: { color: '#232B38' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10 },
        standardWarning: { border: `1px solid ${alpha(tokens.warning, 0.35)}` },
        standardError: { border: `1px solid ${alpha(tokens.error, 0.3)}` },
        standardSuccess: { border: `1px solid ${alpha(tokens.success, 0.3)}` },
        standardInfo: { border: `1px solid ${alpha(tokens.info, 0.3)}` },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 40 },
      },
    },
  },
});
