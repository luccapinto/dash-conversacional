import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import { ProvedorIA } from '@/components/ia/ProvedorIA';
import './globals.css';

// next/font: baixadas no build e servidas pelo próprio app (nada de CDN em runtime)
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const serifa = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: 'Verta S.A. · People Analytics',
  description: 'Acompanhamento macro padronizado, deep dive conversacional sobre qualquer indicador e uma IA que destaca e organiza a leitura. A IA decide a apresentação; o código decide os números.',
  openGraph: {
    title: 'Verta S.A. · People Analytics',
    description: 'O futuro do data viz na era da IA: painel de People Analytics com deep dive conversacional.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0e11' },
  ],
};

// Tema antes da primeira pintura: ?tema=escuro|claro (links e prints) ou a escolha salva
const TEMA = `(function(){try{var q=new URLSearchParams(location.search).get('tema');var t=q||localStorage.getItem('tema');if(t==='escuro'||t==='claro')document.documentElement.dataset.tema=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-tema="claro" className={`${geist.variable} ${serifa.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body>
        <ProvedorIA>{children}</ProvedorIA>
      </body>
    </html>
  );
}
