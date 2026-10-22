require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ponytail: no hard exit here — `compile` and `test` need no key. An empty
// accounts array simply makes any --network hideki send fail loudly.
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.30',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    // Osaka (Hardhat's default) puts the P256VERIFY precompile at 0x0100,
    // which is Somnia's Reactivity precompile address, so a mock installed
    // there would never run. Prague has nothing at 0x0100.
    hardhat: {
      hardfork: 'prague',
    },
    // dreamDEX perps testnet, shown as Somnia Tokyo in the app.
    hideki: {
      url: 'https://api.hideki2.infra.testnet.somnia.network',
      chainId: 50383,
      accounts,
    },
  },
  etherscan: {
    customChains: [
      {
        network: 'hideki',
        chainId: 50383,
        urls: {
          apiURL: 'https://explorer.testnet.somnia.network/tokyo/api',
          browserURL: 'https://explorer.testnet.somnia.network/tokyo',
        },
      },
    ],
    apiKey: {
      hideki: 'dummy',
    },
  },
  sourcify: {
    enabled: false,
  },
};
