# DreamArena Perps demo recording script

A screen-recorded walkthrough of the live app, about 3 to 4 minutes after editing.
It shows a player bringing their own dreamDEX wallet through a bot they link, all three games, a real trade scored on-chain in the same block, the player paying for their own callbacks, the agent and its limits, and the proof on the explorer.

Live app: https://dreamarena-perps.vercel.app
Explorer: https://explorer.testnet.somnia.network/tokyo

## How the recording is shaped

You record in one long take of about 15 minutes and cut it down afterwards.
Two things set the order:

- **One run at a time.** A player has one active run, so the games go one after another: Survivor, then Streak, then Boss.
- **Survivor needs time.** It starts from an open position and settles 5 minutes later, when a scheduled Reactivity callback fires. You tour the Monitor, Leaderboard, Profile and Agent tabs during those 5 minutes, so the wait is never dead air.

Every write (start run, open, close, end run) takes about 10 to 20 seconds on the testnet.
Keep recording through the waits and cut them in editing.

## Before you press record

1. **Set up your bot once, before recording** (or record it as scene 2, it takes a minute):
   on the Arena tab choose **dreamDEX wallet**, click **Create bot**, and copy its address.
   In dreamDEX, open Wallet 1 (`0xE932…A73A`), then **Bot access**, **Link a bot**, paste the address, and allow Perps on every market.
   Use **Top up** on that bot to give it about 1 STT.
   Then unlink the older bot `0x95…b8E6` there; its key also sits in this project's env files.
2. **Start flat.** Back in the app, paste Wallet 1's address and click **Check link and play**.
   Positions should say "Flat everywhere"; close anything open and end any active run.
   The arena (`0xf9ed…2667`) holds its own 33 STT bond; you do not need to fund it.
3. **Browser.** Use a clean window about 1280 by 800, zoom at 100%, bookmarks bar hidden, and other tabs closed.
   Open a second tab on the explorer, ready for the proof scene.
4. **Stop playing before you record** (the bot chip in the header, then Stop playing), so the take starts from what a visitor sees. The bot key stays in the browser.
5. **Recorder.** Use QuickTime or OBS on the browser window only, at 30 fps, with the mic on if you narrate live.
   You can also record silently and add voiceover later using the lines below.
6. **Pick one market for the whole demo:** ETH.
   It is on the agent's allowlist (BTC, ETH, SOL) and moves enough to show PnL.
7. **Do a dry run first,** without recording, through scenes 3 to 5.
   That way you know where every button is and how long the writes take.

## Scene list

The times are for the edited video.
**Say** is suggested narration; read it as written or in your own words.
**Check** is what must be on screen before you move on.

---

### Scene 1. Landing page (0:00 to 0:20)

**Do**

1. Open https://dreamarena-perps.vercel.app and pause for 2 seconds on the hero, "Leverage challenges the chain referees."
2. Hover over the live card on the right, which shows the callbacks, players and in-a-run counts.
3. Scroll slowly through "Pick a fight with the market," which shows the Survivor, Streak and Boss cards.
4. Keep scrolling to "The trade and the score share a block," the three steps, and pause there.
5. Scroll to "An AI that trades your wallet and cannot withdraw from it."
6. Scroll back to the top and click **Start a run**.

**Say**

> This is DreamArena Perps: leverage challenges on dreamDEX perps, refereed by the chain.
> You trade real perps, pick a game, and the arena contract scores you.
> Not a server. Somnia Reactivity calls the contract in the same block your position changes.

---

### Scene 2. Bring your dreamDEX wallet (0:20 to 0:45)

**Do**

1. The Arena tab shows **Play with your own account**, on the **dreamDEX wallet** tab: create bot, link it in dreamDEX, give it gas, play.
2. Point at step 1: the bot address, made in this browser. Step 3 shows its gas in green.
3. Paste Wallet 1's address and click **Check link and play**. The toast says "Bot linked."
4. Point at the header: the bot chip with your wallet and its gas, and the **Bond** pill.

**Say**

> Your dreamDEX paper money lives in dreamDEX's own wallet, so DreamArena plays it through a bot you link.
> The bot's key was made in this browser and never leaves it. dreamDEX lets it trade for me, never withdraw.
> This bond is what Reactivity needs the arena to hold. Players pay for their own callbacks, so it is never spent.

**Check:** the trade ticket and the Start a run buttons are enabled.

---

### Scene 3. Survivor: open a position and start the clock (0:30 to 1:10)

Survivor needs an open position before the run starts, so the trade comes first.

**Do**

1. On the **Arena** tab, go to the **Trade** ticket.
   Pick **ETH**, then **long**, then the **25** preset (Size, USDso notional).
2. Pause on the preview: Quantity, Worst price (IOC), Account leverage after, and Liquidation price.
   Account leverage after is about 0.01x on a 2,000 USDso account, so there is no liquidation price to speak of and this run cannot be liquidated.
3. Click the long button and wait for the toast "Long … ETH filled."
   Click its explorer link if you want a short cut to the transaction (optional).
4. **Positions** now shows the ETH long with uPnL and Liq.
5. In **Start a run**, choose **Survivor**, market **ETH**, and Survive for **5 min**.
   Point at the **Callback credit** line and the note under it: starting deposits up to 0.05 STT of credit, billed per callback, and what is left stays yours.
6. Click **Start Survivor** and wait for the toast "Survivor run started: Subscriptions are live for your wallet."
7. The run card shows a countdown under "Survive for," and your **Callback credit** at the bottom.
   Scroll down to **Your run, on-chain**: the "Started a Survivor run on ETH" row is there.

**Say**

> First game, Survivor. I open a 25 dollar ETH long, then start the run.
> Starting a run makes the contract subscribe to my own position events, and it schedules a callback for the deadline.
> I paid a few cents of test STT as credit: every callback for my run is billed to it, not to anyone else.
> If I close or get liquidated in the next 5 minutes, I lose. If the position is still open at the deadline, the chain itself settles the win.

**Do not touch the ETH position for the next 5 minutes.**
Do not use the trade ticket, the Close button, or the agent's write tools.

---

### Scene 4. Monitor: the contract's vitals and the live feed (1:10 to 1:40, during the Survivor wait)

**Do**

1. Click the **Monitor** tab.
2. Point at **The arena contract**: Callbacks received, Active runs (your run makes it at least 1), Players, **Same-block**, then **Bond** and **Player credit**.
3. Read the **How a score lands** box, steps 1 to 3.
4. In **Live from the chain**, switch the filter from Everything to **Callbacks**.
   Under each row are the block number, a **trade 0x…** link, a **callback 0x…** link, and a green same-block badge.
5. Click **trade 0x…**. The explorer opens in a new tab: point at its block number.
   Go back, click **callback 0x…**, and point at the same block number.
   Then come back to the app.

**Say**

> This is the arena contract live.
> Each callback row has its proof: the trade, the callback, and one shared block number.
> No keeper submitted that second transaction; Somnia's Reactivity precompile ran it inside the same block.

---

### Scene 5. Leaderboard and Profile (1:40 to 2:05, still during the wait)

**Do**

1. Open **Leaderboard**. You are listed with a "you" badge and an "in a run" badge.
2. Click through the boards: Best streak, Survived, Bosses, Win rate, Realized PnL.
3. Open **Profile**. It shows your player card (Best streak, Survived, Bosses, Closes won, Liquidations, Realized) and **Achievements**.
   "First run" is already earned.
4. Optional: paste another player's address into "Look up any player" to show that any address can be looked up.

**Say**

> Every number here is contract state, moved only by Reactivity callbacks.
> The leaderboard reads it straight from the arena, not from our database. There is no database.

---

### Scene 6. Agent tab (2:05 to 2:40, still during the wait)

**Do**

1. Open **Agent**.
2. Point at **The perps agent**:
   - **Trades:** the account address, with the "linked wallet" badge
   - **Signs as:** the bot address
   - **Markets it may open:** BTC, ETH, SOL
   - **Largest order:** 100 USDso
   - **Max account leverage:** 5x
   - **Reduce-only after a loss of:** 100 USDso
3. Under **Call the agent's tools**, click **Status**, then **Get account**.
   The responses appear with live latency. **Get account** shows your open ETH position.
4. Set Symbol **DOGE**, Side long, USDso **50**, and click **Preview order**.
   The response has `"allowed": false` and `"DOGE is not in this agent's allowed markets (BTC, ETH, SOL)."` That is the limit being enforced in code.
5. Set Symbol **ETH**, USDso **500**, and click **Preview order**.
   The response is `"Order notional 504.80 USDso exceeds the per-order limit of 100 USDso."` (the number follows the live price).
6. Set USDso **25** and preview again. Now it returns `"allowed": true`.
7. Scroll to **Use it from Claude**, where the MCP setup is shown.

**Say**

> The same code runs as an MCP server, so Claude can trade this account.
> It is a linked bot: it can place and cancel orders, but it has no way to withdraw.
> On top of that, limits are enforced before any order is sent: only these markets, at most 100 dollars an order, 5x leverage, and reduce-only after a 100 dollar loss.

**Use only Status, Get account, List markets, Get market and Preview order here.**
Opening or closing through the agent would change your Survivor position.

---

### Scene 7. Survivor settles itself (2:40 to 3:00)

**Do**

1. Go back to **Arena** when the countdown is close to 0:00, and keep recording.
2. At the deadline, within a few seconds, the run card changes to the finished state and **Your run, on-chain** shows "Deadline callback settled the run," with the Survivor run marked Won.
3. Open **Monitor** for a moment: the same row appears in the live feed with its block.
4. Optional: open **Profile**. **Survived** went up by 1, and the **Survivor** achievement is earned.

**Say**

> Five minutes are up. I did nothing; the scheduled callback fired at the deadline second, checked my position on-chain, and settled the run.

**If it has not settled within 30 seconds of the deadline:** keep the clip, refresh once, and wait another 30 seconds.
Delivery can run a few seconds late, and the contract looks back 10 seconds for a due deadline.
If it still has not settled, note the time and tell me; the contract also has a permissionless `finishSurvivor` fallback.

---

### Scene 8. Streak: a trade scored in the same block (3:00 to 3:40)

**Do**

1. Close the ETH long from **Positions** (Close).
   The run is already over, so this does not affect it.
   Wait for the toast "Closed … ETH: Realized … USDso."
2. In **Start another run**, choose **Streak**, market **ETH**, and click Start.
   Wait for "Streak run started."
3. Open a **25** USDso ETH position from the ticket, long or short; pick whichever way you think ETH is moving.
4. **Wait for the uPnL in Positions to turn green and cover the spread.** That can take seconds or minutes.
   Then click **Close**.
5. The run card shows **Trade PnL**, **Run PnL**, and "Winning closes in a row" moving from 0 to 1.
   The **Callback credit** dropped by a fraction of a cent: that was your callbacks, billed to you.
   In **Your run, on-chain**, the row reads "Trade scored +0.00… · win 1," with its block.
6. On **Monitor**, under Callbacks, find the newest row and its same-block badge.
   Open **trade 0x…** and then **callback 0x…** on the explorer: your close and the arena's callback share one block number.
   **This is the most important shot in the video**, so hold on it.
7. Optional: do one more round trip to show "win 2."

**Say**

> Second game, Streak. Every trade that closes in profit adds a win; the first losing close ends the run.
> I close in profit, and the score lands in the same block as my close. Same block number, two transactions, one of them sent by the chain itself.

**If the close is a loss:** keep it.
The row reads "Trade scored −0.00… · loss," and the run ends as Lost.
That is just as strong as proof, because the contract scored a loss you could not hide.
Start another Streak run if you want a win on camera too.

---

### Scene 9. Boss: start it and end it (3:40 to 4:00)

Beating the Boss takes three profitable closes in a row, which can take a long time on a quiet market.
Show the start, the "Boss health" bar, and ending the run, unless you want to play it through.

**Do**

1. If the Streak run is still active, click **End run** and wait for "Run ended: Wins so far are kept."
   Make sure you are flat in ETH.
2. Choose **Boss**, ETH, and Start. The run card shows **Boss health**.
3. Optional: play rounds, each one an open followed by a close in profit. Each win takes off a third of the boss's health.
4. Click **End run**.

**Say**

> Third game, Boss: land three profitable closes in a row before one loss.
> Best streaks, survivals and bosses all go on the on-chain leaderboard.

---

### Scene 10. Wrap up (4:00 to 4:15)

**Do**

1. Back on **Arena**, with no run active, click **Withdraw** on the Callback credit line.
   The credit goes to 0, and the STT lands in your dreamDEX wallet, not the bot.
2. Open **Leaderboard** once more: your Survived and Best streak counts have gone up.
3. Optional: end on the landing page or on the repo page.

**Say**

> What I did not spend on callbacks comes straight back to my wallet.
> DreamArena Perps. Leverage challenges on dreamDEX, refereed by the chain, and open to any wallet.
> The app, the contract and the agent are open source. Links are in the post.

---

## Editing notes

- Cut every 10 to 20 second write wait down to about 1 second, or speed it up 8x, but keep the toast landing in shot.
- Zoom in during editing (about 150%) on four things: the explorer block numbers in scenes 4 and 8, the agent's rejection message in scene 6, "Deadline callback settled the run" in scene 7, and the credit withdrawal in scene 10.
- The bot signs without pop-ups, so the waits are only the testnet's 10 to 20 seconds per write; cut them down.
- If the Survivor wait goes over 5 minutes in the raw take, cut it down. A clock graphic or a quick "5 minutes later" card is enough.
- Export H.264 at 1920 by 1080 if the window allows it, or upscale the 1280-wide recording.
  Keep the file under 512 MB for X; DoraHacks takes a YouTube or Loom link.
- Optional: open the edited demo with the 30-second announcement video (`video/out/dreamarena-perps.mp4`).

## What is real in this demo

Everything on screen is live: real dreamDEX orders on Somnia testnet (paper USDso), real arena state changes, and real Reactivity callbacks.
Nothing is mocked or replayed.
The only scripted part is your narration.
