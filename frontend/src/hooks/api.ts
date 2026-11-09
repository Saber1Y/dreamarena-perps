'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decodeEventLog, getAddress, parseAbi, type Address, type ContractFunctionName, type Hex } from 'viem';
import { PERPS_ARENA_ABI } from '@/lib/abis';
import { EXPLORER } from '@/lib/chain';
import { useLinkedBot } from '@/lib/linkedBot';
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

export const useArena = (player?: string | null) =>
  useQuery({
    queryKey: ['arena', player ?? 'none'],
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
 * Who is playing in this browser. A dreamDEX wallet plays through the bot it
 * linked, whose key lives only in this browser. A browser wallet (MetaMask and
 * the like) plays as itself. Otherwise nobody is, and the arena is read-only.
 * Either way the player signs; no server holds a key.
 */
export type Actor =
  | { mode: 'bot'; address: Address; bot: Address }
  | { mode: 'wallet'; address: Address }
  | { mode: 'none'; address: null };

export function useActor(): Actor {
  const wallet = useWallet();
  const linked = useLinkedBot();
  if (linked.status === 'ready' && linked.player && linked.bot) return { mode: 'bot', address: linked.player, bot: linked.bot };
  if (wallet.status === 'ready' && wallet.address) return { mode: 'wallet', address: wallet.address };
  return { mode: 'none', address: null };
}

/** Whatever signs for the actor: their browser wallet, or the bot they linked. */
function useSigner(actor: Actor) {
  const wallet = useWallet();
  const linked = useLinkedBot();
  return actor.mode === 'bot' ? linked.walletClient : actor.mode === 'wallet' ? wallet.walletClient : null;
}

/** The actor's dreamDEX account: equity and positions. */
export const useAccount = (actor: Actor) =>
  useQuery({
    queryKey: ['account', actor.address],
    queryFn: () => getJson<AccountView>(`/api/play/account?player=${actor.address}`),
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

/** The order as planned for the player's account, checked against dreamDEX's own margin. */
export const usePreview = (actor: Actor, symbol: string | null, side: 'long' | 'short', notionalUsdso: number) =>
  useQuery({
    queryKey: ['preview', actor.address, symbol, side, notionalUsdso],
    queryFn: () => send<PreviewView>('/api/play/order', 'POST', { player: actor.address, action: 'open', symbol, side, notionalUsdso, dryRun: true }),
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

// --- Signing for the player ----------------------------------------------------------

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

export type TradeInput =
  | { action: 'open'; symbol: string; side: 'long' | 'short'; notionalUsdso: number }
  | { action: 'close'; symbol: string; percent?: number };

const NOT_PLAYING = 'Connect a wallet or link a bot first.';

export function useTrade(actor: Actor) {
  const refresh = useRefreshAfter();
  const walletClient = useSigner(actor);
  return useMutation({
    mutationFn: async (input: TradeInput): Promise<Execution> => {
      if (actor.mode === 'none' || !walletClient?.account) throw new ApiError(NOT_PLAYING);
      // A linked bot places the order for the player's dreamDEX wallet.
      const signer = actor.mode === 'bot' ? 'linked-bot' : 'wallet';
      const order = await send<OrderTx>('/api/play/order', 'POST', { player: actor.address, signer, ...input });
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
  /** Add credit to a run in progress. */
  | { action: 'deposit'; amountStt: number }
  /** Take back unused credit between runs; it always goes to the player's wallet. */
  | { action: 'withdraw' };

export function useRunAction(actor: Actor) {
  const refresh = useRefreshAfter();
  const qc = useQueryClient();
  const walletClient = useSigner(actor);
  return useMutation({
    mutationFn: async (input: RunInput): Promise<ArenaTx> => {
      if (actor.mode === 'none' || !walletClient?.account) throw new ApiError(NOT_PLAYING);
      const player = actor.address;
      const viaBot = actor.mode === 'bot';
      const { arena: view, player: state } = await getJson<{ arena: ArenaView; player: PlayerView | null }>(`/api/arena?player=${player}`);
      const arena = getAddress(view.address);
      const credit = await browserClient.readContract({ address: arena, abi: PERPS_ARENA_ABI, functionName: 'credit', args: [player] });
      const markets = await qc.fetchQuery({
        queryKey: ['markets'],
        queryFn: () => tool<{ count: number; markets: MarketView[] }>('dreamarena_list_markets').then((r) => r.markets),
        staleTime: 60_000,
      });

      let call;
      if (input.action === 'start') {
        const market = markets.find((m) => m.symbol === input.symbol);
        if (!market) throw new ApiError(`No market ${input.symbol}.`);
        const minimum = await browserClient.readContract({ address: arena, abi: PERPS_ARENA_ABI, functionName: 'minRunCredit' });
        const run = [GAMES.indexOf(input.game) + 1, getAddress(market.pool), BigInt(input.survivalSeconds ?? 0)] as const;
        // Top the credit up to the minimum; anything already there counts.
        const value = minimum > credit ? minimum - credit : 0n;
        call = viaBot
          ? { functionName: 'startRunFor' as const, args: [player, ...run] as const, value }
          : { functionName: 'startRun' as const, args: run, value };
      } else if (input.action === 'end') {
        call = { functionName: 'endRun' as const, args: [player] as const, value: 0n };
      } else if (input.action === 'deposit') {
        call = { functionName: 'deposit' as const, args: [player] as const, value: BigInt(Math.round(input.amountStt * 1e6)) * 10n ** 12n };
      } else {
        if (credit === 0n) throw new ApiError('There is no credit to withdraw.');
        // The bot proves its link on the pool the player last ran on.
        const pool = getAddress(state?.run.pool ?? markets[0].pool);
        call = viaBot
          ? { functionName: 'withdrawCreditFor' as const, args: [player, pool, credit] as const, value: 0n }
          : { functionName: 'withdrawCredit' as const, args: [credit] as const, value: 0n };
      }

      // viem cannot type a call whose function varies, so the casts below are
      // checked here instead: the name must exist on the generated ABI.
      const writable: ContractFunctionName<typeof PERPS_ARENA_ABI, 'payable' | 'nonpayable'> = call.functionName;
      try {
        const params = { account: walletClient.account, address: arena, abi: PERPS_ARENA_ABI, ...call, functionName: writable } as const;
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
