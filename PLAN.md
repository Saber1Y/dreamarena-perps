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
- Link a Bot writes one OperatorPermissionsRegistry (`0x6B2F…8D3a`) event per perp pool, with topics (pool, owner, bot). The linked Arena wallet is `0x85f989B157087afF8adc6019F2C381fCF6ce6c2b`.
- **First real orders (Oct 22)**, placed by the bot for the linked wallet through `PerpPool.placeOrderFor` (`scripts/m0-linked-order.mjs`). The SDK's trader has no perps `placeOrderFor`, so the script uses the documented signature.
  - Open long 0.0103 ETH at 2408.5, 3,085,524 gas: [`0x14075187…c788af`](https://explorer.testnet.somnia.network/tokyo/tx/0x14075187df1ea5632b6d8a0be0842bd2f18bb947976c122e180c86da54c788af)
  - Close, 1,594,305 gas: [`0x061075c6…ad04d0f`](https://explorer.testnet.somnia.network/tokyo/tx/0x061075c6b87335cff0ea81316e6a62ab595f7c371c9bd6a2e52804655ad04d0f)
  - The closing `PositionUpdated` has `newSize` 0 and `realizedPnl` -0.002987 USDso, the trade's result. Whether a partial close reports the chunk or the running total is still open.
- Remaining M0 item: watch a Reactivity callback land in a contract of ours. That moves to the start of M2, where the arena contract gets deployed anyway.

## M1 findings (Oct 22)

- The perps MCP server is done: 9 tools, limits in `mcp-server/src/limits.ts` (9 unit tests), chain layer in `mcp-server/src/perps.ts`.
- `scripts/check-mcp.mjs` passes 21 checks on the live testnet, including a real cycle on the linked Arena wallet that ends flat:
  open [`0x3e23624f…592814`](https://explorer.testnet.somnia.network/tokyo/tx/0x3e23624f6a133294faf44c7bdc3f3ec52916767b0a369eba5df6cb278c592814),
  half close [`0xc38082cf…68c2ec`](https://explorer.testnet.somnia.network/tokyo/tx/0xc38082cf9e9204d2335a811dab7d66c12bb4afcf530128606ff80222cc68c2ec),
  close [`0xed8f0db7…34da579`](https://explorer.testnet.somnia.network/tokyo/tx/0xed8f0db78f4d2998f67d19539c1620f52bcef8f7f4736b2e53eddab7034da579),
  post-only bid [`0x30bc354d…cbc337`](https://explorer.testnet.somnia.network/tokyo/tx/0x30bc354d30004252e3ad921ae1f0151947a9ec3e61487d24390244a5eacbc337),
  cancel [`0x740e5ae3…b29ae3`](https://explorer.testnet.somnia.network/tokyo/tx/0x740e5ae3e498d44ee6e1242b4865ee0c45ad3b4523634cbfa53c16f803b29ae3).
- `realizedPnl` on each `PositionUpdated` is the PnL of that change only, not a running total: two half closes reported (2374.51 - 2374.32) x 0.0042 and (2373.95 - 2374.32) x 0.0042 exactly. A trade's result is the sum from open to flat.
- The indexer's `markPrice` on market rows lags the chain (about 20 USDso on ETH at one point), so orders are priced from the live book and `getPerpHealthSnapshot`.
- `cancelOrderFor(address,uint128)` and `reduceOrderFor(address,uint128,uint256)` exist on the PerpPool implementation (`0x81f9…d443`), confirmed from its bytecode; the SDK ships no ABI for them.
- `tryGetPerpAccountEquity` leaves out margin locked by resting orders (`feedback/03`).
- Transient failures seen: the SDK's WebSocket genesis check (twice) and one indexer `fetch failed`. Reads retry twice with backoff, and the market list falls back to its last copy.

## M2 findings (Oct 22)

- `PerpsArena` is deployed at [`0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17`](https://explorer.testnet.somnia.network/tokyo/address/0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17) and funded with 33 STT (`contracts/deployments/50383.json`). 27 contract tests pass.
- Live proof on the deployed contract, with the linked bot starting runs for the Arena wallet (`scripts/m2-live-arena.mjs`):
  - Streak: the open's callback landed in the order's own block (30550638, [`0x4450865c…`](https://explorer.testnet.somnia.network/tokyo/tx/0x4450865c111541cfcf3a9c68f73fd848d7c24284cb25b1fee6bfcfc087712ff6)); the close's callback, also same block (30550759, [`0x8e90da09…`](https://explorer.testnet.somnia.network/tokyo/tx/0x8e90da0985db9c977d068441325f8377b8e1a626ed52d91d1befeb8ddfd2d132)), emitted `TradeScored` +0.001992 USDso, a win.
  - Survivor: the Schedule callback fired in the deadline's own second and settled the run as Won with no keeper ([`0xc6baa36c…`](https://explorer.testnet.somnia.network/tokyo/tx/0xc6baa36ce1f2c84fc92dce099f39a75cfa4253d3d27d2b4940f130d571e7cd6d)).
  - Callback cost: 114k to 747k gas, 0.0007 to 0.0045 STT each, paid by the arena.
- Two Reactivity behaviours found on Hideki, each fixed and covered by a test:
  - **Gas.** A run's first callback measured 1.43M gas and a 1.5M limit ran out: the callback landed same-block but reverted ([`0x5a8aa661…`](https://explorer.testnet.somnia.network/tokyo/tx/0x5a8aa661dcc2dd3c8657570bc4a214136af74521961f6e61b6f63516ed766cff)). Storage writes cost far more than on Ethereum. The limit is now 10M, billed on use. dreamDEX's own handlers run at 50M to 100M.
  - **Schedule timestamps.** A schedule requested for `1792704992000` ms arrived with topic `1792704992012`, the block's actual time. Matching the exact value missed it. Deadlines are now keyed by second, with a 10-second lookback for late delivery.
- Starting a run is gas-heavy on Somnia: 2.36M for a player's first Survivor run, 544k once their slots exist. Clients send arena calls with a 10M ceiling, like perp orders; a wallet's default estimate may be too tight.
- The Tokyo explorer ("somnia-explorer (blockscout-compatible)") exposes no contract verification API, so the source is not verified there. It is public in this repo, and the deployment record pins the compiler settings.
- Two superseded arenas were retired with `scripts/retire.js` and their STT recovered: `0xdB1e…7C0D` (1.5M callback limit) and `0x6540…7F26` (exact-ms schedule match).

## M3 findings (Oct 23)

- The app is a personal console: public reads, and trading and runs behind a passphrase, signed by the linked bot for one Perps Arena wallet. Strangers cannot fund a perps account from a plain browser wallet today (the paper USDso voucher is gated, `feedback/01`), so browser-wallet trading was left out.
- Privy and wagmi are gone (565 packages). Reads and actions go through Next route handlers; actions reuse the agent's `planOpen`, `planClose` and `execute`, so the app obeys the same limits as the MCP server. The bot key and passphrase appear in no client bundle (checked against the production build).
- `PerpsArena` now keeps an on-chain player list and was redeployed at `0xc96B…47b6`. A log-scanned leaderboard would cost over 6,000 RPC calls a week on Hideki.
- Played end to end in the browser: unlock, start a Streak run, open ETH long, close it, end the run. The open filled against two resting orders, so MarginBank emitted two `PositionUpdated` and the arena took two callbacks, both in the order's block; the close's callback scored +0.003031 USDso. The Monitor counted 3 of 3 position callbacks as same-block.
- `/api/arena` took 3.9 s warm with separate reads; one Multicall3 batch brought it to about 0.4 s.
- The SDK's own circuit breaker opened on the dreamDEX indexer during testing. Open orders are now best-effort in `dreamarena_get_account`, since equity and positions are chain reads.
- Turbopack does not resolve `./limits.js` to `limits.ts` outside the app, so the agent imports `.ts` paths and `tsc` rewrites them (`rewriteRelativeImportExtensions`).
- Lint was broken in the imported setup (ESLint 8 with eslint-config-next 16); it now uses ESLint 9 and the flat config Next documents.

## Risks

1. Resolved in M2: callbacks into `PerpsArena` land in the same block as the order.
2. The arena must stay above 32 STT to open subscriptions, and callbacks spend from it at 0.0007 to 0.0045 STT each. It holds about 1 STT of headroom, a few hundred callbacks. Top it up before a demo.
3. Resolved in M1: `realizedPnl` is per change, so Streak sums it from open to flat.
4. It is unconfirmed whether the SDK's `placePerpOrder` can act for a linked wallet, or whether the agent must call `placeOrderFor` on the pool directly.
5. Paper USDso only opens positions in allowlisted markets, and an isolated account trades one market only.

## Provenance

The first commit imports reusable code unchanged from [Saber1Y/DreamBuild](https://github.com/Saber1Y/DreamBuild) at `173b7337`.
Everything after it is built during the bounty.
