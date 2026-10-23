import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Sora } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

// Prices, sizes and PnL need fixed-width digits so columns do not jitter.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DreamArena Perps | Leverage challenges on Somnia',
  description:
    'Trade real dreamDEX perps and take on Survivor, Streak and Boss runs. Somnia Reactivity scores every run on-chain, in the block your position changes.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'DreamArena Perps',
    description: 'Leverage challenges on dreamDEX perps, scored on-chain by Somnia Reactivity.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#faf8f4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${mono.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
