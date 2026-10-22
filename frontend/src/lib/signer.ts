import type { WalletClient } from 'viem';
import type { Address } from 'viem';

/**
 * The wallet client, or an error that says which half is missing.
 *
 * `useAccount().address` and `useWalletClient()` do not arrive together: Privy
 * publishes the address as soon as the user authenticates, while wagmi's
 * wallet client stays undefined until the connector can actually sign. A UI
 * gated on the address alone therefore renders a live button that has nothing
 * to sign with, and a guard that bails without setting an error state turns
 * that into a button which does nothing at all when clicked.
 *
 * Call this inside the try, so the message reaches the error state.
 */
export function requireSigner(
  walletClient: WalletClient | undefined,
  address: Address | undefined,
): WalletClient {
  if (walletClient) return walletClient;
  throw new Error(
    address
      ? 'Your wallet is connected but cannot sign yet. Give it a moment, or disconnect and connect again.'
      : 'Connect a wallet first.',
  );
}
