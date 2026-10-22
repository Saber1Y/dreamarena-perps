require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ponytail: no hard exit here — `compile` and `test` need no key. An empty
// accounts array simply makes any --network somniaTestnet send fail loudly.
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
      // The module's markets() returns a 14-field tuple — too deep for the
      // legacy codegen's stack.
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
    somniaTestnet: {
      url: 'https://dream-rpc.somnia.network',
      chainId: 50312,
      accounts,
    },
  },
  etherscan: {
    customChains: [
      {
        network: 'somniaTestnet',
        chainId: 50312,
        urls: {
          apiURL: 'https://shannon-explorer.somnia.network/api',
          browserURL: 'https://shannon-explorer.somnia.network',
        },
      },
    ],
    apiKey: {
      somniaTestnet: 'dummy',
    },
  },
};
