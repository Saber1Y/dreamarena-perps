# DreamArena Perps

A leverage arcade and AI agent for dreamDEX perps on Somnia.
Take on challenges with your own wallet, or link an agent key that trades for you inside hard limits, and let the chain score every run through Somnia Reactivity.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on the Hideki testnet (chain 50383).

**Live app: [dreamarena-perps.vercel.app](https://dreamarena-perps.vercel.app)**

> Work in progress.
> See [PLAN.md](PLAN.md) for the architecture and milestones.
> The app, the perps agent (MCP server) and the arena contract all run against the live testnet.

## The app

`frontend/` is a Next.js app with five sections:

| Section | What it shows |
| --- | --- |
| Arena | Your current run (Survivor countdown, Streak wins, Boss health) and its callback credit, a trade ticket with a live preview, your positions, and your run's own callbacks |
| Agent | The agent's wiring and hard limits, a runner for its read tools with live latency, and the MCP config for Claude |
| Leaderboard | Every player who has started a run, ranked by best streak, survivals, bosses, win rate or realized PnL, read from the contract |
| Profile | Any player's on-chain stats, achievements and recent activity |
| Monitor | Arena vitals and every Reactivity callback as it lands, each with the trade that fired it and a same-block check |

Anyone can play, and nobody but the player holds a key.
The server only plans each order with the agent's code (book, tick, lot, slippage, dreamDEX's margin check) and hands back the transaction to sign; it signs nothing.
There are two ways in:

- **A dreamDEX wallet, through a bot you link.** dreamDEX keeps paper USDso in its in-app wallet, a smart account that only trades through bots linked with Link a Bot. The app makes a bot key in the player's browser and keeps it only there; the player links it in dreamDEX, gives it a little STT for gas, and plays. The bot calls `startRunFor`, `placeOrderFor` and `withdrawCreditFor` for the wallet; dreamDEX's link lets it trade, never withdraw.
- **A browser wallet** (MetaMask and the like) that holds its own margin plays as itself: connect, and the app adds and switches to Somnia Tokyo.

Players get STT from the [faucet](https://explorer.testnet.somnia.network/tokyo/faucet) and paper USDso by joining dreamDEX's [Perps Arena](https://app.testnet.dreamdex.io/competition).

Run it:

```bash
cd mcp-server && npm install
```

```bash
cd frontend && npm install && cp .env.local.example .env.local
```

The app needs no secrets; `frontend/.env.local` is only for optional settings.

```bash
cd frontend && npm run dev
```

### Deploying

The live app runs on Vercel from the repository root, with `frontend` as the Root Directory so its server routes can import `mcp-server/src` and `contracts/deployments`.
`frontend/vercel.json` also installs `mcp-server`'s dependencies.
Functions run in Tokyo (`hnd1`), next to the Hideki RPC.
The deployment holds no keys; `.vercelignore` keeps every env and MCP config file out of the upload anyway.

```bash
vercel deploy --prod
```

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

### Who pays for the callbacks

Reactivity bills every callback to the subscription's owner, and only opens a subscription for an owner holding at least 32 STT.
The arena owns every run's subscriptions, so it holds a 32 STT bond the operator puts up once.
Each player pays for their own callbacks:

- Starting a run deposits gas credit, at least `minRunCredit` (0.05 STT, about ten of the heaviest callbacks seen or sixty typical ones).
- Each callback measures its own gas and charges it to the player it served, at the transaction's gas price.
- When what is left could not pay for one more heavy callback, the run ends itself in that callback and unsubscribes, so a player can never spend the bond or anyone else's credit.
- Unused credit is the player's to withdraw between runs, or their linked bot's to send back to them with `withdrawCreditFor`; either way it only goes to the player. `withdrawNative` lets the owner take only the bond, never credit.

Metering was calibrated against real receipts.
With 60,000 gas of overhead, two callbacks were charged 57,572 and 57,575 gas less than they cost, so `setCharging` raised it to 130,000 ([`0xd0aeb417…`](https://explorer.testnet.somnia.network/tokyo/tx/0xd0aeb41716ca163519f2dd84812ac67d3278d6c692ece1bddbc669c6fa7d5ed3)).
The next two callbacks were charged 12,428 gas more than their receipts, about 0.00007 STT each, which stays in the bond.

Deployed on Hideki (chain 50383): [`0xf9ed11860D814BD688bB497df912Fc41fD832667`](https://explorer.testnet.somnia.network/tokyo/address/0xf9ed11860D814BD688bB497df912Fc41fD832667).
It keeps an on-chain player list, so the leaderboard reads state instead of scanning logs.

On that address, a dreamDEX in-app wallet played a Streak run through a bot linked in dreamDEX and held in the browser, start to refund:

| What | Transaction |
| --- | --- |
| `startRunFor` from the bot, with 0.05 STT of credit for the wallet | [`0x02a9a261…`](https://explorer.testnet.somnia.network/tokyo/tx/0x02a9a2618af8d056425e4bae4cfabd0428aa6740f3f098a19557d8e825e9dedf) |
| `placeOrderFor`: open ETH long, block 45,700,898 | [`0x9e27b6d2…`](https://explorer.testnet.somnia.network/tokyo/tx/0x9e27b6d2dfe689ce6e71ffb85c20eae6d449ec952ac18e837b814c1a11fa3e03) |
| Its callbacks, same block, billed to the wallet's credit | [`0x3a581d65…`](https://explorer.testnet.somnia.network/tokyo/tx/0x3a581d6577385e6b1bc169b5a6a784f986c5a277872ddcf5479846a983c6836f), [`0xaa33f0ab…`](https://explorer.testnet.somnia.network/tokyo/tx/0xaa33f0ab7812bd8931fe5c8fda982d03c83221163a5d57b026bd6411212c93bf) |
| `placeOrderFor`: close, block 45,701,180 | [`0x6e40cf2a…`](https://explorer.testnet.somnia.network/tokyo/tx/0x6e40cf2a7775c68bd3f49892845ad4d53b127e43a566b9b1fab65fb04a83d8e5) |
| Its callback, same block, scores a win (+0.024641 USDso) | [`0xeb9c91ad…`](https://explorer.testnet.somnia.network/tokyo/tx/0xeb9c91adaf348f017438e43ba0a324f8ba025b155a7d6cbcb32f685c87e9d324) |
| `withdrawCreditFor`: the 0.0408 STT left goes back to the wallet | [`0xb0d12b54…`](https://explorer.testnet.somnia.network/tokyo/tx/0xb0d12b545acab21badd7587f94802ad5df469a57b2c0bd74efd31b7e0930adeb) |

Each callback was charged slightly more gas than its receipt used (565,001 for 552,573; 165,107 for 152,679; 797,918 for 785,484), so the bond only grows.

The previous deployment, [`0xd87C0477…`](https://explorer.testnet.somnia.network/tokyo/address/0xd87C0477205aF17C8F33B1481f65c6d3F3B4EEa7), had the same billing without `withdrawCreditFor`; it is retired and its bond moved here.
0.0476 STT of credit stays in it for a dreamDEX wallet that cannot call `withdrawCredit`, which is why linked bots can now return credit.
On it, a fresh browser wallet played with credit in and out:

| What | Transaction |
| --- | --- |
| `startRun` with 0.05 STT of credit | [`0xc101d6a7…`](https://explorer.testnet.somnia.network/tokyo/tx/0xc101d6a7ba374ab0b12fca455fd08b8bca0e7a1af8e8250f2c718cc9afeba8f5) |
| `deposit`, a 0.05 STT top-up mid-run | [`0x05948200…`](https://explorer.testnet.somnia.network/tokyo/tx/0x05948200822f696c642541ca9de1c94f416c5dcd0d93145b96e864e1a4166929) |
| `endRun` | [`0x83d78614…`](https://explorer.testnet.somnia.network/tokyo/tx/0x83d78614a0e26cbdbd3806070451b12fdf4b74c04c104033b03192c179fdae38) |
| `withdrawCredit`, all 0.1 STT back | [`0xea07f78b…`](https://explorer.testnet.somnia.network/tokyo/tx/0xea07f78bdaf1291a63dd9c1432d989cc61f2fbf3af2c517a67d32b1c55c03a28) |

And a Streak run through a linked bot, each callback in its trade's own block and billed to the player:

| What | Trade | Callback, same block |
| --- | --- | --- |
| Open ETH long, block 39,770,483 | [`0xb8dc9e88…`](https://explorer.testnet.somnia.network/tokyo/tx/0xb8dc9e8878858ab64a9d16a052769c232f04c75d23f35dabcc5ede7da88f8544) | [`0x3c9d5082…`](https://explorer.testnet.somnia.network/tokyo/tx/0x3c9d50828ed0417ccc8de82e665b283afdd2b651008420503b86725bd7d43dbd), charged 0.00099 STT |
| Close, block 39,770,535: a losing trade ends the run | [`0x23929351…`](https://explorer.testnet.somnia.network/tokyo/tx/0x23929351989a747442eb3d87ec1f27524664baebc35ad86a19b7f7ed46390c04) | [`0xbc1145bf…`](https://explorer.testnet.somnia.network/tokyo/tx/0xbc1145bf24aab8685301c4ac2d4b6c449f3958721e07f96f1538cc9f526f0842), charged 0.00139 STT |

The deployment before that, [`0xc96B0891…`](https://explorer.testnet.somnia.network/tokyo/address/0xc96B089140EfA3447fC238AaE0Af30753C0c47b6), paid every callback from one shared balance; it is retired and its STT moved to the bond.
A Streak run played through the app on it:

| What | Transaction |
| --- | --- |
| The order to open ETH long; it filled against two resting orders | [`0x299221eb…`](https://explorer.testnet.somnia.network/tokyo/tx/0x299221ebed95f6c99a00f44048315db7c910262a0ada66764d4a57ebd8b87c1e) |
| One callback per fill, both in the order's own block 31,074,786 | [`0xe49ddc64…`](https://explorer.testnet.somnia.network/tokyo/tx/0xe49ddc6484a1fdb80a1879e4f3e616f0d07ac56609a895a4dc8fc95df247b615), [`0xcfdfa903…`](https://explorer.testnet.somnia.network/tokyo/tx/0xcfdfa903a30834b23e91832e3d48096e1d0ee75f0e36158b6a866570ad5e9ede) |
| The close's callback, same block 31,075,535, scores a winning trade (+0.003031 USDso) | [`0xf577075f…`](https://explorer.testnet.somnia.network/tokyo/tx/0xf577075f77acbf49b1677c7a7581837f92f21f9d19a1aa8f7197311cfee6177e) |

An earlier one, [`0xc9157b64…`](https://explorer.testnet.somnia.network/tokyo/address/0xc9157b642c36CDde8C8a1BA4616a4e76010EFF17), also proved a Survivor run settled by its scheduled callback at the deadline second ([`0xc6baa36c…`](https://explorer.testnet.somnia.network/tokyo/tx/0xc6baa36ce1f2c84fc92dce099f39a75cfa4253d3d27d2b4940f130d571e7cd6d)); the scoring code is unchanged since.

Test and deploy:

```bash
cd contracts && npm install && npx hardhat test
```

```bash
cd contracts && npm run deploy
```

Deploying needs `PRIVATE_KEY` in `contracts/.env` and about 34 STT on Hideki: the arena holds a 33 STT bond (32 to own subscriptions, plus headroom), and players pay for their own callbacks.
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
