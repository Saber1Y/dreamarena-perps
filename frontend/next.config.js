/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  turbopack: {
    // Dependencies statically import packages we never install, down code paths
    // this app never reaches. Turbopack resolves imports eagerly, so each one
    // has to point somewhere — stubs/empty.js — or the build fails on a module
    // that would never have run.
    //
    //   @x402/*                        wagmi's connector bundle statically imports the
    //   @react-native-async-storage/*  Base Account connector, which reaches the Coinbase
    //                                  CDP SDK and its optional x402 payment packages. We
    //                                  ship no Base connector.
    //   @stripe/stripe-js              Privy's fiat-onramp screen. We never call useFundWallet.
    //   @farcaster/mini-app-solana     Privy's Farcaster + Solana paths. This is EVM-only.
    //
    // ponytail: stubs, not deps. Install the real package if we ever add that feature.
    resolveAlias: {
      '@x402/core': './stubs/empty.js',
      '@x402/evm': './stubs/empty.js',
      '@x402/svm': './stubs/empty.js',
      '@react-native-async-storage/async-storage': './stubs/empty.js',
      '@stripe/stripe-js': './stubs/empty.js',
      '@farcaster/mini-app-solana': './stubs/empty.js',
    },
  },
};

module.exports = nextConfig;
