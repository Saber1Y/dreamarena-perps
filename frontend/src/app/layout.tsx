import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DreamArena | Prediction Arcade on Somnia',
  description: 'A gamified prediction arcade where every move is a DreamDEX Event Contract trade, settled via Somnia Reactivity in the same block.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${sora.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
