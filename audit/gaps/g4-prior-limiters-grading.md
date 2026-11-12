# G4 — prior-audit re-verification, missing limiters, PL_CFSEL, grading vs book settlement, season context

Read-only pass on `/private/tmp/claude-501/pl-audit` (branch `az-two-book-anytime`), 2026-11-12.
Nothing under the checkout was changed. No network, no tests run, no `.env*` opened.
All paths below are relative to the checkout unless absolute. Line numbers were read fresh in this pass.

"Live today" means mid-November 2026: MLB is out of season (last archived board 2026-10-17), CFB and NFL are the only desks producing picks.

---

## A. P-1 .. P-16 re-verified (tried to refute each)

| id | verdict | corrected severity | live today? | what the code says |
|---|---|---|---|---|
| P-1 | CONFIRMED (title tweak) | medium while the outs guard holds; high if it is lifted | No. Next season only | `legacy/index.html:2253` `ipg=shShrink(ipg,nOut,4,Lipg)` (k=4), `:2258` `of=shClamp(0.140/oo,0.86,1.12,...)`, `:2260` `lam=ipg*3*of` — no hook term. Suspension lift is real: `src/lib/paper-mode.ts:127-143` (`hrrAltMax: 99, outsSusp: false, since "2026-08-15"`), applied at `app/api/generate/route.ts:438`, `app/api/scheduler/route.ts:255`, `src/lib/engine-client.ts:125`. Money path is covered only by `OUTS_OFF_SINCE` (`src/lib/found-mode.ts:146-151`, used at `src/lib/server/lock-card.ts:1082`). Title correction: `docs/freeze-exit-bundle.md:32` labels M2' an *alternative* to M2, not a third defect; the three defects per `docs/pitcher-outs-audit.md` are the 0.140 anchor, no hook term, k=4. Outs rows still reach the Board/generator/prediction store untagged. |
| P-2 | CONFIRMED | high | YES — football | `src/lib/found-mode.ts:165-172` `round(kellyMult*bankroll*min(kellyFrac*f,kellyCap))` with `kellyMult 4` (:65), `kellyFrac 0.25` (:66), `kellyCap 0.02` (:68), `bankroll 10000` (:63) = full Kelly capped at 8% = $800 (`FOUND_MAX_STAKE` :76). Same function sizes football: `src/lib/cfb/found.ts:180`. `src/lib/bankroll.ts` (managed bankroll) is not imported by found-mode or lock-card. The 10% daily cap (`legacy/index.html:1075`) is replaced by the $2,500 + won-profit ceiling. Owner-directed (header quotes the owner), so this is a recorded decision, not a regression by accident. |
| P-3 | CONFIRMED | high for MLB | No. Next season only | `src/lib/server/lock-card.ts:177` `booksInd: 0,` hard-coded on every straight; found filter (:1134-1151) tests only `ev > 0` (:1149). The allocator gates (`legacy/index.html:3039` EV gate, `:3050-3065` no-independent-consensus, `:3068-3079` consensus) sit in `shAllocate`, which the found path does not call. Only compensation: half-shrink to consensus (`src/lib/shrink.ts`), and that is skipped when `imp` is missing. MLB path only; football has its own gate (`src/lib/cfb/found.ts`, `evCz >= foundFootballMinEv`). |
| P-4 | PARTLY — title wrong | medium now, high before opening day | No. Dormant | `data/pen_quality.json` IS tracked: exactly one commit, `4cd1c5d` 2026-07-20. No workflow ever re-commits it: `.github/workflows/context.yml` adds only `data/ump_k.json` (context.json commit paused 2026-07-29, :30-33); `.github/workflows/model.yml:7-10` schedule commented out. `tools/build_context.py:110` reads it, `:151` writes it, on a runner that then discards it. Frozen inputs: `public/model/priors.json` last commit `671aed9` 2026-07-29 15:58Z; `public/model/context.json` last commit `64c42ad` 2026-07-29 20:32Z (date field 2026-07-29). No date check in `shPenF` (`legacy/index.html:1663-1669`). Corrected title: "pen_quality.json is committed once (2026-07-20) and never refreshed; all model inputs frozen at 2026-07-29 with no staleness check". |
| P-5 | CONFIRMED | medium (register calls the magnitude PROVISIONAL) | No. Next season only | `legacy/index.html:2349/2351` `shShrink(bn.r,bn.n,60,...)`, `:2357` k=150 for HR, sim `:2065-2066` same chain. `docs/freeze-exit-bundle.md:36` M11 "effective form weight ~0.56 = 4-11x measured", one board, n=3,061. Unchanged. Found path half-shrinks to market, which dampens but does not fix it. |
| P-6 | CONFIRMED | medium | No. MLB only | `legacy/index.html:2491` `fair=oneImp/1.06`, `:2605` `iO/1.06`; measured 1.161 (`/private/tmp/claude-501/pl-history/data/hr_overround.json`, 7,581 rows). HR is barred from the found card (`found_hr`), so the damage is Board/grade display and calibration rows. |
| P-7 | CONFIRMED | medium | No. MLB only | Live: `legacy/index.html:2308-2309` `shBlend(...,"ab",10)` unshrunk; shadow only: `:2434` `shShrink(sBnb.r,sBnb.n,75,...)`. |
| P-8 | PARTLY | low–medium | No. MLB only | M6 confirmed in code (`:2389-2396` sim marginal replaces closed form only for H+R+RBI). But the register itself holds M7+M9 as REFUTED-as-specified (2026-07-27) and M4 as conditional, so "never shipped" overstates two of the four. |
| P-9 | CONFIRMED | medium | Runs today (cost only) | `tools/snapshot_props.py:24` six markets, no `_alternate`; `:27` `CZ = "williamhill_us"` while `src/lib/sportsbook/books.ts:12` `SETTLE_BOOK = 'draftkings'`. `.github/workflows/props-history.yml` has six active daily crons that keep firing in the off-season. |
| P-10 | PARTLY | low–medium | Yes (infra) | Passcode is write-only: `app/settings/page.tsx:361-362` stores `pl_pass`, no client sends `x-pl-pass`. But `/api/odds` does not refuse: without it a `fresh` request degrades to cache (`app/api/odds/route.ts:47-50`). `/api/sharp` 401s when `APP_PASSCODE` is set (`:69-72`) and its client sends no header, so the feature would break rather than be open. `/api/calibrate:76-84` `return !cron` is open only if `CRON_SECRET` is unset; the scheduler fails closed without it (`app/api/scheduler/route.ts:156-161`), so in practice it is set (inference, not seen). |
| P-11 | CANNOT VERIFY from repo (stands as a risk) | low–medium | Yes (infra) | `vercel.json` has no calibrate cron; `docs/cron-jobs.md:21-22` names cron-job.org rows. In-repo scheduler only calls `/api/calibrate?grade=only` (`app/api/scheduler/route.ts:416-418`; `app/api/calibrate/route.ts:138-147`). MLB refit is dormant, but the same external 15-minute ticker drives football found passes. |
| P-12 | CONFIRMED | low–medium | No. MLB only | `legacy/index.html:2524` suspRow needs `hrrAltMax` below the line or `outsSusp`; with 99/false no row is ever tagged (`:2549`). Owner-directed lift with its own data in `paper-mode.ts`. HRR overs are still barred from the found card (`found_hrr_over`). |
| P-13 | CONFIRMED | low | Yes (UI) | `app/settings/page.tsx:74,:77` still offers `probability` and `caesars_ev` modes. |
| P-14 | CONFIRMED | low | No. MLB only | `legacy/index.html:2798/2809/2819` `out.push(p)` with no dedupe; `:2764` `probNaive` null without a sim joint. |
| P-15 | CONFIRMED | low | No. MLB only | `shGradeOrientFix` `legacy/index.html:3661-3676` overwrites `g.detail` and stamps v=2 with no before-image. |
| P-16 | CONFIRMED | low | docs | `docs/freeze-exit-bundle.md:632-642` requires an A3 decision record dated 2026-09-22; none found in `docs/`. |

Net: of the five "high" prior-regression findings only P-2 touches a bet placed today. P-1, P-3, P-4, P-5 are MLB-only and dormant until spring; they must be closed before opening day.

---

## B. Two limiters missing from AUDIT.md section 3

### B1. Slate horizon — every lock pass works on Pacific "today" only
- `app/api/cfb/lock/route.ts:291-292` `const asked = q.get("date"); const date = asked || ptToday();` (`?date=` is a cron-authed manual backfill; sweep/settle are skipped when it is used, :316/:325).
- `app/api/nfl/lock/route.ts:115-116` same.
- `app/api/scheduler/route.ts:170` `const date = ptToday();`
- `src/lib/server/football-lock.ts:672-702` `foundPassDate` reads `espnEvents(date)` for that one date and skips when nothing is ahead.
- `src/lib/cfb/model.ts:586` `if (!g || g.date !== input.date || seen.has(g.id)) continue;` (`g.date = ptDateOf(start)`, :300).
- Time-of-day window on top: `src/lib/server/grading-progress.ts` `FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8, 19, 15)` (08:00–18:45 PT) and `FOUND_MLB_SLOTS_PT = everyMinutes(8, 19, 60)`.
- MLB equivalent: `app/api/generate/route.ts:221` `const dateNow = ptToday();`, `:395` `today: dateNow`, `:447` `const date = dateNow;`; schedule read `legacy/index.html:1218` `schedule?sportId=1&date="+shToday()`; `src/lib/server/slate.ts:23`.

Effect: a Saturday CFB game or a Sunday NFL game can be bet only on its own Pacific date, from 08:00 PT. Football lines are posted days ahead and the widest model-vs-price gaps are usually early in the week; none of that is reachable. NFL games kicking before 08:00 PT (London) cannot be found at all on the day.

**Verdict: RELAX.** Add look-ahead passes (for example the next 6 days for NFL, next 3 for CFB) that write to the game's own date entry and use that date's budget, with a price re-check at lock and one-bet-per-(game, family) dedupe carried across days. Keep "today only" for MLB (lineups and starters are not known earlier, and the model depends on them). Cost of relaxing: more Odds API calls unless look-ahead passes are run a few times a day rather than every 15 minutes.

### B2. Universe
- CFB: `src/lib/cfb/rules.ts:609` `espnScoreboardQuery: "groups=80&limit=400"` (group 80 = FBS only).
- NFL: `src/lib/nfl/rules.ts:298` `espnScoreboardQuery: "limit=100"`.
- MLB: `legacy/index.html:1218` and `src/lib/server/slate.ts:23` `sportId=1` (MLB only), postponed/cancelled filtered at `slate.ts:31`.

**Verdicts**
- CFB FBS-only: **KEEP.** The only independent football signal is ESPN FPI, which covers FBS; FCS markets are thin, limits are low and consensus is weaker. Widening adds volume without a model behind it. Revisit only after football calibration exists.
- NFL `limit=100`: **KEEP** — not binding (a week has at most 16 games on any date).
- MLB `sportId=1`: **KEEP** — not binding.

### B3. One more limiter seen while tracing (not asked, recorded for completeness)
`src/lib/server/lock-card.ts:1013` `foundLegKey = label|prop` has no game key, so on a doubleheader the same team/player bet in game 2 is refused as `found_leg_used`. Rare; **KEEP** until the grader key in G4-7 is fixed, then key by game.

---

## C. PL_CFSEL (AUDIT.md limiter 76) — traced

- `src/lib/cfsel.ts` `computeCfSel(eng, slate)`: deep-copies the slate, sets `SH_CFG = { ...saved, hrrAltMax: 99 }`, re-runs `eng.analyze`, restores the config in `finally`, then runs `shCardPool` + `shAllocate(pool, 250, saved, false)` and returns, per `gkey|lkey`, whether the row would have reached the pool/card and at what rank and stake.
- `app/api/generate/route.ts:511` `const cfSelEnabled = process.env.PL_CFSEL !== "off";`; `:727-737` runs it inside try/catch; `:739-743` stamps `r.cfSel` **only on rows where `r.susp` is set**; `:778-780` returns it in the response.

What it is: a counterfactual-selection stamp ("would this suspended row have been picked if it were not suspended"). It is a measurement tool, not a kill switch.

Does it limit picks: **No.** It never touches the live pool, the allocator output, or the lock path.

Cost: one extra full engine analyze (seeded simulations, CPU only, zero Odds API credits) on every MLB generate, inside a 300 s function.

Current state: since the suspension lift (`hrrAltMax 99`, `outsSusp false`, applied at `generate/route.ts:438`) the counterfactual config equals the live config and no row carries `susp` (`legacy/index.html:2549`), so it stamps nothing. It is a no-op that doubles the analyze work.

**Verdict: REMOVE (or set `PL_CFSEL=off`).** Correct AUDIT.md row 76: it is not an "operator switch (integrity)"; it is dead measurement code.

---

## D. Grading vs how sportsbooks settle

Two separate graders exist and they do not follow the same rules:
- Football (CFB + NFL): `src/lib/cfb/grade.ts` on the server (`src/lib/server/football-lock.ts:317`) and on the device (`src/lib/football/store.ts:1113`).
- MLB money tickets: `legacy/index.html:3578-3713` (`shGradeLeg`, `shGradeTicket`, `shGrade`) in the browser only; `src/engine2/grade.ts` is a server port used for prediction rows (`app/api/calibrate/route.ts:225,237,256`) and the day-won read (`src/lib/server/mlb-day-won.ts`).

Every statement about a book's rules below is **general industry convention, to be verified against each book's published rules**. Nothing here asserts DraftKings' or FanDuel's house rules as fact.

| # | case | what the code does | file:line | matches convention? |
|---|---|---|---|---|
| 1 | Push on whole-number spread/total | Football: spread `v === 0` push, total `v === 0` push; push leg dropped from a parlay, all-push returns stake. MLB props push on `value === line`. MLB run line has NO push branch: `margin+pt>0 ? won : lost` | `src/lib/cfb/grade.ts:155, :164, :353-359`; `legacy/index.html:3620, :3635, :3598`; `src/engine2/grade.ts:86` | Football and MLB props: yes. MLB run line: no, if a whole-number run line is ever stored (see G4-5) |
| 2 | Overtime | Football full-game ML/spread/total use the final score (includes OT). First-half legs use ESPN linescore periods 1 + 2 only and settle at half-time. MLB: extra innings count everywhere | `src/lib/cfb/model.ts:251-259, :287`; `src/lib/cfb/grade.ts:115-124, :135-136` | Yes (convention: full-game markets include OT, first-half markets do not) |
| 3 | Tied NFL game on ML | `margin === 0` -> push, stake returned. Same for a tied first half on 1H ML | `src/lib/cfb/grade.ts:143-145` | Convention for a two-way moneyline is a refund; to be verified per book (some books offer a three-way line where the tie loses) |
| 4 | Football prop, player inactive / no stat row | Stat lookup undefined -> `pending` "final player statistic unavailable"; after 48 h becomes `ungradable` (void, $0 P/L). Parser never treats an absent athlete as zero. NFL only; CFB props never reach the card | `src/lib/cfb/grade.ts:126-131, :336-337`; `src/lib/football/prop-settlement.ts:4, :12-19`; `src/lib/server/football-prop-finals.ts:7`; `src/lib/server/football-lock.ts:316` | Inactive player -> void matches convention. But an ACTIVE player with no row in that stat table (0 receptions, 0 rush attempts) is also voided, where a book would settle Under won / Over lost (see G4-2) |
| 5 | Postponed / suspended / shortened | Football: `POSTPONED`/`CANCEL` -> pending -> void at 48 h after kickoff. Anything with `state === "post"` or `completed` is "final" (no suspended/forfeit/abandoned test, no minimum-play rule). MLB: `/postpon\|suspend\|cancel\|forfeit/` -> void immediately and terminally; `/final\|game over\|completed/` -> graded, which includes "Completed Early" | `src/lib/cfb/model.ts:208-214`; `src/lib/cfb/grade.ts:125, :249-253`; `legacy/index.html:3583-3584, :3705`; `src/engine2/grade.ts:69-71` | Partly (see G4-4, G4-6) |
| 6 | MLB doubleheaders | Lock: game key carries `gmN`, Odds events are matched to the schedule game with the closest first pitch; the entry stores each game's `gamePk` | `legacy/index.html:1188, :1209-1216, :1221, :1238, :2896` | Matching is sound. Grading keys leg results by `label|prop` with no game key (see G4-7) |
| 7 | MLB starter scratched / batter not starting | Pitcher: not in box or `gamesStarted` 0 -> void. Batter: not in box, batting order not ending 00, or `isSubstitute` -> void | `legacy/index.html:3613, :3616, :3625`; `src/engine2/grade.ts:97, :101, :111` | The "must start" rule is labelled "Caesars void rules" (`legacy/index.html:3570`). Convention varies by book for batters (some action a batter prop on any plate appearance); to be verified against the current settlement book (see G4-8) |
| 8 | Parlay with one void/push leg | MLB: void and push legs are divided out of the ticket price (reprice); all legs void -> stake back. Football: push legs are dropped and the rest pays, but a VOID (`ungradable`) leg voids the whole ticket at $0 P/L | `legacy/index.html:3644-3654`; `src/lib/cfb/grade.ts:349-350, :353-359` | MLB matches convention (leg removed, parlay repriced). Football does not for void legs (see G4-1) |
| 9 | Is any grading keyed by book | No. No grader reads a book key. Payout uses the locked price (`leg.cz` football; `confirmed` else `czDec` MLB, `src/lib/ticket-payout.ts:34-43`). One ruleset per sport regardless of which book the price came from | `src/lib/cfb/grade.ts:356`; `legacy/index.html:3645` | See G4-8 |

### G4 findings

**G4-1 — Football parlay with one void leg is voided whole instead of repriced** — severity: medium (low on the auto card today, which is straights only since 2026-10-06)
- Evidence: `src/lib/cfb/grade.ts:350` `if (results.some((r) => r.result === "ungradable")) return { result: "ungradable", payout: 0, detail: "a leg is void" };` versus push legs dropped at `:353-357`. MLB reprices: `legacy/index.html:3647-3650`.
- Impact: a manual or pre-10-06 football parlay whose other legs all won is booked at $0 instead of a reduced win; the two sports disagree. General industry convention (to be verified against each book's published rules): a void leg is removed and the parlay pays at the remaining legs' price.
- Fix: treat a void leg like a push leg in `settle` (skip it, pay the stood legs); keep "all legs void -> stake back".

**G4-2 — NFL prop grader cannot tell "did not play" from "played and recorded zero"; both are voided** — severity: medium, live today (NFL props reach the found card)
- Evidence: `src/lib/football/prop-settlement.ts:12-19` only reads athletes listed in each ESPN stat group; a receiver with no catch is not in the receiving group, a QB with no carry is not in the rushing group. `src/lib/cfb/grade.ts:128` `stat==null -> pending`, then void at 48 h (`:336-337`). A failed ESPN summary fetch has the same result (`src/lib/server/football-prop-finals.ts:7`, error swallowed).
- Impact: one-directional bias in the record. An Over that lost with zero is refunded (flatters results); an Under that won with zero is refunded (hides wins). General industry convention (to be verified against each book's published rules): a prop is void only if the player does not take part; an active player with zero settles normally.
- Fix: read the game's active/inactive list (ESPN summary `rosters`/`boxscore` participation) and score an active player's missing stat as 0; void only when the player is inactive or did not play. Count fetch failures and retry inside the 7-day recheck window rather than voiding at 48 h.

**G4-3 — Football markets outside ML/spread/total/five props can never grade; they void after 48 h** — severity: medium for the in-progress anytime-touchdown work, low for what is on the card today
- Evidence: `src/lib/cfb/grade.ts:132` `if(!["ml","spread","total"].includes(leg.market)) return {result:"pending",detail:"unsupported prop settlement"};` `PAPER_PROP_STATS` (`src/lib/football/prop-settlement.ts:2`) lists only pass_yds, pass_tds, rush_yds, receptions, rec_yds. `found.ts` excludes `side === "yes"` rows today.
- Impact: any new market (anytime TD, the branch's stated goal) locked before a grader exists is booked as a wash, and the day-won ceiling never sees its wins.
- Fix: add the settlement stat and the yes/no grading rule in the same change that lets the market onto the card; add a test that every market the found pass can lock is gradable.

**G4-4 — Football treats any `state === "post"` game as a full final** — severity: low–medium
- Evidence: `src/lib/cfb/model.ts:210-211` tests only POSTPONED/CANCEL, then `STATUS_FINAL || completed || state === "post"` -> final. No test for suspended, forfeit, abandoned or a shortened game, and no minimum-play rule.
- Impact: a game ended early (weather, forfeit) is graded on whatever score ESPN posts. General industry convention (to be verified against each book's published rules): football bets need a minimum amount of play (commonly 55 minutes) or are void; forfeits are void.
- Fix: treat any terminal status other than a normal final as "needs review" (pending, flagged on the Ledger) instead of final. What status string ESPN sends for these cases could not be checked offline.

**G4-5 — MLB run line has no push branch** — severity: low
- Evidence: `legacy/index.html:3598` and `src/engine2/grade.ts:86` `margin + pt > 0 ? "won" : "lost"`. The stored point is the modal point across books (`legacy/index.html:1314-1317`), not forced to a half-run.
- Impact: if a whole-number run line (-1, -2) is ever the modal quote, an exact landing is graded LOST instead of refunded. Main MLB run lines are almost always +/-1.5, so this is latent.
- Fix: add `margin + pt === 0 -> push` in both graders.

**G4-6 — MLB suspended games are voided at once and never re-read; shortened games are graded as full games on every market** — severity: low–medium, dormant until spring
- Evidence: `legacy/index.html:3583` void on `suspend`; `:3705` only `pending`/`ungradable` keep an entry open, so a void is terminal. `:3584` (and `src/engine2/grade.ts:71`) accept `completed`, which matches "Completed Early".
- Impact: a suspended game that is resumed and completed stays void; a rain-shortened official game grades run line and props as if nine innings were played. General industry convention (to be verified against each book's published rules): moneyline stands once a game is official (5 innings); run lines, totals and most props need the full scheduled length or are void; suspended-game treatment differs by book.
- Fix: keep a suspended game pending until it is final or 48 h pass; on "Completed Early" grade ML only and void RL and props (or whatever the verified rule of the settlement book is).

**G4-7 — MLB leg results are keyed by `label|prop` with no game key (doubleheader collision)** — severity: low, dormant until spring
- Evidence: `legacy/index.html:3700-3701` `var lid=l.label+"|"+l.prop; if(!legRes[lid]) legRes[lid]=shGradeLeg(...)`; `:3639` tickets read the same key. Two legs with the same team/player and line in game 1 and game 2 share one result (the first graded wins).
- Impact: a wrong grade on one of the two legs. Masked on found days because `foundLegKey` (`src/lib/server/lock-card.ts:1013`) refuses the second bet, which is itself a lost bet. The server-side readers already key by `gkey -> pk` (`src/lib/server/mlb-day-won.ts:70-72`, `app/api/calibrate/route.ts:194`).
- Fix: key by `gkey|lkey` in the device grader and in `foundLegKey`.

**G4-8 — One hard-coded settlement ruleset per sport, labelled "Caesars void rules", while the settlement book is DraftKings and the owner also bets FanDuel** — severity: medium
- Evidence: `legacy/index.html:3570` "auto-grading from official box scores, Caesars void rules ... the only grading ruleset"; `src/engine2/grade.ts:3-4`; `src/lib/sportsbook/books.ts:12` `SETTLE_BOOK = 'draftkings'` since 2026-09-17. No grader takes a book argument (case 9 above).
- Impact: where books differ (batter must start vs any plate appearance, shortened games, ties, suspended games) the paper record follows a book the owner no longer uses. This matters more once a ticket can be priced at either of two books.
- Fix: stamp the book on every locked leg (already done for price), put the rule differences in one table keyed by book, and have both graders read it. Fill that table from each book's published rules, not from memory.

**G4-9 — MLB ticket order of tests leaves decided tickets open** — severity: low
- Evidence: `legacy/index.html:3640-3643` tests pending, then ungradable, then lost. A parlay with a leg already lost stays `pending` until every other game ends, and stays `ungradable` (entry never `done`, `:3705`) if any other leg has a missing stat. Football tests lost first (`src/lib/cfb/grade.ts:349`).
- Impact: losses post late; an entry with one unreadable stat is re-fetched on every Ledger view for ever. No money error.
- Fix: test lost first, as football does.

**G4-10 — MLB void leg with no stored leg price is not divided out** — severity: low
- Evidence: `legacy/index.html:3649-3650` `var d2=l.cz!=null?amToDec(l.cz):null; if(d2)eff=eff/d2;` — when `l.cz` is null the void leg stays in the ticket price.
- Impact: overpays a parlay whose void leg has no leg price. Not reachable on straights.
- Fix: return `ungradable` ("no leg price to reprice") in that case.

**G4-11 — MLB money tickets are graded twice by two code copies** (cross-reference to D-2/E3-2, new angle) — severity: low
- Evidence: `src/engine2/grade.ts:2-4` is a hand port of `shGradeLeg`; `src/lib/server/mlb-day-won.ts:15-17` counts a win only when every leg is `won` (void/push legs count nothing until the device syncs).
- Impact: the day-won ceiling can lag the true figure; any rule fix (G4-5, G4-6, G4-8) must be made in two files or the server and device disagree.
- Fix: one shared grader module imported by both.

**G4-12 — PL_CFSEL is dead measurement code that doubles MLB analyze work** — severity: low (see section C). Fix: remove.

**G4-13 — Off-season jobs still run every day** — severity: low
- Evidence: `.github/workflows/context.yml` crons `0 17 * * *` and `30 22 * * *` still commit `data/ump_k.json` daily (latest commit `8ab9e46` 2026-11-12, 25 commits since 2026-10-18, each only appends a date); `.github/workflows/props-history.yml` six daily crons; the scheduler's five daily `calibrate?grade=only` ticks (B3-10/E1-9).
- Impact: wasted runner minutes and store reads, and a noise commit a day on `frontend-rebuild`.
- Fix: gate these on an in-season date window.

**G4-14 — Slate horizon limiter (section B1)** — severity: medium, live today. Fix: look-ahead passes for football.

---

## E. Season context

### E1. High/medium findings that affect football picks TODAY
High: **B2-1**, **P-2**.
Medium: **A-2**, **B2-2**, **B2-3**, **B2-4**, **B2-5**, **B2-6**, **B2-7**, **B2-9**, **B2-10**, **B3-12**, **C1-2** (football half), **C1-3** (football half), **C1-7** (football half), **C1-12** (football half), **C2-2** (manual football parlays only; the auto card is straights), **E2-1**, **E2-3** (football half), **E2-9**.
New from this pass: G4-1, G4-2, G4-3, G4-4, G4-8, G4-14.

### E2. MLB-only (dormant until spring; fix before opening day)
High: **B1-1**, **B3-1**, **P-1**, **P-3**, **P-4**, **P-5**.
Medium: **A-1**, **A-3**, **A-4**, **B1-2**, **B1-3**, **B1-4**, **B1-5**, **B1-6**, **B1-7**, **B1-9**, **B1-10**, **B1-11**, **B3-2**, **B3-3**, **B3-4**, **B3-5**, **B3-6**, **B3-7**, **B3-11**, **B3-13**, **C1-1**, **C1-4**, **C2-1**, **D-2**, **E1-3**, **E1-4**, **E2-7**, **E3-1**, **E3-2**, **E3-3**, **E3-4**, **P-6**, **P-7**, **P-8**, **P-12**.
New from this pass: G4-5, G4-6, G4-7, G4-9, G4-10, G4-11, G4-12.

### E3. Sport-independent infrastructure (matters today because football runs on it)
High: **D-1**, **E1-1**.
Medium: **D-3**, **D-4**, **D-5**, **E1-2**, **E1-5**, **E2-2**, **E2-5**, **E2-6**, **P-10**, **P-11**.
MLB code that still RUNS every day in the off-season and loads the shared store / runners: **B3-10**, **E1-9**, **P-9**, plus G4-13.

### E4. UFC and All-Star code — dead weight, nothing runs
- `src/lib/features.ts:8` `UFC_ENABLED = false`, `:13` `ASG_ENABLED = false`.
- Pills are not rendered and `?sport=ufc` / `?sport=asg` is ignored: `app/board/page.tsx:212-213, :1206-1210`; `app/builder/page.tsx:462-463, :751-755`; `app/sharp/page.tsx:112-113, :329-333`. Stats cannot reach UFC either: `src/lib/stats-scope.ts:16-20` gives no desk a `"ufc"` pill (the remembered-choice helper in that file only accepts a sport the desk allows).
- So the hooks that would spend Odds credits never mount: `src/lib/ufc.ts:82-86` (MMA odds via `/api/odds`), `src/lib/useAllStar.ts:65-69`.
- `.github/workflows/ufc.yml:7-9` is `workflow_dispatch` only (no schedule). `public/model/ufc.json` last changed 2026-07-13 (`39d1a2f`) and still ships in every deploy.
- No UFC/ASG entry in `vercel.json` or `docs/cron-jobs.md`.
- The one thing still reachable: `app/api/ufcprops/route.ts` is deployed with no auth check; a direct call scrapes bestfightodds.com (240 s cache, no Odds credits, `maxDuration 60`). Nothing in the app calls it while the flag is off.
- Verdict: nothing runs on a schedule and nothing costs credits. It is dormant code plus one open scrape route. Either delete `src/components/ufc/*`, `src/components/allstar/*`, `src/lib/ufc.ts`, `src/lib/useAllStar.ts`, `src/engine2/allstar.ts`, `app/api/ufcprops`, `tools/build_ufc*.py`, `ufc.yml`, `ufc.json`, or at least make `/api/ufcprops` return 404 when `UFC_ENABLED` is false.

---

## Not verified in this pass
- What status strings ESPN sends for suspended / forfeited / abandoned football games (no network).
- Whether `CRON_SECRET` and `APP_PASSCODE` are set in production (env not opened, by rule).
- The cron-job.org rows (external).
- Any book's actual house rules: every convention above is general industry convention, to be verified against each book's published rules.
