# ContractRevertError from a mined write does not carry the transaction hash
Severity: normal
Area: SDK

## Steps to reproduce
1. Call any trader write that lands on-chain and reverts, for example `markets.trader.claimPerpVoucher({ marginBank })` in the situation from `01-voucher-claim-reverts-while-sdk-reports-eligible.md`.
2. Catch the thrown error and look for the transaction hash.

## Expected
The error names the reverted transaction, so the developer can open it in the explorer or replay it, which the perps developer docs recommend ("Replay it with eth_call at the parent block to see the revert").

## Actual
The SDK throws `ContractRevertError: @somnia-chain/markets-sdk: claim reverted: for an unknown reason.`
The message and the printed error chain contain the replayed `eth_call` (target, calldata, block `0x1cb85bc`), but no transaction hash.
The transaction was mined (the account's nonce went from 0 to 1, and gas was charged).
To find it I had to binary-search the account nonce across blocks.
The Tokyo explorer address page (`/tokyo/api/v2/addresses/<account>/transactions`) also returned no items for the account at the time.

## Evidence
- Reverted transaction found by nonce search: `0xb2ca3d25f0a158a7f9b69e5c7e754db19568d193dcfa1743b1ab290bad347204`, block 30115260.
- The thrown error's `eth_call` replay is at block `0x1cb85bc` (30115260), the same block, so the SDK had the receipt when it built the error.
- In `dist/writer.js`, `revertErrorForReceipt` puts `receipt.transactionHash` into the error only on the fallback path, when the replay recovers no revert data. When the replay returns data (as here, `0x3e31dcc2`), it returns the decoded error and the hash is dropped.
- `ContractRevertError` in `dist/errors.d.ts` has `errorName`, `args`, `reason`, `data`, `address` and `functionName`, and no `hash` or `receipt` field.

## Suggested fix
Attach `hash` (and ideally `receipt`) to `ContractRevertError` when the revert comes from a mined receipt, and include the hash in the message.

## Environment
`@somnia-chain/markets-sdk` 0.32.1, viem 2.56.0, Node 24.
Hideki testnet (chain 50383), wallet `0x9572F2e86429c6260916143c57cA059030bab8E6`.
Observed 2026-10-22.
