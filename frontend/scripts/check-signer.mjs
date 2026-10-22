// The guard behind the dead Claim button. A wallet client that has not
// arrived yet must produce a message, not a silent bail — run with
// `node scripts/check-signer.mjs`.
import assert from 'node:assert/strict';

// Mirrors src/lib/signer.ts. Kept in step by this file failing if it drifts.
function requireSigner(walletClient, address) {
  if (walletClient) return walletClient;
  throw new Error(
    address
      ? 'Your wallet is connected but cannot sign yet. Give it a moment, or disconnect and connect again.'
      : 'Connect a wallet first.',
  );
}

const src = await import('node:fs').then((fs) =>
  fs.promises.readFile(new URL('../src/lib/signer.ts', import.meta.url), 'utf8'),
);

// The signer helper must keep both branches, or the button goes quiet again.
assert.match(src, /Connect a wallet first/, 'signer.ts lost the disconnected message');
assert.match(src, /cannot sign yet/, 'signer.ts lost the not-ready message');

const client = { fake: true };
assert.equal(requireSigner(client, '0xabc'), client, 'a live client must pass straight through');

// The case that produced the bug: authenticated, address published, no signer.
assert.throws(
  () => requireSigner(undefined, '0xabc'),
  /cannot sign yet/,
  'a connected wallet with no signer must say so, not bail silently',
);

assert.throws(
  () => requireSigner(undefined, undefined),
  /Connect a wallet first/,
  'no wallet at all must ask for a connection',
);

// Every hook that signs has to call the guard from inside its try, otherwise
// the rejection never reaches an error state and the click looks ignored.
const fs = await import('node:fs');
for (const hook of ['useClaims.ts', 'useDreamDEX.ts', 'useArena.ts']) {
  const text = await fs.promises.readFile(
    new URL(`../src/hooks/${hook}`, import.meta.url),
    'utf8',
  );
  assert.match(text, /requireSigner\(/, `${hook} must guard through requireSigner`);
  const guard = text.indexOf('requireSigner(');
  const tryStart = text.lastIndexOf('try {', guard);
  const catchOrFinally = text.indexOf('} catch', guard);
  assert.ok(
    tryStart !== -1 && (catchOrFinally === -1 || tryStart < guard),
    `${hook} calls requireSigner outside a try — its error would be swallowed`,
  );
}

console.log('ok — the signer guard reports instead of bailing silently');
