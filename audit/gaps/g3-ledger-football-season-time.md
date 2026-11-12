# G3 — ledger archive, free baselines, football ledger path, Season Lab, Arizona time

Read-only pass over `/private/tmp/claude-501/pl-audit` (branch az-two-book-anytime) and `/private/tmp/claude-501/pl-history`. No network, no tests run, no `.env*` opened. Line numbers are from the checkout. Findings already in `findings.json` are referenced by id and not repeated (D-1, D-2, D-3, D-4, D-5, D-10, D-11, D-12, C1-4, E1-4, E1-6, E1-10, B3-7).

---

## A. Epoch-1 real-money ledger archive

### What the code does
- `src/lib/ledger-epoch.ts:18-24` — `LEDGER_EPOCH = 2`; server archive key `pl:ledger:archive:e1`; device keys `pl_ledger_epoch`, `pl_ledger_archive_e1`.
- `src/lib/ledger-epoch.ts:26-33` `decideEpochMigration(stored)`: epoch >= 2 → no-op; otherwise `{migrate:true, archive: stored.ledger.length > 0}`.
- `src/lib/server/ledger-epoch-server.ts:15-30` `ensureLedgerEpoch()`: GET `pl:ledger:v1` (:16); `JSON.parse` in try, catch → `stored = null` (:18-22); if migrating and `archive && raw` → `SET pl:ledger:archive:e1 <raw> NX` (:25-27, reply not inspected); then SET `{ledger:[], epoch:2, at}` over the live key (:28).
- Called from `GET` and `PUT /api/ledger` (`app/api/ledger/route.ts:75`, `:93`) and the scheduler (`app/api/scheduler/route.ts:219-224`).
- Device side, `src/lib/ledgerSync.ts:83-93` `adoptEpoch`: when the server epoch is newer, copy `pl_ledger` to `pl_ledger_archive_e1` (only if that key is empty), remove `pl_ledger`, store the new epoch.
- `PUT /api/ledger` refuses a body whose `epoch` is below 2 (`app/api/ledger/route.ts:102-105`, `mergeAllowed`, `ledger-epoch.ts:36-39`).

### Direct answers
1. **Is the archive ever read? No.** A grep of `app src tests tools docs legacy .github` finds `EPOCH_ARCHIVE_KEY` only at `ledger-epoch-server.ts:2,12,26` (the write) and `LOCAL_ARCHIVE_KEY` only at `ledgerSync.ts:7,87` (the write). No route, tool, test fixture or UI does a GET of `pl:ledger:archive:e1` or reads `pl_ledger_archive_e1`. `GET /api/ledger` returns `{ledger, bank, noplay, at, epoch}` (`route.ts:77`), never the archive. The owner cannot export it from the app.
2. **Can migration leave no archive? Yes, four ways.**
   - Blob does not parse → `stored = null` → `{migrate:true, archive:false}` → the unparseable bytes are overwritten with an empty ledger (`ledger-epoch-server.ts:18-28`; pinned by `tests/paper-epoch.test.ts:101`). This is D-1.
   - Blob parses but `ledger` is empty or absent → `archive:false` (`ledger-epoch.ts:32`).
   - The e1 key already exists → `SET NX` is a silent no-op and the live ledger is still reset (D-1 reviewer note, D-11).
   - The store rejects the archive SET → `redis()` throws before line 28, so nothing is reset; safe.
   Whether the archive key exists in production cannot be checked offline.
3. **What the owner must export for full pre-paper history** (all need the store console or REST token, or the device itself):
   - `pl:ledger:archive:e1` from Upstash. Written 2026-08-15, before value packing shipped, so expect plain JSON; a value starting `gz1:` is base64 gzip (`src/lib/server/store.ts:26-43`).
   - `pl_ledger_archive_e1` from localStorage on every device that held the real-money ledger (it holds tickets that device had not yet synced, including unlocked entries).
   - `pl:bank:v1` and `pl:noplay:v1` (not reset by the epoch; returned by `GET /api/ledger`).
   - `pl:pred:<date>` day blobs via `GET /api/predictions?date=` (from 2026-07-25) and `pl:cal:summary` / `pl:cal:weights`.
   - On disk today there are only the aggregates in `docs/settlement-audit.md:66-71` (38 tickets, 6-32, $850.00 staked, -$376.91).

### Findings

**G3-A1 (medium) — The real-money archive is write-only and unverified.**
Evidence: `ledger-epoch-server.ts:25-27` (SET NX, reply ignored); `ledgerSync.ts:87`; no reader anywhere (grep above); no route reports whether the key exists (the repo has no health route).
Impact: the only copy of the real-money season (the one period with real profit and loss) sits in a key nobody can see from the app. If it was never written (cases in answer 2) or is later evicted, nobody finds out. It is also the only place a "real money vs paper" comparison can come from.
Fix: add a sync-phrase-gated `GET /api/ledger?archive=e1` that returns the archived blob; add `archiveE1: {present, days}` to the normal `GET /api/ledger` reply; commit one exported copy to the private data-history repo.

**G3-A2 (low) — A device whose archive copy fails still pushes the old season with an epoch-2 stamp.**
Evidence: `ledgerSync.ts:83-93`: if `localStorage.setItem(LOCAL_ARCHIVE_KEY, cur)` throws (storage quota: the copy doubles the ledger's footprint), the `catch` swallows it, `pl_ledger` is not removed and the local epoch stays 1. `syncNow` then reads those old locked days (`:188`), merges them (`:189`) and PUTs with `epoch: LEDGER_EPOCH` — the compile-time constant 2, not the device's epoch (`:208`). `mergeAllowed(2)` passes (`app/api/ledger/route.ts:102`), and `restoreShrunkDays` only protects days already stored (`:132`), so the old dates are added.
Impact: real-money days merged into the paper ledger, changing record, P/L and bankroll. Needs a device not opened since 2026-08-15 with tight storage, so unlikely; derived from the code, not observed.
Fix: send `epoch: localEpoch()` in the PUT body, and make `adoptEpoch` return false on failure so `syncNow` stops before the merge.

---

## B. Baseline sources that need no paid data

### (a) `GET /api/picks` and the cohort record `pl:grade:progress`
- Route: `app/api/picks/route.ts` — public, no auth (`:53` store check only), writes nothing, zero Odds credits. Called by the Board (`app/board/page.tsx:336`).
- Per pick (`:128-151`): rank, player, side, lkey, line, prob, implied, edge, `cz` (settlement-book price), `odds` + `book` (best of any book), gkey, start, `res`, `susp`. These exist only while the board is inside its 3-day TTL (`:74-85`); MLB is out of season so nothing is served now.
- `record` = `pl:grade:progress.cohorts` (`:59-64`), built by `buildCohortRecord` in `src/lib/server/grading-progress.ts:361-414` and written by `app/api/calibrate/route.ts:392-399`. Per prop market: `days, n, w, l, hitRate, impliedMean, bySource{stamped,reconstructed}, perDay[]` (last 10 days only, `:414`), plus flags `impossible, impure, preStamp, vacuous`. Top-50-by-probability rows per market, six markets (`:36-45`).
- **DK/FD repricing: not possible.** The stored record has counts and a mean implied probability only: no price, no book, no stake, no per-pick rows.

### (b) `GET /api/digest`
- `app/api/digest/route.ts:17-33` — sync-phrase gated; reads only `pl:ledger:v1` (MLB) and the last 5 entries of the `pl:cal:weights` log. Nothing in `app/` or `src/` calls it.
- Output (`src/lib/ledger-segments.ts`): CLV by market and by price bucket (settlement-book close vs locked price, consensus-fair close, and DK/FD-basis close); fun split; `nvTax` = for each won ticket, what the DK/FD-basis price would have paid minus the settled payout (`:225-230`); override days; per-market leg calibration with Wilson interval and Brier (`:255-271`); a 7-day block `{days, staked, settled, pl, clvPts}` (`:273-290`).
- **DK/FD repricing: partial.** `nvTax` and `bsPts` use the better of DK/FD per ticket (`bsDec`, `bs`), never each book on its own, and only for bets actually locked. No all-time P/L, no football.

### (c) Regrading the 71 archived board-days against free MLB box scores
- Archive: `/private/tmp/claude-501/pl-history/data/boards` — 142 gz files (`<date>.best.json.gz`, `<date>.latest.json.gz`) + `index.json`; 71 days: 2026-07-26, then 2026-08-06..2026-10-17. File = `{at, date, data}`.
- **Category row fields** (`data.categories.<market>[]`, up to 50 rows each; opened 2026-08-20 and a post-09-17 board with python gzip): `label` ("Yordan Alvarez (HOU)": name + team, no MLB player id), `lkey` (`name|market|line`), `sub` ("Hits O 0.5": side + line), `gkey` (`away@home`), `game`, `prob` (blended %), `pModel` (model-only %), `implied` (consensus fair %), `wBlend`, `edge`, `ev`, `odds` + `book` (best of any book), `cz`/`czOdds`/`czEv`/`czEdge`/`czKellyF` (settlement book: Caesars before 2026-09-17, DraftKings from then), `bs`/`bsBook`/`bsOdds`/`bsEv`/`bsKellyF` (better of DK and FD, with which book), `books`, `booksInd`, `live`, `lu`, `rank`, `conviction`, `tags`, `noParlay`, `opp` (ml/rl only), `settlementBook` (from 2026-09-17).
- **`data.gameInfo[gkey]`**: `{away, home, gm, lu, pk, start}` — `pk` is the statsapi gamePk and is present for every game on all 71 days; `start` is ISO UTC.
- **`data.propBoard`**: the full priced population per game (83,903 rows over the 71 best boards), each `{p, tm, lkey, ln, pO, fO, o/oBook, u/uBook, cz{o,u}, books}`; from 2026-09-14 also `bookQuotes{o:{book:{am,at,line}}, u:{...}}` with DraftKings and FanDuel listed separately.
- **No outcome field on any board** (B3-7).
- Measured over the 71 best boards (categories excluding `all`): 16,050 rows, 760 games; `pModel` and `implied` on all rows; `cz` on 12,019; `bs` on 12,813 (basis book DK 8,580 / FD 4,233); 3,950 `live` rows to exclude. From 2026-09-14 (31 days, 3,899 non-live prop rows): a DraftKings quote on the bet side for 2,952, FanDuel 1,778, both 1,745; two-sided DraftKings 2,031, FanDuel 365.
- **What a regrade needs:** network to `statsapi.mlb.com` (boxscore + linescore per `pk`; free, no key; not possible inside this audit); name+team → boxscore player match inside that one game (name-only key, see A-1; doubleheaders D-8); the stat map the repo already has in `app/api/calibrate/route.ts` / `src/engine2/grade.ts` (hits, total bases, HR, H+R+RBI, pitcher K, pitcher outs; ML/RL from the final); drop `live` rows; void for did-not-play; pushes at integer lines; use `best` and ignore `latest`.
- **DK/FD repricing: yes, in two tiers.** All 71 days: the better-of-DK/FD price for the listed side (`bs` + `bsBook`) on 12,813 of 16,050 rows — a "best of the two books the owner can use" baseline, not each book separately. From 2026-09-14: each book's own quote via `bookQuotes`, DraftKings well covered, FanDuel thin. `cz` is a usable DraftKings price only from 2026-09-17.

### Findings

**G3-B1 (medium) — A free, DK/FD-priced MLB baseline exists on disk and has never been built.**
Evidence: the field inventory and counts above; no script under `tools/` joins boards to results (B3-7 lists only store exports as the way forward; `baseline.md` §9 does not mention this route).
Impact: the owner's question "does the model beat the DK/FD price" can be answered for 71 days and about 12,800 priced rows with zero Odds credits, without waiting for a store export. Until then every threshold stays unmeasured against the books he can bet.
Fix: one offline tool: for each `best` board, fetch boxscores by `gameInfo.pk`, grade every non-live category row and every `propBoard` row, and write `date, market, player, side, line, pModel, implied, bs, bsBook, dkQuote, fdQuote, result`. Report hit rate vs implied and flat-stake ROI at `bs`, and at DK and FD separately from 2026-09-14.

**G3-B2 (low) — The public cohort record cannot be repriced and keeps only a 10-day tail.**
Evidence: `grading-progress.ts:361-381` (shape), `:414` (`perDay` last 10); prices live only on boards with a 3-day TTL (`app/api/picks/route.ts:74-85`).
Impact: the one always-on, free scoreboard says how often top-50 picks hit, never whether they made money at DraftKings or FanDuel.
Fix: when the grade pass settles a cohort day, append per-pick rows (`lkey, side, pModel, implied, DK price, FD price, result`) to a permanent `pl:cohort:<date>` key and add flat-stake ROI by book to the record.

**G3-B3 (low) — `/api/digest` is MLB-only, unused by the app, and its "7-day" block is 7 or 8 day keys.**
Evidence: `app/api/digest/route.ts:17,23` reads only `pl:ledger:v1`; no caller in `app/` or `src/`; `ledger-segments.ts:273` builds the cutoff from `toISOString()` (a UTC date) and compares it with Pacific day keys, so before 16:00 PST the window holds 8 dates and after it 7.
Impact: the only server-computed P/L and CLV report ignores football, the only sport in season, and its weekly figure changes with the hour it is read.
Fix: take the three ledgers, compute the cutoff with `ptToday` minus 6 days, add all-time staked/P&L/ROI per sport and per book.

---

## C. Ledger merge kernel and the football device path

### What the code does
- **Validation** — `validateLedger` (`src/lib/ledger-merge.ts:114-142`) is shape-only; caps 500 days / 900,000 bytes (`:110-111`). (D-4, D-5.)
- **Merge** — `mergeLedgers` keys by date (`:2211-2221`); `mergeDay` deep-copies the `pickBase` winner (`:1499-1509`: grade score, CLV count, confirmed count, byte length) and unions the other copy into it. `unionCore` (`:1041-1353`) appends unseen ticket ids in id order while the day stays under its cap, refuses all unseen ids when any shared id carries a different bet, and resolves a stake disagreement to the base (receipted), the higher stake (receipted raise within cap) or the lower stake (unreceipted, `:1275-1279`). `unionFun` (`:856-910`) re-ranks fun tickets under the fun cap.
- **Grading merge** — `:1959-1969`: ticket verdicts `{...theirs, ...ours}` with one override: a settled verdict on the other copy replaces an unsettled one on the base (`:1964-1966`). Leg results are `{...theirs, ...ours}` with no override (`:1968`).
- **Server guard** — `restoreShrunkDays` (`src/lib/append-only.ts:62-83`) compares ticket id + stake only (`:28-43`) and, on a violation, puts the whole stored day back. MLB protects every stored day (`app/api/ledger/route.ts:132`); football only days with `source === "server-lock"` (`app/api/cfb/ledger/route.ts:103`, `app/api/nfl/ledger/route.ts:104`).
- **Football routes** — `app/api/cfb/ledger/route.ts` and `app/api/nfl/ledger/route.ts` are the same code: sync-phrase gate, sport check on every sent day (cfb `:59-63`, nfl `:61-64`), merge, guard, 413 over 900 KB, bank SET then ledger SET (nfl `:111-116`). No epoch, no no-play log.
- **Football device store** — `src/lib/football/store.ts` (CFB and NFL are thin bindings: `src/lib/cfb/store.ts:20`, `src/lib/nfl/store.ts:18`). `lock()` refuses when the date already has an entry (`:1090-1091`) and throws on any found day (`:1094`; `FOUND_SINCE = 2026-10-03`, `src/lib/found-mode.ts:53,84-86`), so **the phone locks nothing today**. `grade()` (`:1110-1114`) runs `gradeCfbEntry` on the phone and stores it through `overlayGrading` (`:228-284`), which never replaces a settled verdict (`:273-276`, legs `:279-281`). `importLedger` (`:1055-1076`) merges pasted JSON days into the device ledger (D-5). `wipeDevice` clears the device only (`:1079-1083`); the next sync pulls everything back.
- **Football sync** — `src/lib/football/sync.ts:76-162` (NFL) and `src/lib/cfb/sync.ts:55-141` (CFB, same logic): GET, `mergeLedgers(local, remote)`, PUT the whole merged ledger if it differs from the remote, adopt the server's reply, write localStorage. Runs on open, focus, every 4 minutes, and within 60 s of a local change.
- **Server settle** — `src/lib/server/football-lock.ts:297-345`: same grader, same overlay rule (`src/lib/cfb/lock-server.ts:1484-1491`: a settled verdict is kept, except a stored 0-0 push).
- **Bank** — `mergeBankStores` (`src/lib/bankroll.ts:73-88`): log union by `ts|kind|amt|note`, lower base, earlier `asOf`; an adjustment can be added from any device and never removed.

### Answers to the listed risks (football, as it runs today)
| Risk | Result |
|---|---|
| Duplicate tickets after phone/server merge | Not produced by normal sync: tickets union by id, the phone mints no ids on found days. Only a pasted import with different ids can add copies (D-5). |
| Graded result overwritten | A settled verdict is never replaced (device overlay, server overlay, merge base rule). The reverse problem exists: a wrong first verdict is permanent (G3-C1). |
| Graded result lost | Possible in the lost-update race (D-3) and when the guard restores a whole day (G3-C3). |
| Day shrinking | Blocked for server-locked days (id + stake). Not blocked for older device-locked days (D-5). |
| Ticket recorded or changed after kickoff | The server found pass checks kickoff (C1-6). A device PUT has no kickoff check and can append tickets or replace prices on a server-locked day when its copy wins `pickBase` (D-5 probes 1 and 4). |
| Stake changing | Blocked on protected days. Payout changes are not checked (D-5). |
| Client rewriting history | Yes, for any holder of the phrase (D-5). Nothing new found beyond D-5. |

### Findings

**G3-C1 (low) — Football: the first settled verdict is permanent, and the phone can be the one that writes it.**
Evidence: the phone grades every unfinished day each time the Ledger opens (`src/components/cfb/CfbLedger.tsx:571-583`, `:866-871`) and syncs it up; `overlayGrading` skips any ticket already settled (`football/store.ts:273-276`); the server twin does the same except for a 0-0 push (`cfb/lock-server.ts:1484-1491`); the merge keeps the base copy's settled verdict when both are settled, with no marker (`ledger-merge.ts:1962`), and a graded phone copy wins `pickBase` (`:1499-1509`). There is no regrade route or tool.
Impact: a verdict taken from an early or later-corrected ESPN final (NFL stat corrections on player props; a score fixed after the fact) stays in the record, P/L and found-day room for good. The server never recomputes a payout the phone wrote.
Fix: let the server settle pass overwrite a settled verdict when its own re-read of a final game disagrees, logging the change; treat phone grading as display-only for server-locked days.

**G3-C2 (low) — Leg results merge base-wins even when the base says pending and the other copy has the result.**
Evidence: `ledger-merge.ts:1968` (`{...other.legs, ...out.legs}`) against the ticket rule two lines up (`:1964-1966`).
Impact: after a merge a ticket can read won or lost while its legs still read pending. Leg results feed the per-leg lines on football ticket cards (`src/components/cfb/CfbLedger.tsx:842`) and the MLB per-market leg calibration in the digest (`ledger-segments.ts:104-115`, `:255-271`), so a settled leg can show as pending and drop out of calibration counts until a later grade pass rewrites it.
Fix: apply the same settled-over-unsettled rule to the leg map.

**G3-C3 (low) — The append-only guard restores the whole stored day and reports it only to the server console.**
Evidence: `append-only.ts:68-75` replaces the merged day with the stored one; `app/api/nfl/ledger/route.ts:104-105` and `app/api/cfb/ledger/route.ts:103-104` log with `console.warn`; the device then adopts the reply (`football/sync.ts:122-124`).
Impact: every other field the device sent for that day in that PUT (grades, CLV, placed flags) is dropped silently, and the owner is never told a device copy was rejected. Also unproven but possible: the phone stamps `gradedAt` on every grade attempt (`football/store.ts:994`), and the server orders its 2-dates-per-poke settle queue by that stamp (`football-lock.ts:285`, `src/lib/nfl/rules.ts:131`, `src/lib/cfb/rules.ts:290`), so an open Ledger tab can push a date back in the queue.
Fix: restore only the violated tickets and keep the device's additive fields; return `restored: [...]` in the PUT reply and show it in the sync chip; order the settle queue by `attemptedAt` only.

---

## D. CFB Season Lab

### What the code does
- Flag: `CFB_SEASON_ENABLED = true` (`src/lib/features.ts:26`). Page: `app/season/page.tsx:15-36`, renders `CfbSeason` when the selected sport is CFB.
- **Stake:** typed by the owner, whole dollars, default $5, cap $25 (`src/lib/cfb/season.ts:91-92`; `clampSeasonStake`, `src/lib/cfb/season-store.ts:50-53`). A quarter-Kelly chip is shown against a notional $250 bank (`season.ts:89`); it does not set the stake.
- **Book:** none is fetched. The owner types the line and the American price; the book is a free-text label defaulting to "DraftKings" (`season.ts:94`; `src/components/cfb/CfbSeason.tsx:141,201`). The component header still says "Caesars by default" (`CfbSeason.tsx:62`).
- **Model:** season totals projected from ESPN season tables and ESPN FPI (`app/api/cfb/season/route.ts:31-64`), fixed per-stat variation constants (`season.ts:79`), a flat 0.9 haircut per same-team pair in a parlay (`season.ts:83`, `:568`).
- **Grading:** by hand. Won / Lost / Void buttons call `settle` (`season-store.ts:85-86`), which can be changed at any time, including back to open; `remove` deletes a ticket (`:87`). No server check.
- **Storage:** device localStorage key `pl_cfb_season` only (`season-store.ts:28`, `:91`). Never synced, never in any ledger route.
- **Mixed into totals?** No. `seasonLedgerStats` is used only on the Season page (`CfbSeason.tsx:180`). It is not in the CFB ledger stats, bankroll, `/taken`, digest or alerts.
- **Odds API credits:** zero. The route makes three ESPN by-athlete calls and one FPI call, cached for 3,600 s (`route.ts:28,37`; `src/lib/cfb/slate-server.ts:85-93`). It is public and unauthenticated.
- **Nav:** removed on 2026-09-26 (`src/components/shell/AppShell.tsx:74`, `:184`). No link to `/season` anywhere in `app/` or `src/`; reachable only by typing the URL.

### Finding

**G3-D1 (low) — Season Lab is an orphaned live page with an unverifiable, device-only record.**
Evidence: as above (`features.ts:26`, `AppShell.tsx:74`, `season-store.ts:28,85-87`, `CfbSeason.tsx:62` vs `season.ts:94`).
Impact: no effect on the daily record or on credits. Any season tickets the owner did lock exist on one device, can be edited or deleted without trace, and are lost with the browser storage. The projection constants were never measured, so its EV figures have no backing.
Fix: either set `CFB_SEASON_ENABLED = false` and delete the route, or keep it and sync tickets to a `pl:cfb:season:v1` key with settle-once semantics and the book stored as DraftKings or FanDuel.

---

## E. Arizona time

### What the code does
- Day key: `ptToday()` (`src/lib/server/pt-date.ts:20-22`), `ptTodayOf()` (`src/lib/use-pt-today.ts:6-8`), game → day `ptDateOf()` (`src/lib/cfb/dates.ts:15-17`); all `America/Los_Angeles`.
- Slot clock: `ptMinutesOfDay` (`src/lib/server/grading-progress.ts:96-106`). Grade and refill slots 08:00, 09:30, 12:00, 15:00, 16:45 PT (`:55`, `:116`); MLB found slots hourly 08:00-18:00 PT (`:191`); football found slots every 15 min 08:00-18:45 PT (`:192`); each fires only in its own 15-minute window (`:57`, `:119-131`).
- Ticker: external, set in UTC, every 15 min in UTC hours 15-23 and 0-2 (`docs/cron-jobs.md:57`, `:121`). Vercel crons, fixed UTC (`vercel.json:8-25`): scheduler 21:45 and 00:00 daily; NFL lock 16:00 and 17:00 on Sundays.
- Display: kickoffs through `kickoffLabel` are forced Pacific with no zone text (`cfb/dates.ts:12,20-24`; used at `src/components/cfb/CfbProps.tsx:165,318,648`). MLB start times through `gameTimeLabel` are Pacific with a " PT" suffix (`src/lib/game-time-window.ts:65-69`). The game-time slider is in Pacific hours with no label (`game-time-window.ts:25-39,48-53`; `src/components/props/GameTimeRange.tsx:48`). Server-lock time is Pacific and labelled (`src/components/cfb/CfbBuilder.tsx:178-189,354`). "Updated" and "priced at" stamps, the sync chip, MLB ticket lock time and the Sharp/Sim desks use the device zone with no label (`src/lib/football/client.ts:94`, `src/lib/cfb/client.ts:56`, `CfbProps.tsx:1023`, `src/components/cfb/CfbPicksBoard.tsx:277`, `src/components/cfb/CfbSyncChip.tsx:15`, `app/ledger/page.tsx:233`, `app/board/page.tsx:1171`, `src/components/mlb/SharpDesk.tsx:20`, `src/components/mlb/SimDesk.tsx:44`).
- No hard-coded UTC offset drives any date key in `app/` or `src/` (grep for fixed offsets found only `PUSH_SINCE`, `src/lib/server/push.ts:34`, a past instant).

### Worked out for the owner
Arizona is UTC-7 all year. Pacific is UTC-8 from 2026-11-01 to 2027-03-14 (Arizona is 1 hour ahead) and UTC-7 the rest of the year (same clock).

| Item | Pacific | Arizona, Nov-Mar | Arizona, Mar-Nov |
|---|---|---|---|
| Card day rolls over | 00:00 | 01:00 | 00:00 |
| Grade / refill slots | 08:00, 09:30, 12:00, 15:00, 16:45 | 09:00, 10:30, 13:00, 16:00, 17:45 | same as Pacific |
| Football found passes | 08:00-18:45 | 09:00-19:45 | 08:00-18:45 |
| Ticker runs (fixed UTC 15:00-02:45) | 07:00-18:45 PST / 08:00-19:45 PDT | 08:00-19:45 | 08:00-19:45 |
| Vercel scheduler pokes (21:45Z, 00:00Z) | 13:45, 16:00 PST | 14:45, 17:00 | 14:45, 17:00 |
| NFL Sunday lock crons (16:00Z, 17:00Z) | 08:00, 09:00 PST | 09:00, 10:00 | 09:00, 10:00 |
| NFL early kickoff (13:00 Eastern) | 10:00 | 11:00 | 10:00 |

- **Late games and the day key:** a game belongs to the Pacific date of its kickoff. Moving the key to Arizona would only re-date games that start between 23:00 and 24:00 Pacific in winter; no football kickoff falls there, and in baseball season the two zones are identical. So the card a game lands on does not change for the owner.
- **Fixed-UTC crons across the DST change:** the two Sunday NFL crons exist to cover both Eastern offsets, so they are right in both regimes. The ticker window covers every Pacific slot in both regimes (`grading-progress.ts:182-184`); in winter the last football found slot (18:45 PST) is the ticker's very last poke, so there is no later poke to fall back on (E1-6, E1-10).
- **Grading:** results are graded at the five slots above; games that end after the last poke wait until 15:00Z the next day, which is 08:00 Arizona all year (E1-10).

### Real defect or cosmetic
- **Real (display):** G3-E1 below.
- **Cosmetic:** day rollover at 01:00 Arizona in winter; slot times one hour later on the owner's clock in winter; "PT"-labelled times.
- **Not a defect:** fixed-UTC crons; slot coverage; day assignment of late games.

### Recommendation on the day key
**Keep the day key Pacific.** Reasons: (1) it changes which card a game lands on for no real game; (2) every stored key and every ledger day is Pacific-dated, and re-keying mid-season risks one short or doubled day and breaks the match with the 71 archived boards; (3) football kickoffs follow Eastern time, which observes DST, so Pacific-defined slots keep a constant lead before kickoff all year while Arizona-defined slots would drift an hour against kickoffs; (4) for eight months of the year the two are the same clock. Fix the display instead.

### Findings

**G3-E1 (low) — Football kickoff times are shown in Pacific with no zone label, next to stamps in the device zone.**
Evidence: `cfb/dates.ts:12,20-24` and `CfbProps.tsx:165,318,648` (Pacific, unlabelled) against `CfbProps.tsx:1023`, `football/client.ts:94`, `CfbPicksBoard.tsx:277` (device zone, unlabelled) on the same screens; slider hours `GameTimeRange.tsx:48`.
Impact: from November to mid-March every kickoff reads one hour earlier than the owner's clock and than the DraftKings and FanDuel apps, while "updated" times on the same screen are local. A bet found at 5:00 pm Arizona for a game shown as "4:30 PM" looks like a bet taken after kickoff when it was not, and it makes hand-placing the bet at the book error-prone.
Fix: format every user-facing time in the device zone (drop `timeZone` from `kick`, `labelFmt` and `ptClock`) with a short zone suffix, or add an owner setting defaulting to `America/Phoenix`; keep `ptDateOf` and all keys Pacific.

**G3-E2 (low) — The schedule the owner experiences moves by an hour twice a year and is documented only for daylight time.**
Evidence: table above; `docs/cron-jobs.md:57` describes the ticker only as "08:00-19:00 PT in PDT"; slot tables `grading-progress.ts:55,191-192`; UI wording uses PT throughout.
Impact: cosmetic for money. Bet alerts and found passes run 09:00-19:45 Arizona in winter and 08:00-18:45 the rest of the year; the card day, daily ceiling and "wins add room" reset at 01:00 Arizona in winter. No bet is missed or mis-dated because of it.
Fix: none needed in the engine. State slot times in the owner's zone in Settings and in `docs/cron-jobs.md` for both regimes; if fixed local hours are wanted, add the 15:00-15:45Z winter pokes to the found table rather than changing the day key.
