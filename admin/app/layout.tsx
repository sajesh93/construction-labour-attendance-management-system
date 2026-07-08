import * as React from 'react';
import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { Providers } from './providers';
import './print.css';

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CLAMS Admin',
  description: 'Construction Labour Attendance Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
