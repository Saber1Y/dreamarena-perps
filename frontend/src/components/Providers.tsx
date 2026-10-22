'use client';

import * as React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
// WagmiProvider must come from @privy-io/wagmi so wagmi reads Privy's connector state.
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, somniaTestnet } from '@/lib/web3';
import { ToastProvider } from '@/components/toast';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''}
      config={{
        // Somnia is not one of Privy's built-ins, so hand it the same chain
        // object wagmi uses. These two lists must agree or transactions land
        // on the wrong network.
        defaultChain: somniaTestnet,
        supportedChains: [somniaTestnet],
        loginMethods: ['wallet', 'email'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        appearance: { theme: 'dark', accentColor: '#8e47ff' },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
