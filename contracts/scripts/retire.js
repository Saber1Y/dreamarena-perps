// Retire a superseded PerpsArena: pause it so no new runs start, then pull
// its bond back out so the next deployment can be funded from it.
//
// Without a balance the precompile stops paying for the old arena's
// callbacks, so subscriptions of runs still active go quiet with it.
//
// Run: PERPS_ARENA=0x... npx hardhat run scripts/retire.js --network hideki

const hre = require('hardhat');

async function main() {
  const address = process.env.PERPS_ARENA;
  if (!address) {
    console.error('Set PERPS_ARENA to the arena you want to retire.');
    process.exit(1);
  }

  const [owner] = await hre.ethers.getSigners();
  const arena = await hre.ethers.getContractAt('PerpsArena', address);
  console.log('Arena:      ', address);
  console.log('Active runs:', (await arena.activeRuns()).toString());

  if (!(await arena.paused())) {
    await (await arena.setPaused(true)).wait();
    console.log('Paused.');
  }

  const balance = await hre.ethers.provider.getBalance(address);
  console.log('Balance:    ', hre.ethers.formatEther(balance), 'STT');
  // Arenas with player credit only release the bond; players withdraw their
  // own credit. Earlier arenas have no bond() and hold only the operator's STT.
  const bond = await arena.bond().catch(() => balance);
  console.log('Bond:       ', hre.ethers.formatEther(bond), 'STT');
  if (bond > 0n) {
    const receipt = await (await arena.withdrawNative(owner.address, bond)).wait();
    console.log(`Withdrew to ${owner.address}: ${receipt.hash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
