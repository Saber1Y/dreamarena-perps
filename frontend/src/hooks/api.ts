'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  PlayerView,
  PreviewView,
  SessionView,
} from '@/lib/types';

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

export const useAccount = (enabled = true) =>
  useQuery({ queryKey: ['account'], queryFn: () => tool<AccountView>('dreamarena_get_account'), refetchInterval: 5_000, enabled });

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

export const usePreview = (symbol: string | null, side: 'long' | 'short', notionalUsdso: number) =>
  useQuery({
    queryKey: ['preview', symbol, side, notionalUsdso],
    queryFn: () => tool<PreviewView>('dreamarena_preview_order', { symbol, side, notionalUsdso }),
    enabled: Boolean(symbol) && notionalUsdso > 0,
    retry: false,
    staleTime: 3_000,
  });

// --- Actions -------------------------------------------------------------------

function useRefreshAfter() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['arena', 'account', 'feed', 'leaderboard', 'preview', 'market']) qc.invalidateQueries({ queryKey: [key] });
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

export function useTrade() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (input: TradeInput) => send<Execution>('/api/console/trade', 'POST', input), onSettled: refresh });
}

export type RunInput = { action: 'start'; game: GameName; symbol: string; survivalSeconds?: number } | { action: 'end' };

export function useRunAction() {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (input: RunInput) => send<ArenaTx>('/api/console/run', 'POST', input), onSettled: refresh });
}
