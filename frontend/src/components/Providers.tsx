'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/toast';
import { WalletProvider } from '@/lib/wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session; created lazily so it survives re-renders.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 2_000 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ToastProvider>{children}</ToastProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
