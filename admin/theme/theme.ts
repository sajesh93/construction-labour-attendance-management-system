'use client';

import { createTheme } from '@mui/material/styles';

// Material 3-aligned palette.
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1f6feb' },
    secondary: { main: '#6750a4' },
    background: { default: '#f6f7f9' },
    success: { main: '#2e7d32' },
    warning: { main: '#ed6c02' },
    error: { main: '#d32f2f' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Roboto, system-ui, Arial, sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
