import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';

import './globals.css';

const font = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TailTag Admin',
  description: 'Admin dashboard for TailTag operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="bg-background text-slate-100">{children}</body>
    </html>
  );
}
