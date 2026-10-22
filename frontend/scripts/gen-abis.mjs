// Regenerate src/lib/abis.ts from the compiled contract artifacts.
// Run after any contract change: `npm run abis` (needs `npx hardhat compile`
// in ../contracts first). Hand-editing an ABI is how this codebase ended up
// calling functions that did not exist on-chain.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, '..', '..', 'contracts', 'artifacts', 'src');

const KEEP = {
  ArcadeEngine: [
    'recordEntry', 'settleMarket', 'needsSettlement', 'getPlayerStats', 'getMultiplier', 'streak',
    'longestStreak', 'totalWins', 'totalLosses', 'totalShares', 'entries',
    'outcomes', 'entrantCount', 'pendingResolves', 'subscriptionId', 'subscribeToOracle',
    'bossRound', 'bossesSlain', 'BOSS_ROUNDS',
  ],
  CommunityDAOFactory: [
    'createDAO', 'setBuilderFee', 'getDAO', 'getDAOCount', 'hasDAO', 'daoByTreasury',
  ],
};

function load(name) {
  const file = path.join(artifacts, `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} — run \`npx hardhat compile\` in ../contracts first.`);
    process.exit(1);
  }
  const { abi } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return abi.filter((x) => x.type === 'event' || KEEP[name].includes(x.name));
}

const STATIC = `export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

export const OUTCOME_TOKEN_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
] as const;
`;

const out =
  `// Contract ABIs, generated from the compiled artifacts in ../contracts.\n` +
  `// Regenerate with: npm run abis  (never hand-edit — a drifted ABI is how this\n` +
  `// codebase ended up calling functions that did not exist).\n\n` +
  `export const ARCADE_ENGINE_ABI = ${JSON.stringify(load('ArcadeEngine'), null, 2)} as const;\n\n` +
  `export const COMMUNITY_DAO_FACTORY_ABI = ${JSON.stringify(load('CommunityDAOFactory'), null, 2)} as const;\n\n` +
  STATIC;

fs.writeFileSync(path.join(here, '..', 'src', 'lib', 'abis.ts'), out);
console.log('Wrote src/lib/abis.ts');
