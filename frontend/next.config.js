const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  turbopack: {
    // The server routes import the perps agent's chain layer from
    // ../mcp-server/src, so the bundler root is the repository, not frontend/.
    root: path.join(__dirname, '..'),
  },
};

module.exports = nextConfig;
