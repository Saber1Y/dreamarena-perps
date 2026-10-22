// Retire a superseded ArcadeEngine: cancel its reactivity subscription and
// pull the 32 STT back out, so the next deployment can be funded from it.
//
// Run: ARCADE_ENGINE=0x... npx hardhat run scripts/retire.js --network somniaTestnet

const hre = require('hardhat');

async function main() {
  const address = process.env.ARCADE_ENGINE;
  if (!address) {
    console.error('Set ARCADE_ENGINE to the engine you want to retire.');
    process.exit(1);
  }

  const [owner] = await hre.ethers.getSigners();
  const engine = await hre.ethers.getContractAt('ArcadeEngine', address);

  const subId = await engine.subscriptionId();
  console.log('Engine:      ', address);
  console.log('Subscription:', subId.toString());

  if (subId !== 0n) {
    console.log('Cancelling…');
    await (await engine.cancelSubscription()).wait();
    console.log('Cancelled.');
  }

  const balance = await hre.ethers.provider.getBalance(address);
  console.log('Balance:     ', hre.ethers.formatEther(balance), 'STT');
  if (balance > 0n) {
    console.log(`Withdrawing to ${owner.address}…`);
    const receipt = await (await engine.withdrawNative(owner.address, balance)).wait();
    console.log(`https://shannon-explorer.somnia.network/tx/${receipt.hash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
