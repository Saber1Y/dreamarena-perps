# DreamArena Perps

A leverage arcade and AI agent for dreamDEX perps on Somnia.
Take on challenges with your own wallet, or link an agent key that trades for you inside hard limits, and let the chain score every run through Somnia Reactivity.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail) on the Hideki testnet (chain 50383).

> Work in progress.
> See [PLAN.md](PLAN.md) for the architecture and milestones.
> So far only `scripts/` places real perps orders: a linked bot key opens and closes a position for a Perps Arena wallet ([open](https://explorer.testnet.somnia.network/tokyo/tx/0x14075187df1ea5632b6d8a0be0842bd2f18bb947976c122e180c86da54c788af), [close](https://explorer.testnet.somnia.network/tokyo/tx/0x061075c6b87335cff0ea81316e6a62ab595f7c371c9bd6a2e52804655ad04d0f)).
> The app, agent and arena contract are not built yet.

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
