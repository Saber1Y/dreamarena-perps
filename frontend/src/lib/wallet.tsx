'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { EXPLORER, PUBLIC_RPC, hideki } from '@/lib/chain';

// A player's own browser wallet (any EIP-1193 injected wallet). The player
// signs their own runs and orders; nothing here ever leaves their wallet.

export type WalletStatus = 'loading' | 'unsupported' | 'disconnected' | 'connecting' | 'wrong-chain' | 'ready';

interface WalletState {
  status: WalletStatus;
  /** Set once the wallet shared an account, on any chain. */
  address: Address | null;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  /** Forget the wallet in this app; the wallet's own permission stays until revoked there. */
  disconnect: () => void;
  /** Signs as the connected account on Somnia Tokyo; null until status is 'ready'. */
  walletClient: WalletClient | null;
}

const REMEMBER = 'dreamarena.wallet';
const CHAIN_HEX = `0x${hideki.id.toString(16)}`;

/** Reads go straight to the public RPC, which allows browser origins; signing goes through the wallet. */
export const browserClient: PublicClient = createPublicClient({ chain: hideki, transport: http(PUBLIC_RPC, { timeout: 30_000 }) });

const injected = (): EIP1193Provider | null =>
  typeof window !== 'undefined' ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;

const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(REMEMBER, '1');
    else localStorage.removeItem(REMEMBER);
  } catch {
    // storage blocked: the wallet just will not reconnect on reload
  }
};

const remembered = () => {
  try {
    return localStorage.getItem(REMEMBER) === '1';
  } catch {
    return false;
  }
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);

  // Wallets inject after load, so look once mounted, and restore a remembered
  // connection silently (eth_accounts never opens a prompt). A wallet that
  // injects even later announces itself with `ethereum#initialized`.
  useEffect(() => {
    let live = true;
    const detect = async () => {
      const p = injected();
      const restored =
        p && remembered()
          ? await Promise.all([p.request({ method: 'eth_accounts' }), p.request({ method: 'eth_chainId' })]).catch(() => null)
          : null;
      if (!live) return;
      setProvider(p);
      if (restored?.[0][0]) {
        setAddress(getAddress(restored[0][0]));
        setChainId(restored[1]);
      } else if (p) {
        remember(false);
      }
      setStatus(p ? 'disconnected' : 'unsupported');
    };
    const late = () => void detect();
    void detect();
    window.addEventListener('ethereum#initialized', late, { once: true });
    return () => {
      live = false;
      window.removeEventListener('ethereum#initialized', late);
    };
  }, []);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (accounts: string[]) => {
      if (accounts[0]) setAddress(getAddress(accounts[0]));
      else {
        setAddress(null);
        remember(false);
      }
    };
    const onChain = (chain: string) => setChainId(chain);
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [provider]);

  const switchChain = useCallback(async () => {
    if (!provider) return;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (err) {
      // 4902: the wallet does not know the chain yet.
      if ((err as { code?: number }).code !== 4902) throw err;
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: hideki.name,
            nativeCurrency: hideki.nativeCurrency,
            rpcUrls: [PUBLIC_RPC],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    }
    setChainId(await provider.request({ method: 'eth_chainId' }));
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) return;
    setStatus('connecting');
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts[0]) throw new Error('The wallet shared no account.');
      setAddress(getAddress(accounts[0]));
      remember(true);
      setChainId(await provider.request({ method: 'eth_chainId' }));
      await switchChain().catch(() => undefined); // declining leaves the wrong-chain prompt
    } finally {
      setStatus('disconnected');
    }
  }, [provider, switchChain]);

  const disconnect = useCallback(() => {
    remember(false);
    setAddress(null);
  }, []);

  const derived: WalletStatus =
    status === 'loading' || status === 'unsupported' || status === 'connecting'
      ? status
      : !address
        ? 'disconnected'
        : chainId?.toLowerCase() !== CHAIN_HEX
          ? 'wrong-chain'
          : 'ready';

  const walletClient = useMemo(
    () =>
      derived === 'ready' && provider && address
        ? createWalletClient({ account: address, chain: hideki, transport: custom(provider) })
        : null,
    [derived, provider, address],
  );

  const value = useMemo<WalletState>(
    () => ({ status: derived, address, connect, switchChain, disconnect, walletClient }),
    [derived, address, connect, switchChain, disconnect, walletClient],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet needs a WalletProvider.');
  return ctx;
}

const ARENA_REASONS: Record<string, string> = {
  NeedOpenPosition: 'Survivor starts from an open position. Open one in this market first.',
  NeedFlatPosition: 'Streak and Boss start flat. Close your position in this market first.',
  RunActive: 'A run is active. End it first.',
  NoActiveRun: 'There is no active run to end.',
  ArenaUnfunded: 'The arena bond is below the 32 STT Reactivity needs, so new runs are paused until the operator tops it up.',
  InsufficientCredit: 'Not enough gas credit for that.',
  Paused: 'The arena is paused.',
  NotAuthorized: 'This wallet cannot do that for another player.',
  SurvivalOutOfRange: 'Survivor lasts between 5 minutes and 24 hours.',
  StaleSubscription: 'A previous run still holds a subscription. Clean it up first.',
  InvalidPool: 'That market is not a registered dreamDEX perps pool.',
};

/** A wallet or contract failure, in words a player can act on. */
export function walletError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => (e as { code?: number }).code === 4001 || (e as { name?: string }).name === 'UserRejectedRequestError')) {
      return 'You declined the request in your wallet.';
    }
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name) return ARENA_REASONS[name] ?? `The contract refused: ${name}.`;
    }
    if (/insufficient funds/i.test(err.message)) return 'Not enough STT for this transaction and its gas.';
    return err.shortMessage;
  }
  if ((err as { code?: number })?.code === 4001) return 'You declined the request in your wallet.';
  return err instanceof Error ? err.message : String(err);
}
