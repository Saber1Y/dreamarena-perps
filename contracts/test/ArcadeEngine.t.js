const { expect } = require('chai');
const hre = require('hardhat');

// The reactive callback is the one piece of logic that can never be exercised by
// a normal transaction, so it is the one piece that needs a test. We impersonate
// the precompile and feed the engine a real-shaped AnswerDelivered log.
const PRECOMPILE = '0x0000000000000000000000000000000000000100';
const ANSWER_DELIVERED = hre.ethers.id('AnswerDelivered(uint256,bytes32,uint32,uint256[],bool)');
const MARKET_ID = hre.ethers.zeroPadValue('0xe489', 32);
const YES_ID = 1n;
const NO_ID = 2n;

// payoutNumerators [YES, NO] — the winner carries the payout.
function answerData(yesWon, voided = false) {
  return hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint32', 'uint256[]', 'bool'],
    [1, yesWon ? [1, 0] : [0, 1], voided],
  );
}

function topics(marketId = MARKET_ID) {
  return [ANSWER_DELIVERED, hre.ethers.zeroPadValue('0x01', 32), marketId];
}

describe('ArcadeEngine', function () {
  let engine, module_, token, oracleHub, precompile, alice, bob;
  const markets = {}; // marketId -> MockBinaryMarket

  // Every marketId needs a settled market contract behind it, because the
  // engine reads the outcome from the MARKET, never from the event payload.
  async function makeMarket(marketId, { yesWins = true, voided = false, resolved = true } = {}) {
    const M = await hre.ethers.getContractFactory('MockBinaryMarket');
    const m = await M.deploy();
    await m.setOutcome(resolved, voided, yesWins ? 1 : 0, yesWins ? 0 : 1);
    await module_.setMarket(marketId, await m.getAddress(), YES_ID, NO_ID);
    markets[marketId] = m;
    return m;
  }

  beforeEach(async function () {
    const [deployer, _alice, _bob] = await hre.ethers.getSigners();
    alice = _alice;
    bob = _bob;

    const Module = await hre.ethers.getContractFactory('MockMarketsModule');
    module_ = await Module.deploy();
    const Token = await hre.ethers.getContractFactory('MockOutcomeToken');
    token = await Token.deploy();

    // A plain EOA stands in for the OracleHub — only its address matters.
    oracleHub = deployer;

    const Engine = await hre.ethers.getContractFactory('ArcadeEngine');
    engine = await Engine.deploy(
      await module_.getAddress(),
      await token.getAddress(),
      oracleHub.address,
    );

    await makeMarket(MARKET_ID);

    // Let the engine be called as if it were the precompile.
    await hre.network.provider.send('hardhat_impersonateAccount', [PRECOMPILE]);
    await hre.network.provider.send('hardhat_setBalance', [PRECOMPILE, '0x56BC75E2D63100000']);
    precompile = await hre.ethers.getSigner(PRECOMPILE);
  });

  async function enter(who, up, stake = 10_000_000n) {
    await token.mint(who.address, up ? YES_ID : NO_ID, stake);
    await engine.connect(who).recordEntry(MARKET_ID, up, stake, 0);
  }

  describe('recordEntry', function () {
    it('rejects an entry with no matching position', async function () {
      await expect(
        engine.connect(alice).recordEntry(MARKET_ID, true, 10_000_000n, 0),
      ).to.be.revertedWithCustomError(engine, 'NoPosition');
    });

    it('rejects an unknown market', async function () {
      const unknown = hre.ethers.zeroPadValue('0xdead', 32);
      await expect(
        engine.connect(alice).recordEntry(unknown, true, 1n, 0),
      ).to.be.revertedWithCustomError(engine, 'MarketUnknown');
    });

    it('records an entry backed by a real position', async function () {
      await enter(alice, true);
      const entry = await engine.entries(MARKET_ID, alice.address);
      expect(entry.up).to.equal(true);
      expect(entry.shares).to.equal(10_000_000n);
      expect(await engine.entrantCount(MARKET_ID)).to.equal(1n);
    });

    it('rejects a second entry on the same market', async function () {
      await enter(alice, true);
      await token.mint(alice.address, YES_ID, 10_000_000n);
      await expect(
        engine.connect(alice).recordEntry(MARKET_ID, true, 10_000_000n, 0),
      ).to.be.revertedWithCustomError(engine, 'AlreadyEntered');
    });
  });

  describe('onEvent', function () {
    it('reverts for any caller that is not the precompile', async function () {
      await expect(
        engine.connect(alice).onEvent(oracleHub.address, topics(), answerData(true)),
      ).to.be.revertedWithCustomError(engine, 'OnlyReactivityPrecompile');
    });

    it('ignores a log from an emitter that is not the OracleHub', async function () {
      await enter(alice, true);
      await engine.connect(precompile).onEvent(alice.address, topics(), answerData(true));
      expect((await engine.entries(MARKET_ID, alice.address)).resolved).to.equal(false);
    });

    it('ignores a different event from the OracleHub', async function () {
      await enter(alice, true);
      const wrong = [hre.ethers.id('SomethingElse(uint256)'), topics()[1], MARKET_ID];
      await engine.connect(precompile).onEvent(oracleHub.address, wrong, answerData(true));
      expect((await engine.entries(MARKET_ID, alice.address)).resolved).to.equal(false);
    });

    it('settles winners and losers off one oracle answer', async function () {
      await enter(alice, true); // UP
      await enter(bob, false); // DOWN

      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));

      expect((await engine.entries(MARKET_ID, alice.address)).won).to.equal(true);
      expect((await engine.entries(MARKET_ID, bob.address)).won).to.equal(false);
      expect(await engine.streak(alice.address)).to.equal(1n);
      expect(await engine.streak(bob.address)).to.equal(0n);
      expect(await engine.totalWins(alice.address)).to.equal(1n);
      expect(await engine.totalLosses(bob.address)).to.equal(1n);
    });

    it('breaks a streak on a loss', async function () {
      for (let i = 0; i < 3; i++) {
        const marketId = hre.ethers.zeroPadValue(hre.ethers.toBeHex(100 + i), 32);
        await makeMarket(marketId, { yesWins: true });
        await token.mint(alice.address, YES_ID, 1_000_000n);
        await engine.connect(alice).recordEntry(marketId, true, 1_000_000n, 0);
        await engine.connect(precompile).onEvent(oracleHub.address, topics(marketId), answerData(true));
      }
      expect(await engine.streak(alice.address)).to.equal(3n);
      expect(await engine.getMultiplier(alice.address)).to.equal(110n);

      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(true, false, 0, 1); // NO wins
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(false));

      expect(await engine.streak(alice.address)).to.equal(0n);
      expect(await engine.longestStreak(alice.address)).to.equal(3n);
      expect(await engine.getMultiplier(alice.address)).to.equal(100n);
    });

    it('emits a milestone at 3 in a row, and only then', async function () {
      for (let i = 0; i < 3; i++) {
        const marketId = hre.ethers.zeroPadValue(hre.ethers.toBeHex(200 + i), 32);
        await makeMarket(marketId, { yesWins: true });
        await token.mint(alice.address, YES_ID, 1_000_000n);
        await engine.connect(alice).recordEntry(marketId, true, 1_000_000n, 0);
        await engine.connect(precompile).onEvent(oracleHub.address, topics(marketId), answerData(true));
      }

      expect(await engine.streak(alice.address)).to.equal(3n);
      const events = await engine.queryFilter(engine.filters.MilestoneReached(alice.address));
      expect(events.length).to.equal(1); // wins 1 and 2 are not milestones
      expect(events[0].args.milestone).to.equal(3n);
      expect(events[0].args.multiplier).to.equal(110n);
    });

    it('leaves streaks untouched when the market voids', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(true, true, 1, 1); // voided
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true, true));

      expect((await engine.outcomes(MARKET_ID)).voided).to.equal(true);
      expect((await engine.entries(MARKET_ID, alice.address)).resolved).to.equal(false);
      expect(await engine.streak(alice.address)).to.equal(0n);
      expect(await engine.totalLosses(alice.address)).to.equal(0n);
    });
  });

  describe('outcome source', function () {
    // The bug this guards: on testnet, OracleHub's AnswerDelivered carried
    // payoutNumerators [1e7, 0] for a market that itself settled [0, 1e7].
    // The oracle's answer space is not the market's YES/NO space. An engine
    // that trusts the event payload tells a losing player they won.
    it('follows the MARKET, not the event payload, when they disagree', async function () {
      await enter(alice, true); // UP / YES
      await markets[MARKET_ID].setOutcome(true, false, 0, 1); // market: NO wins

      // Event payload says the opposite — YES wins.
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));

      const entry = await engine.entries(MARKET_ID, alice.address);
      expect(entry.resolved).to.equal(true);
      expect(entry.won).to.equal(false); // the market wins the argument
      expect(await engine.streak(alice.address)).to.equal(0n);
      expect((await engine.outcomes(MARKET_ID)).yesWon).to.equal(false);
    });

    it('skips a market that has not resolved yet', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(false, false, 1, 0); // not resolved
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));

      expect((await engine.outcomes(MARKET_ID)).resolved).to.equal(false);
      expect((await engine.entries(MARKET_ID, alice.address)).resolved).to.equal(false);
    });

    it('treats a tied payout vector as a void', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(true, false, 1, 1); // tie
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));

      expect((await engine.outcomes(MARKET_ID)).voided).to.equal(true);
      expect(await engine.totalLosses(alice.address)).to.equal(0n);
    });

    it('survives a market whose reads revert', async function () {
      const R = await hre.ethers.getContractFactory('RevertingMarket');
      const bad = await R.deploy();
      const marketId = hre.ethers.zeroPadValue('0xbad1', 32);
      await module_.setMarket(marketId, await bad.getAddress(), YES_ID, NO_ID);

      // Must not revert — a throw here would burn the subscription's gas and
      // drop every other market resolving in the same batch.
      await expect(
        engine.connect(precompile).onEvent(oracleHub.address, topics(marketId), answerData(true)),
      ).to.not.be.reverted;
      expect((await engine.outcomes(marketId)).resolved).to.equal(false);
    });
  });

  describe('Boss Battle', function () {
    const BOSS = 2; // GameType.BossBattle

    async function bossRound(i, { win = true } = {}) {
      const marketId = hre.ethers.zeroPadValue(hre.ethers.toBeHex(300 + i), 32);
      await makeMarket(marketId, { yesWins: win });
      await token.mint(alice.address, YES_ID, 1_000_000n);
      await engine.connect(alice).recordEntry(marketId, true, 1_000_000n, BOSS);
      await engine
        .connect(precompile)
        .onEvent(oracleHub.address, topics(marketId), answerData(win));
      return marketId;
    }

    it('slays the boss on three straight wins', async function () {
      await bossRound(0);
      expect(await engine.bossRound(alice.address)).to.equal(1n);
      await bossRound(1);
      expect(await engine.bossRound(alice.address)).to.equal(2n);

      await bossRound(2); // the third win
      expect(await engine.bossRound(alice.address)).to.equal(0n); // run resets
      expect(await engine.bossesSlain(alice.address)).to.equal(1n);

      const slain = await engine.queryFilter(engine.filters.BossDefeated(alice.address));
      expect(slain.length).to.equal(1);
      expect(slain[0].args.totalSlain).to.equal(1n);
    });

    it('ends the run on a loss and banks nothing', async function () {
      await bossRound(0);
      await bossRound(1);
      expect(await engine.bossRound(alice.address)).to.equal(2n);

      await bossRound(2, { win: false }); // one round from the boss

      expect(await engine.bossRound(alice.address)).to.equal(0n);
      expect(await engine.bossesSlain(alice.address)).to.equal(0n);
      const ended = await engine.queryFilter(engine.filters.BossRunEnded(alice.address));
      expect(ended[0].args.roundReached).to.equal(2n);
    });

    it('does not touch the boss run for other game types', async function () {
      await enter(alice, true); // HigherOrLower
      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));
      expect(await engine.streak(alice.address)).to.equal(1n);
      expect(await engine.bossRound(alice.address)).to.equal(0n);
    });
  });

  describe('settleMarket', function () {
    // The gap this closes: on testnet, market 0x…ee08 reached Finalized with a
    // real winner while OracleHub emitted NO AnswerDelivered for it. With the
    // reactive callback as the only route, that entry hangs forever.
    it('settles a market the callback never fired for', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(true, false, 1, 0); // YES wins

      // No onEvent at all — the callback never came.
      expect((await engine.outcomes(MARKET_ID)).resolved).to.equal(false);
      expect(await engine.needsSettlement(MARKET_ID)).to.equal(true);

      await engine.connect(bob).settleMarket(MARKET_ID, 50); // permissionless

      const entry = await engine.entries(MARKET_ID, alice.address);
      expect(entry.resolved).to.equal(true);
      expect(entry.won).to.equal(true);
      expect(await engine.streak(alice.address)).to.equal(1n);
      expect(await engine.needsSettlement(MARKET_ID)).to.equal(false);
    });

    it('is idempotent', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(true, false, 1, 0);
      await engine.settleMarket(MARKET_ID, 50);
      await engine.settleMarket(MARKET_ID, 50); // second call is a no-op
      expect(await engine.streak(alice.address)).to.equal(1n);
      expect(await engine.totalWins(alice.address)).to.equal(1n);
    });

    it('refuses while the market is still unresolved', async function () {
      await enter(alice, true);
      await markets[MARKET_ID].setOutcome(false, false, 1, 0);
      await expect(engine.settleMarket(MARKET_ID, 50)).to.be.revertedWithCustomError(
        engine,
        'NotResolved',
      );
      expect(await engine.needsSettlement(MARKET_ID)).to.equal(false);
    });

    it('sweeps entrants the callback could not reach', async function () {
      const cap = Number(await engine.MAX_RESOLVES_PER_CALLBACK());
      const wallets = [];
      for (let i = 0; i < cap + 3; i++) {
        const w = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
        await hre.network.provider.send('hardhat_setBalance', [w.address, '0x56BC75E2D63100000']);
        await token.mint(w.address, YES_ID, 1_000_000n);
        await engine.connect(w).recordEntry(MARKET_ID, true, 1_000_000n, 0);
        wallets.push(w);
      }

      await engine.connect(precompile).onEvent(oracleHub.address, topics(), answerData(true));
      expect(await engine.pendingResolves(MARKET_ID)).to.equal(3n);

      await engine.settleMarket(MARKET_ID, 10);
      expect(await engine.pendingResolves(MARKET_ID)).to.equal(0n);
      expect((await engine.entries(MARKET_ID, wallets[cap + 2].address)).won).to.equal(true);
    });

    it('refuses to run before the market is resolved', async function () {
      await markets[MARKET_ID].setOutcome(false, false, 0, 0);
      await expect(engine.settleMarket(MARKET_ID, 10)).to.be.revertedWithCustomError(
        engine,
        'NotResolved',
      );
    });
  });
});
