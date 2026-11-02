'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decodeEventLog, getAddress, parseAbi, type Address, type Hex } from 'viem';
import { PERPS_ARENA_ABI } from '@/lib/abis';
import { EXPLORER } from '@/lib/chain';
import { browserClient, useWallet, walletError } from '@/lib/wallet';
import type {
  AccountView,
  AgentStatus,
  ArenaTx,
  ArenaView,
  Execution,
  FeedView,
  GameName,
  LeaderRow,
  MarketDetail,
  MarketView,
  OrderTx,
  PlayerView,
  PreviewView,
  SessionView,
} from '@/lib/types';
import { GAMES } from '@/lib/types';

export class ApiError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => ({ error: `Request failed (${res.status}).` }));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

async function send<T>(url: string, method: 'POST' | 'DELETE', payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({ error: `Request failed (${res.status}).` }));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

/** A read tool from the perps agent, through the same dispatcher as the MCP server. */
export interface ToolCall<T> {
  ok: boolean;
  tool: string;
  ms: number;
  result?: T;
  error?: string;
}

export async function callTool<T>(tool: string, args: Record<string, unknown> = {}): Promise<ToolCall<T>> {
  const res = await fetch('/api/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  return (await res.json()) as ToolCall<T>;
}

async function tool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const call = await callTool<T>(name, args);
  if (!call.ok) throw new ApiError(call.error ?? 'The read failed.');
  return call.result as T;
}

// --- Reads -------------------------------------------------------------------

export const useSession = () =>
  useQuery({ queryKey: ['session'], queryFn: () => getJson<SessionView>('/api/console/session'), staleTime: 30_000 });

export const useArena = (player?: string | null) =>
  useQuery({
    queryKey: ['arena', player ?? 'owner'],
    queryFn: () => getJson<{ arena: ArenaView; player: PlayerView | null }>(`/api/arena${player ? `?player=${player}` : ''}`),
    refetchInterval: 3_000,
  });

export const useFeed = () =>
  useQuery({ queryKey: ['feed'], queryFn: () => getJson<FeedView>('/api/arena/feed'), refetchInterval: 3_000 });

export const useLeaderboard = () =>
  useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => getJson<{ rows: LeaderRow[] }>('/api/arena/leaderboard').then((r) => r.rows),
    refetchInterval: 15_000,
  });

// --- Who is playing -------------------------------------------------------------

/**
 * A connected wallet plays as itself and signs its own transactions. Without
 * one, an unlocked operator console plays its linked wallet through the bot.
 * Otherwise nobody is playing in this browser and the arena is read-only.
 */
export type Actor = { mode: 'wallet'; address: Address } | { mode: 'console'; address: string } | { mode: 'none'; address: null };

export function useActor(): Actor {
  const wallet = useWallet();
  const session = useSession();
  if (wallet.status === 'ready' && wallet.address) return { mode: 'wallet', address: wallet.address };
  if (session.data?.unlocked && session.data.owner) return { mode: 'console', address: session.data.owner };
  return { mode: 'none', address: null };
}

/** The actor's dreamDEX account: equity and positions. */
export const useAccount = (actor: Actor) =>
  useQuery({
    queryKey: ['account', actor.mode, actor.address],
    queryFn: () =>
      actor.mode === 'wallet'
        ? getJson<AccountView>(`/api/play/account?player=${actor.address}`)
        : tool<AccountView>('dreamarena_get_account'),
    enabled: actor.mode !== 'none',
    refetchInterval: 5_000,
  });

/** STT in the connected wallet, for gas and run credit. */
export const useSttBalance = (address: string | null) =>
  useQuery({
    queryKey: ['stt', address],
    queryFn: () => browserClient.getBalance({ address: address as Address }).then((wei) => Number(wei) / 1e18),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });

export const useMarkets = () =>
  useQuery({
    queryKey: ['markets'],
    queryFn: () => tool<{ count: number; markets: MarketView[] }>('dreamarena_list_markets').then((r) => r.markets),
    staleTime: 60_000,
  });

export const useMarket = (symbol: string | null) =>
  useQuery({
    queryKey: ['market', symbol],
    queryFn: () => tool<MarketDetail>('dreamarena_get_market', { symbol }),
    enabled: Boolean(symbol),
    refetchInterval: 4_000,
  });

export const useAgentStatus = () =>
  useQuery({ queryKey: ['agent-status'], queryFn: () => tool<AgentStatus>('dreamarena_status'), staleTime: 60_000 });

/** A wallet's own order is checked against dreamDEX's margin; the console's against the agent's limits too. */
export const usePreview = (actor: Actor, symbol: string | null, side: 'long' | 'short', notionalUsdso: number) =>
  useQuery({
    queryKey: ['preview', actor.mode, actor.address, symbol, side, notionalUsdso],
    queryFn: () =>
      actor.mode === 'wallet'
        ? send<PreviewView>('/api/play/order', 'POST', { player: actor.address, action: 'open', symbol, side, notionalUsdso, dryRun: true })
        : tool<PreviewView>('dreamarena_preview_order', { symbol, side, notionalUsdso }),
    enabled: actor.mode !== 'none' && Boolean(symbol) && notionalUsdso > 0,
    retry: false,
    staleTime: 3_000,
  });

// --- Actions -------------------------------------------------------------------

function useRefreshAfter() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['arena', 'account', 'feed', 'leaderboard', 'preview', 'market', 'stt']) qc.invalidateQueries({ queryKey: [key] });
  };
}

// --- Signing with the player's own wallet ------------------------------------------

const POSITION_UPDATED = parseAbi([
  'event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)',
]);

/** Somnia prices first storage writes high; estimates get headroom, and gas is billed on use. */
const withHeadroom = (estimate: bigint) => {
  const padded = (estimate * 13n) / 10n;
  return padded > 10_000_000n ? 10_000_000n : padded;
};

async function confirmed(hash: Hex) {
  const receipt = await browserClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new ApiError(`The transaction reverted: ${EXPLORER}/tx/${hash}`);
  return receipt;
}

/** The trade's effect on this player's position, read from its own receipt. */
function settled(order: OrderTx, player: Address, receipt: Awaited<ReturnType<typeof confirmed>>): Execution {
  const before = BigInt(order.sizeBefore);
  let after = before;
  let entry: bigint | null = null;
  let realized = 0n;
  for (const log of receipt.logs) {
    try {
      const e = decodeEventLog({ abi: POSITION_UPDATED, data: log.data, topics: log.topics });
      if (getAddress(e.args.account) !== player || getAddress(e.args.perpPool) !== getAddress(order.pool)) continue;
      after = e.args.newSize;
      entry = e.args.avgEntryPrice;
      realized += e.args.realizedPnl;
    } catch {
      // another contract's log
    }
  }
  const scale = 10 ** order.baseDecimals;
  const size = (x: bigint) => Number(x < 0n ? -x : x) / scale;
  return {
    txHash: receipt.transactionHash,
    explorer: `${EXPLORER}/tx/${receipt.transactionHash}`,
    gasUsed: Number(receipt.gasUsed),
    filled: size(after - before),
    positionAfter: {
      side: after === 0n ? 'flat' : after > 0n ? 'long' : 'short',
      size: size(after),
      entryPrice: after !== 0n && entry !== null ? Number(entry) / 1e18 : null,
    },
    realizedPnlUsdso: Number(realized) / 1e18,
  };
}

export function useUnlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (passphrase: string) => send<{ ok: true }>('/api/console/session', 'POST', { passphrase }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }),
  });
}

export function useLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => send<{ ok: true }>('/api/console/session', 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }),
  });
}

export type TradeInput =
  | { action: 'open'; symbol: string; side: 'long' | 'short'; notionalUsdso: number }
  | { action: 'close'; symbol: string; percent?: number };

export function useTrade(actor: Actor) {
  const refresh = useRefreshAfter();
  const { walletClient } = useWallet();
  return useMutation({
    mutationFn: async (input: TradeInput): Promise<Execution> => {
      if (actor.mode === 'console') return send<Execution>('/api/console/trade', 'POST', input);
      if (actor.mode !== 'wallet' || !walletClient?.account) throw new ApiError('Connect a wallet on Somnia Tokyo first.');
      const order = await send<OrderTx>('/api/play/order', 'POST', { player: actor.address, ...input });
      const tx = { account: walletClient.account, to: order.to as Address, data: order.data as Hex, gas: BigInt(order.gas) };
      try {
        // A dry run first: a mined revert carries no reason, a call does.
        await browserClient.call(tx);
        const hash = await walletClient.sendTransaction({ ...tx, chain: walletClient.chain });
        return settled(order, actor.address, await confirmed(hash));
      } catch (err) {
        throw new ApiError(walletError(err));
      }
    },
    onSettled: refresh,
  });
}

export type RunInput =
  | { action: 'start'; game: GameName; symbol: string; survivalSeconds?: number }
  | { action: 'end' }
  /** Wallet only: add credit to a run in progress. */
  | { action: 'deposit'; amountStt: number }
  /** Wallet only: take back unused credit between runs. */
  | { action: 'withdraw' };

export function useRunAction(actor: Actor) {
  const refresh = useRefreshAfter();
  const qc = useQueryClient();
  const { walletClient } = useWallet();
  return useMutation({
    mutationFn: async (input: RunInput): Promise<ArenaTx> => {
      if (actor.mode === 'console') {
        if (input.action !== 'start' && input.action !== 'end') throw new ApiError('Only the wallet itself can move its credit.');
        return send<ArenaTx>('/api/console/run', 'POST', input);
      }
      if (actor.mode !== 'wallet' || !walletClient?.account) throw new ApiError('Connect a wallet on Somnia Tokyo first.');
      const player = actor.address;
      const arena = getAddress((await getJson<{ arena: ArenaView }>('/api/arena')).arena.address);
      const read = <F extends 'credit' | 'minRunCredit'>(functionName: F) =>
        functionName === 'credit'
          ? browserClient.readContract({ address: arena, abi: PERPS_ARENA_ABI, functionName: 'credit', args: [player] })
          : browserClient.readContract({ address: arena, abi: PERPS_ARENA_ABI, functionName: 'minRunCredit' });

      let call;
      if (input.action === 'start') {
        const markets = await qc.fetchQuery({
          queryKey: ['markets'],
          queryFn: () => tool<{ count: number; markets: MarketView[] }>('dreamarena_list_markets').then((r) => r.markets),
          staleTime: 60_000,
        });
        const market = markets.find((m) => m.symbol === input.symbol);
        if (!market) throw new ApiError(`No market ${input.symbol}.`);
        const [credit, minimum] = await Promise.all([read('credit'), read('minRunCredit')]);
        call = {
          functionName: 'startRun' as const,
          args: [GAMES.indexOf(input.game) + 1, getAddress(market.pool), BigInt(input.survivalSeconds ?? 0)] as const,
          // Top the credit up to the minimum; anything already there counts.
          value: minimum > credit ? minimum - credit : 0n,
        };
      } else if (input.action === 'end') {
        call = { functionName: 'endRun' as const, args: [player] as const, value: 0n };
      } else if (input.action === 'deposit') {
        call = { functionName: 'deposit' as const, args: [player] as const, value: BigInt(Math.round(input.amountStt * 1e6)) * 10n ** 12n };
      } else {
        const credit = await read('credit');
        if (credit === 0n) throw new ApiError('There is no credit to withdraw.');
        call = { functionName: 'withdrawCredit' as const, args: [credit] as const, value: 0n };
      }

      try {
        const params = { account: walletClient.account, address: arena, abi: PERPS_ARENA_ABI, ...call } as const;
        // Simulate first so a refusal comes back with the contract's reason.
        const { request } = await browserClient.simulateContract(params as never);
        const gas = withHeadroom(await browserClient.estimateContractGas(params as never));
        const hash = await walletClient.writeContract({ ...(request as object), gas, chain: walletClient.chain } as never);
        const receipt = await confirmed(hash);
        return { txHash: hash, explorer: `${EXPLORER}/tx/${hash}`, gasUsed: Number(receipt.gasUsed) };
      } catch (err) {
        throw new ApiError(err instanceof ApiError ? err.message : walletError(err));
      }
    },
    onSettled: refresh,
  });
}
