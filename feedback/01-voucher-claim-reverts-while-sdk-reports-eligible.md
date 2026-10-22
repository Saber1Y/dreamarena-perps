# Paper USDso claim reverts with an undecodable error while getPerpVoucherEligibility reports eligible
Severity: major
Area: SDK | docs | contracts

## Steps to reproduce
1. Generate a fresh wallet, bridge STT to Hideki for gas (no other activity on the wallet).
2. Follow "Perps on Testnet for Developers", section "Get test funds":
   ```ts
   const eligibility = await markets.client.getPerpVoucherEligibility(btc.marginBank, account)
   if (eligibility.eligible) {
     await markets.trader.claimPerpVoucher({ marginBank: btc.marginBank })
   }
   ```
3. `getPerpVoucherEligibility` returns `{ eligible: true, grantAmount: 1000000000000000000000n }`.
4. `claimPerpVoucher` sends the transaction and it reverts.

## Expected
The docs say "Any address can claim the 1,000 USDso perps credit once, as long as it holds no perp positions or orders".
The SDK source says its eligibility check runs in "the same order as `VoucherDistributor.claim()`, so the first failure here is the revert a claim would produce at this block".
So either the claim succeeds, or `getPerpVoucherEligibility` returns `eligible: false` with a reason, and a failed claim decodes to a named error.

## Actual
`claim()` on the VoucherDistributor reverts with the custom error `0x3e31dcc2`, which has no arguments.
The SDK throws `ContractRevertError: @somnia-chain/markets-sdk: claim reverted: for an unknown reason.`

- `0x3e31dcc2` is not in any error ABI shipped in `@somnia-chain/markets-sdk` 0.32.1 (546 error signatures checked), and is unknown to openchain.xyz and 4byte.directory.
- A `callTracer` trace of the call shows the revert inside the distributor implementation `0x9657f0fd53efc01cd108d93c835bb4b517732b43` itself, with no subcalls.
- In that implementation the error sits behind a check on a boolean flag. The flag is not part of `getConfig()`, the only config the SDK reads. A second config getter (selector `0x6c87f4b2`) returns `(604800, true, false, true)`, which looks like the weekly Perps Arena configuration.
- Every condition `getPerpVoucherEligibility` checks passes: the campaign is active, the account is flat, it has no main funding, `isClaimed` is false, and `budgetRemaining` covers about 406k grants.

This suggests claims are now gated (perhaps behind joining the Perps Arena in the app), while the docs, `getPerpVoucherEligibility` and the SDK's error ABI still describe an open claim.
A bot developer following the documented path gets a green eligibility check, then a reverted transaction with no reason.

## Evidence
- Reverted claim: `0xb2ca3d25f0a158a7f9b69e5c7e754db19568d193dcfa1743b1ab290bad347204`, block 30115260, input `0x4e71d92d` (`claim()`), status reverted, gas used 22,781.
- Revert data from `eth_call` of the same call: `0x3e31dcc2`.
- VoucherDistributor proxy `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`, implementation `0x9657f0fd53efc01cd108d93c835bb4b517732b43`.
- Reproduction script: `scripts/m0-first-order.mjs` in this repo.

## Suggested fix
Ship `0x3e31dcc2` in the SDK's distributor error ABI with its name, make `getPerpVoucherEligibility` check the same flag and return a reason for it, and update the "Get test funds" docs to say what an account must do first.

## Environment
`@somnia-chain/markets-sdk` 0.32.1, viem 2.56.0, Node 24.
Hideki testnet (chain 50383, shown as Somnia Tokyo), wallet `0x9572F2e86429c6260916143c57cA059030bab8E6`.
Observed 2026-10-22.
