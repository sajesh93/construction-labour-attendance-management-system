'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  Button,
  Chip,
} from '@mui/material';
import { Me } from '@/lib/types';
import { navForRole, roleLabel } from '@/lib/rbac';
import { SosBanner } from '@/components/SosBanner';

const DRAWER_WIDTH = 240;

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = navForRole(me.role);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }} color="default" elevation={1}>
        <Toolbar>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            style={{ height: 34, width: 'auto', maxWidth: 150, objectFit: 'contain', marginRight: 12 }}
          />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            CLAMS Admin
          </Typography>
          {me.fullName.trim().toLowerCase() !== roleLabel(me.role).trim().toLowerCase() && (
            <Chip label={roleLabel(me.role)} size="small" sx={{ mr: 2 }} />
          )}
          <Typography variant="body2" sx={{ mr: 2 }}>
            {me.fullName}
          </Typography>
          <Button onClick={logout} variant="outlined" size="small">
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <ListItemButton
                key={item.href}
                selected={active}
                onClick={() => router.push(item.href)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      {/* minWidth:0 lets the main column shrink so wide content (e.g. report
          tables) scrolls inside its own container instead of widening the page. */}
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: 3, mt: 8 }}>
        <SosBanner />
        {children}
      </Box>
    </Box>
  );
}
