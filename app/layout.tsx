import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Dashboard Conversacional | People Analytics',
  description:
    'Dashboard executivo de turnover potencializado por IA conversacional. ' +
    'Respostas, não apenas gráficos.',
  openGraph: {
    title: 'Dashboard Conversacional | People Analytics',
    description: 'Dashboards que entregam respostas, não apenas gráficos.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
