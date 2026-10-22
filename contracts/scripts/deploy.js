const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

// Protocol addresses are identical on testnet and mainnet via CREATE3, and are
// the same values the markets-sdk exports as SOMNIA_TESTNET_ADDRESSES.
const BINARY_MARKETS_MODULE = '0x3ecC694Cef705358864a646142ac17A90E29e388';
const OUTCOME_TOKEN = '0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9';
const ORACLE_HUB = '0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b';

// The precompile requires the SUBSCRIPTION OWNER — the engine contract itself,
// not the deployer — to hold at least this much.
const SUBSCRIPTION_MINIMUM = hre.ethers.parseEther('32');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Deployer:', deployer.address);
  console.log('Balance: ', hre.ethers.formatEther(balance), 'STT\n');

  const ArcadeEngine = await hre.ethers.getContractFactory('ArcadeEngine');
  const engine = await ArcadeEngine.deploy(BINARY_MARKETS_MODULE, OUTCOME_TOKEN, ORACLE_HUB);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log('ArcadeEngine        ', engineAddress);

  const Factory = await hre.ethers.getContractFactory('CommunityDAOFactory');
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('CommunityDAOFactory ', factoryAddress);

  // The engine pays for its own reactivity callbacks, so it has to be funded
  // before it can subscribe. Top it up from the deployer if we can afford it.
  const engineBalance = await hre.ethers.provider.getBalance(engineAddress);
  if (engineBalance < SUBSCRIPTION_MINIMUM) {
    const shortfall = SUBSCRIPTION_MINIMUM - engineBalance;
    const spendable = await hre.ethers.provider.getBalance(deployer.address);
    if (spendable > shortfall + hre.ethers.parseEther('1')) {
      console.log(`\nFunding engine with ${hre.ethers.formatEther(shortfall)} STT...`);
      await (await deployer.sendTransaction({ to: engineAddress, value: shortfall })).wait();
    } else {
      console.log(
        `\n! Engine holds ${hre.ethers.formatEther(engineBalance)} STT and needs 32 STT ` +
          `before subscribeToOracle() will succeed.\n` +
          `  Send STT to ${engineAddress}, then run scripts/subscribe.js.`,
      );
    }
  }

  const record = {
    chainId: 50312,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      arcadeEngine: engineAddress,
      daoFactory: factoryAddress,
    },
    protocol: {
      binaryMarketsModule: BINARY_MARKETS_MODULE,
      outcomeToken: OUTCOME_TOKEN,
      oracleHub: ORACLE_HUB,
    },
  };
  const out = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, '50312.json'), JSON.stringify(record, null, 2) + '\n');

  console.log('\nWrote contracts/deployments/50312.json');
  console.log('\nAdd to frontend/.env.local:');
  console.log(`NEXT_PUBLIC_ARCADE_ENGINE=${engineAddress}`);
  console.log(`NEXT_PUBLIC_DAO_FACTORY=${factoryAddress}`);
  console.log('\nThen: npx hardhat run scripts/subscribe.js --network somniaTestnet');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
