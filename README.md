# DreamArena Perps

A leverage arcade and AI agent for dreamDEX perps on Somnia.
Take on challenges with your own wallet, or link an agent key that trades for you inside hard limits, and let the chain score every run through Somnia Reactivity.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on the Hideki testnet (chain 50383).

> Work in progress.
> See [PLAN.md](PLAN.md) for the architecture and milestones.
> The perps agent (MCP server) trades for real on testnet.
> The app and the arena contract are not built yet.

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
