# DreamArena Perps

A leverage arcade and AI agent for dreamDEX perps on Somnia.
Take on challenges with your own wallet, or link an agent key that trades for you inside hard limits, and let the chain score every run through Somnia Reactivity.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on the Hideki testnet (chain 50383).

> Work in progress.
> See [PLAN.md](PLAN.md) for the architecture and milestones.
> The perps agent (MCP server) trades for real on testnet, and the arena contract scores runs on-chain through Reactivity.
> The app is not built yet.

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

Deployed on Hideki (chain 50383): [`0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17`](https://explorer.testnet.somnia.network/tokyo/address/0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17).

Proven live on that address:

| What | Transaction |
| --- | --- |
| Streak: the open's callback, same block as the order | [`0x4450865c…`](https://explorer.testnet.somnia.network/tokyo/tx/0x4450865c111541cfcf3a9c68f73fd848d7c24284cb25b1fee6bfcfc087712ff6) |
| Streak: the close's callback scores a winning trade, same block | [`0x8e90da09…`](https://explorer.testnet.somnia.network/tokyo/tx/0x8e90da0985db9c977d068441325f8377b8e1a626ed52d91d1befeb8ddfd2d132) |
| Survivor: the scheduled callback settles a win at the deadline | [`0xc6baa36c…`](https://explorer.testnet.somnia.network/tokyo/tx/0xc6baa36ce1f2c84fc92dce099f39a75cfa4253d3d27d2b4940f130d571e7cd6d) |

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
frontend/     Next.js app
feedback/     bug and doc reports for the feedback track
```

## Origin

This builds on DreamArena from the dreamDEX Event Contracts hackathon ([Saber1Y/DreamBuild](https://github.com/Saber1Y/DreamBuild)).
The first commit imports the reused code unchanged, so the history shows exactly what was built during the bounty.

## X posts

To be added.

## License

MIT
