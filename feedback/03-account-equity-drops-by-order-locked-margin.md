# tryGetPerpAccountEquity drops by the margin a resting order locks
Severity: normal
Area: SDK | docs

## Steps to reproduce
1. Take a flat perps account with no open orders and read `client.tryGetPerpAccountEquity(marginBank, account)`.
2. Rest a post-only bid well below the market so it cannot fill, for example 0.012 ETH at 1662 on the ETH pool.
3. Read `tryGetPerpAccountEquity` again.
4. Cancel the order and read it a third time.

## Expected
The SDK documents this read as "An account's equity".
Margin locked behind a resting order is still the account's collateral: nothing was spent, and it all comes back on cancel.
So equity should not move when an order rests and is cancelled, apart from fees (a post-only order that rests pays none).
The Perps Arena rules also define account equity as "balance plus unrealized PnL", with no deduction for open orders.

## Actual
Equity falls by exactly the locked margin while the order rests, and returns on cancel.

| Step | Equity (USDso) |
| --- | --- |
| While the bid rests | 998.998553 |
| After the cancel, with no other activity in between | 999.995753 |

The difference, 0.997200 USDso, is exactly the `CollateralLocked` amount the MarginBank emitted when the order rested.

The open question is whether this read is meant to be free collateral rather than equity.
If it is, the name and doc comment should say so.
If any equity snapshot (for example a leaderboard ROI) uses the same quantity, a trader with resting orders at snapshot time is understated.

## Evidence
- Order rested: `0x5a24f65fc9e8e8a8c8c290d8535a88982bedd64b777d732f421932b6955c655c`. Its logs: MarginBank `CollateralLocked(account, pool, 997200000000000000)`, then pool `OrderPlaced` with order id `21121521964397444922336`, then `OrderRested`.
- Order cancelled: `0xfad9f62e5e09a401dedec0a40bcb354d0971fd5fb982aa22df4655181424b675`.
- Account `0x85f989B157087afF8adc6019F2C381fCF6ce6c2b`, ETH pool `0xD6Cb1DD58580B84D76068aC21594219ce03aeddf`, MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`.
- Reproduction: the live cycle in `mcp-server/scripts/check-mcp.mjs` rests and cancels the same kind of order.

## Environment
`@somnia-chain/markets-sdk` 0.32.1, viem 2.56.0, Node 24.
Hideki testnet (chain 50383, shown as Somnia Tokyo).
Observed 2026-10-22.
