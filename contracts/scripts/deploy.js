const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

// dreamDEX perps MarginBank on Hideki (chain 50383), from the developer docs'
// contract table and every market row's `marginBank`.
const MARGIN_BANK = '0x478769E1177C0773c43A593DCCc4Ad15F15F1394';

// The precompile requires the SUBSCRIPTION OWNER, the arena contract itself,
// to hold at least 32 STT. That is the operator's bond: players pay for their
// own callbacks from the credit they deposit, so the bond is not spent. The
// default leaves 1 STT over the minimum for deliveries no player can be billed
// for, such as a schedule tick for a run that already ended.
const FUND = hre.ethers.parseEther(process.env.ARENA_FUND_STT ?? '33');

// Gas a callback burns outside its metered body. Hideki receipts put it at
// about 117,500; 130,000 keeps every charge just above the real cost.
const CALLBACK_OVERHEAD_GAS = BigInt(process.env.CALLBACK_OVERHEAD_GAS ?? '130000');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log('Network: ', hre.network.name, chainId.toString());
  console.log('Deployer:', deployer.address);
  console.log('Balance: ', hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), 'STT\n');

  const Arena = await hre.ethers.getContractFactory('PerpsArena');
  const arena = await Arena.deploy(MARGIN_BANK);
  await arena.waitForDeployment();
  const address = await arena.getAddress();
  const deployTx = arena.deploymentTransaction().hash;
  console.log('PerpsArena', address);
  console.log('deploy tx ', deployTx);

  const held = await hre.ethers.provider.getBalance(address);
  let fundTx = null;
  if (held < FUND) {
    const top = FUND - held;
    console.log(`\nFunding the arena with ${hre.ethers.formatEther(top)} STT...`);
    const receipt = await (await deployer.sendTransaction({ to: address, value: top })).wait();
    fundTx = receipt.hash;
    console.log('fund tx   ', fundTx);
  }

  let chargingTx = null;
  if ((await arena.callbackOverheadGas()) !== CALLBACK_OVERHEAD_GAS) {
    const receipt = await (
      await arena.setCharging(CALLBACK_OVERHEAD_GAS, await arena.minChargeGasPrice(), await arena.minRunCredit())
    ).wait();
    chargingTx = receipt.hash;
    console.log(`\nCallback overhead set to ${CALLBACK_OVERHEAD_GAS} gas: ${chargingTx}`);
  }

  const record = {
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: { perpsArena: address },
    transactions: { deploy: deployTx, fund: fundTx, setCharging: chargingTx },
    protocol: { marginBank: MARGIN_BANK },
  };
  const out = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${chainId}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), file)}`);
  console.log(`Arena balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(address))} STT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
