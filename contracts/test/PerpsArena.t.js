const { expect } = require('chai');
const hre = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

// Reactive callbacks can never come from a normal transaction, so the tests
// impersonate the precompile and feed the arena real-shaped MarginBank logs.
// A mock precompile at 0x0100 records each subscription so the filters can be
// asserted, not assumed.
const PRECOMPILE = '0x0000000000000000000000000000000000000100';
const { ethers } = hre;
const coder = ethers.AbiCoder.defaultAbiCoder();

const UPDATED = ethers.id('PositionUpdated(address,address,int128,uint128,int256,int256)');
const LIQUIDATED = ethers.id('PositionLiquidated(address,address,int128,uint256)');
const SCHEDULE = ethers.id('Schedule(uint256)');
const PLACE_ORDER_FOR = ethers
  .id('placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)')
  .slice(0, 10);

const Game = { None: 0, Survivor: 1, Streak: 2, Boss: 3 };
const Status = { None: 0, Active: 1, Won: 2, Lost: 3, Ended: 4 };
const E18 = 10n ** 18n;
const pad = (address) => ethers.zeroPadValue(address, 32);

describe('PerpsArena', function () {
  let arena, bank, pool, otherPool, fakePool, reactivity, precompile, owner, alice, bob, agent;

  beforeEach(async function () {
    [owner, alice, bob, agent] = await ethers.getSigners();

    bank = await (await ethers.getContractFactory('MockMarginBank')).deploy();
    const Pool = await ethers.getContractFactory('MockPerpPool');
    pool = await Pool.deploy();
    otherPool = await Pool.deploy();
    fakePool = await Pool.deploy(); // never registered with the bank
    await bank.registerPool(await pool.getAddress(), true);
    await bank.registerPool(await otherPool.getAddress(), true);

    const mock = await (await ethers.getContractFactory('MockReactivityPrecompile')).deploy();
    await hre.network.provider.send('hardhat_setCode', [PRECOMPILE, await ethers.provider.getCode(await mock.getAddress())]);
    reactivity = await ethers.getContractAt('MockReactivityPrecompile', PRECOMPILE);
    await hre.network.provider.send('hardhat_impersonateAccount', [PRECOMPILE]);
    await hre.network.provider.send('hardhat_setBalance', [PRECOMPILE, '0x56BC75E2D63100000']);
    precompile = await ethers.getSigner(PRECOMPILE);

    arena = await (await ethers.getContractFactory('PerpsArena')).deploy(await bank.getAddress());
    await owner.sendTransaction({ to: await arena.getAddress(), value: ethers.parseEther('32') });
  });

  // --- helpers ---------------------------------------------------------------

  const poolAddr = () => pool.getAddress();

  async function updated(player, newSize, pnl, { emitter, onPool } = {}) {
    const data = coder.encode(['int128', 'uint128', 'int256', 'int256'], [newSize, 2000n * E18, pnl, 0n]);
    return arena
      .connect(precompile)
      .onEvent(emitter ?? (await bank.getAddress()), [UPDATED, pad(player.address), pad(onPool ?? (await poolAddr()))], data);
  }

  async function liquidated(player) {
    const data = coder.encode(['int128', 'uint256'], [-10n, 1500n * E18]);
    return arena.connect(precompile).onEvent(await bank.getAddress(), [LIQUIDATED, pad(player.address), pad(await poolAddr())], data);
  }

  async function schedule(timestampMillis) {
    return arena.connect(precompile).onEvent(PRECOMPILE, [SCHEDULE, ethers.toBeHex(timestampMillis, 32)], '0x');
  }

  // Hideki delivered a schedule set for ...992000 with topic ...992012: the
  // topic is the block's actual time, so tests deliver with that offset.
  const FIRED_LATE_MS = 12n;

  async function startStreak(player, game = Game.Streak) {
    await arena.connect(player).startRun(game, await poolAddr(), 0);
  }

  async function startSurvivor(player, seconds = 600) {
    await bank.setSize(player.address, await poolAddr(), 10n);
    await arena.connect(player).startRun(Game.Survivor, await poolAddr(), seconds);
  }

  // --- starting a run --------------------------------------------------------

  describe('startRun', function () {
    it('opens one PositionUpdated and one PositionLiquidated subscription filtered to the player and pool', async function () {
      await startStreak(alice);
      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Active);
      expect(run.subs[0]).to.not.equal(0n);
      expect(run.subs[1]).to.not.equal(0n);
      expect(run.subs[2]).to.equal(0n);

      for (const [id, sig] of [
        [run.subs[0], UPDATED],
        [run.subs[1], LIQUIDATED],
      ]) {
        const [data, subOwner] = await reactivity.getSubscriptionInfo(id);
        expect(subOwner).to.equal(await arena.getAddress());
        expect(data.emitter).to.equal(await bank.getAddress());
        expect(data.eventTopics).to.deep.equal([sig, pad(alice.address), pad(await poolAddr()), ethers.ZeroHash]);
        expect(data.handlerContractAddress).to.equal(await arena.getAddress());
        expect(data.isGuaranteed).to.equal(true);
        expect(data.isCoalesced).to.equal(false);
        expect(data.gasLimit).to.equal(await arena.callbackGasLimit());
      }
    });

    it('adds a schedule subscription at the Survivor deadline', async function () {
      await startSurvivor(alice, 600);
      const run = await arena.getRun(alice.address);
      const [data] = await reactivity.getSubscriptionInfo(run.subs[2]);
      expect(data.emitter).to.equal(PRECOMPILE);
      expect(data.eventTopics[0]).to.equal(SCHEDULE);
      expect(BigInt(data.eventTopics[1])).to.equal(run.deadline * 1000n);
      expect(await arena.scheduledPlayer(run.deadline)).to.equal(alice.address);
    });

    it('gives two players starting in the same block distinct deadline seconds', async function () {
      await bank.setSize(alice.address, await poolAddr(), 10n);
      await bank.setSize(bob.address, await poolAddr(), -10n);
      await hre.network.provider.send('evm_setAutomine', [false]);
      await arena.connect(alice).startRun(Game.Survivor, await poolAddr(), 600);
      await arena.connect(bob).startRun(Game.Survivor, await poolAddr(), 600);
      await hre.network.provider.send('evm_mine');
      await hre.network.provider.send('evm_setAutomine', [true]);

      const a = await arena.getRun(alice.address);
      const b = await arena.getRun(bob.address);
      expect(b.deadline).to.equal(a.deadline + 1n);
      expect(await arena.scheduledPlayer(a.deadline)).to.equal(alice.address);
      expect(await arena.scheduledPlayer(b.deadline)).to.equal(bob.address);

      // Each callback settles its own player, even with the real ms offset.
      await bank.setSize(alice.address, await poolAddr(), 0n);
      await schedule(b.deadline * 1000n + FIRED_LATE_MS);
      expect((await arena.getRun(bob.address)).status).to.equal(Status.Won);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Active);
      await schedule(a.deadline * 1000n + FIRED_LATE_MS);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);
    });

    it('refuses bad input', async function () {
      await expect(arena.connect(alice).startRun(Game.None, await poolAddr(), 0)).to.be.revertedWithCustomError(arena, 'InvalidGame');
      await expect(arena.connect(alice).startRun(Game.Streak, await fakePool.getAddress(), 0)).to.be.revertedWithCustomError(arena, 'InvalidPool');
      await expect(arena.connect(alice).startRun(Game.Streak, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(arena, 'InvalidPool');
      await expect(arena.connect(alice).startRun(Game.Survivor, await poolAddr(), 600)).to.be.revertedWithCustomError(arena, 'NeedOpenPosition');

      await bank.setSize(alice.address, await poolAddr(), 10n);
      await expect(arena.connect(alice).startRun(Game.Streak, await poolAddr(), 0)).to.be.revertedWithCustomError(arena, 'NeedFlatPosition');
      await expect(arena.connect(alice).startRun(Game.Survivor, await poolAddr(), 299)).to.be.revertedWithCustomError(arena, 'SurvivalOutOfRange');
      await expect(arena.connect(alice).startRun(Game.Survivor, await poolAddr(), 86_401)).to.be.revertedWithCustomError(arena, 'SurvivalOutOfRange');
    });

    it('allows one active run per player', async function () {
      await startStreak(alice);
      await expect(startStreak(alice)).to.be.revertedWithCustomError(arena, 'RunActive');
    });

    it('refuses to start without 32 STT to own subscriptions', async function () {
      await arena.withdrawNative(owner.address, ethers.parseEther('1'));
      await expect(startStreak(alice)).to.be.revertedWithCustomError(arena, 'ArenaUnfunded');
    });

    it('lets only a linked bot start a run for a player', async function () {
      const p = await poolAddr();
      await expect(arena.connect(agent).startRunFor(alice.address, Game.Streak, p, 0)).to.be.revertedWithCustomError(arena, 'NotAuthorized');

      // A grant for another selector, or on an unregistered pool, does not count.
      await pool.setOperator(alice.address, agent.address, '0xdeadbeef', true);
      await fakePool.setOperator(alice.address, agent.address, PLACE_ORDER_FOR, true);
      await expect(arena.connect(agent).startRunFor(alice.address, Game.Streak, p, 0)).to.be.revertedWithCustomError(arena, 'NotAuthorized');
      await expect(
        arena.connect(agent).startRunFor(alice.address, Game.Streak, await fakePool.getAddress(), 0),
      ).to.be.revertedWithCustomError(arena, 'NotAuthorized');

      await pool.setOperator(alice.address, agent.address, PLACE_ORDER_FOR, true);
      await expect(arena.connect(agent).startRunFor(alice.address, Game.Streak, p, 0))
        .to.emit(arena, 'RunStarted')
        .withArgs(alice.address, Game.Streak, p, 0, agent.address);
    });
  });

  // --- Streak and Boss ---------------------------------------------------------

  describe('Streak', function () {
    it('sums per-change realized PnL from open to flat and counts a profitable close', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n); // open
      await updated(alice, 5n, 2n * E18); // half close, +2
      await expect(updated(alice, 0n, -1n * E18)) // close the rest, -1: the trade made +1
        .to.emit(arena, 'TradeScored')
        .withArgs(alice.address, 1n * E18, true, 1);

      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Active);
      expect(run.wins).to.equal(1);
      expect(run.tradePnl).to.equal(0n);
      const s = await arena.stats(alice.address);
      expect(s.closedTrades).to.equal(1);
      expect(s.winningTrades).to.equal(1);
      expect(s.bestStreak).to.equal(1);
      expect(s.realizedPnl).to.equal(1n * E18);
    });

    it('ends the run on the first losing close and unsubscribes', async function () {
      await startStreak(alice);
      const [updatedSub, liquidatedSub] = (await arena.getRun(alice.address)).subs;
      expect(await reactivity.active(updatedSub)).to.equal(true);
      await updated(alice, 10n, 0n);
      await updated(alice, 0n, 3n * E18);
      await updated(alice, -4n, 0n);
      await expect(updated(alice, 0n, -2n * E18))
        .to.emit(arena, 'RunFinished')
        .withArgs(alice.address, Game.Streak, Status.Lost, 1, 1n * E18);

      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Lost);
      expect(run.subs.every((id) => id === 0n)).to.equal(true);
      expect(await reactivity.active(updatedSub)).to.equal(false);
      expect(await reactivity.active(liquidatedSub)).to.equal(false);
      expect(await arena.activeRuns()).to.equal(0n);
    });

    it('counts a break-even close as a loss', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n);
      await updated(alice, 0n, 0n);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);
    });

    it('scores a flip as a close of the old trade', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n); // long
      await expect(updated(alice, -5n, 4n * E18)) // one order closes the long at +4 and opens a short
        .to.emit(arena, 'TradeScored')
        .withArgs(alice.address, 4n * E18, true, 1);
      const run = await arena.getRun(alice.address);
      expect(run.lastSize).to.equal(-5n);
      expect(run.tradePnl).to.equal(0n);
    });

    it('ends on a liquidation', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n);
      await expect(liquidated(alice)).to.emit(arena, 'Liquidated').withArgs(alice.address, await poolAddr());
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);
      expect((await arena.stats(alice.address)).liquidations).to.equal(1);
    });
  });

  describe('Boss', function () {
    it('is won outright at three profitable closes, and later events are ignored', async function () {
      await startStreak(alice, Game.Boss);
      for (let i = 0; i < 3; i++) {
        await updated(alice, 10n, 0n);
        await updated(alice, 0n, 1n * E18);
      }
      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Won);
      expect(run.wins).to.equal(3);
      expect((await arena.stats(alice.address)).bossesSlain).to.equal(1);

      await updated(alice, 10n, 0n);
      await updated(alice, 0n, -5n * E18);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Won);
      expect((await arena.stats(alice.address)).closedTrades).to.equal(3);
    });
  });

  // --- Survivor ----------------------------------------------------------------

  describe('Survivor', function () {
    it('wins when the scheduled callback finds the position still open', async function () {
      await startSurvivor(alice);
      const run = await arena.getRun(alice.address);
      await updated(alice, 20n, 0n); // adding is fine
      await updated(alice, -5n, 1n * E18); // so is flipping
      await bank.setSize(alice.address, await poolAddr(), -5n);

      await expect(schedule(run.deadline * 1000n + FIRED_LATE_MS))
        .to.emit(arena, 'RunFinished')
        .withArgs(alice.address, Game.Survivor, Status.Won, 0, 1n * E18);
      expect((await arena.stats(alice.address)).survived).to.equal(1);
      expect(await arena.scheduledPlayer(run.deadline)).to.equal(ethers.ZeroAddress);
      expect((await arena.getRun(alice.address)).subs.every((id) => id === 0n)).to.equal(true);
    });

    it('still settles when the schedule is delivered seconds late', async function () {
      await startSurvivor(alice);
      const run = await arena.getRun(alice.address);
      await schedule((run.deadline + 7n) * 1000n + 450n);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Won);
    });

    it('never settles a deadline later than the firing time', async function () {
      await startSurvivor(alice);
      const run = await arena.getRun(alice.address);
      await schedule((run.deadline - 1n) * 1000n + 999n);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Active);
      // and a delivery past the lookback window cannot find it either
      await schedule((run.deadline + 11n) * 1000n);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Active);
    });

    it('loses on a full close before the deadline', async function () {
      await startSurvivor(alice);
      await updated(alice, 0n, 2n * E18);
      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Lost);
      expect(await arena.scheduledPlayer(run.deadline)).to.equal(ethers.ZeroAddress);
    });

    it('loses on a liquidation', async function () {
      await startSurvivor(alice);
      await liquidated(alice);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);
    });

    it('can be settled by anyone after the deadline if the schedule never fired', async function () {
      await startSurvivor(alice, 600);
      await expect(arena.connect(bob).finishSurvivor(alice.address)).to.be.revertedWithCustomError(arena, 'TooEarly');
      await time.increase(600);
      await arena.connect(bob).finishSurvivor(alice.address);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Won);
    });

    it('settles a late finish as lost when the position is gone', async function () {
      await startSurvivor(alice, 600);
      await bank.setSize(alice.address, await poolAddr(), 0n);
      await time.increase(600);
      await arena.connect(bob).finishSurvivor(alice.address);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);
    });

    it('ignores a schedule tick for a slot nobody holds', async function () {
      await startSurvivor(alice);
      await schedule(123n);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Active);
    });
  });

  // --- Callback safety -----------------------------------------------------------

  describe('callback safety', function () {
    it('only accepts callbacks from the precompile', async function () {
      await startStreak(alice);
      const data = coder.encode(['int128', 'uint128', 'int256', 'int256'], [10n, 0n, 0n, 0n]);
      await expect(
        arena.connect(bob).onEvent(await bank.getAddress(), [UPDATED, pad(alice.address), pad(await poolAddr())], data),
      ).to.be.revertedWithCustomError(arena, 'OnlyReactivityPrecompile');
    });

    it('ignores the wrong emitter, the wrong pool, and players without a run', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n);
      await updated(alice, 0n, -1n * E18, { emitter: bob.address });
      await updated(alice, 0n, -1n * E18, { onPool: await otherPool.getAddress() });
      await updated(bob, 10n, 0n);

      const run = await arena.getRun(alice.address);
      expect(run.status).to.equal(Status.Active);
      expect(run.lastSize).to.equal(10n);
      expect((await arena.getRun(bob.address)).status).to.equal(Status.None);
      expect(await arena.callbacks()).to.equal(4n);
    });
  });

  // --- Ending and cleanup ----------------------------------------------------------

  describe('ending a run', function () {
    it('can be ended by the player or their linked bot, not a stranger', async function () {
      await startStreak(alice);
      await expect(arena.connect(bob).endRun(alice.address)).to.be.revertedWithCustomError(arena, 'NotAuthorized');
      await pool.setOperator(alice.address, agent.address, PLACE_ORDER_FOR, true);
      await arena.connect(agent).endRun(alice.address);
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Ended);
      await expect(arena.connect(alice).endRun(alice.address)).to.be.revertedWithCustomError(arena, 'NoActiveRun');

      await startStreak(alice);
      await arena.connect(alice).endRun(alice.address);
      expect((await arena.stats(alice.address)).runs).to.equal(2);
    });

    it('finishes a run even when unsubscribing fails, and blocks a new run until cleanup', async function () {
      await startStreak(alice);
      await updated(alice, 10n, 0n);
      await reactivity.setFailUnsubscribe(true);
      await expect(updated(alice, 0n, -1n * E18)).to.emit(arena, 'UnsubscribeFailed');
      expect((await arena.getRun(alice.address)).status).to.equal(Status.Lost);

      // A new run beside the old live subscriptions would count every event twice.
      await expect(startStreak(alice)).to.be.revertedWithCustomError(arena, 'StaleSubscription');
      await expect(arena.cleanup(alice.address)).to.emit(arena, 'UnsubscribeFailed');

      await reactivity.setFailUnsubscribe(false);
      await arena.connect(bob).cleanup(alice.address);
      expect((await arena.getRun(alice.address)).subs.every((id) => id === 0n)).to.equal(true);
      await startStreak(alice);
    });

    it('refuses cleanup on an active run', async function () {
      await startStreak(alice);
      await expect(arena.cleanup(alice.address)).to.be.revertedWithCustomError(arena, 'RunActive');
    });
  });

  // --- Player registry ----------------------------------------------------------------

  describe('players', function () {
    it('lists each player once, in join order, with paging', async function () {
      expect(await arena.playerCount()).to.equal(0n);
      expect(await arena.getPlayers(0, 10)).to.deep.equal([]);

      await startStreak(alice);
      await arena.connect(alice).endRun(alice.address);
      await startStreak(alice); // a second run does not list her twice
      await startStreak(bob);

      expect(await arena.playerCount()).to.equal(2n);
      expect(await arena.getPlayers(0, 10)).to.deep.equal([alice.address, bob.address]);
      expect(await arena.getPlayers(1, 10)).to.deep.equal([bob.address]);
      expect(await arena.getPlayers(0, 1)).to.deep.equal([alice.address]);
      expect(await arena.getPlayers(5, 10)).to.deep.equal([]);
    });
  });

  // --- Admin ------------------------------------------------------------------------

  describe('admin', function () {
    it('lets only the owner pause, tune gas and withdraw', async function () {
      await expect(arena.connect(alice).setPaused(true)).to.be.revertedWithCustomError(arena, 'OwnableUnauthorizedAccount');
      await expect(arena.connect(alice).setCallbackGasLimit(500_000)).to.be.revertedWithCustomError(arena, 'OwnableUnauthorizedAccount');
      await expect(arena.connect(alice).withdrawNative(alice.address, 1n)).to.be.revertedWithCustomError(arena, 'OwnableUnauthorizedAccount');

      await arena.setPaused(true);
      await expect(startStreak(alice)).to.be.revertedWithCustomError(arena, 'Paused');

      await expect(arena.setCallbackGasLimit(199_999)).to.be.revertedWithCustomError(arena, 'GasLimitOutOfRange');
      await arena.setCallbackGasLimit(500_000);
      expect(await arena.callbackGasLimit()).to.equal(500_000n);
    });
  });
});
