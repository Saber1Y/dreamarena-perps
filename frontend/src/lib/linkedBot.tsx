'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createWalletClient, getAddress, http, isAddress, keccak256, parseAbi, toHex, type Address, type Hex, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PUBLIC_RPC, hideki } from '@/lib/chain';
import { browserClient, useWallet } from '@/lib/wallet';

// dreamDEX keeps a player's paper USDso in its in-app wallet, a smart account
// that only trades through bots the player links with Link a Bot. The bot is
// either the player's connected browser wallet (MetaMask signs each call), or
// a key made and kept in this browser. Neither reaches a server, and
// dreamDEX's link lets the bot place and cancel orders, never withdraw.

export type LinkedBotStatus = 'loading' | 'none' | 'unlinked' | 'ready';
export type BotSource = 'wallet' | 'local';

interface LinkedBotState {
  status: LinkedBotStatus;
  /** What signs as the bot once linked: the connected wallet, or the key in this browser. */
  source: BotSource | null;
  /** The bot's address, to link in dreamDEX and to fund with gas. */
  bot: Address | null;
  /** The browser-held bot's address, whether or not it is the one in use. */
  localBot: Address | null;
  /** The dreamDEX wallet the bot trades, once its link checks out on-chain. */
  player: Address | null;
  create: () => void;
  /** Checks on-chain that the bot is linked to `wallet` on `pool`, then plays as it. */
  link: (wallet: string, pool: Address, source: BotSource) => Promise<void>;
  /** Stop playing as the wallet; the bot stays. */
  unlink: () => void;
  /** Delete the browser-held bot key. */
  forget: () => void;
  exportKey: () => Hex | null;
  walletClient: WalletClient | null;
}

const KEY = 'dreamarena.bot.key';
const PLAYER = 'dreamarena.bot.player';
const SOURCE = 'dreamarena.bot.source';
/** With the wallet as the bot: which account was linked, so a switched account does not trade. */
const WALLET_BOT = 'dreamarena.bot.wallet';
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
    // storage blocked: the setting lasts until the tab closes
  }
};
const address = (v: string | null) => (v && isAddress(v) ? getAddress(v) : null);

/** Whether `bot` may place orders for `wallet` on `pool`: the same check the pool runs. */
export const isLinked = (wallet: Address, bot: Address, pool: Address) =>
  browserClient.readContract({ address: pool, abi: POOL_ABI, functionName: 'isOperatorAuthorized', args: [wallet, bot, PLACE_ORDER_FOR] });

const Ctx = createContext<LinkedBotState | null>(null);

export function LinkedBotProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState<Hex | null>(null);
  const [player, setPlayer] = useState<Address | null>(null);
  const [source, setSource] = useState<BotSource | null>(null);
  const [walletBot, setWalletBot] = useState<Address | null>(null);

  // localStorage only exists in the browser, so read it once mounted.
  useEffect(() => {
    let live = true;
    const restore = async () => {
      const k = read(KEY);
      const src = read(SOURCE);
      if (!live) return;
      setKey(k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null);
      setPlayer(address(read(PLAYER)));
      setSource(src === 'wallet' || src === 'local' ? src : null);
      setWalletBot(address(read(WALLET_BOT)));
      setLoaded(true);
    };
    void restore();
    return () => {
      live = false;
    };
  }, []);

  const account = useMemo(() => (key ? privateKeyToAccount(key) : null), [key]);
  const localClient = useMemo(
    () => (account ? createWalletClient({ account, chain: hideki, transport: http(PUBLIC_RPC, { timeout: 30_000 }) }) : null),
    [account],
  );

  // The connected wallet signs only while it is the very account that was linked.
  const walletSigns = wallet.status === 'ready' && wallet.address !== null && wallet.address === walletBot;
  const usingWallet = source === 'wallet' && player !== null;
  const bot = usingWallet ? (walletSigns ? walletBot : null) : (account?.address ?? null);
  const walletClient = usingWallet ? (walletSigns ? wallet.walletClient : null) : localClient;

  const create = useCallback(() => {
    const fresh = generatePrivateKey();
    write(KEY, fresh);
    setKey(fresh);
  }, []);

  const link = useCallback(
    async (target: string, pool: Address, via: BotSource) => {
      const signer = via === 'wallet' ? (wallet.status === 'ready' ? wallet.address : null) : (account?.address ?? null);
      if (!signer) throw new Error(via === 'wallet' ? 'Connect your wallet on Somnia Tokyo first.' : 'Create the bot first.');
      if (!isAddress(target.trim())) throw new Error('That is not a wallet address.');
      const dreamdex = getAddress(target.trim());
      if (dreamdex === signer) throw new Error('That is the bot itself. Paste the dreamDEX wallet it trades for.');
      if (!(await isLinked(dreamdex, signer, pool))) {
        throw new Error(
          `${signer.slice(0, 6)}…${signer.slice(-4)} is not linked to ${dreamdex.slice(0, 6)}…${dreamdex.slice(-4)} yet. Link it in dreamDEX first, then try again.`,
        );
      }
      write(PLAYER, dreamdex);
      write(SOURCE, via);
      write(WALLET_BOT, via === 'wallet' ? signer : null);
      setPlayer(dreamdex);
      setSource(via);
      setWalletBot(via === 'wallet' ? signer : null);
    },
    [wallet.status, wallet.address, account],
  );

  const unlink = useCallback(() => {
    write(PLAYER, null);
    setPlayer(null);
  }, []);

  const forget = useCallback(() => {
    write(KEY, null);
    setKey(null);
    if (source === 'local') {
      write(PLAYER, null);
      setPlayer(null);
    }
  }, [source]);

  const exportKey = useCallback(() => key, [key]);

  const status: LinkedBotStatus =
    !loaded || wallet.status === 'loading' ? 'loading' : player && bot ? 'ready' : bot || account ? 'unlinked' : 'none';

  const value = useMemo<LinkedBotState>(
    () => ({
      status,
      source: player ? source : null,
      bot,
      localBot: account?.address ?? null,
      player: bot ? player : null,
      create,
      link,
      unlink,
      forget,
      exportKey,
      walletClient,
    }),
    [status, source, bot, account, player, create, link, unlink, forget, exportKey, walletClient],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLinkedBot(): LinkedBotState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLinkedBot needs a LinkedBotProvider.');
  return ctx;
}
