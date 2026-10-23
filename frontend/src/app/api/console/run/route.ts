import { NextResponse } from 'next/server';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { PERPS_ARENA_ABI } from '@/lib/abis';
import { GAMES, SURVIVAL_CHOICES, type ArenaTx } from '@/lib/types';
import { findMarket } from '../../../../../../mcp-server/src/perps';
import { ARENA, EXPLORER, bot, owner, publicClient, walletClient } from '@/server/chain';
import { requireSession } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somnia prices first writes to storage high: a player's first Survivor start
// used 2.36M gas. Gas is billed on use, so arena calls carry a 10M ceiling.
const ARENA_GAS = 10_000_000n;

const REASONS: Record<string, string> = {
  NeedOpenPosition: 'Survivor starts from an open position. Open one in this market first.',
  NeedFlatPosition: 'Streak and Boss start flat. Close your position in this market first.',
  RunActive: 'A run is already active. End it before starting another.',
  NoActiveRun: 'There is no active run to end.',
  ArenaUnfunded: 'The arena is below the 32 STT Reactivity needs. Top it up first.',
  Paused: 'The arena is paused.',
  NotAuthorized: 'The bot is not linked to this wallet on that market. Check Link a Bot in dreamDEX.',
  SurvivalOutOfRange: 'Survivor lasts between 5 minutes and 24 hours.',
  StaleSubscription: 'A previous run still holds a subscription. Clean it up first.',
  InvalidPool: 'That market is not a registered dreamDEX perps pool.',
};

function reason(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return REASONS[reverted.data.errorName] ?? `The arena refused: ${reverted.data.errorName}.`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

interface RunRequest {
  action?: unknown;
  game?: unknown;
  symbol?: unknown;
  survivalSeconds?: unknown;
}

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  if (!walletClient || !bot || !owner) return NextResponse.json({ error: 'The console is read-only.' }, { status: 503 });

  let body: RunRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    // Simulate first: a mined revert carries no reason, a simulation does.
    let hash: `0x${string}`;
    if (body.action === 'start') {
      const gameIndex = GAMES.indexOf(body.game as (typeof GAMES)[number]);
      if (gameIndex < 0) return NextResponse.json({ error: 'Pick a game.' }, { status: 400 });
      if (typeof body.symbol !== 'string') return NextResponse.json({ error: 'Pick a market.' }, { status: 400 });
      const market = await findMarket(body.symbol);
      let seconds = 0n;
      if (body.game === 'Survivor') {
        const choice = SURVIVAL_CHOICES.find((c) => c.seconds === Number(body.survivalSeconds));
        if (!choice) return NextResponse.json({ error: 'Pick how long to survive.' }, { status: 400 });
        seconds = BigInt(choice.seconds);
      }
      const { request } = await publicClient.simulateContract({
        account: bot,
        address: ARENA,
        abi: PERPS_ARENA_ABI,
        functionName: 'startRunFor',
        args: [owner, gameIndex + 1, market.pool, seconds],
        gas: ARENA_GAS,
      });
      hash = await walletClient.writeContract(request);
    } else if (body.action === 'end') {
      const { request } = await publicClient.simulateContract({
        account: bot,
        address: ARENA,
        abi: PERPS_ARENA_ABI,
        functionName: 'endRun',
        args: [owner],
        gas: ARENA_GAS,
      });
      hash = await walletClient.writeContract(request);
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: `The transaction reverted: ${EXPLORER}/tx/${hash}` }, { status: 502 });
    }
    const result: ArenaTx = { txHash: hash, explorer: `${EXPLORER}/tx/${hash}`, gasUsed: Number(receipt.gasUsed) };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: reason(err) }, { status: 422 });
  }
}
