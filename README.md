# DreamArena Perps

A leverage arcade and AI agent for dreamDEX perps on Somnia.
Take on challenges with your own wallet, or link an agent key that trades for you inside hard limits, and let the chain score every run through Somnia Reactivity.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on the Hideki testnet (chain 50383).

> Work in progress.
> See [PLAN.md](PLAN.md) for the architecture and milestones.
> The app, the perps agent (MCP server) and the arena contract all run against the live testnet.
> The app is not deployed publicly yet; run it locally as described below.

## The app

`frontend/` is a Next.js app with five sections:

| Section | What it shows |
| --- | --- |
| Arena | Your current run (Survivor countdown, Streak wins, Boss health), a trade ticket with a live preview from the agent, your positions, and your run's own callbacks |
| Agent | The agent's wiring and hard limits, a runner for its read tools with live latency, and the MCP config for Claude |
| Leaderboard | Every player who has started a run, ranked by best streak, survivals, bosses, win rate or realized PnL, read from the contract |
| Profile | Any player's on-chain stats, achievements and recent activity |
| Monitor | Arena vitals and every Reactivity callback as it lands, each with the trade that fired it and a same-block check |

It is a personal console: anyone can read, and trading and runs unlock with a passphrase and go through the perps agent's planner and limits, signed by the linked bot for one Perps Arena wallet.
Server routes hold the bot key; it never reaches the browser.

Run it:

```bash
cd mcp-server && npm install
```

```bash
cd frontend && npm install && cp .env.local.example .env.local
```

Fill in `PRIVATE_KEY`, `OWNER_ADDRESS` and `CONSOLE_PASSPHRASE` in `frontend/.env.local`, then:

```bash
cd frontend && npm run dev
```

Without those three, the app runs read-only.

## The arena contract

[`PerpsArena`](contracts/src/PerpsArena.sol) turns real dreamDEX perps trading into challenges, scored by the chain itself.
It holds no trading funds and places no orders.
When a run starts it subscribes, through Somnia Reactivity, to the player's own MarginBank events for that market, and the precompile calls the arena in the same block the position changes.
No keeper, no backend.

| Game | Rule |
| --- | --- |
| Survivor | Start with an open position and keep it open for 5 minutes to 24 hours. A liquidation or a full close loses. A scheduled callback at the deadline settles the win. |
| Streak | Start flat. Every round trip that closes in profit adds a win; the first losing close or a liquidation ends the run. |
| Boss | A Streak won outright at three profitable closes. |

A player starts a run themselves, or their Link a Bot agent starts it for them; the pool's own `isOperatorAuthorized` check is the gate.

Deployed on Hideki (chain 50383): [`0xc96B089140EfA3447fC238AaE0Af30753C0c47b6`](https://explorer.testnet.somnia.network/tokyo/address/0xc96B089140EfA3447fC238AaE0Af30753C0c47b6).
It keeps an on-chain player list, so the leaderboard reads state instead of scanning logs.

A Streak run played through the app on that address:

| What | Transaction |
| --- | --- |
| The order to open ETH long; it filled against two resting orders | [`0x299221eb…`](https://explorer.testnet.somnia.network/tokyo/tx/0x299221ebed95f6c99a00f44048315db7c910262a0ada66764d4a57ebd8b87c1e) |
| One callback per fill, both in the order's own block 31,074,786 | [`0xe49ddc64…`](https://explorer.testnet.somnia.network/tokyo/tx/0xe49ddc6484a1fdb80a1879e4f3e616f0d07ac56609a895a4dc8fc95df247b615), [`0xcfdfa903…`](https://explorer.testnet.somnia.network/tokyo/tx/0xcfdfa903a30834b23e91832e3d48096e1d0ee75f0e36158b6a866570ad5e9ede) |
| The close's callback, same block 31,075,535, scores a winning trade (+0.003031 USDso) | [`0xf577075f…`](https://explorer.testnet.somnia.network/tokyo/tx/0xf577075f77acbf49b1677c7a7581837f92f21f9d19a1aa8f7197311cfee6177e) |

The previous deployment, [`0xc9157b64…`](https://explorer.testnet.somnia.network/tokyo/address/0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17), also proved a Survivor run settled by its scheduled callback at the deadline second ([`0xc6baa36c…`](https://explorer.testnet.somnia.network/tokyo/tx/0xc6baa36ce1f2c84fc92dce099f39a75cfa4253d3d27d2b4940f130d571e7cd6d)); the scoring code is unchanged since.

Test and deploy:

```bash
cd contracts && npm install && npx hardhat test
```

```bash
cd contracts && npm run deploy
```

Deploying needs `PRIVATE_KEY` in `contracts/.env` and about 34 STT on Hideki: the arena must hold 32 STT to own its subscriptions, and it pays for every callback.
The source is not verified on the Tokyo explorer, which has no verification API; the deployment record in `contracts/deployments/50383.json` and the compiler settings in `hardhat.config.js` reproduce the bytecode.

## The perps agent

`mcp-server/` is an MCP server that lets an AI agent trade dreamDEX perps for a wallet that linked it with Link a Bot.
The agent signs with its own key and can only place, cancel and reduce that wallet's orders; it can never withdraw.

| Tool | What it does |
| --- | --- |
| `dreamarena_status` | Network, traded account, signer and limits |
| `dreamarena_list_markets` | All 21 perp markets with max leverage, funding and open interest |
| `dreamarena_get_market` | Live on-chain mark, spread and top of book |
| `dreamarena_get_account` | Equity, leverage, positions with uPnL and liquidation price, open orders |
| `dreamarena_preview_order` | Dry run: size, price, projected leverage and liquidation price, and whether the limits allow it |
| `dreamarena_open_position` | Market order that opens or adds to a long or short |
| `dreamarena_close_position` | Market order that closes some or all of a position |
| `dreamarena_place_limit_order` | Resting limit or post-only order |
| `dreamarena_cancel_order` | Cancel a resting order |

Limits are enforced in the order path, not the prompt, and set by environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_MARKETS` | `BTC,ETH,SOL` | Markets the agent may open or add to |
| `MAX_ORDER_USDSO` | `100` | Largest notional per order that adds exposure |
| `MAX_LEVERAGE` | `5` | Largest account leverage after an order |
| `MAX_LOSS_USDSO` | `100` | Equity drop from the baseline that switches the agent to reduce-only |

Closing is always allowed, whatever the limits, because it is how the agent gets out of trouble.

Run it:

```bash
cd mcp-server && npm install && npm run build
```

Copy `.mcp.json.example` to `.mcp.json`, set `PRIVATE_KEY` to the bot key and `OWNER_ADDRESS` to the linked wallet, and point your MCP client at it.

Verify it:

```bash
cd mcp-server && npm test
```

```bash
cd mcp-server && OWNER_ADDRESS=0x... node --env-file=../scripts/.env scripts/check-mcp.mjs
```

The second command checks reads and limit refusals against the live testnet without sending anything.
Add `LIVE_TRADE=1` to also run a real cycle (open, half close, close, post-only bid, cancel) that ends flat.

## Layout

```
contracts/    PerpsArena (reactive scoreboard), forked from DreamArena's ArcadeEngine
mcp-server/   the perps agent as an MCP server
frontend/     Next.js app; its server routes reuse mcp-server/src/perps.ts
scripts/      milestone checks against the live testnet
feedback/     bug and doc reports for the feedback track
```

## Origin

This builds on DreamArena from the dreamDEX Event Contracts hackathon ([Saber1Y/DreamBuild](https://github.com/Saber1Y/DreamBuild)).
The first commit imports the reused code unchanged, so the history shows exactly what was built during the bounty.

## X posts

To be added.

## License

MIT
