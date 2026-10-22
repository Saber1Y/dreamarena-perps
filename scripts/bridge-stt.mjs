// Bridge STT from Shannon (50312) to Hideki (50383), where perps run, over
// the SDK's Hyperlane lane, then wait for it to land.
//
//   AMOUNT=33 node --env-file=.env bridge-stt.mjs

import {
  BridgeToken,
  ChainId,
  createBridgeTransfer,
  sendBridgeStep,
  somniaShannon,
} from '@somnia-chain/markets-sdk/chains';
import { createPublicClient, formatEther, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient as hideki } from './hideki.mjs';

if (!process.env.PRIVATE_KEY) throw new Error('Set PRIVATE_KEY in scripts/.env');
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const amount = parseEther(process.env.AMOUNT ?? '1');

const shannon = createPublicClient({ chain: somniaShannon, transport: http('https://dream-rpc.somnia.network') });

const before = await hideki.getBalance({ address: account.address });
console.log(`Shannon ${formatEther(await shannon.getBalance({ address: account.address }))} STT, Hideki ${formatEther(before)} STT`);

const plan = createBridgeTransfer({
  token: BridgeToken.STT,
  from: ChainId.somniaShannon,
  to: ChainId.hidekiTestnet,
  amount,
  recipient: account.address,
});
if (plan.approveStep) await sendBridgeStep(shannon, plan.approveStep, { account });
const receipt = await sendBridgeStep(shannon, plan.bridgeStep, { account });
console.log(`bridged ${formatEther(amount)} STT: https://shannon-explorer.somnia.network/tx/${receipt.transactionHash}`);

for (let i = 0; i < 60; i++) {
  const now = await hideki.getBalance({ address: account.address });
  if (now > before) {
    console.log(`landed on Hideki after ~${i * 5}s: ${formatEther(now)} STT`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
throw new Error('Not delivered on Hideki within 5 minutes');
