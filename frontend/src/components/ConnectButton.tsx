'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { formatAddress } from '@/lib/utils';

/**
 * Drop-in replacement for RainbowKit's ConnectButton.
 *
 * Privy has no prebuilt button — login() opens its modal, and wagmi picks the
 * account up from there, so every useAccount/useWalletClient call site is
 * unchanged.
 */
export function ConnectButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={authenticated ? logout : login}
      className="btn-primary disabled:opacity-50"
    >
      {!ready ? 'Loading…' : authenticated ? address ? formatAddress(address) : 'Disconnect' : 'Connect Wallet'}
    </button>
  );
}
