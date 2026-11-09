'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createWalletClient, getAddress, http, isAddress, keccak256, parseAbi, toHex, type Address, type Hex, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PUBLIC_RPC, hideki } from '@/lib/chain';
import { browserClient } from '@/lib/wallet';

// dreamDEX keeps a player's paper USDso in its in-app wallet, a smart account
// that only trades through bots the player links with Link a Bot. This is that
// bot, made and kept in the player's own browser: its key never reaches a
// server, and dreamDEX's link lets it place and cancel orders for the wallet,
// never withdraw from it.

export type LinkedBotStatus = 'loading' | 'none' | 'unlinked' | 'ready';

interface LinkedBotState {
  status: LinkedBotStatus;
  /** The bot's address, to link in dreamDEX and to fund with gas. */
  bot: Address | null;
  /** The dreamDEX wallet the bot trades, once its link checks out on-chain. */
  player: Address | null;
  create: () => void;
  /** Checks on-chain that the bot is linked to `wallet` on `pool`, then plays as it. */
  link: (wallet: string, pool: Address) => Promise<void>;
  /** Stop playing as the wallet; the bot key stays. */
  unlink: () => void;
  /** Delete the bot key from this browser. */
  forget: () => void;
  exportKey: () => Hex | null;
  walletClient: WalletClient | null;
}

const KEY = 'dreamarena.bot.key';
const PLAYER = 'dreamarena.bot.player';
const PLACE_ORDER_FOR = keccak256(toHex('placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)')).slice(0, 10) as Hex;
const POOL_ABI = parseAbi(['function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)']);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // storage blocked: the bot lasts until the tab closes
  }
};

/** Whether `bot` may place orders for `wallet` on `pool`: the same check the pool runs. */
export const isLinked = (wallet: Address, bot: Address, pool: Address) =>
  browserClient.readContract({ address: pool, abi: POOL_ABI, functionName: 'isOperatorAuthorized', args: [wallet, bot, PLACE_ORDER_FOR] });

const Ctx = createContext<LinkedBotState | null>(null);

export function LinkedBotProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState<Hex | null>(null);
  const [player, setPlayer] = useState<Address | null>(null);

  // localStorage only exists in the browser, so read it once mounted.
  useEffect(() => {
    let live = true;
    const restore = async () => {
      const k = read(KEY);
      const p = read(PLAYER);
      if (!live) return;
      setKey(k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null);
      setPlayer(p && isAddress(p) ? getAddress(p) : null);
      setLoaded(true);
    };
    void restore();
    return () => {
      live = false;
    };
  }, []);

  const account = useMemo(() => (key ? privateKeyToAccount(key) : null), [key]);

  const create = useCallback(() => {
    const fresh = generatePrivateKey();
    write(KEY, fresh);
    write(PLAYER, null);
    setKey(fresh);
    setPlayer(null);
  }, []);

  const link = useCallback(
    async (wallet: string, pool: Address) => {
      if (!account) throw new Error('Create the bot first.');
      if (!isAddress(wallet.trim())) throw new Error('That is not a wallet address.');
      const target = getAddress(wallet.trim());
      if (!(await isLinked(target, account.address, pool))) {
        throw new Error(`This bot is not linked to ${target.slice(0, 6)}…${target.slice(-4)} yet. Link it in dreamDEX first, then try again.`);
      }
      write(PLAYER, target);
      setPlayer(target);
    },
    [account],
  );

  const unlink = useCallback(() => {
    write(PLAYER, null);
    setPlayer(null);
  }, []);

  const forget = useCallback(() => {
    write(KEY, null);
    write(PLAYER, null);
    setKey(null);
    setPlayer(null);
  }, []);

  const exportKey = useCallback(() => key, [key]);

  const walletClient = useMemo(
    () => (account ? createWalletClient({ account, chain: hideki, transport: http(PUBLIC_RPC, { timeout: 30_000 }) }) : null),
    [account],
  );

  const status: LinkedBotStatus = !loaded ? 'loading' : !account ? 'none' : !player ? 'unlinked' : 'ready';

  const value = useMemo<LinkedBotState>(
    () => ({ status, bot: account?.address ?? null, player, create, link, unlink, forget, exportKey, walletClient }),
    [status, account, player, create, link, unlink, forget, exportKey, walletClient],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLinkedBot(): LinkedBotState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLinkedBot needs a LinkedBotProvider.');
  return ctx;
}
