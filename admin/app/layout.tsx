import * as React from 'react';
import type { Metadata } from 'next';
import { Providers } from './providers';
import './print.css';

export const metadata: Metadata = {
  title: 'CLAMS Admin',
  description: 'Construction Labour Attendance Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
