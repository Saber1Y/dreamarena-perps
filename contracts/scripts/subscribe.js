const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

// Opens the reactivity subscription that makes settlement automatic: OracleHub
// emits AnswerDelivered, the 0x0100 precompile dispatches it into
// ArcadeEngine.onEvent in the same block, streaks update. No keeper.

async function main() {
  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments', '50312.json'), 'utf8'),
  );
  const engineAddress = process.env.ARCADE_ENGINE || record.contracts.arcadeEngine;
  const engine = await hre.ethers.getContractAt('ArcadeEngine', engineAddress);

  const balance = await hre.ethers.provider.getBalance(engineAddress);
  console.log('Engine:  ', engineAddress);
  console.log('Balance: ', hre.ethers.formatEther(balance), 'STT');

  if (balance < hre.ethers.parseEther('32')) {
    console.error(
      `\n! The subscription owner must hold 32 STT. Send ` +
        `${hre.ethers.formatEther(hre.ethers.parseEther('32') - balance)} more STT to the engine.`,
    );
    process.exit(1);
  }

  const existing = await engine.subscriptionId();
  if (existing !== 0n) {
    console.log('\nAlready subscribed, id', existing.toString());
    return;
  }

  console.log('\nSubscribing to OracleHub AnswerDelivered...');
  const tx = await engine.subscribeToOracle(0); // 0 = library default gas limit
  const receipt = await tx.wait();
  const subId = await engine.subscriptionId();

  console.log('Subscription id:', subId.toString());
  console.log(`https://shannon-explorer.somnia.network/tx/${receipt.hash}`);

  record.subscription = { id: subId.toString(), tx: receipt.hash };
  fs.writeFileSync(
    path.join(__dirname, '..', 'deployments', '50312.json'),
    JSON.stringify(record, null, 2) + '\n',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
