# DreamArena Perps - build plan

Entry for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail), MVP track (bots and agents), plus the feedback track.
Deadline: November 1, 23:59 UTC.

## The product

A leverage arcade and AI agent for dreamDEX perps.
Players take on challenges with their own wallet, or link an agent key that trades for them inside hard limits.
The chain scores each run through Somnia Reactivity.

## Network

| | |
| --- | --- |
| Chain | Hideki testnet (shown as the DreamDEX region in the app), chain ID 50383 |
| RPC | `https://api.hideki2.infra.testnet.somnia.network` |
| WebSocket | `wss://api.hideki2.infra.testnet.somnia.network/ws` |
| Indexer | `https://hideki-dev.smk.somnia.host/v1/graphql` |
| SDK | `@somnia-chain/markets-sdk` 0.32.1 with `SOMNIA_HIDEKI_TESTNET_ADDRESSES` and `hidekiTestnet` |
| MarginBank | `0x478769E1177C0773c43A593DCCc4Ad15F15F1394` |
| Collateral (USDso) | `0xed7993A74dAe1e6656B704A424DcD8711aAf4F72` |

Per-market addresses (`poolAddress`, `marginBank`, `stopRegistry`) are read off the market row, never hardcoded.

## Architecture

```
contracts/    PerpsArena.sol: reactive scoreboard, holds no funds
mcp-server/   perps agent: reads plus place/cancel/reduce, limits enforced in code
frontend/     Next.js app: Arena, Agent, Leaderboard, Profile, Reactivity monitor
scripts/      prove-perps: real order to tx hashes, as evidence
feedback/     one Markdown file per bug or doc gap
```

### Trading path

The player trades with their own wallet through `listPerpMarkets`, `getMaxPerpOrderSize` and `placePerpOrder`.
Every order is sized against `getMaxPerpOrderSize` first and sent with a 10M gas limit.
New players claim the 1,000 paper USDso credit with `claimPerpVoucher`.

### Agent path

The player links the agent key to their wallet with Link a Bot, which lets it place, cancel and reduce orders only.
The MCP server enforces a maximum order size, a maximum leverage, a market allowlist and a reduce-only switch after a set loss, in code rather than in the prompt.

### Scoring path

MarginBank is a singleton that emits `PositionUpdated(account, perpPool, newSize, avgEntryPrice, realizedPnl, entryFundingIndex)` and `PositionLiquidated(account, perpPool, sizeDelta, markPrice)`.
`PerpsArena` extends `SomniaEventHandler` and opens one subscription per active run, filtered to emitter MarginBank and topic1 equal to the player's address, then closes it when the run ends.
It pins the emitter, caps work per callback, and exposes a permissionless `settle()` for anything the callback misses.
A single unfiltered subscription is not viable: see the M0 findings.

Challenges:

- **Survivor**: open at X or higher leverage and hold N minutes without liquidation. A liquidation ends the run in the same block. After N minutes a permissionless `claimSurvival()` reads the live position.
- **Streak**: consecutive closes in profit, detected when `newSize` reaches 0 with realized PnL up.
- **Boss Battle**: three profitable closes in a row defeat the boss.

## Milestones

| Dates | Milestone | Done when |
| --- | --- | --- |
| Oct 21-22 | M0: check the risky parts | A script claims paper USDso and places a real perp order. A test contract subscribed to MarginBank `PositionUpdated` receives a callback. The event rate is measured. |
| Oct 23-24 | M1: perps agent | The MCP server places, reduces and cancels real orders through a linked key, with every limit tested. |
| Oct 25-27 | M2: PerpsArena | Contract and tests pass, deployed and subscribed on Hideki, a real close or liquidation updates a run in the same block. |
| Oct 28-30 | M3: frontend | Arena, Agent, Leaderboard, Profile and the monitor run on live data, checked on mobile and in every state. |
| Oct 30-31 | M4: evidence | Recorded run with tx hashes, README with a real-vs-pending table, demo video, 2-3 X posts tagging @DreamDEXSomnia. |
| Nov 1 | Buffer | Submit by about 12:00 UTC. |

Feedback reports go into `feedback/` as issues turn up, not at the end.

## M0 findings (Oct 22)

Scripts are in `scripts/` (`m0-markets.mjs`, `m0-event-rate.mjs`, `m0-first-order.mjs`).

- SDK reads work: 21 perp markets, every row on MarginBank `0x4787…1394`, `getPerpSystemConfig` reports `fullyWired` and `maxLeverageLimit` 20.
- One run in three failed on the SDK's WebSocket genesis check with a timeout, while raw WebSocket connects took about 1.2s against the SDK's 4s limit. Not reproducible enough to report yet.
- MarginBank emitted about 9,800 `PositionUpdated` and 0 `PositionLiquidated` in one hour, across 304 accounts. Subscribing to every `PositionUpdated` would cost roughly 280 times what `ArcadeEngine` paid, so subscriptions are filtered per player.
- The Reactivity precompile is live on Hideki: `getSubscriptionInfo` returns real subscriptions, including one owned by dreamDEX's own OracleHub (`0xe40d…E32b`). The filter takes up to four topics, so topic1 can pin the account.
- The paper USDso campaign grants 1,000 USDso with a 20x voucher leverage cap, and about 406k claims remain.
- STT sent to Shannon reaches Hideki through the SDK's Hyperlane bridge (`scripts/bridge-stt.mjs`): 33 STT landed in about 5 seconds.
- The paper USDso claim reverts for a fresh wallet with error `0x3e31dcc2`, even though `getPerpVoucherEligibility` says eligible. Claims appear to be gated, likely behind joining the Perps Arena in the app. Filed as `feedback/01` and `feedback/02`.
- Consequence: the bot trades the user's Perps Arena wallet through Link a Bot, which is also what the bounty asks for ("Trade with your Perps Arena balance"). That moves the linked-wallet order path from M1 into M0.

## Risks

1. A callback into our own contract on Hideki is not yet observed. dreamDEX's own subscription there makes this low risk. Fallback: scoring through a permissionless `settle()`.
2. A per-player subscription needs the arena contract to hold 32 STT, and each callback is paid from it. Cost per run must be measured in M2.
3. `realizedPnl` looks cumulative within a position (one account's value rose 0.18, 0.36, 1.95 across three reductions). Whether it resets on close is checked by `m0-first-order.mjs`.
4. It is unconfirmed whether the SDK's `placePerpOrder` can act for a linked wallet, or whether the agent must call `placeOrderFor` on the pool directly.
5. Paper USDso only opens positions in allowlisted markets, and an isolated account trades one market only.

## Provenance

The first commit imports reusable code unchanged from [Saber1Y/DreamBuild](https://github.com/Saber1Y/DreamBuild) at `173b7337`.
Everything after it is built during the bounty.
