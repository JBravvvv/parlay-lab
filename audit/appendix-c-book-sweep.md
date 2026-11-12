<!-- Part of AUDIT.md (repo root). Split out for size; content unchanged. -->

# Appendix C. Sportsbook reference sweep, complete

The full text of `/private/tmp/claude-501/audit-out/book-sweep.md`, including the complete hit list (its section 7). Section numbers inside this appendix are the sweep's own.

**Sportsbook reference sweep (book-sweep)**

Checkout swept: /private/tmp/claude-501/pl-audit (branch az-two-book-anytime). Read-only. All `path:line` citations are relative to that checkout unless they start with `pl-history/`.

Owner constraint being audited: Arizona, can bet ONLY DraftKings and FanDuel (Odds API keys `draftkings`, `fanduel`). Paper trading only.

### 0. How this file is organised

1. Method and scope
2. Counts per term and per role
3. Where a non-DraftKings/FanDuel price can influence a number (the calculation paths)
4. Where DraftKings is used / where FanDuel is used
5. Are FanDuel prices fetched at all today?
6. Stale Caesars / Nevada wording and defaults that are now wrong
7. COMPLETE hit list, grouped by term (book) and then by role, one line per hit

Sections 3-6 are placed before the raw list only so a reader does not have to scroll past ~7,700 lines to reach them. The hit list in section 7 is complete.

### 1. Method and scope

- Script: /private/tmp/claude-501/audit-out/scripts/book_sweep.py (Python, read-only; no network; no git mutation). Machine copy of every hit: /private/tmp/claude-501/audit-out/scripts/book_sweep_hits.json.
- File set: every file from `git ls-files` (920 tracked) minus iCloud conflict copies (16, listed below, not analysed), minus one env-named file (`tools/handoff-state.env`, never opened), minus binary/image/font/video files. 894 files scanned. `node_modules`, `.git`, `.next` are not tracked and were not scanned. The only untracked, non-ignored path in the checkout is `node_modules`.
- Matching is case-insensitive, per line. A line is listed once per term even when the term occurs several times on it (`[xN]` shows the occurrence count). Lines longer than 1,500 characters (minified JSON fixtures, and `src/engine/legacy-src.gen.ts`, whose line 5 is the whole MLB engine as one string) are listed once per term with an occurrence count and the first match only; for `src/engine/legacy-src.gen.ts` the readable equivalents are the `legacy/index.html` lines listed beside it (it is a generated copy of that file's script).
- Term regexes: `caesars`; `william\s?hill|williamhill`; `\bczr\b`; cz identifier tokens (rule in the cz section note); `betmgm`; `(?<!bet)mgm`; `circa`; `westgate`; `superbook`; `south\s?point`; `\bstn\b|\bstation(s|casinos|ary)?\b`; `pinnacle`; `bovada`; `betonline`; `betrivers`; `pointsbet`; `wynn`; `espn\s?bet`; `fanatics`; `hard\s?rock`; `bet365`; `unibet`; `barstool`; `betus`; `lowvig`; `mybookie`; `betfair`; `fliff`; `prizepicks`; `underdog`; `draftkings`; `fanduel`; `SETTLE_BOOK|settleBook|settlementBook`; `bookmakers`; `\bregions\b`; `consensus`; `best\s?line`; `bestPrice|best[_ ]?price`; `median`.
- Role assignment is by file path, with one line-level override (a line in an otherwise "calculations" file that contains an Odds API URL, `regions=`, `markets=` or a `.bookmakers` loop is filed under "fetch code"). Mapping: `tests/**` = tests; `docs/**`, `prompts/**`, `*.md`, `*.txt` = docs; `tools/**`, `.github/**` = tools; `src/lib/sportsbook/books.ts`, `src/lib/{cfb,nfl}/rules.ts`, `src/lib/mlb/live-props-rules.ts`, `src/lib/football/league.ts`, `src/lib/server/odds-shape.ts`, `src/lib/paper-mode.ts`, `src/lib/found-mode.ts`, package files = config; `src/lib/cfb/props-store.ts`, `src/lib/cz-hidden-merge.ts`, `src/lib/cz-offered.ts`, `app/api/prefs/route.ts`, `src/lib/ledger-merge.ts`, `src/lib/useLedger.ts` = caches; type files, `src/lib/pred-serialize.ts`, `src/engine/index.ts`, `src/lib/server/card-view.ts`, all `*.json`/`*.csv`/`public/**` = stored-data fields; `app/api/{odds,propsnap,ufcprops,splits,cfb/props,nfl/props,scheduler,picks}/route.ts`, `src/lib/server/football-props.ts`, `src/lib/useAllStar.ts`, `src/lib/splits.ts`, `src/lib/mlb/live-client.ts` = fetch code; `app/**` pages and `src/components/**` = UI; everything else (including `legacy/index.html`, which also contains UI and bookmark code) = calculations.
- Known limits: role is per file, so a mixed file (notably `legacy/index.html`, `app/api/generate/route.ts`) is filed mostly under one role. A hit in a comment is still a hit. Zero-hit terms are reported explicitly.

### 2. Counts per term and per role

Lines = matching lines; Files = files with at least one matching line; Occurrences = total matches. Role columns count matching lines.

| Term | Lines | Files | Occurrences | fetch code | config | caches | calculations | stored-data fields | UI | tests | docs | tools |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Caesars (word) | 1166 | 198 | 1445 | 30 | 34 | 8 | 191 | 28 | 110 | 527 | 232 | 6 |
| William Hill / williamhill_us | 148 | 55 | 282 | 0 | 4 | 1 | 12 | 2 | 4 | 106 | 18 | 1 |
| czr (whole word) | 8 | 6 | 13 | 0 | 1 | 0 | 3 | 0 | 2 | 2 | 0 | 0 |
| cz identifier fragment | 2951 | 263 | 5409 | 39 | 13 | 90 | 499 | 98 | 343 | 1496 | 330 | 43 |
| BetMGM | 50 | 23 | 242 | 1 | 1 | 0 | 3 | 0 | 3 | 35 | 7 | 0 |
| mgm outside 'betmgm' | 41 | 10 | 45 | 0 | 1 | 0 | 1 | 0 | 3 | 9 | 27 | 0 |
| Circa | 22 | 5 | 25 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 20 | 0 |
| Westgate | 3 | 3 | 3 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| SuperBook | 4 | 4 | 7 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 1 | 0 |
| South Point | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| STN / Station | 5 | 5 | 8 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 3 | 0 |
| Pinnacle | 135 | 41 | 148 | 0 | 7 | 0 | 15 | 1 | 11 | 81 | 18 | 2 |
| Bovada | 62 | 16 | 258 | 0 | 0 | 0 | 0 | 0 | 3 | 57 | 2 | 0 |
| BetOnline | 35 | 11 | 65 | 0 | 0 | 0 | 3 | 0 | 3 | 26 | 3 | 0 |
| BetRivers | 33 | 8 | 215 | 1 | 1 | 0 | 0 | 0 | 3 | 28 | 0 | 0 |
| PointsBet | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Wynn | 7 | 7 | 9 | 0 | 0 | 0 | 0 | 4 | 0 | 3 | 0 | 0 |
| ESPN Bet | 5 | 5 | 60 | 0 | 0 | 0 | 0 | 0 | 3 | 2 | 0 | 0 |
| Fanatics | 76 | 17 | 273 | 0 | 1 | 0 | 0 | 0 | 3 | 72 | 0 | 0 |
| Hard Rock | 3 | 3 | 4 | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 |
| bet365 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Unibet | 46 | 3 | 47 | 0 | 0 | 0 | 0 | 0 | 2 | 44 | 0 | 0 |
| Barstool | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| BetUS | 20 | 5 | 50 | 0 | 0 | 0 | 0 | 0 | 3 | 17 | 0 | 0 |
| LowVig | 26 | 5 | 56 | 0 | 0 | 0 | 0 | 0 | 3 | 23 | 0 | 0 |
| MyBookie | 28 | 5 | 58 | 0 | 0 | 0 | 0 | 0 | 3 | 25 | 0 | 0 |
| Betfair | 30 | 12 | 30 | 0 | 0 | 0 | 5 | 0 | 2 | 18 | 5 | 0 |
| Fliff | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PrizePicks | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Underdog | 7 | 7 | 36 | 0 | 0 | 0 | 2 | 0 | 0 | 3 | 2 | 0 |
| DraftKings | 520 | 112 | 1214 | 1 | 10 | 0 | 47 | 4 | 59 | 364 | 30 | 5 |
| FanDuel | 153 | 55 | 485 | 1 | 1 | 0 | 17 | 0 | 11 | 114 | 9 | 0 |
| SETTLE_BOOK / settleBook / settlementBook | 117 | 42 | 151 | 2 | 13 | 0 | 59 | 8 | 5 | 18 | 12 | 0 |
| bookmakers | 133 | 48 | 157 | 23 | 0 | 0 | 11 | 0 | 0 | 89 | 6 | 4 |
| regions= / regions: / regions | 129 | 42 | 150 | 13 | 18 | 0 | 6 | 0 | 1 | 35 | 51 | 5 |
| consensus | 667 | 124 | 1069 | 18 | 9 | 0 | 131 | 17 | 98 | 180 | 211 | 3 |
| best line | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| bestPrice / best price | 27 | 24 | 28 | 0 | 0 | 0 | 6 | 3 | 8 | 5 | 4 | 1 |
| median | 369 | 72 | 423 | 1 | 1 | 0 | 72 | 3 | 13 | 47 | 194 | 38 |

Files scanned: 894. Conflict copies skipped (not analysed): 16. Env files skipped (never opened): 1.

Conflict copies present:
- tests/timezone-parity.test 3.ts
- tools/build_ufc 3.py
- tools/build_ufc 4.py
- tools/burn-report 3.mjs
- tools/burn-report 5.mjs
- tools/guard-diff-audit 3.mjs
- tools/guard-diff-audit 4.mjs
- tools/hr-pair-dependence 3.mjs
- tools/m10_eiv 3.py
- tools/outs_audit 3.py
- tools/phase2_series_b 3.py
- tools/phase2_series_b 4.py
- tools/price-path 3.mjs
- tools/price-path 4.mjs
- tools/price-path 5.mjs
- tools/self_consistency 3.py

Env-named files skipped:
- tools/handoff-state.env

False-positive verdicts for the low-count terms (every hit was read):

- Wynn: 7 lines, ALL player names (Kerwynn Williams, Austin Wynns). No Wynn sportsbook reference.
- Underdog: 7 lines, ALL the generic word or ESPN's `underdog` flag. No Underdog-app reference.
- Hard Rock: 2 real (display-label maps), 1 venue name in a fixture.
- ESPN Bet: 3 real (display-label maps), 2 ESPN logo URLs in fixtures.
- STN / Station: 1 real code site (Nevada bookmark list, legacy/index.html:529) plus its generated copy, 1 doc row; 2 doc hits are the word "stationary".
- Circa, Westgate, SuperBook, South Point: the only code site is the same Nevada bookmark list `DEFAULT_BOOKS` at legacy/index.html:529 (a list of sportsbook web links, not prices); the rest is docs (docs/multibook-memo.md) and one test of a label abbreviator.
- czr: `CZR` as a UI label at app/builder/page.tsx:1179 and app/design/page.tsx:286; alias in `bookKey()` at src/lib/sportsbook/books.ts:18; a local variable at legacy/index.html:1325-1326.
- Zero hits anywhere: PointsBet, Barstool, Fliff, PrizePicks, "best line".

### 3. Where a non-DraftKings/FanDuel price can influence a number

Two background facts drive everything below.

(a) No request anywhere names books. There is no `bookmakers=` request parameter in the repo (the only textual `bookmakers=` is a test assignment, tests/football-ladders.test.ts:48). Every pull is region-scoped: `regions=us` for player props (legacy/index.html:1366; src/lib/cfb/rules.ts:474; src/lib/nfl/rules.ts:195; src/lib/mlb/live-props-rules.ts:147; app/api/propsnap/route.ts:98; app/api/clv/route.ts:108; src/lib/ufc.ts:84; tools/snapshot_props.py:323) and `regions=us,eu` for game lines (legacy/index.html:1257 with `SH_V2.regions` armed to "us,eu" at app/api/generate/route.ts:404 and src/lib/engine-client.ts:362; src/lib/cfb/rules.ts:367; src/lib/nfl/rules.ts:170; src/engine2/sharpBoard.ts:10; app/api/clv/route.ts:90; src/lib/useAllStar.ts:77; tools/snapshot_odds.py:24). So every book in the region arrives and every parser loops over all of `ev.bookmakers`.

(b) "cz" no longer means Caesars in the live app. `SETTLE_BOOK = 'draftkings'` (src/lib/sportsbook/books.ts:12). The MLB engine blob still declares `var CAESARS_KEY="williamhill_us"` (legacy/index.html:888) but the wrapper rebinds it: `if (deps.settlementBook) scope.set("CAESARS_KEY", deps.settlementBook);` (src/engine/index.ts:300), and both callers pass `settlementBook: SETTLE_BOOK` (app/api/generate/route.ts:392; app/api/scheduler/route.ts:248; src/lib/engine-client.ts:111). Football and MLB-live configs carry `settleBook: "draftkings"` (src/lib/cfb/rules.ts:77, :476; src/lib/nfl/rules.ts:68, :197; src/lib/mlb/live-props-rules.ts:150). So `cz`, `czOdds`, `czEv`, `czEdge`, `czKellyF`, `czBadge`, `czDec`, `evCz`, `czAm`, `czMissing` all mean "the settlement book = DraftKings". The exceptions, where cz is still literally Caesars, are listed in section 6.

The price a bet is graded and staked at is therefore DraftKings. What is NOT DraftKings/FanDuel-only is the probability side of almost every number, plus a "best price across all books" layer. The paths:

#### MLB pregame engine (legacy/index.html, executed through src/engine/index.ts)

P1. Game-line consensus fair -> blended win probability. For each game the engine de-vigs every returned book and takes a weighted median: `o.home_fair=shMedianW(...)` (legacy/index.html:1297), run line `home_rl_fair` (:1319), totals `total_fair_over` (:1340). Weights are `SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5}` (:1557, applied by `shBookW` :1558 when `SH_V2.sharpW` is armed; Shin de-vig at :1570-1575 when `SH_V2.shin`). Both are armed in production (app/api/generate/route.ts:402-404; src/lib/engine-client.ts:360-362). That fair becomes `novH`/`novHr` (:2165, :2207) and is blended into the probability the row carries: `pH=wML*model+(1-wML)*novH` (:2184-2185), `pHC=wRL*pHomeCover+(1-wRL)*novHr` (:2214). It is also stored as the row's `imp`. Everything downstream (edge, EV at DraftKings, Kelly, badges, grade) uses that blended probability. Books involved: every us + eu book, with Pinnacle, Betfair, Matchbook and BetOnline over-weighted.

P2. Prop consensus fair -> blended prop probability, side choice and edge. Per player/line, every US book's two-sided pair is de-vigged (:1414) and the row gets `fair:shMedianW(fairs)` (:1431-1435). Then `nv=row.fair ...` (:2451), `pAdj=wDn*pO+(1-wDn)*nv` (:2459-2464), the side is chosen against `nv` (:2471-2477), `imp:nv` (:2478) and `edge=sd.p-sd.imp` (:2493). `finalizeCats` (:2517-2565) then computes `czEv`/`czImp`/`czKellyF` at the settlement book and `bsEv2`/`bsKellyF2` at the DK/FD basis from that probability, and `czEdge=(r.imp-czImp)` (:2550). The browse board's market fair `fO` uses the same consensus (:2605). Books involved: every US book that posts both sides (in the stored archive mostly BetMGM, BetOnline, DraftKings, Bovada, Caesars, MyBookie; see section 5).

P3. Best price across ALL books. Independently of the settlement book, the engine keeps the best payout per side over every book: money line (:1298-1301), run line (:1320-1323), props `o/oBook/u/uBook` (:1415-1417). These feed: the row's headline `odds`/`oddsN`/`book` (:2188-2196); `ev=shEV(r.p,dec)` and `kellyF` at that best price (:2526-2527); `edgeBadge` and `conviction` (:2559); the TOP-50 sort by best-price `ev` (:2570-2571); the fallback consensus when no median fair exists (de-vig of the two best prices, :2165, :2207, :2451); and the one-sided anchor `fair=oneImp/1.06` when a market posts one side only, which uses the best all-book price outside dk_fd or when no DK/FD price exists (:2483-2491). Downstream users of the best-price numbers: the prediction log stores `ev`, `odds`, `book` at best price (src/lib/pred-serialize.ts:22-23, :251-253); the Games tab grades a money line at the best posted price, `gradeFromEv(((prob / 100) * amDec(best.odds) - 1) * 100)` (src/lib/games.ts:190-196); the browse board exposes `o/oBook/u/uBook` as "best posted price across the feed's books" (src/engine/index.ts:131-134).

P4. Independent-book counts and the gates built on them. `ml_booksInd` (:1296), `rl_booksInd` (:1318) and the prop `booksInd` (:1431-1435) count two-sided books other than the settlement book. The allocator refuses a ticket when any leg has `booksInd===0` (`no_ind_consensus`, :3063-3065) and applies the small-sample consensus gate (:3068-3079). Any non-DK/FD book counts as "independent". In a DK + FD only world this count can only be 0 or 1 (FanDuel two-sided), and FanDuel rarely posts two-sided batter props (section 5).

P5. Ticket-level consensus EV. `consP` is the product of the legs' consensus `imp`; `consEvT=consP*bsDecT-1` (:2757) and `consCzEvT` (:2758) are the consensus-gate inputs (`consEv` on the Ticket type, src/engine/index.ts:106-107).

P6. Simulated game totals. `fin=(mktO!=null)?(0.30*m.pTotO+0.70*mktO):m.pTotO` with `mktO=go2.total_fair_over` (:2876-2877): 70 % of the displayed total probability is the all-book consensus.

P7. Market shrink before the bet gate and the stake. `legP' = w * leg.prob + (1 - w) * leg.imp` (src/lib/shrink.ts:13-14, :61-63) with `shrinkW: 0.5` (src/lib/paper-mode.ts:192) is applied to the card pool at src/lib/server/lock-card.ts:312 and to the found-mode pool at :1115. The found-mode bet gate is then `ev > 0` on `pl.czEv` (:1146-1149). So half of every locked leg's probability is the all-book consensus. (Found-mode straights are built with `booksInd: 0` hard-coded, src/lib/server/lock-card.ts:177.)

P8. Calibration feedback loop. Each logged prediction stores `pMkt: Number(r.implied ?? 0)` (src/lib/pred-serialize.ts:19, :248). src/engine2/calibration.ts scores the model against that consensus and fits the shrink toward it (:167-169, :342, :414), and the fitted multipliers are fed back into the engine as `calW: armed.mults` (app/api/generate/route.ts:423; src/lib/engine-client.ts:374). The all-book consensus therefore shapes future blend weights.

P9. Per-book quote index, browse-only markets, and the display-book switch. `attachBookQuotes` indexes every book's price per row (src/lib/sportsbook/mlb.ts:25-35); for extra batter markets the fair is the median of per-book de-vigs across all books and `best` is the best all-book price (:50-54). `priceMlbRow`/`priceMlbProp`/`priceMlbBoard`/`priceMlbMoneylines` (:82-124) recompute EV, edge, Kelly and badges at whichever display book is selected. The selectable list is Caesars, DraftKings, FanDuel, BetMGM, BetRivers, Fanatics, Pinnacle (src/lib/sportsbook/books.ts:1-9), so five of the seven choices are books the owner cannot bet.

P10. Props tab / manual slip price and probability fallbacks. `sidePrice` returns the settlement-book price when posted, "else the feed's best" (src/components/props/props-model.ts:276-284); the slip leg type documents the same fallback (src/lib/ticket-math.ts:18). `sideProb` falls back to the market fair `fO` when the model has no number (src/components/props/props-model.ts:287-291). A hand-built ticket can therefore be priced at a book the owner cannot bet.

#### MLB live in-play (src/lib/server/mlb-live-quote.ts)

P11. `sightLiveQuote` takes the modal line across all books (tie -> settlement book's point, else median, :248-254), requires `cfg.minBooks` books at that line counting every book (:257; `minBooks: 2`, src/lib/mlb/live-props-rules.ts:147-150), and sets `fO: median(fairs)` over all US books (:282). The live probability is `simP ?? sight.fO` (:700-735), so when the sim has no number the displayed live probability and `evCz` are the all-book consensus priced at DraftKings.

#### Football (CFB and NFL share src/lib/cfb/*)

P12. Game lines. `readBooksOf` loops every bookmaker (src/lib/cfb/model.ts:345-371); the consensus is a weighted median with `weightOf = key === "pinnacle" ? M.pinnacleWeight : 1` (:328; `pinnacleWeight: 2`, src/lib/cfb/rules.ts:75, src/lib/nfl/rules.ts:66), null under `minBooks: 2` (:377-383). `priceGame` takes market win probability, margin, spread line, total and total line from that consensus (:415-419) and blends `blend: { mkt: 0.6, spread: 0.25, fpi: 0.15 }`, `spreadBlend: { mkt: 0.75, fpi: 0.25 }` (src/lib/cfb/rules.ts:73-74). The fair, `evCz`, grade and Kelly on every side row come from it (`sideRow`, :502-560). Rows also carry `quotes` for every book, `best`, `evBest` and `pin` (:393-407). First-half lines use the same consensus with no model term (src/lib/cfb/h1.ts:38-42).

P13. Football player props. There is no model: the fair is the equal-weight median of every US book's de-vigged probability at the line, null under `minBooks` (src/lib/cfb/props.ts:204-215, :268); the row's line is the median of all books' lines (:267); one-sided markets use `impliedFromAmerican(slot.a) / ATD_YES_ONLY_OVERROUND` with the constant 1.08 (:65). `czEv`, grade (`gradeFromEv(czEv?.ev)`, :351), Kelly (:319) and `playable` (:316) price that all-book fair at DraftKings. `best`/`evBest` scan all books (:302-313); `quotes`/`probabilities` keep every book (:342-343). This is the path the "anytime TD" straights ride.

P14. Football display-book and best-price modes. `priceFootballRow`/`priceFootballProp` reprice at any selected book from `row.quotes[book]` (src/lib/sportsbook/football.ts:11-48); the generator pool has `FootballPriceMode = "cz" | "best"` (src/lib/football/gen-pool.ts:39) and `footballPropLean(sides, mode: "cz" | "best")` (src/lib/prop-lean.ts:86-99). The paper card and found mode call `priceFootballProp(r, "draftkings", ...)` explicitly (src/lib/cfb/card.ts:249; src/lib/cfb/found.ts:90), so locked bets are DraftKings-priced; the "best" mode is a browse/builder surface.

#### CLV, sharp desk, UFC, All-Star

P15. Closing-line value. `sightProp` and `sightGameLeg` de-vig every book and store `consensusFair = median(fairs)` when two or more books post (src/lib/server/clv-core.ts:181-182, :199, :205, :243). `fairPts` in the ledger segments and CLV report is closing consensus fair minus locked fair (src/lib/ledger-segments.ts:140-141; src/lib/clv-report.ts:68). The price-based CLV (`clvPts`) is at the ticket's settlement book.

P16. Sharp desk. `mlConsensus`/`totalConsensus` use Shin de-vig and the sharp-weighted median over us + eu books; `SHARPS = new Set(["pinnacle", "betfair_ex_eu", "matchbook"])` (src/engine2/sharpBoard.ts:58, :74, :102; weights src/engine2/devig.ts:68-71). EV is judged at `book = "draftkings"` (:74, :102, :134).

P17. UFC. `prob = median(probs)` over every US book (src/lib/ufc.ts:134-148); `czEv` at `book = "draftkings"` (:129, :149). The UFC props route scrapes a comparison table and computes `medImplied` over `REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"])` minus the selected book, plus `bestBook`/`bestOdds` (app/api/ufcprops/route.ts:18, :68-75).

P18. All-Star desk. Hard-coded Caesars: `czTwoWay`/`czOU` find `"williamhill_us"` (src/engine2/allstar.ts:148-151, :485), fair is `consensusProb` over all us + eu books (:114, :125), and it parses a pasted Caesars board (:359-365; src/lib/useAllStar.ts:25, :235). Not rebound to DraftKings.

#### Archive and audit tools

P19. `tools/snapshot_props.py` hard-codes `CZ = "williamhill_us"` (:27): the archive's `cz` and `czf` fields are Caesars, its `fair` is the cross-book median (:105) and `bo`/`bu` are best all-book prices (:53-54, :78). `tools/close_fair.py` recomputes the median across books (:13, :75). `tools/hr_overround.py` measures the Caesars overround (:7, :198). `tools/snapshot_odds.py` archives us + eu game lines including Pinnacle (:4, :24). Any study run on pl-history therefore measures a Caesars-settled, all-book world, not DK/FD.

#### Calculation paths that must change (or be explicitly re-decided) for a DraftKings + FanDuel-only owner

Must change (a price the owner cannot bet is shown as, or substituted for, a bettable price):
1. P3 best-price layer in the MLB engine: `odds`/`book`/`ev`/`kellyF`/`edgeBadge`/`conviction`/TOP-50 sort at the best all-book price (legacy/index.html:1298-1301, :1320-1323, :1415-1417, :2526-2527, :2559, :2570-2571), the Games-tab grade at best price (src/lib/games.ts:190-196), and the prediction log's best-price `ev`/`odds`/`book` (src/lib/pred-serialize.ts:251-253). Should be best of DK/FD.
2. P10 the manual slip / Props fallback to "the feed's best" price (src/components/props/props-model.ts:276-284; src/lib/ticket-math.ts:18).
3. P9 and P14 the display-book list and repricing at Caesars, BetMGM, BetRivers, Fanatics, Pinnacle (src/lib/sportsbook/books.ts:1-9; src/lib/sportsbook/mlb.ts:82-124; src/lib/sportsbook/football.ts:11-48) and the football "best" price mode (src/lib/football/gen-pool.ts:39; src/lib/prop-lean.ts:86-99).
4. FanDuel can never be the settlement price. Selection uses the better of DK/FD (`bs*`), but grading, EV, Kelly and the ledger are DraftKings only (src/lib/sportsbook/books.ts:12; football `playable = !!cz`, src/lib/cfb/props.ts:316, src/lib/cfb/model.ts `sideRow`). A leg where FanDuel is the better (or only) Arizona price is still priced, gated and recorded at DraftKings, or dropped when DraftKings does not post it. Football has no DK/FD basis at all.
5. The one-sided anchor and the best-price de-vig fallbacks (legacy/index.html:2165, :2207, :2451, :2483-2491, :2605) when they use a non-DK/FD price.
6. Caesars defaults for unstamped data and the hard-coded Caesars paths in section 6 (src/lib/server/clv-core.ts:44; src/lib/sportsbook/mlb.ts:77; src/lib/sportsbook/football.ts:10; src/lib/sportsbook/useLivePrices.ts:7; src/engine2/allstar.ts:148-151, :485; tools/snapshot_props.py:27).

Must be re-decided (other books feed the probability, not the price; keeping them as a reference is defensible, but today it is implicit and the gates were tuned for a many-book world):
7. P1 MLB game-line consensus and its sharp weights (legacy/index.html:1297, :1319, :1340, :1557; blend at :2184-2185, :2214).
8. P2 MLB prop consensus (legacy/index.html:1414, :1431-1435, :2451, :2459-2464, :2493).
9. P4 `booksInd` / `no_ind_consensus` / consensus gate (legacy/index.html:1296, :1318, :3063-3079) and P5 `consEvT`/`consCzEvT` (:2757-2758).
10. P6 sim totals 0.30/0.70 blend (legacy/index.html:2876-2877).
11. P7 the 0.5 market shrink toward the all-book `imp` (src/lib/shrink.ts:13-14; src/lib/server/lock-card.ts:312, :1115) that sits directly in front of the bet gate and stakes.
12. P8 the calibration loop on `pMkt` (src/lib/pred-serialize.ts:248; src/engine2/calibration.ts:167-169, :342; app/api/generate/route.ts:423).
13. P11 MLB live modal line / `minBooks` / `fO` (src/lib/server/mlb-live-quote.ts:248-257, :282, :700-735).
14. P12 football game-line consensus with Pinnacle x2 (src/lib/cfb/model.ts:328, :415-419) and P13 football prop fair = all-US-book median with `minBooks: 2` and the 1.08 yes-only constant (src/lib/cfb/props.ts:65, :204-215, :267-268). With only DK + FD as inputs, `minBooks: 2` would require both to post the exact line.
15. P15 CLV `consensusFair` (src/lib/server/clv-core.ts:199, :243), P16 sharp desk, P17 UFC (src/lib/ufc.ts:148; app/api/ufcprops/route.ts:18, :68-75).
16. P19 the archive tools, if pl-history is to be used to validate a DK/FD world.

### 4. Where DraftKings and FanDuel are each used

DraftKings (520 lines / 112 files):
- The settlement book everywhere: `SETTLE_BOOK`, `SETTLE_BOOK_SHORT`, `DEFAULT_BOOK` (src/lib/sportsbook/books.ts:12-14); engine rebind (src/engine/index.ts:296-300); football `settleBook` (src/lib/cfb/rules.ts:77, :476; src/lib/nfl/rules.ts:68, :197); MLB live `settleBook` (src/lib/mlb/live-props-rules.ts:150). Every `cz*` number is the DraftKings quote.
- Stamped on every locked ticket as `settlementBook` (src/lib/server/lock-card.ts:707-709, :731, :1096, :1223).
- One half of the DK/FD selection basis in the MLB engine (legacy/index.html:1306, :1328, :1372, :1394, :1423-1426, :1560-1568), in CLV (src/lib/server/clv-core.ts:21, :25-30) and in MLB live (src/lib/server/mlb-live-quote.ts:120, :162-167).
- Named reference quote on football rows: `dk: find("draftkings")` (src/lib/cfb/model.ts:397; src/lib/cfb/props.ts:346). The paper card and found mode price explicitly at `"draftkings"` (src/lib/cfb/card.ts:249; src/lib/cfb/found.ts:90).
- Default book argument on the sharp desk and UFC (src/engine2/sharpBoard.ts:74, :102, :134; src/lib/ufc.ts:129).
- A member of every consensus median, like any other book.
- Because `CAESARS_KEY` is now `draftkings`, the engine's alternate-ladder capture sends DraftKings ladders to the settlement slot (`altCz`, legacy/index.html:1381-1398), so the "basis" ladder fallback is in practice FanDuel-only.
- UI and copy: about 59 UI lines (labels, tooltips, "EV at DraftKings", "DraftKings void rules", app/ledger/page.tsx:545) and the handoff generator (tools/sync-handoff.sh:256-263, :639).

FanDuel (153 lines / 55 files):
- Only ever the second half of the DK/FD basis: `bs`, `bsOdds`, `bsBook`, `bsEv`, `bsKellyF`, `bsBadge` in the MLB engine (legacy/index.html:1306, :1328, :1372, :1394, :1423, :1427-1428), `basisOf` in CLV (src/lib/server/clv-core.ts:22, :25-30) and MLB live (src/lib/server/mlb-live-quote.ts:121, :162-167), the sharp board's DK/FD basis (src/engine2/sharpBoard.ts:67, :91, :124). The basis picks the bet under `dk_fd` (production cron mode, `CRON_SEL_MODE = "dk_fd"`, app/api/generate/route.ts:52) and sizes Kelly at the basis price; the bet is still graded and recorded at DraftKings.
- Named reference quote on football rows: `fd: find("fanduel")` (src/lib/cfb/model.ts:397; src/lib/cfb/props.ts:347). Football has no DK/FD basis; FanDuel never selects, gates or prices a football bet.
- A selectable display book (src/lib/sportsbook/books.ts:4) and a display label (src/components/cfb/CfbGameCard.tsx:38; src/components/cfb/CfbProps.tsx:111; src/components/props/props-model.ts:69; src/lib/prop-lean.ts:73).
- A member of every consensus median and of the `booksInd` count.
- In `REAL_BOOKS` on the UFC props scraper (app/api/ufcprops/route.ts:18).
- Never a settlement book, never stamped on a ticket, never the price a grade/EV/stake is computed at. No config key, rule or gate names FanDuel.

### 5. Are FanDuel prices fetched at all today?

Yes, but only incidentally. No request filters by book, so FanDuel arrives inside every `regions=us` and `regions=us,eu` response whenever FanDuel posts the market, and the parsers read it (the `bk.key==="fanduel"` branches cited in section 4). Nothing requests FanDuel specifically, and nothing fails or warns when FanDuel is absent.

How often it actually posts (measured read-only on the stored archive with /private/tmp/claude-501/audit-out/hist-books.py; these archives are MLB player props):
- pl-history/data/props/2026-10-28.json: 570 rows; two-sided pairs by book: betmgm 289, betonlineag 267, draftkings 218, bovada 184, williamhill_us 170, mybookieag 109, fanatics 25, fanduel 19.
- pl-history/data/props/2026-09-20.json: 1,411 rows; betmgm 789, draftkings 627, betonlineag 568, williamhill_us 353, bovada 285, mybookieag 225, fanatics 72, fanduel 50.

So on those two days FanDuel posted a two-sided MLB prop pair on about 3 % of rows and DraftKings on about 38-44 %. Whether FanDuel posts one-sided prices (for example anytime-TD "yes") more often could not be determined from these archive fields, which record two-sided pairs. This sweep did not check whether pl-history holds football prop archives.

### 6. Stale Caesars / Nevada wording and defaults (now wrong or misleading)

Code defaults that still resolve to Caesars:
- `export const CAESARS_KEY = "williamhill_us"` as the settlement book for unstamped ledger legs (src/lib/server/clv-core.ts:44; comment :72).
- Fallbacks `?? 'williamhill_us'` for unstamped boards/rows (src/lib/sportsbook/mlb.ts:77; src/lib/sportsbook/football.ts:10; src/lib/sportsbook/useLivePrices.ts:7).
- `bookKey()` maps `cz`, `czr`, `caesars` to `williamhill_us` (src/lib/sportsbook/books.ts:18) while every `cz` field now means DraftKings.
- Label fallback `"CZ"` (src/components/props/props-model.ts:279; src/lib/prop-lean.ts:74) and `book="caesars"` on the design page's DraftKings column (app/design/page.tsx:56).
- Hard-coded Caesars: All-Star desk (src/engine2/allstar.ts:148-151, :485), `tools/snapshot_props.py:27`.
- Selection-mode name `caesars_ev` still in use (src/lib/engine-client.ts:50, :58; src/lib/board-order.ts:48; src/lib/paper-mode.ts:159, :198; src/components/stats/ClvPanel.tsx:33).
- Nevada bookmark list `DEFAULT_BOOKS` (Circa Sports, BetMGM NV, Caesars NV, STN Sports, Westgate SuperBook) at legacy/index.html:529.
- Config field names `czMissingRevalidateSec` / `czMissingWindowSec` and the whole "Caesars-missing" re-check rule (src/lib/cfb/rules.ts:471-476; src/lib/nfl/rules.ts:193-197; src/lib/cfb/props-store.ts:197-218; src/lib/server/football-props.ts:58-80, :233-300) now key on DraftKings.
- The "offered at Caesars right now?" per-pick toggle and its synced store (src/lib/cz-offered.ts:10; src/lib/cz-hidden-merge.ts:1-5; app/api/prefs/route.ts).

Comments that still say Caesars where the code means the settlement book (examples, all in the hit list): src/engine/index.ts:135, :141; src/lib/cfb/model.ts:34-38; src/lib/cfb/props.ts (header and :363-428); src/lib/ufc.ts:5-6, :28, :40, :178; src/engine2/sharpBoard.ts:4; src/engine2/grade.ts:3; app/api/calibrate/route.ts:35; src/lib/ticket-math.ts:18, :24; src/lib/ticket-payout.ts:11; src/lib/fun-hr.ts; src/lib/cfb/lock-server.ts:26, :75, :235, :338, :876; src/lib/nfl/rules.ts:22; src/lib/mlb/live-client.ts:109; src/lib/server/odds-shape.ts:31.

House rules: the grader is described as using "Caesars void rules" (src/engine2/grade.ts:3; app/api/calibrate/route.ts:35) while the Ledger page says "DraftKings void rules" (app/ledger/page.tsx:545). Whether the coded void logic matches DraftKings and FanDuel house rules was not determined by this sweep.

### 7. Complete hit list

Format: `path:line — trimmed source line`. `[xN]` = the term occurs N times on that line. Long (minified) lines are listed once with their occurrence count.

#### Caesars (word)

1166 matching lines in 198 files (1445 occurrences).

Note: Includes CAESARS_KEY (the legacy engine's settlement-book variable, rebound to draftkings at src/engine/index.ts:300) and the caesars_ev selection mode.

##### Caesars (word) — fetch code (30 lines)

- app/api/cfb/props/route.ts:8 — `* NFL build): the whole body, its three quota rails, the per-game windows and the Caesars-missing`
- app/api/nfl/props/route.ts:8 — `* quota rails, per-game windows and Caesars-missing rule as the CFB desk, on the NFL's own knobs`
- app/api/ufcprops/route.ts:5 — `* UFC prop odds, including the Caesars column, scraped from BestFightOdds'`
- app/api/ufcprops/route.ts:18 — `const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);`
- legacy/index.html:1003 — `arr.forEach(function(g){var books=g.bookmakers||[];var bk=books.filter(function(b){return b.key===CAESARS_KEY;})[0]||books[0];var hp=null,ap=null,hpt=null,apt=null,bn="";`
- legacy/index.html:1277 — `(g.bookmakers||[]).forEach(function(bk){var bn=bk.title||bk.key,cz=bk.key===CAESARS_KEY;`
- src/lib/mlb/live-client.ts:109 — `* • U — the Caesars UNDER at the same live line ('oppAm'), its own EV ('evOpp', computed by the`
- src/lib/server/football-props.ts:30 — `* games with an odds event and a Caesars side price (live first, then kickoff order, ranked`
- src/lib/server/football-props.ts:58 — `* THE CAESARS-MISSING RULE (2026-09-05, Josh: "They are still 12 games today that haven't started w/`
- src/lib/server/football-props.ts:59 — `* current Anytime TD odds"): Caesars posts player props later than the other books, and an upcoming`
- src/lib/server/football-props.ts:60 — `* game priced before Caesars posted rode its Caesars-less rows for the whole 2 h carry. Now an` [x2]
- src/lib/server/football-props.ts:62 — `* Caesars quote ('czMissingGameIds', props.ts — keyed on the market, so a game with Caesars yardage` [x2]
- src/lib/server/football-props.ts:63 — `* props but no Caesars anytime TD yet still re-checks), with kickoff inside CFB_PROPS.czMissingWindowSec`
- src/lib/server/football-props.ts:65 — `* 'czMissingDue' (props-store.ts). A game with ZERO rows is never Caesars-missing: it stays on the 2 h`
- src/lib/server/football-props.ts:71 — `* "need" is ordered live → never priced → Caesars-missing → 2 h-expired, so a tight budget buys the`
- src/lib/server/football-props.ts:73 — `* stale entry answers with the OLD body and refreshes in the background — so a Caesars-missing or`
- src/lib/server/football-props.ts:75 — `* already bound its cadence; a cached answer would have landed Caesars one interval late); a first`
- src/lib/server/football-props.ts:233 — `// Caesars-missing on some market it has rows for — the three facts every carry rule below reads.`
- src/lib/server/football-props.ts:238 — `// THE CAESARS-MISSING RULE: an upcoming game on the board with rows, some market of which has no`
- src/lib/server/football-props.ts:239 — `// Caesars quote, inside 4 h of kickoff, whose own stamp is older than 30 min — due a re-pull now`
- src/lib/server/football-props.ts:244 — `// Caesars-missing game — the phone's staleTime reads it, and nothing else asks this route`
- src/lib/server/football-props.ts:247 — `// Rail 1 answers only when the board is fresh AND no game is due under the Caesars-missing rule —`
- src/lib/server/football-props.ts:268 — `// saved) — UNLESS the Caesars-missing rule says it is due. A LIVE game with rows re-prices once its`
- src/lib/server/football-props.ts:270 — `// got past rail 1, so one Caesars-missing game turning due re-fetched every fresh live game) —`
- src/lib/server/football-props.ts:282 — `// then games never priced (nothing to show at all), then the Caesars-missing re-checks, then the`
- src/lib/server/football-props.ts:465 — `// THE DATA CACHE ON A RE-PULL: a Caesars-missing re-check, or a live game already on the board, is`
- src/lib/useAllStar.ts:10 — `- localStorage: pasted Caesars boards (correct score / extra HR props) and`
- src/lib/useAllStar.ts:25 — `parseCaesarsBoard,`
- src/lib/useAllStar.ts:34 — `/** One paste, the whole Caesars ASG board — the router sorts the lines. */`
- src/lib/useAllStar.ts:235 — `const parsed = parseCaesarsBoard(paste.board);`

##### Caesars (word) — config (34 lines)

- src/lib/cfb/rules.ts:33 — `* settleBook — Caesars (The Odds API key 'williamhill_us'): the price every ticket`
- src/lib/cfb/rules.ts:45 — `/** a core leg needs this % EV at Caesars */`
- src/lib/cfb/rules.ts:59 — `/** the forced top-up admits legs down to this EV% at Caesars (never negative EV) */`
- src/lib/cfb/rules.ts:63 — `/** fun money rides the likeliest sides — grade D or better at Caesars (never an F), by probability */`
- src/lib/cfb/rules.ts:94 — `* hour, so Caesars' final pregame lines are on the board and every game on`
- src/lib/cfb/rules.ts:154 — `* CFB_LOCK.leadMs before the FIRST kickoff — the moment the pool of posted Caesars prices is`
- src/lib/cfb/rules.ts:352 — `poked all day and refused for want of a Caesars price. It holds no money and no card — the`
- src/lib/cfb/rules.ts:372 — `so a slate is capped at 'maxEvents' priced events; 'settleBook' is DraftKings, as everywhere (INSTRUCTION 67, 2026-09-17; was Caesars).`
- src/lib/cfb/rules.ts:406 — `24 in play, so every game the slate can carry (odds event + a Caesars side) gets its props`
- src/lib/cfb/rules.ts:432 — `THE CAESARS-MISSING RULE (2026-09-05, Josh, verbatim: "It's still only showing ANYTIME TD picks`
- src/lib/cfb/rules.ts:435 — `games with rows, 11 carried DK / FD anytime-TD rows but NO Caesars quote on any row, while`
- src/lib/cfb/rules.ts:436 — `Caesars itself was posting those games. Caesars posts player props later than DK / FD, and an` [x2]
- src/lib/cfb/rules.ts:437 — `upcoming game rode its stored rows for the whole 2 h carry — priced once before Caesars posted,`
- src/lib/cfb/rules.ts:439 — `MARKET with rows, carries no Caesars quote ('czMissingGameIds' — keyed on the market, so Caesars` [x2]
- src/lib/cfb/rules.ts:440 — `yardage props without a Caesars anytime TD still re-check), with kickoff inside`
- src/lib/cfb/rules.ts:443 — `Caesars-missing (review fix): it stays on the 2 h empty-event hold, upcoming or live — 29 of the`
- src/lib/cfb/rules.ts:453 — `the games it refuses simply keep their last priced rows. A board that counts a Caesars-missing`
- src/lib/cfb/rules.ts:470 — `/** an upcoming game with rows but NO Caesars quote on some market it has rows for is re-asked this often (s) — Caesars posts props late; a game with no rows is never re-asked ea…` [x2]
- src/lib/cfb/rules.ts:531 — `the generated parlays. It should be showing 50+ Anytime TD parlays"): Caesars shades anytime`
- src/lib/cfb/rules.ts:534 — `category set now builds from tier 1 (Caesars-priced, EV ≥ 'minLegEvPct') first and, when that`
- src/lib/cfb/rules.ts:535 — `yields fewer than 'perCategory' tickets, extends its pool to tier 2 — any Caesars-priced`
- src/lib/cfb/rules.ts:546 — `/** a leg needs at least this % EV at Caesars (grade D or better, never an F) */`
- src/lib/cfb/rules.ts:548 — `/** tier 2 for the single-market category sets only: a Caesars-priced pregame or in-game leg admitted down to this % EV once tier 1 cannot fill the set */`
- src/lib/mlb/live-props-rules.ts:229 — `* The three ladders in 'PROP_MARKETS' ('src/lib/server/odds-shape.ts:20-53') are pre-kick Caesars`
- src/lib/nfl/rules.ts:22 — `* and the FPI gap; Pinnacle counts twice; two books make a consensus; Caesars`
- src/lib/nfl/rules.ts:37 — `/** a core leg needs this % EV at Caesars */`
- src/lib/nfl/rules.ts:49 — `/** the forced top-up admits legs down to this EV% at Caesars (never negative EV) */`
- src/lib/nfl/rules.ts:53 — `/** fun money rides the likeliest sides — grade D or better at Caesars (never an F), by probability */`
- src/lib/paper-mode.ts:159 — `* forcedMaxDec 1.75 — the forced pass ($915 at −27% under caesars_ev) now only tops`
- src/lib/paper-mode.ts:198 — `/** the forced top-up selects/weights by true probability alone — not caesars_ev */`
- src/lib/server/odds-shape.ts:31 — `per-event props call has ALWAYS asked for SH_PROP_MARKETS + SH_PROP_ALT (the Caesars`
- src/lib/sportsbook/books.ts:2 — `{key:'williamhill_us',label:'Caesars',short:'CZ'},`
- src/lib/sportsbook/books.ts:11 — `/** The book every grade, edge %, EV and Kelly stake is computed at (INSTRUCTION 67, 2026-09-17: DraftKings replaces Caesars). */`
- src/lib/sportsbook/books.ts:18 — `if(['cz','czr','caesars','williamhillus'].includes(v))return 'williamhill_us';`

##### Caesars (word) — caches (8 lines)

- app/api/prefs/route.ts:16 — `* Today it carries exactly one preference: the Caesars ⓘ toggle map.`
- src/lib/cfb/props-store.ts:46 — `* (EX CFB_PROPS.boardRetainSec, 36 h) and the Caesars-missing windows stay the CFB constants: both`
- src/lib/cfb/props-store.ts:197 — `* THE CAESARS-MISSING RULE (2026-09-05): is this UPCOMING game due a re-pull ahead of its 2 h carry?`
- src/lib/cfb/props-store.ts:199 — `* verdict: the game HAS rows and some market with rows on it carries no Caesars quote (review fix:`
- src/lib/cfb/props-store.ts:204 — `* game with Caesars on every market it has, or a kickoff past the window → false: the existing rules`
- src/lib/cz-hidden-merge.ts:2 — `* Caesars-toggle sync — the shared merge kernel (2026-08-10, Josh: "sync the`
- src/lib/cz-offered.ts:10 — `* "IS THIS PICK OFFERED AT CAESARS RIGHT NOW?" (2026-08-09, Josh's call.)`
- src/lib/cz-offered.ts:12 — `* The board stopped holding picks back for having no Caesars price — every pick posts,`

##### Caesars (word) — calculations (191 lines)

- app/api/calibrate/route.ts:35 — `* Caesars void rules as the ledger's grader), reconciles projected lineups`
- app/api/cfb/lock/route.ts:78 — `* games are still ahead, and the day carries NO usable Caesars price — either 'slate.oddsMissing'`
- app/api/cfb/lock/route.ts:170 — `* when the pool of posted Caesars prices is thinnest, and buildCfbCard says so out loud when it`
- app/api/cfb/lock/route.ts:262 — `* posted Caesars prices is thinnest — and buildCfbCard says so when it cannot spend the`
- app/api/clv/route.ts:20 — `* last Caesars price + de-vigged consensus fair for every still-pregame leg`
- legacy/index.html:289 — `/* Caesars-only layer (build 40) */`
- legacy/index.html:386 — `<div class="obhead"><span>ODDS BOARD · CAESARS</span><button id="obToggle" title="API key">&#9881;</button></div>`
- legacy/index.html:391 — `<div class="obnote">A Caesars odds key is already built in — props load automatically. To use your own key instead, paste it here (saved on this device).</div>`
- legacy/index.html:424 — `Stats: MLB Stats API + ESPN (live). Caesars-preferred odds via The Odds API; other odds entered manually.`
- legacy/index.html:457 — `…ed in at a minority weight (the market is the smartest baseline). The playable card is Caesars-only — displayed odds, EV and ¼-Kelly stakes use Caesars' price (probabilities stay a…` [x3]
- legacy/index.html:529 — `…s.com"},{id:uid(),name:"BetMGM NV",url:"https://sports.nv.betmgm.com"},{id:uid(),name:"Caesars NV",url:"https://sportsbook.caesars.com/us/nv/bet"},{id:uid(),name:"STN Sports",url:"…` [x2]
- legacy/index.html:887 — `/* ===== Odds Board: Caesars lines via The Odds API (user-supplied key) ===== */`
- legacy/index.html:888 — `var CAESARS_KEY="williamhill_us";`
- legacy/index.html:899 — `if(!OB.key){el.innerHTML="<span class='obwarn'>Add your Odds API key (\u2699) to load Caesars lines.</span>";return;}`
- legacy/index.html:900 — `if(OB.loading){el.innerHTML="<span class='obload'>Loading Caesars odds\u2026</span>";return;}`
- legacy/index.html:933 — `if(OB.market==="pitcher_strikeouts")return "Caesars hasn't posted starting-pitcher strikeouts for this game yet — they post once starters are confirmed, usually a few hours befor…`
- legacy/index.html:947 — `/* prefer Caesars, else fall back to any US book carrying the market */`
- legacy/index.html:948 — `var bk=bks.filter(function(b){return b.key===CAESARS_KEY;})[0]||bks[0];`
- legacy/index.html:952 — `if(bk.key!==CAESARS_KEY)OB.note="Caesars hasn't priced this yet — showing "+(bk.title||bk.key)+".";` [x2]
- legacy/index.html:1078 — `SETTLES at Caesars; a core ticket that's negative-EV at the settling book never locks.`
- legacy/index.html:1103 — `this many minutes, because locking writes the board's STORED Caesars prices into`
- legacy/index.html:1104 — `the append-only ledger. Measured basis: over a 4-5h gap near first pitch, Caesars`
- legacy/index.html:1158 — `/* Caesars posts hits and Ks as milestone ladders ("1+ hits", "6+ Ks"), which The Odds API`
- legacy/index.html:1159 — `exposes under the *_alternate market keys (Over 0.5/1.5/... only). Verified live: Caesars`
- legacy/index.html:1161 — `the Caesars playable price on existing rows — never consensus, line shopping, or new rows. */`
- legacy/index.html:1199 — `… — outcome stats shrunk to league means instead.","No odds history — CLV uses the last Caesars price seen before first pitch, not the true closing line (coverage disclosed in the l…`
- legacy/index.html:1302 — `/* Caesars-only playable layer: the user's book. Captured additively — consensus/best-price above untouched. */`
- legacy/index.html:1324 — `/* Caesars RL only counts when Caesars quotes the same modal ±1.5 point the engine prices */` [x2]
- legacy/index.html:1335 — `if(SH_V2){ /* consensus at the modal total point + Caesars quote (v2 totals pricing) */`
- legacy/index.html:1371 — `bks.forEach(function(bk){var bn=bk.title||bk.key,czb=bk.key===CAESARS_KEY;bookNames[bn]=1;`
- legacy/index.html:1377 — `Caesars fills czAlt (as before); DK/FD fill altBs so the dk_fd basis`
- legacy/index.html:1419 — `var czAlt=(!czx&&altCz[mkey])?altCz[mkey][kk]:null; /* ladder fallback: standard Caesars quote wins */`
- legacy/index.html:1439 — `/* 'alt' = the Caesars milestone ladders exactly as posted ("2+ hits", "3+ K",`
- legacy/index.html:1561 — `Captured additively, exactly like the Caesars layer: consensus and best-price`
- legacy/index.html:2292 — `means he's ruled out today -> off the board entirely (Caesars voids the leg`
- legacy/index.html:2305 — `…ojected-lineup");bits.push("lineup not posted — everyday starter ("+st.last30.g+" games in 30 days), projected in");riskBits.push("auto-voids at Caesars if he unexpectedly sits");}`
- legacy/index.html:2528 — `/* Caesars playable layer (additive): EV/Kelly at the price the user can actually get,`
- legacy/index.html:2529 — `and the price edge vs the de-vigged market consensus (fair prob − Caesars implied) */`
- legacy/index.html:2628 — `/* Caesars milestone ladders ("2+ hits", "3+ K", "2+ HR") are real posted lines the`
- legacy/index.html:2629 — `consensus books don't mirror — browsable here, flagged ALT, Caesars-priced. */`
- legacy/index.html:2740 — `/* Caesars re-pricing (additive display fields — selection/legs above are untouched):`
- legacy/index.html:2741 — `the playable ticket price is the product of Caesars leg decimals; any leg Caesars` [x2]
- legacy/index.html:2747 — `/* DK/FD basis re-pricing (additive, mirrors the Caesars layer): a leg with no`
- legacy/index.html:2854 — `…FD basis (better of the pair, tie DK): EV, stakes and the card gate all compute there; Caesars settles the ticket. Legs without a DK/FD quote are card-ineligible (flagged, never hi…`
- legacy/index.html:2855 — `:"Playable card is Caesars-only (your book): displayed odds, EV and stakes use Caesars' price; picks Caesars doesn't offer are listed separately, never hidden. ")` [x3]
- legacy/index.html:2861 — `consensus, EV at the Caesars quote when CZ hangs the same number), first-5`
- legacy/index.html:2988 — `/* the day's stakeable pool: pregame tickets playable at Caesars (PARLAYS + MIXED sets);`
- legacy/index.html:3021 — `/* selection_mode: "ev_gated" (default, upgrade 01) admits only tickets whose Caesars`
- legacy/index.html:3025 — `"caesars_ev" is the legacy ¼-Kelly-at-CZ ranking. Both stay selectable in Settings.`
- legacy/index.html:3027 — `number — the EV gate, weights, Kelly — computes at the DK/FD basis price; Caesars is`
- legacy/index.html:3046 — `what force bypasses); below zero at Caesars nothing bypasses. */`
- legacy/index.html:3202 — `"<span class='shprop'>"+esc(pl.czOdds)+" @ Caesars</span></div>"+`
- legacy/index.html:3224 — `/* bucket playable tickets into odds tiers at the CAESARS price */`
- legacy/index.html:3278 — `var h="<div class='shcard'><div class='shcardhead'>TODAY'S CARD · CAESARS</div>";`
- legacy/index.html:3279 — `if(!cc||!cc.pool.length)return h+"<div class='shcardnote'>No Caesars-playable pregame tickets right now.</div></div>";`
- legacy/index.html:3296 — `if(!fp.picks.length)h+="<div class='shcardnote'>No Caesars-playable tickets in the longshot tiers (+800 and up) right now.</div>";`
- legacy/index.html:3354 — `/* ¼-Kelly stake fraction for one ticket at its Caesars price: 0.25·f*, capped at 2% of`
- legacy/index.html:3407 — `/* LOCK CARD: freeze today's parlays, Caesars prices and exact stakes into the ledger */`
- legacy/index.html:3539 — `"<span class='shprop'>"+esc(t.confirmed!=null?obSign(t.confirmed)+" (NV)":t.czOdds+" @ Caesars")+"</span></div>"+`
- legacy/index.html:3571 — `/* ===== build 40: auto-grading from official box scores, Caesars void rules =====`
- legacy/index.html:3644 — `/* voids + pushes divide out of the ticket price (Caesars reprice) */`
- legacy/index.html:3714 — `/* CLV, the honest version: no paid odds history, so "closing" = the LAST Caesars price seen`
- legacy/index.html:3745 — `/* Caesars-only playable card: quant rows carry cz* fields — everything the user sees and`
- legacy/index.html:3746 — `stakes is Caesars' price. Legacy Claude-mode picks (no cz fields) keep the old display. */`
- legacy/index.html:3752 — `/* Caesars lists prop overs as milestone ladders — "Hits O 0.5" is "1+ hits" in their app.`
- legacy/index.html:3756 — `var priceTxt=czMode?(p.czOdds+" @ Caesars"+lad):(p.odds+(p.book?" @ "+p.book:""));`
- legacy/index.html:3763 — `(badge?"<span class='shconv A' title='EV at Caesars clears the threshold + uncertainty band'>EDGE</span>":"")+`
- legacy/index.html:3810 — `if(!LS.get("pl_czNote",""))h+="<div class='shczno'>ℹ️ Playable prices are Caesars' national feed — the Nevada app can differ a touch. The ledger records the prices you confirm …`
- legacy/index.html:3845 — `/* Caesars-only board: quant rows without a Caesars price drop to a collapsed strip` [x2]
- legacy/index.html:3851 — `if(unav.length)h+="<details class='shunav'><summary>Not at Caesars — "+unav.length+" pick"+(unav.length===1?"":"s")+" (can't play these there)</summary>"+`
- legacy/index.html:3864 — `/* Caesars-only: tickets with any leg Caesars doesn't price are unplayable there —` [x2]
- legacy/index.html:3871 — `var oddsTxt=czMode?pl.czOdds+" @ Caesars":pl.odds;`
- legacy/index.html:3887 — `if(unav.length)h+="<details class='shunav'><summary>Not at Caesars — "+unav.length+" ticket"+(unav.length===1?"":"s")+" with a leg Caesars doesn't price</summary>"+` [x2]
- legacy/index.html:4016 — `"Locked cards only — append-only, auto-graded from official MLB box scores under Caesars void rules (batter must start, pitcher must start; voids reprice the ticket). CLV compa…` [x2]
- legacy/index.html:4092 — `SH.busy=true;shStatus("Snapshotting Caesars prices (uses API credits)…");`
- legacy/index.html:4114 — `/* slip adds carry the Caesars price when the pick is playable there (the price the user actually gets) */`
- legacy/index.html:4157 — `last-seen Caesars prices (the honest stand-in for a closing line) */`
- src/engine/legacy-src.gen.ts:5 — `…"},{id:uid(),name:\"BetMGM NV\",url:\"https://sports.nv.betmgm.com\"},{id:uid(),name:\"Caesars NV\",url:\"https://sportsbook.caesars.com/us/nv/bet\"},{id:uid(),name:\"STN Sports\",…` [long line; 79 occurrences on this line; first shown]
- src/engine2/allstar.ts:8 — `F3 exists only at Caesars — its own two-sided prices de-vig fine, but the`
- src/engine2/allstar.ts:17 — `- Caesars NV offers NO parlays on the All-Star Game, so everything here is`
- src/engine2/allstar.ts:20 — `from the Caesars app (the Derby's paste flow, same reason). */`
- src/engine2/allstar.ts:147 — `/** Caesars' own quote for a two-way / OU market, for EV display. */`
- src/engine2/allstar.ts:323 — `/** Correct-score lines from the Caesars app. Accepts shapes like:`
- src/engine2/allstar.ts:359 — `/** One paste, the whole Caesars board. Every ASG market is posted in the`
- src/engine2/allstar.ts:360 — `Caesars NV app; this router sorts a raw dump line-by-line: correct scores`
- src/engine2/allstar.ts:362 — `game-market lines (ML/F3/F5/totals — already live from the feed's Caesars`
- src/engine2/allstar.ts:365 — `export function parseCaesarsBoard(text: string): {`
- src/engine2/allstar.ts:417 — `odds: number; // the Caesars price (this book is where Josh bets)`
- src/engine2/allstar.ts:556 — `/* Correct score: pasted Caesars board. When the paste covers the whole`
- src/engine2/allstar.ts:613 — `/* Straight bets ONLY — Caesars NV does not offer All-Star Game parlays.`
- src/engine2/calibration.ts:457 — `sign of EV: EV is computed at the CAESARS price, so a row can be model-high on`
- src/engine2/calibration.ts:458 — `consensus and still negative-EV because Caesars is worse than consensus. Both are`
- src/engine2/grade.ts:3 — `* (legacy/index.html) for the calibration module's cron. Same Caesars void`
- src/engine2/sharpBoard.ts:4 — `Pinnacle-weighted consensus across us+eu books, judged at the Caesars line.`
- src/lib/board-order.ts:9 — `* ev_gated → EV at Caesars (czEv) — the default; the EV *gate* itself`
- src/lib/board-order.ts:11 — `* caesars_ev → EV at Caesars (czEv), the legacy ranking` [x2]
- src/lib/board-order.ts:48 — `caesars_ev: "ranked by EV @ DraftKings",`
- src/lib/cfb/card.ts:19 — `* candidates playable rows (kickoff after opts.now) with EV ≥ minEvPct at Caesars and`
- src/lib/cfb/card.ts:20 — `* Caesars dec ≤ maxDec; one row per game (the highest EV, then the likelier).`
- src/lib/cfb/card.ts:48 — `* Caesars) and R.maxDec (2.60) — and when 'bestRows' came back empty it RETURNED, from inside the`
- src/lib/cfb/card.ts:51 — `* CFB_RULES.fun.minEvPct = -3 (grade D or better at Caesars), its own 4–40 decimal band, 3–5 legs`
- src/lib/cfb/card.ts:172 — `/** One row per game: the highest EV at Caesars, then the likelier. The rest are benched. */`
- src/lib/cfb/card.ts:340 — `// grade D or better at Caesars: a favorites parlay is priced by the book, so a strict ≥ 0% gate`
- src/lib/cfb/card.ts:350 — `// "FAVORITES" only when the legs mostly are favorites (no-push probability ≥ ½ at Caesars' line)`
- src/lib/cfb/lock-server.ts:26 — `* cfbPricedAhead how many Caesars quotes sit on games still ahead — the "can this day even`
- src/lib/cfb/lock-server.ts:75 — `* inside the window whose every poke refused for want of a Caesars price. They stay apart on the`
- src/lib/cfb/lock-server.ts:235 — `* have locked all day and deliberately refused, for want of a Caesars price. Josh reads this`
- src/lib/cfb/lock-server.ts:338 — `* when the pool of posted Caesars prices is thinnest, and buildCfbCard says so out loud when`
- src/lib/cfb/lock-server.ts:876 — `* while Caesars prices were posted all afternoon.`
- src/lib/cfb/model.ts:38 — `* line, EV at Caesars re-evaluated at Caesars' line, a letter grade on that EV, and a` [x2]
- src/lib/cfb/picks.ts:17 — `* Every number comes from the rows handed in — a leg's price is Caesars' posted price, its`
- src/lib/cfb/picks.ts:18 — `* probability the model's own figure at Caesars' line — nothing here is estimated in the`
- src/lib/cfb/picks.ts:21 — `* Categories — "all" (every side and prop with a Caesars price), "ml" / "spread" / "total"`
- src/lib/cfb/picks.ts:22 — `* (sides), one per prop market — each ranked S → F on the EV at Caesars, then EV, then`
- src/lib/cfb/picks.ts:30 — `* when it is known), graded exactly like upcoming rows on the EV at Caesars, with kelly null`
- src/lib/cfb/picks.ts:31 — `* and playable false (in-play lines are not the desk's paper stakes). A Caesars price is still`
- src/lib/cfb/picks.ts:36 — `* · legs are Caesars-priced rows with EV ≥ minLegEvPct (grade D or better, never an F);`
- src/lib/cfb/picks.ts:40 — `* · prob = Π leg no-push probabilities, dec = Π Caesars decimals, ev = 100·(prob·dec − 1);`
- src/lib/cfb/picks.ts:72 — `* pool extends to tier 2 — Caesars-priced, upcoming, non-live legs of that market down to`
- src/lib/cfb/picks.ts:88 — `* view (SAFER / LONGSHOT / MIX) stays pregame-only. Prod at 16:55 PT that day: Caesars anytime`
- src/lib/cfb/picks.ts:185 — `/** S → F on the EV at Caesars, then EV, then probability, then key (total order — deterministic). */`
- src/lib/cfb/picks.ts:695 — `// SAFER — sides AND props (2026-09-05: Caesars posts no moneyline on the big favourites, so a`
- src/lib/cfb/props-context.ts:37 — `* the players Caesars prices are near the top.`
- src/lib/cfb/props.ts:37 — `* price against the fair AT THE BOOK'S LINE — so a Caesars quote at a line no second book`
- src/lib/cfb/props.ts:42 — `* line-less anytime TD); 'cz' = Caesars; 'dk' / 'fd' for reference; 'grade' =`
- src/lib/cfb/props.ts:43 — `* gradeFromEv(evCz); 'playable' = Caesars posts it ∧ status upcoming ∧ kickoff after 'now';`
- src/lib/cfb/props.ts:363 — `* final or postponed — AND it is matched to an odds event AND Caesars posts a price on at least`
- src/lib/cfb/props.ts:364 — `* one side (no Caesars → nothing to settle at).`
- src/lib/cfb/props.ts:404 — `* THE CAESARS-MISSING RULE'S TEST, keyed on the MARKET (2026-09-05 review fix): the ids of the games`
- src/lib/cfb/props.ts:405 — `* that have rows AND at least one market with rows on that game whose rows carry NO Caesars quote —`
- src/lib/cfb/props.ts:406 — `* so a game with Caesars yardage props but no Caesars anytime TD yet is missing, and a game with zero` [x2]
- src/lib/cfb/props.ts:411 — `// gameId → market → has a Caesars quote on any row`
- src/lib/cfb/props.ts:424 — `* What the answer does NOT carry, honestly counted (2026-09-05, THE CAESARS-MISSING RULE) — over the`
- src/lib/cfb/props.ts:427 — `* czMissing — upcoming games with rows where some market with rows has no Caesars quote on any of`
- src/lib/cfb/props.ts:428 — `* them ('czMissingGameIds': other books posted, Caesars not yet — on that market)`
- src/lib/cfb/useCfbDesk.ts:71 — `/** Every priced side on the slate, ranked S → F (grade, then EV at Caesars, then fair). Sides`
- src/lib/cfb/useCfbDesk.ts:72 — `without a Caesars quote sort last — they carry no EV and no grade. */`
- src/lib/cfsel.ts:60 — `/** HRR legs that reached the Caesars-playable pool */`
- src/lib/clv-report.ts:12 — `* - czCents = locked Caesars price − closing Caesars price on a continuous` [x2]
- src/lib/engine-client.ts:50 — `export type SelectionMode = "dk_fd" | "ev_gated" | "probability" | "caesars_ev";`
- src/lib/engine-client.ts:56 — `// both price at Caesars, so the EV gate IS the settlement floor. dk_fd (DK/FD`
- src/lib/engine-client.ts:58 — `return v === "caesars_ev" || v === "probability" || v === "dk_fd" ? v : "ev_gated";`
- src/lib/engine-client.ts:119 — `// the legacy Caesars-EV ranking stays selectable in Settings`
- src/lib/football/gen-pool.ts:13 — `* A cell the board draws as an untappable dash — Caesars alone at 249.5 against a 245.5`
- src/lib/football/gen-pool.ts:76 — `/** the board's price column: Caesars only, or the best posted price */`
- src/lib/football/gen-pool.ts:119 — `windows are final while the night games are still upcoming, that told Josh Caesars had`
- src/lib/fun-hr.ts:8 — `* the Caesars price ride through untouched; the only new numbers are products. The`
- src/lib/fun-hr.ts:45 — `dec: number | null; // Caesars decimal`
- src/lib/fun-hr.ts:46 — `cz: number | null; // Caesars American`
- src/lib/fun-hr.ts:152 — `* rows that carry a Caesars price, taken most-likely-first from the board's own rows:`
- src/lib/grade.ts:4 — `* grade on the same EV% the row displays (czEv at Caesars, bsEv in dk_fd basis`
- src/lib/ledger-segments.ts:12 — `* clvPts = 100 x (implied(closing Caesars price) - implied(locked price))`
- src/lib/ledger-segments.ts:70 — `/* dk_fd: running "NV tax paid" — what settling at Caesars cost vs the DK/FD basis`
- src/lib/lineup-check.ts:18 — `* player means he's ruled out today -> off the board entirely (Caesars voids the leg)".`
- src/lib/nfl/first-sunday-six.ts:39 — `// Never substitute ordinary game First TD prices for the separate Caesars race price.`
- src/lib/parlay-gen.ts:222 — `* one as "the book bars from parlays", which is a statement about Caesars, and filing a`
- src/lib/prop-lean.ts:74 — `if (k.includes("caesars") || k === "cz") return "CZ";`
- src/lib/server/clv-core.ts:13 — `* Each sighting stores the Caesars price AND the de-vigged multi-book`
- src/lib/server/clv-core.ts:17 — `/* dk_fd: each sighting carries BOTH closes — the Caesars close (the price that pays)`
- src/lib/server/clv-core.ts:44 — `export const CAESARS_KEY = "williamhill_us";`
- src/lib/server/clv-core.ts:73 — `tickets carry nothing and are sighted at the Caesars close they were priced at. */`
- src/lib/server/clv-core.ts:95 — `/** The odds-API market keys one game's prop legs need (plus Caesars' alternate ladders). */`
- src/lib/server/clv-core.ts:154 — `// ladders fill the Caesars price and (mirroring the engine's basis capture)`
- src/lib/server/clv-core.ts:156 — `if (alt && bk.key !== (leg.settlementBook ?? CAESARS_KEY) && bk.key !== DK && bk.key !== FD) continue;`
- src/lib/server/clv-core.ts:169 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) {`
- src/lib/server/clv-core.ts:183 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) {`
- src/lib/server/clv-core.ts:236 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) cz = mine.price;`
- src/lib/server/lock-card.ts:592 — `(1.75 for 2-leg slots — the $915 caesars_ev forced pass ran −27%; the 1.75^legs`
- src/lib/server/lock-card.ts:709 — `const settlementBook = String(eng.get<string>("CAESARS_KEY"));`
- src/lib/server/lock-card.ts:775 — `Composed deterministically from the board's own HR rows (engine prob + Caesars`
- src/lib/server/lock-card.ts:1096 — `const settlementBook = String(eng.get<string>("CAESARS_KEY"));`
- src/lib/server/mlb-live-quote.ts:177 — `/** the point the market is on NOW — modal across books, Caesars breaking a tie */`
- src/lib/server/mlb-live-quote.ts:199 — `* Caesars / DK / FD capture, the proportional pair de-vig — is lifted, not reinvented.`
- src/lib/server/mlb-live-quote.ts:202 — `* two-sided quote. A tie breaks to the point Caesars is posting when Caesars is one of the tied` [x2]
- src/lib/server/mlb-live-quote.ts:203 — `* books — Caesars is the settle book ('src/lib/cfb/props.ts' uses the same 'settleBook' rule), so`
- src/lib/server/mlb-live-quote.ts:204 — `* when the market is genuinely split, the number that can actually be bet wins. With no Caesars`
- src/lib/server/mlb-live-quote.ts:213 — `* integer-milestone half-line normalisation, for the one thing it is allowed to do — fill a Caesars`
- src/lib/server/mlb-live-quote.ts:226 — `// clv-core's rule: a ladder is only ever read at Caesars / DK / FD`
- src/lib/server/mlb-live-quote.ts:248 — `// the modal point across books, ties to Caesars' point, else the median of the tied points`
- src/lib/server/mlb-live-quote.ts:718 — `single most dangerous thing this overlay could print. 'evOpp' is the Caesars UNDER at the`
- src/lib/sportsbook/football.ts:9 — `/** the book a server row is already priced at — 'displayBook' once repriced, else its settle quote's key; rows from before 2026-09-17 (INSTRUCTION 67) are Caesars-priced */`
- src/lib/sportsbook/mlb.ts:76 — `// 'cz' is the quote at the board's settlement book; a board stamped before INSTRUCTION 67 (2026-09-17) was priced at Caesars`
- src/lib/sportsbook/mlb.ts:101 — `// a board is served as-is only at the book it was priced at; a Caesars-stamped (pre-2026-09-17) cache is repriced at DraftKings from the quote index`
- src/lib/sportsbook/useLivePrices.ts:7 — `if(!data||book===(data.settleBook??'williamhill_us'))return data; // overlays from before 2026-09-17 (INSTRUCTION 67) carry no stamp and are Caesars-priced`
- src/lib/ticket-math.ts:18 — `cz: number; // american — the Caesars price when posted, else the best price in the feed`
- src/lib/ticket-math.ts:24 — `/** which book the price came from — "CZ" whenever Caesars posts it */`
- src/lib/ticket-payout.ts:11 — `* Caesars quote, exactly as the ledger's old "to win" did); once graded it is what`
- src/lib/ufc.ts:6 — `US book in the feed, EV is computed at the Caesars price, and parlays are`
- src/lib/ufc.ts:28 — `/** EV per $1 at the Caesars price */`
- src/lib/ufc.ts:40 — `/** rounds total from other books, reference only — not posted at Caesars in this feed */`
- src/lib/ufc.ts:178 — `// playable = sides Caesars actually prices, one per fight (the better-EV side)`

##### Caesars (word) — stored-data fields (28 lines)

- src/engine/index.ts:23 — `/** odds-API bookmaker key the engine settles at ('CAESARS_KEY' inside the blob); omitted = legacy Caesars */` [x2]
- src/engine/index.ts:35 — `/** the odds-API book 'cz' / 'czOdds' / 'czEv' were priced at (stamped by attachBookQuotes; missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:76 — `/** book the leg's 'cz' price is at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:121 — `/** book the 'cz' pair is at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:135 — `cz: { o: number | null; u: number | null } | null; // the Caesars quote (what Josh actually bets)`
- src/engine/index.ts:141 — `alt?: boolean; // Caesars milestone-ladder line ("2+ hits"), Caesars-priced only` [x2]
- src/engine/index.ts:153 — `/** book every 'cz' field on this board is priced at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:297 — `declares 'var CAESARS_KEY="williamhill_us"'; rebinding it here (a 'var', so the assignment`
- src/engine/index.ts:299 — `quote. Callers that omit 'settlementBook' keep the legacy Caesars behaviour (parity tests). */`
- src/engine/index.ts:300 — `if (deps.settlementBook) scope.set("CAESARS_KEY", deps.settlementBook);`
- src/lib/cfb/props-types.ts:86 — `/** % EV at Caesars */`
- src/lib/cfb/props-types.ts:135 — `/** THE CAESARS-MISSING RULE (2026-09-05): priced UPCOMING games on this answer that carry rows and, on`
- src/lib/cfb/props-types.ts:136 — `some market with rows, no Caesars quote (other books posted, Caesars not yet — 'czMissingGameIds') —` [x2]
- src/lib/cfb/props-types.ts:164 — `/** Caesars American price */`
- src/lib/cfb/types.ts:123 — `/** Caesars (williamhill_us), at ITS OWN line — the settling book */`
- src/lib/cfb/types.ts:133 — `/** % EV at the Caesars quote (fair re-evaluated at Caesars' line when it differs) */` [x2]
- src/lib/cfb/types.ts:139 — `/** ¼-Kelly stake at Caesars in whole dollars, 2%-of-bankroll cap; 0 when not playable */`
- src/lib/cfb/types.ts:207 — `/** Caesars American price captured at lock */`
- src/lib/cfb/types.ts:234 — `/** combined Caesars American price */`
- src/lib/cfb/types.ts:239 — `/** % EV at Caesars */`
- src/lib/mlb/live-quote-types.ts:33 — `/** the line the book is posting NOW (modal point across books, Caesars breaking ties) */`
- src/lib/mlb/live-quote-types.ts:35 — `/** Caesars' American price on the over at 'ln', null when Caesars posts no in-play quote */` [x2]
- src/lib/mlb/live-quote-types.ts:57 — `/** EV% of the Caesars OVER at 'ln' against 'pLive'; null when either input is missing */`
- src/lib/mlb/live-quote-types.ts:60 — `* EV% of the Caesars UNDER at 'ln' — against '1 - pLive', priced off 'oppAm'.`
- src/lib/mlb/live-quote-types.ts:79 — `/** the book every czAm / evCz on this overlay is priced at (INSTRUCTION 67, 2026-09-17: DraftKings); overlays from before that date carry no stamp and are Caesars-priced */`
- src/lib/nfl/first-sunday-six-prices.json:4 — `"source": "Caesars public market: 267 selections captured 2026-09-20T08:53:22.719Z. Snapshot, not a live feed.",`
- src/lib/nfl/first-sunday-six-prices.json:5 — `"url": "https://sportsbook.caesars.com/americanfootball?id=007d7c61-07a7-4e18-bb40-15104b6eac92",`
- src/lib/pred-serialize.ts:25 — `cz: number | null; // Caesars price if offered`

##### Caesars (word) — UI (110 lines)

- app/board/page.tsx:86 — `INSTRUCTION 41 (2026-09-05, Josh: "run everything based on the current caesars lines; hide`
- app/board/page.tsx:87 — `the non-Caesars lines from ALL"): ALL keeps only the lines Caesars posts ('cz' priced) —` [x2]
- app/board/page.tsx:89 — `Caesars had 1.5) is hidden and counted in the footnote, never graded. The settle book`
- app/board/page.tsx:90 — `stays Caesars until Josh says he is in another state on DK / FD. INSTRUCTION 67 (2026-09-17):`
- app/board/page.tsx:259 — `Caesars price — off-book rows render with their best price and Josh's own ⓘ toggle`
- app/board/page.tsx:260 — `("offered at Caesars right now?") is the only thing that hides a pick. */`
- app/board/page.tsx:628 — `/* grades the SAME EV the mode displays — czEv at Caesars, bsEv under dk_fd — EXCEPT on a`
- app/board/page.tsx:698 — `The in-play pull asks Caesars only, so on a re-anchored row there IS no live DK/FD`
- app/board/page.tsx:779 — `in-play pull buys Caesars only, so there is no live best to put here (fix pass) */`
- app/board/page.tsx:1177 — `? "All-Star Game — ML, F3, F5, HR props & correct score · straight bets only at Caesars"`
- app/board/page.tsx:1179 — `…ce comparison · ${basisMode ? "priced at the DK/FD basis (Builder's selection price) · Caesars settles" : "consensus is multi-book, prices follow your selected sportsbook"} · ${SIM…`
- app/board/page.tsx:1721 — `* The Caesars price column on a row that may or may not be re-anchored (fix pass, 2026-09-11).`
- app/board/page.tsx:1723 — `* It was '<OddsCell odds={r.czOdds} book="caesars" />' unconditionally, so the pregame price sat`
- app/board/page.tsx:1730 — `if (!live) return <OddsCell odds={row.czOdds as never} book="caesars" />;`
- app/board/page.tsx:1738 — `<OddsCell odds={fmtAmerican(v.am) as never} book="caesars" />`
- app/builder/page.tsx:158 — `/* dk_fd: the primary EV badge is the SELECTION number (basis price); Caesars EV and the`
- app/builder/page.tsx:230 — `<OddsCell odds={(t.czOdds ?? "") as never} book="caesars" />`
- app/builder/page.tsx:718 — `/* morning honesty: how many slate games have Caesars-playable props RIGHT NOW —`
- app/builder/page.tsx:744 — `? "All-Star Game — a sized card of STRAIGHT bets (Caesars NV takes no ASG parlays)"`
- app/design/page.tsx:56 — `{ key: "cz", header: "DraftKings", numeric: true, sortValue: (r) => r.cz, cell: (r) => <OddsCell odds={r.cz} book="caesars" /> },`
- app/design/page.tsx:430 — `<OddsCell odds={movedOdds - 12} book="caesars" />`
- app/globals.css:9 — `per meaning: cerulean = +EV/wins, coral = −EV/losses, gold = the Caesars layer, lavender = live.`
- app/globals.css:37 — `--color-gold: #c79a3b; /* muted gold — Caesars layer only */`
- app/globals.css:510 — `INSTRUCTION 40 (2026-09-05) — the Caesars-grammar layer: odds pills in a`
- app/ledger/page.tsx:776 — `CLV compares your locked price to the last DraftKings price seen before first pitch (Caesars for cards locked before 2026-09-17) — the true closing`
- app/props/page.tsx:70 — `* PARLAY BUILDER (sandbox, 2026-07-24; UI rebuilt 2026-09-03) — a Caesars-style`
- app/props/page.tsx:81 — `* Nothing is ever invented: prices are real posted quotes (Caesars when Caesars` [x2]
- app/settings/page.tsx:77 — `<Pill variant={mode === "caesars_ev" ? "primary" : "ghost"} onClick={() => flipMode("caesars_ev")} className="!px-3 !py-1 text-[11px]">` [x2]
- app/sharp/page.tsx:122 — `// today's plays by the engine's true % — Caesars' price never changes WHICH`
- app/sharp/page.tsx:124 — `// allocator, where stakes are). caesars_ev is the legacy ranking.`
- app/sharp/page.tsx:125 — `const [selMode, setSelModeState] = useState<"dk_fd" | "ev_gated" | "probability" | "caesars_ev">("ev_gated");`
- app/sharp/page.tsx:153 — `if (selMode === "caesars_ev") {`
- app/sharp/page.tsx:164 — `// Caesars quote, must clear the core EV gate at the basis, and is ranked by`
- app/sharp/page.tsx:165 — `// EV at the basis. Gate-clearing picks Caesars doesn't offer are disclosed,`
- app/sharp/page.tsx:177 — `// a Caesars quote and must clear the core EV gate AT Caesars, ranked by czEv` [x2]
- app/sharp/page.tsx:364 — `: selMode !== "caesars_ev"`
- app/sharp/page.tsx:388 — `<OddsCell odds={r.czOdds as never} book="caesars" />`
- app/sharp/page.tsx:450 — `there is a real bet here again. What prints is the live line, the live Caesars`
- app/sharp/page.tsx:484 — `<OddsCell odds={v.am} book="caesars" />`
- app/sharp/page.tsx:599 — `: selMode !== "caesars_ev"`
- src/components/allstar/AllStarSurfaces.tsx:5 — `Caesars NV offers no parlays on this game, so there is no combo UI at all —`
- src/components/allstar/AllStarSurfaces.tsx:20 — `parseCaesarsBoard,`
- src/components/allstar/AllStarSurfaces.tsx:86 — `const parsed = parseCaesarsBoard(m.paste.board);`
- src/components/allstar/AllStarSurfaces.tsx:90 — `<Panel title="Paste the Caesars ASG board — one paste, every market">`
- src/components/allstar/AllStarSurfaces.tsx:92 — `Every All-Star market is posted in your Caesars Sportsbook NV app. ML, F3, F5, the total and the`
- src/components/allstar/AllStarSurfaces.tsx:93 — `main HR props already stream in live from Caesars&apos; feed — copy the rest of the board (correct`
- src/components/allstar/AllStarSurfaces.tsx:108 — `: '${m.book?.hr.length ?? 0} HR props already live from Caesars' feed — the paste adds correct score and the rest of the board'}`
- src/components/allstar/AllStarSurfaces.tsx:151 — `All prices are Caesars&apos;. HR props are one-sided (Over only), so there is no de-vig —`
- src/components/allstar/AllStarSurfaces.tsx:154 — `manufacture EV. Paste the rest of the Caesars HR board above to price every batter.`
- src/components/allstar/AllStarSurfaces.tsx:181 — `<Panel title="Market read — consensus fair vs the Caesars price">`
- src/components/allstar/AllStarSurfaces.tsx:210 — `Straight bets only — Caesars NV doesn&apos;t offer All-Star Game parlays. Exhibition baseball: tiny`
- src/components/allstar/AllStarSurfaces.tsx:230 — `return 'Consensus fair ${fmtP(l.market)} (${l.note}) vs ${fmtAm(l.odds)} at Caesars — fair price ${fairAm(l.blend)}.';`
- src/components/allstar/AllStarSurfaces.tsx:260 — `Playable edges — straight bets at the Caesars price`
- src/components/allstar/AllStarSurfaces.tsx:290 — `Straight bets only (no ASG parlays at Caesars NV). Informational only, not betting advice.`
- src/components/allstar/AllStarSurfaces.tsx:391 — `Caesars NV doesn&apos;t offer parlays on the All-Star Game, so every ticket below is a single.`
- src/components/allstar/AllStarSurfaces.tsx:438 — `body="The allocator sizes straight bets only — Caesars NV takes no All-Star parlays — and the stakes sum exactly to your numbers."`
- src/components/calc/CalcHero.tsx:11 — `* the page; everything below explains it. Gold accent (the Caesars layer): the calc is`
- src/components/cfb/CfbBuilder.tsx:222 — `/** the mean Caesars EV across the card's core tickets, or null on an empty core */`
- src/components/cfb/CfbGameCard.tsx:23 — `* CFB GAME CARD (INSTRUCTION 38, 2026-09-05; rebuilt on the Caesars grammar, INSTRUCTION 40):`
- src/components/cfb/CfbGameCard.tsx:26 — `* cells right, each Caesars' line over Caesars' price, +EV sides lit and listed with their grade,` [x2]
- src/components/cfb/CfbGameCard.tsx:36 — `williamhill_us: "Caesars",`
- src/components/cfb/CfbGameCard.tsx:55 — `/** A short book name for chips ("DK", "Caesars"); the feed's own title for books the map lacks. */`
- src/components/cfb/CfbGameCard.tsx:146 — `* The Caesars grammar (INSTRUCTION 40, 2026-09-05): the two teams stacked on the left — mark,`
- src/components/cfb/CfbGameCard.tsx:149 — `* home row). Every cell is Caesars' line above Caesars' price; a +EV side lights amber ("ev")` [x2]
- src/components/cfb/CfbGames.tsx:26 — `* the score, and ESPN's embedded line on each card as context. Each card is the Caesars-grammar`
- src/components/cfb/CfbGames.tsx:173 — `{/* the day at a glance — Caesars-style count chips on one scrolling strip */}`
- src/components/cfb/CfbPicksBoard.tsx:115 — `* sets and COMBOS now build from pregame AND in-game Caesars legs (the engine stamps`
- src/components/cfb/CfbPicksBoard.tsx:509 — `/* the desk's accent on the table's market chip and Caesars-line note (both literal class strings) */`
- src/components/cfb/CfbPicksBoard.tsx:570 — `<OddsCell odds={r.cz.price} book="caesars" />`
- src/components/cfb/CfbPicksBoard.tsx:615 — `…nday-six-hero"><span className="text-gold text-xs font-bold uppercase tracking-widest">Caesars exclusive · weekly promotion</span><h1 className="display text-2xl font-bold">First S…`
- src/components/cfb/CfbPicksBoard.tsx:787 — `/* ---------- TOP EDGES — the featured strip (INSTRUCTION 40, the Caesars "boost card" grammar) ----------`
- src/components/cfb/CfbPicksBoard.tsx:789 — `grade + EV, and "$10 wins $X" off Caesars' own decimal. A horizontal snap carousel — the`
- src/components/cfb/CfbPicksBoard.tsx:913 — `single-market sets + COMBOS draw from pregame AND in-game Caesars lines (INSTRUCTION 44);`
- src/components/cfb/CfbPicksBoard.tsx:1092 — `{/* phones: one snap carousel of compact tickets (the Caesars "boost" strip); ≥768px: the full slips in a grid.`
- src/components/cfb/CfbProps.tsx:70 — `* same game are allowed. Prices are posted quotes (Caesars, or the best book on the toggle);`
- src/components/cfb/CfbProps.tsx:75 — `* be slightly bigger"): every SIDES card is now the Caesars grammar on the shared OddsGrid —`
- src/components/cfb/CfbProps.tsx:131 — `/** the grid's three columns, in the Caesars order: Spread · Money · Total */`
- src/components/cfb/CfbProps.tsx:139 — `/** the row for (market, side) — the board keys rows by line, so prefer the one Caesars posts */`
- src/components/cfb/CfbProps.tsx:406 — `* (Caesars alone at 249.5 against a 245.5 consensus) has no fair, so it gets no leg — the muted`
- src/components/cfb/CfbSeason.tsx:62 — `* 2. THE SEASON TICKET BUILDER — Josh types the book's line and price (Caesars by default —`
- src/components/cfb/CfbSharp.tsx:329 — `{row.cz && <OddsCell odds={row.cz.price} book="caesars" />}`
- src/components/cfb/CfbSlip.tsx:43 — `/** "CZ" for Caesars, else the book's short tag */`
- src/components/cfb/CfbTicketCard.tsx:29 — `* Caesars "boost card" grammar (INSTRUCTION 40, 2026-09-05): bucket tag (CORE / FAVORITES`
- src/components/cfb/CfbTicketCard.tsx:30 — `* PARLAY — the favorites parlay is the amber card), name, the combined Caesars price as the`
- src/components/cfb/CfbTicketCard.tsx:31 — `* hero figure, one line per leg (team mark · label · market word · Caesars price), then the`
- src/components/cfb/CfbTicketCard.tsx:33 — `* parlay card uses; Won/Paid once graded), "% to hit", EV at Caesars and the S–F grade.`
- src/components/cfb/TeamMark.tsx:44 — `* Saints, Jaguars); the badge is now a near-white disc with a dark rim, the way Caesars' own`
- src/components/mlb/ProScoreboard.tsx:10 — `- CLV: our locked Caesars price vs the de-vigged cross-book close (the last`
- src/components/mlb/SimDesk.tsx:9 — `the Caesars quote when Selected book hangs the same number), first-5-innings and team`
- src/components/nfl/FirstSundaySix.tsx:31 — `…text-sm font-bold text-gold">First Sunday Six <span className="text-[10px] text-muted">Caesars exclusive</span></h2><span className="text-[10px] font-bold text-muted">Experimental …`
- src/components/nfl/FirstSundaySix.tsx:33 — `…xt-muted">{own?'Manual prices entered ${own.at}':date===snapshot.date?snapshot.source:'Caesars promotion prices have not been loaded for this week. Suggestions below use current Fi…` [x3]
- src/components/nfl/FirstSundaySix.tsx:38 — `…e="text-[11px] text-muted">Ranked by estimated chance to win the early-slate TD race. Confirm the player is offered in Caesars’ First Sunday Six market before using your token.</p>`
- src/components/nfl/FirstSundaySix.tsx:48 — `…me="text-left">Player / game</th>{showChance&&<th>Est. win chance</th>}{showPrice&&<th>Caesars promo</th>}{showGrade&&<th>Cash grade</th>}{showEv&&<th>Cash EV %</th>}</tr></thead><…`
- src/components/nfl/FirstSundaySix.tsx:58 — `…x] border-t border-white/10 pt-1"><summary className="cursor-pointer font-bold">Update Caesars promotion prices</summary><p className="py-1 text-muted">Paste one Player | +2200 per…` [x2]
- src/components/nfl/FirstSundaySix.tsx:66 — `… Promotion eligibility, token requirements, ties, expiry and caps must be confirmed in Caesars. The supplied $500K/$10 rules are not independently verified; last week’s five-winner…` [long line; 1 occurrences on this line; first shown]
- src/components/props/PlayerRow.tsx:61 — `* is not Caesars. Pressed = in the slip. A side the book has not posted renders`
- src/components/props/props-model.ts:6 — `* Nothing is ever invented: prices are real posted quotes (Caesars when Caesars` [x2]
- src/components/props/props-model.ts:66 — `caesars: "CZ",`
- src/components/props/props-model.ts:261 — `/** Expand game-market rows to both sides, away listed first (Caesars order). */`
- src/components/stats/ClvPanel.tsx:33 — `caesars_ev: "DraftKings EV",`
- src/components/ufc/UfcBoard.tsx:81 — `<OddsCell odds={fmtAm(r.side.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcBuilder.tsx:171 — `<OddsCell odds={fmtAm(p.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcCard.tsx:63 — `<OddsCell odds={fmtAm(s.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcProps.tsx:11 — `API on fight night), so prices are typed in from the Caesars app / window.`
- src/components/ufc/UfcSharp.tsx:100 — `<OddsCell odds={fmtAm(s.side.czOdds!) as never} book="caesars" />`
- src/components/ui/OddsCell.tsx:16 — `* 'book': "caesars" tints the price gold — the playable layer is always gold.`
- src/components/ui/OddsCell.tsx:24 — `book?: "caesars" | "best";`
- src/components/ui/OddsCell.tsx:40 — `const tone = book === "caesars" ? "text-gold" : "text-text";`
- src/components/ui/OddsGrid.tsx:8 — `* ODDS GRID (INSTRUCTION 40, 2026-09-05): the Caesars-style market grid a game card carries —`
- src/components/ui/StatTile.tsx:7 — `* pos = lime, neg = red-orange, gold = the Caesars layer, cfb = the College Football`

##### Caesars (word) — tests (527 lines)

- tests/autopsy-floors.test.ts:81 — `it("a basis-positive ticket that is negative at Caesars is refused with reason nv_tax", () => {`
- tests/board-live-anchor.test.ts:142 — `settleBook: "draftkings", // the route stamps its settle book (INSTRUCTION 67); an unstamped overlay would be repriced as a Caesars one`
- tests/board-live-anchor.test.ts:460 — `// the Caesars column; the basis column's guard is pinned in source instead of left unasserted`
- tests/board-overview-toggle.test.ts:28 — `"Engine v2 — consensus de-vigged probability vs the Caesars line; 10k-path sims on every pick; TOP 50 ranks on EV gated at the selection mode. " +`
- tests/board-scope.test.ts:39 — `/* INSTRUCTION 41 (2026-09-05, Josh: "run everything based on the current caesars lines; hide the`
- tests/board-scope.test.ts:40 — `non-Caesars lines from ALL") — the "O 0.5 H+R+RBI" rows he saw were Bovada / BetOnline lines`
- tests/board-scope.test.ts:41 — `Caesars did not post at that number. ALL now keeps only Caesars-priced lines and says how` [x2]
- tests/board-scope.test.ts:42 — `many it hid. The settle book stays Caesars until Josh says he is on DK / FD in another state. */`
- tests/board-scope.test.ts:43 — `it("INSTRUCTION 41: the ALL view drops lines Caesars does not post and counts them in the footnote", () => {`
- tests/board-selmode.test.ts:12 — `* caesars_ev and probability changed The Sharp and the Builder while the`
- tests/board-selmode.test.ts:29 — `it("ev_gated and caesars_ev rank by czEv; czEv-less rows sink, not vanish", () => {`
- tests/board-selmode.test.ts:30 — `for (const mode of ["ev_gated", "caesars_ev"] as const) {`
- tests/board-selmode.test.ts:49 — `for (const m of ["dk_fd", "ev_gated", "caesars_ev", "probability"] as const) {`
- tests/board-settled.test.ts:316 — `it("the Caesars column never prints an unlabelled pregame price on a re-anchored row", () => {`
- tests/board-settled.test.ts:318 — `expect(cz).toMatch(/if \(!live\) return <OddsCell odds=\{row\.czOdds as never\} book="caesars" \/>;/);`
- tests/board-settled.test.ts:322 — `// and the board uses it in BOTH Caesars price columns rather than calling OddsCell directly`
- tests/books-ind-gate.test.ts:134 — `const r = run(eng(), [ticket(0)], { selMode: "caesars_ev" });`
- tests/calibration.test.ts:234 — `// model BELOW consensus but still +EV at Caesars: a real combination, and the two`
- tests/cfb-card-ui.test.ts:9 — `* CFB GAME CARD + BUILDER TICKETS ON THE CAESARS GRAMMAR (INSTRUCTION 40, 2026-09-05).`
- tests/cfb-card-ui.test.ts:42 — `it("lights a +EV Caesars cell with the \"ev\" tone and lists the grade chip inline", () => {`
- tests/cfb-card.test.ts:13 — `* Caesars, so a thin card) and a SYNTHETIC slate built through the real model with prices`
- tests/cfb-card.test.ts:79 — `/** market at −250 / +210 on the home ML, Caesars off-market at −180 → the home ML is a short-priced +EV side */`
- tests/cfb-card.test.ts:82 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-card.test.ts:85 — `/** fair-priced everywhere: no side clears +2% at Caesars */`
- tests/cfb-card.test.ts:88 — `{ key: "williamhill_us", title: "Caesars", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },`
- tests/cfb-card.test.ts:91 — `/** the market is fair, Caesars quotes -200 on BOTH sides of everything: every side is graded F`
- tests/cfb-card.test.ts:95 — `{ key: "williamhill_us", title: "Caesars", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },`
- tests/cfb-card.test.ts:139 — `/** a leg's % EV at the Caesars price it was captured at (prob/push are already at Caesars' line) */` [x2]
- tests/cfb-card.test.ts:151 — `// named for what it holds: FAVORITES when ≥ half the legs are favorites at Caesars' line`
- tests/cfb-card.test.ts:172 — `it("only +2% sides under 2.60 at Caesars are on the card, and each is that game's best", () => {`
- tests/cfb-card.test.ts:181 — `expect(l.line).toBe(r.market === "ml" ? null : r.cz!.line); // the leg settles at Caesars' OWN line`
- tests/cfb-card.test.ts:228 — `* computed its candidate pool off the CORE gate alone — CFB_RULES.minEvPct (+2% EV at Caesars)`
- tests/cfb-card.test.ts:336 — `* it("NO-PLAY when every side is fair-priced (no +2% at Caesars), even with 8 games", () => {`
- tests/cfb-card.test.ts:345 — `* away ML at -2.84% EV at Caesars (decimal 2.30) — INSIDE CFB_RULES.fun.minEvPct = -3, i.e.`
- tests/cfb-card.test.ts:365 — `it("NO-PLAY when every side is graded F at Caesars: both buckets empty on a fully priced 8-game slate", () => {`
- tests/cfb-card.test.ts:380 — `// every home ML clears the gate: fair ≈ 0.70 vs Caesars −180`
- tests/cfb-card.test.ts:412 — `// two edged games, five fair-priced games (every side −EV at Caesars) and ONE game where Caesars is a hair` [x2]
- tests/cfb-card.test.ts:417 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-lock-route.test.ts:130 — `* 'pl:cfb:oddsgap:v1:<date>', stamped when a poke inside the window refuses because no Caesars`
- tests/cfb-lock-route.test.ts:517 — `* ahead and no usable Caesars price, write NOTHING and let the next poke retry.`
- tests/cfb-lock-route.test.ts:521 — `* zero Caesars prices the fetch "worked" but nothing on a game still ahead carries a`
- tests/cfb-lock-route.test.ts:522 — `* Caesars quote — the same hole wearing a different hat`
- tests/cfb-lock-route.test.ts:523 — `* A REAL no-bet day — Caesars prices present, nothing clearing +2% EV under maxDec — still`
- tests/cfb-lock-route.test.ts:532 — `/** Caesars prices present on every game, but no side clears the +2% gate */`
- tests/cfb-lock-route.test.ts:538 — `it("the fixture really does carry Caesars prices — the no-edge case is not a no-price case", () => {`
- tests/cfb-lock-route.test.ts:599 — `it("ODDS PRESENT but zero Caesars quotes on the games ahead: the same refusal, nothing written", async () => {`
- tests/cfb-lock-route.test.ts:1089 — `* of a Caesars price. Josh reads that string directly under the locked card`
- tests/cfb-lock-route.test.ts:1108 — `// ── day A: every poke lands inside the window and refuses for want of a Caesars price ──`
- tests/cfb-lock-route.test.ts:1200 — `it("the trap is real: a future-start game ESPN calls live, Caesars-quoted, and the day's only quoted game", () => {`
- tests/cfb-lock-route.test.ts:1205 — `expect(live[0].rows.some((r) => r.cz != null)).toBe(true); // Caesars quoted it`
- tests/cfb-lock-route.test.ts:1341 — `* The fixture slate with a +6% Caesars side on each named game — the evening lines that post`
- tests/cfb-lock-route.test.ts:1343 — `* already consider are lifted (playable, Caesars-quoted, decimal ≤ CFB_RULES.maxDec), so nothing`
- tests/cfb-lock-route.test.ts:2664 — `* poke was refused "the top-up cap is spent" and the day ended short though Caesars prices were`
- tests/cfb-model.test.ts:157 — `it("Caesars prices every fixture game's spread and total → those rows carry cz and are playable", () => {`
- tests/cfb-model.test.ts:168 — `it('Caesars posts no moneyline on the 40-point blowouts ("OFF") — the ML rows exist from other books, unplayable, ungraded', () => {`
- tests/cfb-model.test.ts:191 — `const nt = row(iu, "North Texas +40.5"); // consensus line +40.5 (fixture: DK/FD 40.5, Caesars 39.5, Pinnacle 41)`
- tests/cfb-model.test.ts:206 — `expect(row(ala, "Alabama -28").cz).toMatchObject({ price: -114, line: -28 }); // fixture: Caesars ALA -28 -114`
- tests/cfb-model.test.ts:207 — `expect(row(ala, "East Carolina +28").cz).toMatchObject({ price: -106, line: 28 }); // fixture: Caesars ECU +28 -106`
- tests/cfb-model.test.ts:212 — `it("kelly is a whole-dollar ¼-Kelly at Caesars capped at 2% of the bankroll, 0 without an edge", () => {`
- tests/cfb-model.test.ts:227 — `* CHECK 1 — Alabama −28 spread, books = Caesars + Pinnacle ONLY, FPI withheld.`
- tests/cfb-model.test.ts:228 — `* fixture prices: Caesars ALA −28 @ −114 / ECU +28 @ −106; Pinnacle ALA −28 @ −105 / ECU +28 @ −109.`
- tests/cfb-model.test.ts:229 — `* Caesars: imp 114/214 = 0.532710, 106/206 = 0.514563 → p_cover = 0.5086640`
- tests/cfb-model.test.ts:238 — `* EV at Caesars −114 (dec 1.877193) = 100·(0.4833998·0.877193 − (1 − 0.4833998 − 0.0241731)) = −6.8392 %`
- tests/cfb-model.test.ts:241 — `it("CHECK 1 · Alabama −28 / East Carolina +28 at Caesars (fixture prices, Pinnacle-weighted median)", () => {`
- tests/cfb-model.test.ts:263 — `// evBest: the best price at the consensus line among the two books — ECU +28: Caesars −106 beats Pinnacle −109`
- tests/cfb-model.test.ts:270 — `* fixture prices: Caesars O 52.5 −112 / U −109; Pinnacle O 52.5 −106 / U −110.`
- tests/cfb-model.test.ts:271 — `* Caesars: imp 112/212 = 0.528302, 109/209 = 0.521531 → p_over = 0.5032247 → μT_cz = 52.5 + 18·Φ⁻¹ = 52.645498`
- tests/cfb-model.test.ts:275 — `* EV at Caesars −112 (dec 1.892857) = 100·(0.4955476·0.892857 − 0.5044524) = −6.1999 %`
- tests/cfb-model.test.ts:276 — `* Under 52.5 at Caesars −109 (dec 1.917431): win = 0.5044524 → EV = −3.2747 %`
- tests/cfb-model.test.ts:278 — `it("CHECK 2 · Over / Under 52.5 at Caesars (fixture prices)", () => {`
- tests/cfb-model.test.ts:300 — `* Caesars posts no ML → evCz null. best home = DK −6500 (dec 1.0153846 > FD's 1.0142857):`
- tests/cfb-model.test.ts:305 — `it("CHECK 3 · Alabama / East Carolina ML at the best posted price (fixture prices, no Caesars ML)", () => {`
- tests/cfb-model.test.ts:327 — `* CHECK 4 — James Madison moneyline at Caesars, books = Caesars + Pinnacle h2h ONLY, FPI withheld.` [x2]
- tests/cfb-model.test.ts:328 — `* fixture prices: Caesars JMU −230 / LIB +188; Pinnacle JMU −228 / LIB +192.`
- tests/cfb-model.test.ts:329 — `* Caesars: imp 230/330 = 0.6969697, 100/288 = 0.3472222 → p_cz = 0.6674728`
- tests/cfb-model.test.ts:332 — `* JMU ML at Caesars −230 (dec 1.4347826): EV = 100·(0.6699404·0.4347826 − 0.3300596) = −3.8781 %`
- tests/cfb-model.test.ts:333 — `* Liberty ML at Caesars +188 (dec 2.88): EV = 100·(0.3300596·1.88 − 0.6699404) = −4.9428 %`
- tests/cfb-model.test.ts:335 — `it("CHECK 4 · James Madison / Liberty ML at Caesars (fixture prices)", () => {`
- tests/cfb-model.test.ts:406 — `it("a kicked-off game is never playable even with Caesars posted", () => {`
- tests/cfb-model.test.ts:445 — `it("rowProbAt re-evaluates the model at any line (the EV-at-Caesars'-own-line rule)", () => {`
- tests/cfb-picks-ui.test.ts:12 — `* gone. The Board itself borrows the Caesars grammar: a TOP EDGES snap carousel of featured`
- tests/cfb-picks-ui.test.ts:74 — `describe("CFB Board — the Caesars grammar", () => {`
- tests/cfb-picks-ui.test.ts:79 — `// the data decides the strip: only +EV rows with a Caesars quote, count off plusEv`
- tests/cfb-picks-ui.test.ts:89 — `it("a featured card shows the hero price, grade, EV and $10 wins $X off Caesars' own decimal", () => {`
- tests/cfb-picks-ui.test.ts:134 — `// THE CAESARS-MISSING RULE (2026-09-05, review-fixed copy): the lead counts only games WITH rows (fetched − noProps —`
- tests/cfb-picks-ui.test.ts:135 — `// "props for 46 of 46" beside "29 have none" read as a contradiction); the Caesars-missing count says "other books",`
- tests/cfb-picks-ui.test.ts:402 — `it("every pregame-category blurb says pregame and in-game Caesars lines; none says upcoming-only any more", () => {`
- tests/cfb-picks.test.ts:51 — `// an F-grade prop (never a leg) and one with no Caesars price (never a pick)`
- tests/cfb-picks.test.ts:158 — `/** market −250 / +210 on the home ML, Caesars off-market at −180 → a ~70 % side priced +EV at Caesars.` [x2]
- tests/cfb-picks.test.ts:159 — `Caesars' spread / total at even money (2026-09-05, INSTRUCTION 42 benchmark): at −110 those legs`
- tests/cfb-picks.test.ts:163 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-picks.test.ts:188 — `it("'all' is every playable side + prop with a Caesars price, and nothing else", () => {`
- tests/cfb-picks.test.ts:199 — `it("each category is ranked S → F, then EV at Caesars descending", () => {`
- tests/cfb-picks.test.ts:222 — `it("ev = 100·(Π prob · dec − 1), am from dec, dec = Π Caesars decimals", () => {`
- tests/cfb-picks.test.ts:251 — `it("every leg is a Caesars-priced row with EV ≥ minLegEvPct (never an F)", () => {`
- tests/cfb-picks.test.ts:286 — `it("SAFER on the fixture: no SIDE is ≥ 58 % to hit AND ≥ −3 % EV at Caesars (the −1700 favorites sit near −5 %), so every SAFER leg is a prop (pool widened to props 2026-09-05 — …` [x2]
- tests/cfb-picks.test.ts:454 — `it("live rows are graded on the EV at Caesars like any row, with kelly null and playable false, status live, a Caesars price always", () => {` [x2]
- tests/cfb-picks.test.ts:589 — `it("every set ticket obeys the leg rules: Caesars-priced, EV ≥ minLegEvPct when gated (else ≥ setFloorEvPct, single-market sets only), no doubled market on a game, no doubled pla…`
- tests/cfb-picks.test.ts:684 — `// Caesars' price: the fair price nudged ±6 % so the EV spreads across the grades`
- tests/cfb-picks.test.ts:757 — `it("every pick on the board is graded: live rows counted, every Caesars-priced side and prop from a live or upcoming game is a pick", () => {`
- tests/cfb-picks.test.ts:846 — `/** 6 upcoming games × 12 Caesars anytime-TD rows. Games 0–2: players 0 and 1 clear the −3 gate —`
- tests/cfb-picks.test.ts:848 — `tier-2 band (−4 … −11 %, Caesars' anytime-TD shade); players 10–11 fall below the −12 floor and`
- tests/cfb-picks.test.ts:904 — `it("the fixture is the prod shape: 72 Caesars ATD rows, exactly 6 clear −3, 60 sit in the tier-2 band, 12 are below the floor", () => {`
- tests/cfb-picks.test.ts:961 — `expect(t.gated).toBe(true); // the synthetic board's Caesars sides all clear −3, so no tier-2 side ever enters`
- tests/cfb-picks.test.ts:1009 — `Prod at 16:55 PT: Caesars anytime TD existed ONLY on two live games and the ANYTIME TD set`
- tests/cfb-picks.test.ts:1013 — `describe("INSTRUCTION 44 — in-game legs in the single-market sets (the only Caesars ATD rows are on live games)", () => {`
- tests/cfb-picks.test.ts:1017 — `/** the prod shape: Caesars ATD rows on the two live games only — nothing pregame */`
- tests/cfb-picks.test.ts:1023 — `it("the fixture is the prod shape: 24 Caesars ATD rows, all on the two live games, four of them tier 1", () => {`
- tests/cfb-props-route.test.ts:36 — `* cz rule — a game with rows and a market with no Caesars quote re-checks every 30 min inside`
- tests/cfb-props-route.test.ts:193 — `// THE CAESARS-MISSING RULE (2026-09-05): a 30-min re-check inside 4 h of kickoff — shorter than the 2 h carry, longer than the live window`
- tests/cfb-props-route.test.ts:927 — `* THE CAESARS-MISSING RULE (2026-09-05). Josh, verbatim: "It's still only showing ANYTIME TD picks for`
- tests/cfb-props-route.test.ts:930 — `* DK / FD anytime-TD rows and NO Caesars quote on any row — priced once before Caesars posted, then` [x2]
- tests/cfb-props-route.test.ts:935 — `describe("THE CAESARS-MISSING RULE (2026-09-05) — a 30-min re-check inside 4 h of kickoff", () => {`
- tests/cfb-props-route.test.ts:963 — `it("czMissingDue (pure): upcoming + Caesars-missing (the caller's market verdict) + inside 4 h + stamp older than 30 min — and nothing else", () => {`
- tests/cfb-props-route.test.ts:968 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, false, IN)).toBe(false); // Caesars on every market it has (or no rows at all)`
- tests/cfb-props-route.test.ts:981 — `…t("czMissingGameIds (pure, review fix): keyed on the MARKET — a game is missing when some market with rows has no Caesars quote on any of them; zero rows is never missing", () => {`
- tests/cfb-props-route.test.ts:985 — `{ gameId: "a", market: "anytime_td" as const, cz: null }, // Caesars yardage, no Caesars anytime TD yet → missing` [x2]
- tests/cfb-props-route.test.ts:987 — `{ gameId: "b", market: "pass_yds" as const, cz: null }, // one Caesars row on the market is enough → not missing`
- tests/cfb-props-route.test.ts:988 — `{ gameId: "c", market: "anytime_td" as const, cz: null }, // no Caesars at all → missing`
- tests/cfb-props-route.test.ts:995 — `it("propsCoverage (pure): czMissing = priced upcoming games with rows and a Caesars-less market; noProps = priced games with zero rows; unpriced games count in neither", () => {`
- tests/cfb-props-route.test.ts:1020 — `it("a fresh pre-kick pull reports czMissing 0 / noProps 0 on the synthetic fixture (every game has Caesars rows)", async () => {`
- tests/cfb-props-route.test.ts:1029 — `it("a stripped game (other books' rows, no Caesars) stamped 35 min ago, 3 h before kickoff, is re-fetched — ALONE, bypassing the data cache — even though the board as a whole is …`
- tests/cfb-props-route.test.ts:1039 — `// with the very body it re-pulls to replace, landing Caesars one interval (~60 min) late; the re-pull bypasses it`
- tests/cfb-props-route.test.ts:1046 — `expect(body.ttlSec).toBe(CFB_PROPS.revalidateSec); // the board's header window is unchanged once nothing is Caesars-missing`
- tests/cfb-props-route.test.ts:1047 — `expect(body.czMissing).toBe(0); // the re-pull found Caesars rows (the fixture posts them)`
- tests/cfb-props-route.test.ts:1087 — `it("an EMPTIED upcoming game (zero stored rows) counts as noProps and is NOT Caesars-missing: inside 4 h it stays on the 2 h empty-event hold (review fix — 29 of 46 priced games …`
- tests/cfb-props-route.test.ts:1095 — `expect(first.body.ttlSec).toBe(CFB_PROPS.revalidateSec); // no Caesars-missing game: the 2 h window stands`
- tests/cfb-props-route.test.ts:1117 — `it("a MARKET-keyed miss (review fix): a game with Caesars yardage props but no Caesars anytime TD is counted AND re-checked — the rule is per market, not per game", async () => {` [x2]
- tests/cfb-props-route.test.ts:1123 — `expect(fresh.rows.some((r) => r.gameId === G && r.market !== "anytime_td" && r.cz)).toBe(true); // Caesars IS on its other markets`
- tests/cfb-props-route.test.ts:1128 — `expect(first.body.czMissing).toBe(1); // under a per-game "any Caesars row" count this read 0 while the ANYTIME TD set lacked G`
- tests/cfb-props-route.test.ts:1197 — `it("LIVE AGE GATE (review fix): a Caesars-missing game turning due skips rail 1 but does NOT re-queue a live game re-priced 1 min ago — only the due game is fetched", async () =>…`
- tests/cfb-props-route.test.ts:1228 — `it("cache per game on one pre-kick pull: the Caesars-missing re-check bypasses the data cache, the 2 h-expired game rides the pull's 7200 — and the re-check is fetched FIRST", as…`
- tests/cfb-props-route.test.ts:1244 — `it("need is ordered live → never priced → Caesars-missing → 2 h-expired, so a tight budget buys the cheapest wins first", async () => {`
- tests/cfb-props-route.test.ts:1270 — `// the re-pulls (the live game already on the board, the Caesars-missing re-check) bypass the data cache; the`
- tests/cfb-props-route.test.ts:1281 — `expect(two.czMissing).toBe(1); // G still has no Caesars row on the answer`
- tests/cfb-props-route.test.ts:1292 — `// G emptied and its own 2 h carry expired (a zero-row game is never due under the Caesars-missing rule — review fix)`
- tests/cfb-props-ui.test.ts:68 — `it("a prop leg exists only at the row's own line — a Caesars quote at another line is the dashed cell, never a slip EV", () => {`
- tests/cfb-props-ui.test.ts:73 — `it("keeps the Caesars / Best price toggle on props", () => {`
- tests/cfb-props-ui.test.ts:81 — `slightly bigger". The SIDES card is now the shared OddsGrid (Caesars grammar); props are`
- tests/cfb-props-ui.test.ts:83 — `describe("CfbProps — the Caesars-grammar cards (INSTRUCTION 40)", () => {`
- tests/cfb-props-ui.test.ts:159 — `it("THE CAESARS-MISSING RULE (2026-09-05, review-fixed copy): the footnote leads with the games that HAVE rows, names the Caesars-missing games and the no-props games, only when …` [x2]
- tests/cfb-props-ui.test.ts:163 — `// "N games post player props at other books but no Caesars line yet — re-checked every 30 min inside 4 h of kickoff" (rows come from any US book, never "DK/FD" alone)`
- tests/cfb-props.test.ts:56 — `/* THE CAESARS-MISSING RULE (2026-09-05) — Josh: "They are still 12 games today that haven't started`
- tests/cfb-props.test.ts:58 — `game with rows and some market with no Caesars quote is re-asked every 30 min inside 4 h of`
- tests/cfb-props.test.ts:139 — `// Caesars sits alone at 249.5. Consensus line = median(249.5, 245.5, 245.5, 245.5) = 245.5.`
- tests/cfb-props.test.ts:148 — `it("quotes Caesars at ITS OWN line; a line no second book posts has a price but no EV, grade or Kelly", () => {`
- tests/cfb-props.test.ts:167 — `it("EV at Caesars uses the fair at Caesars' line, then grades it", () => {` [x2]
- tests/cfb-props.test.ts:185 — `// Katin Houser rush yds: Caesars alone at 22.5`
- tests/cfb-props.test.ts:226 — `const payload = { id: "x", bookmakers: [ou("draftkings", "DraftKings", -130, 100), ou("williamhill_us", "Caesars", -105, -115)] };`
- tests/cfb-props.test.ts:237 — `const mirrored = { id: "x", bookmakers: [ou("draftkings", "DraftKings", 100, -130), ou("williamhill_us", "Caesars", -115, -105)] };`
- tests/cfb-props.test.ts:251 — `{ key: "williamhill_us", title: "Caesars", markets: [{ key: "player_anytime_td", outcomes: [`
- tests/cfb-props.test.ts:262 — `it("a +EV Caesars price gets a quarter-Kelly stake capped at 2% of the bankroll; not playable after kickoff", () => {`
- tests/cfb-props.test.ts:268 — `{ key: "williamhill_us", title: "Caesars", markets: [{ key: "player_receptions", outcomes: [`
- tests/cfb-props.test.ts:440 — `it("keeps upcoming games with an odds event and a Caesars side, kickoff then rank order", () => {`
- tests/cfb-props.test.ts:455 — `it("caps at max and flags it; excludes kicked-off-but-still-'upcoming' games and games without a Caesars price", () => {`
- tests/cfb-props.test.ts:495 — `// a live game still needs a Caesars price and an odds event`
- tests/cfb-props.test.ts:576 — `// THE CAESARS-MISSING RULE (2026-09-05, review fix): Next's data cache is stale-while-revalidate, so a re-pull`
- tests/cfb-props.test.ts:577 — `// (a Caesars-missing re-check, or a live game already on the board) bypasses it with cache: "no-store";`
- tests/cfb-store-convergence.test.ts:65 — `/** synthetic ticket: one ML leg on 'gkey', whole-dollar stake, Caesars -110 as the captured price */`
- tests/cfb-store.test.ts:88 — `/* synthetic ticket: one ML leg, stake in whole dollars, Caesars -110 as the captured price */`
- tests/chain-tools.test.ts:101 — `const c = predCensus({ records: [{ src: "cron", selMode: "ev_gated" }, { src: "client", selMode: "caesars_ev" }] });`
- tests/chain-tools.test.ts:103 — `expect(c.byMode["client/caesars_ev"]).toBe(1);`
- tests/chain-tools.test.ts:119 — `records: { "a|1": { src: "cron", selMode: "ev_gated" }, "b|2": { src: "client", selMode: "caesars_ev" } },`
- tests/chain-tools.test.ts:126 — `expect(c.byMode["client/caesars_ev"]).toBe(1);`
- tests/clv-core.test.ts:68 — `it("markets pulled per game are exactly the legs' markets plus the Caesars ladders", () => {`
- tests/clv-core.test.ts:79 — `describe("sightProp — Caesars close + hand-computed consensus fair", () => {`
- tests/clv-core.test.ts:108 — `it("over leg: Caesars price + median de-vigged fair across books", () => {`
- tests/clv-core.test.ts:122 — `it("Caesars alternate ladder fills the price when the standard market lacks CZ; fair needs 2+ books", () => {`
- tests/clv-core.test.ts:164 — `it("ml_home: Caesars side price, fair from both books", () => {`
- tests/cz-sync.test.ts:15 — `* THE CAESARS-TOGGLE SYNC (2026-08-10, Josh's word: "yes sync the toggle across`
- tests/dkfd-basis.test.ts:10 — `(tie → DK). Caesars is display + settlement only. The consensus fair probability`
- tests/dkfd-basis.test.ts:13 — `The NV-blindness proof: perturb Caesars/BetMGM quotes by scaling both sides'`
- tests/doubleheader.test.ts:128 — `it("props are kept per game — same player, both games, different Caesars prices", () => {`
- tests/engine-units.test.ts:4 — `* Caesars void rules against the real boxscore 822954, and void-reprice math.`
- tests/engine-units.test.ts:125 — `describe("grading — Caesars void rules on real boxscore 822954", () => {`
- tests/engine2-allstar.test.ts:10 — `parseCaesarsBoard,`
- tests/engine2-allstar.test.ts:46 — `title: "Caesars",`
- tests/engine2-allstar.test.ts:86 — `expect(book.mlF3).toHaveLength(1); // Caesars only — real shape tonight`
- tests/engine2-allstar.test.ts:147 — `it("routes a raw one-paste Caesars board dump into the right markets", () => {`
- tests/engine2-allstar.test.ts:163 — `const b = parseCaesarsBoard(dump);`
- tests/first-sunday-six-ui.test.tsx:28 — `expect(html).not.toContain('<th>Caesars promo</th>');`
- tests/first-sunday-six-ui.test.tsx:40 — `expect(html).not.toContain('<th>Caesars promo</th>');`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:235 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1529 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2257 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2874 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4148 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5352 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6346 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7878 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8442 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9610 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10928 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11310 — `"title": "Caesars",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:12 — `"title": "Caesars",`
- tests/fixtures/fix39/odds.json:1 — `…nt":8.5},{"name":"Under","price":103,"point":8.5}]}]},{"key":"williamhill_us","title":"Caesars","last_update":"2026-07-10T05:39:06Z","markets":[{"key":"h2h","last_update":"2026-07-…` [long line; 15 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…iption":"Ryan Weathers","price":-165,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-10T05:40:20Z","outcomes"…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…ption":"Shota Imanaga","price":-106,"point":17.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-10T05:41:11Z","outcomes"…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…scription":"Aaron Nola","price":-125,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_hits_runs_rbis","last_update":"2026-07-10T05:40:38Z","outc…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…iption":"Brandon Young","price":-130,"point":4.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-10T05:41:03Z","outcomes"…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…tion":"Sandy Alcantara","price":-140,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-10T05:40:24Z","outcomes"…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…ion":"Braxton Ashcraft","price":-150,"point":6.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-10T05:40:34Z","outcomes"…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…"Ryan Weathers", "price": -165, "point": 5.5}]}]}, {"key": "williamhill_us", "title": "Caesars", "markets": [{"key": "batter_home_runs", "last_update": "2026-07-10T05:40:20Z", "out…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:326 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:362 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:380 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:398 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:416 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:434 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:452 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:487 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:503 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:505 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:523 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:541 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:559 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:577 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:595 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:611 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:613 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:631 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:649 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:684 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:700 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:720 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:738 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:756 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:774 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:792 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:810 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:828 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:846 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:864 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:882 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:900 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:918 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:936 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:954 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:972 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:990 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1008 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1026 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1043 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1060 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1077 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1094 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1111 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1128 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1145 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1162 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1179 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1196 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1561 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1579 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1595 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1615 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1633 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1651 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1669 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1687 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:1720 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1738 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1756 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1774 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1792 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1810 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1828 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1846 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1864 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1882 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1900 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1918 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1936 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1954 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1972 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:1990 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2008 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2026 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2044 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2061 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2078 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2095 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2112 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2129 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2521 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2537 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2539 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2555 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2557 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2573 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2575 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2591 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2593 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2609 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2611 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2627 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2629 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:2667 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2685 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2703 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2721 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2739 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2757 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2775 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2793 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2811 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2829 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2847 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2865 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2883 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2901 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2919 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2937 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2955 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2972 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:2989 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3006 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3023 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3040 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3057 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3074 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3091 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3108 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3125 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3142 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3249 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3251 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3267 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3269 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3285 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3287 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3303 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3305 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3320 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3322 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3338 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3340 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3356 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3358 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3374 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3376 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3411 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3429 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3658 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3676 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:3692 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3727 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3747 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3765 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3783 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3801 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3819 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3837 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3855 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3873 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3891 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3909 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3927 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3945 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3963 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3981 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:3999 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4017 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4034 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4051 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4068 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4085 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4102 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4119 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4136 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4153 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4170 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4187 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4204 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4221 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4238 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4588 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4608 — `"uBook": "Caesars",`
- tests/fixtures/gen-pool.json:4626 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4644 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4662 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4680 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4698 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4716 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4734 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4752 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4770 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4788 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4806 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4824 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4842 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4860 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4878 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4896 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4914 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4931 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4948 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4965 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4982 — `"oBook": "Caesars",`
- tests/fixtures/gen-pool.json:4999 — `"oBook": "Caesars",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:56 — `"title": "Caesars",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:571 — `"title": "Caesars",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:629 — `"title": "Caesars",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…,"price":150,"line":null,"dec":2.5},"williamhill_us":{"book":"williamhill_us","title":"Caesars","price":146,"line":null,"dec":2.46},"fanduel":{"book":"fanduel","title":"FanDuel","p…` [long line; 38 occurrences on this line; first shown]
- tests/fixtures/nfl/odds-2026-09-13.json:67 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:291 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:515 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:739 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:963 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:1187 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:1411 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:1635 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:1859 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:2083 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:2307 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:2531 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-2026-09-13.json:2755 — `"title": "Caesars",`
- tests/fixtures/nfl/odds-event-props-401872925.json:12 — `"title": "Caesars",`
- tests/football-gen.test.ts:186 — `it("Caesars alone at 249.5 against a 245.5 consensus: no fair at that line, so no leg", () => {`
- tests/football-gen.test.ts:187 — `/* the fixture's real shape: Caesars posts -110 at 249.5 while the consensus line is 245.5,`
- tests/football-gen.test.ts:200 — `it("a player with no Caesars quote at all is never invented one", () => {`
- tests/football-gen.test.ts:207 — `it("so the whole Caesars pass_yds column is empty — 4 rows scanned, 0 legs, an honest no-rows", () => {`
- tests/football-gen.test.ts:218 — `/* Katin Houser's 22.5 rush_yds pair has a Caesars quote AT ITS OWN LINE and still no fair —`
- tests/football-gen.test.ts:312 — `it("each price column is filtered on ITS OWN price (Caesars +320 vs best +330)", () => {`
- tests/football-gen.test.ts:471 — `told Josh Caesars had barred legs nobody barred. That counter is the BOOK's flag and`
- tests/football-gen.test.ts:516 — `/* the Caesars pass_yds column is four dashes — an empty pool, and 'no-rows' is the truth */`
- tests/fun-hr.test.ts:13 — `* prob + Caesars price, never invented), sorted most-likely-first so the longshot is`
- tests/fun-ladder.test.ts:8 — `* Caesars price, ≤2 legs per team, one leg per player, leg-disjoint from everything`
- tests/fun-ladder.test.ts:81 — `it("skips rows without a Caesars price, with prob ≤ 0, or with no team; seats 8 when only 8 qualify", () => {`
- tests/games.test.ts:152 — `it("matches ML rows by team name, keeps the best price + book, and carries the Caesars price", () => {`
- tests/grade.test.ts:55 — `expect(src).toMatch(/gradeFromEv\(.*\bczEv\b/s); // caesars mode grades czEv`
- tests/helpers/fixture-env.ts:27 — `// one event carries a synthetic Caesars alternate-ladder (parser test double)`
- tests/helpers/settle-book.ts:2 — `* INSTRUCTION 67 (2026-09-17): the settle book moved from Caesars ('williamhill_us') to`
- tests/helpers/settle-book.ts:4 — `* and hand-checked with Caesars as the settle book, so the tests that price through the real`
- tests/helpers/settle-book.ts:11 — `draftkings: { key: "williamhill_us", title: "Caesars" },`
- tests/hrr-suspension-coupling.test.ts:72 — `* 'caesars_ev' are DEVICE-REACHABLE in ~2 taps (Settings → mode) and the suspension`
- tests/legacy-harness/README.md:17 — `(Caesars alternate-ladder markets); everything else in 'fix39'/'fix40' is real captured`
- tests/legacy-harness/baseline40_env.js:41 — `/* one event carries a synthetic Caesars alternate-ladder (parser test double) */`
- tests/legacy-harness/int40card.js:8 — `chk("playable pregame pool exists",pool.length>10,pool.length+" Caesars-playable tickets");`
- tests/legacy-harness/int40card.js:48 — `chk("FUN $"+amt+" all legs Caesars-priced, no core overlap",`
- tests/legacy-harness/int40cz.js:1 — `/* Feature-1 integration probe: Caesars fields populate from real fixtures */`
- tests/legacy-harness/int40cz.js:8 — `chk("Caesars ML captured per game",mlCz>=8,mlCz+"/"+slate.game_odds.length+" games");`
- tests/legacy-harness/int40cz.js:10 — `chk("Caesars RL captured (modal point only)",rlCz>=5,rlCz+" games");`
- tests/legacy-harness/int40cz.js:14 — `chk("Caesars prop prices captured",pCz>0,pCz+"/"+pRows+" prop rows have a Caesars quote");` [x2]
- tests/legacy-harness/int40cz.js:16 — `Caesars price from batter_hits_alternate; consensus and best price stay untouched`
- tests/legacy-harness/int40cz.js:23 — `chk("hits rows priced at Caesars via the alternate ladder",altHits>=10,altHits+" rows (over-only, as Caesars posts them)");` [x2]
- tests/legacy-harness/int40cz.js:35 — `chk("playable rows carry czEv/czOdds/czKellyF",fails.length===0,withCz+" playable / "+noCz+" not-at-Caesars");`
- tests/legacy-harness/int40cz.js:37 — `/* sanity: Caesars EV never better than best-price EV by construction */`
- tests/legacy-harness/int40cz.js:48 — `chk("tickets re-priced at Caesars",czTix>0,czTix+" playable / "+unavTix+" unavailable_at_book");`
- tests/legacy-harness/int40cz.js:50 — `…f(sample)print("sample playable pick: "+sample.label+" "+sample.sub+" "+sample.czOdds+" @ Caesars · czEV "+sample.czEv+"% · vs fair "+sample.czEdge+"% · engine EV "+sample.ev+"%");`
- tests/legacy-harness/int40cz.js:52 — `if(st)print("sample playable ticket: "+st.name+" "+st.czOdds+" @ Caesars (best-price "+st.odds+") czEV "+st.czEv+"%");`
- tests/legacy-harness/int40lock.js:21 — `chk("every ticket snapshot has Caesars price + legs",e&&e.core.concat(e.funT).every(function(t){`
- tests/legacy-harness/unit40grade.js:20 — `/* Caesars void rules */`
- tests/m25-archive.test.ts:70 — `for (const mode of ["probability", "caesars_ev", "ev_gated"]) {`
- tests/mlb-live-props-route.test.ts:69 — `const E2 = "f308816130f3007f771929f15d62862c"; // MIL @ PIT — DK + FD only, NO Caesars`
- tests/mlb-live-props-route.test.ts:451 — `it("re-anchors Josh's exact case: over 0.5 H+R+RBI becomes the live 3.5 at Caesars -145", async () => {`
- tests/mlb-live-props-route.test.ts:468 — `it("breaks a 2-2 modal tie to the Caesars point", async () => {`
- tests/mlb-live-props-route.test.ts:471 — `// Soto: Caesars 2.5, DK 1.5, FD 1.5, Fanatics 2.5 — tied, so the book Josh settles at wins`
- tests/mlb-live-props-route.test.ts:487 — `it("prices a game with no Caesars quote, and refuses to invent an EV for it", async () => {`
- tests/mlb-live-props-route.test.ts:751 — `it("settles on Caesars: the settle book decides the tie and owns czAm", () => {`
- tests/mlb-live-props-route.test.ts:846 — `it("evOpp is the Caesars UNDER at the live line, priced against 1 - pLive", async () => {`
- tests/mlb-live-props-route.test.ts:869 — `it("no Caesars UNDER price means no Under EV — nothing is derived from the Over", async () => {`
- tests/mlb-market-phases.test.ts:12 — `const row:PropBoardRow={p:"Test Hitter",tm:"NYY",ln:.5,lkey:"testhitter|batter_hits|0.5",o:-120,u:100,oBook:"Caesars",uBook:"Caesars",cz:{o:-120,u:100},pO:70,fO:55,books:2};` [x2]
- tests/mlb-market-phases.test.ts:56 — `const books=[{key:"williamhill_us",title:"Caesars",price:-120},{key:"draftkings",title:"DraftKings",price:130}];`
- tests/mlb-market-phases.test.ts:58 — `const captured=attachBookQuotes(data,[event],'williamhill_us');/* the row's cz is Caesars-priced */expect(captured.categories).toStrictEqual(data.categories); // the settle-book …`
- tests/nfl-engine.test.ts:99 — `it("every game has Caesars on spread and total (playable rows) and the ML from four books; kelly ≤ 2 % of the bankroll", () => {`
- tests/nfl-engine.test.ts:126 — `/** The synthetic odds with every Caesars (williamhill_us) price improved by 'pct' % — a TEST`
- tests/nfl-engine.test.ts:129 — `function sharpenCaesars(events: Array<Record<string, unknown>>, pct: number): Array<Record<string, unknown>> {`
- tests/nfl-engine.test.ts:142 — `const b = nflBoard({ oddsEvents: sharpenCaesars(ODDS, 8) });`
- tests/nfl-engine.test.ts:156 — `it("with Caesars 8 % better than the consensus the engine seats core tickets and the fun parlay", () => {`
- tests/nfl-engine.test.ts:160 — `// every core leg is one of the board's playable rows at its Caesars price, with the model's probability at lock`
- tests/nfl-engine.test.ts:168 — `// prob is the model's win probability at the Caesars line (re-evaluated when cz's line differs from the consensus)`
- tests/nfl-lock-route.test.ts:80 — `* decimals (Steelers ML: fair 0.58805 vs mkt 0.58814, measured 2026-09-08), and once Caesars'`
- tests/nfl-lock-route.test.ts:88 — `* per game — 'sweetened()' richens the Caesars price on the favourite's moneyline of the first`
- tests/nfl-lock-route.test.ts:177 — `it("13 scheduled games, all on PT date 2026-09-13, the synthesized odds carrying americanfootball_nfl and a Caesars quote", () => {`
- tests/nfl-lock-route.test.ts:191 — `// every game carries at least one priced, playable Caesars row at the window`
- tests/nfl-lock-route.test.ts:418 — `// and the fixture really is what the docblock says: nothing clears +2% at Caesars`
- tests/nfl-props-route.test.ts:21 — `* fixture (NFL team names, four books incl. Caesars) through the pure model`
- tests/nfl-props-route.test.ts:178 — `it("the store's retention and Caesars-missing windows are the CFB constants — both leagues carry the same figures (props-store.ts reads CFB_PROPS for them)", () => {`
- tests/nfl-props-route.test.ts:205 — `it("all 13 games match an odds event with a Caesars side price, so every one is a props candidate", () => {`
- tests/nfl-props-route.test.ts:221 — `// Caesars is on the payload, so rows are playable pre-kick and sized at ¼-Kelly of the bankroll, capped at 2 % = $50`
- tests/nfl-store.test.ts:309 — `/* the SYNTHESIZED odds fixture prices no +2% side at Caesars, so the core is empty on this`
- tests/odds-hardening.test.ts:112 — `* No '_alternate' ladder is requested in play: the three ladders are pre-kick Caesars milestone`
- tests/paper-deficit.test.ts:20 — `* 3. NO RETRY: fires happen at lineup-readiness, but Caesars posts evening props near`
- tests/paper-epoch.test.ts:34 — `* forced onto the remaining leg-disjoint pool via the legacy caesars_ev allocator`
- tests/paper-epoch.test.ts:143 — `it("lock-card deploys PAPER.daily with a caesars_ev top-up, forced-flagged, and stakes PAPER.fun via shFunPick", () => {`
- tests/paper-epoch.test.ts:147 — `(CORE_RULES.forcedSelMode = "probability") — the $915 caesars_ev forced pass ran`
- tests/paper-epoch.test.ts:152 — `expect(src).not.toMatch(/selMode:\s*"caesars_ev"/);`
- tests/parlay-gen-ui.test.ts:168 — `expect(out).not.toMatch(/(Caesars|FanDuel|Book|Sportsbook)-priced legs only/);`
- tests/parlay-gen-ui.test.ts:414 — `const spec = { ...SPEC, sides: "u" as const, czOnly: true, pricingBook: "CZ", modelOnly: true }; // the fixture pool predates INSTRUCTION 67 (Caesars-priced)`
- tests/parlay-gen.test.ts:67 — `pricingBook: "CZ", // tests/fixtures/gen-pool.json predates INSTRUCTION 67: its rows are Caesars-priced`
- tests/parlay-gen.test.ts:267 — `* 1.5 / 2.5 plus the Caesars alt ladder, so without it a "4-leg" is one man four times —`
- tests/parlay-gen.test.ts:361 — `it("…and when the Caesars-only filter is what emptied it, the failure names THAT instead", () => {`
- tests/parlay-gen.test.ts:503 — `it("sides, Caesars-only and model-only filters admit exactly what they claim", () => {`
- tests/parlay-gen.test.ts:510 — `/* the Caesars-only and model-only pools are thin, so these two widen the band rather`
- tests/picks-surface.test.ts:73 — `expect(src).not.toMatch(/rows=\{playable\}/); // the old Caesars-only filter is gone`
- tests/picks-surface.test.ts:74 — `expect(src).not.toMatch(/Not at Caesars \(/); // and so is the holdout drawer`
- tests/prop-board.test.ts:131 — `it("keeps the Caesars quote separate from the best-price-in-the-feed quote", () => {`
- tests/prop-board.test.ts:151 — `/* ---- Caesars milestone ladders ("2+ hits") — real posted lines the consensus`
- tests/prop-board.test.ts:154 — `describe("full prop board — Caesars ladders", () => {`
- tests/prop-board.test.ts:161 — `// give Caesars a ladder rung the standard market does not carry: "3+ hits"`
- tests/prop-lean.test.ts:57 — `expect(bookTag("caesars")).toBe("CZ");`
- tests/props-model.test.ts:72 — `expect(bookAb("caesars")).toBe("CZ");`
- tests/props-model.test.ts:80 — `describe("sidePrice — Caesars first, else the feed's best with its book tag", () => {`
- tests/props-model.test.ts:81 — `it("uses the Caesars quote when Caesars posts that side", () => {` [x2]
- tests/props-model.test.ts:86 — `it("falls back per side: a one-sided Caesars quote only covers that side", () => {`
- tests/props-model.test.ts:91 — `it("without Caesars, the feed's best price is labelled with its book", () => {`
- tests/scheduler-route.test.ts:834 — `note: "no Caesars price on any of the 11 games still ahead (the Odds API call failed or had no key) — nothing written, the next poke retries. A day is never locked NO-PLAY fo…`
- tests/sha-references.test.ts:47 — `handoff (ff4c6aa) — same class as 3fdd34b; '007d7c61' is the first segment of the Caesars event UUID in the First Sunday Six`
- tests/shadow-prices.test.ts:64 — `/* The fixture has ZERO model-priced TB O0.5 rows (its 0.5 rungs are Caesars ALT ladders,`
- tests/singles-counterfactual.test.ts:571 — `// Switching selMode to "caesars_ev" would ALSO have given the edge weight, but it`
- tests/singles-counterfactual.test.ts:647 — `// 'consCzEv' is null when the leg has no Caesars quote. Number(null) === 0, which would`
- tests/singles-counterfactual.test.ts:658 — `'\nPER-LEG consCzEv over ${cc.length} playable board rows with a Caesars quote' +`
- tests/sizing-discipline.test.ts:6 — `ev_gated (new default) admits only tickets clearing coreEvMin at the Caesars`
- tests/sizing-discipline.test.ts:117 — `// a ticket Caesars can't price (czEv null) never clears the gate`
- tests/sizing-discipline.test.ts:220 — `// the fixture slate prices all-negative at Caesars: ev_gated answers NO-PLAY, $0 recommended`
- tests/sizing-discipline.test.ts:228 — `// Correction 1 (2026-07-23): the fixture slate is BELOW ZERO at Caesars everywhere`
- tests/sportsbook.test.ts:21 — `…ive:false,markets:{batter_hits:[{p:'Player',tm:'AW',ln:.5,lkey:'player|batter_hits|0.5',o:120,oBook:'DraftKings',u:-130,uBook:'Caesars',cz:{o:-130,u:110},pO:50,fO:48,books:3}]}}]};`
- tests/sportsbook.test.ts:25 — `…nriched=attachBookQuotes(data,[event],'williamhill_us');/* the fixture's cz prices are Caesars' */const out=priceMlbBoard(enriched,'draftkings');expect(out.categories.ml[0].czOdds)…`
- tests/sportsbook.test.ts:37 — `it('Caesars-only display never falls back to a different book on an unavailable side',()=>{`
- tests/sportsbook.test.ts:50 — `it("Games moneylines use the chosen book, including Caesars, without a best-book fallback",()=>{`
- tests/sportsbook.test.ts:52 — `expect(priceMlbMoneylines(data,"williamhill_us")[0]).toMatchObject({odds:-150,cz:-150,book:"Caesars"});`
- tests/supplemental.test.ts:283 — `expect(s.am).toBe(-115); // the Caesars close`
- tests/sweep-covers-engine.test.ts:9 — `* requested canonical + 'SH_PROP_ALT' — Caesars posts its entire hits/K's ladders under`
- tests/ticket-payout.test.ts:12 — `it("pending: potential at the Caesars decimal, cents rounded once", () => {`
- tests/ticket-payout.test.ts:17 — `it("a confirmed NV price supersedes the Caesars quote (the ledger's old 'to win' rule)", () => {`
- tests/ui-overlay.test.ts:7 — `* shared Caesars-grammar primitives. The Overlay is the FPI pop-out ("covers 60% of the`

##### Caesars (word) — docs (232 lines)

- CLAUDE.md:45 — `> branch ('selMode ∈ {ev_gated, dk_fd}' AND not 'force'). In 'probability'/'caesars_ev', two taps`
- CLAUDE.md:89 — `…yer_anytime_td', yes/no like Anytime HR), Pass Yds/TDs, Rush Yds, Receptions, Rec Yds. Caesars ('williamhill_us') preferred, **falls back to any US book** with a note. Default game…`
- CLAUDE.md:110 — `…e 'pl:props:hit-window'), never a forecast — say so wherever they are shown. Chips are Caesars-tight (28–30px pills, gap-1); the exclude control is a 24px ghost ✕, never a full-wid…`
- CLAUDE.md:158 — `…V, CFB/NFL/MLB-live 'settleBook' constants). The legacy blob still names its variable 'CAESARS_KEY'; every 'createEngine' caller passes 'settlementBook: SETTLE_BOOK' and the facade…` [x5]
- CLAUDE.md:159 — `- **Caesars-only + bankroll + ledger layer (build 40, board v10 — per 'parlay_lab_caesars_bankroll_update_prompt.md'; HARD CONSTRAINT: generation untouched, proven by byte-identica…` [x2]
- CLAUDE.md:160 — `- **Caesars-only playable card**: ingestion additively captures Caesars ('CAESARS_KEY'='williamhill_us') ML/RL/prop prices ('*_cz', 'row.cz'; RL only at the engine's modal ±1.5);…` [x10]
- CLAUDE.md:161 — `…pure/deterministic/idempotent): DAILY $ ('pl_daily') spread over 'shCardPool' (pregame Caesars-playable PARLAYS+MIXED tickets, wrappers '{pl,src,idx}') — **¼-Kelly-proportional wei…` [x2]
- CLAUDE.md:163 — `…score-by-pk; legs graded via 'lkey' ('pnorm(player)|mkt|ln' or 'ml_/rl_ home/away'); **Caesars void rules**: batter not in starting lineup (battingOrder %100≠0 or substitute) → VOI…`
- CLAUDE.md:164 — `…kup (import never overwrites locked days). **CLV honest version** ('shClvSight'): last Caesars price seen pre-pitch, refreshed free on any slate pull + "📸 snapshot" button (paid); …`
- CLAUDE.md:829 — `…s ARCHIVE sweep ('tools/snapshot_props.py') requests only the six canonical keys while Caesars posts its whole hits/K's ladders under '*_alternate' (incl. the main lines) — 14 arch…`
- CLAUDE.md:972 — `L2388). 'consCzEv' on a one-sided Caesars leg is therefore the constant **−5.66%**, which`
- CLAUDE.md:974 — `- 'batter_total_bases': 16.1% 'n = 0', Caesars **in** the fair on 56.5%, Caesars **alone**` [x2]
- CLAUDE.md:976 — `- Caesars in the fair: H+R+RBI 83.8%, outs 71.4%, hits 0%, K's 0% (Caesars quotes hits/K's/HR` [x2]
- CLAUDE.md:1086 — `a single**. Mechanism is the 1.071 Caesars overround compounding. **And it pulls against`
- CLAUDE.md:1547 — `and 'czf' (Caesars inside its own fair) peaks at **6.3% at 8–10 h** and is ~0 inside 4 h. So the`
- CLAUDE.md:1581 — `the OVER, uncapped, 'alt' = Caesars milestone ladders).`
- ENGINE2.md:4 — `Odds API + Caesars NV as the executable book. The champion engine (builds`
- ENGINE2.md:67 — `the modal total point (Shin + weighted-median fair, Caesars quote captured); the sim`
- ENGINE2.md:82 — `ML/totals vs the Caesars line, us+eu regions, comparability guard when CZ hangs a`
- ENGINE2.md:88 — `- Surface only: ≥2–3% EV props, ≥1–1.5% EV mainlines, at the Caesars price.`
- ENGINE2.md:93 — `same-game combos. Caesars SGP haircuts are crude — this is the Parlay Lab edge.`
- ENGINE2.md:131 — `Shin de-vigged, blended 25/75 model/market for EV + ¼-Kelly. Caesars'`
- ENGINE2.md:179 — `Correct Score. **STRAIGHT BETS ONLY — Caesars NV offers no ASG parlays**; the`
- ENGINE2.md:185 — `exchange in 'eu'), F5 h2h/totals/spreads at ~6 books, **F3 only at Caesars**`
- ENGINE2.md:187 — `at Caesars and ONE-SIDED (Over 0.5) — the Derby's fantasy-EV trap, so HR props`
- ENGINE2.md:190 — `**Correct Score is not in The Odds API for baseball** → pasted from the Caesars`
- ENGINE2.md:218 — `Caesars price. Zero qualifiers → 'shAllocate' returns 'noPlay:true', the Builder renders a`
- ENGINE2.md:226 — `Legacy 'probability' / 'caesars_ev' modes stay selectable in Settings.`
- ENGINE2.md:246 — `current Caesars price + the de-vigged multi-book consensus fair`
- ENGINE2.md:311 — `**The idea:** shop at DraftKings/FanDuel, settle at Caesars NV. The basis price per`
- ENGINE2.md:318 — `'coreMaxDec', FUN tiers, and parlay building. Caesars is display + settlement only —`
- ENGINE2.md:351 — `quotes are >20 min old. 'caesars_ev', 'ev_gated' (@CZ), and 'probability' stay in`
- ENGINE2.md:376 — `Caesars price, with integer milestone points normalized to the standard half-line`
- ENGINE2.md:471 — `engine's shGradeLeg with identical Caesars void rules. Projected-lineup picks get`
- ENGINE2.md:483 — `rank by engine true % (consensus-anchored); Caesars prices/sizes only, never chooses; picks`
- ENGINE2.md:484 — `CZ doesn't offer are listed separately, never substituted. 'caesars_ev' = legacy ranking,`
- ENGINE2.md:499 — `≥0% EV at Caesars (the settling book) to lock. Selection math stays 100% basis-priced;`
- PARLAY_LAB_QUANT_ENGINE.md:111 — `…te:** props are PROVISIONAL until lineups are confirmed. Encode book void rules (e.g., Caesars requires the batter to be in the starting lineup or the leg voids) so grading and ris…`
- docs/auto-lock-memo.md:146 — `not hypothetical: on the armed fixture, 'caesars_ev' rank-1 sat at **4.77×** its own ceiling and`
- docs/auto-lock-memo.md:643 — `**It is not empty. It carries a fair, a book count, and a two-sided Caesars price.** What it lacks`
- docs/auto-lock-memo.md:663 — `The correct reading is **not** "the parser reads the wrong field": 'cz' (Caesars) was always`
- docs/auto-lock-memo.md:1163 — `Implied probability from the Caesars OVER price (vigged, but applied uniformly to every row so the`
- docs/auto-lock-memo.md:1194 — `**ONE GAP IN THIS MEASUREMENT, NAMED:** 'batter_hits' rows carry no Caesars price in the archive, so`
- docs/auto-lock-memo.md:1455 — `| 3 | L2615 | rows with no over, no under **and** no Caesars price |`
- docs/branch-firing-audit.md:1289 — `| **'caesars_ev'** | 6 | $250 | $265 | **0.9×** | 2 | **0** | **0** |`
- docs/branch-firing-audit.md:1298 — `and **NOT DEMONSTRATED for 'caesars_ev'**, which on this board took zero negative-czEv tickets,`
- docs/cfb-desk.md:32 — `| 'settleBook' | 'williamhill_us' | Caesars — the only book tickets are written at |`
- docs/cfb-desk.md:40 — `…ted there — that is why a Games card can show '-115@54.5' against a consensus 55. 'cz' = Caesars, 'best' = highest decimal at the consensus line, 'dk' / 'fd' / 'pin' for reference.`
- docs/cfb-desk.md:41 — `…deFromEv' in 'src/lib/grade.ts' — the same letter scale as the MLB board; 'playable' = Caesars posts it ∧ status upcoming ∧ kickoff after 'now'; 'kelly' = quarter-Kelly of the bank…`
- docs/cfb-desk.md:67 — `- Core: candidates need 'evCz ≥ 2 %' and a Caesars decimal ≤ 2.60; one side per game ('bestPerGame'); singles and cross-game doubles (product ≤ 2.60) ranked by EV; greedy admit wit…`
- docs/cfb-desk.md:68 — `…3–5 legs across distinct games; legs are the likeliest sides by no-push probability at Caesars' line among playable rows with 'evCz ≥ −3 %' (grade D or better, never an F), moneyli…` [x2]
- docs/cfb-desk.md:84 — `…radeCfbEntry(entry, finals, now)': each leg against the ESPN final for its game at the Caesars line and price on the ticket; pushes void the leg; a game with no final after 'CFB_UN…`
- docs/cfb-desk.md:88 — `…, 'CfbGameCard', 'CfbPicksBoard' (the Board since 2026-09-05: StatTiles PICKS / +EV AT CAESARS / BEST EDGE / PARLAYS, TOP 50 / ALL scope, category strip ALL · ML · SPREAD · TOTAL ·…` [x2]
- docs/cfb-desk.md:94 — `…iced against a 1.08 overround; every book is quoted at its own line with EV re-evaluated there; Caesars ('settleBook') is the settle book and the grade / Kelly source, as on sides.`
- docs/cfb-desk.md:96 — `…elpers in 'src/lib/cfb/slate-server.ts', picks the games that have an odds event and a Caesars side price and are either upcoming (kickoff still ahead) or LIVE — never final / post…`
- docs/cfb-desk.md:98 — `…edger down above Settings, color the tab titles"): three changes, each pinned. (1) THE CAESARS-MISSING RULE — 'CFB_PROPS.czMissingRevalidateSec' (1800) / 'czMissingWindowSec' (4 h)…` [long line; 4 occurrences on this line; first shown]
- docs/cfb-desk.md:99 — `… are available; which is through 3rd quarter in most games"): prod at 16:55 PT carried Caesars Anytime TD on two LIVE games only (MOST@TA&M, WMU@MICH) and the ANYTIME TD set read 0…` [long line; 3 occurrences on this line; first shown]
- docs/cfb-desk.md:100 — `…$25 day. Now, with the window open and games still ahead, a day that carries no usable Caesars price — either 'slate.oddsMissing' (the fetch itself failed) or 'cfbPricedAhead(slate…` [long line; 4 occurrences on this line; first shown]
- docs/cfb-desk.md:103 — `- THE CAESARS-MISSING RULE (2026-09-05, Josh: "They are still 12 games today that haven't started w/ current Anytime TD odds"; read on prod ~15:45 PT: 11 upcoming games carried DK …` [long line; 11 occurrences on this line; first shown]
- docs/cfb-desk.md:104 — `…ories all / ml / spread / total / the six prop markets, ranked grade S → F, then EV at Caesars descending (null EV sorts last), then probability. Parlay leg pool = Caesars-priced r…` [long line; 4 occurrences on this line; first shown]
- docs/cfb-desk.md:105 — `…USH YDS · REC YDS); a prop leg reaches the slip only when the row has a fair price and Caesars' line equals the consensus line ('propLegOf'), so the slip never prices one line whil…`
- docs/cfb-desk.md:119 — `…tures cut from the raw feeds on 2026-09-04 and 2026-09-05. Fixture board: 0 unmatched; Caesars posts no moneyline on ALA / IU / OSU / ARMY / SYR / NEB in the fixture, so those ML r…`
- docs/clv.md:23 — `| 'cz' | the executed Caesars price (american) — the price that settles |`
- docs/clv.md:33 — `| 'am' | the last pre-pitch Caesars price |`
- docs/collection-period.md:618 — `| selection mode default | 'ev_gated' | EV-gated @ CZ (stored dk_fd / probability / caesars_ev respected) |`
- docs/collection-period.md:622 — `| 'coreCzEvMin' | '0' | settlement floor — never lock a core ticket negative-EV at Caesars (override-proof) |`
- docs/collection-period.md:736 — `Measured against the actual distribution (205 playable rows with a Caesars quote, board`
- docs/collection-period.md:740 — `**Mechanism:** the de-vigged consensus is priced against Caesars, whose measured overround is`
- docs/collection-period.md:941 — `rows the settlement book is inside its own consensus — so the independent check on Caesars`
- docs/collection-period.md:942 — `is a de-vigged Caesars price. On those rows 'consCzEv = f × czDec − 1 = 1/(1+h) − 1 ≈ −h',`
- docs/collection-period.md:948 — `Caesars *milestone-ladder* price as if Caesars had contributed to the fair. It reported` [x2]
- docs/collection-period.md:949 — `"44% of Caesars rows are Caesars-only" and "38% of total-bases rows lose eligibility".` [x2]
- docs/collection-period.md:952 — `'cz' is a standard two-sided Caesars quote only (ladders excluded), so`
- docs/collection-period.md:953 — `'n = 1 ∧ cz two-sided' identifies a Caesars-only fair **exactly**:`
- docs/collection-period.md:955 — `| market | rows | no fair at all ('n=0') | Caesars **in** the fair | **Caesars-only fair** | ineligible if ≥1 independent book required |` [x2]
- docs/collection-period.md:974 — `today by arithmetic" because 'consCzEv' on a one-sided Caesars leg reduces to the constant`
- docs/collection-period.md:979 — `3. **Caesars is usually inside the fair rather than alone in it** — 56.5% of total-bases`
- docs/collection-period.md:1009 — `('n = 0' or Caesars-only) becomes selectable with nothing reading its fair.`
- docs/collection-period.md:1047 — `1. L1398 — keep the flag through the fair map, emit 'booksInd' (fairs from non-Caesars`
- docs/collection-period.md:1227 — `'line-history/data/props', 12 days, using rows that carry **two** Caesars sides, so the`
- docs/collection-period.md:1235 — `| 'batter_hits', 'pitcher_strikeouts', 'batter_home_runs' | 0 | — | — | — | — | — | — | Caesars posts no standard two-sided quote in these markets |`
- docs/collection-period.md:1237 — `Against the **multi-book consensus fair** rather than Caesars' own de-vig (n ≥ 2 rows), the`
- docs/collection-period.md:1238 — `overstatement is slightly larger because it also carries Caesars' offset from consensus:`
- docs/collection-period.md:1259 — `2. **The engine anchors to the BEST over price across books**, not to Caesars' — 'oneImp = iO'`
- docs/collection-period.md:1336 — `Caesars voids those bets anyway. Both variants are reported; the gap between them *is* the`
- docs/collection-period.md:1375 — `…uted and then discarded**; these are what the one-sided fallback actually anchors to, so without them the 1.06 constant can only be audited at Caesars and not where it is applied |`
- docs/collection-period.md:1944 — `'ml_booksInd'/'rl_booksInd' reaching 0 would require every book except Caesars to stop`
- docs/collection-period.md:2048 — `require every book except Caesars to stop quoting a game.`
- docs/collection-period.md:2417 — `the sign of EV** — EV is computed at the Caesars price, so a row can be model-high against`
- docs/collection-period.md:2418 — `consensus and still negative-EV because Caesars is worse than consensus.`
- docs/collection-period.md:2661 — `| Caesars' own real pair (−115 / −113) | **1.0654** |`
- docs/collection-period.md:2690 — `close-grading and Caesars-only Shin (via 'cz'), not multi-book Shin.`
- docs/collection-period.md:2833 — `negative, because 'czDec' carries Caesars' vig. At the measured Caesars overround of` [x2]
- docs/collection-period.md:2855 — `is an assumption. If Caesars loads more vig onto one side, the structural component differs`
- docs/collection-period.md:3353 — `'probability'/'caesars_ev' no rung is tagged or barred, and an H+R+RBI O1.5 parlay sits at`
- docs/collection-period.md:3354 — `rank 1 of the measured 'caesars_ev' card at $62.** **Recorded as a REVERSAL, not an extension (item 2)**:`
- docs/collection-period.md:3379 — `('probability', 'caesars_ev') are ~2 taps from the device and carry the identical`
- docs/collection-period.md:3465 — `| 'czf' — Caesars inside its own fair | 0–6% | ~0% | **effectively eliminated** |`
- docs/collection-period.md:3468 — `> consensus check is a de-vigged Caesars price — is **a morning phenomenon**, peaking at 6.3%`
- docs/collection-period.md:3544 — `keys, and Caesars posts its entire hits and K's ladders (including the main lines) only`
- docs/collection-period.md:3545 — `under those keys. **Every Caesars hits/K's quote for the archived fixture-days`
- docs/collection-period.md:3860 — `So the engine enforces at computation; **the last mile — the slip at Caesars —`
- docs/collection-period.md:5818 — `'caesars_ev' (the legacy ¼-Kelly-at-CZ ranking). Plus one orthogonal switch:`
- docs/collection-period.md:5826 — `| 'caesars_ev' | ✗ — the legacy exact-sum (L3105–06) | the ladder: 10% at n=1 |`
- docs/collection-period.md:5871 — `'probability'/'caesars_ev' (or forcing any mode) removes the Kelly ceiling up to`
- docs/collection-period.md:6256 — `| 'caesars_ev' | ✓ Settings | ~2 | ✗ | **✗** |`
- docs/collection-period.md:6267 — `| **caesars_ev** | false | 48 | **11** | **4** | **UNFILTERED** |`
- docs/collection-period.md:6270 — `branch-1 reading, mode named, counts printed)**: 'probability' and 'caesars_ev'`
- docs/collection-period.md:6585 — `{ev_gated, dk_fd, probability, caesars_ev, ABSENT}.`
- docs/collection-period.md:6600 — `'caesars_ev' are ~2 taps away, reproducing the identical 11 pool / 4 FUN.`
- docs/collection-period.md:6752 — `| 'caesars_ev' | **H+R+RBI 2-leg $62** · ML $62 · RL $62 · RL $2 · ML $62 | 5 | 53 | **0** |`
- docs/collection-period.md:6754 — `M20 in its most concrete form yet: **under 'caesars_ev' the live card's TOP TICKET`
- docs/collection-period.md:6903 — `showed today, 'caesars_ev' puts an H+R+RBI parlay on the card at the top stake. So`
- docs/collection-period.md:6960 — `| **its Kelly ceiling** | **$13 — COMPUTED AND DISCARDED** ('disciplined' is false in 'caesars_ev', L3108 '&&!force') |`
- docs/collection-period.md:6971 — `| 'caesars_ev' | ✗ | **8.27% ($62) — three tickets at capG** | **YES — rank #1, $62** |`
- docs/collection-period.md:6976 — `'dk_fd' **14**, 'probability' **0**, 'caesars_ev' **0** (the board carries 14 HRR rows`
- docs/collection-period.md:7522 — `| 'caesars_ev' | 5 | **5 of 5** | **∞** | **4.77×** |`
- docs/collection-period.md:7531 — `the eleven; the other four caesars_ev tickets are staked $2–$62 against a ceiling of`
- docs/collection-period.md:7555 — `opened in 'probability' or 'caesars_ev' at all, for any purpose, until M24 is resolved.`
- docs/collection-period.md:7740 — `('probability' $250 staked / $0 of ceiling; 'caesars_ev' $250 staked / $13).`
- docs/collection-period.md:7831 — `| 'caesars_ev' | **$250** | **$3** | **83.3×** | **fires** |`
- docs/collection-period.md:7837 — `Per-ticket badges in 'caesars_ev': 'Kelly $3' beside $62, then **'Kelly $0' beside`
- docs/collection-period.md:8046 — `| 'caesars_ev' | | 'probability' | |`
- docs/collection-period.md:8056 — `'caesars_ev' card the banner **would** have appeared — so for that mode the display is`
- docs/credit-budget.md:371 — `Six markets, no '_alternate' ladders: the three ladders are pre-kick Caesars milestone products this`
- docs/first-sunday-six.md:9 — `…th optional promotion prices. Ordinary per-game First TD prices are never displayed as Caesars race prices. The three highest estimated race chances appear as a weekly token shortl…`
- docs/first-sunday-six.md:11 — `…orical model and market normalization remain unchanged. Promotion-market availability must still be checked at Caesars; no automatic price feed, token activation or wager is added.`
- docs/first-sunday-six.md:16 — `Caesars public market inspected September 20, 2026: 267 distinct selections. Stored prices are a dated capture, not an automatic live feed; manual replacement is supported per date…`
- docs/first-sunday-six.md:18 — `Source: https://sportsbook.caesars.com/americanfootball?id=007d7c61-07a7-4e18-bb40-15104b6eac92 . Visible market rules confirm earliest touchdown by game time across Sunday early g…`
- docs/freeze-exit-bundle.md:38 — `…e uses** — 'tools/snapshot_props.py' requests only the six canonical market keys while Caesars posts its entire hits/K's ladders under '*_alternate' (incl. the main lines; raw-veri…`
- docs/freeze-exit-bundle.md:45 — `…PLINED branch, so it applies only at 'selMode ∈ {ev_gated, dk_fd}'. 'probability' and 'caesars_ev' are each ~2 taps from the device (Settings → mode, persisted to 'pl_selmode'), an…` [long line; 1 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:46 — `…20 — THE BANKROLL NUMBER, MEASURED 2026-07-30 BEFORE THE BOARD (owner's item 1)**: in 'caesars_ev' the live card's **rank-#1 ticket is an H+R+RBI parlay at $62 = 8.27% of a $750 ba…` [x2]
- docs/freeze-exit-bundle.md:47 — `…ly comment explains the advisory posture and never mentions the zero case | measured: 'caesars_ev' banner **FIRES** ("Entered $250 is 83.3x the Kelly-consistent $3") — so for that …`
- docs/freeze-exit-bundle.md:51 — `…puted ceiling = 25.0×, 6 of 6 over ceiling, 5 with a $0 ceiling, 5 negative-czEv**; **'caesars_ev' 6 tickets, $250 vs $265 = 0.9×, 2 over, ZERO negative-czEv, ZERO $0-ceilings**; '…` [long line; 2 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:52 — `…own computed ceiling** (armed fixture, DAILY $250, bankroll $750): 'probability' 6/6, 'caesars_ev' 5/5; rank-1 'caesars_ev' = **$62 vs a $13 ceiling = 4.77×** on H+R+RBI O1.5 (the …` [long line; 2 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:447 — `'czDec'/'czEv'/'czOdds' are all null (no Caesars quote), so the gate never read`
- docs/freeze-exit-bundle.md:628 — `…th leg count — **−1.000% / −0.501% / −0.334%** at 1/2/3 legs — driven by the **1.071** Caesars overround. A **structure filter wearing a quality filter's name**, running opposite t…` [x2]
- docs/harness-substitutions.md:254 — `…e = prob' in every disciplined mode, and the 'edge ÷ odds' branch runs only in legacy 'caesars_ev' | **PROVEN: three consecutive wrong characterisations of the allocator.** Not a c…`
- docs/harness-substitutions.md:255 — `| 'CAESARS_KEY' → 'deps.settlementBook' | whenever the caller passes 'settlementBook' — production always passes 'SETTLE_BOOK' ('draftkings', INSTRUCTION 67, 2026-09-17); a test th…` [x4]
- docs/harness-substitutions.md:504 — `| the **independence table** ('n', books, Caesars-only) | **no** | counts whether a two-sided pair exists; the de-vig method cannot change that |`
- docs/hrr-recalibration.md:101 — `> under 'caesars_ev' an H+R+RBI O1.5 parlay sits at rank 1 of the card at $62. **If the`
- docs/hrr-recalibration.md:570 — `well has not been shown to produce a bettable edge at Caesars. So the suspension does`
- docs/multibook-memo.md:73 — `feed.** The absent books need the paste path: the ASG 'parseCaesarsBoard' pattern — one box,`
- docs/multibook-memo.md:188 — `per row** ("Caesars price if offered" — written by the ENGINE, which reads the`
- docs/multibook-memo.md:265 — `> the feed's Caesars ('williamhill_us') is missing from **100% of hits rows (369/369) and`
- docs/multibook-memo.md:309 — `otherwise lose CLV) and it also covers Caesars quotes the feed happens to miss — ~~which the`
- docs/multibook-memo.md:376 — `at 2.5–9.5**. Caesars is in the feed for hits and K's.`
- docs/multibook-memo.md:377 — `6. **The engine already knew** — 'legacy/index.html' L1158–1162: *"Caesars posts hits and`
- docs/multibook-memo.md:379 — `Caesars absent from batter_hits/pitcher_strikeouts but present in both alternates.`
- docs/multibook-memo.md:380 — `These feed ONLY the Caesars playable price on existing rows"* — and L1366 requests`
- docs/multibook-memo.md:410 — `only — "standard Caesars quote wins" — and never feeds fairs).`
- docs/multibook-memo.md:547 — `1. Circa's two-way hold per market vs Caesars' (per-line 'iO + iU − 1', median per`
- docs/multibook-memo.md:552 — `- **Pre-committed decision rule**: hold ≤ ~half of Caesars' OR marginal increment ≥`
- docs/multibook-memo.md:595 — `| 'shTicketSnap' (L3365) | writes 'czOdds/czDec' "straight" plus 'bs*' — settlement implicitly Caesars; **no settlement-book field exists** |`
- docs/multibook-memo.md:597 — `| 'clv-core' (L215–239) | the settlement close is hardwired 'CAESARS_KEY'; 'bsAm/bsBk' ride along informationally |`
- docs/multibook-memo.md:598 — `| 'ledger-segments' (L70–74, 208, 241) | 'nvTax' ≡ "what settling at Caesars cost vs the basis" — meaningless when settlement ≠ CZ |`
- docs/nfl-desk.md:37 — `…end '{ mkt .75, fpi .25 }', pinnacleWeight 2, minBooks 2, settleBook 'williamhill_us' (Caesars), matchWindowMs 3 h. The pipeline ('buildCfbBoard', 'priceGame', 'kellyStake') is the…`
- docs/phase2-memo.md:354 — `| Caesars-in-fair ('czf') | — | — | — | **UNMEASURABLE** |`
- docs/phase2-memo.md:367 — `> level* (both benign, ratios 1.018 and 1.014) and **unbounded on overround and Caesars`
- docs/phase2-memo.md:371 — `> Series B cannot rule out that its joined rows are systematically the ones where **Caesars`
- docs/phase2-memo.md:372 — `> quoted** — and Caesars participation is a variable this project has already measured as`
- docs/phase2-memo.md:373 — `> mattering ('docs/collection-period.md': total bases 56.5% Caesars-in-fair, H+R+RBI 83.8%,`
- docs/phase2-memo.md:510 — `Series B also supports a **Caesars-only Shin** variant via the stored 'cz' pair`
- docs/phase2-memo.md:743 — `| **Caesars overround 1.071** | 'data/props', rows with two Caesars sides | **NO.** Snapshot 1 vs snapshot 2: H+R+RBI **1.0713 / 1.0713**, TB 1.0708 / 1.0709, outs 1.0717 / 1.0725 …` [x2]
- docs/pitcher-outs-audit.md:603 — `'buildParlaySet''s dscp branch). **In 'probability' and 'caesars_ev' — both ~2 taps`
- docs/pitcher-outs-audit.md:609 — `'caesars_ev' an H+R+RBI parlay sits on the card at $62.`
- docs/progress.md:86 — `… 2026-09-20 fetched 14/14 events, 4,012 rows, all ten markets; quote counts DK 3,577 / Caesars 1,547 / FD 3,100. Confirmed actual Ja'Marr Chase 6+–10+ (and wider) reception ladder …` [x2]
- docs/progress.md:90 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/progress.md:96 — `…efresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that ref…`
- docs/progress.md:210 — `- Josh's eight items with 15 desktop/Caesars screenshots: sport order NFL/CFB/MLB; the logo must never open the landing; bet % / money % on every pick; logos visible (no black disc…`
- docs/progress.md:222 — `# Progress — 2026-09-18 (UI overhaul: generator customization, hit-rate analytics, Caesars-tight chips)`
- docs/progress.md:224 — `… and picks over the last 7/15/30/60/120 games, and a tighter, game-like layout after the Caesars/William Hill app (no screenshots came through; the known chip layout was followed).`
- docs/progress.md:266 — `INSTRUCTION 67: Josh asked for every grade, edge %, EV and Kelly stake to be computed at DraftKings instead of Caesars, with nothing else on the site changed.`
- docs/progress.md:268 — `…lib/sportsbook/books.ts') is now the one settlement constant. The legacy MLB engine's 'CAESARS_KEY' variable is rebound to it by the facade on every 'createEngine' call (engine-cli…`
- docs/progress.md:269 — `…p; anything without the stamp (pre-2026-09-17 caches and ledger entries) is treated as Caesars-priced. The client repricers ('priceMlbBoard', 'priceFootballRow/Prop', 'priceLiveBoa…` [x2]
- docs/progress.md:271 — `- Labels, notes and refusal strings that named Caesars as the settle book now name DraftKings (Board, Builder, Settings, Ledger, CLV panel, CFB/NFL lock notes, football props). Ver…` [x2]
- docs/progress.md:272 — `- Tests: 'tests/helpers/settle-book.ts' loads the hand-checked fixtures with the Caesars and DraftKings keys exchanged; the parlay-generator fixtures pass 'pricingBook: "CZ"' becau…` [x2]
- docs/progress.md:290 — `Instruction 64 adds a persistent seven-book selector, default Caesars, across odds pages. NFL/CFB retain bookmaker-specific quotes and model probabilities at each line; MLB enriche…` [x3]
- docs/progress.md:878 — `grades it from ESPN finals at the Caesars line. Own ledger, bank and keys — nothing shared`
- docs/session-handoff.md:122 — `…ater Sundays. Suggestions now come from current eligible First TD rows; optional exact Caesars promotion prices join by player. A top-three token shortlist and searchable list rend…`
- docs/session-handoff.md:215 — `- 'sha-references' allowlists two tokens that are not Parlay Lab commits (a Roster Lab commit, a Caesars URL segment), clearing its long-standing red.`
- docs/session-handoff.md:442 — `Added NFL Board Caesars-only First Sunday Six section, 267 prices captured from public Caesars DOM (not live feed), historical archive and conservative timing model. See docs/first…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:450 — `… bypasses empty-market hold as well as quote-age reuse. Three-book quotes (DraftKings, Caesars/williamhill_us, FanDuel) remain fetched together and repriced locally per selection. …`
- docs/session-handoff.md:452 — `…:01 UTC: fresh NFL production refresh fetched 14/14 games, 3,943 prop rows; DK 3,589 / Caesars 1,554 / FD 3,137 rows with quotes. All 14 game slates matched, oddsMissing false. Fre…`
- docs/session-handoff.md:474 — `… 2026-09-20 fetched 14/14 events, 4,012 rows, all ten markets; quote counts DK 3,577 / Caesars 1,547 / FD 3,100. Confirmed actual Ja'Marr Chase 6+–10+ (and wider) reception ladder …` [x2]
- docs/session-handoff.md:478 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/session-handoff.md:484 — `…efresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that ref…`
- docs/session-handoff.md:601 — `shortfall FORCED via caesars_ev on the leg-disjoint remainder, 'forced:true',`
- docs/session-handoff.md:633 — `11. **CAESARS ⓘ TOGGLE SYNC** (08-11) — authed wire confirmed by Josh ("Sync phrase`
- docs/session-handoff.md:756 — `return at the settling price — confirmed NV beats the Caesars quote, cents rounded once like`
- docs/session-handoff.md:761 — `Caesars only when unconfirmed — same rule, now shared). 'tests/ticket-payout.test.ts' (7).`
- docs/session-handoff.md:781 — `…s 61% market-implied; TB unders 70% vs 63%, HRR unders 63% vs 60% (fine); forced pass (caesars_ev) $915 at −27%; stakes ≥$20 −33..−36% ROI, stakes <$10 −2%; the alt ev_gated select…`
- docs/session-handoff.md:787 — `…legs target 10, team cap 2): highest-model-prob H+R+RBI O 0.5 + Hits O 0.5 rows with a Caesars price, one leg per player, leg-disjoint from everything staked (susp ignored for fun,…`
- docs/session-handoff.md:788 — `… at 1.9091, so the ≤1.75 forced pass seats nothing there — measured, not assumed), and the 'paper-epoch' source scans (caesars_ev → CORE_RULES.forcedSelMode; residue → capped map).`
- docs/session-handoff.md:795 — `…OARD_KEY'/'decodeBoard' helpers as '/api/board') so each team shows the best-book ML + Caesars price when the board carries it. Pure shaping in 'src/lib/games.ts', pins in 'tests/g…`
- docs/session-handoff.md:822 — `…ngine's own rule (legacy @~199372: a POSTED lineup missing the player = off the board, Caesars voids the leg) only runs at generation; the prop tabs render the day's STAMPED picks …` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:831 — `…, and search narrows it. ML/RL are unchanged under either scope (never truncated). Scratched batters and the Caesars toggle apply in both scopes. Pins: 'tests/board-scope.test.ts'.`
- docs/session-handoff.md:840 — `…batter_hits_alternate, pitcher_strikeouts_alternate, batter_home_runs_alternate' — the Caesars ladders) and the 2026-08-02 shape allow-list ('src/lib/server/odds-shape.ts') listed …`
- docs/session-handoff.md:852 — `…FPI .25} for the margin, every book quoted at its own line with EV re-evaluated there, Caesars ('williamhill_us') the settle book, letter grades from the shared 'gradeFromEv', quar…` [long line; 8 occurrences on this line; first shown]
- docs/session-handoff.md:856 — `…S · PASS YDS · RECEPTIONS · RUSH YDS · REC YDS) and prop legs go on the slip only when Caesars' line equals the consensus line. (b) Freeze: the Scramble Lab root cause again — hist…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:858 — `**INSTRUCTION 40 (2026-09-05, Josh's word, verbatim, with Caesars Sportsbook app screenshots attached as the reference: "* It's not showing any current props for CFB. In game prop …`
- docs/session-handoff.md:859 — `…ill', invalidates both the slate and the props queries; the small ↻ pill is gone). (c) Caesars-grammar UI: shared 'Overlay' (60 % sheet, × / backdrop / Escape close, portal, no blu…` [long line; 4 occurrences on this line; first shown]
- docs/session-handoff.md:860 — `…he H+R+RBI question under instruction 40: "1. Yes, run everything based on the current caesars lines; hide the non-Caesars lines from ALL 2. If i go to another state like Arizona &…` [x2]
- docs/session-handoff.md:861 — `…L scope ('app/board/page.tsx', the 'allRows' memo) now keeps only the prop-board lines Caesars posts ('cz.o' priced); a line only another book posts at a different number — the "O …` [x7]
- docs/session-handoff.md:865 — `…ok posts props on (legitimately empty); 11 games carried DK/FD Anytime TD rows with no Caesars quote because each was priced once and then rode its 2 h carry before Caesars posted.…` [long line; 8 occurrences on this line; first shown]
- docs/session-handoff.md:868 — `…4 confirmed findings, all 4 fixed). Why the ANYTIME TD set read 0 on prod at 16:55 PT: Caesars carried Anytime TD only on two LIVE games and every single-market set and COMBO built…` [long line; 5 occurrences on this line; first shown]
- docs/session-handoff.md:988 — `pre-kick Caesars milestone products that this feature never reads, and nine markets instead of`
- docs/session-handoff.md:1694 — `… what I explain. I want all parlays etc calculated based on DraftKings odds instead of Caesars. So everything the exact same with the engine/website except whenever it uses Caesars…` [long line; 6 occurrences on this line; first shown]
- docs/session-handoff.md:1706 — `…ps on the board and just starting. I can access them on the Draftkings, william hill & caesars apps. I refreshed the board as well from 5:00pm last refresh to 7:03pm. Its also not …` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1710 — `…18):** Josh, eight items verbatim with 15 desktop screenshots (1 Parlay Lab landing, 9 Caesars mobile dark + 1 light, 5 Parlay Lab desktop): (1) "Re-order the sports from MLB/CFB/N…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:1712 — `… "I want it to feel more like I'm playing a game … Look at the screenshots provided of caesars sportsbook app … how little space there is between filters". NO screenshots came thro…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:1801 — `records; '/api/picks' + '/api/board?date=' public. **Every pick posts** (no Caesars`
- docs/session-handoff.md:1802 — `holdback); each pick carries the ⓘ "offered at Caesars?" toggle (default yes, No hides`
- docs/session-handoff.md:1806 — `Caesars ⓘ toggle across his devices** (his word, 2026-08-10: "yes sync the toggle`
- docs/session-handoff.md:1878 — `EV @ Caesars"; flipping 'pl_selmode' to probability reordered the live board and the`
- docs/session-handoff.md:1881 — `ev_gated/caesars_ev→czEv, probability→prob; stable; ORDERING ONLY — every pick still`
- docs/session-handoff.md:1930 — `shortfall FORCED via 'caesars_ev' re-alloc on the leg-disjoint remainder (no EV`
- docs/session-handoff.md:2736 — `'caesars_ev' / under 'force', an ALLOCATED stake can also exceed it, singles and parlays alike.`
- docs/session-handoff.md:3946 — `…parlay tiers (live window, carried rows), the iOS freeze fix, the props quota cap, the Caesars-grammar UI primitives, every separate key/route/store, tests and fixtures, known dev-…`
- docs/session-handoff.md:3967 — `| 'first-sunday-six.md' | Captured Caesars promotion prices, historical timing evidence, coverage and limitations. |`
- docs/session-handoff.md:4464 — `38 tickets by mode {ev_gated, dk_fd, probability, caesars_ev, ABSENT}. Any`
- docs/session-handoff.md:4895 — `**POPULATION: PRE-FILTER on BOTH sides — props archive, implied from the Caesars OVER price,`
- docs/session-handoff.md:4945 — `| 3 | L2615 | rows with no over, no under **and** no Caesars price |`
- docs/session-handoff.md:5065 — `$250 vs a $10 ceiling = 25.0×, 6 of 6 over, 5 $0-ceilings, 5 negative-czEv**; **'caesars_ev'`
- docs/session-handoff.md:5068 — `TRUE for 'probability' and NOT DEMONSTRATED for 'caesars_ev'.**`
- docs/session-handoff.md:6805 — `| 6 | 'coreCzEvMin' | the settlement floor at Caesars |`
- docs/session-handoff.md:8166 — `2. ~~**SHIP THE AUTHORIZED ITEM: the Caesars-toggle sync**~~ — **✅ DONE 2026-08-10,`
- docs/singles-vs-parlays.md:73 — `(71 of the 276 playable rows have no Caesars quote at all and cannot be a single.)`
- docs/singles-vs-parlays.md:525 — `> ¼-Kelly-proportional fraction: edge ÷ odds"*. That is the 'caesars_ev' legacy path, which`
- docs/singles-vs-parlays.md:541 — `> > selection rank by engine true % anchored to the multi-book consensus; **Caesars prices`
- docs/singles-vs-parlays.md:542 — `> > and sizes, never chooses**; 'caesars_ev' legacy ranking selectable in Settings."*`
- docs/singles-vs-parlays.md:554 — `> (Switching 'selMode' to 'caesars_ev' would also give the edge weight but disables the EV`

##### Caesars (word) — tools (6 lines)

- tools/board-report.mjs:111 — `* dirPref on its own — a legacy-mode board ('probability'/'caesars_ev') takes the`
- tools/hr_overround.py:7 — `Measured against 12 days of two-sided rows, Caesars' real overround on props is`
- tools/hr_overround.py:34 — `chance of a HR, so counting him inflates the estimate. Caesars voids those bets, so`
- tools/hr_overround.py:198 — `# PRIMARY: appeared-only, matching Caesars' void rule`
- tools/snapshot_props.py:53 — `"""per market/player/line: Caesars O/U, cross-book proportional-devig median`
- tools/snapshot_props.py:118 — `# constant can only be audited at Caesars, not where it is applied.`

#### William Hill / williamhill_us

148 matching lines in 55 files (282 occurrences).

##### William Hill / williamhill_us — config (4 lines)

- src/lib/cfb/rules.ts:33 — `* settleBook — Caesars (The Odds API key 'williamhill_us'): the price every ticket`
- src/lib/nfl/rules.ts:23 — `* ('williamhill_us') is the price every ticket settles at.`
- src/lib/sportsbook/books.ts:2 — `{key:'williamhill_us',label:'Caesars',short:'CZ'},`
- src/lib/sportsbook/books.ts:18 — `if(['cz','czr','caesars','williamhillus'].includes(v))return 'williamhill_us';` [x2]

##### William Hill / williamhill_us — caches (1 lines)

- src/lib/cz-offered.ts:154 — `const scoped=(k:string)=>book==='williamhill_us'?k:'book:${book}:${k}';`

##### William Hill / williamhill_us — calculations (12 lines)

- legacy/index.html:888 — `var CAESARS_KEY="williamhill_us";`
- src/engine/legacy-src.gen.ts:5 — `…oard: Caesars lines via The Odds API (user-supplied key) ===== */\nvar CAESARS_KEY=\"williamhill_us\";\nvar ODDS_KEY_DEFAULT=\"\"; /* key scrubbed 2026-07-19 — enter via ⚙ (stored …` [long line; 1 occurrences on this line; first shown]
- src/engine2/allstar.ts:149 — `rows.find((r) => r.book === "williamhill_us") ?? null;`
- src/engine2/allstar.ts:151 — `rows.find((r) => r.book === "williamhill_us") ?? null;`
- src/engine2/allstar.ts:485 — `const own = consensusProb([{ key: "williamhill_us", a: cz.over, b: cz.under }]);`
- src/lib/server/clv-core.ts:44 — `export const CAESARS_KEY = "williamhill_us";`
- src/lib/sportsbook/football.ts:10 — `const pricedAt=(row:{displayBook?:string;cz:{book:string}|null}):string=>row.displayBook??row.cz?.book??'williamhill_us';`
- src/lib/sportsbook/mlb.ts:77 — `if(book===(r.settlementBook??'williamhill_us'))return american(r.czOdds)??american(r.cz);`
- src/lib/sportsbook/mlb.ts:83 — `if(book===(r.settlementBook??'williamhill_us'))return r;const am=knownPrice(r,book,index);const p=r.prob==null?null:r.prob/100;const v=valueAt(p,am);`
- src/lib/sportsbook/mlb.ts:92 — `if(book===(r.settlementBook??'williamhill_us'))return {...r,displayBook:book,o:r.cz?.o??null,u:r.cz?.u??null,oBook:r.cz?.o!=null?bookName(book):null,uBook:r.cz?.u!=null?bookName(b…`
- src/lib/sportsbook/mlb.ts:102 — `if(book===(data.settlementBook??'williamhill_us'))return {...data,propBoard:data.propBoard?.map(g=>({...g,markets:Object.fromEntries(Object.entries(g.markets).map(([k,rs])=>[k,rs.…`
- src/lib/sportsbook/useLivePrices.ts:7 — `if(!data||book===(data.settleBook??'williamhill_us'))return data; // overlays from before 2026-09-17 (INSTRUCTION 67) carry no stamp and are Caesars-priced`

##### William Hill / williamhill_us — stored-data fields (2 lines)

- src/engine/index.ts:297 — `declares 'var CAESARS_KEY="williamhill_us"'; rebinding it here (a 'var', so the assignment`
- src/lib/cfb/types.ts:123 — `/** Caesars (williamhill_us), at ITS OWN line — the settling book */`

##### William Hill / williamhill_us — UI (4 lines)

- src/components/cfb/CfbGameCard.tsx:36 — `williamhill_us: "Caesars",`
- src/components/cfb/CfbGameCard.tsx:48 — `williamhill: "Will Hill",`
- src/components/cfb/CfbProps.tsx:109 — `williamhill_us: "CZ",`
- src/components/props/props-model.ts:67 — `"william hill (us)": "CZ",`

##### William Hill / williamhill_us — tests (106 lines)

- tests/basis-surfaces.test.ts:134 — `const wh = body.bookmakers?.find((b) => b.key === "williamhill_us");`
- tests/cfb-card.test.ts:82 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-card.test.ts:88 — `{ key: "williamhill_us", title: "Caesars", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },`
- tests/cfb-card.test.ts:95 — `{ key: "williamhill_us", title: "Caesars", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },`
- tests/cfb-card.test.ts:417 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-model.test.ts:195 — `// the swapped capture (tests/helpers/settle-book.ts): the old DK quote now sits under 'williamhill_us'`
- tests/cfb-model.test.ts:196 — `expect(nt.quotes?.williamhill_us).toMatchObject({ book: "williamhill_us", price: -110, line: 40.5 });` [x2]
- tests/cfb-model.test.ts:198 — `expect(nt.best!.dec).toBeGreaterThanOrEqual(nt.quotes!.williamhill_us!.dec);`
- tests/cfb-model.test.ts:306 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["williamhill_us", "fanduel"], ["h2h"]) /* the swapped capture: the old DK ML sits under williamhill_us */], fpi:…` [x2]
- tests/cfb-model.test.ts:318 — `expect(h.best).toMatchObject({ book: "williamhill_us", price: -6500 });`
- tests/cfb-picks.test.ts:163 — `{ key: "williamhill_us", title: "Caesars", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-props.test.ts:155 — `expect(r.quotes?.williamhill_us?.line).toBe(245.5); // the swapped fixture: the old DK quote sits under williamhill_us` [x2]
- tests/cfb-props.test.ts:164 — `expect(u.best?.book).toBe("williamhill_us"); // the old DK -105 (under williamhill_us in the swapped fixture) is the best under at 245.5` [x2]
- tests/cfb-props.test.ts:226 — `const payload = { id: "x", bookmakers: [ou("draftkings", "DraftKings", -130, 100), ou("williamhill_us", "Caesars", -105, -115)] };`
- tests/cfb-props.test.ts:237 — `const mirrored = { id: "x", bookmakers: [ou("draftkings", "DraftKings", 100, -130), ou("williamhill_us", "Caesars", -115, -105)] };`
- tests/cfb-props.test.ts:251 — `{ key: "williamhill_us", title: "Caesars", markets: [{ key: "player_anytime_td", outcomes: [`
- tests/cfb-props.test.ts:268 — `{ key: "williamhill_us", title: "Caesars", markets: [{ key: "player_receptions", outcomes: [`
- tests/clv-core.test.ts:95 — `bk("williamhill_us", "batter_hits", [`
- tests/clv-core.test.ts:127 — `bk("williamhill_us", "batter_hits_alternate", [`
- tests/clv-core.test.ts:149 — `bk("williamhill_us", "h2h", [`
- tests/clv-core.test.ts:157 — `bk("williamhill_us", "spreads", [`
- tests/dkfd-basis.test.ts:34 — `const NV_BOOKS = new Set(["williamhill_us", "betmgm"]);`
- tests/dkfd-basis.test.ts:270 — `{ key: "williamhill_us", markets: [mk(-120, 100)] },`
- tests/engine2-allstar.test.ts:45 — `key: "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:234 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1079 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1080 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1429 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1430 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1528 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2256 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2471 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2472 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2873 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3696 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3697 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4147 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5125 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5126 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5351 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6049 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6050 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6345 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7284 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7285 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7877 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8039 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8040 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8441 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9366 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9367 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9609 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10524 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10525 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10927 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11005 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11006 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11309 — `"key": "williamhill_us",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12035 — `"key": "williamhill",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12036 — `"title": "William Hill",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:11 — `"key": "williamhill_us",`
- tests/fixtures/fix39/odds.json:1 — `…Over","price":-118,"point":8.5},{"name":"Under","price":103,"point":8.5}]}]},{"key":"williamhill_us","title":"Caesars","last_update":"2026-07-10T05:39:06Z","markets":[{"key":"h2h",…` [long line; 15 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…,{"name":"Under","description":"Ryan Weathers","price":-165,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-1…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…{"name":"Under","description":"Shota Imanaga","price":-106,"point":17.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-1…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `….5},{"name":"Under","description":"Aaron Nola","price":-125,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_hits_runs_rbis","last_update":"2026…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…,{"name":"Under","description":"Brandon Young","price":-130,"point":4.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-1…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…"name":"Under","description":"Sandy Alcantara","price":-140,"point":5.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-1…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…name":"Under","description":"Braxton Ashcraft","price":-150,"point":6.5}]}]},{"key":"williamhill_us","title":"Caesars","markets":[{"key":"batter_home_runs","last_update":"2026-07-1…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `… "Under", "description": "Ryan Weathers", "price": -165, "point": 5.5}]}]}, {"key": "williamhill_us", "title": "Caesars", "markets": [{"key": "batter_home_runs", "last_update": "20…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:55 — `"key": "williamhill_us",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:570 — `"key": "williamhill_us",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:628 — `"key": "williamhill_us",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…kings":{"book":"draftkings","title":"DraftKings","price":150,"line":null,"dec":2.5},"williamhill_us":{"book":"williamhill_us","title":"Caesars","price":146,"line":null,"dec":2.46},…` [long line; 114 occurrences on this line; first shown]
- tests/fixtures/nfl/odds-2026-09-13.json:66 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:290 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:514 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:738 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:962 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:1186 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:1410 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:1634 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:1858 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:2082 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:2306 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:2530 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-2026-09-13.json:2754 — `"key": "williamhill_us",`
- tests/fixtures/nfl/odds-event-props-401872925.json:11 — `"key": "williamhill_us",`
- tests/football-ladders.test.ts:9 — `const books=['draftkings','williamhill_us','fanduel'];`
- tests/helpers/settle-book.ts:2 — `* INSTRUCTION 67 (2026-09-17): the settle book moved from Caesars ('williamhill_us') to`
- tests/helpers/settle-book.ts:10 — `williamhill_us: { key: "draftkings", title: "DraftKings" },`
- tests/helpers/settle-book.ts:11 — `draftkings: { key: "williamhill_us", title: "Caesars" },`
- tests/mlb-live-props-route.test.ts:758 — `const dkSettles = sightLiveQuote(ev(), "juansoto", "batter_hits_runs_rbis", { ...cfg, settleBook: "williamhill_us" });`
- tests/mlb-market-phases.test.ts:56 — `const books=[{key:"williamhill_us",title:"Caesars",price:-120},{key:"draftkings",title:"DraftKings",price:130}];`
- tests/mlb-market-phases.test.ts:58 — `const captured=attachBookQuotes(data,[event],'williamhill_us');/* the row's cz is Caesars-priced */expect(captured.categories).toStrictEqual(data.categories); // the settle-book …`
- tests/mlb-market-phases.test.ts:123 — `const quotes={draftkings:{o:150,u:-170},williamhill_us:{o:180,u:-200},fanduel:{o:120,u:-140}};`
- tests/nfl-engine.test.ts:126 — `/** The synthetic odds with every Caesars (williamhill_us) price improved by 'pct' % — a TEST`
- tests/prop-board.test.ts:162 — `const cz = body.bookmakers.find((b) => b.key === "williamhill_us" && b.markets.some((m) => m.key === "batter_hits_alternate"))!;`
- tests/props-model.test.ts:71 — `expect(bookAb("William Hill (US)")).toBe("CZ");`
- tests/sportsbook.test.ts:10 — `…abel:'Player O 0.5',fair:.5,line:.5,status:'upcoming',kickoff:'2099-01-01',cz:quote('williamhill_us',-130),dk:quote('draftkings',120),fd:null,best:quote('draftkings',120),evCz:-11.…`
- tests/sportsbook.test.ts:25 — `…eaves historical input untouched',()=>{const enriched=attachBookQuotes(data,[event],'williamhill_us');/* the fixture's cz prices are Caesars' */const out=priceMlbBoard(enriched,'dr…`
- tests/sportsbook.test.ts:39 — `expect(priceMlbProp(r,'williamhill_us').o).toBeNull();`
- tests/sportsbook.test.ts:43 — `expect(priceMlbBoard(attachBookQuotes(data,[e],'williamhill_us'),'draftkings').propBoard![0].markets.batter_hits[0].cz?.o).toBe(120);`
- tests/sportsbook.test.ts:52 — `expect(priceMlbMoneylines(data,"williamhill_us")[0]).toMatchObject({odds:-150,cz:-150,book:"Caesars"});`
- tests/sportsbook.test.ts:61 — `const index={'g|p|o':{fanduel:{am:120,line:.5,book:'fanduel'},williamhill_us:{am:-130,line:.5,book:'williamhill_us'}}};` [x2]
- tests/sportsbook.test.ts:63 — `expect(priceMlbRow(row,'williamhill_us',index).czKellyF).toBe(0);`
- tests/supplemental.test.ts:277 — `{ key: "williamhill_us", markets: [mk(-115, -105)] },`

##### William Hill / williamhill_us — docs (18 lines)

- CLAUDE.md:89 — `…td', yes/no like Anytime HR), Pass Yds/TDs, Rush Yds, Receptions, Rec Yds. Caesars ('williamhill_us') preferred, **falls back to any US book** with a note. Default game skips alrea…`
- CLAUDE.md:160 — `…*Caesars-only playable card**: ingestion additively captures Caesars ('CAESARS_KEY'='williamhill_us') ML/RL/prop prices ('*_cz', 'row.cz'; RL only at the engine's modal ±1.5); rows…`
- docs/cfb-desk.md:32 — `| 'settleBook' | 'williamhill_us' | Caesars — the only book tickets are written at |`
- docs/harness-substitutions.md:255 — `…UCTION 67, 2026-09-17); a test that omits it runs the blob's own 'var CAESARS_KEY = "williamhill_us"' | nothing when the test passes 'SETTLE_BOOK'; a test that omits it grades, edg…`
- docs/multibook-memo.md:265 — `> the feed's Caesars ('williamhill_us') is missing from **100% of hits rows (369/369) and`
- docs/multibook-memo.md:367 — `'williamhill_us' posted even ONE side (outside the two-sided fair gate); book match is`
- docs/multibook-memo.md:370 — `4. **Raw payload, canonical keys** (PIT@AZ 07-28, on disk): 'williamhill_us' posts exactly`
- docs/multibook-memo.md:374 — `incl. one empty far-out event): 'williamhill_us' posts **'batter_hits_alternate' — 48`
- docs/nfl-desk.md:37 — `…15 }', spreadBlend '{ mkt .75, fpi .25 }', pinnacleWeight 2, minBooks 2, settleBook 'williamhill_us' (Caesars), matchWindowMs 3 h. The pipeline ('buildCfbBoard', 'priceGame', 'kell…`
- docs/nfl-desk.md:82 — `…ingRevalidateSec 1800, czMissingWindowSec 4 h, regions 'us', minBooks 2, settleBook 'williamhill_us', dailyBudget **1000**, measuredCreditsPerEvent **31**. Props rows' 'headshot' i…`
- docs/progress.md:96 — `Refresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that re…`
- docs/progress.md:224 — `… and picks over the last 7/15/30/60/120 games, and a tighter, game-like layout after the Caesars/William Hill app (no screenshots came through; the known chip layout was followed).`
- docs/session-handoff.md:450 — `…empty-market hold as well as quote-age reuse. Three-book quotes (DraftKings, Caesars/williamhill_us, FanDuel) remain fetched together and repriced locally per selection. API covera…`
- docs/session-handoff.md:484 — `Refresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that re…`
- docs/session-handoff.md:852 — `… the margin, every book quoted at its own line with EV re-evaluated there, Caesars ('williamhill_us') the settle book, letter grades from the shared 'gradeFromEv', quarter-Kelly ca…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:861 — `…very tab). Point 2 is a standing rule, not a change: the settle book stays Caesars ('williamhill_us') on both desks until Josh says he is in another state on DraftKings or FanDuel,…`
- docs/session-handoff.md:1706 — `… HR live props on the board and just starting. I can access them on the Draftkings, william hill & caesars apps. I refreshed the board as well from 5:00pm last refresh to 7:03pm. I…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1712 — `…n filters". NO screenshots came through; the chip grammar follows the known Caesars/William Hill layout (tight ~28–30px pill rows, minimal gaps). Shipped: **GenSheet rewritten** ('…` [long line; 1 occurrences on this line; first shown]

##### William Hill / williamhill_us — tools (1 lines)

- tools/snapshot_props.py:27 — `CZ = "williamhill_us"`

#### czr (whole word)

8 matching lines in 6 files (13 occurrences).

Note: Whole-word only. legacy/index.html:1325-1326 `czr` is a local variable (the settlement-book run-line row), not a book key.

##### czr (whole word) — config (1 lines)

- src/lib/sportsbook/books.ts:18 — `if(['cz','czr','caesars','williamhillus'].includes(v))return 'williamhill_us';`

##### czr (whole word) — calculations (3 lines)

- legacy/index.html:1325 — `var czr=use.filter(function(x){return x.cz;})[0];`
- legacy/index.html:1326 — `if(czr){o.home_rl_cz=czr.h;o.away_rl_cz=czr.a;}` [x3]
- src/engine/legacy-src.gen.ts:5 — `…y counts when Caesars quotes the same modal ±1.5 point the engine prices */\n var czr=use.filter(function(x){return x.cz;})[0];\n if(czr){o.home_rl_cz=czr.h;o.away_rl…` [long line; 4 occurrences on this line; first shown]

##### czr (whole word) — UI (2 lines)

- app/builder/page.tsx:1179 — `{fmtPct(slipCalc.p)} true · <span className="text-gold">{fmtAmerican(decToAm(slipCalc.dec))}</span> @ CZR`
- app/design/page.tsx:286 — `<div className="display text-[34px] text-gold">CZR</div>`

##### czr (whole word) — tests (2 lines)

- tests/board-settled.test.ts:130 — `pregame number four more ways — EV @ CZR, the green EDGE badge, the ¼-Kelly stake chip and`
- tests/board-settled.test.ts:220 — `// EV @ CZR and EV @ basis`

#### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded)

2951 matching lines in 263 files (5409 occurrences).

Note: Token rule: an identifier containing cz that starts with cz/CZ/Cz, or has a camelCase Cz, or a snake _cz/cz_ part. Excluded as false positives: player names (Fiedorowicz, Juszczyk, Kochanowicz, Blachowicz, Bryczek, Oleksiejczuk, Kowalkiewicz, Czarevitch), the word Czech, and hash/base64 blobs. Since 2026-09-17 every cz* field means 'the settlement book' = DraftKings (src/engine/index.ts:296-300), except in tools/snapshot_props.py and the pl-history archives, where cz is still literally Caesars (tools/snapshot_props.py:27).

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — fetch code (39 lines)

- app/api/picks/route.ts:45 — `cz?: number | null;`
- app/api/picks/route.ts:144 — `cz: r.cz ?? null,` [x2]
- app/api/ufcprops/route.ts:23 — `type Prop = { label: string; cz: number; bestBook: string | null; bestOdds: number | null; medImplied: number; books: number };`
- app/api/ufcprops/route.ts:24 — `type Fight = { a: string; b: string; czMlA: number | null; czMlB: number | null; props: Prop[] };` [x2]
- app/api/ufcprops/route.ts:61 — `cur.czMlB = cells[selected] ?? null;`
- app/api/ufcprops/route.ts:64 — `cur = { a: label, b: "", czMlA: cells[selected] ?? null, czMlB: null, props: [], half: true };` [x2]
- app/api/ufcprops/route.ts:68 — `const cz = cells[selected];`
- app/api/ufcprops/route.ts:75 — `cur.props.push({ label, cz, bestBook, bestOdds, medImplied: med, books: others.length });`
- legacy/index.html:1277 — `(g.bookmakers||[]).forEach(function(bk){var bn=bk.title||bk.key,cz=bk.key===CAESARS_KEY;`
- src/lib/mlb/live-client.ts:76 — `* wrong: 'pLive' is a FRACTION in [0,1] (the engine's 'shSimGames(...).legP'), and 'evCz' is in`
- src/lib/mlb/live-client.ts:77 — `* PERCENTAGE POINTS like 'PickRow.czEv', so it feeds 'gradeFromEv' and 'EvBadge' unconverted.`
- src/lib/mlb/live-client.ts:99 — `* 'quote.czAm' read at each call site.`
- src/lib/mlb/live-client.ts:103 — `* every field on that object is the OVER's: 'czAm' is the Over price, 'evCz' is the Over's EV,` [x2]
- src/lib/mlb/live-client.ts:134 — `am: over ? q.czAm : q.oppAm,`
- src/lib/mlb/live-client.ts:135 — `ev: over ? q.evCz : q.evOpp ?? null,`
- src/lib/server/football-props.ts:5 — `import { czMissingGameIds, parseEventProps, propsCoverage, propsWindowSec, selectPropEvents } from "@/lib/cfb/props";`
- src/lib/server/football-props.ts:6 — `import { affordableEvents, boardFresh, czMissingDue, liveReserveCredits, pricedAgeMs, propsStore, pullCredits, type CfbPropsStore } from "@/lib/cfb/props-store";`
- src/lib/server/football-props.ts:62 — `* Caesars quote ('czMissingGameIds', props.ts — keyed on the market, so a game with Caesars yardage`
- src/lib/server/football-props.ts:63 — `* props but no Caesars anytime TD yet still re-checks), with kickoff inside CFB_PROPS.czMissingWindowSec`
- src/lib/server/football-props.ts:64 — `* (4 h), is re-fetched once its own pricedAt is older than CFB_PROPS.czMissingRevalidateSec (30 min) —`
- src/lib/server/football-props.ts:65 — `* 'czMissingDue' (props-store.ts). A game with ZERO rows is never Caesars-missing: it stays on the 2 h`
- src/lib/server/football-props.ts:79 — `* priced games only: 'czMissing' and 'noProps' (zero rows) — 'propsCoverage' — and when 'czMissing'` [x2]
- src/lib/server/football-props.ts:80 — `* > 0 its 'ttlSec' is min(window, czMissingRevalidateSec) so the phone's own staleness follows the`
- src/lib/server/football-props.ts:218 — `czMissing: 0,`
- src/lib/server/football-props.ts:237 — `const storedCzMissing = czMissingGameIds(stored?.rows ?? []);` [x2]
- src/lib/server/football-props.ts:240 — `const czDue = (g: CfbGame): boolean =>`
- src/lib/server/football-props.ts:241 — `!!stored && storedIds.has(g.id) && czMissingDue(stored, { id: g.id, status: g.status, kickoffMs: Date.parse(g.start) }, storedCzMissing.has(g.id), now, cfg.props);` [x2]
- src/lib/server/football-props.ts:242 — `const czDueIds = new Set(events.filter(czDue).map((g) => g.id));` [x2]
- src/lib/server/football-props.ts:245 — `const ttlFor = (czMissing: number): number => (czMissing > 0 ? Math.min(windowSec, cfg.props.czMissingRevalidateSec) : windowSec);` [x3]
- src/lib/server/football-props.ts:249 — `if (!refresh && stored && boardFresh(stored, now, windowSec) && czDueIds.size === 0) {`
- src/lib/server/football-props.ts:258 — `ttlSec: Math.min(ttlFor(coverage.czMissing), stored.ttlSec ?? windowSec),`
- src/lib/server/football-props.ts:284 — `type Why = "live" | "unpriced" | "czMissing" | "expired" | "refresh";`
- src/lib/server/football-props.ts:285 — `const WHY_RANK: Record<Why, number> = { live: 0, unpriced: 1, czMissing: 2, expired: 3, refresh: 3 };`
- src/lib/server/football-props.ts:300 — `return czDueIds.has(g.id) ? "czMissing" : null;` [x2]
- src/lib/server/football-props.ts:312 — `'need' is already ordered live → unpriced → czMissing → expired (WHY_RANK above), and that`
- src/lib/server/football-props.ts:359 — `ORDER: each half keeps 'need''s own order (live → unpriced → czMissing → expired), so the only`
- src/lib/server/football-props.ts:444 — `ttlSec: ttlFor(coverage.czMissing),`
- src/lib/server/football-props.ts:471 — `return refresh || w === "czMissing" || (w === "live" && storedIds.has(g.id)) ? { cache: "no-store" } : { next: { revalidate: pullSec } };`
- src/lib/server/football-props.ts:531 — `ttlSec: ttlFor(coverage.czMissing),`

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — config (13 lines)

- src/lib/cfb/rules.ts:439 — `MARKET with rows, carries no Caesars quote ('czMissingGameIds' — keyed on the market, so Caesars`
- src/lib/cfb/rules.ts:441 — `'czMissingWindowSec' (4 h) ahead, is re-fetched once its own pricedAt is older than`
- src/lib/cfb/rules.ts:442 — `'czMissingRevalidateSec' (30 min) — instead of the 2 h carry. A game with ZERO rows is NOT`
- src/lib/cfb/rules.ts:471 — `czMissingRevalidateSec: 1800,`
- src/lib/cfb/rules.ts:473 — `czMissingWindowSec: 4 * 3600,`
- src/lib/football/league.ts:85 — `czMissingRevalidateSec: number;`
- src/lib/football/league.ts:86 — `czMissingWindowSec: number;`
- src/lib/mlb/live-props-rules.ts:230 — `* milestone products that only fill 'row.cz' and the DK/FD basis; nine markets against six is +50%`
- src/lib/nfl/rules.ts:193 — `czMissingRevalidateSec: 1800,`
- src/lib/nfl/rules.ts:194 — `czMissingWindowSec: 4 * 3600,`
- src/lib/nfl/rules.ts:211 — `* across a 10:00/13:25/17:20 ET slate, and late kickoffs are re-asked as 'czMissing' — was refused`
- src/lib/sportsbook/books.ts:2 — `{key:'williamhill_us',label:'Caesars',short:'CZ'},`
- src/lib/sportsbook/books.ts:18 — `if(['cz','czr','caesars','williamhillus'].includes(v))return 'williamhill_us';` [x2]

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — caches (90 lines)

- app/api/prefs/route.ts:3 — `CZ_MAX_BYTES,`
- app/api/prefs/route.ts:4 — `mergeCzHidden,`
- app/api/prefs/route.ts:5 — `migrateCzHidden,`
- app/api/prefs/route.ts:6 — `pruneCzHidden,`
- app/api/prefs/route.ts:7 — `validateCzHidden,`
- app/api/prefs/route.ts:8 — `type CzHiddenMap,`
- app/api/prefs/route.ts:9 — `} from "@/lib/cz-hidden-merge";`
- app/api/prefs/route.ts:19 — `* replaces — last-write-wins per key by 'at', see cz-hidden-merge.ts), so two`
- app/api/prefs/route.ts:27 — `type Stored = { czHidden: CzHiddenMap; at: number };` [x2]
- app/api/prefs/route.ts:38 — `/* Team-less keys (2026-09-28, see migrateCzHidden): the stored copy is read in the bare form, so`
- app/api/prefs/route.ts:42 — `if (!s?.czHidden) return null;`
- app/api/prefs/route.ts:43 — `const v = validateCzHidden(s.czHidden);` [x2]
- app/api/prefs/route.ts:44 — `return v.ok ? { czHidden: migrateCzHidden(v.map), at: s.at } : null;` [x2]
- app/api/prefs/route.ts:52 — `return NextResponse.json({ czHidden: s?.czHidden ?? {}, at: s?.at ?? null });` [x2]
- app/api/prefs/route.ts:61 — `let body: { czHidden?: unknown };`
- app/api/prefs/route.ts:67 — `const v = validateCzHidden(body.czHidden);` [x2]
- app/api/prefs/route.ts:72 — `const merged = pruneCzHidden(mergeCzHidden(cur?.czHidden ?? {}, migrateCzHidden(v.map)), Date.now());` [x4]
- app/api/prefs/route.ts:73 — `if (JSON.stringify(merged).length > CZ_MAX_BYTES) {`
- app/api/prefs/route.ts:77 — `await redis(["SET", STORE_KEY, JSON.stringify({ czHidden: merged, at } satisfies Stored)]);`
- app/api/prefs/route.ts:78 — `return NextResponse.json({ ok: true, czHidden: merged, at });`
- src/lib/cfb/props-store.ts:48 — `* czMissingRevalidateSec and czMissingWindowSec equal to CFB_PROPS), and 'czMissingDue' takes an` [x3]
- src/lib/cfb/props-store.ts:198 — `* Yes when it is on the stored board, 'czMissing' is true — the caller's 'czMissingGameIds(rows)'` [x2]
- src/lib/cfb/props-store.ts:202 — `* kickoff ('kickoffMs') is inside CFB_PROPS.czMissingWindowSec ahead of 'now', and its own pricedAt`
- src/lib/cfb/props-store.ts:203 — `* is older than CFB_PROPS.czMissingRevalidateSec (an unreadable stamp reads as due). A live game, a`
- src/lib/cfb/props-store.ts:207 — `export function czMissingDue(`
- src/lib/cfb/props-store.ts:210 — `czMissing: boolean,`
- src/lib/cfb/props-store.ts:212 — `props: Pick<LeagueProps, "czMissingWindowSec" | "czMissingRevalidateSec"> = CFB_PROPS,` [x2]
- src/lib/cfb/props-store.ts:214 — `if (game.status !== "upcoming" || !czMissing) return false;`
- src/lib/cfb/props-store.ts:216 — `if (!Number.isFinite(ahead) || ahead < 0 || ahead > props.czMissingWindowSec * 1000) return false;`
- src/lib/cfb/props-store.ts:218 — `return age == null || age > props.czMissingRevalidateSec * 1000;`
- src/lib/cz-hidden-merge.ts:4 — `* the client (cz-offered.ts) and /api/prefs both use it, so both sides agree`
- src/lib/cz-hidden-merge.ts:19 — `export type CzPrefEntry = { hidden: boolean; at: number };`
- src/lib/cz-hidden-merge.ts:20 — `export type CzHiddenMap = Record<string, CzPrefEntry>;` [x2]
- src/lib/cz-hidden-merge.ts:22 — `export const CZ_MAX_KEYS = 4000;`
- src/lib/cz-hidden-merge.ts:23 — `export const CZ_MAX_KEY_LEN = 240;`
- src/lib/cz-hidden-merge.ts:24 — `export const CZ_MAX_BYTES = 256 * 1024;`
- src/lib/cz-hidden-merge.ts:28 — `export const CZ_PRUNE_MS = 45 * 24 * 3600 * 1000;`
- src/lib/cz-hidden-merge.ts:30 — `export function validateCzHidden(v: unknown): { ok: true; map: CzHiddenMap } | { ok: false; error: string } {` [x2]
- src/lib/cz-hidden-merge.ts:32 — `return { ok: false, error: "czHidden must be an object map" };`
- src/lib/cz-hidden-merge.ts:35 — `if (keys.length > CZ_MAX_KEYS) return { ok: false, error: 'czHidden over ${CZ_MAX_KEYS} keys' };` [x3]
- src/lib/cz-hidden-merge.ts:36 — `const map: CzHiddenMap = {};`
- src/lib/cz-hidden-merge.ts:38 — `if (k.length > CZ_MAX_KEY_LEN) return { ok: false, error: "czHidden key too long" };` [x2]
- src/lib/cz-hidden-merge.ts:41 — `return { ok: false, error: 'czHidden["${k.slice(0, 40)}"] must be {hidden, at}' };`
- src/lib/cz-hidden-merge.ts:44 — `if (typeof hidden !== "boolean") return { ok: false, error: 'czHidden["${k.slice(0, 40)}"].hidden must be boolean' };`
- src/lib/cz-hidden-merge.ts:46 — `return { ok: false, error: 'czHidden["${k.slice(0, 40)}"].at must be a finite timestamp' };`
- src/lib/cz-hidden-merge.ts:54 — `function newer(ea: CzPrefEntry, eb: CzPrefEntry): CzPrefEntry {` [x3]
- src/lib/cz-hidden-merge.ts:60 — `export function mergeCzHidden(a: CzHiddenMap, b: CzHiddenMap): CzHiddenMap {` [x4]
- src/lib/cz-hidden-merge.ts:61 — `const out: CzHiddenMap = {};`
- src/lib/cz-hidden-merge.ts:72 — `export const CZ_NULL_TEAM = " (null)|";`
- src/lib/cz-hidden-merge.ts:83 — `* stays in the hidden count. Idempotent and commutes with mergeCzHidden, so it runs at every door`
- src/lib/cz-hidden-merge.ts:85 — `* BEFORE pruneCzHidden: an old tombstone must out-vote its pair before the prune can drop it.`
- src/lib/cz-hidden-merge.ts:88 — `export function migrateCzHidden(map: CzHiddenMap): CzHiddenMap {` [x3]
- src/lib/cz-hidden-merge.ts:90 — `if (!keys.some((k) => k.includes(CZ_NULL_TEAM))) return map;`
- src/lib/cz-hidden-merge.ts:91 — `const byKey = new Map<string, CzPrefEntry>();`
- src/lib/cz-hidden-merge.ts:93 — `const bare = k.split(CZ_NULL_TEAM).join("|");`
- src/lib/cz-hidden-merge.ts:97 — `const out: CzHiddenMap = {};`
- src/lib/cz-hidden-merge.ts:102 — `export function pruneCzHidden(map: CzHiddenMap, now: number): CzHiddenMap {` [x3]
- src/lib/cz-hidden-merge.ts:103 — `const out: CzHiddenMap = {};`
- src/lib/cz-hidden-merge.ts:105 — `if (!e.hidden && now - e.at > CZ_PRUNE_MS) continue;`
- src/lib/cz-offered.ts:7 — `import { mergeCzHidden, migrateCzHidden, pruneCzHidden, validateCzHidden, type CzHiddenMap } from "./cz-hidden-merge";` [x6]
- src/lib/cz-offered.ts:19 — `* key under pl_cz_hidden_v2 and rides the ledger-sync phrase (x-pl-sync via`
- src/lib/cz-offered.ts:24 — `* so they out-vote stale hides on other devices; see cz-hidden-merge.ts.`
- src/lib/cz-offered.ts:29 — `* "Name (null)" and is now the bare name. migrateCzHidden rewrites those keys`
- src/lib/cz-offered.ts:34 — `const KEY_V1 = "pl_cz_hidden_v1";`
- src/lib/cz-offered.ts:35 — `const KEY = "pl_cz_hidden_v2";`
- src/lib/cz-offered.ts:40 — `export function loadCzHidden(): CzHiddenMap {` [x2]
- src/lib/cz-offered.ts:44 — `const v = validateCzHidden(JSON.parse(raw));`
- src/lib/cz-offered.ts:46 — `const map = migrateCzHidden(v.map);`
- src/lib/cz-offered.ts:53 — `const map: CzHiddenMap = {};`
- src/lib/cz-offered.ts:55 — `return migrateCzHidden(map);`
- src/lib/cz-offered.ts:61 — `function save(map: CzHiddenMap) {`
- src/lib/cz-offered.ts:75 — `export async function pullMergeCzHidden(local: CzHiddenMap): Promise<CzHiddenMap | null> {` [x3]
- src/lib/cz-offered.ts:82 — `const j = (await res.json()) as { czHidden?: unknown };`
- src/lib/cz-offered.ts:83 — `const v = j.czHidden != null ? validateCzHidden(j.czHidden) : null;` [x3]
- src/lib/cz-offered.ts:85 — `const remote = v?.ok ? migrateCzHidden(v.map) : {};`
- src/lib/cz-offered.ts:86 — `const merged = pruneCzHidden(mergeCzHidden(local, remote), Date.now());` [x2]
- src/lib/cz-offered.ts:95 — `function schedulePush(map: CzHiddenMap) {`
- src/lib/cz-offered.ts:107 — `body: JSON.stringify({ czHidden: map }),`
- src/lib/cz-offered.ts:112 — `export function useCzHidden(): {`
- src/lib/cz-offered.ts:113 — `hidden: CzHiddenMap;`
- src/lib/cz-offered.ts:119 — `const [hidden, setHidden] = useState<CzHiddenMap>({});`
- src/lib/cz-offered.ts:121 — `const local = loadCzHidden();`
- src/lib/cz-offered.ts:123 — `void pullMergeCzHidden(local).then((merged) => {`
- src/lib/cz-offered.ts:143 — `const next: CzHiddenMap = { ...h };`
- src/lib/ledger-merge.ts:312 — `* prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),` [x2]
- src/lib/ledger-merge.ts:1992 — `czOdds / czDec either. Deleting hands the arithmetic back to the grader, which reads finals` [x2]
- src/lib/useLedger.ts:71 — `czOdds?: string | number;`
- src/lib/useLedger.ts:72 — `czDec?: number;`
- src/lib/useLedger.ts:74 — `czEv?: number | null;`
- src/lib/useLedger.ts:79 — `legs: { label: string; prop: string; cz?: number | null; lkey?: string | null; gkey?: string | null }[];`

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — calculations (499 lines)

- legacy/index.html:294 — `.shczno{background:rgba(120,180,255,.06);border:1px solid rgba(120,180,255,.3);border-radius:10px;padding:9px 12px;margin:10px 0;font-size:12px;line-height:1.5;color:var(--muted)}`
- legacy/index.html:295 — `.shczok{background:none;border:1px solid var(--line);border-radius:7px;color:var(--fg);font-size:11px;padding:3px 10px;margin-left:6px;cursor:pointer}`
- legacy/index.html:1071 — `a core ticket must clear at the SELECTION price (basis in dk_fd, CZ in ev_gated).`
- legacy/index.html:1072 — `UNITS: percent, same as czEv/bsEv — 2 means +2% EV (the user request "0.02" is the`
- legacy/index.html:1077 — `coreCzEvMin — settlement floor: selection prices at the DK/FD basis, but every ticket`
- legacy/index.html:1087 — `coreCzEvMin:0,coreMaxLegs:3,outsSusp:true/* 2026-07-31 signed off: pitcher_outs suspended from auto-selection in the disciplined modes pending the M2 interlocked-pair fix (docs/p…`
- legacy/index.html:1280 — `if(hp!=null&&ap!=null)mls.push({h:hp,a:ap,book:bn,k:bk.key,cz:cz});}` [x2]
- legacy/index.html:1282 — `if(hr!=null&&ar!=null&&hpt!=null&&apt!=null)rls.push({h:hr,a:ar,hpt:hpt,apt:apt,book:bn,k:bk.key,cz:cz});}` [x2]
- legacy/index.html:1286 — `if(tpt!=null)tots.push({pt:tpt,o:tov,u:tun,book:bn,k:bk.key,cz:cz});}` [x2]
- legacy/index.html:1296 — `o.ml_booksInd=mls.filter(function(x){return !x.cz&&shDevigPair(shImp(x.h),shImp(x.a))!=null;}).length;`
- legacy/index.html:1303 — `var czm=mls.filter(function(x){return x.cz;})[0];` [x2]
- legacy/index.html:1304 — `if(czm){o.home_ml_cz=czm.h;o.away_ml_cz=czm.a;}` [x5]
- legacy/index.html:1318 — `o.rl_booksInd=use.filter(function(x){return !x.cz&&shDevigPair(shImp(x.h),shImp(x.a))!=null;}).length;`
- legacy/index.html:1325 — `var czr=use.filter(function(x){return x.cz;})[0];` [x2]
- legacy/index.html:1326 — `if(czr){o.home_rl_cz=czr.h;o.away_rl_cz=czr.a;}` [x5]
- legacy/index.html:1342 — `var czt=tots.filter(function(x){return x.cz&&x.o!=null&&x.u!=null;})[0];` [x2]
- legacy/index.html:1343 — `if(czt)o.total_cz={pt:czt.pt,o:czt.o,u:czt.u};` [x5]
- legacy/index.html:1370 — `var acc={},bookNames={},altCz={},altBs={};`
- legacy/index.html:1371 — `bks.forEach(function(bk){var bn=bk.title||bk.key,czb=bk.key===CAESARS_KEY;bookNames[bn]=1;`
- legacy/index.html:1377 — `Caesars fills czAlt (as before); DK/FD fill altBs so the dk_fd basis`
- legacy/index.html:1382 — `if(!czb&&!bsb)return;`
- legacy/index.html:1388 — `if(czb){`
- legacy/index.html:1389 — `var ab=altCz[abase]=altCz[abase]||{};` [x2]
- legacy/index.html:1405 — `Object.keys(tmp).forEach(function(kk){m.rows[kk].list.push({o:tmp[kk].o,u:tmp[kk].u,book:bn,k:bk.key,cz:czb});});` [x2]
- legacy/index.html:1411 — `/* the cz flag rides through the fair map (2026-07-26): without it the count`
- legacy/index.html:1414 — `var fairs=r.list.map(function(x){var v=shDevigPair(shImp(x.o),shImp(x.u));return v==null?null:{v:v,w:shBookW(x.k),cz:!!x.cz};}).filter(function(v){return v!=null;});` [x2]
- legacy/index.html:1418 — `var czx=r.list.filter(function(x){return x.cz;})[0];` [x2]
- legacy/index.html:1419 — `var czAlt=(!czx&&altCz[mkey])?altCz[mkey][kk]:null; /* ladder fallback: standard Caesars quote wins */` [x4]
- legacy/index.html:1433 — `booksInd:fairs.filter(function(f){return !f.cz;}).length,`
- legacy/index.html:1434 — `cz:czx?{o:(czx.o!=null?czx.o:null),u:(czx.u!=null?czx.u:null)}:(czAlt?{o:czAlt.o,u:czAlt.u}:null),` [x9]
- legacy/index.html:1442 — `there (see the czAlt fallback above), so selection is untouched. */`
- legacy/index.html:1443 — `… slate.props[e.away_team+" @ "+e.home_team+shGm(gnE)]={book:Object.keys(bookNames).length+" books",markets:g,alt:altCz,live:!!slate.liveInfo[shGkey(e.away_team,e.home_team,gnE)]};}`
- legacy/index.html:2191 — `czN:(homeSide?go.home_ml_cz:go.away_ml_cz)!=null?(homeSide?go.home_ml_cz:go.away_ml_cz):null,` [x5]
- legacy/index.html:2200 — `oppCz:(homeSide?go.away_ml_cz:go.home_ml_cz)!=null?(homeSide?go.away_ml_cz:go.home_ml_cz):null,` [x5]
- legacy/index.html:2218 — `czN:(side?go.home_rl_cz:go.away_rl_cz)!=null?(side?go.home_rl_cz:go.away_rl_cz):null,` [x5]
- legacy/index.html:2226 — `oppCz:(side?go.away_rl_cz:go.home_rl_cz)!=null?(side?go.away_rl_cz:go.home_rl_cz):null,` [x5]
- legacy/index.html:2500 — `czN:(row.cz&&(sd.side==="O"?row.cz.o:row.cz.u)!=null)?(sd.side==="O"?row.cz.o:row.cz.u):null,` [x6]
- legacy/index.html:2530 — `var czN=(r.czN!=null)?r.czN:null,czDec=czN!=null?amToDec(czN):null;` [x6]
- legacy/index.html:2531 — `var czEv=czDec!=null?shEV(r.p,czDec):null;` [x3]
- legacy/index.html:2532 — `var czImp=czN!=null?shImp(czN):null;` [x3]
- legacy/index.html:2533 — `var czKellyF=czDec!=null?Math.min(0.25*shKelly(r.p,czDec),0.02):null;` [x3]
- legacy/index.html:2543 — `cz:czN,czOdds:czN!=null?obSign(czN):null,` [x5]
- legacy/index.html:2544 — `czEv:czEv!=null?Math.round(czEv*1000)/10:null,` [x3]
- legacy/index.html:2550 — `czEdge:(czImp!=null)?Math.round((r.imp-czImp)*1000)/10:null,` [x3]
- legacy/index.html:2551 — `czKellyF:czKellyF!=null?Math.round(czKellyF*10000)/10000:null,` [x3]
- legacy/index.html:2552 — `czBadge:!!(czEv!=null&&czEv>=thresh&&czEv>=band)&&!suspRow,noParlay:!!r.noParlay,` [x4]
- legacy/index.html:2557 — `opp:(r.oppLabel!=null)?{label:r.oppLabel,odds:r.oppOdds||null,cz:(r.oppCz!=null?r.oppCz:null),` [x3]
- legacy/index.html:2600 — `var lk=shLegKey(row.p,mkt,row.ln),md=modelBy[lk]||null,cz=row.cz||null;` [x2]
- legacy/index.html:2602 — `var iO=shImp(oAm!=null?oAm:(cz?cz.o:null)),iU=shImp(uAm!=null?uAm:(cz?cz.u:null));` [x4]
- legacy/index.html:2608 — `cz:(cz&&(cz.o!=null||cz.u!=null))?{o:(cz.o!=null?cz.o:null),u:(cz.u!=null?cz.u:null)}:null,` [x8]
- legacy/index.html:2625 — `if(row.o==null&&row.u==null&&!row.cz)return;`
- legacy/index.html:2638 — `rows.push(shPropRow(mkt,{p:who,ln:ln,o:null,u:null,cz:{o:ab[kk].o,u:ab[kk].u}},true));});`
- legacy/index.html:2649 — `cz:(x.r.cz!=null?x.r.cz:null),bs:(x.r.bs!=null?x.r.bs:null),bsBook:x.r.bsBook||null,` [x3]
- legacy/index.html:2695 — `to the leg's own numbers, the simJoint and corr loops need >=2 and no-op, cz/bs/cons`
- legacy/index.html:2743 — `var czDec=1,czAll=true;` [x2]
- legacy/index.html:2744 — `legs.forEach(function(l){var d2=l.cz!=null?amToDec(l.cz):null;if(d2)czDec*=d2;else czAll=false;});` [x4]
- legacy/index.html:2745 — `var czOddsT=czAll?decToAm(czDec):null;` [x3]
- legacy/index.html:2746 — `var czEvT=(czAll&&prob>0)?prob*czDec-1:null;` [x3]
- legacy/index.html:2758 — `var consCzEvT=(consAll&&czAll&&czDec>1)?consP*czDec-1:null; /* same read at the CZ price (ev_gated mode) */` [x5]
- legacy/index.html:2766 — `czOdds:(czOddsT!=null?obSign(czOddsT):null),czDec:czAll?Math.round(czDec*10000)/10000:null,` [x6]
- legacy/index.html:2767 — `czEv:czEvT!=null?Math.round(czEvT*1000)/10:null,` [x3]
- legacy/index.html:2771 — `consCzEv:consCzEvT!=null?Math.round(consCzEvT*1000)/10:null,posCorr:posCorr,negCorr:negCorr,` [x3]
- legacy/index.html:2861 — `consensus, EV at the Caesars quote when CZ hangs the same number), first-5`
- legacy/index.html:2878 — `var t={pt:m.total,model:m.pTotO,market:mktO,books:(go2&&go2.total_books)||0,final:fin,cz:null};`
- legacy/index.html:2879 — `if(go2&&go2.total_cz){t.cz=go2.total_cz;` [x3]
- legacy/index.html:2880 — `if(go2.total_cz.pt===m.total){`
- legacy/index.html:2881 — `t.evOver=shEV(fin,amToDec(go2.total_cz.o));`
- legacy/index.html:2882 — `t.evUnder=shEV(1-fin,amToDec(go2.total_cz.u));`
- legacy/index.html:2992 — `(d.parlays||[]).forEach(function(pl,idx){if(pl.czDec!=null)pool.push({pl:pl,src:"p",idx:idx});});`
- legacy/index.html:2994 — `if(pl.czDec!=null&&!pl.legs.some(function(l){return l.live;}))pool.push({pl:pl,src:"m",idx:idx});});`
- legacy/index.html:3010 — `/* dk_fd: length cap applies at the basis price — the CZ quote may not shape selection */`
- legacy/index.html:3011 — `var selDecE=(cfg.selMode==="dk_fd")?pl.bsDec:pl.czDec;`
- legacy/index.html:3025 — `"caesars_ev" is the legacy ¼-Kelly-at-CZ ranking. Both stay selectable in Settings.`
- legacy/index.html:3028 — `display + settlement only, and a ticket needs BOTH a basis and a CZ quote to play. */`
- legacy/index.html:3037 — `if(basisMode&&(w.pl.bsDec==null||w.pl.czDec==null))return; /* no DK/FD basis (or no CZ) → ineligible, never faked */` [x2]
- legacy/index.html:3038 — `var selEv=basisMode?w.pl.bsEv:w.pl.czEv;`
- legacy/index.html:3047 — `var czMin=(cfg.coreCzEvMin!=null)?cfg.coreCzEvMin:0;` [x3]
- legacy/index.html:3048 — `if(!(w.pl.czEv!=null&&Number(w.pl.czEv)>=czMin)){` [x3]
- legacy/index.html:3049 — `blocked.push({name:w.pl.name,type:w.pl.type||null,bsEv:basisMode?w.pl.bsEv:w.pl.czEv,czEv:w.pl.czEv,reason:"nv_tax"});return;}` [x3]
- legacy/index.html:3065 — `blocked.push({name:w.pl.name,type:w.pl.type||null,bsEv:basisMode?w.pl.bsEv:w.pl.czEv,czEv:w.pl.czEv,reason:"no_ind_consensus"});return;}` [x3]
- legacy/index.html:3077 — `var cEv=basisMode?w.pl.consEv:w.pl.consCzEv;`
- legacy/index.html:3079 — `blocked.push({name:w.pl.name,type:w.pl.type||null,bsEv:basisMode?w.pl.bsEv:w.pl.czEv,czEv:w.pl.czEv,consEv:cEv,reason:"consensus"});return;}` [x3]
- legacy/index.html:3082 — `var dec=(basisMode?w.pl.bsDec:w.pl.czDec)||2;`
- legacy/index.html:3200 — `var toWin=pl.czDec?Math.round(stake*(pl.czDec-1)):null;` [x2]
- legacy/index.html:3202 — `"<span class='shprop'>"+esc(pl.czOdds)+" @ Caesars</span></div>"+`
- legacy/index.html:3207 — `(pl.czEv!=null?"<span class='shchip "+(pl.czEv>=0?"edgeplus":"edgeminus")+"'>EV <b>"+(pl.czEv>=0?"+":"")+esc(String(pl.czEv))+"%</b></span>":"")+` [x4]
- legacy/index.html:3210 — `"<ul class='shlegs'>"+pl.legs.map(function(l){return "<li>"+esc(l.label+" · "+l.prop+" ("+(l.cz!=null?obSign(l.cz):l.odds)+")")+"</li>";}).join("")+"</ul>"+` [x2]
- legacy/index.html:3232 — `/* dk_fd: tiers cut at the basis price, and a FUN ticket still needs a CZ quote to play */`
- legacy/index.html:3234 — `if(bMode&&(w.pl.bsDec==null||w.pl.czDec==null))return;`
- legacy/index.html:3235 — `var tDec=bMode?w.pl.bsDec:w.pl.czDec;`
- legacy/index.html:3244 — `var ev=((bm2?b.w.pl.bsEv:b.w.pl.czEv)||0)-((bm2?a.w.pl.bsEv:a.w.pl.czEv)||0);if(Math.abs(ev)>1e-9)return ev;` [x2]
- legacy/index.html:3359 — `var dec=(SH_CFG.selMode==="dk_fd")?pl.bsDec:pl.czDec;`
- legacy/index.html:3401 — `stake:p.stake,czOdds:pl.czOdds,czDec:pl.czDec,prob:pl.prob,czEv:(pl.czEv!=null?pl.czEv:null),fair:pl.fair||null,` [x7]
- legacy/index.html:3405 — `legs:pl.legs.map(function(l){return {label:l.label,prop:l.prop,cz:l.cz,game:l.game,gkey:l.gkey||null,lkey:l.lkey||null,est:l.est,` [x2]
- legacy/index.html:3413 — `reads SH.board.data with no re-fetch and shTicketSnap writes czOdds/czDec straight` [x2]
- legacy/index.html:3530 — `var dec=(t.confirmed!=null)?amToDec(t.confirmed):t.czDec;`
- legacy/index.html:3539 — `"<span class='shprop'>"+esc(t.confirmed!=null?obSign(t.confirmed)+" (NV)":t.czOdds+" @ Caesars")+"</span></div>"+`
- legacy/index.html:3546 — `return "<li>"+esc(l.label+" · "+l.prop+" ("+(l.cz!=null?obSign(l.cz):"—")+")")+` [x2]
- legacy/index.html:3548 — `… (!started&&!gr?"<div class='shconfrow'>NV price differs? <input class='shconf' data-czconfirm='"+esc(t.id)+"' placeholder='e.g. +450' value='"+(t.confirmed!=null?esc(obSign(t.con…`
- legacy/index.html:3645 — `var baseDec=(t.confirmed!=null)?amToDec(t.confirmed):t.czDec;`
- legacy/index.html:3649 — `if(res[i].result==="void"||res[i].result==="push"){var d2=l.cz!=null?amToDec(l.cz):null;` [x2]
- legacy/index.html:3727 — `if(lk==="ml_home"||lk==="ml_away"){var o=odds[mu];if(o)am=(lk==="ml_home")?o.home_ml_cz:o.away_ml_cz;}` [x2]
- legacy/index.html:3728 — `else if(lk==="rl_home"||lk==="rl_away"){var o2=odds[mu];if(o2)am=(lk==="rl_home")?o2.home_rl_cz:o2.away_rl_cz;}` [x2]
- legacy/index.html:3735 — `if(am==null&&pnorm(row.p)===parts[0]&&String(row.ln)===parts[2]&&row.cz&&row.cz[side]!=null)am=row.cz[side];});` [x3]
- legacy/index.html:3745 — `/* Caesars-only playable card: quant rows carry cz* fields — everything the user sees and`
- legacy/index.html:3746 — `stakes is Caesars' price. Legacy Claude-mode picks (no cz fields) keep the old display. */`
- legacy/index.html:3747 — `var czMode=(p.cz!==undefined&&p.cz!==null);` [x3]
- legacy/index.html:3748 — `var ev=czMode?((p.czEv==null)?null:Number(p.czEv)):((p.ev==null)?null:Number(p.ev));` [x3]
- legacy/index.html:3749 — `var kf=czMode?p.czKellyF:p.kellyF;` [x2]
- legacy/index.html:3751 — `var badge=czMode?p.czBadge:p.edgeBadge;` [x2]
- legacy/index.html:3754 — `var mOv=(czMode&&p.lkey&&p.lkey.indexOf("|")>=0)?String(p.sub||"").match(/ O (\d+\.5)$/):null;`
- legacy/index.html:3756 — `var priceTxt=czMode?(p.czOdds+" @ Caesars"+lad):(p.odds+(p.book?" @ "+p.book:""));` [x2]
- legacy/index.html:3757 — `var oddsForSlip=czMode?p.czOdds:p.odds;` [x2]
- legacy/index.html:3758 — `var czChip=(czMode&&p.czEdge!=null)?"<span class='shchip "+(p.czEdge>=0?"edgeplus":"edgeminus")+"'>CZ vs fair <b>"+(p.czEdge>=0?"+":"")+esc(String(p.czEdge))+"%</b></span>":"";` [x7]
- legacy/index.html:3771 — `czChip+`
- legacy/index.html:3810 — `if(!LS.get("pl_czNote",""))h+="<div class='shczno'>ℹ️ Playable prices are Caesars' national feed — the Nevada app can differ a touch. The ledger records the prices you confirm …` [x4]
- legacy/index.html:3849 — `if(p.cz===null){unav.push(p);return;}`
- legacy/index.html:3868 — `var czOk=(pl.czOdds!==undefined)?(pl.czOdds!=null):true; /* legacy tickets: no cz concept */` [x4]
- legacy/index.html:3869 — `if(!czOk){unav.push(pl);return;}`
- legacy/index.html:3870 — `var czMode=(pl.czOdds!=null);` [x2]
- legacy/index.html:3871 — `var oddsTxt=czMode?pl.czOdds+" @ Caesars":pl.odds;` [x2]
- legacy/index.html:3872 — `var toWin=czMode&&pl.czDec?Math.round(pl.stake*(pl.czDec-1)):pl.toWin;` [x3]
- legacy/index.html:3880 — `(czMode&&pl.czEv!=null?"<span class='shchip "+(pl.czEv>=0?"edgeplus":"edgeminus")+"'>EV @ CZ <b>"+(pl.czEv>=0?"+":"")+esc(String(pl.czEv))+"%</b></span>":"")+` [x6]
- legacy/index.html:3883 — `return "<li>"+esc(l.cz!=null?(l.label+" · "+l.prop+" ("+obSign(l.cz)+")"):l.txt)+"</li>";}).join("")+"</ul>"+` [x2]
- legacy/index.html:3888 — `unav.map(function(pl){var miss=pl.legs.filter(function(l){return l.cz==null;}).map(function(l){return l.label+" "+l.prop;}).join(", ");`
- legacy/index.html:3937 — `if(s&&s.am!=null&&lg.cz!=null){sighted++;sum+=(shImp(s.am)-shImp(lg.cz));}` [x2]
- legacy/index.html:3979 — `var dec=(t.confirmed!=null)?amToDec(t.confirmed):t.czDec;if(!dec)return;`
- legacy/index.html:4117 — `S.legs.push({id:uid(),label:p.label,prop:p.sub,odds:shOddsClean(p.czOdds!=null?p.czOdds:p.odds),est:String(p.prob)});` [x2]
- legacy/index.html:4122 — `S.legs.push({id:uid(),label:p.label,prop:p.sub,odds:shOddsClean(p.czOdds!=null?p.czOdds:p.odds),est:String(p.prob)});` [x2]
- legacy/index.html:4125 — `function shLegSlipOdds(l){return l.cz!=null?shOddsClean(obSign(l.cz)):l.odds;}` [x2]
- legacy/index.html:4209 — `var cz=e.target.closest?e.target.closest("[data-czdismiss]"):null;if(cz){LS.set("pl_czNote","1");shRender();return;}` [x4]
- legacy/index.html:4226 — `var ci=e.target&&e.target.getAttribute&&e.target.getAttribute("data-czconfirm");`
- src/engine/legacy-src.gen.ts:5 — `…n is the EV floor\n a core ticket must clear at the SELECTION price (basis in dk_fd, CZ in ev_gated).\n UNITS: percent, same as czEv/bsEv — 2 means +2% EV (the user request…` [long line; 315 occurrences on this line; first shown]
- src/engine2/allstar.ts:9 — `UI says "CZ-only" instead of pretending 15 books agreed.`
- src/engine2/allstar.ts:148 — `export const czTwoWay = (rows: BookTwoWay[]): BookTwoWay | null =>`
- src/engine2/allstar.ts:150 — `export const czOU = (rows: BookOU[]): BookOU | null =>`
- src/engine2/allstar.ts:385 — `covered++; // ML / F3 / F5 / totals — the feed already carries CZ's price`
- src/engine2/allstar.ts:422 — `note: string; // honesty tag: consensus width, CZ-only, book-anchored…`
- src/engine2/allstar.ts:449 — `const cz = czTwoWay(rows);` [x2]
- src/engine2/allstar.ts:450 — `if (!cz || !fair) return;`
- src/engine2/allstar.ts:459 — `const odds = side === "AL" ? cz.al : cz.nl;` [x2]
- src/engine2/allstar.ts:470 — `note: fair.n === 1 ? "CZ-only market, de-vigged two-way" : 'consensus of ${fair.n} books',`
- src/engine2/allstar.ts:480 — `const cz = czOU(rows);` [x2]
- src/engine2/allstar.ts:481 — `if (!cz || !fair) return;`
- src/engine2/allstar.ts:482 — `if (cz.point !== fair.point) {`
- src/engine2/allstar.ts:483 — `// CZ hangs a different number than the consensus point — the fair isn't`
- src/engine2/allstar.ts:484 — `// comparable at CZ's line; surface CZ's own de-vig instead` [x2]
- src/engine2/allstar.ts:485 — `const own = consensusProb([{ key: "williamhill_us", a: cz.over, b: cz.under }]);` [x2]
- src/engine2/allstar.ts:489 — `const odds = side === "Over" ? cz.over : cz.under;` [x2]
- src/engine2/allstar.ts:493 — `label: '${side} ${cz.point}',`
- src/engine2/allstar.ts:496 — `model: sim ? (() => { const o = sim.pOver(cz.point); const ex = o.over / (o.over + o.under); return side === "Over" ? ex : 1 - ex; })() : null,`
- src/engine2/allstar.ts:500 — `note: 'CZ ${cz.point} vs consensus ${fair.point} — own de-vig only',` [x2]
- src/engine2/allstar.ts:507 — `const odds = side === "Over" ? cz.over : cz.under;` [x2]
- src/engine2/calibration.ts:33 — `/* EV at the SELECTION price, in PERCENT (2026-07-26). UNITS TRAP: czEv/ev are percent`
- src/engine2/calibration.ts:35 — `had to be captured: the prediction blob already stored czEv/ev per row, and only the`
- src/engine2/sharpBoard.ts:25 — `cz: number | null;`
- src/engine2/sharpBoard.ts:26 — `czEv: number | null; // per $1 at CZ vs sharp fair` [x2]
- src/engine2/sharpBoard.ts:35 — `czOver: number | null;`
- src/engine2/sharpBoard.ts:36 — `czUnder: number | null;`
- src/engine2/sharpBoard.ts:37 — `czPoint: number | null;`
- src/engine2/sharpBoard.ts:76 — `let czAway: number | null = null;`
- src/engine2/sharpBoard.ts:77 — `let czHome: number | null = null;`
- src/engine2/sharpBoard.ts:87 — `czAway = away.price;`
- src/engine2/sharpBoard.ts:88 — `czHome = home.price;`
- src/engine2/sharpBoard.ts:95 — `czAway, czHome,` [x2]
- src/engine2/sharpBoard.ts:105 — `let cz: { point: number; over: number; under: number } | null = null;`
- src/engine2/sharpBoard.ts:114 — `if (bk.key === book) cz = { point: over.point, over: over.price, under: under.price };`
- src/engine2/sharpBoard.ts:120 — `if (!best) return { point: null, c: null, cz, bsOver: null, bsUnder: null };`
- src/engine2/sharpBoard.ts:122 — `// so basis EV is always apples-to-apples (unlike CZ, which can hang a different number)`
- src/engine2/sharpBoard.ts:128 — `cz,`
- src/engine2/sharpBoard.ts:148 — `// CZ total EV only comparable when CZ hangs the consensus point` [x2]
- src/engine2/sharpBoard.ts:149 — `const samePoint = tot.cz != null && tot.point != null && tot.cz.point === tot.point;` [x2]
- src/engine2/sharpBoard.ts:157 — `cz: ml.czAway,` [x2]
- src/engine2/sharpBoard.ts:158 — `czEv: ev(pAway, ml.czAway),` [x2]
- src/engine2/sharpBoard.ts:167 — `cz: ml.czHome,` [x2]
- src/engine2/sharpBoard.ts:168 — `czEv: ev(pHome, ml.czHome),` [x2]
- src/engine2/sharpBoard.ts:176 — `czPoint: tot.cz?.point ?? null,` [x2]
- src/engine2/sharpBoard.ts:177 — `czOver: tot.cz?.over ?? null,` [x2]
- src/engine2/sharpBoard.ts:178 — `czUnder: tot.cz?.under ?? null,` [x2]
- src/engine2/sharpBoard.ts:179 — `overEv: samePoint ? ev(overP, tot.cz!.over) : null,`
- src/engine2/sharpBoard.ts:180 — `underEv: samePoint && overP != null ? ev(1 - overP, tot.cz!.under) : null,`
- src/lib/bet-alert.ts:23 — `export type AlertLeg = { label?: string | null; prop?: string | null; cz?: number | null; gkey?: string | null };`
- src/lib/bet-alert.ts:27 — `czDec?: number | null;`
- src/lib/bet-alert.ts:28 — `czOdds?: number | null;`
- src/lib/bet-alert.ts:79 — `if (legs.length === 1 && Number.isFinite(legs[0].cz)) return Number(legs[0].cz);` [x2]
- src/lib/bet-alert.ts:80 — `if (Number.isFinite(t.czOdds)) return Number(t.czOdds);` [x2]
- src/lib/bet-alert.ts:81 — `if (Number.isFinite(t.czDec) && Number(t.czDec) > 1) return decToAmerican(Number(t.czDec));` [x3]
- src/lib/board-order.ts:9 — `* ev_gated → EV at Caesars (czEv) — the default; the EV *gate* itself`
- src/lib/board-order.ts:11 — `* caesars_ev → EV at Caesars (czEv), the legacy ranking`
- src/lib/board-order.ts:24 — `czEv?: number | string | null;`
- src/lib/board-order.ts:31 — `const v = mode === "dk_fd" ? r.bsEv : mode === "probability" ? r.prob : r.czEv;`
- src/lib/cfb/card.ts:94 — `if (!row.cz) return null;`
- src/lib/cfb/card.ts:96 — `const line = base === "ml" ? null : row.cz.line;`
- src/lib/cfb/card.ts:102 — `cz: row.cz.price,` [x2]
- src/lib/cfb/card.ts:134 — `dec *= decFromAmerican(leg.cz);`
- src/lib/cfb/card.ts:160 — `czOdds: decToAm(d.dec),`
- src/lib/cfb/card.ts:161 — `czDec: round(d.dec, 4),`
- src/lib/cfb/card.ts:163 — `czEv: round(d.ev, 2),`
- src/lib/cfb/card.ts:170 — `const better = (a: CfbRow, b: CfbRow) => (a.evCz ?? -Infinity) - (b.evCz ?? -Infinity) || a.fair - b.fair;` [x2]
- src/lib/cfb/card.ts:182 — `benched.push({ label: cur.label, evCz: cur.evCz ?? 0, reason: reason(r) });` [x2]
- src/lib/cfb/card.ts:185 — `benched.push({ label: r.label, evCz: r.evCz ?? 0, reason: reason(cur) });` [x2]
- src/lib/cfb/card.ts:225 — `const playable = board.games.flatMap((g) => (kicked(g) ? [] : g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market))));` [x2]
- src/lib/cfb/card.ts:228 — `const cands = playable.filter((r) => (r.evCz ?? -Infinity) >= R.minEvPct && (r.cz?.dec ?? Infinity) <= R.maxDec);` [x2]
- src/lib/cfb/card.ts:245 — `const eligible = playable.filter(r => Number.isFinite(r.evCz) && r.cz!.dec > 1 && r.cz!.dec <= R.maxDec);` [x3]
- src/lib/cfb/card.ts:251 — `…","rec_yds"].includes(r.market) && r.side!=="yes" && r.line!=null && r.line%1===0.5 && r.cz && r.cz.line===r.line && r.cz.dec<=R.maxDec && r.cz.dec>1 && r.fair!=null && r.fair>0 &&…` [x5]
- src/lib/cfb/card.ts:252 — `}).sort((a,b)=>(b.evCz??-Infinity)-(a.evCz??-Infinity)||a.key.localeCompare(b.key));` [x2]
- src/lib/cfb/card.ts:253 — `…rops.map(r=>({legs:[{label:r.label,prop:CFB_PROP_MARKETS.find(m=>m.id===r.market)!.label,cz:r.cz!.price,gkey:r.gameId,lkey:r.key,market:r.market,side:r.side as "over"|"under",line:…` [x4]
- src/lib/cfb/card.ts:304 — `(r) => !usedGames.has(r.gameId) && (r.evCz ?? -Infinity) >= R.forcedMinEvPct && (r.cz?.dec ?? Infinity) <= R.forcedMaxDec,` [x2]
- src/lib/cfb/card.ts:328 — `benched.push({ label: r.label, evCz: r.evCz ?? 0, reason: picked.length >= R.tickets.max ? "ticket cap reached" : "daily allotment reached" });` [x2]
- src/lib/cfb/card.ts:342 — `const funRows = playable.filter((r) => (r.evCz ?? -Infinity) >= R.fun.minEvPct);`
- src/lib/cfb/card.ts:345 — `return leg ? [{row,dec:row.cz!.dec,prob:leg.prob / Math.max(1e-9,1-leg.push)}] : [];`
- src/lib/cfb/found.ts:25 — `* ('r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market)') on games` [x2]
- src/lib/cfb/found.ts:97 — `!!r.cz && r.cz.line === r.line && r.cz.dec <= R.maxDec && r.cz.dec > 1 &&` [x4]
- src/lib/cfb/found.ts:98 — `r.fair != null && r.fair > 0 && r.fair < 1 && Number.isFinite(r.evCz) && (r.evCz as number) >= foundFootballMinEv(board.date, R.minEvPct) &&` [x2]
- src/lib/cfb/found.ts:106 — `cz: r.cz!.price,` [x2]
- src/lib/cfb/found.ts:121 — `dec: r.cz!.dec,`
- src/lib/cfb/found.ts:123 — `ev: r.evCz!,`
- src/lib/cfb/found.ts:138 — `(r) => r.playable && r.cz != null && r.evCz != null && !isH1Market(r.market) && r.evCz >= foundFootballMinEv(board.date, R.minEvPct) && r.cz.dec <= R.maxDec,` [x4]
- src/lib/cfb/grade.ts:356 — `dec *= decFromAmerican(legs[i].cz);`
- src/lib/cfb/lock-server.ts:111 — `* It used to count any row with 'cz != null' on a game whose START is in the future. The card`
- src/lib/cfb/lock-server.ts:112 — `* requires more: src/lib/cfb/card.ts keeps 'r.playable && r.cz != null && r.evCz != null' on` [x2]
- src/lib/cfb/lock-server.ts:113 — `* un-kicked games, and src/lib/cfb/model.ts sets 'playable = !!sq.cz && upcoming', where`
- src/lib/cfb/lock-server.ts:125 — `for (const r of g.rows) if (r.playable && r.cz != null && r.evCz != null) n++;` [x2]
- src/lib/cfb/model.ts:393 — `type SideQuotes = { all: CfbQuote[]; cz: CfbQuote | null; dk: CfbQuote | null; fd: CfbQuote | null; pin: CfbQuote | null };`
- src/lib/cfb/model.ts:397 — `return { all: quotes, cz: find(settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };`
- src/lib/cfb/model.ts:516 — `const evCz = evAt(sq.cz);` [x2]
- src/lib/cfb/model.ts:518 — `const playable = !!sq.cz && upcoming;`
- src/lib/cfb/model.ts:520 — `if (playable && sq.cz) {`
- src/lib/cfb/model.ts:521 — `const p = base === "ml" ? fairAt : rowProbAt(model, market, side, sq.cz.line);`
- src/lib/cfb/model.ts:522 — `if (p) kelly = kellyStake(p.win, p.push, sq.cz.dec, bankroll, ctx.league.rules);`
- src/lib/cfb/model.ts:548 — `cz: sq.cz,` [x2]
- src/lib/cfb/model.ts:553 — `evCz,`
- src/lib/cfb/model.ts:555 — `grade: gradeFromEv(evCz),`
- src/lib/cfb/picks.ts:106 — `type Leg = CfbParlayLeg & { evCz: number; live: boolean };`
- src/lib/cfb/picks.ts:131 — `cz: row.cz,` [x2]
- src/lib/cfb/picks.ts:133 — `evCz: row.evCz,` [x2]
- src/lib/cfb/picks.ts:154 — `: row.playable && row.fair != null && row.cz`
- src/lib/cfb/picks.ts:155 — `? kellyStake(row.fair, 0, row.cz.dec, bankroll, rules)`
- src/lib/cfb/picks.ts:167 — `cz: row.cz,` [x2]
- src/lib/cfb/picks.ts:169 — `evCz: row.evCz,` [x2]
- src/lib/cfb/picks.ts:192 — `const ea = a.evCz ?? -Infinity;`
- src/lib/cfb/picks.ts:193 — `const eb = b.evCz ?? -Infinity;`
- src/lib/cfb/picks.ts:205 — `if (!row.cz || row.evCz == null || row.evCz < floor) return null;` [x3]
- src/lib/cfb/picks.ts:206 — `const line = baseMarketOf(row.market) === "ml" ? null : row.cz.line;`
- src/lib/cfb/picks.ts:216 — `cz: row.cz.price,` [x2]
- src/lib/cfb/picks.ts:217 — `dec: row.cz.dec,`
- src/lib/cfb/picks.ts:223 — `evCz: row.evCz,` [x2]
- src/lib/cfb/picks.ts:229 — `if (!row.cz || row.fair == null || row.evCz == null || row.evCz < floor) return null;` [x3]
- src/lib/cfb/picks.ts:237 — `cz: row.cz.price,` [x2]
- src/lib/cfb/picks.ts:238 — `dec: row.cz.dec,`
- src/lib/cfb/picks.ts:246 — `evCz: row.evCz,` [x2]
- src/lib/cfb/picks.ts:253 — `const byProb = (a: Leg, b: Leg) => b.prob - a.prob || b.evCz - a.evCz || keyCmp(a.rowKey, b.rowKey);` [x2]
- src/lib/cfb/picks.ts:255 — `const byEv = (a: Leg, b: Leg) => b.evCz - a.evCz || b.prob - a.prob || keyCmp(a.rowKey, b.rowKey);` [x2]
- src/lib/cfb/picks.ts:288 — `return { legs, dec, prob, ev: 100 * (prob * dec - 1), key, gated: legs.every((l) => l.evCz >= R.minLegEvPct) };`
- src/lib/cfb/picks.ts:483 — `legs: d.legs.map(({ evCz: _e, ...leg }) => leg),`
- src/lib/cfb/picks.ts:615 — `if (!r.cz) continue;`
- src/lib/cfb/picks.ts:629 — `if (!r.cz || !(r.market in categories)) continue;`
- src/lib/cfb/picks.ts:642 — `const gate = (l: Leg) => l.evCz >= R.minLegEvPct;`
- src/lib/cfb/props.ts:42 — `* line-less anytime TD); 'cz' = Caesars; 'dk' / 'fd' for reference; 'grade' =`
- src/lib/cfb/props.ts:43 — `* gradeFromEv(evCz); 'playable' = Caesars posts it ∧ status upcoming ∧ kickoff after 'now';`
- src/lib/cfb/props.ts:301 — `const cz = find(P.settleBook);`
- src/lib/cfb/props.ts:314 — `const czEv = evAt(cz);` [x2]
- src/lib/cfb/props.ts:316 — `const playable = !!cz && upcoming;`
- src/lib/cfb/props.ts:319 — `const kelly = playable && cz && czEv ? kellyStake(czEv.p, 0, cz.dec, opts.bankroll, R) : 0;` [x4]
- src/lib/cfb/props.ts:344 — `cz,`
- src/lib/cfb/props.ts:348 — `evCz: czEv?.ev ?? null,` [x2]
- src/lib/cfb/props.ts:350 — `grade: gradeFromEv(czEv?.ev ?? null),`
- src/lib/cfb/props.ts:382 — `if (!g.oddsEventId || !g.rows.some((r) => !!r.cz)) return false;`
- src/lib/cfb/props.ts:407 — `* rows never is (it has no market to be missing on). One helper feeds 'czMissingDue' (the re-check)`
- src/lib/cfb/props.ts:410 — `export function czMissingGameIds(rows: readonly Pick<CfbPropRow, "gameId" | "market" | "cz">[]): Set<string> {` [x2]
- src/lib/cfb/props.ts:415 — `m.set(r.market, (m.get(r.market) ?? false) || !!r.cz);`
- src/lib/cfb/props.ts:419 — `for (const [gameId, markets] of seen) for (const hasCz of markets.values()) if (!hasCz) out.add(gameId);` [x2]
- src/lib/cfb/props.ts:427 — `* czMissing — upcoming games with rows where some market with rows has no Caesars quote on any of`
- src/lib/cfb/props.ts:428 — `* them ('czMissingGameIds': other books posted, Caesars not yet — on that market)`
- src/lib/cfb/props.ts:433 — `rows: readonly Pick<CfbPropRow, "gameId" | "market" | "cz">[],`
- src/lib/cfb/props.ts:435 — `): { czMissing: number; noProps: number } {`
- src/lib/cfb/props.ts:438 — `const missing = czMissingGameIds(rows);`
- src/lib/cfb/props.ts:440 — `let czMissing = 0;`
- src/lib/cfb/props.ts:445 — `else if (g.status === "upcoming" && missing.has(g.id)) czMissing++;`
- src/lib/cfb/props.ts:447 — `return { czMissing, noProps };`
- src/lib/cfb/useCfbDesk.ts:83 — `const e = (b.row.evCz ?? -Infinity) - (a.row.evCz ?? -Infinity);` [x2]
- src/lib/cfsel.ts:50 — `type Ticket = { legs?: Leg[]; czDec?: number | null };`
- src/lib/clv-report.ts:12 — `* - czCents = locked Caesars price − closing Caesars price on a continuous`
- src/lib/clv-report.ts:20 — `* were stored live (locked fair + closing fair for fairPts; locked CZ +`
- src/lib/clv-report.ts:21 — `* closing CZ for czCents). Historical legs without them simply stay out.` [x2]
- src/lib/clv-report.ts:32 — `czCents: number | null;`
- src/lib/clv-report.ts:43 — `type Leg = { label?: string; prop?: string; lkey?: string | null; cz?: number | null; imp?: number | string | null };`
- src/lib/clv-report.ts:69 — `const czCents = typeof l.cz === "number" ? centsScale(l.cz) - centsScale(s.am) : null;` [x3]
- src/lib/clv-report.ts:70 — `if (fairPts == null && czCents == null) continue;`
- src/lib/clv-report.ts:79 — `czCents: czCents != null ? Math.round(czCents * 10) / 10 : null,` [x3]
- src/lib/clv-report.ts:122 — `cents: meanSE(sel.map((r) => r.czCents).filter((x): x is number => x != null)),`
- src/lib/cross-adapters.ts:4 — `export const crossToMlb=(l:CrossLeg):SandboxLeg=>({id:l.id,label:l.label,sub:l.sub,game:l.game,cz:l.cz,prob:l.prob,push:l.push,market:l.market,book:l.book,src:l.src,cross:l});` [x2]
- src/lib/cross-adapters.ts:5 — `…sport}:${l.gameId}',kind:l.player?"prop":"side",label:l.label,sub:'${l.sub} · ${l.game}',cz:l.cz,prob:l.prob,push:l.push,market:l.market,marketLabel:l.market,book:l.book,player:l.p…` [x2]
- src/lib/cross-sport.ts:22 — `…ng|null;sport:DiscoverySport;id:string;gameId:string;label:string;sub:string;game:string;cz:number;prob:number;push?:number;book:string;market:string;player?:string;headshot?:strin…`
- src/lib/cross-sport.ts:34 — `…eg:{sport:"mlb",id,gameId:l.gameKey,label:l.label,sub:l.sub,game:l.gameLabel??l.leg.game,cz:l.am,prob:l.prob,book:l.book,market:l.market!,player:who?.name??l.label,team:l.team,logo…`
- src/lib/cross-sport.ts:36 — `const am=typeof row.cz==="number"?row.cz:row.czOdds;const prob=Number(row.prob);const start=row.gkey?d.gameInfo?.[row.gkey]?.start:null;` [x3]
- src/lib/cross-sport.ts:39 — `…:tag(book),start,gameLabel:game,leg:{id,sport:"mlb",gameId:String(row.gkey),label,sub,game,cz:am,prob,book:tag(book),market,start,src:"model",team,logo:team?teamLogo(team):null}});`
- src/lib/cross-sport.ts:44 — `…td",markets:FOOTBALL_GEN_MARKETS.map(m=>m.key),includeStarted:true,phase:"mixed"},{mode:"cz",nowMs:now,pricedAt:b.pricedAt,teamOf:r=>footballTeamKey(r,games.get(r.gameId)),quoteOf:…` [x3]
- src/lib/cross-sport.ts:46 — `….status!=="upcoming"||Date.parse(g.start)<=now)continue;for(const r of g.rows){const q=r.cz;if(!q||r.fair==null)continue;const p=rowProbAt(g.model,r.market,r.side,q.line)??{win:r.f…` [x2]
- src/lib/engine-client.ts:55 — `// ev_gated @ CZ is the default (user rule 2026-07-22): selection and settlement`
- src/lib/football/gen-pool.ts:39 — `export type FootballPriceMode = "cz" | "best";`
- src/lib/fun-hr.ts:46 — `cz: number | null; // Caesars American`
- src/lib/fun-hr.ts:55 — `czDec: number;`
- src/lib/fun-hr.ts:56 — `czOdds: string;`
- src/lib/fun-hr.ts:58 — `czEv: number; // percent`
- src/lib/fun-hr.ts:128 — `czDec: dec,`
- src/lib/fun-hr.ts:129 — `czOdds: am > 0 ? '+${am}' : String(am),`
- src/lib/fun-hr.ts:131 — `czEv: (p * dec - 1) * 100,`
- src/lib/fun-hr.ts:174 — `czDec: number;`
- src/lib/fun-hr.ts:175 — `czOdds: string;`
- src/lib/fun-hr.ts:177 — `czEv: number; // percent`
- src/lib/fun-hr.ts:220 — `czDec: dec,`
- src/lib/fun-hr.ts:221 — `czOdds: am > 0 ? '+${am}' : String(am),`
- src/lib/fun-hr.ts:223 — `czEv: (p * dec - 1) * 100,`
- src/lib/games.ts:19 — `export type MlPrice = { odds: string; book: string | null; cz: string | null; grade?: Grade | null };`
- src/lib/games.ts:107 — `cz?: number | string | null;`
- src/lib/games.ts:193 — `const czRow = hits.find((r) => fmtAm(r.cz) != null);` [x2]
- src/lib/games.ts:194 — `const out: MlPrice = { odds, book: best.book ?? null, cz: czRow ? fmtAm(czRow.cz) : null };` [x4]
- src/lib/grade.ts:4 — `* grade on the same EV% the row displays (czEv at Caesars, bsEv in dk_fd basis`
- src/lib/ledger-segments.ts:20 — `type Leg = { label?: string; prop?: string; cz?: number | null; bs?: number | null; lkey?: string | null; gkey?: string | null };`
- src/lib/ledger-segments.ts:21 — `type Ticket = { id?: string; stake?: number; supplemental?: boolean; type?: string; czDec?: number; bsDec?: number | null; legs?: Leg[] };`
- src/lib/ledger-segments.ts:123 — `lockedAm: l.cz ?? null,`
- src/lib/ledger-segments.ts:225 — `const repriced = gDec != null && t.czDec != null && Math.abs(gDec - t.czDec) > 1e-9;` [x2]
- src/lib/leg-settled.ts:12 — `* them. The grade chip is 'gradeFromEv(czEv)': a pure threshold on a number computed`
- src/lib/mlb/market-board.ts:88 — `o:q.czAm,u:q.oppAm,settlementBook:SETTLE_BOOK,oBook:row.displayBook??bookName(SETTLE_BOOK),uBook:row.displayBook??bookName(SETTLE_BOOK),`
- src/lib/mlb/market-board.ts:92 — `cz:{o:q.czAm,u:q.oppAm},pO:q.pSrc==="sim"&&q.pLive!=null?q.pLive*100:null,` [x2]
- src/lib/my-parlay.ts:63 — `const calc = priced.length ? combineTicket(priced.map((l) => ({ cz: l.odds as number, prob: l.prob as number }))) : null;`
- src/lib/parlay-gen-setup.ts:28 — `|| [s.onePerGame, s.czOnly, s.includeStarted, s.modelOnly].some((v) => typeof v !== "boolean")`
- src/lib/parlay-gen-setup.ts:48 — `sides: s.sides, onePerGame: s.onePerGame, czOnly: s.czOnly,` [x2]
- src/lib/parlay-gen.ts:138 — `czOnly: boolean;`
- src/lib/parlay-gen.ts:139 — `/** short tag of the book 'czOnly' keeps ("DK" by default; the display selector overrides it) */`
- src/lib/parlay-gen.ts:266 — `| { code: "short-pool"; have: number; want: number; relax: "same-game" | "same-team" | "started" | "cz" | "model" | "positions" | "hit" | "games" | null }`
- src/lib/parlay-gen.ts:340 — `spec.czOnly ? "cz" : "any",` [x2]
- src/lib/parlay-gen.ts:538 — `if (spec.czOnly && l.book !== (spec.pricingBook ?? SETTLE_BOOK_SHORT)) return false;`
- src/lib/parlay-gen.ts:838 — `type Relax = "same-game" | "same-team" | "started" | "cz" | "model" | "positions" | "hit" | "games" | null;`
- src/lib/parlay-gen.ts:854 — `if (spec.czOnly && fitsWith({ ...spec, czOnly: false })) return "cz";` [x3]
- src/lib/prop-lean.ts:58 — `* MLB: the settlement-book pair ('cz', DraftKings since INSTRUCTION 67) when both sides are posted`
- src/lib/prop-lean.ts:62 — `export function mlbPropLean(r: Pick<PropBoardRow, "cz" | "o" | "u" | "oBook" | "uBook" | "settlementBook" | "displayBook">): PropLean | null {`
- src/lib/prop-lean.ts:63 — `const cz = r.cz && r.cz.o != null && r.cz.u != null ? leanFromPair(r.cz.o, r.cz.u, bookTag(r.displayBook ?? r.settlementBook ?? "DK")) : null;` [x6]
- src/lib/prop-lean.ts:64 — `if (cz) return cz;` [x2]
- src/lib/prop-lean.ts:74 — `if (k.includes("caesars") || k === "cz") return "CZ";` [x2]
- src/lib/prop-lean.ts:86 — `export function footballPropLean(sides: readonly CfbPropRow[], mode: "cz" | "best" = "cz"): PropLean | null {` [x2]
- src/lib/prop-lean.ts:90 — `const pick = (r: CfbPropRow): CfbPropQuote | null => (mode === "cz" ? r.cz : (r.best ?? r.cz));` [x3]
- src/lib/prop-lean.ts:94 — `const book = mode === "cz" || qo.book === qu.book ? bookTag(qo.book) : null;`
- src/lib/prop-lean.ts:99 — `export function footballLeanIndex(rows: readonly CfbPropRow[] | null | undefined, mode: "cz" | "best" = "cz"): Map<string, PropLeanSide> {` [x2]
- src/lib/server/clv-core.ts:138 — `let czOver: number | null = null;`
- src/lib/server/clv-core.ts:139 — `let czUnder: number | null = null;`
- src/lib/server/clv-core.ts:140 — `let czAltOver: number | null = null;`
- src/lib/server/clv-core.ts:141 — `let czAltUnder: number | null = null;`
- src/lib/server/clv-core.ts:170 — `if (o != null) czAltOver = o;`
- src/lib/server/clv-core.ts:171 — `if (u != null) czAltUnder = u;`
- src/lib/server/clv-core.ts:184 — `if (o != null) czOver = o;`
- src/lib/server/clv-core.ts:185 — `if (u != null) czUnder = u;`
- src/lib/server/clv-core.ts:197 — `const am = under ? (czUnder ?? czAltUnder) : (czOver ?? czAltOver);` [x4]
- src/lib/server/clv-core.ts:219 — `let cz: number | null = null;`
- src/lib/server/clv-core.ts:236 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) cz = mine.price;`
- src/lib/server/clv-core.ts:241 — `if (cz == null) return null;`
- src/lib/server/clv-core.ts:243 — `return { am: cz, at, consensusFair: fairs.length >= 2 ? median(fairs) : null, bsAm: bs?.am ?? null, bsBk: bs?.bk ?? null };`
- src/lib/server/lock-card.ts:101 — `w: { pl: Record<string, unknown> & { legs: { lkey?: string; label?: string; prop?: string; cz?: unknown; gkey?: string }[] } };`
- src/lib/server/lock-card.ts:129 — `* from every pregame board row that has BOTH a DraftKings (cz) and a DK/FD basis (bs) price`
- src/lib/server/lock-card.ts:153 — `const cz = r.cz == null ? null : Number(r.cz);` [x3]
- src/lib/server/lock-card.ts:155 — `const czDec = amDec(cz);` [x2]
- src/lib/server/lock-card.ts:158 — `if (czDec == null || bsDec == null || prob == null || !Number.isFinite(prob)) continue;`
- src/lib/server/lock-card.ts:162 — `const czOdds = r.czOdds == null ? null : String(r.czOdds);` [x3]
- src/lib/server/lock-card.ts:166 — `odds: czOdds ?? "",`
- src/lib/server/lock-card.ts:168 — `txt: '${label} · ${prop} (${czOdds ?? ""})',`
- src/lib/server/lock-card.ts:173 — `cz,`
- src/lib/server/lock-card.ts:181 — `const czEv = evAt(prob, czDec);` [x2]
- src/lib/server/lock-card.ts:190 — `odds: czOdds ?? "",`
- src/lib/server/lock-card.ts:193 — `czOdds,`
- src/lib/server/lock-card.ts:194 — `czDec: r2(czDec),` [x2]
- src/lib/server/lock-card.ts:195 — `czEv,`
- src/lib/server/lock-card.ts:200 — `note: 'straight bet — ${typeLabel} at ${czOdds ?? "?"} (INSTRUCTION 72)',`
- src/lib/server/lock-card.ts:315 — `type PoolItem = { pl: Record<string, unknown> & { legs: { lkey?: string; label?: string; prop?: string; cz?: unknown; gkey?: string }[] } };`
- src/lib/server/lock-card.ts:365 — `const decOf = (pl: Record<string, unknown>, k: "czDec" | "bsDec") => (typeof pl[k] === "number" && Number.isFinite(pl[k] as number) ? (pl[k] as number) : null);`
- src/lib/server/lock-card.ts:367 — `const cz = decOf(pl, "czDec");` [x2]
- src/lib/server/lock-card.ts:369 — `return (cz != null && cz > cap) || (bs != null && bs > cap);` [x2]
- src/lib/server/lock-card.ts:400 — `czEv: (w.pl.czEv as number | null) ?? null,` [x2]
- src/lib/server/lock-card.ts:497 — `type Staged = { __id: string; name: string; czEv: number | null; legs: { lkey?: string | null; prop?: string | null }[] };`
- src/lib/server/lock-card.ts:517 — `czEv: (t.czEv as number | null) ?? null,` [x2]
- src/lib/server/lock-card.ts:633 — `czEv: (s.pick.w.pl.czEv as number | null) ?? null,` [x2]
- src/lib/server/lock-card.ts:720 — `czDec: pl.czDec ?? null,` [x2]
- src/lib/server/lock-card.ts:721 — `czEv: pl.czEv ?? null,` [x2]
- src/lib/server/lock-card.ts:722 — `czEvRaw: pl.czEvRaw ?? null,` [x2]
- src/lib/server/lock-card.ts:729 — `legs: (pl.legs ?? []).map((l) => ({ lkey: l.lkey ?? null, label: l.label ?? null, prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),` [x2]
- src/lib/server/lock-card.ts:788 — `const cz = r.cz == null ? null : Number(r.cz);` [x3]
- src/lib/server/lock-card.ts:789 — `const dec = cz == null || !Number.isFinite(cz) || cz === 0 ? null : cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz);` [x6]
- src/lib/server/lock-card.ts:797 — `cz,`
- src/lib/server/lock-card.ts:814 — `const cz = r.cz == null ? null : Number(r.cz);` [x3]
- src/lib/server/lock-card.ts:815 — `const dec = cz == null || !Number.isFinite(cz) || cz === 0 ? null : cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz);` [x6]
- src/lib/server/lock-card.ts:823 — `cz,`
- src/lib/server/lock-card.ts:838 — `czDec: Math.round(t.czDec * 100) / 100,` [x2]
- src/lib/server/lock-card.ts:839 — `czEv: Math.round(t.czEv * 10) / 10,` [x2]
- src/lib/server/lock-card.ts:840 — `czOdds: t.czOdds,` [x2]
- src/lib/server/lock-card.ts:845 — `legs: t.legs.map((l) => ({ lkey: l.lkey, label: l.label, prop: l.prop, cz: l.cz, ...(l.gkey ? { gkey: l.gkey } : {}) })),` [x2]
- src/lib/server/lock-card.ts:993 — `* - positive EV at the settlement price on the SHRUNK probability (czEv > 0);`
- src/lib/server/lock-card.ts:1028 — `const cz = r.cz == null ? null : Number(r.cz);` [x3]
- src/lib/server/lock-card.ts:1035 — `dec: amDec(cz),`
- src/lib/server/lock-card.ts:1036 — `cz,`
- src/lib/server/lock-card.ts:1055 — `czDec: Math.round(t.czDec * 100) / 100,` [x2]
- src/lib/server/lock-card.ts:1056 — `czEv: Math.round(t.czEv * 10) / 10,` [x2]
- src/lib/server/lock-card.ts:1057 — `czOdds: t.czOdds,` [x2]
- src/lib/server/lock-card.ts:1062 — `legs: t.legs.map((l) => ({ lkey: l.lkey, label: l.label, prop: l.prop, cz: l.cz, ...(l.gkey ? { gkey: l.gkey } : {}) })),` [x2]
- src/lib/server/lock-card.ts:1146 — `const ev = Number(pl.czEv);`
- src/lib/server/lock-card.ts:1148 — `const dec = Number(pl.czDec);`
- src/lib/server/lock-card.ts:1149 — `if (pl.czDec == null || pl.bsDec == null || !Number.isFinite(ev) || !Number.isFinite(prob) || !Number.isFinite(dec) || !(ev > 0)) { reasons.found_no_edge++; continue; }`
- src/lib/server/lock-card.ts:1200 — `const pl = c.pl as FoundPl & { probRaw?: number | null; czEvRaw?: number | null; bsEvRaw?: number | null };`
- src/lib/server/lock-card.ts:1212 — `czDec: (pl.czDec as number | null) ?? null,` [x2]
- src/lib/server/lock-card.ts:1213 — `czEv: (pl.czEv as number | null) ?? null,` [x2]
- src/lib/server/lock-card.ts:1214 — `czEvRaw: pl.czEvRaw ?? null,` [x2]
- src/lib/server/lock-card.ts:1221 — `…) ?? null, label: (l.label as string | null) ?? null, prop: (l.prop as string | null) ?? null, cz: (l.cz as number | null) ?? null, ...(l.gkey ? { gkey: String(l.gkey) } : {}) })),` [x2]
- src/lib/server/mlb-day-won.ts:18 — `* (the locked price: confirmed, else czDec — ticket-payout.ts settlingDec, without the czOdds fallback the` [x2]
- src/lib/server/mlb-day-won.ts:24 — `type Ticket = { id?: unknown; stake?: unknown; legs?: unknown; czDec?: unknown; czOdds?: unknown; confirmed?: unknown };` [x2]
- src/lib/server/mlb-day-won.ts:56 — `graded won counts its profit at the locked price (confirmed, else czDec — the price the device grader`
- src/lib/server/mlb-day-won.ts:79 — `const dec = settlingDec({ stake: Number(t.stake), czDec: t.czDec as number | null, confirmed: t.confirmed as number | null });` [x2]
- src/lib/server/mlb-live-quote.ts:179 — `czAm: number | null;`
- src/lib/server/mlb-live-quote.ts:253 — `const czPoints = new Set(core.filter((c) => c.book === cfg.settleBook).map((c) => c.point));`
- src/lib/server/mlb-live-quote.ts:254 — `const ln = tied.length === 1 ? tied[0] : (tied.find((p) => czPoints.has(p)) ?? (median(tied) as number));`
- src/lib/server/mlb-live-quote.ts:264 — `const cz = atLn.find((c) => c.book === cfg.settleBook) ?? null;`
- src/lib/server/mlb-live-quote.ts:266 — `const czAlt = altAt(cfg.settleBook);`
- src/lib/server/mlb-live-quote.ts:277 — `czAm: cz?.over ?? czAlt?.over ?? null,` [x3]
- src/lib/server/mlb-live-quote.ts:278 — `oppAm: cz?.under ?? czAlt?.under ?? null,` [x2]
- src/lib/server/mlb-live-quote.ts:713 — `const dec = sight.czAm != null ? decFromAmerican(sight.czAm) : null;` [x2]
- src/lib/server/mlb-live-quote.ts:717 — `quote. Pricing the Under off 'evCz' handed it the Over's edge with the sign kept — the`
- src/lib/server/mlb-live-quote.ts:727 — `czAm: sight.czAm,` [x2]
- src/lib/server/mlb-live-quote.ts:735 — `evCz: Number.isFinite(ev) ? Math.round(ev * 100) / 100 : null,`
- src/lib/server/self-reading.ts:71 — `allocatorOrder: { name: string | null; type: string | null; legs: number; stake: number; czEv: number | null }[];`
- src/lib/server/self-reading.ts:76 — `mismatches: { name: string | null; ticketDec: number | null; legCz: number | null }[];`
- src/lib/server/self-reading.ts:98 — `type LegView = { lkey?: string | null; label?: string | null; prop?: string | null; cz?: number | null };`
- src/lib/server/self-reading.ts:102 — `czDec?: number | null;`
- src/lib/server/self-reading.ts:103 — `czEv?: number | null;`
- src/lib/server/self-reading.ts:170 — `allocatorOrder: core.map((t) => ({ name: t.name ?? null, type: t.type ?? null, legs: (t.legs ?? []).length, stake: t.stake ?? 0, czEv: (t.czEv as number) ?? null })),` [x2]
- src/lib/server/self-reading.ts:175 — `'cz' is AMERICAN odds (the first live single read ticketDec 1.6757 vs legCz -148 —` [x2]
- src/lib/server/self-reading.ts:177 — `|cz| ≥ 100 → American; 1.01 < cz < 51 → already decimal; anything else → uncheckable,` [x2]
- src/lib/server/self-reading.ts:179 — `const legDecOf = (cz: number): number | null => {`
- src/lib/server/self-reading.ts:180 — `if (Math.abs(cz) >= 100) return cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz);` [x4]
- src/lib/server/self-reading.ts:181 — `if (cz > 1.01 && cz < 51) return cz;` [x3]
- src/lib/server/self-reading.ts:187 — `const legCz = (s.legs?.[0]?.cz as number) ?? null;` [x2]
- src/lib/server/self-reading.ts:188 — `const tDec = (s.czDec as number) ?? null;`
- src/lib/server/self-reading.ts:189 — `const legDec = legCz == null ? null : legDecOf(legCz);` [x2]
- src/lib/server/self-reading.ts:192 — `if (Math.abs(tDec - legDec) > 5e-4) singlesVsLeg.mismatches.push({ name: s.name ?? null, ticketDec: tDec, legCz });`
- src/lib/server/self-reading.ts:209 — `if (a.czEv != null && b.czEv != null && (b.czEv as number) < (a.czEv as number) && (b.stake ?? 0) > (a.stake ?? 0)) nonMono++;` [x4]
- src/lib/shrink.ts:17 — `* number, so a sim-confirmed correlation survives the shrink intact). czEv / bsEv / ev`
- src/lib/shrink.ts:19 — `* numbers ride along as probRaw / czEvRaw / bsEvRaw / evRaw so the pre-shrink record`
- src/lib/shrink.ts:28 — `czDec?: number | null;`
- src/lib/shrink.ts:31 — `czEv?: number | null;`
- src/lib/shrink.ts:39 — `czEvRaw: number | null;`
- src/lib/shrink.ts:71 — `const czDec = num(pl.czDec);` [x2]
- src/lib/shrink.ts:79 — `czEv: czDec != null ? evAt(prob, czDec) : (pl.czEv ?? null),` [x4]
- src/lib/shrink.ts:81 — `czEvRaw: num(pl.czEv),` [x2]
- src/lib/sportsbook/football.ts:10 — `const pricedAt=(row:{displayBook?:string;cz:{book:string}|null}):string=>row.displayBook??row.cz?.book??'williamhill_us';` [x2]
- src/lib/sportsbook/football.ts:11 — `function quoteOf<Q extends {book:string}>(row:{quotes?:Record<string,Q>;cz:Q|null;dk:Q|null;fd:Q|null;best:Q|null;pin?:Q|null},book:string):Q|null{`
- src/lib/sportsbook/football.ts:12 — `return row.quotes?.[book]??[row.cz,row.dk,row.fd,row.best,row.pin].find(q=>q?.book===book)??null;`
- src/lib/sportsbook/football.ts:18 — `return {...row,displayBook:book,cz:q,evCz:ev,grade:gradeFromEv(ev),kelly:q&&p&&game.status==='upcoming'&&Date.parse(game.start)>Date.now()?kellyStake(p.win,p.push,q.dec,bankroll,r…` [x2]
- src/lib/sportsbook/football.ts:33 — `if(!r.playable||!r.cz)return r;`
- src/lib/sportsbook/football.ts:34 — `const p=rowProbAt(g.model,r.market,r.side,r.cz.line);`
- src/lib/sportsbook/football.ts:35 — `return p?{...r,kelly:kellyStake(p.win,p.push,r.cz.dec,bankroll,rules)}:r;`
- src/lib/sportsbook/football.ts:45 — `return {...row,displayBook:book,cz:q,evCz:ev,grade:gradeFromEv(ev),fair,fairAm:fair==null?null:americanFromProb(Math.min(.999999,Math.max(.000001,fair))),line:q?.line??row.line,ke…` [x2]
- src/lib/sportsbook/mlb.ts:54 — `….am??null,u:bu?.am??null,oBook:bo?bookName(bo.book):null,uBook:bu?bookName(bu.book):null,cz:{o:o[settlementBook]?.am??null,u:u[settlementBook]?.am??null},pO:null,fO:fair.length?(fa…`
- src/lib/sportsbook/mlb.ts:76 — `// 'cz' is the quote at the board's settlement book; a board stamped before INSTRUCTION 67 (2026-09-17) was priced at Caesars`
- src/lib/sportsbook/mlb.ts:77 — `if(book===(r.settlementBook??'williamhill_us'))return american(r.czOdds)??american(r.cz);` [x2]
- src/lib/sportsbook/mlb.ts:85 — `const opp=r.opp as {lkey?:string;sub?:string;prob?:number;cz?:unknown;label?:string}|undefined;`
- src/lib/sportsbook/mlb.ts:87 — `…...r,displayBook:book,bestDisplayOdds:r.odds,bestDisplayBook:r.book,...(opp?{opp:{...opp,cz:oppAm}}:{}),odds:am??undefined,book:bookName(book),ev:v.ev,edge:v.edge,czOdds:am,czEv:v.…` [x8]
- src/lib/sportsbook/mlb.ts:92 — `if(book===(r.settlementBook??'williamhill_us'))return {...r,displayBook:book,o:r.cz?.o??null,u:r.cz?.u??null,oBook:r.cz?.o!=null?bookName(book):null,uBook:r.cz?.u!=null?bookName(b…` [x4]
- src/lib/sportsbook/mlb.ts:96 — `return {...r,displayBook:book,cz:o==null&&u==null?null:{o,u},o,u,oBook:o==null?null:bookName(book),uBook:u==null?null:bookName(book)};`
- src/lib/sportsbook/mlb.ts:103 — `…ring,PickRow[]>|undefined)=>Object.fromEntries(Object.entries(cs??{}).map(([k,rs])=>[k,rs.map(r=>priceMlbRow(r,book,index)).sort((a,b)=>(b.czEv??-Infinity)-(a.czEv??-Infinity))]));` [x2]
- src/lib/sportsbook/mlb.ts:105 — `…ex):index['${l.gkey}|${l.lkey}|${under(l.prop)?'u':'o'}']?.[book]?.am??null;return {...l,cz:am,bs:am,bsBook:bookName(book),book:bookName(book)};});const d=legs.length&&legs.every(l…` [x6]
- src/lib/sportsbook/mlb.ts:106 — `…=r.bookTotals?.[book]??null;const same=q?.pt===r.total.pt;return {...r,total:{...r.total,cz:q,evOver:same&&q?percentFraction(valueAt(r.total.final,q.o).ev):null,evUnder:same&&q?per…`
- src/lib/sportsbook/mlb.ts:113 — `const rows=(data.categories.ml??[]).map(r=>{const am=knownPrice(r,book,index);return {...r,odds:am??undefined,cz:am as PickRow["cz"],book:bookName(book)};});` [x2]
- src/lib/sportsbook/mlb.ts:121 — `rows.push({gkey,lkey,label:'${game[side]} ML',sub:"Moneyline",odds:quote.am,cz:quote.am as PickRow["cz"],book:bookName(book)});` [x2]
- src/lib/sportsbook/useLivePrices.ts:10 — `return [key,{...q,czAm:o,oppAm:u,bsAm:o,bsBk:book,evCz:valueAt(q.pLive,o).ev,evOpp:valueAt(q.pLive==null?null:1-q.pLive,u).ev}];` [x2]
- src/lib/ticket-math.ts:18 — `cz: number; // american — the Caesars price when posted, else the best price in the feed`
- src/lib/ticket-math.ts:24 — `/** which book the price came from — "CZ" whenever Caesars posts it */`
- src/lib/ticket-math.ts:47 — `export function combineTicket(legs: { cz: number; prob: number; push?: number }[]): TicketCalc | null {`
- src/lib/ticket-math.ts:54 — `dec *= amToDec(l.cz);`
- src/lib/ticket-math.ts:57 — `expectedReturn *= win * amToDec(l.cz) + Math.min(1 - win, Math.max(0, (l.push ?? 0) / 100));`
- src/lib/ticket-payout.ts:24 — `czDec?: number | null;`
- src/lib/ticket-payout.ts:25 — `czOdds?: string | number | null;`
- src/lib/ticket-payout.ts:33 — `/** settling decimal price: confirmed NV → czDec → parsed czOdds; null when unpriced */` [x2]
- src/lib/ticket-payout.ts:37 — `if (t.czDec != null && Number(t.czDec) > 1) return Number(t.czDec);` [x3]
- src/lib/ticket-payout.ts:38 — `if (t.czOdds != null && String(t.czOdds).trim() !== "") {` [x2]
- src/lib/ticket-payout.ts:39 — `const am = parseAmerican(String(t.czOdds));`
- src/lib/ufc.ts:25 — `czOdds: number | null;`
- src/lib/ufc.ts:29 — `czEv: number | null;`
- src/lib/ufc.ts:43 — `export type UfcTicketLeg = { fight: string; pick: string; record?: string; czOdds: number; prob: number };`
- src/lib/ufc.ts:131 — `let czOdds: number | null = null;`
- src/lib/ufc.ts:142 — `if (bk.key === book) czOdds = mine.price;`
- src/lib/ufc.ts:149 — `const czEv = prob != null && czOdds != null ? prob * amToDec(czOdds) - 1 : null;` [x3]
- src/lib/ufc.ts:150 — `return { name: fighter, czOdds, prob, czEv, bestOdds, bestBook, books: probs.length };` [x2]
- src/lib/ufc.ts:173 — `const dec = legs.reduce((a, l) => a * amToDec(l.czOdds), 1);`
- src/lib/ufc.ts:181 — `const cands = [f.a, f.b].filter((s) => s.czOdds != null && s.prob != null && s.czEv != null);` [x2]
- src/lib/ufc.ts:183 — `const best = cands.sort((x, y) => (y.czEv ?? -9) - (x.czEv ?? -9))[0];` [x2]
- src/lib/ufc.ts:188 — `czOdds: best.czOdds!,` [x2]
- src/lib/ufc.ts:191 — `return { leg, ev: best.czEv!, prob: best.prob!, dog: best.czOdds! > 100 };` [x2]
- src/lib/under-bias.ts:23 — `export type BiasTicket = { name?: string | null; czEv?: number | string | null; legs: BiasLeg[] };`
- src/lib/under-bias.ts:62 — `* tiebreaks: fewer unders, higher czEv, name).`
- src/lib/under-bias.ts:77 — `(Number(b.czEv ?? -999) || -999) - (Number(a.czEv ?? -999) || -999) ||` [x2]
- src/lib/under-bias.ts:86 — `/** The quota loop's eviction choice: most under legs, then lowest czEv, then name. */`
- src/lib/under-bias.ts:93 — `(Number(a.czEv ?? 999) || 999) - (Number(b.czEv ?? 999) || 999) ||` [x2]

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — stored-data fields (98 lines)

- src/engine/index.ts:35 — `/** the odds-API book 'cz' / 'czOdds' / 'czEv' were priced at (stamped by attachBookQuotes; missing = Caesars, pre-2026-09-17) */` [x3]
- src/engine/index.ts:42 — `cz?: { o?: number | null; u?: number | null } | null;`
- src/engine/index.ts:43 — `czOdds?: number | null;`
- src/engine/index.ts:44 — `czEv?: number | null;`
- src/engine/index.ts:45 — `czEdge?: number | null;`
- src/engine/index.ts:46 — `czKellyF?: number | null;`
- src/engine/index.ts:47 — `czBadge?: boolean;`
- src/engine/index.ts:76 — `/** book the leg's 'cz' price is at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:81 — `cz?: number | null;`
- src/engine/index.ts:100 — `czOdds?: number | null;`
- src/engine/index.ts:101 — `czDec?: number | null;`
- src/engine/index.ts:102 — `czEv?: number | null;`
- src/engine/index.ts:121 — `/** book the 'cz' pair is at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:135 — `cz: { o: number | null; u: number | null } | null; // the Caesars quote (what Josh actually bets)`
- src/engine/index.ts:153 — `/** book every 'cz' field on this board is priced at (missing = Caesars, pre-2026-09-17) */`
- src/engine/index.ts:298 — `is legal) makes every '*_cz' capture, grade, EV, edge and Kelly stake read the DraftKings`
- src/lib/cfb/props-types.ts:82 — `cz: CfbPropQuote | null;`
- src/lib/cfb/props-types.ts:87 — `evCz: number | null;`
- src/lib/cfb/props-types.ts:136 — `some market with rows, no Caesars quote (other books posted, Caesars not yet — 'czMissingGameIds') —`
- src/lib/cfb/props-types.ts:137 — `re-asked every CFB_PROPS.czMissingRevalidateSec inside czMissingWindowSec of kickoff, and while > 0` [x2]
- src/lib/cfb/props-types.ts:139 — `unpriced ones; a game with zero rows is 'noProps', never 'czMissing'. */`
- src/lib/cfb/props-types.ts:140 — `czMissing: number;`
- src/lib/cfb/props-types.ts:165 — `cz: number;`
- src/lib/cfb/props-types.ts:221 — `cz: CfbPropQuote | CfbQuote | null;`
- src/lib/cfb/props-types.ts:223 — `evCz: number | null;`
- src/lib/cfb/types.ts:126 — `cz: CfbQuote | null;`
- src/lib/cfb/types.ts:134 — `evCz: number | null;`
- src/lib/cfb/types.ts:137 — `/** gradeFromEv(evCz) */`
- src/lib/cfb/types.ts:141 — `/** cz posted AND the game has not kicked off */`
- src/lib/cfb/types.ts:208 — `cz: number;`
- src/lib/cfb/types.ts:235 — `czOdds: number;`
- src/lib/cfb/types.ts:236 — `czDec: number;`
- src/lib/cfb/types.ts:240 — `czEv: number;`
- src/lib/cfb/types.ts:430 — `benched: { label: string; evCz: number; reason: string }[];`
- src/lib/engine-echo.ts:91 — `coreCzEvMin: unknown;`
- src/lib/engine-echo.ts:144 — `coreCzEvMin: g("coreCzEvMin"),` [x2]
- src/lib/mlb/live-quote-types.ts:36 — `czAm: number | null;`
- src/lib/mlb/live-quote-types.ts:58 — `evCz: number | null;`
- src/lib/mlb/live-quote-types.ts:79 — `/** the book every czAm / evCz on this overlay is priced at (INSTRUCTION 67, 2026-09-17: DraftKings); overlays from before that date carry no stamp and are Caesars-priced */` [x2]
- src/lib/nfl/week1-replay.json:20 — `"czOdds": -109,`
- src/lib/nfl/week1-replay.json:21 — `"czDec": 1.9174,`
- src/lib/nfl/week1-replay.json:23 — `"czEv": 0.48,`
- src/lib/nfl/week1-replay.json:28 — `"cz": -109,`
- src/lib/nfl/week1-replay.json:48 — `"czOdds": -110,`
- src/lib/nfl/week1-replay.json:49 — `"czDec": 1.9091,`
- src/lib/nfl/week1-replay.json:51 — `"czEv": 0.14,`
- src/lib/nfl/week1-replay.json:56 — `"cz": -110,`
- src/lib/nfl/week1-replay.json:76 — `"czOdds": -107,`
- src/lib/nfl/week1-replay.json:77 — `"czDec": 1.9346,`
- src/lib/nfl/week1-replay.json:79 — `"czEv": -1.29,`
- src/lib/nfl/week1-replay.json:84 — `"cz": -107,`
- src/lib/nfl/week1-replay.json:104 — `"czOdds": -105,`
- src/lib/nfl/week1-replay.json:105 — `"czDec": 1.9524,`
- src/lib/nfl/week1-replay.json:107 — `"czEv": -1.73,`
- src/lib/nfl/week1-replay.json:112 — `"cz": -105,`
- src/lib/nfl/week1-replay.json:132 — `"czOdds": -118,`
- src/lib/nfl/week1-replay.json:133 — `"czDec": 1.8475,`
- src/lib/nfl/week1-replay.json:135 — `"czEv": -1.97,`
- src/lib/nfl/week1-replay.json:140 — `"cz": -118,`
- src/lib/nfl/week1-replay.json:160 — `"czOdds": 138,`
- src/lib/nfl/week1-replay.json:161 — `"czDec": 2.38,`
- src/lib/nfl/week1-replay.json:163 — `"czEv": -1.98,`
- src/lib/nfl/week1-replay.json:168 — `"cz": 138,`
- src/lib/nfl/week1-replay.json:188 — `"czOdds": 137,`
- src/lib/nfl/week1-replay.json:189 — `"czDec": 2.37,`
- src/lib/nfl/week1-replay.json:191 — `"czEv": -2.01,`
- src/lib/nfl/week1-replay.json:196 — `"cz": 137,`
- src/lib/nfl/week1-replay.json:216 — `"czOdds": -108,`
- src/lib/nfl/week1-replay.json:217 — `"czDec": 1.9259,`
- src/lib/nfl/week1-replay.json:219 — `"czEv": -2.59,`
- src/lib/nfl/week1-replay.json:224 — `"cz": -108,`
- src/lib/nfl/week1-replay.json:244 — `"czOdds": 140,`
- src/lib/nfl/week1-replay.json:245 — `"czDec": 2.4,`
- src/lib/nfl/week1-replay.json:247 — `"czEv": -2.71,`
- src/lib/nfl/week1-replay.json:252 — `"cz": 140,`
- src/lib/nfl/week1-replay.json:272 — `"czOdds": -117,`
- src/lib/nfl/week1-replay.json:273 — `"czDec": 1.8547,`
- src/lib/nfl/week1-replay.json:275 — `"czEv": -3.4,`
- src/lib/nfl/week1-replay.json:280 — `"cz": -117,`
- src/lib/pred-serialize.ts:25 — `cz: number | null; // Caesars price if offered`
- src/lib/pred-serialize.ts:26 — `czEv: number | null;`
- src/lib/pred-serialize.ts:86 — `czDec: number | null;`
- src/lib/pred-serialize.ts:87 — `czOdds: string | null;`
- src/lib/pred-serialize.ts:254 — `cz: r.cz != null ? Number(r.cz) : null,` [x3]
- src/lib/pred-serialize.ts:255 — `czEv: r.czEv != null ? Number(r.czEv) : null,` [x3]
- src/lib/pred-serialize.ts:280 — `czDec: t.czDec != null ? Number(t.czDec) : null,` [x3]
- src/lib/pred-serialize.ts:281 — `czOdds: t.czOdds != null ? String(t.czOdds) : null,` [x3]
- src/lib/pred-serialize.ts:407 — `already stored czEv/ev; only this projection dropped them. fitByEv divides by 100. */`
- src/lib/pred-serialize.ts:438 — `// czEv is the EV at the SELECTION price in ev_gated (the mode the gate runs in);`
- src/lib/pred-serialize.ts:440 — `ev: r.czEv ?? r.ev ?? null,`
- src/lib/server/card-view.ts:15 — `type CardLeg = { lkey: string | null; label: string | null; prop: string | null; cz: number | null; gkey?: string };`
- src/lib/server/card-view.ts:21 — `czOdds: string | number | null;`
- src/lib/server/card-view.ts:22 — `czDec: number | null;`
- src/lib/server/card-view.ts:24 — `czEv: number | null;`
- src/lib/server/card-view.ts:65 — `czOdds: (t as { czOdds?: string | number | null }).czOdds ?? null,` [x3]
- src/lib/server/card-view.ts:66 — `czDec: (t.czDec as number) ?? null,` [x2]
- src/lib/server/card-view.ts:68 — `czEv: (t.czEv as number) ?? null,` [x2]
- src/lib/server/card-view.ts:76 — `cz: l.cz == null ? null : Number(l.cz),` [x3]

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — UI (343 lines)

- app/board/page.tsx:59 — `import { useCzHidden } from "@/lib/cz-offered";` [x2]
- app/board/page.tsx:60 — `import { CzInfo } from "@/components/ui/CzInfo";` [x2]
- app/board/page.tsx:87 — `the non-Caesars lines from ALL"): ALL keeps only the lines Caesars posts ('cz' priced) —`
- app/board/page.tsx:91 — `the settle book is DraftKings now — same rule, the 'cz' quote is the DraftKings one. */`
- app/board/page.tsx:261 — `const cz = useCzHidden();` [x2]
- app/board/page.tsx:283 — `…r),market:String(r.market??marketOfLkey(r.lkey)??cat),prob:Number(r.prob??0),am:Number(r.cz??NaN),ev:Number(r.czEv??-Infinity),start:r.gkey?d?.gameInfo?.[r.gkey]?.start:undefined,s…` [x3]
- app/board/page.tsx:284 — `[rows, cz, showScratched, rowOut, nameHit, discovery, d, cat],`
- app/board/page.tsx:289 — `const czHiddenHere = new Set(`
- app/board/page.tsx:290 — `rows.map((r) => '${r.label}|${r.sub}').filter((k) => cz.isHidden(k)),`
- app/board/page.tsx:303 — `cz: number | null; odds: string | number | null; book: string | null;`
- app/board/page.tsx:384 — `…},selectedBook,(d?.bookQuotes??{}) as QuoteIndex);const am=selectedBook===DEFAULT_BOOK?p.cz:row.czOdds??null;return {...p,cz:am,odds:am,book:selectedBookName,edge:valueAt(p.prob==n…` [x3]
- app/board/page.tsx:392 — `const [allRows, allNoCz] = useMemo<[ApiPick[] | null, number]>(() => {`
- app/board/page.tsx:397 — `let noCz = 0; // INSTRUCTION 41: lines only other books post are hidden from ALL, counted here`
- app/board/page.tsx:402 — `if (r.cz?.o == null) {`
- app/board/page.tsx:403 — `noCz++;`
- app/board/page.tsx:406 — `const edge = valueAt(r.pO==null?null:r.pO/100,r.cz?.o).edge;`
- app/board/page.tsx:407 — `const odds = r.o ?? r.cz?.o ?? null;`
- app/board/page.tsx:410 — `cz: r.cz?.o ?? null, odds, book: r.o != null ? r.oBook : odds != null ? bookName(SETTLE_BOOK) : null,` [x2]
- app/board/page.tsx:424 — `return [out, noCz];`
- app/board/page.tsx:549 — `odds: liveAmOf(r) ?? parseAm(r.czOdds),`
- app/board/page.tsx:567 — `<CzInfo pickKey={'${r.label}|${r.sub}'} offered={!cz.isHidden('${r.label}|${r.sub}')} onToggle={cz.toggle} />` [x3]
- app/board/page.tsx:628 — `/* grades the SAME EV the mode displays — czEv at Caesars, bsEv under dk_fd — EXCEPT on a`
- app/board/page.tsx:642 — `const ev0 = basisMode ? (r.bsEv == null ? null : Number(r.bsEv)) : r.czEv == null ? null : Number(r.czEv);` [x2]
- app/board/page.tsx:659 — `<GradeChip grade={gradeFromEv(r.czEv == null ? null : Number(r.czEv))} basis="EV @ selected book" />` [x2]
- app/board/page.tsx:720 — `key: "cz",`
- app/board/page.tsx:723 — `sortValue: (r) => liveAmOf(r) ?? (Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0),`
- app/board/page.tsx:724 — `cell: (r) => <CzPrice row={r} live={rowQuote(r)} />,`
- app/board/page.tsx:792 — `key: "cz",`
- app/board/page.tsx:795 — `sortValue: (r) => liveAmOf(r) ?? (Number(String(r.czOdds ?? "").replace(/[^\d.-]/g, "")) || 0),`
- app/board/page.tsx:796 — `cell: (r) => <CzPrice row={r} live={rowQuote(r)} />,`
- app/board/page.tsx:799 — `key: "czEv",`
- app/board/page.tsx:802 — `sortValue: (r) => (rowSettled(r) ? -99 : Number(r.czEv) || 0),`
- app/board/page.tsx:809 — `) : r.czEv != null ? (`
- app/board/page.tsx:810 — `<EvBadge ev={Number(r.czEv)} />`
- app/board/page.tsx:820 — `sortValue: (r) => (rowSettled(r) ? -99 : Number(r.czKellyF) || 0),`
- app/board/page.tsx:832 — `) : r.czKellyF != null && Number(r.czKellyF) > 0 ? (` [x2]
- app/board/page.tsx:833 — `<KellyChip stake={Number(r.czKellyF) * bankroll} />`
- app/board/page.tsx:842 — `[selectedBookName, bankroll, basisMode, legLive, rowSettled, rowQuote, liveAmOf, livePricedAt, cz.hidden, rowOut, mine, splitsFeed, leanIndex],`
- app/board/page.tsx:964 — `<CzInfo pickKey={pk} offered={!cz.isHidden(pk)} onToggle={cz.toggle} />` [x3]
- app/board/page.tsx:1022 — `}, [cat, cz.hidden, pickOut, pickKey, pickSettled, pickQuote, livePricedAt, mine, pickHits.logs, hitWindow, leanIndex]);`
- app/board/page.tsx:1025 — `…Hit(p.player) && discoveryMatches({chanceRank:pickRanks.get(p),market:p.market??cat,am:p.cz??NaN,prob:p.prob??0,ev:p.cz!=null&&p.prob!=null?(p.prob/100*amToDec(p.cz)-1)*100:-Infini…` [x4]
- app/board/page.tsx:1026 — `[pickRows, cz, pickKey, showScratched, pickOut, nameHit, discovery, cat],`
- app/board/page.tsx:1375 — `{allNoCz > 0 ? ' · ${allNoCz} line${allNoCz === 1 ? "" : "s"} only other books post hidden' : ""}` [x3]
- app/board/page.tsx:1392 — `{cz.count > 0 && (`
- app/board/page.tsx:1394 — `<span>{cz.count} pick{cz.count === 1 ? "" : "s"} hidden by your sportsbook toggle (all tabs)</span>` [x2]
- app/board/page.tsx:1395 — `<button type="button" onClick={cz.reset} className="font-semibold text-pos hover:underline">`
- app/board/page.tsx:1420 — `rowClassName={(r) => (r.susp || rowSettled(r) ? "" : rowQuote(r) ? "" : Number(basisMode ? r.bsEv : r.czEv) > 0 ? "ev-glow" : "")}`
- app/board/page.tsx:1423 — `{czHiddenHere > 0 && (`
- app/board/page.tsx:1426 — `{czHiddenHere} pick{czHiddenHere === 1 ? "" : "s"} hidden by your sportsbook toggle` [x2]
- app/board/page.tsx:1428 — `<button type="button" onClick={cz.reset} className="font-semibold text-pos hover:underline">`
- app/board/page.tsx:1723 — `* It was '<OddsCell odds={r.czOdds} book="caesars" />' unconditionally, so the pregame price sat`
- app/board/page.tsx:1729 — `function CzPrice({ row, live }: { row: { czOdds?: unknown; sub?: string | null }; live: MlbLiveQuote | null }) {` [x2]
- app/board/page.tsx:1730 — `if (!live) return <OddsCell odds={row.czOdds as never} book="caesars" />;`
- app/board/page.tsx:1737 — `<span className="num inline-flex items-baseline gap-1" data-testid="mlb-live-cz">`
- app/builder/page.tsx:90 — `czOdds?: string | number;`
- app/builder/page.tsx:92 — `czEv?: number | null;`
- app/builder/page.tsx:100 — `legs: { label: string; prop: string; cz?: number | null; bs?: number | null; bsBook?: string | null; gkey?: string | null; lkey?: string | null }[];`
- app/builder/page.tsx:159 — `CZ-tax gap stay visible but informational — settlement is still at CZ/confirmed */` [x2]
- app/builder/page.tsx:160 — `const primaryEv = basisMode && t.bsEv != null ? Number(t.bsEv) : t.czEv != null ? Number(t.czEv) : null;` [x2]
- app/builder/page.tsx:161 — `const czTax = basisMode && t.bsEv != null && t.czEv != null ? Number(t.czEv) - Number(t.bsEv) : null;` [x3]
- app/builder/page.tsx:171 — `naive→joint, Kelly, basis, CZ tax, hit odds) live behind a ▾. From sm up every chip is inline as before. */`
- app/builder/page.tsx:175 — `<WonPaid t={{ stake, czDec: (t as { czDec?: number | null }).czDec ?? null, czOdds: t.czOdds ?? null, confirmed: t.confirmed ?? null }} grade={grade} />` [x5]
- app/builder/page.tsx:202 — `const tax = czTax != null && (`
- app/builder/page.tsx:207 — `@CZ {Number(t.czEv) >= 0 ? "+" : ""}{Number(t.czEv).toFixed(1)}% · tax {czTax >= 0 ? "+" : ""}{czTax.toFixed(1)}%` [x5]
- app/builder/page.tsx:211 — `….length || filter.markets.includes(String(l.market ?? marketOf(l.lkey ?? "")))) && inOddsRange(l.cz == null ? NaN : Number(l.cz), filter.odds ?? {min:null,max:null}))) return null;` [x2]
- app/builder/page.tsx:214 — `<div className={'pick-ticket glass px-3 py-1.5 ${Number(t.czEv) > 0 ? "ev-glow" : ""}'}>`
- app/builder/page.tsx:230 — `<OddsCell odds={(t.czOdds ?? "") as never} book="caesars" />`
- app/builder/page.tsx:306 — `{l.cz != null && <span className="text-gold">{fmtAmerican(Number(l.cz))}</span>}` [x2]
- app/builder/page.tsx:331 — `czEv?: number | null;`
- app/builder/page.tsx:354 — `for (const r of rows) if (r.czEv != null && (best === null || r.czEv > best)) best = r.czEv;` [x3]
- app/builder/page.tsx:390 — `{b.czEv != null ? <span className="num text-pos">+{b.czEv}% EV</span> : null}` [x2]
- app/builder/page.tsx:398 — `: ' (CZ ${b.czEv != null ? b.czEv + "%" : "no quote"}) · no override'}` [x3]
- app/builder/page.tsx:637 — `t={{ name: t.name, legs: t.legs, czOdds: t.czOdds, czEv: t.czEv ?? null, bsOdds: t.bsOdds ?? null, bsEv: t.bsEv ?? null, prob: t.prob, confirmed: t.confirmed ?? null } as…` [x4]
- app/builder/page.tsx:649 — `placeholder={String(t.czOdds ?? "")}`
- app/builder/page.tsx:669 — `if (r.cz == null || r.susp || seen.has(k)) return false;`
- app/builder/page.tsx:679 — `.filter((r) => ticketFilter.markets.includes(String(r.market ?? marketOf(r.lkey ?? ""))) && inOddsRange(Number(r.czOdds ?? r.cz),ticketFilter.odds??{min:null,max:null}))` [x2]
- app/builder/page.tsx:694 — `const cz = Number(String(r.czOdds).replace(/[^\d.-]/g, ""));` [x2]
- app/builder/page.tsx:695 — `const ld = amToDec(cz);`
- app/builder/page.tsx:720 — `const czCover = useMemo(() => {`
- app/builder/page.tsx:727 — `for (const r of rows) if (r.gkey && r.cz != null) have.add(String(r.gkey));`
- app/builder/page.tsx:794 — `{!locked && czCover && (`
- app/builder/page.tsx:795 — `<div className={'num mb-3 text-[11px] sm:mb-4 sm:text-[11.5px] ${czCover.have < czCover.total ? "text-gold" : "text-muted"}'}>` [x2]
- app/builder/page.tsx:796 — `DraftKings props live for {czCover.have} of {czCover.total} games right now` [x2]
- app/builder/page.tsx:797 — `{czCover.have < czCover.total && (` [x2]
- app/builder/page.tsx:1055 — `{/* engine ev is a fraction; EvBadge (like ticket czEv) speaks percent */}`
- app/builder/page.tsx:1137 — `<span className="num text-gold">{String(r.czOdds)}</span>`
- app/builder/page.tsx:1164 — `<span className="num text-gold">{String(r.czOdds)}</span>`
- app/builder/page.tsx:1179 — `{fmtPct(slipCalc.p)} true · <span className="text-gold">{fmtAmerican(decToAm(slipCalc.dec))}</span> @ CZR`
- app/design/page.tsx:33 — `cz: number;`
- app/design/page.tsx:38 — `{ id: "1", pick: "Sample Batter A (AAA)", market: "Hits O 0.5", prob: 0.741, fair: -286, cz: -310, ev: 2.4 },`
- app/design/page.tsx:39 — `{ id: "2", pick: "Sample Batter B (BBB)", market: "TB O 1.5", prob: 0.512, fair: 105, cz: 118, ev: 4.1 },`
- app/design/page.tsx:40 — `{ id: "3", pick: "Sample Pitcher C (CCC)", market: "Ks O 5.5", prob: 0.633, fair: -172, cz: -155, ev: 3.2 },`
- app/design/page.tsx:41 — `{ id: "4", pick: "Sample Batter D (DDD)", market: "H+R+RBI O 1.5", prob: 0.581, fair: -139, cz: -150, ev: -1.6 },`
- app/design/page.tsx:42 — `{ id: "5", pick: "Sample Batter E (EEE)", market: "HR O 0.5", prob: 0.118, fair: 748, cz: 650, ev: -5.8 },`
- app/design/page.tsx:56 — `{ key: "cz", header: "DraftKings", numeric: true, sortValue: (r) => r.cz, cell: (r) => <OddsCell odds={r.cz} book="caesars" /> },` [x3]
- app/design/page.tsx:90 — `legs: { abbr: string; label: string; cz: string; market: string }[];`
- app/design/page.tsx:103 — `{ abbr: "AAA", label: "Sample A −7.5", cz: "−200", market: "Spread" },`
- app/design/page.tsx:104 — `{ abbr: "BBB", label: "Sample B ML", cz: "−150", market: "ML" },`
- app/design/page.tsx:116 — `legs: [{ abbr: "CCC", label: "Sample C −3.5", cz: "−105", market: "Spread" }],`
- app/design/page.tsx:146 — `<span className="num font-semibold text-gold">{l.cz}</span>`
- app/design/page.tsx:286 — `<div className="display text-[34px] text-gold">CZR</div>`
- app/ledger/page.tsx:129 — `l: { label: string; prop: string; cz?: number | null; lkey?: string | null; gkey?: string | null };`
- app/ledger/page.tsx:173 — `<span className="text-gold">{l.cz != null ? amSign(Number(l.cz)) : "no CZ price"}</span>` [x3]
- app/ledger/page.tsx:262 — `{t.confirmed != null ? '${amSign(t.confirmed)} (NV)' : String(t.czOdds ?? "")}`
- app/props/page.tsx:113 — `czOnly: false,`
- app/props/page.tsx:254 — `const start=r.gkey?d?.gameInfo?.[r.gkey]?.start:undefined;if(!start||Date.parse(start)<=at||typeof r.cz!=="number"||typeof r.prob!=="number")continue;`
- app/props/page.tsx:256 — `sideLegs.push({id,am:r.cz,dec:amToDec(r.cz),prob:r.prob,ev:r.prob/100*amToDec(r.cz)-1,src:"model",side:"o",label,sub,market,gameKey:String(r.gkey??game),playerKey:'side:${r.…` [x5]
- app/props/page.tsx:368 — `const cz = typeof r.cz === "number" ? r.cz : null;` [x3]
- app/props/page.tsx:370 — `if (cz == null || prob == null || !(prob > 0)) continue;`
- app/props/page.tsx:374 — `const book = r.displayBook ? bookName(String(r.displayBook)) : "CZ";`
- app/props/page.tsx:383 — `am: cz,`
- app/props/page.tsx:385 — `ev: ((prob / 100) * amToDec(cz) - 1) * 100,`
- app/props/page.tsx:388 — `leg: { id, label, sub, game, cz, prob, market, book, src: "model" },`
- app/settings/page.tsx:69 — `EV-gated @ CZ (default)`
- app/settings/page.tsx:113 — `<b className="text-muted">EV-gated @ CZ</b> (default): every selection number — the EV gate, edge badges,`
- app/settings/page.tsx:118 — `book&apos;s price influences selection, and CZ becomes display + settlement only — a card ticket still needs`
- app/settings/page.tsx:123 — `legacy ranking by playable edge at CZ. Auto-calibration lets the nightly grader shrink a market&apos;s model`
- app/sharp/page.tsx:156 — `.filter((r) => r.cz != null && Number(r.czEv) > 0)` [x2]
- app/sharp/page.tsx:157 — `.sort((a, b) => Number(b.czEv) - Number(a.czEv))` [x2]
- app/sharp/page.tsx:171 — `plays: gated.filter((r) => r.cz != null).slice(0, 8),`
- app/sharp/page.tsx:172 — `notOffered: gated.filter((r) => r.cz == null).slice(0, 8),`
- app/sharp/page.tsx:177 — `// a Caesars quote and must clear the core EV gate AT Caesars, ranked by czEv`
- app/sharp/page.tsx:178 — `const gatedCz = rows`
- app/sharp/page.tsx:179 — `.filter((r) => r.cz != null && Number(r.czEv) >= gatePct)` [x2]
- app/sharp/page.tsx:180 — `.sort((a, b) => Number(b.czEv) - Number(a.czEv));` [x2]
- app/sharp/page.tsx:181 — `return { plays: gatedCz.slice(0, 8), notOffered: [] as PickRow[] };`
- app/sharp/page.tsx:185 — `plays: top.filter((r) => r.cz != null),`
- app/sharp/page.tsx:186 — `notOffered: top.filter((r) => r.cz == null),`
- app/sharp/page.tsx:388 — `<OddsCell odds={r.czOdds as never} book="caesars" />`
- app/sharp/page.tsx:461 — `'live.czAm' / 'live.evCz' are the OVER's price and the OVER's EV. An` [x2]
- app/sharp/page.tsx:511 — `<EvBadge ev={Number(selMode === "dk_fd" ? r.bsEv : r.czEv)} />`
- app/sharp/page.tsx:512 — `{selMode === "dk_fd" && r.czEv != null && (`
- app/sharp/page.tsx:514 — `@book {Number(r.czEv) > 0 ? "+" : ""}{Number(r.czEv).toFixed(1)}%` [x2]
- app/sharp/page.tsx:517 — `{(selMode === "dk_fd" ? r.bsBadge : r.czBadge) ? (`
- src/components/allstar/AllStarSurfaces.tsx:229 — `…ket fair ${fmtP(l.market)} (${l.note}); the calibrated game's structure independently reads ${fmtP(l.model)} for this window. CZ pays ${fmtAm(l.odds)} vs fair ${fairAm(l.blend)}.';`
- src/components/cfb/CfbBuilder.tsx:225 — `return card.core.reduce((s, t) => s + t.czEv, 0) / card.core.length;`
- src/components/cfb/CfbBuilder.tsx:274 — `const shown=tickets.filter(t=>t.legs.every(l=>discoveryMatches({market:l.market,am:l.cz,prob:l.prob*100,ev:0,sport:L.id,start:games.get(l.gkey)?.start,started:games.get(l.gkey)?.…`
- src/components/cfb/CfbBuilder.tsx:623 — `{fmtEv(b.evCz)} <span className="text-faint">· {b.reason}</span>`
- src/components/cfb/CfbGameCard.tsx:169 — `if (!row.cz) return { line, price: "—", tone: "muted", onClick: opts.onClick, selected: opts.picked, aria: '${row.label} — no selected-book price', split };`
- src/components/cfb/CfbGameCard.tsx:170 — `const czDiffers = base !== "ml" && row.cz.line != null && row.line != null && Math.abs(row.cz.line - row.line) > 1e-9;` [x3]
- src/components/cfb/CfbGameCard.tsx:171 — `const czLine = czDiffers ? (base === "spread" ? fmtLine(row.cz.line!) : '${row.side === "over" ? "O" : "U"} ${row.cz.line}') : line;` [x4]
- src/components/cfb/CfbGameCard.tsx:173 — `const tone: OddsGridCell["tone"] = closed ? "muted" : (row.evCz ?? -1) > 0 ? "ev" : row.cz.price > 0 ? "plus" : "minus";` [x2]
- src/components/cfb/CfbGameCard.tsx:175 — `line: czLine,`
- src/components/cfb/CfbGameCard.tsx:176 — `price: fmtAmerican(row.cz.price),`
- src/components/cfb/CfbGameCard.tsx:180 — `aria: '${row.label} at ${row.cz.title} ${fmtAmerican(row.cz.price)}${row.evCz != null ? ', EV ${fmtEv(row.evCz)}' : ""}${closed ? ", closed" : ""}',` [x4]
- src/components/cfb/CfbGameCard.tsx:264 — `.filter((r) => !isH1Market(r.market) && (r.evCz ?? -1) > 0)`
- src/components/cfb/CfbGameCard.tsx:265 — `.sort((a, b) => (b.evCz ?? 0) - (a.evCz ?? 0));` [x2]
- src/components/cfb/CfbGameCard.tsx:337 — `{r.evCz != null && <EvBadge ev={r.evCz} className="scale-90" />}` [x2]
- src/components/cfb/CfbGameCard.tsx:495 — `const lit = (row.evCz ?? -1) > 0;`
- src/components/cfb/CfbGameCard.tsx:511 — `Book <span className={row.cz ? "text-gold" : "text-faint"}>{quoteText(row.cz, row)}</span>` [x2]
- src/components/cfb/CfbGameCard.tsx:512 — `{row.evCz != null && <EvBadge ev={row.evCz} className="ml-1 scale-90" />}` [x2]
- src/components/cfb/CfbPicksBoard.tsx:485 — `…tches(r, needle) && discoveryMatches({chanceRank:chanceRanks.get(r),market:r.market,am:r.cz?.price??NaN,prob:(r.fair??0)*100,ev:r.evCz??-Infinity,start:games.get(r.gameId)?.start,s…` [x2]
- src/components/cfb/CfbPicksBoard.tsx:493 — `const plusEv = all.filter((r) => (r.evCz ?? -1) > 0);`
- src/components/cfb/CfbPicksBoard.tsx:496 — `const featured = useMemo(() => plusEv.filter((r) => r.cz != null), [plusEv]);`
- src/components/cfb/CfbPicksBoard.tsx:515 — `const leanIndex = useMemo(() => footballLeanIndex(propRows, "cz"), [propRows]);`
- src/components/cfb/CfbPicksBoard.tsx:544 — `… { key: "grade", header: "Grade", fit: true, sortValue: (r) => gradeSortKey(gradeRank(r.grade), r.evCz), cell: (r) => <GradeChip grade={r.grade} basis="EV @ selected book" /> },`
- src/components/cfb/CfbPicksBoard.tsx:561 — `key: "cz",`
- src/components/cfb/CfbPicksBoard.tsx:566 — `sortValue: (r) => r.cz?.price ?? -100000,`
- src/components/cfb/CfbPicksBoard.tsx:568 — `r.cz ? (`
- src/components/cfb/CfbPicksBoard.tsx:570 — `<OddsCell odds={r.cz.price} book="caesars" />`
- src/components/cfb/CfbPicksBoard.tsx:571 — `{baseMarketOf(r.market) !== "ml" && r.cz.line != null && r.line != null && Math.abs(r.cz.line - r.line) > 1e-9 && (` [x2]
- src/components/cfb/CfbPicksBoard.tsx:573 — `@{baseMarketOf(r.market) === "spread" ? fmtLine(r.cz.line) : r.cz.line}` [x2]
- src/components/cfb/CfbPicksBoard.tsx:596 — `…Title: "EV at the selected book's price", numeric: true, fit: true, sortValue: (r) => r.evCz ?? -999, cell: (r) => (r.evCz != null ? <EvBadge ev={r.evCz} /> : <span className="text…` [x3]
- src/components/cfb/CfbPicksBoard.tsx:648 — `sub={top && top.evCz != null && top.cz ? <><PosTag pos={top.kind === "prop" ? top.pos : null} className="mr-1" />{'${fmtAmerican(top.cz.price)} · ${top.evCz > 0 ? "+" : "…` [x5]
- src/components/cfb/CfbPicksBoard.tsx:731 — `…wKey={(r) => r.key} maxHeight="62vh" stagger={scope === "top"} rowClassName={(r) => ((r.evCz ?? -1) > 0 ? "ev-glow" : "")} defaultSort={{ key: "grade", dir: -1 }} resetKey={'${date…`
- src/components/cfb/CfbPicksBoard.tsx:754 — `{selectedBook === "DraftKings" && propsQ.data.czMissing`
- src/components/cfb/CfbPicksBoard.tsx:755 — `? ' · ${propsQ.data.czMissing} game${propsQ.data.czMissing === 1 ? "" : "s"} post player props at other books but no DraftKings line yet — re-checked every ${CFB_…` [x4]
- src/components/cfb/CfbPicksBoard.tsx:819 — `const cz = r.cz!;` [x2]
- src/components/cfb/CfbPicksBoard.tsx:826 — `…ss card-lift relative w-[78vw] max-w-[320px] rounded-[14px] border px-3 pb-2 pt-2 md:w-[calc(33.333%-8px)] md:max-w-none ${s ? "shine" : ""} ${(r.evCz ?? 0) > 0 ? "ev-glow" : ""}'}`
- src/components/cfb/CfbPicksBoard.tsx:854 — `<div className={nfl ? "pick-price hero-price is-nfl num mt-0.5" : "pick-price hero-price is-cfb num mt-0.5"}>{fmtAmerican(cz.price)}</div>`
- src/components/cfb/CfbPicksBoard.tsx:855 — `<div className="text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{bookName(cz.book)}</div>`
- src/components/cfb/CfbPicksBoard.tsx:856 — `{baseMarketOf(r.market) !== "ml" && cz.line != null && r.line != null && Math.abs(cz.line - r.line) > 1e-9 && (` [x2]
- src/components/cfb/CfbPicksBoard.tsx:858 — `at {baseMarketOf(r.market) === "spread" ? fmtLine(cz.line) : cz.line}` [x2]
- src/components/cfb/CfbPicksBoard.tsx:863 — `{r.evCz != null && <EvBadge ev={r.evCz} />}` [x2]
- src/components/cfb/CfbPicksBoard.tsx:870 — `<span className="text-[9px] uppercase tracking-wide text-faint">${WIN_STAKE} wins</span> <b className="text-pos">{usd(winsOn(cz.dec))}</b>`
- src/components/cfb/CfbPicksBoard.tsx:1045 — `…{chanceRank:legRanks.get(l),market:l.market,prob:l.prob*100,ev:(l.prob*l.dec-1)*100,am:l.cz,start:games.get(l.gameId)?.start,started:l.live,sport:L.id,game:l.gameId})),discovery));`
- src/components/cfb/CfbPicksBoard.tsx:1205 — `<span className="num shrink-0 font-semibold text-gold">{fmtAmerican(leg.cz)}</span>`
- src/components/cfb/CfbPicksBoard.tsx:1267 — `<span className="num shrink-0 font-semibold text-gold">{fmtAmerican(leg.cz)}</span>`
- src/components/cfb/CfbProps.tsx:98 — `type PriceMode = "cz" | "best";`
- src/components/cfb/CfbProps.tsx:104 — `{ key: "cz", label: "DraftKings" },`
- src/components/cfb/CfbProps.tsx:109 — `williamhill_us: "CZ",`
- src/components/cfb/CfbProps.tsx:143 — `return rows.find((r) => r.cz) ?? rows[0];`
- src/components/cfb/CfbProps.tsx:147 — `if (mode === "cz") return row.cz;` [x2]
- src/components/cfb/CfbProps.tsx:148 — `return row.best ?? row.cz;`
- src/components/cfb/CfbProps.tsx:152 — `if (mode === "cz") return row.evCz;` [x2]
- src/components/cfb/CfbProps.tsx:153 — `return row.best ? row.evBest : row.evCz;`
- src/components/cfb/CfbProps.tsx:167 — `cz: q.price,`
- src/components/cfb/CfbProps.tsx:208 — `const line = [lineText(market, side, q.line), tag !== "CZ" ? tag : null].filter(Boolean).join(" · ") || undefined;`
- src/components/cfb/CfbProps.tsx:216 — `aria: '${row.label} ${amFmt(q.price)}${tag !== "CZ" ? ' at ${tag}' : ""}',`
- src/components/cfb/CfbProps.tsx:381 — `if (mode === "cz") return row.cz;` [x2]
- src/components/cfb/CfbProps.tsx:382 — `return row.best ?? row.cz;`
- src/components/cfb/CfbProps.tsx:386 — `if (mode === "cz") return row.evCz;` [x2]
- src/components/cfb/CfbProps.tsx:387 — `return row.best ? row.evBest : row.evCz;`
- src/components/cfb/CfbProps.tsx:420 — `cz: q.price,`
- src/components/cfb/CfbProps.tsx:515 — `const line = [lineTag(q.line ?? row.line), tag !== "CZ" ? tag : null].filter(Boolean).join(" · ");`
- src/components/cfb/CfbProps.tsx:523 — `aria: '${leg.label} ${amFmt(q.price)}${tag !== "CZ" ? ' at ${tag}' : ""}',`
- src/components/cfb/CfbProps.tsx:756 — `czOnly: false,`
- src/components/cfb/CfbProps.tsx:809 — `const mode: PriceMode = "cz";`
- src/components/cfb/CfbProps.tsx:855 — `const calc = useMemo(() => combineTicket(legs.map((l) => ({ cz: l.cz, prob: l.prob, push: l.push }))), [legs]);` [x2]
- src/components/cfb/CfbProps.tsx:1104 — `...legs.map((l) => '• ${l.label}${l.kind === "prop" ? ' (${l.marketLabel ?? l.market})' : ""} · ${l.sub} · ${amFmt(l.cz)} ${l.book}'),`
- src/components/cfb/CfbProps.tsx:1305 — `{selectedBook === "DraftKings" && board.czMissing ? ' · ${board.czMissing} game${board.czMissing === 1 ? "" : "s"} post player props at other books but no DraftKings li…` [x5]
- src/components/cfb/CfbSharp.tsx:50 — `type Coverage = { key: "cz" | "dk" | "fd" | "pin"; label: string; games: number };`
- src/components/cfb/CfbSharp.tsx:56 — `{ key: "cz", label: "DraftKings", games: count("cz") },` [x2]
- src/components/cfb/CfbSharp.tsx:71 — `const priced = useMemo(() => ranked.filter((r) => r.row.cz != null && r.row.evCz != null), [ranked]);` [x2]
- src/components/cfb/CfbSharp.tsx:75 — `const plusEv = playable.filter((r) => (r.row.evCz ?? -1) > 0);`
- src/components/cfb/CfbSharp.tsx:96 — `plusEv.filter((r) => (r.row.evCz ?? 0) >= L.rules.minEvPct).length`
- src/components/cfb/CfbSharp.tsx:97 — `} clear${plusEv.filter((r) => (r.row.evCz ?? 0) >= L.rules.minEvPct).length === 1 ? "s" : ""} the card's +${L.rules.minEvPct}% bar. ') +`
- src/components/cfb/CfbSharp.tsx:186 — `<Spot key={r.row.key} r={r} lit={i === 0 && (r.row.evCz ?? -1) > 0} league={L.id} />`
- src/components/cfb/CfbSharp.tsx:192 — `{trap && (trap.row.evCz ?? 0) <= GRADE_CUTS.D && (`
- src/components/cfb/CfbSharp.tsx:198 — `{trap.row.label} {trap.row.cz ? fmtAmerican(trap.row.cz.price) : "—"} at the selected book` [x2]
- src/components/cfb/CfbSharp.tsx:200 — `<EvBadge ev={trap.row.evCz ?? 0} />`
- src/components/cfb/CfbSharp.tsx:205 — `{Math.abs(trap.row.evCz ?? 0).toFixed(1)}% per dollar`
- src/components/cfb/CfbSharp.tsx:206 — `{trap.row.best && trap.row.best.book !== trap.row.cz?.book ? ' (${fmtAmerican(trap.row.best.price)} is posted at ${bookShort(trap.row.best)})' : ""}. If you`
- src/components/cfb/CfbSharp.tsx:254 — `b.key === "cz" ? "border-gold/40 bg-gold/10 text-gold" : b.key === "pin" ? ACCENT[L.id].chip : "border-line-2 bg-white/[0.03] text-text"`
- src/components/cfb/CfbSharp.tsx:329 — `{row.cz && <OddsCell odds={row.cz.price} book="caesars" />}` [x2]
- src/components/cfb/CfbSharp.tsx:335 — `{row.evCz != null && <EvBadge ev={row.evCz} />}` [x2]
- src/components/cfb/CfbSharp.tsx:337 — `{row.best && row.best.book !== row.cz?.book && (`
- src/components/cfb/CfbSlip.tsx:42 — `cz: number;`
- src/components/cfb/CfbSlip.tsx:43 — `/** "CZ" for Caesars, else the book's short tag */`
- src/components/cfb/CfbSlip.tsx:205 — `{amFmt(l.cz)}`
- src/components/cfb/CfbSlip.tsx:206 — `{l.book !== "CZ" && <span className="ml-0.5 text-[8.5px] uppercase text-faint">{l.book}</span>}`
- src/components/cfb/CfbTicketCard.tsx:224 — `const evGrade = gradeFromEv(t.czEv);`
- src/components/cfb/CfbTicketCard.tsx:225 — `const glow = t.czEv > 0 ? "ev-glow" : "";`
- src/components/cfb/CfbTicketCard.tsx:227 — `const payout = ticketPayout({ stake: t.stake, czDec: t.czDec, czOdds: t.czOdds }, grade);` [x4]
- src/components/cfb/CfbTicketCard.tsx:228 — `const toWin = Math.round(t.stake * (t.czDec - 1) * 100) / 100;`
- src/components/cfb/CfbTicketCard.tsx:259 — `…le-ticket-price hero-price ${heroTone}'} aria-label={'DraftKings price ${fmtAmerican(t.czOdds)}'}>{fmtAmerican(t.czOdds)}</span> : <span className="num shrink-0 text-[10.5px] text-…` [x2]
- src/components/cfb/CfbTicketCard.tsx:265 — `<div className="num shrink-0 text-[9.5px] text-faint">{t.czDec.toFixed(2)}× DK</div>`
- src/components/cfb/CfbTicketCard.tsx:267 — `<span className={'hero-price ${heroTone} shrink-0'} aria-label={'DraftKings price ${fmtAmerican(t.czOdds)}'}>`
- src/components/cfb/CfbTicketCard.tsx:268 — `{fmtAmerican(t.czOdds)}`
- src/components/cfb/CfbTicketCard.tsx:304 — `{!single && <span className={'num shrink-0 font-semibold ${leg.cz > 0 ? "text-pos" : "text-text"}'}>{fmtAmerican(leg.cz)}</span>}` [x2]
- src/components/cfb/CfbTicketCard.tsx:327 — `<WonPaid t={{ stake: t.stake, czDec: t.czDec, czOdds: t.czOdds }} grade={grade} className="!text-[12px]" />` [x4]
- src/components/cfb/CfbTicketCard.tsx:337 — `<EvBadge ev={t.czEv} />`
- src/components/cfb/GameSuggestedPicks.tsx:25 — `const rows=(props?.rows??[]).filter(r=>r.gameId===game.id && r.cz && r.fair!=null && discoveryMatches({market:r.market,am:r.cz.price,prob:r.fair*100,ev:r.evCz??-Infinity,sport:L.i…` [x5]
- src/components/cfb/GameSuggestedPicks.tsx:26 — `…r.positionOf(r),r.pos)}/></span><span className="shrink-0 text-amber-200">{fmtAmerican(r.cz!.price)} · {r.grade??"—"} · {(r.fair!*100).toFixed(1)}%</span></div>)}</div>:null;})}</d…`
- src/components/ledger/ReceiptsPanel.tsx:39 — `<th className="py-1 pr-2">CLV vs CZ close</th>`
- src/components/mlb/LiveOpportunities.tsx:21 — `if(leg&&filter&&!discoveryMatches({market:m,sport:"mlb",started:true,start:g.start,am:leg.cz,prob:leg.prob,ev:(leg.prob/100*decimal(leg.cz)-1)*100},filter))return [];` [x2]
- src/components/mlb/LiveOpportunities.tsx:22 — `return leg?[{g,r,m,leg,ev:r.pO==null?null:(r.pO/100*decimal(leg.cz)-1)*100}]:[];`
- src/components/mlb/LiveOpportunities.tsx:32 — `<div className="text-right"><div className="num font-bold text-pos">{amFmt(leg.cz)}</div>{ev!=null?<GradeChip grade={gradeFromEv(ev)} basis="Model EV at the live quote"/>:<span…`
- src/components/mlb/ParlaysSection.tsx:108 — `const modeEv = (t: Ticket) => (basisMode ? (t.bsEv == null ? null : Number(t.bsEv)) : t.czEv == null ? null : Number(t.czEv));` [x2]
- src/components/mlb/ParlaysSection.tsx:141 — `…y):t.type)??""),prob:Number(l.prob??l.est??0),ev:Number(l.prob??l.est??0)/100*(parseAm(l.cz)!>0?1+parseAm(l.cz)!/100:1+100/-parseAm(l.cz)!)*100-100,am:parseAm(l.cz)??NaN,start:game…` [x4]
- src/components/mlb/ParlaysSection.tsx:142 — `const playable = shown.filter((t) => t.czOdds != null);`
- src/components/mlb/ParlaysSection.tsx:153 — `odds: parseAm(l.cz),`
- src/components/mlb/ParlaysSection.tsx:156 — `const offBook = shown.filter((t) => t.czOdds == null);`
- src/components/mlb/ParlaysSection.tsx:196 — `const toWin = e.czDec && e.stake != null ? Math.round(e.stake * (e.czDec - 1)) : e.toWin;` [x2]
- src/components/mlb/ParlaysSection.tsx:204 — `{String(t.czOdds)} @ book`
- src/components/mlb/ParlaysSection.tsx:296 — `{l.cz != null && <span className="num ml-1 text-[10.5px]">({l.cz > 0 ? '+${l.cz}' : l.cz})</span>}` [x4]
- src/components/mlb/ParlaysSection.tsx:342 — `missing: {t.legs.filter((l) => l.cz == null).map((l) => '${l.label} ${l.prop}').join(", ")}`
- src/components/mlb/ProScoreboard.tsx:21 — `type SnapRow = { fair: number | null; n: number; cz: { o: number | null; u: number | null } | null };`
- src/components/mlb/ProScoreboard.tsx:50 — `const czClose = row.cz ? (side === "o" ? row.cz.o : row.cz.u) : null;` [x4]
- src/components/mlb/ProScoreboard.tsx:51 — `return { fair, czClose };`
- src/components/mlb/ProScoreboard.tsx:109 — `if (l.cz == null) continue;`
- src/components/mlb/ProScoreboard.tsx:115 — `clvSum += close.fair - imp(l.cz);`
- src/components/mlb/ProScoreboard.tsx:116 — `if (close.czClose != null) {`
- src/components/mlb/ProScoreboard.tsx:118 — `if (dec(l.cz) > dec(close.czClose)) beatYes++;` [x2]
- src/components/mlb/ProScoreboard.tsx:158 — `<div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">Beat the CZ close</div>`
- src/components/mlb/SharpDesk.tsx:33 — `<span className="font-bold text-gold">{fmtAm(s.cz)}</span>`
- src/components/mlb/SharpDesk.tsx:36 — `) : s.czEv != null ? (`
- src/components/mlb/SharpDesk.tsx:37 — `<EvBadge ev={s.czEv * 100} />`
- src/components/mlb/SharpDesk.tsx:93 — `: (g.away.czEv ?? -1) > 0.01 || (g.home.czEv ?? -1) > 0.01 || (g.total.overEv ?? -1) > 0.01 || (g.total.underEv ?? -1) > 0.01)` [x2]
- src/components/mlb/SharpDesk.tsx:115 — `{g.total.czPoint != null && (`
- src/components/mlb/SharpDesk.tsx:117 — `Book {g.total.czPoint}: {fmtAm(g.total.czOver)}/{fmtAm(g.total.czUnder)}` [x3]
- src/components/mlb/SharpDesk.tsx:131 — `{g.total.czPoint != null && g.total.point !== g.total.czPoint && (` [x2]
- src/components/mlb/SimDesk.tsx:30 — `cz: { pt: number; o: number; u: number } | null;`
- src/components/mlb/SimDesk.tsx:84 — `{t.cz && (`
- src/components/mlb/SimDesk.tsx:86 — `Book {t.cz.pt}: {fmtAm(t.cz.o)}/{fmtAm(t.cz.u)}` [x3]
- src/components/mlb/SimDesk.tsx:91 — `{t.cz && t.cz.pt !== t.pt && (` [x2]
- src/components/mlb/SimDesk.tsx:120 — `F5 and team-total fair prices are the model alone — compare them to the CZ app before betting anything.`
- src/components/props/CrossBoardResults.tsx:21 — `…egies.length<STRATEGIES.length&&filter.strategies.includes("stacks")),onePerTeam:false,czOnly:false,includeStarted:true,modelOnly:false,pinned:[],strategies:filter.strategies,prefe…`
- src/components/props/GameCard.tsx:190 — `const cz = typeof r.cz === "number" ? r.cz : null;` [x3]
- src/components/props/GameCard.tsx:215 — `{cz != null ? (`
- src/components/props/GameCard.tsx:224 — `cz,`
- src/components/props/GameCard.tsx:227 — `book: r.displayBook ? bookName(String(r.displayBook)) : "CZ",`
- src/components/props/GameCard.tsx:235 — `{amFmt(cz)}`
- src/components/props/GameCard.tsx:239 — `no CZ`
- src/components/props/GenSheet.tsx:138 — `cz: { czOnly: false },` [x2]
- src/components/props/GenSheet.tsx:149 — `cz: "Drop the selected-book-only filter",`
- src/components/props/GenSheet.tsx:160 — `cz: "drop the selected-book-only filter and it may fit",`
- src/components/props/GenSheet.tsx:540 — `{l.book && l.book !== "CZ" && <span className="uppercase">{l.book}</span>}`
- src/components/props/GenSheet.tsx:794 — `const calc = ticket ? combineTicket(ticket.legs.map((l) => ({ cz: l.am, prob: l.prob, push: l.push }))) : null;`
- src/components/props/PlayerRow.tsx:104 — `{price.book !== "CZ" && <span className="shrink-0 text-[7.5px] uppercase text-faint">{price.book}</span>}`
- src/components/props/RankedPicks.tsx:362 — `{(p.src === "market" || (p.book && p.book !== "CZ")) && (`
- src/components/props/RankedPicks.tsx:363 — `<span className="mt-[2px] text-[8px] font-normal uppercase text-faint">{p.src === "market" ? "mkt " : ""}{p.book && p.book !== "CZ" ? p.book : ""}</span>`
- src/components/props/Slip.tsx:103 — `{amFmt(l.cz)}`
- src/components/props/Slip.tsx:104 — `{l.book && l.book !== "CZ" && <span className="ml-0.5 text-[8.5px] uppercase text-faint">{l.book}</span>}`
- src/components/props/mlb-gen-pool.ts:105 — `const dec = amToDec(leg.cz);`
- src/components/props/mlb-gen-pool.ts:112 — `am: leg.cz,`
- src/components/props/props-model.ts:66 — `caesars: "CZ",`
- src/components/props/props-model.ts:67 — `"william hill (us)": "CZ",`
- src/components/props/props-model.ts:239 — `type OppSide = { label: string; odds?: string | null; cz?: number | null; prob?: number; pt?: number | null; lkey?: string | null };`
- src/components/props/props-model.ts:251 — `cz: o.cz ?? null,` [x2]
- src/components/props/props-model.ts:279 — `const cz = r.cz ? (side === "o" ? r.cz.o : r.cz.u) : null;` [x4]
- src/components/props/props-model.ts:280 — `if (cz != null) return { am: cz, book: r.displayBook ? bookAb(bookName(r.displayBook)) : r.settlementBook ? bookAb(bookName(String(r.settlementBook))) : "CZ" };` [x3]
- src/components/props/props-model.ts:325 — `cz: price.am,`
- src/components/props/useSlotDrag.ts:45 — `const cz = Number.isFinite(computedZoom) && computedZoom > 0.05 ? computedZoom : 1;`
- src/components/props/useSlotDrag.ts:47 — `return { zoom: cz, toScreen: cz };` [x2]
- src/components/stats/ClvPanel.tsx:30 — `ev_gated: "EV-gated @ CZ",`
- src/components/stats/ClvPanel.tsx:79 — `const cents = useMemo(() => meanSE(sel.map((r) => r.czCents).filter((x): x is number => x != null)), [sel]);`
- src/components/stats/ClvPanel.tsx:142 — `Avg CLV · cents vs CZ close`
- src/components/stats/ClvPanel.tsx:164 — `<th className="pb-2 text-right">n (CZ)</th>`
- src/components/stats/ClvPanel.tsx:166 — `CZ cents`
- src/components/ufc/UfcBoard.tsx:75 — `key: "cz",`
- src/components/ufc/UfcBoard.tsx:78 — `sortValue: (r) => r.side.czOdds ?? -100000,`
- src/components/ufc/UfcBoard.tsx:80 — `r.side.czOdds != null ? (`
- src/components/ufc/UfcBoard.tsx:81 — `<OddsCell odds={fmtAm(r.side.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcBoard.tsx:90 — `sortValue: (r) => r.side.czEv ?? -9,`
- src/components/ufc/UfcBoard.tsx:91 — `cell: (r) => (r.side.czEv != null ? <EvBadge ev={r.side.czEv * 100} /> : <span className="text-faint">—</span>),` [x2]
- src/components/ufc/UfcBoard.tsx:115 — `{r.rounds.point} <span className="text-[9.5px] text-faint">{r.rounds.book} · not CZ</span>`
- src/components/ufc/UfcBoard.tsx:158 — `rowClassName={(r) => ((r.side.czEv ?? -1) > 0 ? "ev-glow" : "")}`
- src/components/ufc/UfcBoard.tsx:185 — `{fmtAm(l.czOdds)} · {fmtPct(l.prob)}`
- src/components/ufc/UfcBuilder.tsx:29 — `czOdds: number;`
- src/components/ufc/UfcBuilder.tsx:57 — `.filter(({ side }) => side.czOdds != null && side.prob != null)`
- src/components/ufc/UfcBuilder.tsx:65 — `czOdds: side.czOdds!,` [x2]
- src/components/ufc/UfcBuilder.tsx:67 — `czEv: side.czEv ?? null,` [x2]
- src/components/ufc/UfcBuilder.tsx:87 — `setSlip((s) => [...s, { fightId: p.fightId, fight: p.fight, pick: p.pick, record: p.record, czOdds: p.czOdds, prob: p.prob }]);` [x2]
- src/components/ufc/UfcBuilder.tsx:99 — `setSlip((s) => [...s, { fightId: p.groupId, fight: p.fight, pick: p.pick, czOdds: p.czOdds, prob: p.prob }]);` [x2]
- src/components/ufc/UfcBuilder.tsx:105 — `const dec = slip.reduce((a, l) => a * amToDec(l.czOdds), 1);`
- src/components/ufc/UfcBuilder.tsx:171 — `<OddsCell odds={fmtAm(p.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcBuilder.tsx:189 — `{fmtPct(l.prob)} · {fmtAm(l.czOdds)}`
- src/components/ufc/UfcCard.tsx:62 — `{s.czOdds != null ? (`
- src/components/ufc/UfcCard.tsx:63 — `<OddsCell odds={fmtAm(s.czOdds) as never} book="caesars" />`
- src/components/ufc/UfcLiveProps.tsx:18 — `type ApiProp = { label: string; cz: number; bestBook: string | null; bestOdds: number | null; medImplied: number; books: number };`
- src/components/ufc/UfcLiveProps.tsx:19 — `type ApiFight = { a: string; b: string; czMlA: number | null; czMlB: number | null; props: ApiProp[] };` [x2]
- src/components/ufc/UfcLiveProps.tsx:93 — `const evVsMed = p.medImplied * amToDec(p.cz) - 1;`
- src/components/ufc/UfcLiveProps.tsx:94 — `const czBest = p.bestOdds == null || amToDec(p.cz) >= amToDec(p.bestOdds);` [x2]
- src/components/ufc/UfcLiveProps.tsx:95 — `const longshot = p.cz >= 1500;`
- src/components/ufc/UfcLiveProps.tsx:100 — `<span className="font-bold text-gold">{fmtAm(p.cz)}</span>`
- src/components/ufc/UfcLiveProps.tsx:101 — `{czBest ? (`
- src/components/ufc/UfcLiveProps.tsx:103 — `CZ BEST`
- src/components/ufc/UfcLiveProps.tsx:119 — `czOdds: p.cz,` [x2]
- src/components/ufc/UfcLiveProps.tsx:138 — `markets), so treat green there with suspicion; CZ BEST just means no book on the board beats this price.`
- src/components/ufc/UfcProps.tsx:16 — `export type PropLeg = { groupId: string; fight: string; pick: string; czOdds: number; prob: number };`
- src/components/ufc/UfcProps.tsx:170 — `onClick={() => onAdd({ groupId, fight: fightLabel, pick: c.label, czOdds: c.am, prob: c.prob })}`
- src/components/ufc/UfcSharp.tsx:43 — `.filter((s) => s.side.czOdds != null && s.side.czEv != null);` [x2]
- src/components/ufc/UfcSharp.tsx:46 — `const byEv = useMemo(() => [...spots].sort((a, b) => (b.side.czEv ?? -9) - (a.side.czEv ?? -9)), [spots]);` [x2]
- src/components/ufc/UfcSharp.tsx:49 — `const posCount = spots.filter((s) => (s.side.czEv ?? -1) > 0).length;`
- src/components/ufc/UfcSharp.tsx:89 — `<Panel key={s.side.name} className={(s.side.czEv ?? -1) > 0 && i === 0 ? "glow-pos" : ""}>`
- src/components/ufc/UfcSharp.tsx:100 — `<OddsCell odds={fmtAm(s.side.czOdds!) as never} book="caesars" />`
- src/components/ufc/UfcSharp.tsx:104 — `<EvBadge ev={(s.side.czEv ?? 0) * 100} />`
- src/components/ufc/UfcSharp.tsx:116 — `{trap && (trap.side.czEv ?? 0) < -0.03 && (`
- src/components/ufc/UfcSharp.tsx:120 — `{trap.side.name} {fmtAm(trap.side.czOdds!)} at selected book`
- src/components/ufc/UfcSharp.tsx:124 — `{(Math.abs(trap.side.czEv!) * 100).toFixed(1)}% to the market`
- src/components/ufc/UfcSharp.tsx:153 — `<span className="num shrink-0 text-muted">{fmtAm(l.czOdds)} · {fmtPct(l.prob)}</span>`
- src/components/ui/CzInfo.tsx:10 — `export function CzInfo({ pickKey, offered, onToggle }: { pickKey: string; offered: boolean; onToggle: (k: string) => void }) {`

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — tests (1496 lines)

- tests/a1-shade.test.ts:16 — `* - pool: pregame parlays + mixed (no live legs), czDec != null — the production card pool.`
- tests/a1-shade.test.ts:63 — `].filter((p) => p.czDec != null);`
- tests/a1-shade.test.ts:90 — `if (won) end += card[i].stake * Number(card[i].pl.czDec);`
- tests/a1-shade.test.ts:138 — `' czEv ${String(c.pl.czEv).padStart(5)}% prob ${String(c.pl.prob).padStart(5)}%',` [x2]
- tests/a1-shade.test.ts:147 — `'\npool ${pPool.length} pregame czDec tickets · bankroll $${BANKROLL} · daily $${DAILY}' +`
- tests/a1-shrink.test.ts:22 — `* - IN-LOOP: shrunk est feeds the ticket prob, czEv (the gate), the ranking key and`
- tests/a1-shrink.test.ts:35 — `* ticket EV at the CZ price equals the consensus-at-CZ EV (consCzEv) — line-shopping` [x3]
- tests/a1-shrink.test.ts:72 — `].filter((p) => p.czDec != null);`
- tests/a1-shrink.test.ts:102 — `if (won) end += card[i].stake * Number(card[i].pl.czDec);`
- tests/a1-shrink.test.ts:111 — `naive-product ratio (keeps any sim-joint adjustment); czEv recomputed from the`
- tests/a1-shrink.test.ts:112 — `new prob at the same czDec — the gate and the ranking see the shrunk belief. */`
- tests/a1-shrink.test.ts:126 — `const czDec = Number(pl.czDec);` [x2]
- tests/a1-shrink.test.ts:130 — `czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,` [x5]
- tests/a1-shrink.test.ts:144 — `const czDec = Number(pl.czDec);` [x2]
- tests/a1-shrink.test.ts:148 — `czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,` [x5]
- tests/a1-shrink.test.ts:224 — `const evs = poolL.map((w) => Number((w.pl as Row).czEv)).filter((x) => isFinite(x));`
- tests/a1-shrink.test.ts:228 — `' λ=1 EV census (the impossible-branch print): ${pos} of ${evs.length} pool tickets carry czEv > 0' +`
- tests/a1-shrink.test.ts:229 — `' — these are consensus-at-CZ EVs (line-shopping dispersion), NOT model edge; max ${Math.max(...evs).toFixed(1)}%',`
- tests/autopsy-floors.test.ts:7 — `- settlement floor: czEv must be ≥ coreCzEvMin (0) — NV tax never flips a lock negative` [x2]
- tests/autopsy-floors.test.ts:26 — `czEv?: number | null;`
- tests/autopsy-floors.test.ts:37 — `prob 58% at basis 1.9 → bsEv +10.2%; czEv picks the CZ decimal (czEv% = p·czDec−1). */` [x4]
- tests/autopsy-floors.test.ts:40 — `const czEv = o.czEv === undefined ? 3 : o.czEv;` [x3]
- tests/autopsy-floors.test.ts:51 — `czDec: Math.round(((1 + czEv / 100) / (prob / 100)) * 10000) / 10000,` [x2]
- tests/autopsy-floors.test.ts:52 — `czEv,`
- tests/autopsy-floors.test.ts:80 — `describe("settlement floor — czEv ≥ 0 required to lock, disclosed when it bites", () => {`
- tests/autopsy-floors.test.ts:82 — `const bad = mkTicket({ name: "TaxTrap", bsEv: 6, czEv: -1.2 });`
- tests/autopsy-floors.test.ts:83 — `const good = mkTicket({ name: "Clean", bsEv: 5, czEv: 2 });`
- tests/autopsy-floors.test.ts:90 — `{ name: "TaxTrap", type: "batter_hits", bsEv: 6, czEv: -1.2, reason: "nv_tax" },`
- tests/autopsy-floors.test.ts:93 — `it("czEv exactly 0 clears the floor (the floor is ≥ 0, not > 0)", () => {`
- tests/autopsy-floors.test.ts:94 — `const a = alloc([mkTicket({ name: "Breakeven", bsEv: 5, czEv: 0 })]);`
- tests/autopsy-floors.test.ts:99 — `const a = alloc([mkTicket({ name: "T1", czEv: -0.5 }), mkTicket({ name: "T2", czEv: -3 })]);` [x2]
- tests/autopsy-floors.test.ts:129 — `it("ev_gated mode (2026-07-22 default): the same gate reads the consensus at the CZ price", () => {`
- tests/autopsy-floors.test.ts:130 — `const mk = (name: string, consCzEv: number) => {`
- tests/autopsy-floors.test.ts:134 — `], czEv: 4 });`
- tests/autopsy-floors.test.ts:135 — `(t.pl as Record<string, unknown>).consCzEv = consCzEv;` [x2]
- tests/autopsy-floors.test.ts:138 — `const a = alloc([mk("CzFade", -5), mk("CzOk", -0.5)], { selMode: "ev_gated" });` [x2]
- tests/autopsy-floors.test.ts:139 — `expect(a.picks.map((p) => p.w.pl.name)).toEqual(["CzOk"]);`
- tests/autopsy-floors.test.ts:140 — `expect(a.blocked?.[0]).toMatchObject({ name: "CzFade", reason: "consensus" });`
- tests/autopsy-floors.test.ts:216 — `// consistent prob/CZ-decimal pairs (czDec = (1+EV)/p)` [x2]
- tests/autopsy-floors.test.ts:218 — `{ name: "07-18 FUN Mixed 5L", prob: 3.2, czEv: -23.8 },`
- tests/autopsy-floors.test.ts:219 — `{ name: "07-18 HR 3L", prob: 13.5, czEv: -22.9 },`
- tests/autopsy-floors.test.ts:220 — `{ name: "07-17 Hits 2L ($50)", prob: 45, czEv: -10 },`
- tests/autopsy-floors.test.ts:226 — `const t = mkTicket({ name: h.name, prob: h.prob, czEv: h.czEv, bsEv: 5 });` [x2]
- tests/autopsy-floors.test.ts:241 — `const dec = (1 + h.czEv / 100) / (h.prob / 100);`
- tests/autopsy-floors.test.ts:242 — `expect(kf({ prob: h.prob, czDec: dec, bsDec: dec })).toBe(0);`
- tests/autopsy-floors.test.ts:252 — `const funT = (name: string, legs: number, g0: number, czDec: number) => ({`
- tests/autopsy-floors.test.ts:253 — `pl: { name, type: "MIX", tier: "LONGSHOT", prob: 5, legs: funLegs(legs, g0), czDec, czEv: -20, bsDec: czDec, bsEv: -18 },` [x3]
- tests/autopsy-floors.test.ts:283 — `lkey?: string | null; susp?: boolean; watch?: boolean; edgeBadge?: boolean; bsBadge?: boolean; czBadge?: boolean;`
- tests/autopsy-floors.test.ts:305 — `expect(r.czBadge).toBe(false);`
- tests/basis-surfaces.test.ts:11 — `basis + CZ required, core EV gate at the basis, ranked by basis EV. */`
- tests/basis-surfaces.test.ts:75 — `// mirror of app/sharp/page.tsx: basis required, gate at the basis, CZ to be playable`
- tests/basis-surfaces.test.ts:91 — `plays: gated.filter((r) => r.cz != null).slice(0, 8),`
- tests/basis-surfaces.test.ts:92 — `notOffered: gated.filter((r) => r.cz == null).slice(0, 8),`
- tests/basis-surfaces.test.ts:96 — `it("every play carries BOTH a basis and a CZ quote and clears the gate at the basis", () => {`
- tests/basis-surfaces.test.ts:100 — `expect(r.cz).not.toBeNull();`
- tests/basis-surfaces.test.ts:112 — `it("gate-clearing picks without a CZ quote are disclosed, never promoted into plays", () => {`
- tests/basis-surfaces.test.ts:116 — `expect(r.cz ?? null).toBeNull();`
- tests/bet-alerts.test.ts:45 — `const hits: AlertTicket = { id: "batter_hits_ieydqg", stake: 233, legs: [{ label: "Richie Palacios (TB)", prop: "Hits O 0.5", cz: 112 }] };`
- tests/bet-alerts.test.ts:46 — `const ks: AlertTicket = { id: "pitcher_strikeouts_13n647u", stake: 73, legs: [{ label: "Gavin Williams (CLE)", prop: "Pitcher K's O 7.5", cz: -106 }] };`
- tests/bet-alerts.test.ts:47 — `const ml: AlertTicket = { id: "ml_hcudgi", stake: 800, czDec: 1.83, legs: [{ label: "Miami Marlins", prop: "ML vs Cleveland Guardians", cz: -120 }] };` [x2]
- tests/bet-alerts.test.ts:63 — `expect(alertBody({ stake: 730, legs: [{ label: "Justin Jefferson Anytime TD", prop: "Anytime TD", cz: 105 }] })).toBe("Justin Jefferson Anytime TD +105 ($730)");`
- tests/bet-alerts.test.ts:67 — `expect(alertBody({ stake: 50, legs: [{ label: "Justin Jefferson O 74.5 Rec Yds", prop: "Receiving Yards", cz: -110 }] })).toBe("Justin Jefferson Rec Yds over 74.5 -110 ($50)");`
- tests/bet-alerts.test.ts:68 — `expect(alertBody({ stake: 40, legs: [{ label: "Indiana -3.5", prop: "Spread", cz: -105 }] })).toBe("Indiana -3.5 -105 ($40)");`
- tests/bet-alerts.test.ts:71 — `const t: AlertTicket = { stake: 40, czDec: 5.12, legs: [{ label: "A (NYY)", prop: "Hits O 0.5", cz: -150 }, { label: "B", prop: "ML vs C", cz: 120 }] };` [x3]
- tests/bet-alerts.test.ts:160 — `…cket = { id: "nfl-2026-10-09-found-1", stake: 730, found: true, foundAt: NOW - 30_000, legs: [{ label: "Justin Jefferson Anytime TD", prop: "Anytime TD", cz: 105, gkey: "401" }] };`
- tests/bet-alerts.test.ts:161 — `…dAt: NOW - 19 * 86400_000, core: [{ id: "old-1", stake: 20, legs: [{ label: "X", prop: "ML vs Y", cz: 110 }] }], grading: { tickets: { "old-1": { result: "won", payout: 42 } } } };`
- tests/bet-alerts.test.ts:193 — `const many = Array.from({ length: 7 }, (_, i) => found({ id: 't${i}', stake: 10, legs: [{ label: 'P${i}', prop: "Hits O 0.5", cz: 100 }] }, NOW - (i < 5 ? 1000 : 5000 * i)));`
- tests/blend-sweep.test.ts:67 — `].filter((p) => p.czDec != null);`
- tests/blend-sweep.test.ts:96 — `if (won) end += card[i].stake * Number(card[i].pl.czDec);`
- tests/blend-sweep.test.ts:129 — `const czDec = Number(pl.czDec);` [x2]
- tests/blend-sweep.test.ts:133 — `czEv: isFinite(czDec) && czDec > 1 ? r1((prob / 100) * czDec - 1) : pl.czEv,` [x5]
- tests/blend-sweep.test.ts:163 — `name: c.pl.name, stake: c.stake, prob: c.pl.prob, czDec: c.pl.czDec,` [x2]
- tests/board-category-sync.test.tsx:88 — `const leg = (market: string, cz: number, gameId: string, live = false) => ({`
- tests/board-category-sync.test.tsx:89 — `kind: "side" as const, rowKey: '${gameId}|${market}|home|${cz}', gameId, label: '${market} ${gameId}', sub: "", cz,` [x2]
- tests/board-category-sync.test.tsx:90 — `dec: cz > 0 ? 1 + cz / 100 : 1 + 100 / -cz, prob: 0.5, push: 0, market, player: null, teamId: null, live,` [x3]
- tests/board-compact.test.ts:48 — `for (const key of ["fair", "cz", "best", "kelly"]) {`
- tests/board-hit-teamless.test.ts:52 — `const allScopeRows = (board: readonly PropBoardGame[]) => rowsOf(board).filter((r) => r.cz?.o != null);`
- tests/board-hit-teamless.test.ts:97 — `{ p: "Aaron Judge", tm: "NYY", ln: 0.5, lkey: "aaronjudge|batter_hits|0.5", o: null, oBook: null, u: null, uBook: null, cz: null, pO: null, fO: null, books: 0 },`
- tests/board-hit-teamless.test.ts:98 — `{ p: "Luis Garcia", tm: null, ln: 0.5, lkey: "luisgarcia|batter_hits|0.5", o: null, oBook: null, u: null, uBook: null, cz: null, pO: null, fO: null, books: 0 },`
- tests/board-live-anchor.test.ts:66 — `vi.mock("@/lib/cz-offered", () => ({`
- tests/board-live-anchor.test.ts:67 — `useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),`
- tests/board-live-anchor.test.ts:92 — `czOdds: -145,`
- tests/board-live-anchor.test.ts:93 — `czEv: 12.4,`
- tests/board-live-anchor.test.ts:97 — `czKellyF: 0.02,`
- tests/board-live-anchor.test.ts:117 — `czAm: -145,`
- tests/board-live-anchor.test.ts:125 — `evCz: 2.7,`
- tests/board-live-anchor.test.ts:233 — `const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, evCz: 2.7 }) });`
- tests/board-live-anchor.test.ts:263 — `on it — czAm, evCz, pLive — is the OVER's. Before this pass both rows rendered straight off that` [x2]
- tests/board-live-anchor.test.ts:272 — `const html = await renderBoard({ val: 1, row: UNDER, q: quote({ ln: 3.5, lkey: UNDER.lkey, czAm: -145, oppAm: 115 }) });`
- tests/board-live-anchor.test.ts:279 — `const html = await renderBoard({ val: 1, row: UNDER, q: quote({ ln: 3.5, lkey: UNDER.lkey, evCz: 2.7, evOpp: -6.1, pLive: 0.41, pSrc: "sim" }) });`
- tests/board-live-anchor.test.ts:313 — `const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "market", evCz: 2.7 }) });`
- tests/board-live-anchor.test.ts:324 — `const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "market", evCz: 2.7 }) });`
- tests/board-live-anchor.test.ts:332 — `const html = await renderBoard({ val: 3, q: quote({ ln: 3.5, pSrc: "sim", evCz: 2.7 }) });`
- tests/board-live-anchor.test.ts:501 — `const stripped = src.split(victim).join("<KellyChip stake={Number(r.czKellyF) * bankroll} />");`
- tests/board-overview-toggle.test.ts:39 — `vi.mock("@/lib/cz-offered", () => ({`
- tests/board-overview-toggle.test.ts:40 — `useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),`
- tests/board-refresh-full.test.ts:88 — `.map((g) => ({ id: '${g.id}|player_pass_yds|qb|over|250.5', gameId: g.id, market: "player_pass_yds", cz: -110 }) as unknown as CfbPropRow);`
- tests/board-refresh-full.test.ts:221 — `expect(src).toMatch(/if \(!refresh && stored && boardFresh\(stored, now, windowSec\) && czDueIds\.size === 0\) \{/);`
- tests/board-refresh-full.test.ts:223 — `expect(src).toMatch(/return refresh \|\| w === "czMissing" \|\| \(w === "live" && storedIds\.has\(g\.id\)\) \? \{ cache: "no-store" \}/);`
- tests/board-scope.test.ts:44 — `expect(src).toMatch(/if \(r\.cz\?\.o == null\) \{\s*noCz\+\+;\s*continue;\s*\}/);` [x2]
- tests/board-scope.test.ts:45 — `expect(src).toMatch(/return \[out, noCz\];/);`
- tests/board-selmode.test.ts:20 — `const R = (label: string, prob: number | null, czEv: number | null, bsEv: number | null) => ({ label, prob, czEv, bsEv });` [x2]
- tests/board-selmode.test.ts:29 — `it("ev_gated and caesars_ev rank by czEv; czEv-less rows sink, not vanish", () => {` [x2]
- tests/board-settled.test.ts:54 — `vi.mock("@/lib/cz-offered", () => ({`
- tests/board-settled.test.ts:55 — `useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),`
- tests/board-settled.test.ts:76 — `czOdds: -145,`
- tests/board-settled.test.ts:77 — `czEv: 12.4,`
- tests/board-settled.test.ts:81 — `czKellyF: 0.02,`
- tests/board-settled.test.ts:130 — `pregame number four more ways — EV @ CZR, the green EDGE badge, the ¼-Kelly stake chip and`
- tests/board-settled.test.ts:220 — `// EV @ CZR and EV @ basis`
- tests/board-settled.test.ts:221 — `expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \? -99 : Number\(r\.czEv\) \|\| 0\)/);`
- tests/board-settled.test.ts:224 — `expect(src).toMatch(/sortValue: \(r\) => \(rowSettled\(r\) \? -99 : Number\(r\.czKellyF\) \|\| 0\)/);`
- tests/board-settled.test.ts:259 — `const victim = "rowSettled(r) ? -99 : Number(r.czEv) || 0";`
- tests/board-settled.test.ts:261 — `const stripped = src.split(victim).join("Number(r.czEv) || 0");`
- tests/board-settled.test.ts:282 — `OVER's. Reading 'quote.czAm' on an Under printed the Over's price, the Over's EV and the`
- tests/board-settled.test.ts:289 — `expect(cells).not.toMatch(/quote\.czAm|quote\.evCz|quote\.pLive/); // no raw, unsided read left` [x2]
- tests/board-settled.test.ts:304 — `const ev = src.slice(src.indexOf("function LiveEv"), src.indexOf("function CzPrice"));`
- tests/board-settled.test.ts:317 — `const cz = src.slice(src.indexOf("function CzPrice"), src.indexOf("function LiveTag"));` [x2]
- tests/board-settled.test.ts:318 — `expect(cz).toMatch(/if \(!live\) return <OddsCell odds=\{row\.czOdds as never\} book="caesars" \/>;/);` [x2]
- tests/board-settled.test.ts:319 — `expect(cz).toMatch(/mlbLiveView\(live, legSideOf\(row\.sub\)\)/);`
- tests/board-settled.test.ts:320 — `expect(cz).toMatch(/no live price/);`
- tests/board-settled.test.ts:321 — `expect(cz).toMatch(/data-testid="mlb-live-cz"/);` [x2]
- tests/board-settled.test.ts:323 — `expect((src.match(/<CzPrice row=\{r\} live=\{rowQuote\(r\)\} \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);`
- tests/board-settled.test.ts:411 — `tab", so a settled leg that keeps its EV badge, its @CZ price and its EDGE tag over there is the`
- tests/board-sort.test.ts:91 — `expect(cfb).toMatch(/sortValue: \(r\) => gradeSortKey\(gradeRank\(r\.grade\), r\.evCz\)/);`
- tests/board-teamless-row.test.ts:7 — `CZ_NULL_TEAM,`
- tests/board-teamless-row.test.ts:8 — `CZ_PRUNE_MS,`
- tests/board-teamless-row.test.ts:9 — `mergeCzHidden,`
- tests/board-teamless-row.test.ts:10 — `migrateCzHidden,`
- tests/board-teamless-row.test.ts:11 — `pruneCzHidden,`
- tests/board-teamless-row.test.ts:12 — `validateCzHidden,`
- tests/board-teamless-row.test.ts:13 — `type CzHiddenMap,`
- tests/board-teamless-row.test.ts:14 — `} from "@/lib/cz-hidden-merge";`
- tests/board-teamless-row.test.ts:56 — `import { loadCzHidden, pullMergeCzHidden } from "@/lib/cz-offered";` [x3]
- tests/board-teamless-row.test.ts:63 — `/** [hidden, at] per key, like tests/cz-sync.test.ts */`
- tests/board-teamless-row.test.ts:64 — `const M = (o: Record<string, [boolean, number]>): CzHiddenMap =>`
- tests/board-teamless-row.test.ts:66 — `const hiddenCount = (m: CzHiddenMap) => Object.values(m).filter((e) => e.hidden).length;`
- tests/board-teamless-row.test.ts:222 — `describe("migrateCzHidden — a stored team-less key becomes the bare key the row now carries", () => {`
- tests/board-teamless-row.test.ts:231 — `const out = migrateCzHidden(m);`
- tests/board-teamless-row.test.ts:241 — `expect(Object.keys(out).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);`
- tests/board-teamless-row.test.ts:243 — `expect(validateCzHidden(out).ok).toBe(true);`
- tests/board-teamless-row.test.ts:248 — `expect(migrateCzHidden(clean)).toBe(clean);`
- tests/board-teamless-row.test.ts:249 — `const empty: CzHiddenMap = {};`
- tests/board-teamless-row.test.ts:250 — `expect(migrateCzHidden(empty)).toBe(empty);`
- tests/board-teamless-row.test.ts:261 — `const oldFirst = migrateCzHidden(M({ [OLD]: oldE, [BARE]: bareE }));`
- tests/board-teamless-row.test.ts:262 — `const bareFirst = migrateCzHidden(M({ [BARE]: bareE, [OLD]: oldE }));`
- tests/board-teamless-row.test.ts:273 — `const migrated = migrateCzHidden(M({ [OLD]: oldE, [BARE]: bareE }))[BARE];`
- tests/board-teamless-row.test.ts:275 — `expect(migrated).toEqual(mergeCzHidden(M({ [BARE]: oldE }), M({ [BARE]: bareE }))[BARE]);`
- tests/board-teamless-row.test.ts:282 — `expect(migrateCzHidden(M({ [OLD]: [false, 400] }))).toEqual(M({ [BARE]: [false, 400] }));`
- tests/board-teamless-row.test.ts:285 — `expect(pruneCzHidden(migrateCzHidden(fresh), NOW)).toEqual(M({ [BARE]: [false, NOW - 60_000] }));` [x2]
- tests/board-teamless-row.test.ts:289 — `const aged = M({ [OLD]: [false, NOW - CZ_PRUNE_MS - 2], [BARE]: [true, NOW - CZ_PRUNE_MS - 5] });` [x2]
- tests/board-teamless-row.test.ts:290 — `expect(pruneCzHidden(migrateCzHidden(aged), NOW)).toEqual({});` [x2]
- tests/board-teamless-row.test.ts:291 — `expect(migrateCzHidden(pruneCzHidden(aged, NOW))).toEqual(M({ [BARE]: [true, NOW - CZ_PRUNE_MS - 5] }));` [x3]
- tests/board-teamless-row.test.ts:303 — `const out = migrateCzHidden(m);`
- tests/board-teamless-row.test.ts:325 — `const draw = (): CzHiddenMap => {`
- tests/board-teamless-row.test.ts:326 — `const m: CzHiddenMap = {};`
- tests/board-teamless-row.test.ts:334 — `const ma = migrateCzHidden(a);`
- tests/board-teamless-row.test.ts:336 — `expect(JSON.stringify(migrateCzHidden(ma))).toBe(JSON.stringify(ma));`
- tests/board-teamless-row.test.ts:337 — `expect(Object.keys(ma).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);`
- tests/board-teamless-row.test.ts:338 — `expect(JSON.stringify(migrateCzHidden(mergeCzHidden(a, b)))).toBe(JSON.stringify(mergeCzHidden(ma, migrateCzHidden(b))));` [x4]
- tests/board-teamless-row.test.ts:347 — `const KEY = "pl_cz_hidden_v2";`
- tests/board-teamless-row.test.ts:348 — `const KEY_V1 = "pl_cz_hidden_v1";`
- tests/board-teamless-row.test.ts:371 — `const first = loadCzHidden();`
- tests/board-teamless-row.test.ts:375 — `expect(loadCzHidden()).toEqual(first);`
- tests/board-teamless-row.test.ts:381 — `const out = loadCzHidden();`
- tests/board-teamless-row.test.ts:392 — `const puts: CzHiddenMap[] = [];`
- tests/board-teamless-row.test.ts:398 — `puts.push((JSON.parse(init.body!) as { czHidden: CzHiddenMap }).czHidden);` [x3]
- tests/board-teamless-row.test.ts:401 — `return { ok: true, json: async () => ({ czHidden: remote }) };`
- tests/board-teamless-row.test.ts:405 — `const merged = await pullMergeCzHidden(local);`
- tests/board-teamless-row.test.ts:411 — `expect(Object.keys(puts[0]).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);`
- tests/board-teamless-row.test.ts:417 — `store.value = JSON.stringify({ czHidden: M({ [OLD]: [true, T - 86_400_000], "ml|NYY": [true, 5] }), at: 1 });`
- tests/board-teamless-row.test.ts:421 — `expect(((await get.json()) as { czHidden: CzHiddenMap }).czHidden).toEqual(M({ [BARE]: [true, T - 86_400_000], "ml|NYY": [true, 5] }));` [x3]
- tests/board-teamless-row.test.ts:429 — `body: JSON.stringify({ czHidden: M({ [OLD]: [false, T - 1_000] }) }),`
- tests/board-teamless-row.test.ts:434 — `const stored = (JSON.parse(store.value!) as { czHidden: CzHiddenMap }).czHidden;` [x3]
- tests/board-teamless-row.test.ts:440 — `const client = readSrc("src/lib/cz-offered.ts");`
- tests/board-teamless-row.test.ts:441 — `expect(client).toMatch(/const map = migrateCzHidden\(v\.map\);\s*if \(map !== v\.map\) save\(map\);\s*return map;/);`
- tests/board-teamless-row.test.ts:442 — `expect(client).toMatch(/return migrateCzHidden\(map\);/);`
- tests/board-teamless-row.test.ts:443 — `expect(client).toMatch(/const remote = v\?\.ok \? migrateCzHidden\(v\.map\) : \{\};\s*const merged = pruneCzHidden\(mergeCzHidden\(local, remote\), Date\.now\(\)\);/);` [x3]
- tests/board-teamless-row.test.ts:445 — `expect(route).toMatch(/return v\.ok \? \{ czHidden: migrateCzHidden\(v\.map\), at: s\.at \} : null;/);` [x2]
- tests/board-teamless-row.test.ts:446 — `expect(route).toMatch(/pruneCzHidden\(mergeCzHidden\(cur\?\.czHidden \?\? \{\}, migrateCzHidden\(v\.map\)\), Date\.now\(\)\)/);` [x4]
- tests/books-ind-gate.test.ts:36 — `* not HR (coreNoHR), 2 legs (coreMaxLegs 3), czDec 2.5 (coreMaxDec 15),`
- tests/books-ind-gate.test.ts:37 — `* czEv +8 (clears coreEvMin +2 AND coreCzEvMin 0), and Kelly-consistent —` [x2]
- tests/books-ind-gate.test.ts:47 — `czDec: 2.5,`
- tests/books-ind-gate.test.ts:48 — `czOdds: "+150",`
- tests/books-ind-gate.test.ts:49 — `czEv: 8,`
- tests/books-ind-gate.test.ts:52 — `consCzEv: 5, // comfortably above consMinEv, so the small-sample gate cannot be`
- tests/books-ind-gate.test.ts:55 — `{ label: "A Judge", prop: "TB O1.5", lkey: "a judge|batter_total_bases|1.5", gkey: "g1", cz: 120, bs: 120, imp: 42, booksInd },`
- tests/books-ind-gate.test.ts:56 — `{ label: "R Devers", prop: "TB O1.5", lkey: "r devers|batter_total_bases|1.5", gkey: "g2", cz: 115, bs: 115, imp: 43, booksInd: 3 },`
- tests/books-ind-gate.test.ts:110 — `const r = run(eng(), [ticket(1, { consCzEv: -9 })], { mktN: { batter_total_bases: 500 } });`
- tests/books-ind-gate.test.ts:116 — `const r = run(eng(), [ticket(1, { consCzEv: -9 })], { mktN: {} });`
- tests/builder-speed-reveal.test.ts:68 — `…inAm: -250, legMaxAm: 300, payout: null, sides: "both", onePerGame: true, onePerTeam: true, czOnly: false, includeStarted: false, modelOnly: false, pinned: [], style: "balanced" };`
- tests/cfb-card.test.ts:80 — `const favEdge = (czHome = -180): Book[] => [`
- tests/cfb-card.test.ts:83 — `{ key: "draftkings", title: "DraftKings", h2h: [czHome, 150], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },`
- tests/cfb-card.test.ts:119 — `expect(t.czDec).toBeLessThanOrEqual(R.maxDec + 1e-9);`
- tests/cfb-card.test.ts:122 — `expect(t.czEv).toBeGreaterThanOrEqual(R.forcedMinEvPct);`
- tests/cfb-card.test.ts:133 — `expect(Math.abs(l.cz)).toBeGreaterThanOrEqual(100);`
- tests/cfb-card.test.ts:141 — `const dec = l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz;` [x3]
- tests/cfb-card.test.ts:159 — `expect(t.czDec).toBeLessThanOrEqual(R.fun.maxDec);`
- tests/cfb-card.test.ts:177 — `expect(r.evCz!).toBeGreaterThanOrEqual(CFB_RULES.minEvPct);`
- tests/cfb-card.test.ts:178 — `expect(r.cz!.dec).toBeLessThanOrEqual(CFB_RULES.maxDec);`
- tests/cfb-card.test.ts:180 — `expect(l.cz).toBe(r.cz!.price);` [x2]
- tests/cfb-card.test.ts:181 — `expect(l.line).toBe(r.market === "ml" ? null : r.cz!.line); // the leg settles at Caesars' OWN line`
- tests/cfb-card.test.ts:182 — `const best = Math.max(...g.rows.filter((x) => x.playable && x.cz!.dec <= CFB_RULES.maxDec).map((x) => x.evCz ?? -Infinity));` [x2]
- tests/cfb-card.test.ts:183 — `expect(r.evCz).toBe(best);`
- tests/cfb-card.test.ts:192 — `expect(t.czDec).toBeGreaterThanOrEqual(CFB_RULES.fun.minDec);`
- tests/cfb-card.test.ts:198 — `expect(r.evCz!).toBeGreaterThanOrEqual(0);`
- tests/cfb-card.test.ts:212 — `dec *= l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz;` [x3]
- tests/cfb-card.test.ts:215 — `expect(t.czDec).toBeCloseTo(dec, 3);`
- tests/cfb-card.test.ts:217 — `expect(t.czEv).toBeCloseTo(100 * (p * dec - 1), 1);`
- tests/cfb-card.test.ts:218 — `expect(t.czOdds).toBe(dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)));`
- tests/cfb-card.test.ts:255 — `const playable = rest.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null));` [x2]
- tests/cfb-card.test.ts:261 — `expect(playable.filter((r) => (r.evCz ?? -Infinity) >= CFB_RULES.minEvPct && r.cz!.dec <= CFB_RULES.maxDec)).toHaveLength(0);` [x2]
- tests/cfb-card.test.ts:262 — `const funPool = playable.filter((r) => (r.evCz ?? -Infinity) >= CFB_RULES.fun.minEvPct);`
- tests/cfb-card.test.ts:367 — `const priced = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null));` [x2]
- tests/cfb-card.test.ts:369 — `expect(priced.every((r) => r.evCz! < CFB_RULES.fun.minEvPct)).toBe(true);`
- tests/cfb-card.test.ts:383 — `expect(r.evCz!).toBeGreaterThan(CFB_RULES.minEvPct);`
- tests/cfb-card.test.ts:384 — `expect(r.cz!.dec).toBeLessThan(1.6);`
- tests/cfb-card.test.ts:394 — `// EV-ranked: non-increasing czEv down the card`
- tests/cfb-card.test.ts:395 — `for (let i = 1; i < card.core.length; i++) expect(card.core[i].czEv).toBeLessThanOrEqual(card.core[i - 1].czEv + 1e-9);` [x2]
- tests/cfb-card.test.ts:398 — `expect(fun.czDec).toBeGreaterThanOrEqual(CFB_RULES.fun.minDec);`
- tests/cfb-card.test.ts:422 — `expect(g3.evCz!).toBeGreaterThanOrEqual(0);`
- tests/cfb-card.test.ts:423 — `expect(g3.evCz!).toBeLessThan(CFB_RULES.minEvPct);`
- tests/cfb-card.test.ts:424 — `expect(g3.cz!.dec).toBeLessThanOrEqual(CFB_RULES.forcedMaxDec);`
- tests/cfb-grade.test.ts:27 — `cz: -110,`
- tests/cfb-grade.test.ts:82 — `const dec = legs.reduce((d, l) => d * (l.cz > 0 ? 1 + l.cz / 100 : 1 + 100 / -l.cz), 1);` [x3]
- tests/cfb-grade.test.ts:83 — `return { id, bucket, name: legs.map((l) => l.label).join(" + "), stake, czOdds: -110, czDec: dec, prob: 50, czEv: 2, legs };` [x3]
- tests/cfb-grade.test.ts:107 — `const e = entry([ticket("t1", 25, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);`
- tests/cfb-grade.test.ts:114 — `const e40 = entry([ticket("t1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })])], [], GAMES);`
- tests/cfb-grade.test.ts:120 — `const legs = [leg({ gkey: G1, side: "home", line: -40.5, cz: -104 }), leg({ gkey: G2, side: "away", line: 28, cz: -106, label: "East Carolina +28" })];` [x2]
- tests/cfb-grade.test.ts:133 — `const legs = [leg({ gkey: G1, side: "home", line: -40, cz: -110 }), leg({ gkey: G2, side: "away", line: 28, cz: -106, label: "East Carolina +28" })];` [x2]
- tests/cfb-grade.test.ts:143 — `const legs = [leg({ gkey: G1, side: "home", line: -40, cz: -110 }), leg({ gkey: G2, side: "away", line: 28, cz: -106 })];` [x2]
- tests/cfb-grade.test.ts:206 — `const e = entry([ticket("late", 10, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);`
- tests/cfb-grade.test.ts:244 — `const e = entry([ticket("u2", 25, [leg({ gkey: G1, side: "home", line: -40.5, cz: -110 })])], [], GAMES);`
- tests/cfb-grade.test.ts:321 — `const e = entry([ticket("n1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES);`
- tests/cfb-grade.test.ts:362 — `…{ gkey: G1, side: "home", line: -40.5 })])], [ticket("f1", 25, [leg({ gkey: G1, side: "home", line: -40.5 }), leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun")], GAMES);`
- tests/cfb-grade.test.ts:469 — `...entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES),`
- tests/cfb-grade.test.ts:500 — `const day = dayOf(phantom(entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey));`
- tests/cfb-grade.test.ts:508 — `const lkey = entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey;`
- tests/cfb-grade.test.ts:519 — `const lkey = entry([ticket("z1", 25, [leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 })])], [], GAMES).core[0].legs[0].lkey;`
- tests/cfb-grade.test.ts:535 — `const t = ticket("z1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })]);`
- tests/cfb-grade.test.ts:649 — `const core = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-grade.test.ts:678 — `const core = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-grade.test.ts:726 — `* src/lib/cfb/lock-server.ts it counts only rows passing 'if (r.playable && r.cz != null && r.evCz != null) n++;'` [x2]
- tests/cfb-grade.test.ts:727 — `* on a game whose kickoff is still ahead, and 'playable' is itself set by 'const playable = !!sq.cz && upcoming;'`
- tests/cfb-grade.test.ts:782 — `const legA = leg({ gkey: G1, market: "ml", side: "home", line: null, cz: -110 });`
- tests/cfb-grade.test.ts:783 — `const legB = leg({ gkey: G2, market: "ml", side: "home", line: null, cz: -110 });`
- tests/cfb-grade.test.ts:832 — `const single = ticket("s1", 25, [leg({ gkey: G1, side: "home", line: -40, cz: -110 })]);`
- tests/cfb-grade.test.ts:902 — `const add = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-grade.test.ts:964 — `const add = ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-grade.test.ts:1002 — `const p2 = ticket("cfb-2026-09-05-core-2", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-grade.test.ts:1149 — `const seated = ticket("cfb-2026-09-05-topup1-fun-1", CFB_PAPER.fun, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun");`
- tests/cfb-grade.test.ts:1221 — `const funTix = ticket("cfb-2026-09-05-fun-1", CFB_PAPER.fun, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })], "fun");`
- tests/cfb-grade.test.ts:1386 — `tickets: [ticket("cfb-2026-09-05-topup1-core-1", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })])],`
- tests/cfb-grade.test.ts:1419 — `const p2c = ticket("cfb-2026-09-05-core-2", 25, [leg({ gkey: G2, side: "away", line: 28, cz: -106 })]);`
- tests/cfb-h1.test.ts:204 — `expect(home.cz).not.toBeNull();`
- tests/cfb-h1.test.ts:205 — `expect(home.cz!.book).toBe(SB);`
- tests/cfb-h1.test.ts:206 — `expect(home.cz!.price).toBe(105);`
- tests/cfb-h1.test.ts:207 — `expect(home.cz!.line).toBe(-3.5);`
- tests/cfb-h1.test.ts:209 — `expect(home.evCz).toBeCloseTo(2.5, 6);`
- tests/cfb-h1.test.ts:214 — `expect(away.cz!.price).toBe(-110);`
- tests/cfb-h1.test.ts:216 — `expect(away.evCz).toBeCloseTo(-4.545, 2);`
- tests/cfb-h1.test.ts:230 — `expect(home.evCz).toBeCloseTo(2.5, 6);`
- tests/cfb-h1.test.ts:303 — `cz: -110,`
- tests/cfb-h1.test.ts:346 — `…= "g1") => ({ kind: "side" as const, rowKey: '${gameId}|${market}|home|', gameId, label: market, sub: "", cz: -110, dec: 1.909, prob: 0.5, push: 0, market, evCz: 3, live: false });` [x2]
- tests/cfb-lock-route.test.ts:156 — `core: [{ id: 'cfb-${date}-core-1', bucket: "core", name: "SINGLE · Device ML", stake: 20, czOdds: -150, czDec: 1.6667, prob: 66, czEv: 3, legs: [] }],` [x3]
- tests/cfb-lock-route.test.ts:535 — `return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, evCz: -5, evBest: -5 })) })) };`
- tests/cfb-lock-route.test.ts:539 — `const priced = slateNoEdge(LOCKS_AT).games.flatMap((g) => g.rows.filter((r) => r.cz != null));`
- tests/cfb-lock-route.test.ts:1170 — `* It counted any row with 'cz != null' on a game whose start is in the future. 'buildCfbCard'`
- tests/cfb-lock-route.test.ts:1171 — `* requires more: src/lib/cfb/card.ts keeps 'r.playable && r.cz != null && r.evCz != null', and` [x2]
- tests/cfb-lock-route.test.ts:1172 — `* src/lib/cfb/model.ts sets 'playable = !!sq.cz && upcoming', where 'upcoming' ALSO demands`
- tests/cfb-lock-route.test.ts:1205 — `expect(live[0].rows.some((r) => r.cz != null)).toBe(true); // Caesars quoted it`
- tests/cfb-lock-route.test.ts:1208 — `expect(others.flatMap((g) => g.rows.filter((r) => r.cz != null)).length).toBe(0);`
- tests/cfb-lock-route.test.ts:1350 — `extra.includes(g.id) ? { ...g, rows: g.rows.map((r) => (r.playable && r.cz != null && r.cz.dec <= CFB_RULES.maxDec ? { ...r, evCz: 6 } : r)) } : g,` [x3]
- tests/cfb-lock-route.test.ts:1387 — `czOdds: -110,`
- tests/cfb-lock-route.test.ts:1388 — `czDec: 1.9091,`
- tests/cfb-lock-route.test.ts:1390 — `czEv: 1,`
- tests/cfb-lock-route.test.ts:1392 — `{ label: 'seeded ${gkey}', prop: "Spread", cz: -110, gkey, lkey: '${gkey}|spread|home|-3', market: "spread" as const, side: "home" as const, line: -3, teamId: null, prob: 0.5…`
- tests/cfb-lock-route.test.ts:3579 — `cz: -110,`
- tests/cfb-lock-route.test.ts:3594 — `czOdds: 150,`
- tests/cfb-lock-route.test.ts:3595 — `czDec: 2.5,`
- tests/cfb-lock-route.test.ts:3597 — `czEv: 3,`
- tests/cfb-lock-route.test.ts:4050 — `return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((r) => (r.evCz == null ? r : { ...r, evCz: 0 })) })) };` [x2]
- tests/cfb-lock-route.test.ts:4454 — `czOdds: -110,`
- tests/cfb-lock-route.test.ts:4455 — `czDec: 1.9091,`
- tests/cfb-lock-route.test.ts:4457 — `czEv: 3,`
- tests/cfb-lock-route.test.ts:4458 — `legs: [{ label: 'game ${n}', prop: "ML", cz: -110, gkey: 'g${n}', lkey: 'g${n}:ml:home', market: "ml", side: "home", line: null, teamId: null, prob: 0.55, push: 0 }],`
- tests/cfb-model.test.ts:130 — `if (r.cz) expect(r.cz.book).toBe("draftkings");` [x2]
- tests/cfb-model.test.ts:157 — `it("Caesars prices every fixture game's spread and total → those rows carry cz and are playable", () => {`
- tests/cfb-model.test.ts:160 — `expect(r.cz, '${g.home.abbr} ${r.label}').not.toBeNull();`
- tests/cfb-model.test.ts:161 — `expect(r.cz!.dec).toBeGreaterThan(1);`
- tests/cfb-model.test.ts:163 — `expect(r.evCz).not.toBeNull();`
- tests/cfb-model.test.ts:174 — `expect(r.cz).toBeNull();`
- tests/cfb-model.test.ts:175 — `expect(r.evCz).toBeNull();`
- tests/cfb-model.test.ts:186 — `expect(g.rows.filter((r) => r.market === "ml").every((r) => r.cz != null && r.playable)).toBe(true);`
- tests/cfb-model.test.ts:193 — `expect(nt.cz).toMatchObject({ book: "draftkings", price: -104, line: 39.5 });`
- tests/cfb-model.test.ts:206 — `expect(row(ala, "Alabama -28").cz).toMatchObject({ price: -114, line: -28 }); // fixture: Caesars ALA -28 -114`
- tests/cfb-model.test.ts:207 — `expect(row(ala, "East Carolina +28").cz).toMatchObject({ price: -106, line: 28 }); // fixture: Caesars ECU +28 -106`
- tests/cfb-model.test.ts:208 — `expect(row(ala, "Over 52.5").cz).toMatchObject({ price: -112, line: 52.5 });`
- tests/cfb-model.test.ts:209 — `expect(row(ala, "Under 52.5").cz).toMatchObject({ price: -109, line: 52.5 });`
- tests/cfb-model.test.ts:217 — `if (r.evCz == null || r.evCz <= 0 || !r.playable) expect(r.kelly).toBe(0);` [x2]
- tests/cfb-model.test.ts:230 — `* μ_cz = 28 + 16.5·Φ⁻¹(0.5086640) = 28.358366`
- tests/cfb-model.test.ts:233 — `* weighted median over {μ_pin (w2), μ_cz (w1)}: sorted ascending μ_pin first, cumulative`
- tests/cfb-model.test.ts:256 — `expect(h.evCz!).toBeCloseTo(-6.84, 2);`
- tests/cfb-model.test.ts:261 — `expect(a.evCz!).toBeCloseTo(-1.88, 2);`
- tests/cfb-model.test.ts:265 — `expect(a.evBest).toBe(a.evCz);`
- tests/cfb-model.test.ts:271 — `* Caesars: imp 112/212 = 0.528302, 109/209 = 0.521531 → p_over = 0.5032247 → μT_cz = 52.5 + 18·Φ⁻¹ = 52.645498`
- tests/cfb-model.test.ts:287 — `expect(o.evCz!).toBeCloseTo(-6.2, 2);`
- tests/cfb-model.test.ts:289 — `expect(u.evCz!).toBeCloseTo(-3.27, 2);`
- tests/cfb-model.test.ts:300 — `* Caesars posts no ML → evCz null. best home = DK −6500 (dec 1.0153846 > FD's 1.0142857):`
- tests/cfb-model.test.ts:315 — `expect(h.cz).toBeNull();`
- tests/cfb-model.test.ts:316 — `expect(h.evCz).toBeNull();`
- tests/cfb-model.test.ts:329 — `* Caesars: imp 230/330 = 0.6969697, 100/288 = 0.3472222 → p_cz = 0.6674728`
- tests/cfb-model.test.ts:331 — `* weighted median over {p_cz (w1), p_pin (w2)}: ascending p_cz (cum 1 < 1.5), then p_pin (cum 3) → mkt = p_pin.` [x2]
- tests/cfb-model.test.ts:341 — `expect(h.cz).toMatchObject({ book: "draftkings", price: -230, line: null });`
- tests/cfb-model.test.ts:342 — `expect(h.evCz!).toBeCloseTo(-3.88, 2);`
- tests/cfb-model.test.ts:346 — `expect(a.cz).toMatchObject({ price: 188 });`
- tests/cfb-model.test.ts:347 — `expect(a.evCz!).toBeCloseTo(-4.94, 2);`
- tests/cfb-model.test.ts:449 — `const atCz = rowProbAt(iu.model, "spread", "away", 39.5)!;`
- tests/cfb-model.test.ts:450 — `expect(atCz.win).toBeLessThan(nt.fair); // a point less of cushion → a smaller cover probability`
- tests/cfb-model.test.ts:451 — `expect(nt.evCz!).toBeCloseTo(evPct(atCz.win, atCz.push, nt.cz!.dec), 2);` [x4]
- tests/cfb-picks-ui.test.ts:80 — `expect(board).toMatch(/const featured = useMemo\(\(\) => plusEv\.filter\(\(r\) => r\.cz != null\), \[plusEv\]\);/);`
- tests/cfb-picks-ui.test.ts:92 — `expect(card).toMatch(/fmtAmerican\(cz\.price\)/);`
- tests/cfb-picks-ui.test.ts:93 — `expect(card).toMatch(/bookName\(cz\.book\)/);`
- tests/cfb-picks-ui.test.ts:95 — `expect(card).toMatch(/<EvBadge ev=\{r\.evCz\} \/>/);`
- tests/cfb-picks-ui.test.ts:96 — `expect(card).toMatch(/\{usd\(winsOn\(cz\.dec\)\)\}/);`
- tests/cfb-picks-ui.test.ts:140 — `/\{selectedBook === "DraftKings" && propsQ\.data\.czMissing\s*\? ' · \$\{propsQ\.data\.czMissing\} game\$\{propsQ\.data\.czMissing === 1 \? "" : "s"\} post player props at ot…` [x5]
- tests/cfb-picks-ui.test.ts:248 — `expect(read("src/lib/cfb/picks.ts")).toMatch(/legs: d\.legs\.map\(\(\{ evCz: _e, \.\.\.leg \}\) => leg\)/);`
- tests/cfb-picks.test.ts:39 — `type Spec = { g: number; market: CfbPropRow["market"]; side: CfbPropRow["side"]; player: string; line: number | null; fair: number; cz: number };`
- tests/cfb-picks.test.ts:41 — `{ g: 0, market: "pass_yds", side: "over", player: "QB Alpha", line: 245.5, fair: 0.6, cz: -110 },`
- tests/cfb-picks.test.ts:42 — `{ g: 0, market: "pass_yds", side: "under", player: "QB Alpha", line: 245.5, fair: 0.4, cz: -110 },`
- tests/cfb-picks.test.ts:43 — `{ g: 0, market: "anytime_td", side: "yes", player: "RB Bravo", line: null, fair: 0.55, cz: -105 },`
- tests/cfb-picks.test.ts:44 — `{ g: 1, market: "rush_yds", side: "over", player: "RB Charlie", line: 80.5, fair: 0.62, cz: -115 },`
- tests/cfb-picks.test.ts:45 — `{ g: 1, market: "receptions", side: "over", player: "WR Delta", line: 4.5, fair: 0.57, cz: -105 },`
- tests/cfb-picks.test.ts:46 — `{ g: 2, market: "rec_yds", side: "over", player: "WR Echo", line: 60.5, fair: 0.58, cz: -110 },`
- tests/cfb-picks.test.ts:47 — `{ g: 2, market: "pass_tds", side: "over", player: "QB Foxtrot", line: 1.5, fair: 0.66, cz: -140 },`
- tests/cfb-picks.test.ts:48 — `{ g: 3, market: "anytime_td", side: "yes", player: "WR Golf", line: null, fair: 0.42, cz: 140 },`
- tests/cfb-picks.test.ts:49 — `{ g: 3, market: "rush_yds", side: "over", player: "RB Hotel", line: 95.5, fair: 0.5, cz: -105 },`
- tests/cfb-picks.test.ts:50 — `{ g: 4, market: "anytime_td", side: "yes", player: "TE India", line: null, fair: 0.3, cz: 210 },`
- tests/cfb-picks.test.ts:52 — `{ g: 4, market: "receptions", side: "over", player: "WR Juliet", line: 6.5, fair: 0.4, cz: -130 },`
- tests/cfb-picks.test.ts:53 — `{ g: 5, market: "pass_yds", side: "over", player: "QB Kilo", line: 300.5, fair: 0.55, cz: 0 },`
- tests/cfb-picks.test.ts:60 — `const dec = s.cz === 0 ? null : amToDec(s.cz);` [x2]
- tests/cfb-picks.test.ts:61 — `const cz = dec == null ? null : { book: "draftkings", title: "DraftKings", price: s.cz, line: s.line, dec };` [x2]
- tests/cfb-picks.test.ts:82 — `cz,`
- tests/cfb-picks.test.ts:83 — `best: cz,`
- tests/cfb-picks.test.ts:86 — `evCz: ev,`
- tests/cfb-picks.test.ts:90 — `playable: cz != null && g.status === "upcoming",`
- tests/cfb-picks.test.ts:176 — `const rowIndex = new Map<string, { evCz: number | null }>();`
- tests/cfb-picks.test.ts:189 — `const sides = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz)).length;`
- tests/cfb-picks.test.ts:190 — `const propsN = props.filter((r) => r.playable && r.cz).length;`
- tests/cfb-picks.test.ts:193 — `expect(picks.categories.all.every((r) => r.cz != null && r.playable)).toBe(true);`
- tests/cfb-picks.test.ts:206 — `if (g === 0) expect((a.evCz ?? -Infinity) >= (b.evCz ?? -Infinity)).toBe(true);` [x2]
- tests/cfb-picks.test.ts:230 — `for (const l of t.legs) expect(l.dec).toBeCloseTo(amToDec(l.cz), 9);`
- tests/cfb-picks.test.ts:256 — `expect(r!.evCz ?? -Infinity).toBeGreaterThanOrEqual(CFB_PARLAYS.minLegEvPct);`
- tests/cfb-picks.test.ts:287 — `const qualifying = board.games.flatMap((g) => g.rows.filter((r) => r.playable && r.cz && (r.evCz ?? -Infinity) >= CFB_PARLAYS.minLegEvPct && r.fair >= CFB_PARLAYS.safer.minLegP…` [x2]
- tests/cfb-picks.test.ts:402 — `const mk = (key: string, prob: number | null): CfbPickRow => ({ ...base, key, grade: null, evCz: null, prob });`
- tests/cfb-picks.test.ts:410 — `const d = { ...mk("d", 0.1), evCz: -20 };`
- tests/cfb-picks.test.ts:411 — `const e = { ...mk("e", 0.1), evCz: -25 };`
- tests/cfb-picks.test.ts:456 — `expect(r.cz).not.toBeNull();`
- tests/cfb-picks.test.ts:460 — `expect(r.grade).toBe(gradeFromEv(r.evCz));`
- tests/cfb-picks.test.ts:467 — `if (g === 0) expect((rows[i - 1].evCz ?? -Infinity) >= (rows[i].evCz ?? -Infinity)).toBe(true);` [x2]
- tests/cfb-picks.test.ts:599 — `expect(t.gated).toBe(t.legs.every((l) => (rowIndex.get(l.rowKey)!.evCz ?? -Infinity) >= CFB_PARLAYS.minLegEvPct));`
- tests/cfb-picks.test.ts:603 — `expect(r!.evCz ?? -Infinity).toBeGreaterThanOrEqual(legFloor(t));`
- tests/cfb-picks.test.ts:604 — `expect(l.dec).toBeCloseTo(amToDec(l.cz), 9);`
- tests/cfb-picks.test.ts:630 — `… = (o: Partial<L>): L => ({ kind: "prop", rowKey: "k", gameId: "g1", label: "", sub: "", cz: -110, dec: 1.909, prob: 0.55, push: 0, market: "anytime_td", player: "RB One", teamId: …` [x2]
- tests/cfb-picks.test.ts:686 — `const cz = { book: "draftkings", title: "DraftKings", price: decToAm(Math.round(dec * 1000) / 1000), line, dec };`
- tests/cfb-picks.test.ts:708 — `cz,`
- tests/cfb-picks.test.ts:709 — `best: cz,`
- tests/cfb-picks.test.ts:712 — `evCz: ev,`
- tests/cfb-picks.test.ts:758 — `const sides = bigBoard.games.filter((g) => g.status !== "final").flatMap((g) => g.rows.filter((r) => r.cz && (g.status === "live" || r.playable))).length;`
- tests/cfb-picks.test.ts:759 — `const propsN = bigProps.filter((r) => r.cz).length;`
- tests/cfb-picks.test.ts:861 — `const cz = { book: "draftkings", title: "DraftKings", price: decToAm(dec), line: null, dec };`
- tests/cfb-picks.test.ts:862 — `const evCz = evPct(fair, 0, dec);`
- tests/cfb-picks.test.ts:882 — `cz,`
- tests/cfb-picks.test.ts:883 — `best: cz,`
- tests/cfb-picks.test.ts:886 — `evCz,`
- tests/cfb-picks.test.ts:887 — `evBest: evCz,`
- tests/cfb-picks.test.ts:888 — `grade: gradeFromEv(evCz),`
- tests/cfb-picks.test.ts:902 — `const evOf = new Map(atdRows.map((r) => [r.key, r.evCz ?? -Infinity]));`
- tests/cfb-picks.test.ts:906 — `expect(atdRows.filter((r) => r.evCz! >= CFB_PARLAYS.minLegEvPct).length).toBe(6);`
- tests/cfb-picks.test.ts:907 — `expect(atdRows.filter((r) => r.evCz! < CFB_PARLAYS.minLegEvPct && r.evCz! >= CFB_PARLAYS.setFloorEvPct).length).toBe(54);` [x2]
- tests/cfb-picks.test.ts:908 — `expect(atdRows.filter((r) => r.evCz! < CFB_PARLAYS.setFloorEvPct).length).toBe(12);`
- tests/cfb-picks.test.ts:910 — `expect(r.cz!.dec).toBeGreaterThanOrEqual(1.3);`
- tests/cfb-picks.test.ts:911 — `expect(r.cz!.dec).toBeLessThanOrEqual(8);`
- tests/cfb-picks.test.ts:991 — `const strict = atdRows.filter((r) => r.evCz! >= CFB_PARLAYS.minLegEvPct);`
- tests/cfb-picks.test.ts:1021 — `const evOf = new Map(atdRows.map((r) => [r.key, r.evCz ?? -Infinity]));`
- tests/cfb-picks.test.ts:1027 — `expect(liveOnlyRows.filter((r) => r.evCz! >= CFB_PARLAYS.minLegEvPct).length).toBe(4);`
- tests/cfb-player-mark.test.ts:80 — `({ label: "Alabama -6.5", prop: "Spread", cz: -110, gkey: "g1", lkey: 'lk-${Math.random()}', market: "spread", side: "home", line: -6.5, teamId: "333", prob: 0.55, push: 0, ...ov…`
- tests/cfb-player-mark.test.ts:82 — `({ id: "t1", bucket: "core", name: "Test ticket", stake: 25, czDec: 3.2, czOdds: 220, czEv: 4.1, prob: 31, legs }) as unknown as CfbTicket;` [x3]
- tests/cfb-props-route.test.ts:9 — `import { czMissingGameIds, propsCoverage } from "@/lib/cfb/props";`
- tests/cfb-props-route.test.ts:10 — `import { affordableEvents, assembleStoredBoard, boardFresh, boardWindowSec, czMissingDue, encodeBoard, propsBoardKey, propsSpendKey, pullCredits, storedChunkKeys, CFB_PROPS_CHUNK_R…`
- tests/cfb-props-route.test.ts:36 — `* cz rule — a game with rows and a market with no Caesars quote re-checks every 30 min inside`
- tests/cfb-props-route.test.ts:38 — `* data cache; a failed re-pull keeps the stored rows; czMissing > 0 shortens ttlSec`
- tests/cfb-props-route.test.ts:194 — `expect(CFB_PROPS.czMissingRevalidateSec).toBe(1800);`
- tests/cfb-props-route.test.ts:195 — `expect(CFB_PROPS.czMissingWindowSec).toBe(4 * 3600);`
- tests/cfb-props-route.test.ts:196 — `expect(CFB_PROPS.czMissingRevalidateSec).toBeLessThan(CFB_PROPS.revalidateSec);`
- tests/cfb-props-route.test.ts:197 — `expect(CFB_PROPS.czMissingRevalidateSec).toBeGreaterThan(CFB_PROPS.liveRevalidateSec);`
- tests/cfb-props-route.test.ts:200 — `expect((CFB_PROPS.czMissingWindowSec / CFB_PROPS.czMissingRevalidateSec) * CFB_PROPS.measuredCreditsPerEvent).toBe(248);` [x2]
- tests/cfb-props-route.test.ts:933 — `* rows with cz nulled (DK / FD stay), "emptied" = the game's rows removed (no book posts props).`
- tests/cfb-props-route.test.ts:948 — `expect(body.rows.some((r) => r.cz)).toBe(true);`
- tests/cfb-props-route.test.ts:953 — `const strip = (b: CfbPropsBoard, id: string): CfbPropsBoard => ({ ...b, rows: b.rows.map((r) => (r.gameId === id ? { ...r, cz: null, evCz: null } : r)) });` [x2]
- tests/cfb-props-route.test.ts:963 — `it("czMissingDue (pure): upcoming + Caesars-missing (the caller's market verdict) + inside 4 h + stamp older than 30 min — and nothing else", () => {`
- tests/cfb-props-route.test.ts:966 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true);`
- tests/cfb-props-route.test.ts:967 — `expect(czMissingDue(board, { id: "y", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(false); // 25 min: not yet`
- tests/cfb-props-route.test.ts:968 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, false, IN)).toBe(false); // Caesars on every market it has (or no rows at all)`
- tests/cfb-props-route.test.ts:969 — `expect(czMissingDue(board, { id: "g", status: "live", kickoffMs: kick }, true, IN)).toBe(false); // live games keep their rule`
- tests/cfb-props-route.test.ts:970 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN + 5 * 3600_000 }, true, IN)).toBe(false); // 5 h out`
- tests/cfb-props-route.test.ts:971 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN + 4 * 3600_000 }, true, IN)).toBe(true); // 4 h exactly: inside`
- tests/cfb-props-route.test.ts:972 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: IN - 1 }, true, IN)).toBe(false); // already kicked`
- tests/cfb-props-route.test.ts:973 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: Number.NaN }, true, IN)).toBe(false);`
- tests/cfb-props-route.test.ts:975 — `expect(czMissingDue(board, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true);`
- tests/cfb-props-route.test.ts:976 — `expect(czMissingDue({ generatedAt: iso(IN - 25 * MIN) }, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(false);`
- tests/cfb-props-route.test.ts:977 — `expect(czMissingDue({ generatedAt: "nope" }, { id: "zz", status: "upcoming", kickoffMs: kick }, true, IN)).toBe(true); // unreadable → due`
- tests/cfb-props-route.test.ts:978 — `expect(czMissingDue(board, { id: "g", status: "upcoming", kickoffMs: kick }, true, IN - 6 * MIN)).toBe(false); // 29 min: not yet`
- tests/cfb-props-route.test.ts:981 — `it("czMissingGameIds (pure, review fix): keyed on the MARKET — a game is missing when some market with rows has no Caesars quote on any of them; zero rows is never missing", () =…`
- tests/cfb-props-route.test.ts:984 — `{ gameId: "a", market: "pass_yds" as const, cz: q },`
- tests/cfb-props-route.test.ts:985 — `{ gameId: "a", market: "anytime_td" as const, cz: null }, // Caesars yardage, no Caesars anytime TD yet → missing`
- tests/cfb-props-route.test.ts:986 — `{ gameId: "b", market: "pass_yds" as const, cz: q },`
- tests/cfb-props-route.test.ts:987 — `{ gameId: "b", market: "pass_yds" as const, cz: null }, // one Caesars row on the market is enough → not missing`
- tests/cfb-props-route.test.ts:988 — `{ gameId: "c", market: "anytime_td" as const, cz: null }, // no Caesars at all → missing`
- tests/cfb-props-route.test.ts:989 — `{ gameId: "d", market: "anytime_td" as const, cz: q },`
- tests/cfb-props-route.test.ts:991 — `expect([...czMissingGameIds(rows)].sort()).toEqual(["a", "c"]);`
- tests/cfb-props-route.test.ts:992 — `expect(czMissingGameIds([])).toEqual(new Set());`
- tests/cfb-props-route.test.ts:995 — `it("propsCoverage (pure): czMissing = priced upcoming games with rows and a Caesars-less market; noProps = priced games with zero rows; unpriced games count in neither", () => {`
- tests/cfb-props-route.test.ts:1006 — `{ gameId: "a", market: "pass_yds" as const, cz: q },`
- tests/cfb-props-route.test.ts:1007 — `{ gameId: "a", market: "pass_yds" as const, cz: null },`
- tests/cfb-props-route.test.ts:1008 — `{ gameId: "b", market: "anytime_td" as const, cz: null },`
- tests/cfb-props-route.test.ts:1009 — `{ gameId: "b", market: "anytime_td" as const, cz: null },`
- tests/cfb-props-route.test.ts:1010 — `{ gameId: "c", market: "anytime_td" as const, cz: null },`
- tests/cfb-props-route.test.ts:1011 — `{ gameId: "f", market: "pass_yds" as const, cz: q },`
- tests/cfb-props-route.test.ts:1012 — `{ gameId: "f", market: "anytime_td" as const, cz: null }, // the mixed case the market key exists for`
- tests/cfb-props-route.test.ts:1014 — `expect(propsCoverage(ev, rows, ["a", "b", "c", "d", "f"])).toEqual({ czMissing: 2, noProps: 1 }); // b, f missing; d priced but empty; c is live; e unpriced`
- tests/cfb-props-route.test.ts:1015 — `expect(propsCoverage(ev, rows, ["a", "b", "c", "d", "e", "f"])).toEqual({ czMissing: 2, noProps: 2 });`
- tests/cfb-props-route.test.ts:1016 — `expect(propsCoverage(ev, rows, [])).toEqual({ czMissing: 0, noProps: 0 });`
- tests/cfb-props-route.test.ts:1017 — `expect(propsCoverage([], rows, ["a"])).toEqual({ czMissing: 0, noProps: 0 });`
- tests/cfb-props-route.test.ts:1020 — `it("a fresh pre-kick pull reports czMissing 0 / noProps 0 on the synthetic fixture (every game has Caesars rows)", async () => {`
- tests/cfb-props-route.test.ts:1025 — `expect(body.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1047 — `expect(body.czMissing).toBe(0); // the re-pull found Caesars rows (the fixture posts them)`
- tests/cfb-props-route.test.ts:1053 — `…ripped game stamped 25 min ago is NOT re-fetched: the board answers from redis and counts it — czMissing 1, and ttlSec drops to the 30-min rule so the phone re-asks", async () => {`
- tests/cfb-props-route.test.ts:1059 — `expect(body.czMissing).toBe(1);`
- tests/cfb-props-route.test.ts:1062 — `expect(body.ttlSec).toBe(Math.min(CFB_PROPS.revalidateSec, CFB_PROPS.czMissingRevalidateSec));`
- tests/cfb-props-route.test.ts:1069 — `it("the 4 h window: the same stripped game 35 min old but 5 h before kickoff rides the 2 h carry (no fetch, czMissing 1, ttlSec 1800)", async () => {`
- tests/cfb-props-route.test.ts:1075 — `expect(body.czMissing).toBe(1);`
- tests/cfb-props-route.test.ts:1094 — `expect(first.body.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1104 — `expect(body.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1120 — `rows: b.rows.map((r) => (r.gameId === id && r.market === "anytime_td" ? { ...r, cz: null, evCz: null } : r)),` [x2]
- tests/cfb-props-route.test.ts:1123 — `expect(fresh.rows.some((r) => r.gameId === G && r.market !== "anytime_td" && r.cz)).toBe(true); // Caesars IS on its other markets`
- tests/cfb-props-route.test.ts:1128 — `expect(first.body.czMissing).toBe(1); // under a per-game "any Caesars row" count this read 0 while the ANYTIME TD set lacked G`
- tests/cfb-props-route.test.ts:1138 — `expect(second.body.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1155 — `expect(body.czMissing).toBe(1); // still honestly counted`
- tests/cfb-props-route.test.ts:1178 — `expect(stored.czMissing).toBe(1);`
- tests/cfb-props-route.test.ts:1214 — `expect(body.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1281 — `expect(two.czMissing).toBe(1); // G still has no Caesars row on the answer`
- tests/cfb-props-route.test.ts:1284 — `expect(three.czMissing).toBe(0);`
- tests/cfb-props-route.test.ts:1306 — `expect(CFB_PROPS.czMissingRevalidateSec / 60).toBe(30);`
- tests/cfb-props-route.test.ts:1307 — `expect(CFB_PROPS.czMissingWindowSec / 3600).toBe(4);`
- tests/cfb-props-ui.test.ts:70 — `// for CZ alone at 249.5 against a 245.5 consensus, so the slip must not price that leg either`
- tests/cfb-props-ui.test.ts:75 — `expect(props).toMatch(/if \(mode === "cz"\) return row\.cz;\s*return row\.best \?\? row\.cz;/);` [x3]
- tests/cfb-props-ui.test.ts:165 — `/\{selectedBook === "DraftKings" && board\.czMissing \? ' · \$\{board\.czMissing\} game\$\{board\.czMissing === 1 \? "" : "s"\} post player props at other books but no DraftK…` [x5]
- tests/cfb-props-ui.test.ts:172 — `expect(CFB_PROPS.czMissingRevalidateSec / 60).toBe(30);`
- tests/cfb-props-ui.test.ts:173 — `expect(CFB_PROPS.czMissingWindowSec / 3600).toBe(4);`
- tests/cfb-props-ui.test.ts:228 — `cz: -110,`
- tests/cfb-props-ui.test.ts:229 — `book: "CZ",`
- tests/cfb-props-ui.test.ts:243 — `cz: -115,`
- tests/cfb-props-ui.test.ts:244 — `book: "CZ",`
- tests/cfb-props-ui.test.ts:284 — `const ml = side({ key: "g1|ml|away|", label: "East Carolina ML", market: "ml", cz: 240 });`
- tests/cfb-props.test.ts:57 — `w/ current Anytime TD odds". + czMissingRevalidateSec 1800 / czMissingWindowSec 4 h: an upcoming` [x2]
- tests/cfb-props.test.ts:66 — `czMissingRevalidateSec: 1800,`
- tests/cfb-props.test.ts:67 — `czMissingWindowSec: 4 * 3600,`
- tests/cfb-props.test.ts:150 — `expect(r.cz).toEqual({ book: "draftkings", title: "DraftKings", price: -110, line: 249.5, dec: expect.closeTo(1.909091, 5) });`
- tests/cfb-props.test.ts:151 — `expect(r.evCz).toBeNull();`
- tests/cfb-props.test.ts:168 — `// Katin Houser pass TDs O 1.5: CZ -125/-105, DK -120/-110, FD -118/-112, MGM -115/-115 → de-vigged`
- tests/cfb-props.test.ts:170 — `// EV at CZ -125 (1.8) = 100·(0.508095·1.8 − 1) = −8.54 → F`
- tests/cfb-props.test.ts:175 — `expect(r.evCz).toBeCloseTo(-8.54, 2);`
- tests/cfb-props.test.ts:178 — `// Germie Bernard rec yds O 52.5 — MGM posts none, three books remain: median 0.504330, EV at CZ -110 = −3.72`
- tests/cfb-props.test.ts:181 — `expect(b.evCz).toBeCloseTo(-3.72, 2);`
- tests/cfb-props.test.ts:190 — `expect(r.evCz).toBeNull();`
- tests/cfb-props.test.ts:193 — `expect(r.cz?.price).toBe(-110);`
- tests/cfb-props.test.ts:199 — `// Jam Miller: CZ -140 → 0.583333/1.08, DK -135, FD -138, MGM -130 → sorted 0.523349, 0.531915, 0.536882, 0.540123`
- tests/cfb-props.test.ts:200 — `// true median = (0.531915 + 0.536882) / 2 = 0.534398; EV at CZ (1.714286) = −8.39; best = MGM -130 (1.769231), EV −5.45`
- tests/cfb-props.test.ts:206 — `expect(r.evCz).toBeCloseTo(-8.39, 2);`
- tests/cfb-props.test.ts:217 — `// CZ -130/+100 → 0.530612, DK -105/-115 → 0.489166 at 245.5 → fair(over) = mean = 0.509889.`
- tests/cfb-props.test.ts:218 — `// EV: over at CZ -130 (1.769231) = 100·(0.509889·1.769231 − 1) = −9.79; under at CZ +100 (2.0) = −1.98.` [x2]
- tests/cfb-props.test.ts:234 — `expect(o.evCz).toBeCloseTo(-9.79, 2);`
- tests/cfb-props.test.ts:235 — `expect(u.evCz).toBeCloseTo(-1.98, 2);`
- tests/cfb-props.test.ts:242 — `expect(mo.evCz).toBeCloseTo(u.evCz as number, 9);` [x2]
- tests/cfb-props.test.ts:243 — `expect(mu.evCz).toBeCloseTo(o.evCz as number, 9);` [x2]
- tests/cfb-props.test.ts:263 — `const mk = (cz: number) => ({`
- tests/cfb-props.test.ts:267 — `{ name: "Over", description: "A B", price: cz, point: 4.5 }, { name: "Under", description: "A B", price: -110, point: 4.5 } ] }] },`
- tests/cfb-props.test.ts:275 — `// fair at 4.5 = median(0.5, 0.5, cz: imp(+130)=0.434783 vs imp(-110)=0.523810 → 0.453543) = 0.5; EV at +130 = 100·(0.5·1.3 − 0.5) = 15 → S`
- tests/cfb-props.test.ts:277 — `expect(over.evCz).toBeCloseTo(15, 2);`
- tests/cfb-props.test.ts:285 — `expect(late.evCz).toBeCloseTo(15, 2);`
- tests/cfb-props.test.ts:446 — `expect(g.rows.some((r) => !!r.cz)).toBe(true);`
- tests/cfb-props.test.ts:463 — `const noCz: CfbBoard = { ...board, games: board.games.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, cz: null })) })) };` [x2]
- tests/cfb-props.test.ts:464 — `expect(selectPropEvents(noCz, NOW).events).toHaveLength(0);`
- tests/cfb-props.test.ts:496 — `const liveNoCz: CfbBoard = { ...live, games: live.games.map((g) => (g.home.abbr === "OSU" ? { ...g, rows: g.rows.map((r) => ({ ...r, cz: null })) } : g)) };` [x2]
- tests/cfb-props.test.ts:497 — `expect(selectPropEvents(liveNoCz, NOW).events.map((g) => g.home.abbr)).not.toContain("OSU");`
- tests/cfb-props.test.ts:544 — `expect(a.cz?.price).toBe(-110);`
- tests/cfb-props.test.ts:582 — `…ame\): EventCache => \{\s*const w = whyOf\.get\(g\.id\);\s*return refresh \|\| w === "czMissing" \|\| \(w === "live" && storedIds\.has\(g\.id\)\) \? \{ cache: "no-store" \} : \{ ne…`
- tests/cfb-store-convergence.test.ts:72 — `czOdds: -110,`
- tests/cfb-store-convergence.test.ts:73 — `czDec: 1.909,`
- tests/cfb-store-convergence.test.ts:75 — `czEv: 5,`
- tests/cfb-store-convergence.test.ts:80 — `cz: -110,`
- tests/cfb-store-convergence.test.ts:306 — `server.core[0] = { ...server.core[0], stake: 40, czOdds: -125, legs: [{ ...server.core[0].legs[0], cz: -125 }] };` [x2]
- tests/cfb-store-convergence.test.ts:1036 — `["a re-quoted, re-staked shared ticket with no receipt", day(3, 25), { ...day(6, 25), core: [{ ...ticket(cid(1), 40, "g1"), czOdds: -125 }, ...day(6, 25).core.slice(1)] }],`
- tests/cfb-store.test.ts:95 — `czOdds: -110,`
- tests/cfb-store.test.ts:96 — `czDec: 1.909,`
- tests/cfb-store.test.ts:98 — `czEv: 5,`
- tests/cfb-store.test.ts:99 — `legs: [{ label: "Test ML", prop: "ML", cz: -110, gkey, lkey: '${gkey}|ml|home|', market: "ml", side: "home", line: null, teamId: null, prob: 0.55, push: 0 }],`
- tests/chain-tools.test.ts:148 — `{ id: "a", stake: 62, prob: 24.8, czDec: 4.26, czEv: 5.6, legs: [{ lkey: "x|batter_hits_runs_rbis|1.5" }] },` [x2]
- tests/chain-tools.test.ts:149 — `{ id: "b", stake: 62, prob: 42.5, czDec: 2.21, czEv: -6.2, legs: [{ lkey: "ml_home" }] },` [x2]
- tests/chain-tools.test.ts:157 — `expect(o.negativeCzEv).toBe(1);`
- tests/chain-tools.test.ts:164 — `core: [{ id: "t", stake: 10, prob: 50, czDec: 2, legs: [`
- tests/chain-tools.test.ts:165 — `{ label: "P1", prop: "H+R+RBI O 1.5", cz: -110, lkey: "p1|batter_hits_runs_rbis|1.5" },`
- tests/chain-tools.test.ts:166 — `{ label: "P2", prop: "H+R+RBI O 1.5", cz: -110, lkey: "p2|batter_hits_runs_rbis|1.5" },`
- tests/clv-core.test.ts:30 — `{ label: "Jake Mangum (PIT)", prop: "Hits O 0.5", gkey: "g1", lkey: "jakemangum|batter_hits|0.5", cz: -260 },`
- tests/clv-core.test.ts:31 — `{ label: "Cleveland Guardians", prop: "ML vs PIT", gkey: "g1", lkey: "ml_home", cz: -145 },`
- tests/clv-core.test.ts:32 — `{ label: "Started Guy (LAA)", prop: "TB O 1.5", gkey: "g2", lkey: "startedguy|batter_total_bases|1.5", cz: -110 },`
- tests/clv-core.test.ts:37 — `legs: [{ label: "Jake Mangum (PIT)", prop: "Hits O 0.5", gkey: "g1", lkey: "jakemangum|batter_hits|0.5", cz: -260 }],`
- tests/clv-core.test.ts:43 — `legs: [{ label: "Later Guy (NYY)", prop: "HR O 0.5", gkey: "g3", lkey: "laterguy|batter_home_runs|0.5", cz: 450 }],`
- tests/clv-core.test.ts:122 — `it("Caesars alternate ladder fills the price when the standard market lacks CZ; fair needs 2+ books", () => {`
- tests/clv-report.test.ts:8 — `type LegIn = { label: string; prop: string; lkey: string; cz?: number | null; imp?: number | null };`
- tests/clv-report.test.ts:40 — `{ label: "A. Over", prop: "Hits O 0.5", lkey: "aover|batter_hits|0.5", cz: -150, imp: 40 },`
- tests/clv-report.test.ts:42 — `{ label: "B. Under", prop: "K's U 5.5", lkey: "bunder|pitcher_strikeouts|5.5", cz: 110, imp: 55 },`
- tests/clv-report.test.ts:55 — `expect(over.czCents).toBeCloseTo(centsScale(-150) - centsScale(-170)); // +20 — locked better than close`
- tests/clv-report.test.ts:57 — `expect(under.czCents).toBeCloseTo(centsScale(110) - centsScale(120)); // −10`
- tests/clv-report.test.ts:68 — `{ label: "NoSight", prop: "Hits O 0.5", lkey: "nosight|batter_hits|0.5", cz: -150, imp: 40 },`
- tests/clv-report.test.ts:69 — `{ label: "NoImp", prop: "TB O 1.5", lkey: "noimp|batter_total_bases|1.5", cz: -110, imp: null },`
- tests/clv-report.test.ts:70 — `{ label: "NoCz", prop: "HR O 0.5", lkey: "nocz|batter_home_runs|0.5", cz: null, imp: 20 },` [x3]
- tests/clv-report.test.ts:74 — `"NoCz|HR O 0.5": { am: 300, at: 2, consensusFair: 0.24 },`
- tests/clv-report.test.ts:81 — `expect(noImp.czCents).not.toBeNull();`
- tests/clv-report.test.ts:82 — `const noCz = rows.find((r) => r.lid.startsWith("NoCz"))!;` [x2]
- tests/clv-report.test.ts:83 — `expect(noCz.czCents).toBeNull(); // fair only` [x2]
- tests/clv-report.test.ts:84 — `expect(noCz.fairPts).toBeCloseTo(4);`
- tests/clv-report.test.ts:90 — `[{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: -150, imp: 40 }],`
- tests/clv-report.test.ts:94 — `fun: [{ label: "F", prop: "HR O 0.5", lkey: "f|batter_home_runs|0.5", cz: 320, imp: 22 }],`
- tests/clv-report.test.ts:100 — `[{ label: "B", prop: "K's U 5.5", lkey: "b|pitcher_strikeouts|5.5", cz: 100, imp: 55 }],`
- tests/clv-report.test.ts:124 — `entry(date, [{ label, prop: "Hits O 0.5", lkey: '${label.toLowerCase()}|batter_hits|0.5', cz: -120, imp }], {`
- tests/cz-sync.test.ts:5 — `CZ_MAX_KEYS,`
- tests/cz-sync.test.ts:6 — `CZ_MAX_KEY_LEN,`
- tests/cz-sync.test.ts:7 — `CZ_PRUNE_MS,`
- tests/cz-sync.test.ts:8 — `mergeCzHidden,`
- tests/cz-sync.test.ts:9 — `pruneCzHidden,`
- tests/cz-sync.test.ts:10 — `validateCzHidden,`
- tests/cz-sync.test.ts:11 — `type CzHiddenMap,`
- tests/cz-sync.test.ts:12 — `} from "@/lib/cz-hidden-merge";`
- tests/cz-sync.test.ts:18 — `* The ⓘ toggle was device-local (pl_cz_hidden_v1, a bare key→true set). Syncing`
- tests/cz-sync.test.ts:31 — `const M = (o: Record<string, [boolean, number]>): CzHiddenMap =>`
- tests/cz-sync.test.ts:34 — `describe("mergeCzHidden — last-write-wins per key by 'at'", () => {`
- tests/cz-sync.test.ts:38 — `expect(mergeCzHidden(a, b)["tb|Judge|1.5|o"]).toEqual({ hidden: false, at: 200 });`
- tests/cz-sync.test.ts:39 — `expect(mergeCzHidden(b, a)["tb|Judge|1.5|o"]).toEqual({ hidden: false, at: 200 });`
- tests/cz-sync.test.ts:45 — `expect(mergeCzHidden(phone, laptop)["hits|Soto|0.5|o"].hidden).toBe(false);`
- tests/cz-sync.test.ts:50 — `const ab = mergeCzHidden(a, b);`
- tests/cz-sync.test.ts:51 — `const ba = mergeCzHidden(b, a);`
- tests/cz-sync.test.ts:54 — `expect(mergeCzHidden(ab, b)).toEqual(ab);`
- tests/cz-sync.test.ts:55 — `expect(mergeCzHidden(ab, ab)).toEqual(ab);`
- tests/cz-sync.test.ts:60 — `expect(mergeCzHidden(a, b).k.hidden).toBe(true);`
- tests/cz-sync.test.ts:61 — `expect(mergeCzHidden(b, a).k.hidden).toBe(true);`
- tests/cz-sync.test.ts:64 — `const out = mergeCzHidden(M({ a: [true, 1] }), M({ b: [false, 2] }));`
- tests/cz-sync.test.ts:69 — `describe("pruneCzHidden — tombstones drop after CZ_PRUNE_MS; hides never expire", () => {` [x2]
- tests/cz-sync.test.ts:73 — `oldTomb: [false, NOW - CZ_PRUNE_MS - 1],`
- tests/cz-sync.test.ts:74 — `oldHide: [true, NOW - CZ_PRUNE_MS - 1],`
- tests/cz-sync.test.ts:77 — `const out = pruneCzHidden(map, NOW);`
- tests/cz-sync.test.ts:79 — `expect(out.oldHide).toEqual({ hidden: true, at: NOW - CZ_PRUNE_MS - 1 });`
- tests/cz-sync.test.ts:84 — `describe("validateCzHidden — the wire gate", () => {`
- tests/cz-sync.test.ts:87 — `expect(validateCzHidden(bad).ok).toBe(false);`
- tests/cz-sync.test.ts:91 — `expect(validateCzHidden({ k: { hidden: true } }).ok).toBe(false);`
- tests/cz-sync.test.ts:92 — `expect(validateCzHidden({ k: { hidden: "yes", at: 1 } }).ok).toBe(false);`
- tests/cz-sync.test.ts:93 — `expect(validateCzHidden({ k: { hidden: true, at: Infinity } }).ok).toBe(false);`
- tests/cz-sync.test.ts:94 — `expect(validateCzHidden({ k: true }).ok).toBe(false); // the v1 shape does NOT validate — migration is client-side only`
- tests/cz-sync.test.ts:97 — `expect(validateCzHidden({ ["x".repeat(CZ_MAX_KEY_LEN + 1)]: { hidden: true, at: 1 } }).ok).toBe(false);` [x2]
- tests/cz-sync.test.ts:99 — `for (let i = 0; i <= CZ_MAX_KEYS; i++) big['k${i}'] = { hidden: true, at: 1 };`
- tests/cz-sync.test.ts:100 — `expect(validateCzHidden(big).ok).toBe(false);`
- tests/cz-sync.test.ts:104 — `const v = validateCzHidden(good);`
- tests/cz-sync.test.ts:121 — `expect(src).toMatch(/mergeCzHidden/); // the stored copy is merged INTO, not overwritten`
- tests/cz-sync.test.ts:122 — `expect(src).toMatch(/pruneCzHidden/);`
- tests/cz-sync.test.ts:126 — `it("cz-offered pulls on load and pushes on toggle over the sync phrase; localStorage stays the offline copy", () => {`
- tests/cz-sync.test.ts:127 — `const src = read("src/lib/cz-offered.ts");`
- tests/cz-sync.test.ts:131 — `expect(src).toMatch(/pl_cz_hidden_v2/); // timestamped format under a NEW key…`
- tests/cz-sync.test.ts:132 — `expect(src).toMatch(/pl_cz_hidden_v1/); // …with one-way migration from v1 (left in place for stale bundles)`
- tests/cz-sync.test.ts:133 — `expect(src).toMatch(/mergeCzHidden/);`
- tests/cz-sync.test.ts:137 — `const src = read("src/lib/cz-offered.ts");`
- tests/cz-sync.test.ts:144 — `expect(src).toMatch(/useCzHidden\(/);`
- tests/cz-sync.test.ts:145 — `expect(src).toMatch(/cz\.isHidden/);`
- tests/cz-sync.test.ts:151 — `expect(src).toMatch(/czHiddenHere = new Set\(/); // deduped by pick key`
- tests/defense-imagery.test.tsx:35 — `…1',gameId:'g',label:'Test Player',player:'Test Player',sub:'Anytime TD',game:'CAR @ ATL',cz:100,prob:50,book:'DK',market:'anytime_td',imageTeam:home,headshot:'https://example.test/…`
- tests/defense-imagery.test.tsx:39 — `const leg={sport:'nfl' as const,id:'1',gameId:'g',label:'Atlanta',sub:'ML',game:'CAR @ ATL',cz:100,prob:50,book:'DK',market:'ml'};`
- tests/desktop-density.test.ts:151 — `expect(src).toMatch(/className=\{'pick-ticket glass px-3 py-1\.5 \$\{Number\(t\.czEv\) > 0 \? "ev-glow" : ""\}'\}/);`
- tests/discovery-release.test.ts:20 — `…:3,legMinAm:-230,legMaxAm:600,payout:null,sides:"both",onePerGame:true,onePerTeam:true,czOnly:true,pricingBook:"DK",includeStarted:true,modelOnly:false,pinned:[],preferDiversity:tr…`
- tests/discovery-release.test.ts:88 — `const l={id:"mlb:123",sport:"mlb" as const,gameId:"123",label:"Player",sub:"HR",game:"A @ B",cz:450,prob:22,book:"DK",market:"batter_home_runs",player:"Player"};`
- tests/discovery-release.test.ts:89 — `expect(crossToMlb(l).cz).toBe(450);const f=crossToFootball(l);expect(f.gameId).toBe("mlb:123");expect(f.prob).toBe(22);expect(f.market).toBe("batter_home_runs");expect(f.cross).t…`
- tests/discovery-release.test.ts:122 — `const c=combineTicket([{cz:100,prob:40,push:20},{cz:100,prob:50}])!;` [x2]
- tests/discovery-release.test.ts:124 — `const l={id:"nfl:side",sport:"nfl" as const,gameId:"1",label:"KC",sub:"Spread",game:"BUF @ KC",cz:100,prob:40,push:20,book:"DK",market:"spread"};`
- tests/dkfd-basis.test.ts:99 — `SELECTABLE universe — rows/tickets carrying a DK/FD basis. czEv/czOdds are display` [x2]
- tests/dkfd-basis.test.ts:129 — `it("wild CZ/BetMGM price perturbation (fair-preserving) leaves every pick, ranking, and card byte-identical", async () => {`
- tests/dkfd-basis.test.ts:134 — `const czA = JSON.stringify(Object.values(a.d.categories).flat().map((r) => r.czOdds ?? null));` [x2]
- tests/dkfd-basis.test.ts:135 — `const czB = JSON.stringify(Object.values(b.d.categories).flat().map((r) => r.czOdds ?? null));` [x2]
- tests/dkfd-basis.test.ts:136 — `expect(czB).not.toBe(czA);` [x2]
- tests/dkfd-basis.test.ts:173 — `// so with zero DK/FD coverage there is no card pool at all — never a CZ-priced fallback`
- tests/dkfd-basis.test.ts:216 — `it("grading still settles at the confirmed/CZ price — the basis never pays", () => {`
- tests/dkfd-basis.test.ts:228 — `czDec: 2.5,`
- tests/dkfd-basis.test.ts:232 — `{ label: "A", prop: "Hits O 0.5", cz: -110 },`
- tests/dkfd-basis.test.ts:233 — `{ label: "B", prop: "TB O 1.5", cz: 150 },`
- tests/dkfd-basis.test.ts:236 — `expect(g(ticket, res).payout).toBe(25); // 10 × 2.5 at CZ`
- tests/dkfd-basis.test.ts:243 — `it("a sighting carries the CZ close AND the better DK/FD close", () => {`
- tests/dkfd-basis.test.ts:290 — `// won at CZ 2.5, picked at basis 2.8 → tax = 10×2.8 − 25 = $3 left at the counter`
- tests/dkfd-basis.test.ts:291 — `id: "w1", type: "batter_hits", stake: 10, czDec: 2.5, bsDec: 2.8,`
- tests/dkfd-basis.test.ts:292 — `legs: [{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: 150, bs: 180 }],`
- tests/dkfd-basis.test.ts:296 — `id: "l1", type: "MIX", stake: 8, czDec: 3.0, bsDec: 3.3,`
- tests/dkfd-basis.test.ts:297 — `legs: [{ label: "B", prop: "TB O 1.5", lkey: "b|batter_total_bases|1.5", cz: 200, bs: 230 }],`
- tests/dkfd-basis.test.ts:300 — `// void-repriced win (g.dec ≠ czDec): excluded, disclosed — a basis reprice would be a guess`
- tests/dkfd-basis.test.ts:301 — `id: "v1", type: "MIX", stake: 5, czDec: 4.0, bsDec: 4.4,`
- tests/dkfd-basis.test.ts:302 — `legs: [{ label: "C", prop: "Ks O 4.5", lkey: "c|pitcher_strikeouts|4.5", cz: 300, bs: 340 }],`
- tests/dkfd-basis.test.ts:316 — `// CZ close 140 vs locked 150; basis close 160 vs locked basis 180`
- tests/dkfd-basis.test.ts:333 — `// and CZ CLV still grades vs the CZ close, independently` [x2]
- tests/doubleheader.test.ts:139 — `if (!b || a.cz == null || b.cz == null) continue;` [x2]
- tests/doubleheader.test.ts:140 — `expect(JSON.stringify(a.cz)).not.toBe(JSON.stringify(b.cz));` [x2]
- tests/engine-echo.test.ts:146 — `{ hrrAltMax: -1, coreEvMin: 2, coreCzEvMin: 0, consMinN: 100, consMinEv: -1,`
- tests/engine-echo.test.ts:151 — `for (const k of ["engineSha", "priorsSha", "ctxSha", "hrrAltMax", "coreEvMin", "coreCzEvMin",`
- tests/engine-units.test.ts:59 — `const tik = (type: string, legs: Leg[], czDec: number, czEv: number, prob: number) => ({` [x2]
- tests/engine-units.test.ts:60 — `pl: { type, name: '${type} · ${legs.length} legs', legs, czDec, czEv, prob },` [x2]
- tests/engine-units.test.ts:114 — `expect(pl.czDec as number).toBeLessThanOrEqual(15);`
- tests/engine-units.test.ts:181 — `czDec: 7.0,`
- tests/engine-units.test.ts:184 — `{ label: "A", prop: "Hits O 0.5", cz: -110 },`
- tests/engine-units.test.ts:185 — `{ label: "B", prop: "TB O 1.5", cz: 150 },`
- tests/engine-units.test.ts:186 — `{ label: "C", prop: "Ks O 5.5", cz: -120 },`
- tests/engine-units.test.ts:202 — `it("any lost leg loses; all-void pushes the stake back; NV-confirmed price wins over czDec", () => {`
- tests/engine2-allstar.test.ts:19 — `books that exercise every path: consensus, CZ-only F3, modal-point split,`
- tests/engine2-allstar.test.ts:102 — `it("F3 exists as a CZ-only de-vig", () => {`
- tests/finite-prices.test.ts:8 — `* evaluates FALSE, so a NaN price fails every gate — 'czEv >= coreEvMin', 'czEv >= czMin',` [x3]
- tests/finite-prices.test.ts:30 — `const PRICE_FIELDS = ["prob", "implied", "edge", "ev", "kellyF", "czEv", "czKellyF", "pModel"];` [x2]
- tests/first-sunday-six.test.ts:33 — `const b={...board,rows:board.rows.map(r=>({...r,cz:{price:500}}))} as CfbPropsBoard;`
- tests/fixtures/baseline-armed-v1.json:1 — `…cher_strikeouts":[],"rl":[]},"parlays":[{"n":"Hits parlay · 2 legs","o":"-115","p":49.1,"cz":null,"czEv":null,"bsEv":-8.4,"consEv":-8.7,"consCzEv":null,"legs":["Jake Mangum (PIT)|H…` [long line; 486 occurrences on this line; first shown]
- tests/fixtures/baseline-armed-v2-singles.json:1 — `…cher_strikeouts":[],"rl":[]},"parlays":[{"n":"Hits parlay · 2 legs","o":"-115","p":49.1,"cz":null,"czEv":null,"bsEv":-8.4,"consEv":-8.7,"consCzEv":null,"legs":["Jake Mangum (PIT)|H…` [long line; 495 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:23 — `"cz": null,`
- tests/fixtures/gen-pool.json:38 — `"cz": null,`
- tests/fixtures/gen-pool.json:55 — `"cz": null,`
- tests/fixtures/gen-pool.json:70 — `"cz": null,`
- tests/fixtures/gen-pool.json:85 — `"cz": null,`
- tests/fixtures/gen-pool.json:100 — `"cz": null,`
- tests/fixtures/gen-pool.json:115 — `"cz": null,`
- tests/fixtures/gen-pool.json:130 — `"cz": null,`
- tests/fixtures/gen-pool.json:145 — `"cz": null,`
- tests/fixtures/gen-pool.json:160 — `"cz": null,`
- tests/fixtures/gen-pool.json:175 — `"cz": null,`
- tests/fixtures/gen-pool.json:190 — `"cz": null,`
- tests/fixtures/gen-pool.json:205 — `"cz": null,`
- tests/fixtures/gen-pool.json:220 — `"cz": null,`
- tests/fixtures/gen-pool.json:235 — `"cz": null,`
- tests/fixtures/gen-pool.json:250 — `"cz": null,`
- tests/fixtures/gen-pool.json:265 — `"cz": null,`
- tests/fixtures/gen-pool.json:280 — `"cz": null,`
- tests/fixtures/gen-pool.json:295 — `"cz": null,`
- tests/fixtures/gen-pool.json:310 — `"cz": null,`
- tests/fixtures/gen-pool.json:327 — `"cz": {`
- tests/fixtures/gen-pool.json:345 — `"cz": {`
- tests/fixtures/gen-pool.json:363 — `"cz": {`
- tests/fixtures/gen-pool.json:381 — `"cz": {`
- tests/fixtures/gen-pool.json:399 — `"cz": {`
- tests/fixtures/gen-pool.json:417 — `"cz": {`
- tests/fixtures/gen-pool.json:435 — `"cz": {`
- tests/fixtures/gen-pool.json:453 — `"cz": {`
- tests/fixtures/gen-pool.json:471 — `"cz": null,`
- tests/fixtures/gen-pool.json:488 — `"cz": {`
- tests/fixtures/gen-pool.json:506 — `"cz": {`
- tests/fixtures/gen-pool.json:524 — `"cz": {`
- tests/fixtures/gen-pool.json:542 — `"cz": {`
- tests/fixtures/gen-pool.json:560 — `"cz": {`
- tests/fixtures/gen-pool.json:578 — `"cz": {`
- tests/fixtures/gen-pool.json:596 — `"cz": {`
- tests/fixtures/gen-pool.json:614 — `"cz": {`
- tests/fixtures/gen-pool.json:632 — `"cz": {`
- tests/fixtures/gen-pool.json:650 — `"cz": {`
- tests/fixtures/gen-pool.json:668 — `"cz": null,`
- tests/fixtures/gen-pool.json:685 — `"cz": {`
- tests/fixtures/gen-pool.json:703 — `"cz": {`
- tests/fixtures/gen-pool.json:723 — `"cz": {`
- tests/fixtures/gen-pool.json:741 — `"cz": {`
- tests/fixtures/gen-pool.json:759 — `"cz": {`
- tests/fixtures/gen-pool.json:777 — `"cz": {`
- tests/fixtures/gen-pool.json:795 — `"cz": {`
- tests/fixtures/gen-pool.json:813 — `"cz": {`
- tests/fixtures/gen-pool.json:831 — `"cz": {`
- tests/fixtures/gen-pool.json:849 — `"cz": {`
- tests/fixtures/gen-pool.json:867 — `"cz": {`
- tests/fixtures/gen-pool.json:885 — `"cz": {`
- tests/fixtures/gen-pool.json:903 — `"cz": {`
- tests/fixtures/gen-pool.json:921 — `"cz": {`
- tests/fixtures/gen-pool.json:939 — `"cz": {`
- tests/fixtures/gen-pool.json:957 — `"cz": {`
- tests/fixtures/gen-pool.json:975 — `"cz": {`
- tests/fixtures/gen-pool.json:993 — `"cz": {`
- tests/fixtures/gen-pool.json:1011 — `"cz": {`
- tests/fixtures/gen-pool.json:1029 — `"cz": {`
- tests/fixtures/gen-pool.json:1046 — `"cz": {`
- tests/fixtures/gen-pool.json:1063 — `"cz": {`
- tests/fixtures/gen-pool.json:1080 — `"cz": {`
- tests/fixtures/gen-pool.json:1097 — `"cz": {`
- tests/fixtures/gen-pool.json:1114 — `"cz": {`
- tests/fixtures/gen-pool.json:1131 — `"cz": {`
- tests/fixtures/gen-pool.json:1148 — `"cz": {`
- tests/fixtures/gen-pool.json:1165 — `"cz": {`
- tests/fixtures/gen-pool.json:1182 — `"cz": {`
- tests/fixtures/gen-pool.json:1199 — `"cz": {`
- tests/fixtures/gen-pool.json:1226 — `"cz": null,`
- tests/fixtures/gen-pool.json:1241 — `"cz": null,`
- tests/fixtures/gen-pool.json:1256 — `"cz": null,`
- tests/fixtures/gen-pool.json:1273 — `"cz": null,`
- tests/fixtures/gen-pool.json:1288 — `"cz": null,`
- tests/fixtures/gen-pool.json:1303 — `"cz": null,`
- tests/fixtures/gen-pool.json:1318 — `"cz": null,`
- tests/fixtures/gen-pool.json:1333 — `"cz": null,`
- tests/fixtures/gen-pool.json:1348 — `"cz": null,`
- tests/fixtures/gen-pool.json:1363 — `"cz": null,`
- tests/fixtures/gen-pool.json:1378 — `"cz": null,`
- tests/fixtures/gen-pool.json:1393 — `"cz": null,`
- tests/fixtures/gen-pool.json:1408 — `"cz": null,`
- tests/fixtures/gen-pool.json:1423 — `"cz": null,`
- tests/fixtures/gen-pool.json:1438 — `"cz": null,`
- tests/fixtures/gen-pool.json:1453 — `"cz": null,`
- tests/fixtures/gen-pool.json:1468 — `"cz": null,`
- tests/fixtures/gen-pool.json:1483 — `"cz": null,`
- tests/fixtures/gen-pool.json:1498 — `"cz": null,`
- tests/fixtures/gen-pool.json:1513 — `"cz": null,`
- tests/fixtures/gen-pool.json:1528 — `"cz": null,`
- tests/fixtures/gen-pool.json:1545 — `"cz": null,`
- tests/fixtures/gen-pool.json:1562 — `"cz": {`
- tests/fixtures/gen-pool.json:1580 — `"cz": {`
- tests/fixtures/gen-pool.json:1598 — `"cz": {`
- tests/fixtures/gen-pool.json:1616 — `"cz": {`
- tests/fixtures/gen-pool.json:1634 — `"cz": {`
- tests/fixtures/gen-pool.json:1652 — `"cz": {`
- tests/fixtures/gen-pool.json:1670 — `"cz": {`
- tests/fixtures/gen-pool.json:1688 — `"cz": {`
- tests/fixtures/gen-pool.json:1706 — `"cz": null,`
- tests/fixtures/gen-pool.json:1723 — `"cz": {`
- tests/fixtures/gen-pool.json:1741 — `"cz": {`
- tests/fixtures/gen-pool.json:1759 — `"cz": {`
- tests/fixtures/gen-pool.json:1777 — `"cz": {`
- tests/fixtures/gen-pool.json:1795 — `"cz": {`
- tests/fixtures/gen-pool.json:1813 — `"cz": {`
- tests/fixtures/gen-pool.json:1831 — `"cz": {`
- tests/fixtures/gen-pool.json:1849 — `"cz": {`
- tests/fixtures/gen-pool.json:1867 — `"cz": {`
- tests/fixtures/gen-pool.json:1885 — `"cz": {`
- tests/fixtures/gen-pool.json:1903 — `"cz": {`
- tests/fixtures/gen-pool.json:1921 — `"cz": {`
- tests/fixtures/gen-pool.json:1939 — `"cz": {`
- tests/fixtures/gen-pool.json:1957 — `"cz": {`
- tests/fixtures/gen-pool.json:1975 — `"cz": {`
- tests/fixtures/gen-pool.json:1993 — `"cz": {`
- tests/fixtures/gen-pool.json:2011 — `"cz": {`
- tests/fixtures/gen-pool.json:2029 — `"cz": {`
- tests/fixtures/gen-pool.json:2047 — `"cz": {`
- tests/fixtures/gen-pool.json:2064 — `"cz": {`
- tests/fixtures/gen-pool.json:2081 — `"cz": {`
- tests/fixtures/gen-pool.json:2098 — `"cz": {`
- tests/fixtures/gen-pool.json:2115 — `"cz": {`
- tests/fixtures/gen-pool.json:2132 — `"cz": {`
- tests/fixtures/gen-pool.json:2159 — `"cz": {`
- tests/fixtures/gen-pool.json:2179 — `"cz": {`
- tests/fixtures/gen-pool.json:2197 — `"cz": {`
- tests/fixtures/gen-pool.json:2215 — `"cz": {`
- tests/fixtures/gen-pool.json:2233 — `"cz": {`
- tests/fixtures/gen-pool.json:2251 — `"cz": {`
- tests/fixtures/gen-pool.json:2269 — `"cz": {`
- tests/fixtures/gen-pool.json:2287 — `"cz": {`
- tests/fixtures/gen-pool.json:2305 — `"cz": {`
- tests/fixtures/gen-pool.json:2323 — `"cz": {`
- tests/fixtures/gen-pool.json:2341 — `"cz": {`
- tests/fixtures/gen-pool.json:2359 — `"cz": {`
- tests/fixtures/gen-pool.json:2377 — `"cz": {`
- tests/fixtures/gen-pool.json:2395 — `"cz": {`
- tests/fixtures/gen-pool.json:2413 — `"cz": {`
- tests/fixtures/gen-pool.json:2431 — `"cz": {`
- tests/fixtures/gen-pool.json:2449 — `"cz": {`
- tests/fixtures/gen-pool.json:2467 — `"cz": {`
- tests/fixtures/gen-pool.json:2485 — `"cz": {`
- tests/fixtures/gen-pool.json:2505 — `"cz": null,`
- tests/fixtures/gen-pool.json:2522 — `"cz": {`
- tests/fixtures/gen-pool.json:2540 — `"cz": {`
- tests/fixtures/gen-pool.json:2558 — `"cz": {`
- tests/fixtures/gen-pool.json:2576 — `"cz": {`
- tests/fixtures/gen-pool.json:2594 — `"cz": {`
- tests/fixtures/gen-pool.json:2612 — `"cz": {`
- tests/fixtures/gen-pool.json:2630 — `"cz": {`
- tests/fixtures/gen-pool.json:2650 — `"cz": {`
- tests/fixtures/gen-pool.json:2670 — `"cz": {`
- tests/fixtures/gen-pool.json:2688 — `"cz": {`
- tests/fixtures/gen-pool.json:2706 — `"cz": {`
- tests/fixtures/gen-pool.json:2724 — `"cz": {`
- tests/fixtures/gen-pool.json:2742 — `"cz": {`
- tests/fixtures/gen-pool.json:2760 — `"cz": {`
- tests/fixtures/gen-pool.json:2778 — `"cz": {`
- tests/fixtures/gen-pool.json:2796 — `"cz": {`
- tests/fixtures/gen-pool.json:2814 — `"cz": {`
- tests/fixtures/gen-pool.json:2832 — `"cz": {`
- tests/fixtures/gen-pool.json:2850 — `"cz": {`
- tests/fixtures/gen-pool.json:2868 — `"cz": {`
- tests/fixtures/gen-pool.json:2886 — `"cz": {`
- tests/fixtures/gen-pool.json:2904 — `"cz": {`
- tests/fixtures/gen-pool.json:2922 — `"cz": {`
- tests/fixtures/gen-pool.json:2940 — `"cz": {`
- tests/fixtures/gen-pool.json:2958 — `"cz": {`
- tests/fixtures/gen-pool.json:2975 — `"cz": {`
- tests/fixtures/gen-pool.json:2992 — `"cz": {`
- tests/fixtures/gen-pool.json:3009 — `"cz": {`
- tests/fixtures/gen-pool.json:3026 — `"cz": {`
- tests/fixtures/gen-pool.json:3043 — `"cz": {`
- tests/fixtures/gen-pool.json:3060 — `"cz": {`
- tests/fixtures/gen-pool.json:3077 — `"cz": {`
- tests/fixtures/gen-pool.json:3094 — `"cz": {`
- tests/fixtures/gen-pool.json:3111 — `"cz": {`
- tests/fixtures/gen-pool.json:3128 — `"cz": {`
- tests/fixtures/gen-pool.json:3145 — `"cz": {`
- tests/fixtures/gen-pool.json:3172 — `"cz": null,`
- tests/fixtures/gen-pool.json:3187 — `"cz": null,`
- tests/fixtures/gen-pool.json:3204 — `"cz": null,`
- tests/fixtures/gen-pool.json:3220 — `"cz": null,`
- tests/fixtures/gen-pool.json:3237 — `"cz": null,`
- tests/fixtures/gen-pool.json:3252 — `"cz": {`
- tests/fixtures/gen-pool.json:3270 — `"cz": {`
- tests/fixtures/gen-pool.json:3288 — `"cz": {`
- tests/fixtures/gen-pool.json:3306 — `"cz": {`
- tests/fixtures/gen-pool.json:3323 — `"cz": {`
- tests/fixtures/gen-pool.json:3341 — `"cz": {`
- tests/fixtures/gen-pool.json:3359 — `"cz": {`
- tests/fixtures/gen-pool.json:3377 — `"cz": {`
- tests/fixtures/gen-pool.json:3397 — `"cz": null,`
- tests/fixtures/gen-pool.json:3414 — `"cz": {`
- tests/fixtures/gen-pool.json:3432 — `"cz": {`
- tests/fixtures/gen-pool.json:3459 — `"cz": null,`
- tests/fixtures/gen-pool.json:3473 — `"cz": null,`
- tests/fixtures/gen-pool.json:3490 — `"cz": null,`
- tests/fixtures/gen-pool.json:3505 — `"cz": null,`
- tests/fixtures/gen-pool.json:3520 — `"cz": null,`
- tests/fixtures/gen-pool.json:3535 — `"cz": null,`
- tests/fixtures/gen-pool.json:3550 — `"cz": null,`
- tests/fixtures/gen-pool.json:3565 — `"cz": null,`
- tests/fixtures/gen-pool.json:3580 — `"cz": null,`
- tests/fixtures/gen-pool.json:3595 — `"cz": null,`
- tests/fixtures/gen-pool.json:3610 — `"cz": null,`
- tests/fixtures/gen-pool.json:3627 — `"cz": null,`
- tests/fixtures/gen-pool.json:3644 — `"cz": null,`
- tests/fixtures/gen-pool.json:3659 — `"cz": {`
- tests/fixtures/gen-pool.json:3677 — `"cz": {`
- tests/fixtures/gen-pool.json:3695 — `"cz": {`
- tests/fixtures/gen-pool.json:3713 — `"cz": null,`
- tests/fixtures/gen-pool.json:3730 — `"cz": {`
- tests/fixtures/gen-pool.json:3750 — `"cz": {`
- tests/fixtures/gen-pool.json:3768 — `"cz": {`
- tests/fixtures/gen-pool.json:3786 — `"cz": {`
- tests/fixtures/gen-pool.json:3804 — `"cz": {`
- tests/fixtures/gen-pool.json:3822 — `"cz": {`
- tests/fixtures/gen-pool.json:3840 — `"cz": {`
- tests/fixtures/gen-pool.json:3858 — `"cz": {`
- tests/fixtures/gen-pool.json:3876 — `"cz": {`
- tests/fixtures/gen-pool.json:3894 — `"cz": {`
- tests/fixtures/gen-pool.json:3912 — `"cz": {`
- tests/fixtures/gen-pool.json:3930 — `"cz": {`
- tests/fixtures/gen-pool.json:3948 — `"cz": {`
- tests/fixtures/gen-pool.json:3966 — `"cz": {`
- tests/fixtures/gen-pool.json:3984 — `"cz": {`
- tests/fixtures/gen-pool.json:4002 — `"cz": {`
- tests/fixtures/gen-pool.json:4020 — `"cz": {`
- tests/fixtures/gen-pool.json:4037 — `"cz": {`
- tests/fixtures/gen-pool.json:4054 — `"cz": {`
- tests/fixtures/gen-pool.json:4071 — `"cz": {`
- tests/fixtures/gen-pool.json:4088 — `"cz": {`
- tests/fixtures/gen-pool.json:4105 — `"cz": {`
- tests/fixtures/gen-pool.json:4122 — `"cz": {`
- tests/fixtures/gen-pool.json:4139 — `"cz": {`
- tests/fixtures/gen-pool.json:4156 — `"cz": {`
- tests/fixtures/gen-pool.json:4173 — `"cz": {`
- tests/fixtures/gen-pool.json:4190 — `"cz": {`
- tests/fixtures/gen-pool.json:4207 — `"cz": {`
- tests/fixtures/gen-pool.json:4224 — `"cz": {`
- tests/fixtures/gen-pool.json:4241 — `"cz": {`
- tests/fixtures/gen-pool.json:4268 — `"cz": null,`
- tests/fixtures/gen-pool.json:4283 — `"cz": null,`
- tests/fixtures/gen-pool.json:4300 — `"cz": null,`
- tests/fixtures/gen-pool.json:4315 — `"cz": null,`
- tests/fixtures/gen-pool.json:4330 — `"cz": null,`
- tests/fixtures/gen-pool.json:4345 — `"cz": null,`
- tests/fixtures/gen-pool.json:4360 — `"cz": null,`
- tests/fixtures/gen-pool.json:4375 — `"cz": null,`
- tests/fixtures/gen-pool.json:4390 — `"cz": null,`
- tests/fixtures/gen-pool.json:4405 — `"cz": null,`
- tests/fixtures/gen-pool.json:4420 — `"cz": null,`
- tests/fixtures/gen-pool.json:4435 — `"cz": null,`
- tests/fixtures/gen-pool.json:4450 — `"cz": null,`
- tests/fixtures/gen-pool.json:4465 — `"cz": null,`
- tests/fixtures/gen-pool.json:4480 — `"cz": null,`
- tests/fixtures/gen-pool.json:4495 — `"cz": null,`
- tests/fixtures/gen-pool.json:4510 — `"cz": null,`
- tests/fixtures/gen-pool.json:4525 — `"cz": null,`
- tests/fixtures/gen-pool.json:4540 — `"cz": null,`
- tests/fixtures/gen-pool.json:4557 — `"cz": null,`
- tests/fixtures/gen-pool.json:4574 — `"cz": null,`
- tests/fixtures/gen-pool.json:4591 — `"cz": {`
- tests/fixtures/gen-pool.json:4609 — `"cz": {`
- tests/fixtures/gen-pool.json:4629 — `"cz": {`
- tests/fixtures/gen-pool.json:4647 — `"cz": {`
- tests/fixtures/gen-pool.json:4665 — `"cz": {`
- tests/fixtures/gen-pool.json:4683 — `"cz": {`
- tests/fixtures/gen-pool.json:4701 — `"cz": {`
- tests/fixtures/gen-pool.json:4719 — `"cz": {`
- tests/fixtures/gen-pool.json:4737 — `"cz": {`
- tests/fixtures/gen-pool.json:4755 — `"cz": {`
- tests/fixtures/gen-pool.json:4773 — `"cz": {`
- tests/fixtures/gen-pool.json:4791 — `"cz": {`
- tests/fixtures/gen-pool.json:4809 — `"cz": {`
- tests/fixtures/gen-pool.json:4827 — `"cz": {`
- tests/fixtures/gen-pool.json:4845 — `"cz": {`
- tests/fixtures/gen-pool.json:4863 — `"cz": {`
- tests/fixtures/gen-pool.json:4881 — `"cz": {`
- tests/fixtures/gen-pool.json:4899 — `"cz": {`
- tests/fixtures/gen-pool.json:4917 — `"cz": {`
- tests/fixtures/gen-pool.json:4934 — `"cz": {`
- tests/fixtures/gen-pool.json:4951 — `"cz": {`
- tests/fixtures/gen-pool.json:4968 — `"cz": {`
- tests/fixtures/gen-pool.json:4985 — `"cz": {`
- tests/fixtures/gen-pool.json:5002 — `"cz": {`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…etmgm":0.37037037037037035,"fanatics":0.37037037037037035,"bovada":0.37037037037037035},"cz":{"book":"draftkings","title":"DraftKings","price":150,"line":null,"dec":2.5},"best":{"b…` [long line; 80 occurrences on this line; first shown]
- tests/football-gen.test.ts:81 — `czOnly: false,`
- tests/football-gen.test.ts:191 — `const cz = propQuote(row, "cz")!;` [x2]
- tests/football-gen.test.ts:192 — `expect(cz.price).toBe(-110);`
- tests/football-gen.test.ts:193 — `expect(cz.line).toBe(249.5);`
- tests/football-gen.test.ts:194 — `expect(propLegOf(row, cz)).toBeNull();`
- tests/football-gen.test.ts:202 — `expect(row.cz).toBeNull();`
- tests/football-gen.test.ts:203 — `expect(propQuote(row, "cz")).toBeNull();`
- tests/football-gen.test.ts:209 — `const cz = poolFor(s, "cz");` [x2]
- tests/football-gen.test.ts:210 — `expect(cz.rows).toBe(4); // the board drew four cells`
- tests/football-gen.test.ts:211 — `expect(cz.legs).toHaveLength(0); // all four were dashes`
- tests/football-gen.test.ts:212 — `expect(fail(generate(cz, s, 1)).code).toBe("no-rows");`
- tests/football-gen.test.ts:222 — `expect(propQuote(row, "cz")!.line).toBe(22.5);`
- tests/football-gen.test.ts:223 — `expect(propLegOf(row, propQuote(row, "cz")!)).toBeNull();`
- tests/football-gen.test.ts:226 — `for (const mode of ["cz", "best"] as FootballPriceMode[]) {`
- tests/football-gen.test.ts:236 — `for (const mode of ["cz", "best"] as FootballPriceMode[]) {`
- tests/football-gen.test.ts:244 — `expect(l.am).toBe(l.leg.cz);`
- tests/football-gen.test.ts:275 — `const pool = poolFor(spec(ATD), "cz");`
- tests/football-gen.test.ts:288 — `const pool = poolFor(five, "cz");`
- tests/football-gen.test.ts:296 — `const t = ok(generate(poolFor(four, "cz"), four, 3));`
- tests/football-gen.test.ts:305 — `const t = ok(generate(poolFor(s, "cz"), s, 3));`
- tests/football-gen.test.ts:316 — `expect(ok(generate(poolFor(s, "cz"), s, 3)).legs).toHaveLength(5);`
- tests/football-gen.test.ts:326 — `const pool = poolFor(base, "cz");`
- tests/football-gen.test.ts:332 — `const t = ok(generate(poolFor(pinned, "cz"), pinned, specSeed(pinned, DATE, roll)));`
- tests/football-gen.test.ts:344 — `const t = ok(generate(poolFor(s, "cz"), s, 11));`
- tests/football-gen.test.ts:353 — `expect(fail(generate(poolFor(s, "cz"), s, 1))).toMatchObject({ code: "pin-missing" });`
- tests/football-gen.test.ts:377 — `const pool = poolFor(s, "cz", 0, twin);`
- tests/football-gen.test.ts:391 — `const f = fail(generate(poolFor(s, "cz"), s, 1));`
- tests/football-gen.test.ts:397 — `const t = ok(generate(poolFor(s, "cz"), s, 1));`
- tests/football-gen.test.ts:417 — `const pool = poolFor(three, "cz");`
- tests/football-gen.test.ts:425 — `const pool = poolFor(two, "cz", 0, tagged());`
- tests/football-gen.test.ts:436 — `expect(fail(generate(poolFor(three, "cz", 0, tagged()), three, 1))).toEqual({ code: "short-pool", have: 2, want: 3, relax: "same-team" });`
- tests/football-gen.test.ts:440 — `const t = ok(generate(poolFor(three, "cz", 0, tagged()), three, 1));`
- tests/football-gen.test.ts:450 — `const dropped = poolFor(s, "cz", mid);`
- tests/football-gen.test.ts:454 — `const admitted = poolFor({ ...s, includeStarted: true }, "cz", mid);`
- tests/football-gen.test.ts:460 — `expect(poolFor(s, "cz", 0, live).startedDropped).toBe(5);`
- tests/football-gen.test.ts:467 — `const pool = poolFor(s, "cz", Date.parse("2026-09-06T00:00:00Z"), done);`
- tests/football-gen.test.ts:484 — `const pool = poolFor(s, "cz", Date.parse("2030-01-01T00:00:00Z"), vague);`
- tests/football-gen.test.ts:504 — `const pool = poolFor(UNDERS, "cz");`
- tests/football-gen.test.ts:518 — `const empty = poolFor(s, "cz");`
- tests/football-gen.test.ts:525 — `expect(ok(generate(poolFor(overs, "cz"), overs, 1)).legs).toHaveLength(2);`
- tests/football-gen.test.ts:533 — `const a = ok(generate(poolFor(s, "cz"), s, seed));`
- tests/football-gen.test.ts:534 — `const b = ok(generate(poolFor(s, "cz"), s, seed));`
- tests/football-gen.test.ts:540 — `const c = ok(generate(poolFor(s, "cz", 0, shuffled), s, seed));`
- tests/football-gen.test.ts:547 — `const POOL = poolFor(SPEC, "cz");`
- tests/football-gen.test.ts:634 — `const out = sheet({ spec: u, result: generate(poolFor(u, "cz"), u, 1) });`
- tests/football-gen.test.ts:642 — `const pool = poolFor(SPEC, "cz", Date.parse("2026-09-06T00:00:00Z"), done);`
- tests/football-gen.test.ts:652 — `const empty = poolFor(spec({ market: "pass_yds", sides: "both" }), "cz");`
- tests/football-gen.test.ts:674 — `cz: -110,`
- tests/football-gen.test.ts:675 — `book: "CZ",`
- tests/football-gen.test.ts:679 — `const generated = ok(generate(poolFor(S, "cz"), S, specSeed(S, DATE, 0))).legs.map((l) => l.leg);`
- tests/football-ladders.test.ts:41 — `expect(current.cz?.price).toBe(q.price);expect(current.fair).toBe(row.probabilities![book]);`
- tests/football-ladders.test.ts:42 — `expect(current.evCz).toBeCloseTo(100*(current.fair!*q.dec-1));expect(current.kelly).not.toBeNull();`
- tests/football-ladders.test.ts:45 — `expect(new Set(books.map(b=>priceFootballProp(row,b).evCz)).size).toBe(3);`
- tests/football-ladders.test.ts:49 — `const row=parse(p)[0];expect(row.fair).toBeNull();expect(row.grade).toBeNull();expect(priceFootballProp(row,'fanduel').cz).toBeNull();`
- tests/football-ladders.test.ts:64 — `…market:'first_td',legs:2,legMinAm:-1000,legMaxAm:1000,payout:null,sides:'o',onePerGame:false,onePerTeam:false,czOnly:false,includeStarted:false,modelOnly:false,pinned:[null,null]};`
- tests/found-football.test.ts:138 — `…t tk = (id: string, stake: number, bucket: "core" | "fun"): CfbTicket => ({ id, bucket, name: "SINGLE · seeded", stake, czOdds: -110, czDec: 1.9091, prob: 55, czEv: 3, legs: [] });` [x3]
- tests/found-football.test.ts:199 — `expect(t.czDec).toBeLessThanOrEqual(2.6);`
- tests/found-football.test.ts:211 — `if (row) expect(l.cz).toBe(row.cz!.price);` [x2]
- tests/found-football.test.ts:292 — `/* the board is priced, but no row clears the +2% gate (every evCz forced below it — the prices stay as given) */`
- tests/found-football.test.ts:295 — `return { ...s, games: s.games.map((g) => ({ ...g, rows: g.rows.map((x) => ({ ...x, evCz: x.evCz == null ? x.evCz : Math.min(x.evCz, 0) })) })) };` [x4]
- tests/found-football.test.ts:438 — `… core: stakes.map((s, i) => ({ id: 'cfb-${date}-found-${i + 1}', bucket: "core" as const, name: "x", stake: s, czOdds: 100, czDec: 2, prob: 52, czEv: 4, legs: [], found: true })),` [x3]
- tests/found-football.test.ts:526 — `evCz: 6,`
- tests/found-football.test.ts:527 — `cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 },`
- tests/found-football.test.ts:534 — `expect(props.every((t) => t.legs.length === 1 && t.legs[0].cz === 100)).toBe(true);`
- tests/found-football.test.ts:553 — `teamId: game.home.id, line: 4.5, fair: 0.5105, evCz: 2.1,`
- tests/found-football.test.ts:554 — `cz: {book: "draftkings", price: 100, line: 4.5, dec: 2},`
- tests/found-football.test.ts:565 — `expect(preview.core.every(t => t.legs.length === 1 && t.czEv >= cfg.rules.minEvPct)).toBe(true);`
- tests/found-mode.test.ts:124 — `expect(Number(t.czEv)).toBeGreaterThan(0);`
- tests/found-winnings.test.ts:89 — `{ id: "ml", stake: 250, czDec: 2, legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }] },`
- tests/found-winnings.test.ts:91 — `{ id: "k", stake: 100, czDec: 1.8, legs: [{ lkey: "garrettcrochet|pitcher_strikeouts|5.5", prop: "Garrett Crochet O 5.5 K", gkey: "g2" }] },`
- tests/found-winnings.test.ts:93 — `{ id: "par", stake: 50, czDec: 3.6, legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }, { lkey: "ml_away", prop: "ML", gkey: "g3" }] },`
- tests/found-winnings.test.ts:119 — `// only the locked price counts: a ticket with nothing but a czOdds string is not priced by the device grader`
- tests/found-winnings.test.ts:120 — `const oddsOnly = { ...entry(), core: [{ id: "o", stake: 100, czOdds: "+150", legs: [{ lkey: "ml_home", prop: "ML", gkey: "g1" }] }] };`
- tests/found-winnings.test.ts:247 — `const leg = (gkey: string, side: "home" | "away", cz = 100) => ({`
- tests/found-winnings.test.ts:250 — `cz,`
- tests/found-winnings.test.ts:260 — `const tix = (id: string, stake: number, czDec: number, legs: ReturnType<typeof leg>[]) => ({ id, bucket: "core", name: "x", stake, czOdds: 100, czDec, prob: 55, czEv: 3, legs });` [x4]
- tests/found-winnings.test.ts:302 — `const t = (n: number, stake: number) => ({ id: 'cfb-${D}-found-${n}', bucket: "core", name: "x", stake, czOdds: 100, confirmed: null, found: true, legs: [] });`
- tests/fun-hr.test.ts:27 — `cz: Math.round((dec - 1) * 100),`
- tests/fun-hr.test.ts:98 — `expect(t.czDec).toBeCloseTo(dec, 6);`
- tests/fun-ladder.test.ts:18 — `const L = (player: string, team: string, prob: number, cz: number, prop = "H+R+RBI O 0.5", extra: Partial<FunLegSrc> = {}): FunLegSrc => ({`
- tests/fun-ladder.test.ts:24 — `dec: cz > 0 ? 1 + cz / 100 : 1 + 100 / Math.abs(cz),` [x3]
- tests/fun-ladder.test.ts:25 — `cz,`
- tests/fun-ladder.test.ts:55 — `expect(t!.czDec).toBeCloseTo(dec, 9);`
- tests/fun-ladder.test.ts:57 — `expect(t!.czEv).toBeCloseTo((p * dec - 1) * 100, 9);`
- tests/fun-ladder.test.ts:58 — `expect(t!.czOdds).toBe('+${Math.round((dec - 1) * 100)}');`
- tests/fun-ladder.test.ts:84 — `L("noprice", "Z1", 90, 0, "H+R+RBI O 0.5", { dec: null, cz: null }),`
- tests/fun-ladder.test.ts:104 — `/* a mock engine whose board carries a CZ-priced HRR/Hits board wide enough to seat the`
- tests/fun-ladder.test.ts:106 — `const row = (label: string, sub: string, prob: number, cz: number, market: string, extra: Record<string, unknown> = {}) => ({`
- tests/fun-ladder.test.ts:107 — `label, sub, prob, cz, noParlay: false, susp: false, lkey: '${label.split(" ")[0].toLowerCase()}|${market}|0.5', gkey: "g1", ...extra,`
- tests/fun-ladder.test.ts:134 — `const fun = entry.funT as { type: string; stake: number; legs: { label: string; prop: string }[]; czDec: number; prob: number }[];`
- tests/games.test.ts:111 — `{ label: "New York Yankees ML", odds: "-102", book: "DK", cz: -105, gkey: "newyorkyankees@losangelesdodgers" },`
- tests/games.test.ts:112 — `{ label: "New York Yankees ML", odds: "+100", book: "FD", cz: null, gkey: "newyorkyankees@losangelesdodgers" },`
- tests/games.test.ts:113 — `{ label: "Los Angeles Dodgers ML", odds: -116, book: "DK", cz: null, gkey: "newyorkyankees@losangelesdodgers" },`
- tests/games.test.ts:114 — `{ label: "Miami Marlins ML", odds: "+140", book: "MGM", cz: "+135", gkey: "miamimarlins@kansascityroyals" },`
- tests/games.test.ts:153 — `expect(byPk[3].away.ml).toEqual({ odds: "+100", book: "FD", cz: "-105" });`
- tests/games.test.ts:154 — `expect(byPk[3].home.ml).toEqual({ odds: "-116", book: "DK", cz: null });`
- tests/games.test.ts:155 — `expect(byPk[2].away.ml).toEqual({ odds: "+140", book: "MGM", cz: "+135" });`
- tests/games.test.ts:220 — `expect(mlFor([{ label: "Athletics ML", odds: -110, book: "DK" }], EARLIER, "away")).toEqual({ odds: "-110", book: "DK", cz: null });`
- tests/games.test.ts:274 — `expect(mlFor(rows, dh(1), "away")).toEqual({ odds: "-110", book: "DK", cz: null });`
- tests/games.test.ts:275 — `expect(mlFor(rows, dh(2), "away")).toEqual({ odds: "+130", book: "FD", cz: null });`
- tests/gen-hold-drag.test.ts:49 — `czOnly: false,`
- tests/gen-hold-drag.test.ts:322 — `for (const [k, cz] of [[0.7, 0.7], [1, 0.7], [1, 1]] as const) {`
- tests/gen-hold-drag.test.ts:323 — `const { zoom } = zoomFactors(k, cz);`
- tests/gen-hold-drag.test.ts:324 — `expect((70 / zoom) * cz).toBeCloseTo(70, 9);`
- tests/gen-hold-drag.test.ts:407 — `…], legs: 20, legMinAm: -250, legMaxAm: 320, payout: null, sides: "both", onePerGame: false, onePerTeam: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [] };`
- tests/gen-moved-note.test.ts:55 — `onePerGame: false, onePerTeam: false, czOnly: false, includeStarted: true, modelOnly: false, phase: "mixed",`
- tests/gen-moved-note.test.ts:60 — `mode: "cz", nowMs, pricedAt: b.pricedAt, liveMaxAgeMs: 600_000, teamOf: (r) => r.team, quoteOf: propQuote, legOf: propLegOf,`
- tests/gen-moved-note.test.ts:97 — `…, legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o", onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null] } as…`
- tests/grade.test.ts:11 — `* model. Board rows grade on the SAME EV the row displays (czEv, or bsEv in`
- tests/grade.test.ts:55 — `expect(src).toMatch(/gradeFromEv\(.*\bczEv\b/s); // caesars mode grades czEv` [x2]
- tests/guard-wiring.test.ts:219 — `input: { ledger: [{ date: "2026-07-20", locked: true, core: [{ id: "a", stake: 62, prob: 24.8, czDec: 4.26, legs: [] }] }] },`
- tests/helpers/fixture-env.ts:132 — `r.cz, r.czEv, r.bs, r.bsEv, r.kellyF, r.lu, r.susp ?? null,` [x2]
- tests/helpers/fixture-env.ts:140 — `n: p.name, o: p.odds, p: p.prob, cz: p.czOdds, czEv: p.czEv,` [x4]
- tests/helpers/fixture-env.ts:141 — `bsEv: p.bsEv, consEv: p.consEv, consCzEv: p.consCzEv,` [x2]
- tests/hr-line-rule.test.ts:24 — `cz: { o: ln > 0.5 ? 6000 : 320, u: null }, pO: null, fO: ln > 0.5 ? 1.5 : 22, books: 3, alt: ln > 0.5,`
- tests/ledger-merge.test.ts:176 — `cz: -150,`
- tests/ledger-merge.test.ts:183 — `czOdds: -150,`
- tests/ledger-merge.test.ts:367 — `const mlbLeg = (lkey: string, label: string) => ({ lkey, label, prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:642 — `* parlay), so it is not recoverable from the ticket's own czOdds/czDec either.` [x2]
- tests/ledger-merge.test.ts:655 — `const pLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -110 });`
- tests/ledger-merge.test.ts:727 — `czOdds: -111,`
- tests/ledger-merge.test.ts:847 — `const pLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -110 });`
- tests/ledger-merge.test.ts:920 — `const pLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -110 });`
- tests/ledger-merge.test.ts:1280 — `const bLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:1354 — `const aLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:1440 — `gkey, lkey: '${gkey}|ml|${side}|', label: '${side} ML', prop: "ML", market: "ml", side, line: null, cz: -150,`
- tests/ledger-merge.test.ts:1447 — `czOdds: -150,`
- tests/ledger-merge.test.ts:1565 — `const zLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:1658 — `const hLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:1761 — `const cLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:1763 — `id, bucket: "fun", name: "FAVORITES PARLAY", stake, czOdds: -150, confirmed: null, legs: [cLeg(gkey)], ...over,`
- tests/ledger-merge.test.ts:1838 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:1944 — `const xLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:1946 — `id, bucket: "core", name: "SINGLE · HOME ML", stake, czOdds: -110, confirmed: null, legs: [xLeg(gkey)], ...over,`
- tests/ledger-merge.test.ts:2058 — `const gLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:2100 — `const nLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2172 — `const dLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:2174 — `id: 'cfb-${DD}-core-${n}', bucket: "core", name: "SINGLE · HOME ML", stake, czOdds: -110, confirmed: null, legs: [dLeg('g${n}')],`
- tests/ledger-merge.test.ts:2218 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2245 — `* prop: l.prop ?? null, cz: l.cz ?? null, ...(l.gkey ? { gkey: l.gkey } : {}) })),` [x2]
- tests/ledger-merge.test.ts:2382 — `const gLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:2384 — `id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, czOdds: -150, confirmed: null, legs: [gLeg(gkey)], ...over,`
- tests/ledger-merge.test.ts:2480 — `const pLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2528 — `const gLeg = (n: number) => ({ gkey: 'g${n}', lkey: 'g${n}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:2568 — `const rLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2671 — `const sLeg = (gkey: string) => ({ gkey, lkey: '${gkey}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:2673 — `id, bucket: "fun", name: "FAVORITES PARLAY", stake: 25, czOdds: -150, confirmed: null, legs: [sLeg(gkey)], ...over,`
- tests/ledger-merge.test.ts:2682 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2807 — `const rLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:2842 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:2956 — `const fLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3069 — `const pLeg = { lkey: "l1", label: "l1 over", prop: "batter_hits", cz: -130 };`
- tests/ledger-merge.test.ts:3105 — `const wLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3124 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:3141 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-merge.test.ts:3192 — `const kLeg = (g: string) => ({ gkey: g, lkey: '${g}|spread|home|-3', label: "HOME -3", prop: "SPREAD", market: "spread", side: "home", line: -3, cz: -110 });`
- tests/ledger-merge.test.ts:3291 — `const r2Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3401 — `const k3Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3490 — `const k4Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3563 — `const k5Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3606 — `const k6Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -150 });`
- tests/ledger-merge.test.ts:3660 — `const k7Leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3711 — `const fLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:3764 — `const mLeg = (l: string) => ({ lkey: l, label: "OVER 1.5", prop: "batter_hits", market: "hits", side: "over", line: 1.5, cz: -110 });`
- tests/ledger-merge.test.ts:3822 — `const kLeg = (g: string) => ({ gkey: g, lkey: '${g}|spread|home|-3', label: "HOME -3", prop: "SPREAD", market: "spread", side: "home", line: -3, cz: -110 });`
- tests/ledger-merge.test.ts:3861 — `const mLeg = (l: string) => ({ lkey: l, label: "OVER 1.5", prop: "batter_hits", market: "hits", side: "over", line: 1.5, cz: -110 });`
- tests/ledger-merge.test.ts:3914 — `const sLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:4024 — `const qLeg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:4102 — `const leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:4184 — `const leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:4264 — `const leg = { gkey: "g1", lkey: "g1|ml|home|", label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 };`
- tests/ledger-merge.test.ts:4328 — `const leg = (g: string) => ({ gkey: g, lkey: '${g}|ml|home|', label: "HOME ML", prop: "ML", market: "ml", side: "home", line: null, cz: -110 });`
- tests/ledger-merge.test.ts:4552 — `const mLeg = (lkey: string) => ({ lkey, label: '${lkey} over', prop: "batter_hits", cz: -130 });`
- tests/ledger-segments.test.ts:21 — `{ label: "A One", prop: "Hits O 0.5", lkey: "aone|batter_hits|0.5", gkey: "g1", cz: -200, est: "66.0" },`
- tests/ledger-segments.test.ts:22 — `{ label: "B Two", prop: "Hits O 0.5", lkey: "btwo|batter_hits|0.5", gkey: "g2", cz: -150, est: "58.0" },`
- tests/ledger-segments.test.ts:45 — `{ label: "Cleveland Guardians", prop: "ML vs PIT", lkey: "ml_home", gkey: "g3", cz: -145, est: "60.0" },`
- tests/ledger-segments.test.ts:46 — `{ label: "K Guy (SEA)", prop: "Pitcher K's O 5.5", lkey: "kguy|pitcher_strikeouts|5.5", gkey: "g4", cz: -120, est: "55.0" },`
- tests/ledger-segments.test.ts:50 — `funT: [{ id: "f1", stake: 10, legs: [{ label: "HR Guy (NYY)", prop: "HR O 0.5", lkey: "hrguy|batter_home_runs|0.5", gkey: "g4", cz: 400, est: "20.0" }] }],`
- tests/ledger-ticket-tap.test.ts:58 — `const leg = { label: "Jake Mangum (PIT)", prop: "Hits O 0.5", cz: -275, lkey: "jakemangum|batter_hits|0.5", gkey: "pittsburghpirates@cincinnatireds" };`
- tests/leg-settled.test.ts:16 — `* away), while the grade chip is 'gradeFromEv(czEv)' — a threshold on a number computed`
- tests/legacy-harness/int40card.js:29 — `if(p.w.pl.czDec>SH_CFG.coreMaxDec)overCap++;`
- tests/legacy-harness/int40card.js:34 — `print(" $750 card: "+a750.picks.map(function(p){return p.w.pl.name+" "+p.w.pl.czOdds+" $"+p.stake;}).join(" · "));`
- tests/legacy-harness/int40card.js:47 — `f.picks.map(function(p){return SH_CFG.funTierNames[p.tier]+" "+p.w.pl.czOdds+" $"+p.stake+" ("+p.w.pl.prob+"%)";}).join(" · "));`
- tests/legacy-harness/int40card.js:49 — `f.picks.every(function(p){return p.w.pl.czDec!=null&&!core[p.id];}));`
- tests/legacy-harness/int40card.js:53 — `var am=decToAm(p.w.pl.czDec);`
- tests/legacy-harness/int40card.js:55 — `print(" FUN "+SH_CFG.funTierNames[p.tier]+": "+p.w.pl.name+" "+p.w.pl.czOdds+" (am "+am+") true "+p.w.pl.prob+"% ≈1-in-"+Math.round(100/p.w.pl.prob)+" slates"+(p.w.pl.posCorr?…`
- tests/legacy-harness/int40cz.js:7 — `var mlCz=slate.game_odds.filter(function(o){return o.home_ml_cz!=null&&o.away_ml_cz!=null;}).length;` [x3]
- tests/legacy-harness/int40cz.js:8 — `chk("Caesars ML captured per game",mlCz>=8,mlCz+"/"+slate.game_odds.length+" games");` [x2]
- tests/legacy-harness/int40cz.js:9 — `var rlCz=slate.game_odds.filter(function(o){return o.home_rl_cz!=null;}).length;` [x2]
- tests/legacy-harness/int40cz.js:10 — `chk("Caesars RL captured (modal point only)",rlCz>=5,rlCz+" games");` [x2]
- tests/legacy-harness/int40cz.js:11 — `var pRows=0,pCz=0;`
- tests/legacy-harness/int40cz.js:13 — `Object.keys(mks).forEach(function(k){mks[k].forEach(function(r){pRows++;if(r.cz)pCz++;});});});` [x2]
- tests/legacy-harness/int40cz.js:14 — `chk("Caesars prop prices captured",pCz>0,pCz+"/"+pRows+" prop rows have a Caesars quote");` [x2]
- tests/legacy-harness/int40cz.js:22 — `if(r.cz&&r.cz.o!=null&&r.cz.u==null){altHits++;altBooks.push(r.books);}});});` [x3]
- tests/legacy-harness/int40cz.js:29 — `var withCz=0,noCz=0,badgeCz=0,edges=[];` [x3]
- tests/legacy-harness/int40cz.js:31 — `if(r.cz!=null){withCz++;if(r.czBadge)badgeCz++;if(r.czEdge!=null)edges.push(r.czEdge);}` [x6]
- tests/legacy-harness/int40cz.js:32 — `else noCz++;`
- tests/legacy-harness/int40cz.js:33 — `if(r.cz!=null&&(r.czEv==null||r.czOdds==null||r.czKellyF==null))fails.push("cz row missing derived fields: "+r.label);` [x5]
- tests/legacy-harness/int40cz.js:35 — `chk("playable rows carry czEv/czOdds/czKellyF",fails.length===0,withCz+" playable / "+noCz+" not-at-Caesars");` [x5]
- tests/legacy-harness/int40cz.js:36 — `chk("cz price-edge computed",edges.length>0,"sample edges: "+edges.slice(0,5).join(", "));`
- tests/legacy-harness/int40cz.js:39 — `if(r.cz!=null&&r.czEv!=null&&r.ev!=null&&r.czEv>r.ev+0.05)viol++;});});` [x3]
- tests/legacy-harness/int40cz.js:40 — `chk("czEv <= best-price EV (line shopping dominates)",viol===0,viol+" violations");`
- tests/legacy-harness/int40cz.js:42 — `var czTix=0,unavTix=0;`
- tests/legacy-harness/int40cz.js:44 — `if(pl.czOdds!=null){czTix++;if(pl.czDec==null||pl.czEv==null)fails.push("ticket cz missing derived: "+pl.name);}` [x5]
- tests/legacy-harness/int40cz.js:46 — `pl.legs.forEach(function(l){if(!("cz" in l))fails.push("leg missing cz field: "+l.label);});` [x2]
- tests/legacy-harness/int40cz.js:48 — `chk("tickets re-priced at Caesars",czTix>0,czTix+" playable / "+unavTix+" unavailable_at_book");` [x2]
- tests/legacy-harness/int40cz.js:49 — `var sample=(C.all||[]).filter(function(r){return r.cz!=null;})[0];`
- tests/legacy-harness/int40cz.js:50 — `if(sample)print("sample playable pick: "+sample.label+" "+sample.sub+" "+sample.czOdds+" @ Caesars · czEV "+sample.czEv+"% · vs fair "+sample.czEdge+"% · engine EV "+sample.ev+"%…` [x4]
- tests/legacy-harness/int40cz.js:51 — `var st=(d.parlays||[]).filter(function(p){return p.czOdds!=null;})[0];`
- tests/legacy-harness/int40cz.js:52 — `if(st)print("sample playable ticket: "+st.name+" "+st.czOdds+" @ Caesars (best-price "+st.odds+") czEV "+st.czEv+"%");` [x3]
- tests/legacy-harness/int40ledger.js:13 — `{id:"y1",bucket:"core",name:"Hits parlay · 2 legs",type:"batter_hits",tier:"SAFER",stake:12,czOdds:"+120",czDec:2.2,prob:48,czEv:5,confirmed:null,` [x3]
- tests/legacy-harness/int40ledger.js:14 — `legs:[{label:"Ryan McMahon (ATH)",prop:"Hits O 0.5",cz:-250,gkey:"g1",lkey:"ryanmcmahon|batter_hits|0.5",game:"NYY @ TB"},`
- tests/legacy-harness/int40ledger.js:15 — `{label:"Paul Blackburn (ATH)",prop:"Pitcher K's O 2.5",cz:-150,gkey:"g1",lkey:"paulblackburn|pitcher_strikeouts|2.5",game:"NYY @ TB"}]},`
- tests/legacy-harness/int40ledger.js:16 — `{id:"y2",bucket:"core",name:"ML parlay",type:"ml",tier:"SAFER",stake:8,czOdds:"+100",czDec:2.0,prob:50,czEv:2,confirmed:null,` [x3]
- tests/legacy-harness/int40ledger.js:17 — `legs:[{label:"New York Yankees",prop:"ML vs Tampa Bay Rays",cz:-120,gkey:"g1",lkey:"ml_away",game:"NYY @ TB"},`
- tests/legacy-harness/int40ledger.js:18 — `{label:"Ryan McMahon (ATH)",prop:"HR (anytime) O 0.5",cz:300,gkey:"g1",lkey:"ryanmcmahon|batter_home_runs|0.5",game:"NYY @ TB"}]}],`
- tests/legacy-harness/int40ledger.js:20 — `{id:"y3",bucket:"fun",name:"HR stack",type:"batter_home_runs",tier:"BIG",stake:10,czOdds:"+900",czDec:10,prob:9,czEv:-10,confirmed:null,` [x3]
- tests/legacy-harness/int40ledger.js:21 — `legs:[{label:"Richie Palacios (TB)",prop:"Hits O 0.5",cz:-180,gkey:"g1",lkey:"richiepalacios|batter_hits|0.5",game:"NYY @ TB"},`
- tests/legacy-harness/int40ledger.js:22 — `{label:"Paul Blackburn (ATH)",prop:"Pitcher K's U 4.5",cz:-140,gkey:"g1",lkey:"paulblackburn|pitcher_strikeouts|4.5",game:"NYY @ TB"}]}],`
- tests/legacy-harness/int40lock.js:22 — `return t.czOdds&&t.czDec&&t.legs.length>=2&&t.legs.every(function(l){return l.cz!=null&&l.gkey;});}));` [x3]
- tests/legacy-harness/unit40.js:5 — `function T(name,czEv,prob,legs,czDec){return {pl:{name:name,type:"MIX",czEv:czEv,ev:czEv,prob:prob,czDec:czDec||2,czOdds:"+100",fair:null,` [x8]
- tests/legacy-harness/unit40.js:6 — `legs:legs.map(function(l){return {label:l[0],prop:l[1],game:l[2],cz:-110,odds:"-110",live:false};})},src:"p",idx:0};}`
- tests/legacy-harness/unit40.js:48 — `function TF(name,czDec,prob,posCorr,negCorr){var t=T(name,5,prob,[[name+"A","x","g_"+name],[name+"B","y","g_"+name]],czDec);` [x2]
- tests/legacy-harness/unit40.js:99 — `P[0].pl.legs[0]={label:"Judge",prop:"HR O 0.5",game:"g1",cz:-110,odds:"-110",live:false}; /* clashes with core */`
- tests/legacy-harness/unit40.js:139 — `var eN={date:"2026-07-10",locked:true,lockedAt:1,daily:20,fun:10,core:[{id:"t1",stake:20,czOdds:"+200",czDec:3,legs:[]}],funT:[],games:{},grading:null,clv:{}};` [x2]
- tests/legacy-harness/unit40grade.js:11 — `function L(lkey,prop){return {label:"X",prop:prop,lkey:lkey,gkey:"g1",cz:-110};}`
- tests/legacy-harness/unit40grade.js:40 — `function TL(res,cz){return {label:"L"+cz,prop:"Hits O 0.5",cz:cz,lkey:"x|batter_hits|0.5",gkey:"g1"};}` [x4]
- tests/legacy-harness/unit40grade.js:42 — `var t600={id:"t",stake:10,czDec:7.0,confirmed:null,legs:[TL(0,150),TL(0,120),TL(0,133)]};`
- tests/legacy-harness/unit40grade.js:55 — `var tConf={id:"t2",stake:10,czDec:7.0,confirmed:800,legs:[TL(0,150),TL(0,120)]};`
- tests/legacy-harness/unit40grade.js:62 — `core:[{id:"c1",bucket:"core",name:"t",stake:10,czOdds:"-110",czDec:1.909,prob:55,confirmed:null,` [x2]
- tests/legacy-harness/unit40grade.js:63 — `legs:[{label:"A",prop:"Hits O 0.5",cz:-110,gkey:"g1",lkey:"a|batter_hits|0.5"}]}],`
- tests/lid-coupling.test.ts:114 — `czDec: 2.5,`
- tests/lid-coupling.test.ts:115 — `czOdds: "+150",`
- tests/lid-coupling.test.ts:116 — `czEv: 8,`
- tests/lid-coupling.test.ts:119 — `consCzEv: 5,`
- tests/lid-coupling.test.ts:128 — `cz: 120, bs: 120, imp: 42, booksInd: 3,`
- tests/live-board-reason.test.ts:164 — `vi.mock("@/lib/cz-offered", () => ({`
- tests/live-board-reason.test.ts:165 — `useCzHidden: () => ({ hidden: {}, isHidden: () => false, toggle: () => {}, reset: () => {}, count: 0 }),`
- tests/live-board-reason.test.ts:183 — `odds: -145, czOdds: -145, czEv: 12.4, prob: 78.2, implied: 59.2, edge: 19, czKellyF: 0.02, books: 7,` [x3]
- tests/live-board-reason.test.ts:208 — `gkey: GKEY, lkey: LKEY, czAm: -145, oppAm: 115, bsAm: -150, bsBk: "draftkings", books: 6,`
- tests/live-board-reason.test.ts:209 — `fO: 58.4, pLive: 0.41, pSrc: "sim", evCz: 2.7, evOpp: -6.1, ln: 3.5,`
- tests/live-production-proof.test.ts:9 — `…'anytime_td'],legs:4,legMinAm:-215,legMaxAm:5000,payout:null,sides:'o',onePerGame:true,czOnly:false,includeStarted:true,modelOnly:false,pinned:[null,null,null,null],phase:'live',be…`
- tests/live-production-proof.test.ts:11 — `const opts={mode:'cz' as const,nowMs:Date.parse(board.generatedAt)+1000,pricedAt:board.pricedAt,teamOf:(r:any)=>r.teamAbbr,quoteOf:propQuote,legOf:propLegOf};`
- tests/lock-card.test.ts:109 — `const core = entry.core as { stake: number; forced?: boolean; czDec?: number | null; bsDec?: number | null }[];`
- tests/lock-card.test.ts:117 — `for (const t of core) expect(Math.max(Number(t.czDec ?? 0), Number(t.bsDec ?? 0))).toBeLessThanOrEqual(1.75);`
- tests/lock-card.test.ts:179 — `const leg = (label: string, prop = "Hits O 0.5") => ({ label, prop, lkey: '${label}|batter_hits|0.5', cz: -110, gkey: 'g-${label[0]}' });`
- tests/lock-card.test.ts:181 — `pl: { name, type: "parlay", prob: 45, probRaw: 50, czEv: 3, czEvRaw: 4, czDec: dec, bsDec: dec, legs: labels.map((l) => leg(l)), ...extra },` [x3]
- tests/lock-card.test.ts:599 — `legs: labels.map((l) => ({ label: l, prop: "Hits O 0.5", lkey: '${l}|batter_hits|0.5', cz: -110, gkey: "g-1" })),`
- tests/lock-card.test.ts:678 — `const core = entry.core as { stake: number; shapeSlot?: number; forced?: boolean; czDec?: number | null; bsDec?: number | null; prob?: number | null; probRaw?: number | null; c…` [x2]
- tests/lock-card.test.ts:690 — `expect(Number(t.czDec), "a core ticket priced above its slot ceiling").toBeLessThanOrEqual(ceil);`
- tests/lock-card.test.ts:698 — `expect("czEvRaw" in t).toBe(true);`
- tests/lock-card.test.ts:711 — `/* MEASURED on this fixture: the CZ-priced Hits O 0.5 rows span only 2 teams (WSH,`
- tests/lock-card.test.ts:712 — `NYY) and no HRR row carries a CZ price, so the ladder cannot seat and the $25`
- tests/lock-price-age.test.ts:9 — `* re-fetch, and shTicketSnap writes czOdds/czDec straight into the append-only ledger.` [x2]
- tests/m25-archive.test.ts:36 — `function kellyFrac(prob: unknown, czDec: unknown): number | null {`
- tests/m25-archive.test.ts:38 — `const d = Number(czDec);`
- tests/m25-archive.test.ts:61 — `].filter((p) => p.czDec != null);`
- tests/m25-archive.test.ts:76 — `const f = kellyFrac(t.pl.prob, t.pl.czDec);`
- tests/m25-archive.test.ts:79 — `if (Number(t.pl.czEv) < 0) negEv++;`
- tests/m25-archive.test.ts:85 — `' over-ceiling ${over} $0-ceiling ${zero} negative-czEv ${negEv}',`
- tests/mirrored-constants.test.ts:94 — `literal: /t\["czEv"\] >= (\d+)/,`
- tests/mirrored-constants.test.ts:106 — `literal: /t\["czDec"\] > (\d+)/,`
- tests/mlb-live-props-route.test.ts:197 — `czAm: -145,`
- tests/mlb-live-props-route.test.ts:205 — `evCz: -5.39,`
- tests/mlb-live-props-route.test.ts:457 — `expect(q.czAm).toBe(-145);`
- tests/mlb-live-props-route.test.ts:465 — `expect(q.evCz).toBeCloseTo(-5.39, 2); // a market fair against the market's own price: no edge`
- tests/mlb-live-props-route.test.ts:474 — `expect(q.czAm).toBe(128);`
- tests/mlb-live-props-route.test.ts:492 — `expect(q.czAm).toBeNull(); // no settle-book price`
- tests/mlb-live-props-route.test.ts:494 — `expect(q.evCz).toBeNull(); // ...so no EV, rather than an EV against a price Josh cannot bet`
- tests/mlb-live-props-route.test.ts:748 — `expect(solo?.czAm).toBeNull();`
- tests/mlb-live-props-route.test.ts:751 — `it("settles on Caesars: the settle book decides the tie and owns czAm", () => {`
- tests/mlb-live-props-route.test.ts:755 — `expect(s?.czAm).toBe(128);`
- tests/mlb-live-props-route.test.ts:760 — `expect(dkSettles?.czAm).toBe(-138);`
- tests/mlb-live-props-route.test.ts:853 — `'evCz' on an Under row showed the opposite bet's edge with the sign kept: a losing Under`
- tests/mlb-live-props-route.test.ts:864 — `expect(soto.czAm).toBe(128);`
- tests/mlb-live-props-route.test.ts:865 — `expect(soto.evCz).not.toBe(soto.evOpp);`
- tests/mlb-live-props-route.test.ts:873 — `expect(q.czAm).toBeNull();`
- tests/mlb-live-props-route.test.ts:874 — `expect(q.evCz).toBeNull();`
- tests/mlb-live-rules.test.ts:301 — `czAm: -145,`
- tests/mlb-live-rules.test.ts:309 — `evCz: -0.4,`
- tests/mlb-live-tick.test.ts:180 — `expect(SHARP).not.toMatch(/live\.czAm|live\.evCz/);` [x2]
- tests/mlb-market-phases.test.ts:12 — `const row:PropBoardRow={p:"Test Hitter",tm:"NYY",ln:.5,lkey:"testhitter|batter_hits|0.5",o:-120,u:100,oBook:"Caesars",uBook:"Caesars",cz:{o:-120,u:100},pO:70,fO:55,books:2};`
- tests/mlb-market-phases.test.ts:14 — `const overlay={rows:{["g|"+row.lkey]:{gkey:"g",lkey:row.lkey,ln:1.5,czAm:150,oppAm:-170,pLive:.4,pSrc:"market",fO:.4,books:2,at}}} as unknown as MlbLiveQuoteBoard;`
- tests/mlb-market-phases.test.ts:17 — `…ec={market:"batter_hits",phase:"mixed",legs:2,legMinAm:-250,legMaxAm:200,payout:null,sides:"o",onePerGame:true,czOnly:false,includeStarted:true,modelOnly:false,pinned:[null,null]};`
- tests/mlb-market-phases.test.ts:32 — `const o=structuredClone(overlay);Object.assign(Object.values(o.rows)[0],{czAm:null,oppAm:null});`
- tests/mlb-market-phases.test.ts:58 — `const captured=attachBookQuotes(data,[event],'williamhill_us');/* the row's cz is Caesars-priced */expect(captured.categories).toStrictEqual(data.categories); // the settle-book …`
- tests/mlb-market-phases.test.ts:60 — `const r=captured.propBoard![0].markets[market][0];expect(r.pO).toBeNull();expect(r.fO).toBeGreaterThan(0);expect(r.tm).toBe("NYY");expect(r.cz?.o).toBe(-120);`
- tests/mlb-market-phases.test.ts:61 — `expect(priceMlbBoard(captured,"draftkings").propBoard![0].markets[market][0].cz?.o).toBe(130);`
- tests/mlb-market-phases.test.ts:128 — `expect(r.cz).toEqual(quotes[book]);expect(r.o).toBe(quotes[book].o);expect(r.ln).toBe(1.5);expect(r.fO).toBe(40);`
- tests/mobile-density.test.ts:209 — `expect(card).toMatch(/className=\{'pick-ticket glass px-3 py-1\.5 \$\{Number\(t\.czEv\) > 0 \? "ev-glow" : ""\}'\}/);`
- tests/my-parlay.test.ts:29 — `const c = combineTicket([{ cz: -273, prob: 73.9 }, { cz: -240, prob: 70.4 }])!;` [x2]
- tests/my-parlay.test.ts:71 — `const c = combineTicket([{ cz: -273, prob: 73.9 }, { cz: -240, prob: 70.4 }])!;` [x2]
- tests/my-parlay.test.ts:105 — `expect(s).toContain("odds: liveAmOf(r) ?? parseAm(r.czOdds),");`
- tests/nfl-engine.test.ts:104 — `expect(r.cz).not.toBeNull();`
- tests/nfl-engine.test.ts:106 — `expect(r.cz!.book).toBe(NFL_MODEL.settleBook);`
- tests/nfl-engine.test.ts:167 — `expect(l.cz).toBe(r.cz!.price);` [x2]
- tests/nfl-engine.test.ts:168 — `// prob is the model's win probability at the Caesars line (re-evaluated when cz's line differs from the consensus)`
- tests/nfl-engine.test.ts:171 — `expect(r.evCz!).toBeGreaterThanOrEqual(NFL_RULES.forcedMinEvPct);`
- tests/nfl-engine.test.ts:188 — `expect(t.czDec).toBeLessThanOrEqual(NFL_RULES.maxDec + 1e-9);`
- tests/nfl-lock-route.test.ts:81 — `* vig is on top the best 'evCz' on every one of the 13 games is NEGATIVE (max −0.72, measured).`
- tests/nfl-lock-route.test.ts:100 — `.filter((r) => r.market === "ml" && r.playable && r.cz != null && r.push === 0)`
- tests/nfl-lock-route.test.ts:104 — `const evCz = Math.round((fav.fair * dec - 1) * 10000) / 100;`
- tests/nfl-lock-route.test.ts:105 — `if (evCz < NFL_RULES.minEvPct) return g;`
- tests/nfl-lock-route.test.ts:107 — `return { ...g, rows: g.rows.map((r) => (r === fav ? { ...r, cz: { ...r.cz!, price: decToAm(dec), dec }, evCz } : r)) };` [x3]
- tests/nfl-lock-route.test.ts:192 — `for (const g of board.games) expect(g.rows.some((r) => r.playable && r.cz != null && r.evCz != null), '${g.id} unpriced').toBe(true);` [x2]
- tests/nfl-lock-route.test.ts:405 — `// THE MONEY on the captured fixture: zero core (measured: best evCz per game −0.72 … −3.31), one $25 fun parlay`
- tests/nfl-lock-route.test.ts:414 — `expect(e.funT[0].czDec).toBeGreaterThanOrEqual(NFL_RULES.fun.minDec);`
- tests/nfl-lock-route.test.ts:415 — `expect(e.funT[0].czDec).toBeLessThanOrEqual(NFL_RULES.fun.maxDec);`
- tests/nfl-lock-route.test.ts:421 — `const best = Math.max(...g.rows.filter((r) => r.playable && r.cz != null && r.evCz != null).map((r) => r.evCz as number));` [x3]
- tests/nfl-lock-route.test.ts:460 — `expect(t.czEv).toBeGreaterThanOrEqual(NFL_RULES.minEvPct);`
- tests/nfl-lock-route.test.ts:461 — `expect(t.czDec).toBeLessThanOrEqual(NFL_RULES.maxDec);`
- tests/nfl-lock-route.test.ts:704 — `core: [{ id: 'cfb-${DATE}-core-1', bucket: "core", name: "SINGLE · Device ML", stake: 20, czOdds: -150, czDec: 1.6667, prob: 66, czEv: 3, legs: [] }],` [x3]
- tests/nfl-money-ui.test.ts:234 — `expect(cfbLegLink({ ...leg, lkey: "l1", prop: "spread", cz: -110, teamId: null } as never, { date: "2026-09-13", today: "2026-09-13", league: "nfl" }).href).toBe(href);`
- tests/nfl-props-route.test.ts:180 — `expect(NFL_PROPS.czMissingRevalidateSec).toBe(CFB_PROPS.czMissingRevalidateSec);` [x2]
- tests/nfl-props-route.test.ts:181 — `expect(NFL_PROPS.czMissingWindowSec).toBe(CFB_PROPS.czMissingWindowSec);` [x2]
- tests/nfl-store.test.ts:74 — `czOdds: -110,`
- tests/nfl-store.test.ts:75 — `czDec: 1.909,`
- tests/nfl-store.test.ts:77 — `czEv: 5,`
- tests/nfl-store.test.ts:78 — `legs: [{ label: "Test ML", prop: "ML", cz: -110, gkey, lkey: '${gkey}|ml|home|', market: "ml", side: "home", line: null, teamId: null, prob: 0.55, push: 0 }],`
- tests/nfl-sunday-paper.test.ts:29 — `expect(build({...board,games:board.games.map(g=>({...g,rows:g.rows.map(r=>({...r,cz:null}))}))}).coreSum).toBe(0);`
- tests/nfl-sunday-paper.test.ts:38 — `const c=build({...board,games:board.games.slice(0,1)});expect(c.core[0].czEv).toBeLessThan(2);`
- tests/nfl-variety-paper.test.ts:15 — `…s",side:"over",player:'Player ${i}',label:'Player ${i} O 4.5 Receptions',teamId:g.home.id,line:4.5,fair:.53,evCz:6,cz:{book:"draftkings",price:100,line:4.5,dec:2}} as CfbPropRow));` [x2]
- tests/nfl-variety-paper.test.ts:20 — `…12"},{...props,rows:rows.map(r=>({...r,teamId:null}))},{...props,rows:rows.map(r=>({...r,cz:null}))}]){const c=build(p);expect(c.coreSum).toBe(350);expect(c.core.every(t=>!t.legs[0…`
- tests/outs-suspension-coupling.test.ts:29 — `* ({susp, watch, bsBadge, czBadge, edgeBadge}) on pitcher_outs rows, and only there.`
- tests/outs-suspension-coupling.test.ts:100 — `const TAG_FIELDS = ["susp", "watch", "bsBadge", "czBadge", "edgeBadge"];`
- tests/outs-suspension-coupling.test.ts:191 — `for (const b of ["bsBadge", "czBadge", "edgeBadge"]) {`
- tests/paper-card-view.test.ts:28 — `id: "t1", stake: 35, name: "TB single", type: "batter_total_bases", czOdds: "-120", czDec: 1.83, prob: 62.1, czEv: 7.5,` [x3]
- tests/paper-card-view.test.ts:30 — `legs: [{ lkey: "p|batter_total_bases|1.5", label: "Judge (NYY)", prop: "TB O 1.5", cz: -120 }],`
- tests/paper-card-view.test.ts:33 — `id: "t2", stake: 10, name: "Hits parlay", type: "batter_hits", czOdds: "+140", czDec: 2.4, prob: 41, czEv: -12.8,` [x3]
- tests/paper-card-view.test.ts:35 — `legs: [{ lkey: "a|batter_hits|0.5", label: "A (SEA)", prop: "Hits O 0.5", cz: -300 }],`
- tests/paper-card-view.test.ts:40 — `id: "f1", stake: 5, name: "HR Longshot · 4 hitters, 4 teams", type: "fun_hr", czOdds: "+2350", czDec: 24.5, prob: 0.9, czEv: -3,` [x3]
- tests/paper-card-view.test.ts:42 — `legs: [{ lkey: "x|batter_home_runs|0.5", label: "X (TEX)", prop: "HR O 0.5", cz: 320 }],`
- tests/paper-deficit.test.ts:21 — `* first pitch — a thin CZ-playable pool at fire time was final for the day.`
- tests/paper-deficit.test.ts:374 — `const leg = (label: string, prop: string) => ({ label, prop, lkey: '${label}|x|1', cz: -110 });`
- tests/paper-deficit.test.ts:385 — `{ pl: { name: "Gated 9", czEv: 2, type: "parlay", prob: 10, czDec: 8, bsDec: 8, legs: four("Gate") } },` [x2]
- tests/paper-deficit.test.ts:386 — `{ pl: { name: "Forced seat", czEv: 1, type: "parlay", prob: 9, czDec: 8, bsDec: 8, legs: four("Force") } },` [x2]
- tests/parity.test.ts:66 — `it("board carries the additive layers the UI needs (cz prices, gameInfo)", async () => {`
- tests/parity.test.ts:74 — `const withCz = rows.filter((r) => r.cz != null);` [x2]
- tests/parity.test.ts:75 — `expect(withCz.length).toBeGreaterThan(0);`
- tests/parity.test.ts:76 — `for (const r of withCz) {`
- tests/parity.test.ts:77 — `expect(r.czOdds, 'czOdds on ${r.label}').not.toBeNull();` [x2]
- tests/parity.test.ts:78 — `expect(r.czEv, 'czEv on ${r.label}').not.toBeNull();` [x2]
- tests/parity.test.ts:81 — `const czTix = [...d.parlays, ...d.parlaysMixed].filter((t) => t.czOdds != null);` [x2]
- tests/parity.test.ts:82 — `expect(czTix.length).toBeGreaterThan(0);`
- tests/parlay-exclusions.test.ts:7 — `…batter_hits_runs_rbis", legs:2, legMinAm:-1000, legMaxAm:1000, payout:null, sides:"both", onePerGame:false, czOnly:false, includeStarted:true, modelOnly:false, pinned:[null,null]};`
- tests/parlay-gen-mix.test.ts:14 — `payout: null, sides: "o", onePerGame: true, czOnly: true, includeStarted: false, modelOnly: false,`
- tests/parlay-gen-multi.test.ts:34 — `czOnly: false,`
- tests/parlay-gen-reorder.test.ts:49 — `czOnly: false,`
- tests/parlay-gen-setup.test.ts:5 — `payout: null, sides: "o", onePerGame: true, onePerTeam: true, czOnly: false, modelOnly: false, includeStarted: false,`
- tests/parlay-gen-team.test.ts:50 — `onePerGame: false, onePerTeam: true, czOnly: false, pricingBook: "CZ", includeStarted: false, modelOnly: false,` [x2]
- tests/parlay-gen-team.test.ts:159 — `onePerGame: true, onePerTeam: true, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null], ...o,`
- tests/parlay-gen-ui.test.ts:75 — `czOnly: false,`
- tests/parlay-gen-ui.test.ts:192 — `for (const l of RESULT.ticket.legs) expect(out).toContain(amFmt(l.leg.cz));`
- tests/parlay-gen-ui.test.ts:256 — `expect(POOL.legs.some((l) => l.leg.cz === near)).toBe(true); // a real posted price, not a computed one`
- tests/parlay-gen-ui.test.ts:414 — `const spec = { ...SPEC, sides: "u" as const, czOnly: true, pricingBook: "CZ", modelOnly: true }; // the fixture pool predates INSTRUCTION 67 (Caesars-priced)` [x2]
- tests/parlay-gen-ui.test.ts:415 — `const eligible = POOL.legs.filter((l) => l.side === "u" && l.book === "CZ" && l.src === "model").sort((a, b) => a.dec - b.dec);`
- tests/parlay-gen.test.ts:66 — `czOnly: false,`
- tests/parlay-gen.test.ts:67 — `pricingBook: "CZ", // tests/fixtures/gen-pool.json predates INSTRUCTION 67: its rows are Caesars-priced`
- tests/parlay-gen.test.ts:363 — `const noCz = bagOf(`
- tests/parlay-gen.test.ts:364 — `full.legs.filter((l) => l.book !== "CZ"),`
- tests/parlay-gen.test.ts:367 — `expect(noCz.legs.length).toBeGreaterThan(3);`
- tests/parlay-gen.test.ts:368 — `const s = spec({ market: HITS, sides: "both", legs: 3, czOnly: true, onePerGame: false });`
- tests/parlay-gen.test.ts:370 — `expect(fail(generate(noCz, s, 1))).toMatchObject({ code: "short-pool", have: 0, want: 3, relax: "cz" });` [x2]
- tests/parlay-gen.test.ts:382 — `const posted = pool.legs.map((l) => l.leg.cz);`
- tests/parlay-gen.test.ts:499 — `const posted = board.flatMap((g) => g.markets["batter_home_runs"] ?? []).filter((r) => r.u != null || r.cz?.u != null);`
- tests/parlay-gen.test.ts:513 — `const cz = ok(generate(both, spec({ ...wide, czOnly: true }), 5));` [x2]
- tests/parlay-gen.test.ts:514 — `for (const l of cz.legs) expect(l.book).toBe("CZ");` [x2]
- tests/parlay-gen.test.ts:550 — `expect(l.dec).toBe(amToDec(l.leg.cz));`
- tests/parlay-gen.test.ts:716 — `expect(l.am).toBe(l.leg.cz);`
- tests/parlay-gen.test.ts:756 — `["philadelphiaphillies@detroittigers|bryceharper|batter_hits_runs_rbis|1.5|u", -110, 52.7, "u", "Bryce Harper (PHI)", "H+R+RBI Under 1.5", "CZ", "model"],`
- tests/parlay-gen.test.ts:768 — `expect(l.am).toBe(l.leg.cz);`
- tests/pick-positions.test.ts:182 — `…s", legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o", onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null] };`
- tests/pick-positions.test.ts:384 — `sportsbook-hide keys migrated by migrateCzHidden) — so the Pick cell draws it as it is and it gets its tag */`
- tests/picks-surface.test.ts:71 — `it("EVERY PICK POSTS (2026-08-09, Josh's call): no cz-null holdback; only his ⓘ toggle hides, and it is reversible", () => {`
- tests/picks-surface.test.ts:75 — `expect(src).toMatch(/useCzHidden\(/);`
- tests/picks-surface.test.ts:76 — `expect(src).toMatch(/CzInfo/);`
- tests/picks-surface.test.ts:78 — `const czInfo = fs.readFileSync(path.join(process.cwd(), "src/components/ui/CzInfo.tsx"), "utf8");` [x2]
- tests/picks-surface.test.ts:79 — `expect(czInfo).toMatch(/Is this pick offered at the selected sportsbook right now\?/);`
- tests/prediction-idempotency.test.ts:50 — `book: "CZ",`
- tests/prediction-idempotency.test.ts:51 — `cz: -110,`
- tests/prediction-idempotency.test.ts:52 — `czEv: 1,`
- tests/predictions.test.ts:82 — `cz: null,`
- tests/predictions.test.ts:83 — `czEv: null,`
- tests/prop-board.test.ts:23 — `markets: Record<string, { p: string; ln: number | null; o: number | null; u: number | null; cz?: { o: number | null; u: number | null } | null }[]>;`
- tests/prop-board.test.ts:60 — `(r) => r.ln != null && (r.o != null || r.u != null || r.cz),`
- tests/prop-board.test.ts:84 — `for (const r of extra) expect(r.cz?.o != null || r.o != null).toBe(true);`
- tests/prop-board.test.ts:100 — `expect(r.o != null || r.u != null || r.cz?.o != null || r.cz?.u != null).toBe(true);` [x2]
- tests/prop-board.test.ts:133 — `const cz = hr.filter((r) => r.cz?.o != null);` [x2]
- tests/prop-board.test.ts:134 — `expect(cz.length).toBeGreaterThan(0);`
- tests/prop-board.test.ts:135 — `for (const r of cz) expect(typeof r.cz!.o).toBe("number");` [x2]
- tests/prop-board.test.ts:146 — `for (const r of cats) expect(r).toHaveProperty("czEv");`
- tests/prop-board.test.ts:162 — `const cz = body.bookmakers.find((b) => b.key === "williamhill_us" && b.markets.some((m) => m.key === "batter_hits_alternate"))!;`
- tests/prop-board.test.ts:163 — `const ladder = cz.markets.find((m) => m.key === "batter_hits_alternate")!;`
- tests/prop-board.test.ts:181 — `expect(rung!.cz?.o).toBe(850);`
- tests/prop-lean.test.ts:57 — `expect(bookTag("caesars")).toBe("CZ");`
- tests/prop-lean.test.ts:63 — `const row = (o: number | null, u: number | null, cz: { o: number | null; u: number | null } | null) => ({ cz, o, u, oBook: "fanduel", uBook: "draftkings", settlementBook: "draftk…` [x2]
- tests/prop-lean.test.ts:92 — `const side = (side: CfbPropRow["side"], cz: ReturnType<typeof q> | null, best: ReturnType<typeof q> | null, line = 245.5): CfbPropRow =>`
- tests/prop-lean.test.ts:93 — `({ key: 'g1|pass_yds|ty-simpson|${side}|${line}', gameId: "g1", market: "pass_yds", side, player: "Ty Simpson", line, cz, best } as unknown as CfbPropRow);`
- tests/prop-lean.test.ts:95 — `const l = footballPropLean([side("over", q("draftkings", -130, 245.5), null), side("under", q("draftkings", +110, 245.5), null)], "cz")!;`
- tests/prop-lean.test.ts:100 — `expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 245.5), null)], "cz")!.side).toBe("even");`
- tests/prop-lean.test.ts:103 — `expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 249.5), null)], "cz")).toBeNull();`
- tests/prop-lean.test.ts:106 — `expect(footballPropLean([side("yes", q("draftkings", +140, null), null)], "cz")).toBeNull();`
- tests/prop-lean.test.ts:110 — `const idx = footballLeanIndex(rows, "cz");`
- tests/prop-lean.test.ts:157 — `expect(fb).toMatch(/footballLeanIndex\(propRows, "cz"\)/);`
- tests/props-model.test.ts:22 — `* logic change (the under-side 100−% flip, CZ-before-feed price precedence,`
- tests/props-model.test.ts:39 — `cz: null,`
- tests/props-model.test.ts:71 — `expect(bookAb("William Hill (US)")).toBe("CZ");`
- tests/props-model.test.ts:72 — `expect(bookAb("caesars")).toBe("CZ");`
- tests/props-model.test.ts:82 — `const r = row({ cz: { o: -120, u: 100 } });`
- tests/props-model.test.ts:83 — `expect(sidePrice(r, "o")).toEqual({ am: -120, book: "CZ" });`
- tests/props-model.test.ts:84 — `expect(sidePrice(r, "u")).toEqual({ am: 100, book: "CZ" });`
- tests/props-model.test.ts:87 — `const r = row({ cz: { o: -120, u: null } });`
- tests/props-model.test.ts:88 — `expect(sidePrice(r, "o")).toEqual({ am: -120, book: "CZ" });`
- tests/props-model.test.ts:98 — `expect(sidePrice(row({ o: null, oBook: null, cz: { o: null, u: -110 } }), "o")).toBeNull();`
- tests/props-model.test.ts:130 — `cz: -105,`
- tests/props-model.test.ts:137 — `it("the HR over leg: id keyed by gkey, sub 'HR Anytime HR', CZ price, model %", () => {`
- tests/props-model.test.ts:138 — `const leg = playerLeg(row({ ln: 0.5, lkey: "bal-henderson-hr", cz: { o: 380, u: null }, u: null, uBook: null }), "batter_home_runs", "o", "G", "g1");`
- tests/props-model.test.ts:139 — `expect(leg).toMatchObject({ id: "g1|bal-henderson-hr|o", sub: "HR Anytime HR", cz: 380, book: "CZ", prob: 58.2, src: "model" });` [x2]
- tests/props-model.test.ts:163 — `cz: { o: -140 },`
- tests/props-model.test.ts:174 — `const o = oppRow(pick({ opp: { label: "Baltimore Orioles", cz: 120, prob: 42, lkey: "ml-away" } }));`
- tests/props-model.test.ts:175 — `expect(o).toMatchObject({ label: "Baltimore Orioles", sub: "ML vs New York Yankees", cz: 120, prob: 42, lkey: "ml-away", game: pick().game, gkey: "g1" });`
- tests/props-model.test.ts:178 — `const o = oppRow(pick({ lkey: "rl-home", sub: "RL -1.5", opp: { label: "Baltimore Orioles", cz: -150, prob: 55, pt: 1.5, lkey: "rl-away" } }));`
- tests/props-model.test.ts:189 — `const homePick = pick({ opp: { label: "Baltimore Orioles", cz: 120, prob: 42, lkey: "ml-away" } });`
- tests/props-model.test.ts:191 — `const awayPick = pick({ label: "Baltimore Orioles", lkey: "ml-away", opp: { label: "New York Yankees", cz: -140, prob: 58, lkey: "ml-home" } });`
- tests/props-team-filter.test.ts:48 — `cz: null,`
- tests/props-team-filter.test.ts:204 — `({ game, gkey, label, lkey, sub: "ML", cz: -120, prob: 55 }) as unknown as PickRow;`
- tests/props-ui.test.ts:49 — `expect(games).toMatch(/amFmt\(cz\)/);`
- tests/props-ui.test.ts:51 — `expect(slip).toMatch(/amFmt\(l\.cz\)/);`
- tests/self-reading.test.ts:32 — `czDec: 4.1,`
- tests/self-reading.test.ts:33 — `czEv: 0.27,`
- tests/self-reading.test.ts:39 — `{ lkey: "a|batter_hits|0.5", label: "A over", prop: "batter_hits", cz: 1.4 },`
- tests/self-reading.test.ts:40 — `{ lkey: "b|batter_total_bases|1.5", label: "B over", prop: "batter_total_bases", cz: 1.9 },`
- tests/self-reading.test.ts:70 — `const single = ticket({ id: "s1", name: "C single", type: "single", stake: 5, czDec: 2.05, czEv: 0.04, legs: [{ lkey: "c|batter_home_runs|0.5", label: "C over", prop: "batter_h…` [x3]
- tests/self-reading.test.ts:85 — `const bad = ticket({ id: "s1", name: "D single", stake: 5, czDec: 2.1, legs: [{ lkey: "d|batter_hits|0.5", label: "D over", prop: "batter_hits", cz: 1.95 }] });` [x2]
- tests/self-reading.test.ts:88 — `expect(r.singlesVsLeg.mismatches).toEqual([{ name: "D single", ticketDec: 2.1, legCz: 1.95 }]);`
- tests/self-reading.test.ts:93 — `// the real first live single: ticket czDec 1.6757, leg cz -148 (American) — −148 ≡ 1+100/148` [x2]
- tests/self-reading.test.ts:94 — `const ks = ticket({ id: "s1", name: "K's single", stake: 2, czDec: 1.6757, legs: [{ lkey: "p|pitcher_strikeouts|5.5", label: "P over", prop: "pitcher_strikeouts", cz: -148 }] }…` [x2]
- tests/self-reading.test.ts:100 — `const ks2 = ticket({ id: "s2", name: "dog single", stake: 2, czDec: 2.4, legs: [{ lkey: "q|batter_hits|0.5", label: "Q over", prop: "batter_hits", cz: 140 }] });` [x2]
- tests/self-reading.test.ts:103 — `// a cz in no known unit is UNCHECKABLE, counted, never guessed`
- tests/self-reading.test.ts:104 — `const odd = ticket({ id: "s3", name: "odd single", stake: 2, czDec: 1.9, legs: [{ lkey: "r|batter_hits|0.5", label: "R over", prop: "batter_hits", cz: 60 }] });` [x2]
- tests/sgp-joint.test.ts:87 — `if (t.czDec != null && Number(t.prob) > 0) {`
- tests/sgp-joint.test.ts:88 — `// czEv was computed from the UNROUNDED corrected probability; the stored prob is`
- tests/sgp-joint.test.ts:89 — `// rounded to 0.1pp, so the reconstruction can drift by up to 0.05pp x czDec`
- tests/sgp-joint.test.ts:90 — `const expected = ((Number(t.prob) / 100) * t.czDec - 1) * 100;`
- tests/sgp-joint.test.ts:91 — `expect(Math.abs(Number(t.czEv) - expected)).toBeLessThanOrEqual(0.05 * t.czDec + 0.15);` [x2]
- tests/shrink.test.ts:21 — `const pl = { prob: 60, czDec: 2, bsDec: 2.1, czEv: 20, bsEv: 26, legs: [leg(60, 50)] };` [x2]
- tests/shrink.test.ts:31 — `const pl = { prob: 60, czDec: 2, legs: [leg(60, 50)] };`
- tests/shrink.test.ts:37 — `const pl = { prob: 30, czDec: 3, legs: [leg(60, null), leg(50, 0), leg(50, Number.NaN as unknown as number), leg(50, 40)] };`
- tests/shrink.test.ts:49 — `const pl = { prob: 36, probNaive: 30, simJoint: true, czDec: 4, legs: [leg(60, 50), leg(50, 40)] };`
- tests/shrink.test.ts:57 — `it("recomputes czEv / bsEv / ev from the shrunk prob at the ticket's own prices and keeps the raw EVs", () => {`
- tests/shrink.test.ts:58 — `const pl = { prob: 60, czDec: 2, bsDec: 2.2, dec: 2.1, czEv: 20, bsEv: 32, ev: 26, legs: [leg(60, 50)] };` [x2]
- tests/shrink.test.ts:60 — `expect(out.czEv).toBeCloseTo((0.55 * 2 - 1) * 100, 6);`
- tests/shrink.test.ts:63 — `expect(out.czEvRaw).toBe(20);`
- tests/shrink.test.ts:72 — `const pl = { prob: 60, czDec: 2, bsDec: null, czEv: 20, bsEv: null, legs: [leg(60, 50)] };` [x2]
- tests/shrink.test.ts:75 — `expect(out.czEv).toBeCloseTo(10, 6);`
- tests/shrink.test.ts:80 — `const pl = { prob: 60, czDec: 2, czEv: 20, legs };` [x2]
- tests/shrink.test.ts:86 — `expect(shrinkTicket({ prob: 100, czDec: 1.5, legs: [leg(50, 90)] }, 0.5).prob).toBeLessThanOrEqual(100);`
- tests/shrink.test.ts:87 — `expect(shrinkTicket({ prob: 0, czDec: 1.5, legs: [leg(50, 90)] }, 0.5).prob).toBe(0);`
- tests/singles-counterfactual.test.ts:37 — `* czDec = amToDec(leg.cz) czEv = prob*czDec - 1` [x4]
- tests/singles-counterfactual.test.ts:40 — `* consCzEv = consP*czDec - 1` [x2]
- tests/singles-counterfactual.test.ts:72 — `const czDec = amToDec(num(r.cz));` [x2]
- tests/singles-counterfactual.test.ts:81 — `cz: num(r.cz), bs: num(r.bs), bsBook: r.bsBook ?? null,` [x2]
- tests/singles-counterfactual.test.ts:90 — `czDec: czDec != null ? Math.round(czDec * 10000) / 10000 : null,` [x3]
- tests/singles-counterfactual.test.ts:91 — `czEv: czDec != null ? r1(prob * czDec - 1) : null,` [x3]
- tests/singles-counterfactual.test.ts:95 — `consCzEv: consP != null && czDec != null && czDec > 1 ? r1(consP * czDec - 1) : null,` [x4]
- tests/singles-counterfactual.test.ts:134 — `].filter((p) => p.czDec != null);`
- tests/singles-counterfactual.test.ts:139 — `(p.czDec != null && Number(p.czDec) > 15));` [x2]
- tests/singles-counterfactual.test.ts:140 — `const evTix = parlays.filter((p) => core(p) && Number(p.czEv ?? -99) >= 2);`
- tests/singles-counterfactual.test.ts:181 — `' czEv ${String(pl.czEv).padStart(5)}% hit ${String(pl.prob).padStart(5)}%' +` [x2]
- tests/singles-counterfactual.test.ts:182 — `' consCzEv ${String(pl.consCzEv).padStart(6)}%',` [x2]
- tests/singles-counterfactual.test.ts:226 — `const legCzEv = (l: Row) => {`
- tests/singles-counterfactual.test.ts:227 — `const d2 = amToDec(num(l.cz));`
- tests/singles-counterfactual.test.ts:245 — `const sLegs = singlesCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null);`
- tests/singles-counterfactual.test.ts:246 — `const pLegs = parlayCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null);`
- tests/singles-counterfactual.test.ts:249 — `'\n1. PER-LEG czEv BEHIND EACH CARD (the like-for-like test)\n' +`
- tests/singles-counterfactual.test.ts:261 — `// LEG-EQUIVALENT FLOOR: admit a parlay only if its ticket czEv clears 1.02^n - 1, i.e.`
- tests/singles-counterfactual.test.ts:266 — `return Number(p.czEv ?? -99) >= (Math.pow(1.02, n) - 1) * 100;`
- tests/singles-counterfactual.test.ts:276 — `' their legs : ${leCard.length ? dist(leCard.flatMap((c) => ((c.pl.legs as Row[]) ?? []).map(legCzEv)).filter((x): x is number => x != null)) : "—"}',`
- tests/singles-counterfactual.test.ts:294 — `if (won) end += card[i].stake * Number(card[i].pl.czDec);`
- tests/singles-counterfactual.test.ts:302 — `const evPass = parlays.filter((p) => core(p) && Number(p.czEv ?? -99) >= 2);`
- tests/singles-counterfactual.test.ts:304 — `Number(p.czEv ?? -99) >= (Math.pow(1.02, ((p.legs as Row[]) ?? []).length) - 1) * 100);`
- tests/singles-counterfactual.test.ts:432 — `const decK = Number(pl.czDec);`
- tests/singles-counterfactual.test.ts:492 — `const decK = Number(pl.czDec);`
- tests/singles-counterfactual.test.ts:557 — `c.map((x) => '$${x.stake}(czEv ${x.pl.czEv}%)').join(" ") +` [x2]
- tests/singles-counterfactual.test.ts:628 — `const pf = v.filter((p) => Number(p.czEv ?? -99) >= 2).length;`
- tests/singles-counterfactual.test.ts:629 — `const pl2 = v.filter((p) => Number(p.czEv ?? -99) >= fl).length;`
- tests/singles-counterfactual.test.ts:647 — `// 'consCzEv' is null when the leg has no Caesars quote. Number(null) === 0, which would`
- tests/singles-counterfactual.test.ts:650 — `const noCz = poolAll.filter((w) => w.pl!.consCzEv == null).length;` [x2]
- tests/singles-counterfactual.test.ts:652 — `.filter((w) => w.pl!.consCzEv != null)`
- tests/singles-counterfactual.test.ts:653 — `.map((w) => Number(w.pl!.consCzEv))`
- tests/singles-counterfactual.test.ts:658 — `'\nPER-LEG consCzEv over ${cc.length} playable board rows with a Caesars quote' +`
- tests/singles-counterfactual.test.ts:659 — `' (${noCz} rows have none and cannot be a single at all) bar = consMinEv ${baseCfg.consMinEv}%' +`
- tests/singles-counterfactual.test.ts:667 — `// the ticket, and restricting to czDec != null would answer a different question.`
- tests/singles-vintage.test.ts:24 — `* | coreEvMin / coreCzEvMin | YES | ev/czEv computed for 1 leg like any |` [x2]
- tests/sizing-discipline.test.ts:50 — `const tik = (name: string, czDec: number, czEv: number, prob: number, g1: string, g2: string) => ({` [x2]
- tests/sizing-discipline.test.ts:51 — `pl: { type: "MIX", name, legs: [leg('${name} A', "batter_hits", g1), leg('${name} B', "batter_hits", g2)], czDec, czEv, prob },` [x2]
- tests/sizing-discipline.test.ts:106 — `expect((CFG() as { coreEvMin?: number }).coreEvMin).toBe(2); // percent units, same as czEv/bsEv — 2 means +2%`
- tests/sizing-discipline.test.ts:117 — `// a ticket Caesars can't price (czEv null) never clears the gate`
- tests/sizing-discipline.test.ts:118 — `const withNull = [...mixed, { ...tik("NoCz", 2.5, 0, 50, "g13", "g14"), pl: { ...tik("NoCz", 2.5, 0, 50, "g13", "g14").pl, czEv: null } }];` [x3]
- tests/sizing-discipline.test.ts:120 — `expect(b.picks.some((p) => p.w.pl.name.startsWith("NoCz"))).toBe(false);`
- tests/sizing-discipline.test.ts:186 — `it("card-EV units: with a single ticket, alloc.ev × 100 equals that ticket's czEv", () => {`
- tests/sizing-discipline.test.ts:198 — `const kf = (pl: { prob: number; czDec: number }) =>`
- tests/sizing-discipline.test.ts:203 — `expect(kf({ prob: 40, czDec: 3.5 })).toBeCloseTo(0.02, 10);`
- tests/sizing-discipline.test.ts:205 — `expect(kf({ prob: 55, czDec: 2.0 })).toBeCloseTo(0.02, 10);`
- tests/sizing-discipline.test.ts:207 — `expect(kf({ prob: 44, czDec: 2.5 })).toBeCloseTo(0.25 * ((1.5 * 0.44 - 0.56) / 1.5), 10);`
- tests/sizing-discipline.test.ts:209 — `expect(kf({ prob: 30, czDec: 3.0 })).toBe(0);`
- tests/sportsbook.test.ts:10 — `…yer:'Player',label:'Player O 0.5',fair:.5,line:.5,status:'upcoming',kickoff:'2099-01-01',cz:quote('williamhill_us',-130),dk:quote('draftkings',120),fd:null,best:quote('draftkings',…` [x2]
- tests/sportsbook.test.ts:15 — `…reserve the original row',()=>{const out=priceFootballProp(prop,'draftkings');expect(out.cz?.price).toBe(120);expect(out.grade).toBe('S');expect(prop.cz?.price).toBe(-130);expect(p…` [x2]
- tests/sportsbook.test.ts:16 — `…ther book when selected book is missing',()=>{const out=priceFootballProp(prop,'betmgm');expect(out.cz).toBeNull();expect(out.grade).toBeNull();expect(out.playable).toBe(false);});`
- tests/sportsbook.test.ts:17 — `…nst r={...prop,dk:quote('draftkings',120,1.5)};expect(priceFootballProp(r,'draftkings').evCz).toBeNull();const out=priceFootballProp({...r,probabilities:{draftkings:.3}},'draftking…` [x2]
- tests/sportsbook.test.ts:21 — `const data:BoardData={categories:{ml:[{label:'Away ML',sub:'ML vs Home',prob:50,czOdds:-130,czEv:-11.54,gkey:'away@home',lkey:'ml_away',cz:-130 as never}]},parlays:[{name:'Pair',pr…` [x5]
- tests/sportsbook.test.ts:25 — `…ed',()=>{const enriched=attachBookQuotes(data,[event],'williamhill_us');/* the fixture's cz prices are Caesars' */const out=priceMlbBoard(enriched,'draftkings');expect(out.categori…` [x8]
- tests/sportsbook.test.ts:26 — `…noffered tickets have no combined selected-book odds',()=>{const out=priceMlbBoard(data,'betmgm');expect(out.parlays[0].czDec).toBeNull();expect(out.parlays[0].czEv).toBeNull();});` [x2]
- tests/sportsbook.test.ts:27 — `…book',()=>{const row=data.propBoard![0].markets.batter_hits[0];expect(priceMlbProp(row,'draftkings').cz).toEqual({o:120,u:null});expect(priceMlbProp(row,'betmgm').o).toBeNull();});`
- tests/sportsbook.test.ts:28 — `…ability anchored to the live line for each side',()=>{const b={rows:{x:{ln:2.5,pLive:.3,czAm:-120,oppAm:100,quotes:{draftkings:{o:200,u:-220}}}}} as never;const out=priceLiveBoard(…` [x2]
- tests/sportsbook.test.ts:33 — `expect(priceMlbRow(r,'draftkings').czOdds).toBe(120);`
- tests/sportsbook.test.ts:34 — `expect(priceMlbRow(r,'draftkings').czEv).toBeCloseTo(10);`
- tests/sportsbook.test.ts:35 — `expect(priceMlbRow(r,'fanduel').czOdds).toBeNull();`
- tests/sportsbook.test.ts:38 — `const r={...data.propBoard![0].markets.batter_hits[0],cz:null};`
- tests/sportsbook.test.ts:43 — `expect(priceMlbBoard(attachBookQuotes(data,[e],'williamhill_us'),'draftkings').propBoard![0].markets.batter_hits[0].cz?.o).toBe(120);`
- tests/sportsbook.test.ts:51 — `const data={categories:{ml:[{label:"Team",gkey:"g",lkey:"ml_home",sub:"ML",cz:-150,czOdds:"-150",odds:"+110",book:"FanDuel",bs:105,bsBook:"DK"}]}} as unknown as BoardData;` [x2]
- tests/sportsbook.test.ts:52 — `expect(priceMlbMoneylines(data,"williamhill_us")[0]).toMatchObject({odds:-150,cz:-150,book:"Caesars"});`
- tests/sportsbook.test.ts:53 — `expect(priceMlbMoneylines(data,"draftkings")[0]).toMatchObject({odds:105,cz:105,book:"DraftKings"});`
- tests/sportsbook.test.ts:57 — `…b:50,odds:"+120",book:"FanDuel",bs:-110,bsBook:"DK"} as never,"draftkings");expect(row.czOdds).toBe(-110);expect(row.bestDisplayOdds).toBe("+120");expect(row.bestDisplayBook).toBe(…`
- tests/sportsbook.test.ts:62 — `expect(priceMlbRow(row,'fanduel',index).czKellyF).toBe(.02);`
- tests/sportsbook.test.ts:63 — `expect(priceMlbRow(row,'williamhill_us',index).czKellyF).toBe(0);`
- tests/sportsbook.test.ts:64 — `expect(priceMlbRow(row,'betmgm',index).czKellyF).toBeNull();`
- tests/straight-only.test.ts:87 — `expect(Number(t.czEv)).toBeGreaterThan(0);`
- tests/straight-only.test.ts:142 — `expect(t.czEv).toBeGreaterThan(0);`
- tests/supplemental.test.ts:41 — `cz: -110,`
- tests/supplemental.test.ts:48 — `czDec: 2.4,`
- tests/supplemental.test.ts:49 — `czOdds: "+140",`
- tests/supplemental.test.ts:50 — `czEv: 3,`
- tests/supplemental.test.ts:53 — `const funPl = (name: string, czDec: number, prob: number, g: string, extra: Pl = {}): Pl => ({`
- tests/supplemental.test.ts:57 — `czDec,`
- tests/supplemental.test.ts:58 — `czOdds: "+1100",`
- tests/supplemental.test.ts:59 — `czEv: 5,`
- tests/supplemental.test.ts:217 — `id: "c1", bucket: "core", name: "Core", stake: 10, czDec: 2.5, confirmed: null,`
- tests/supplemental.test.ts:218 — `legs: [{ label: "Ryan McMahon", prop: "Hits O 1.5", cz: -110, gkey: "g1", lkey: '${pn("Ryan McMahon")}|batter_hits|1.5' }],`
- tests/supplemental.test.ts:223 — `id: "s1", bucket: "fun", name: "Supp longshot", stake: 10, czDec: 12, confirmed: null,`
- tests/supplemental.test.ts:225 — `legs: [{ label: "Paul Blackburn", prop: "Ks O 2.5", cz: 120, gkey: "g1", lkey: '${pn("Paul Blackburn")}|pitcher_strikeouts|2.5' }],`
- tests/supplemental.test.ts:346 — `{ id: "f1", stake: 10, legs: [{ label: "A", prop: "Hits O 0.5", lkey: "a|batter_hits|0.5", cz: 900 }] },`
- tests/supplemental.test.ts:347 — `{ id: "f2", stake: 8, supplemental: true, legs: [{ label: "B", prop: "Hits O 0.5", lkey: "b|batter_hits|0.5", cz: 1200 }] },`
- tests/sweep-covers-engine.test.ts:10 — `* the alternates, so 14 archive days read CZ 0/7,033 (hits) + 0/830 (K's) and the`
- tests/ticket-math.test.ts:4 — `/* Parlay Builder sandbox: pure ticket math. Prices real (CZ quotes), combined`
- tests/ticket-math.test.ts:20 — `{ cz: -110, prob: 60 },`
- tests/ticket-math.test.ts:21 — `{ cz: 150, prob: 40 },`
- tests/ticket-math.test.ts:33 — `const t = combineTicket([{ cz: 100, prob: 50 }])!;`
- tests/ticket-payout.test.ts:13 — `expect(ticketPayout({ stake: 10, czDec: 3 })).toEqual({ settled: false, wins: 20, pays: 30 });`
- tests/ticket-payout.test.ts:15 — `expect(ticketPayout({ stake: 25, czDec: 1.6667 })).toEqual({ settled: false, wins: 16.67, pays: 41.67 });`
- tests/ticket-payout.test.ts:18 — `expect(ticketPayout({ stake: 10, czDec: 3, confirmed: 150 })).toEqual({ settled: false, wins: 15, pays: 25 });`
- tests/ticket-payout.test.ts:19 — `expect(settlingDec({ stake: 1, czDec: 3, confirmed: -200 })).toBeCloseTo(1.5, 9);`
- tests/ticket-payout.test.ts:21 — `it("no czDec: the American string prices it; unpriced tickets render nothing", () => {`
- tests/ticket-payout.test.ts:22 — `expect(ticketPayout({ stake: 20, czOdds: "+245" })).toEqual({ settled: false, wins: 49, pays: 69 });`
- tests/ticket-payout.test.ts:23 — `expect(ticketPayout({ stake: 20, czOdds: -110 })).toEqual({ settled: false, wins: 18.18, pays: 38.18 });`
- tests/ticket-payout.test.ts:25 — `expect(ticketPayout({ stake: 0, czDec: 3 })).toBeNull();`
- tests/ticket-payout.test.ts:28 — `expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "won", payout: 30 })).toEqual({ settled: true, wins: 20, pays: 30 });`
- tests/ticket-payout.test.ts:30 — `expect(ticketPayout({ stake: 10, czDec: 3, confirmed: 150 }, { result: "won", payout: 25 })).toEqual({ settled: true, wins: 15, pays: 25 });`
- tests/ticket-payout.test.ts:33 — `expect(ticketPayout({ stake: 33, czDec: 2.2 }, { result: "lost", payout: 0 })).toEqual({ settled: true, wins: 0, pays: 0 });`
- tests/ticket-payout.test.ts:34 — `expect(ticketPayout({ stake: 33, czDec: 2.2 }, { result: "push", payout: 33 })).toEqual({ settled: true, wins: 0, pays: 33 });`
- tests/ticket-payout.test.ts:37 — `expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "pending", payout: 0 })).toEqual({ settled: false, wins: 20, pays: 30 });`
- tests/ticket-payout.test.ts:38 — `expect(ticketPayout({ stake: 10, czDec: 3 }, { result: "ungradable", payout: 0 })?.settled).toBe(false);`
- tests/ticketstack-markets.test.tsx:61 — `…er", player: 'Player ${i}', label: 'Player ${i} O 4.5 Receptions', teamId: g.home.id, line: 4.5, fair: 0.53, evCz: 6, cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 } }));` [x2]
- tests/under-bias.test.ts:33 — `const T = (name: string, legs: { lkey: string | null; prop: string }[], czEv: number | null = 0): BiasTicket => ({`
- tests/under-bias.test.ts:35 — `czEv,`
- tests/variety-core.test.ts:100 — `const row = (o: Record<string, unknown>) => ({ prob: 60, cz: -150, czOdds: "-150", bs: -140, bsOdds: "-140", bsBook: "FD", implied: 58, lkey: "x|batter_hits|0.5", gkey: "a@b", la…` [x2]
- tests/variety-core.test.ts:105 — `batter_hits: [row({}), row({ live: true, label: "L" }), row({ cz: null, label: "NoCz" }), row({ bs: null, label: "NoBs" }), row({ prob: null, label: "NoProb" }), row({ susp…` [x2]
- tests/variety-core.test.ts:106 — `…: [row({ label: "Houston Astros", sub: "ML vs Kansas City Royals", lkey: "ml_home", gkey: "kc@hou", prob: 56, cz: -156, czOdds: "-156", bs: -146, bsOdds: "-146", implied: 57.9 })],` [x2]
- tests/variety-core.test.ts:117 — `….toMatchObject({ label: "Houston Astros", prop: "ML vs Kansas City Royals", lkey: "ml_home", gkey: "kc@hou", cz: -156, bs: -146, prob: 56, imp: 57.9, live: false, game: "A @ B" });`
- tests/variety-core.test.ts:118 — `expect(ml.czDec).toBe(1.64);`
- tests/variety-core.test.ts:121 — `expect(ml.czEv).toBe(-8.1); // 0.56 × 1.641 − 1, the board's own number for that row`
- tests/variety-core.test.ts:130 — `…(label: string, market: string, prop = "O 0.5") => ({ label, prop, lkey: /^(ml|rl)$/.test(market) ? '${market}_home' : '${label}|${market}|0.5', cz: -110, gkey: 'g-${label[0]}' });`
- tests/variety-core.test.ts:132 — `pl: { name, type, prob: 45, probRaw: 50, czEv: 3, czEvRaw: 4, czDec: dec, bsDec: dec, legs, ...extra },` [x3]

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — docs (330 lines)

- CLAUDE.md:20 — `> desk in src/lib/ufc.ts + src/components/ufc/: 7-book de-vig consensus vs CZ moneyline, ESPN records,`
- CLAUDE.md:40 — `> - **July 2026 overhaul (fix-file, all 6 phases deployed):** default selection mode = **EV-gated @ CZ**;`
- CLAUDE.md:41 — `> settlement floor czEv ≥ 0 on core locks (override-proof, "nv_tax" blocked reason); HRR O1.5+ and`
- CLAUDE.md:137 — `…ts a BARE name, never "Name (null)" ('propRowLabel'); old hide keys migrate once ('migrateCzHidden'). A bare label that misses a posted nine gets 'resolvePlayer''s initial rule aga…`
- CLAUDE.md:158 — `… the stamp is Caesars-priced (pre-2026-09-17) and the client repricers treat it so. The 'cz*' field names, 'CAESARS_KEY', and the "Caesars-only" wording in the historical bullets b…`
- CLAUDE.md:160 — `…estion additively captures Caesars ('CAESARS_KEY'='williamhill_us') ML/RL/prop prices ('*_cz', 'row.cz'; RL only at the engine's modal ±1.5); rows carry 'cz/czOdds/czEv/czEdge/czKe…` [x15]
- CLAUDE.md:165 — `- localStorage keys added: 'pl_daily', 'pl_fun', 'pl_ledger', 'pl_czNote'.`
- CLAUDE.md:324 — `(cause = M6, no K-count sim; czEv null → never gate-eligible); the invariant's`
- CLAUDE.md:367 — `shade fed the SHADED est to the gate (omniscient gate; 'shadePl' recomputes czEv);`
- CLAUDE.md:579 — `E[ln] vs the same pool's EV-ranked 6, and rank-7+ displaced tickets carry HIGHER czEv`
- CLAUDE.md:580 — `than same-rank entrants (07-26 signature: entrants ~2–4% czEv / ≥63% prob vs displaced`
- CLAUDE.md:619 — `coreEvMin, coreCzEvMin, consMinN/consMinEv, coreMaxLegs/maxCoreTickets/coreMaxDec/`
- CLAUDE.md:630 — `vintage — 'hrrAltMax', 'coreEvMin', 'coreCzEvMin', 'consMinN'/'consMinEv',`
- CLAUDE.md:829 — `…'*_alternate' (incl. the main lines) — 14 archive days read 0/7,033 (hits) + 0/830 (K's) CZ-present and the multibook memo misread that as feed coverage ("the unlock", retracted sa…`
- CLAUDE.md:972 — `L2388). 'consCzEv' on a one-sided Caesars leg is therefore the constant **−5.66%**, which`
- CLAUDE.md:979 — `substitute for the archive; 'tools/snapshot_props.py' stores 'n' + 'cz' per row.`
- CLAUDE.md:1052 — `+139.1 bp). Per-leg czEv behind each card is indistinguishable (5.76% vs 5.80%), so the fixed`
- CLAUDE.md:1083 — `**'consMinEv' is a STRUCTURE filter wearing a quality filter's name.** 'consCzEv' is`
- CLAUDE.md:1547 — `and 'czf' (Caesars inside its own fair) peaks at **6.3% at 8–10 h** and is ~0 inside 4 h. So the`
- CLAUDE.md:1548 — `16:00 → 22:00 retime buys **+13% depth and eliminates 'czf'** — but **'n ≤ 1' is flat at 54–55%`
- CLAUDE.md:1572 — `Only consensus depth moves — mean 'n' 1.40 → 1.66, 'czf' 2.2% → 0.3% — and it moves so that the`
- ENGINE2.md:70 — `model/market with EV at the CZ quote when the points match; F5/TT are model-fair`
- ENGINE2.md:82 — `ML/totals vs the Caesars line, us+eu regions, comparability guard when CZ hangs a`
- ENGINE2.md:101 — `beat-the-CZ-close rate, ticket-probability calibration buckets, "verdict maturity" (n/500),`
- ENGINE2.md:186 — `(two-sided → de-vig its own prices, labeled "CZ-only"), 'batter_home_runs' only`
- ENGINE2.md:223 — `¼-Kelly at the CZ price capped at 2% of bankroll, floored at 0; 'shCardCalc' returns`
- ENGINE2.md:236 — `stands; 'prob'/'fair'/'ev'/'czEv' and shFunPick's floor + tiers flow from the corrected`
- ENGINE2.md:314 — `additively at slate collection exactly like the cz layer ('shBasisPick'; fields`
- ENGINE2.md:319 — `card legs need BOTH a basis and a CZ quote; the NV price-confirm stays the grading`
- ENGINE2.md:338 — `**The proof** ('tests/dkfd-basis.test.ts'): CZ + BetMGM quotes perturbed by scaling`
- ENGINE2.md:343 — `ineligible, no CZ-priced fallback, board still browsable.`
- ENGINE2.md:345 — `**CLV + receipts:** each sighting stores both closes ('am' = CZ, 'bsAm/bsBk' =`
- ENGINE2.md:351 — `quotes are >20 min old. 'caesars_ev', 'ev_gated' (@CZ), and 'probability' stay in`
- ENGINE2.md:357 — `mirroring the cz layer — additive fields, parity digest is field-selective so the`
- ENGINE2.md:360 — `forbids); Basis column with DK/FD tag; CZ column labeled "(settles)"; EV/Kelly/row`
- ENGINE2.md:362 — `The Sharp (dk_fd): plays replicate the allocator's discipline — basis + CZ quotes`
- ENGINE2.md:364 — `basis EV; gate-clearing picks with no CZ quote are disclosed with their basis price,`
- ENGINE2.md:367 — `the basis in dk_fd with CZ kept gold as settlement. Tests: 'basis-surfaces.test.ts'`
- ENGINE2.md:465 — `played or not, CZ-offered or not) is serialized client-side ('src/lib/predictions.ts') and`
- ENGINE2.md:484 — `CZ doesn't offer are listed separately, never substituted. 'caesars_ev' = legacy ranking,`
- ENGINE2.md:498 — `2. **Settlement floor** — 'SH_CFG.coreCzEvMin:0': in dk_fd, a core ticket must ALSO be`
- ENGINE2.md:523 — `- Builder manual slip: live per-leg EV (p·dec−1 at CZ) as legs are added/removed; the worst`
- ENGINE2.md:528 — `czEv ≥ coreCzEvMin on the force path too, in both disciplined modes. The 0..+2% warning` [x2]
- ENGINE2.md:535 — `(basis +X% → CZ −Y%) · no override".`
- ENGINE2.md:546 — `under the default mode plays now mirror the allocator exactly (cz quote + czEv ≥ gate,` [x2]
- ENGINE2.md:547 — `ranked by czEv) instead of falling through to the prob-ranked path.`
- ENGINE2.md:562 — `fair (pAdj vs nv); both sides ride the identical pipeline — side-aware CZ/DK/FD`
- docs/auto-lock-memo.md:48 — `'shTicketSnap' copies **values**: 'stake, czOdds, czDec, prob, czEv, fair, bsOdds, bsDec, bsEv',` [x3]
- docs/auto-lock-memo.md:49 — `and per leg '{label, prop, cz, game, gkey, lkey, est, bs, bsBook}'. It also copies`
- docs/auto-lock-memo.md:530 — `finite 'implied'** (sample: 'yordanalvarez|batter_home_runs|0.5', prob 32.4, implied 30.9, cz 180),`
- docs/auto-lock-memo.md:538 — `hole and must name it.** The archive's own 'bo'/'cz'/'no' fields are unaffected, so`
- docs/auto-lock-memo.md:539 — `CZ-coverage-style findings stand.`
- docs/auto-lock-memo.md:555 — `| 'ledger-report.mjs' 'Number(r.czEv) < 0' | an **absent** czEv scored as "not negative" rather than unknown — under-counting the census | **counted separately as 'czEvUnknown'** |` [x3]
- docs/auto-lock-memo.md:641 — `{ "fair": 0.4809, "n": 4, "cz": { "o": -110, "u": -121 } }`
- docs/auto-lock-memo.md:644 — `is the 'bo'/'bu'/'fb'/'czf'/'no' KEYS — they are **absent from the object**, not null.`
- docs/auto-lock-memo.md:662 — `key** — 'cz: {o: -110, u: -121}', both sides, in a row with no 'bo'/'bu'. **Both printed above.**`
- docs/auto-lock-memo.md:663 — `The correct reading is **not** "the parser reads the wrong field": 'cz' (Caesars) was always`
- docs/auto-lock-memo.md:912 — `| 'coreCzEvMin: 0' | definitional, not empirical — a sign constraint (never lock a negative-EV core ticket) |`
- docs/auto-lock-memo.md:1208 — `'coreEvMin', 'coreCzEvMin' — which the floor does not touch and which are unchanged either way.)*`
- docs/auto-lock-memo.md:1319 — `… · 'quota.mjs''s unreachable header guard · 'ledger-report''s 'lockedAt' epoch-0 · its 'czEv' "not negative" · 'board-report''s null envelope · the ratchet counting comments as cod…`
- docs/auto-lock-memo.md:1347 — `| 'batter_hits' | 247 | 12 | **4.9%** | 0 | — / — *(no 'cz' on hits rows)* |`
- docs/branch-firing-audit.md:1286 — `| mode | tickets | staked | own computed ceiling | **ratio** | over ceiling | $0 ceiling | negative czEv |`
- docs/branch-firing-audit.md:1297 — `carry negative 'czEv', 5 sit on a $0 ceiling, and every one of the six exceeds its own ceiling —`
- docs/branch-firing-audit.md:1298 — `and **NOT DEMONSTRATED for 'caesars_ev'**, which on this board took zero negative-czEv tickets,`
- docs/cfb-desk.md:40 — `…evaluated there — that is why a Games card can show '-115@54.5' against a consensus 55. 'cz' = Caesars, 'best' = highest decimal at the consensus line, 'dk' / 'fd' / 'pin' for refe…`
- docs/cfb-desk.md:41 — `6. 'evCz' / 'evBest' are percentages; the grade (S…F) comes from 'evCz' through the shared 'gradeFromEv' in 'src/lib/grade.ts' — the same letter scale as the MLB board; 'playable' …` [x2]
- docs/cfb-desk.md:67 — `- Core: candidates need 'evCz ≥ 2 %' and a Caesars decimal ≤ 2.60; one side per game ('bestPerGame'); singles and cross-game doubles (product ≤ 2.60) ranked by EV; greedy admit wit…`
- docs/cfb-desk.md:68 — `…e the likeliest sides by no-push probability at Caesars' line among playable rows with 'evCz ≥ −3 %' (grade D or better, never an F), moneylines and spreads before totals, adding l…`
- docs/cfb-desk.md:98 — `…itles"): three changes, each pinned. (1) THE CAESARS-MISSING RULE — 'CFB_PROPS.czMissingRevalidateSec' (1800) / 'czMissingWindowSec' (4 h): an upcoming game on the stored board wit…` [long line; 5 occurrences on this line; first shown]
- docs/cfb-desk.md:100 — `…2026-09-06 to count character-for-character what 'buildCfbCard' counts ('r.playable && r.cz != null && r.evCz != null', on games whose start is still ahead), because 'playable' als…` [long line; 2 occurrences on this line; first shown]
- docs/cfb-desk.md:103 — `…d once before Caesars posted, then ridden for the whole 2 h carry): 'CFB_PROPS.czMissingRevalidateSec' (1800) and 'czMissingWindowSec' (4 h). An UPCOMING game on the stored board t…` [long line; 6 occurrences on this line; first shown]
- docs/cfb-desk.md:119 — `…re board: 0 unmatched; Caesars posts no moneyline on ALA / IU / OSU / ARMY / SYR / NEB in the fixture, so those ML rows are unplayable by design (prod shows the same "no CZ" rows).`
- docs/cfb-desk.md:124 — `- "no CZ" moneyline rows show the fair price but no grade and no Kelly.`
- docs/clv.md:23 — `| 'cz' | the executed Caesars price (american) — the price that settles |`
- docs/clv.md:48 — `- **CZ cents** = locked 'cz' − closing 'am', on a continuous cents scale that removes` [x2]
- docs/clv.md:59 — `locked 'imp' + closing 'consensusFair' for fair points; locked 'cz' + closing 'am' for`
- docs/clv.md:65 — `Stats → 📐 CALIBRATION → **Closing line value** panel: average CLV (prob points and CZ`
- docs/collection-period.md:318 — `> already), the 14-day CZ census (M13 — canonical-key AND cross-vintage stamped),`
- docs/collection-period.md:618 — `| selection mode default | 'ev_gated' | EV-gated @ CZ (stored dk_fd / probability / caesars_ev respected) |`
- docs/collection-period.md:622 — `| 'coreCzEvMin' | '0' | settlement floor — never lock a core ticket negative-EV at Caesars (override-proof) |`
- docs/collection-period.md:680 — `…SEN, rationale in comments** | selMode · 'coreEvMin' · damping 0.5 · 20-board bar · 'coreCzEvMin' · 'consMinN'/'consMinEv' · 'dailyBankrollCap' · 'hrrAltMax' (signed; value chosen)…`
- docs/collection-period.md:722 — `'consCzEv' is **multiplicative**: 'consP = Π(imp_i)' and 'czDec = Π(czDec_i)', so` [x3]
- docs/collection-period.md:725 — `consCzEv = Π (imp_i × czDec_i) − 1 = Π (1 + c_i) − 1 c_i = that leg's own consCzEv` [x3]
- docs/collection-period.md:730 — `| legs | required geometric-mean per-leg 'consCzEv' |`
- docs/collection-period.md:942 — `is a de-vigged Caesars price. On those rows 'consCzEv = f × czDec − 1 = 1/(1+h) − 1 ≈ −h',` [x2]
- docs/collection-period.md:952 — `'cz' is a standard two-sided Caesars quote only (ladders excluded), so`
- docs/collection-period.md:953 — `'n = 1 ∧ cz two-sided' identifies a Caesars-only fair **exactly**:`
- docs/collection-period.md:974 — `today by arithmetic" because 'consCzEv' on a one-sided Caesars leg reduces to the constant`
- docs/collection-period.md:1044 — `per-book 'cz' flag before the count is taken, and 'finalizeCats' never carries 'books'`
- docs/collection-period.md:1144 — `| 'coreCzEvMin' (settlement floor, override-proof) | yes | **no** |`
- docs/collection-period.md:1230 — `| market | n | p25 | **median** | p75 | p90 | fair overstated by | relative | czEV overstated by |`
- docs/collection-period.md:1244 — `so 'ΔczEV ≈ 0.65 × r' **independently of the price**. The bias is *relative*, not absolute.`
- docs/collection-period.md:1248 — `Measured 1.071, not 1.12 — the constant is thin by ~1.1% relative, worth ~0.6 pp of czEV,`
- docs/collection-period.md:1265 — `props-history stored only 'fair'/'n'/'cz' for them — all null. HR rows in the archive are`
- docs/collection-period.md:1272 — `| if HR's true overround is… | czEV overstatement |`
- docs/collection-period.md:1360 — `still be overstating czEV by ~5.5pp, which is larger than 'coreEvMin'. The honest reading of`
- docs/collection-period.md:1369 — `'tools/snapshot_props.py' now records, alongside the existing 'fair'/'n'/'cz':`
- docs/collection-period.md:1374 — `| 'czf' | was the settlement book among them — the self-reference question, exactly |`
- docs/collection-period.md:1379 — `approved 'czf' and 'fb' on 2026-07-25; 'bo'/'bu'/'no' were added in the same pass to make`
- docs/collection-period.md:1812 — `| 'coreCzEvMin' (settlement floor, override-proof) | ✅ | ❌ |`
- docs/collection-period.md:1828 — `4. priced in the active selection mode (in 'dk_fd', needs both a basis and a CZ quote)`
- docs/collection-period.md:1842 — `- The '−5.66%' one-sided 'consCzEv' constant never protected HR — it lives in 'shAllocate'.`
- docs/collection-period.md:2601 — `'coreNoHR' (12 HR tickets/board), 'coreEvMin' (+2%: 29 → 1 on the fixture), 'coreCzEvMin',`
- docs/collection-period.md:2689 — `Days 2026-07-12 → 07-26 carry 'fair'/'n'/'cz' only, so they support proportional`
- docs/collection-period.md:2690 — `close-grading and Caesars-only Shin (via 'cz'), not multi-book Shin.`
- docs/collection-period.md:2762 — `| 'coreEvMin' (+2% at CZ) | 47 → **18** |`
- docs/collection-period.md:2763 — `| 'coreCzEvMin' (nv_tax) | 18 → 18 |`
- docs/collection-period.md:2773 — `also satisfy 'consCzEv ≥ −1%'** — which none does, for the arithmetic reason already`
- docs/collection-period.md:2790 — `by applying 'coreNoHR' and a 'czEv ≥ 2' test directly to 'd.parlays', which is not the`
- docs/collection-period.md:2832 — `'consCzEv = p_consensus × czDec − 1'. A leg the consensus agrees with *exactly* still reads` [x2]
- docs/collection-period.md:2833 — `negative, because 'czDec' carries Caesars' vig. At the measured Caesars overround of`
- docs/collection-period.md:2839 — `And the model's own claim on these legs is 'czEv ≥ +2%', so model-minus-consensus is`
- docs/collection-period.md:2842 — `| 'czDec' | probability points |`
- docs/collection-period.md:2895 — `The 9.1 EV points is **post-blend**. 'czEv' uses the blended probability, 'consCzEv' uses` [x2]
- docs/collection-period.md:2898 — `> **'pModel − imp = (czEv − consCzEv) / (w × czDec)'**` [x3]
- docs/collection-period.md:2900 — `Algebra confirmed. At w = 0.35 and czDec 1.9 that predicts ~13.7 pp. **Measured directly`
- docs/collection-period.md:3435 — `The snapshot-1-vs-snapshot-2 relabel (mean 'n' 1.40 → 1.66, 'czf' 2.2% → 0.3%) implied depth`
- docs/collection-period.md:3439 — `| h to first pitch | rows | mean 'n' | median | **'n ≤ 1'** | 'czf' |`
- docs/collection-period.md:3465 — `| 'czf' — Caesars inside its own fair | 0–6% | ~0% | **effectively eliminated** |`
- docs/collection-period.md:3467 — `> **Two of these are real and one is not.** 'czf' — the pathology where the "independent"`
- docs/collection-period.md:3473 — `**Add to the retime's measured value: elimination of 'czf', +13% consensus depth. Do not claim`
- docs/collection-period.md:3540 — `## EXCEPT: one captured-field gap — CZ hits/K's alternate quotes (M13, recorded 2026-07-28)`
- docs/collection-period.md:4230 — `count, date range, per-market LEG counts, and per-leg '{lkey, res, odds/cz, implied}'`
- docs/collection-period.md:4232 — `+ market** (SyncEntry legs carry lkey/prop/cz/res via the grader). Branches:`
- docs/collection-period.md:4256 — `| drop the alt-key fix | +48–96 never spent | the archive stays CZ-blind on hits/K's | the playable-population re-measure; the memo's join stays archive-blocked |`
- docs/collection-period.md:5818 — `'caesars_ev' (the legacy ¼-Kelly-at-CZ ranking). Plus one orthogonal switch:`
- docs/collection-period.md:5880 — `czOdds, czDec, prob, czEv, fair, bsOdds, bsDec, bsEv, confirmed, legs:[...]}';` [x3]
- docs/collection-period.md:5881 — `- leg (L3372–73): '{label, prop, cz, game, gkey, lkey, est, bs, bsBook}' —`
- docs/collection-period.md:5883 — `'cz' is the leg's own settled-book price → implied prob is arithmetic;`
- docs/collection-period.md:5894 — `implied-from-'cz') is available from the SAME rows whenever the export runs. **No`
- docs/collection-period.md:5898 — `'cz'. The 46.3/59.2 figure's source is consistent with exactly this join`
- docs/collection-period.md:5930 — `and the three badge booleans 'bsBadge'/'czBadge'/'edgeBadge' (finalizeCats`
- docs/collection-period.md:5932 — `Every pricing NUMBER (prob, implied, edge, ev, czEv, bsEv, kellyF, czKellyF,` [x2]
- docs/collection-period.md:5933 — `bsKellyF, pModel, wBlend, odds, cz, bs) is computed upstream and untouched.`
- docs/collection-period.md:6892 — `| ticket | 'id', 'bucket', 'name', 'type', 'tier', 'stake', 'czOdds', 'czDec', 'prob', 'czEv', 'fair', 'confirmed', 'legs' | **'bsOdds', 'bsDec', 'bsEv' 2026-07-19** |` [x3]
- docs/collection-period.md:6893 — `| leg | 'label', 'prop', 'cz', 'game', 'gkey', 'lkey', 'est' | **'bs', 'bsBook' 2026-07-19** |`
- docs/collection-period.md:6957 — `| czEv | **+5.6%** |`
- docs/collection-period.md:7506 — `- **Row level, every mode:** 'finalizeCats' L2517/2523/2529 emit 'kellyF', 'czKellyF',`
- docs/collection-period.md:7529 — `carry a $0 ceiling and are staked anyway, **$2 to $62** (they are the negative-czEv`
- docs/collection-period.md:7530 — `ML/RL parlays: czEv −4.5 to −12.5). The $62 HRR ticket at 4.77× is the *mildest* of`
- docs/collection-period.md:7545 — `carries 'prob', 'czDec', and 'stake', plus the entry's 'bankroll'. 'shKellyFrac' is a`
- docs/collection-period.md:7595 — `**implied = mean of americanToProb(leg.cz) over the same legs → expect 59.2 ±0.05 pp**;`
- docs/collection-period.md:7629 — `false**, so 'czEv >= coreEvMin', 'czEv >= czMin' and the greedy 'eff > bw' all fail, and` [x3]
- docs/collection-period.md:7637 — `every emitted row's 'prob/implied/edge/ev/kellyF/czEv/czKellyF/pModel' finite-or-null` [x2]
- docs/collection-period.md:7691 — `| 2 | L3011–3018 | **'coreCzEvMin' — the settlement floor** ("nv_tax", documented as override-proof) |`
- docs/collection-period.md:7710 — `| 'coreCzEvMin' (settlement floor) | **IN** — despite its comment claiming it "runs on the force path too": true for 'force', FALSE for legacy modes |`
- docs/collection-period.md:7735 — `why a **negative-czEv ML/RL parlay (czEv −4.5 to −12.5)** reaches a card at all.` [x2]
- docs/collection-period.md:7763 — `2026-07-11 — 'prob', 'czDec', 'stake', 'entry.bankroll' — so NONE of it is blocked by`
- docs/collection-period.md:7766 — `kelly(prob/100, czDec), 0.02)))', 'ratio = stake / ceiling'. Print: ratio per`
- docs/collection-period.md:7770 — `3. **Negative 'czEv' at placement**: count (the field is on every ticket since 07-11).`
- docs/credit-budget.md:143 — `book keys behind the fair), 'czf' (was the settlement book among them), 'bo'/'bu' (best`
- docs/cron-jobs.md:388 — `…ed:days') | **permanent — nothing is ever pruned** ¹ | per-row 'p', 'pModel', 'pMkt', 'w', 'edge', 'ev', 'odds', 'cz', 'czEv', 'lu', 'tags', 'ln', 'hist', 'at' — and now 'gens[]' |` [x2]
- docs/cron-jobs.md:389 — `| 'line-history' branch | 'data/props/*.json' | **permanent (git)** | prop **market** rows only: 'fair', 'n', 'fb', 'fp', 'czf', 'bo', 'bu', 'no', 'cz' |` [x2]
- docs/cron-jobs.md:412 — `| 2.28 decomposition | ticket 'czEv'/'bsEv'/'consCzEv' to run the +2% chain | **NO** — 'ParlayPred' keeps only '{name, type, prob, czDec, czOdds, legs[{label, prop, lkey, gkey, pro…` [x4]
- docs/cron-jobs.md:716 — `'fair'/'n'/'fb'/'fp'/'czf'/'bo'/'bu'/'cz' fields — is computed from them by 'compact()' in` [x2]
- docs/cron-jobs.md:737 — `Verified locally against a realistic two-book payload: folds once ('fair 0.603, n 2, czf true,`
- docs/freeze-exit-bundle.md:38 — `…itcher_strikeouts_alternate' 2.5–9.5). 14 archive days read **hits 0/7,033 and K's 0/830 CZ-present**, and the multibook memo misread that as feed coverage — "the unlock", retracte…` [x2]
- docs/freeze-exit-bundle.md:51 — `…gated, dk_fd}' AND '!force'), and behind it sit: 'coreEvMin' (the EV gate, L3008) · 'coreCzEvMin' (settlement floor, L3011–18) · 'booksInd' consensus (L3032–34) · 'consMinN'/'consM…` [long line; 4 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:52 — `…non-positive Kelly edge, i.e. "stake nothing" — and are staked **$2–$62** (the negative-czEv ML/RL parlays). Disciplined modes: **6 of 6 tickets at exactly 1.00×** — the ceiling bi…` [long line; 2 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:153 — `…'s sign-off, credit cost).** Its DEPENDENTS carry the stamp instead: every archive-based CZ-coverage / both-priced number (multibook memo §2b) is canonical-key vintage, and the pos…`
- docs/freeze-exit-bundle.md:250 — `run: 0 of 67 pool tickets carry czEv > 0 (max −5.5%) — at full agreement the`
- docs/freeze-exit-bundle.md:251 — `remaining EVs are consensus-at-CZ (vig), the shrink target IS the market-implied`
- docs/freeze-exit-bundle.md:296 — `…he ADMISSION GATE and the ranking key ('tests/a1-shrink.test.ts': 'shadePl' recomputes 'czEv' from the shaded prob, and the shaded pool feeds 'alloc') — an OMNISCIENT gate that is …`
- docs/freeze-exit-bundle.md:402 — `quantity)**: 'czEv' is computed from the EMITTED prob — sim-adjusted wherever a`
- docs/freeze-exit-bundle.md:409 — `- **The triplicate's channels**: 'czDec'/'czEv'/'czOdds' all **null** — it cannot` [x3]
- docs/freeze-exit-bundle.md:440 — `POOL-ELIGIBLE population the spec'd invariant guards** (czDec non-null,`
- docs/freeze-exit-bundle.md:446 — `product, ρ-bound ±2.38 pp per 0.1ρ. **Their czEv is computed from NOTHING —`
- docs/freeze-exit-bundle.md:447 — `'czDec'/'czEv'/'czOdds' are all null (no Caesars quote), so the gate never read` [x3]
- docs/freeze-exit-bundle.md:448 — `them: excluded before the gate on TWO independent grounds (czEv null; parlaysLive`
- docs/freeze-exit-bundle.md:461 — `POOL-ELIGIBLE ticket (czDec non-null, 'parlays'/'parlaysMixed', no live legs)`
- docs/harness-substitutions.md:545 — `'czEv ≥ 2' test **directly to 'd.parlays'**. The owner then specced a UI change on that`
- docs/hrr-recalibration.md:91 — `> compatibility established 07-30 (legs carry 'lkey'+'cz', 'grading.legs' holds`
- docs/hrr-recalibration.md:132 — `> stakes grading at consensus truth is the CZ vig drag; in-loop at λ=1 the gate`
- docs/multibook-memo.md:36 — `> hits/K's that CZ's Over-only ladders never price — and it is UNPRICED.** Every`
- docs/multibook-memo.md:83 — `{DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,`
- docs/multibook-memo.md:89 — `**THE PLAYABLE PRIZE — best-of-{CZ, MGM}, the set the owner can actually bet (n=511`
- docs/multibook-memo.md:94 — `| per LEG: max(CZ,MGM) − CZ | **+1.01 pp mean** (median +0.00, p75 +1.60), **44% of legs improved** — empirically confirming the owner's dispersion arithmetic (analytic ≈ +0.95): e…` [x2]
- docs/multibook-memo.md:96 — `…rtifacts. **Follow-up, dated: the first day carrying BOTH a board and 'fp' (07-28 onward) computes the exact per-ticket argmax gains and the +2%-new-clears count over {CZ, MGM}** |`
- docs/multibook-memo.md:100 — `**Per-market per-leg gain (max(CZ,MGM) − CZ)** — the gain is IN the ticket markets:` [x2]
- docs/multibook-memo.md:181 — `key instability: 22 existed pre and gained cz/MGM/fair coverage by close (coverage`
- docs/multibook-memo.md:187 — `(fourth claim, owner's catch again)**: the prediction store's 'PredRecord' carries **'cz'`
- docs/multibook-memo.md:194 — `hits/K's rows with non-null 'cz' in those blobs; the owner runs (typing his own secret):`
- docs/multibook-memo.md:213 — `- **Vintage**: 'cz' is the GENERATION-TIME price — merge rule is last-pre-start write`
- docs/multibook-memo.md:219 — `'records[k] = {k, label, sub, market, lkey, p, pModel, pMkt, cz, czEv, ln, susp, src, …}'.` [x2]
- docs/multibook-memo.md:220 — `- **The branches, committed now**: (1) rows join carrying both 'cz' and 'fp' → the hits`
- docs/multibook-memo.md:223 — `fourth outcome. (2) rows join but 'cz' is null throughout hits/K's → **the field is`
- docs/multibook-memo.md:233 — `count of rows carrying BOTH a CZ price and an MGM 'fp' price · the fixture-day`
- docs/multibook-memo.md:243 — `branch: the joined gain is NEGATIVE on any market → MGM prices worse than CZ`
- docs/multibook-memo.md:248 — `recompute — is measured over the **canonical-key archive population** (§2c): CZ priced at`
- docs/multibook-memo.md:249 — `canonical keys only, and every CZ-alternate-only row (ALL hits and K's rows, deep HR/TB`
- docs/multibook-memo.md:251 — `CZ price on existing rows; these numbers do not carry forward to it unre-measured.`
- docs/multibook-memo.md:267 — `> settle at CZ from the feed today — which is why hits legs never reach the pool.`
- docs/multibook-memo.md:304 — `'consensusFair' from all books and THEN discards everything on 'if (cz == null) return`
- docs/multibook-memo.md:316 — `| population | examined | sighted | cz-guard discarded | **discarded WITH a computable fair** |`
- docs/multibook-memo.md:321 — `Both sightings ('sightProp''s 'am == null' and 'sightGameLeg''s 'cz == null') confirmed to`
- docs/multibook-memo.md:324 — `rows**, and CZ sits INSIDE the consensus on 36 of 111 (in-panel where present, out where`
- docs/multibook-memo.md:352 — `The owner pre-committed the branches before the check ran: *"CZ entries present in raw`
- docs/multibook-memo.md:358 — `row' in 'data/props/2026-07-27.json' (2 snapshots), row counted CZ-present iff 'cz' is` [x2]
- docs/multibook-memo.md:362 — `07-28): hits **0/7,033 CZ-present, zero on 14 of 14 days**; K's **0/830, zero on 14 of`
- docs/multibook-memo.md:363 — `14**; the four CZ-present markets are present on **every** day at 60–79%. Perfectly`
- docs/multibook-memo.md:366 — `3. **Parser audit** ('tools/snapshot_props.py compact()'): 'cz' is set for ANY row where`
- docs/multibook-memo.md:368 — `exact string equality; no market-conditional cz logic exists. The only surface left was`
- docs/multibook-memo.md:381 — `'SH_PROP_MARKETS + SH_PROP_ALT'. **Production already prices hits/K's rows at CZ.**`
- docs/multibook-memo.md:386 — `alternates; 14 days of archive are blind to every CZ-alternate-only quote, and the memo`
- docs/multibook-memo.md:388 — `K's were never feed-unsettleable at CZ; the largest stated justification for the MGM`
- docs/multibook-memo.md:391 — `not advocacy: CZ's hits/K's ladders are **Over-only milestone boards** (an Under hits/K's`
- docs/multibook-memo.md:392 — `leg still has no CZ price), and a one-sided quote can never make a row 'czf' (two-sided` [x2]
- docs/multibook-memo.md:393 — `fair) — CZ contributes a playable price there, never a fair.`
- docs/multibook-memo.md:398 — `props unposted, not CZ-specific). Per the pre-committed reading: **M13 stands as an`
- docs/multibook-memo.md:399 — `existence proof that CZ appears under the alternates, NOT as a coverage rate**; the`
- docs/multibook-memo.md:401 — `production-side join above (24/36 hits, 20/27 K's cz-present on 07-26) supplies the`
- docs/multibook-memo.md:403 — `Observed CZ outcome counts in the raw alt payload — counted, not inferred:`
- docs/multibook-memo.md:407 — `The one-sided-cannot-czf mechanism, cited: 'tools/snapshot_props.py' L69–72 ('fb' is`
- docs/multibook-memo.md:408 — `appended only inside the '"o" in pair and "u" in pair' branch) → L104 ('czf = CZ in fb');` [x2]
- docs/multibook-memo.md:409 — `engine-side 'legacy/index.html' L1419 ('czAlt' is a ladder FALLBACK for the playable price`
- docs/multibook-memo.md:417 — `ever CZ-priceable (Over-only ladders); the ~26% Under side has no CZ price from any key.` [x2]
- docs/multibook-memo.md:421 — `'czDec' under 'czAll' — **one CZ-less leg nulls the ticket's 'czEv'**` [x4]
- docs/multibook-memo.md:424 — `'czDec != null', L3007). Census on the 07-26 pool: **110 CZ-less legs across 64 of 110` [x2]
- docs/multibook-memo.md:425 — `pool tickets — filter misses: 0 of 64** (no CZ-less ticket carries a non-null czEv).` [x2]
- docs/multibook-memo.md:426 — `Leg-level Over-only confirmed: **all 25 hits-Under and all 8 K's-Under legs lack CZ**`
- docs/multibook-memo.md:433 — `**a ledger ticket that settled an Under hits/K's leg at CZ retracts Over-only, dated.**`
- docs/multibook-memo.md:434 — `(07-27 population): HR — CZ present on **100% of 0.5 rows (305/305), 64% of 1.5, 0% of`
- docs/multibook-memo.md:435 — `2.5**; TB — CZ posts **exactly one line per player** (267 one-line, 0 multi-line), and`
- docs/multibook-memo.md:436 — `cz-absent rows carry median 1 book behind the fair vs 4 for cz-present (thin alt rungs).` [x2]
- docs/multibook-memo.md:437 — `On the one alternate-probe event CZ posted nothing under HR-alt or TB-alt, so the deep`
- docs/multibook-memo.md:438 — `rungs there look genuinely unposted by CZ — one-event caveat. Partial absence = ladder`
- docs/multibook-memo.md:463 — `CLV display will show the vintage boundary (CZ hits/K's closes appearing post-fix).`
- docs/multibook-memo.md:475 — `4. **The 14 archived days are UNRECOVERABLE for CZ hits/K's** — recorded in`
- docs/multibook-memo.md:483 — `backfilled). It records per row the CZ price ('cz'/'czOdds'), the DK/FD basis, and a book` [x3]
- docs/multibook-memo.md:488 — `| market | board rows | joined | production cz-present | archive cz-present |` [x2]
- docs/multibook-memo.md:510 — `(2026-07-28, latest)**: production has CZ where the archive doesn't (hits/K's); the`
- docs/multibook-memo.md:529 — `**The residual, stated plainly (owner's item 4)**: production prices CZ on **24/36`
- docs/multibook-memo.md:531 — `CZ coverage on these markets is ~67–74%, not 100% and not 0%. **MGM's coverage argument`
- docs/multibook-memo.md:533 — `on the ~10–12 CZ-null matched rows plus the price increment on the CZ-priced ones, and` [x2]
- docs/multibook-memo.md:541 — `do it within ~15 minutes of a props snapshot hour so CZ/MGM comparisons are`
- docs/multibook-memo.md:548 — `market; CZ's measured baseline is the 1.071 overround);`
- docs/multibook-memo.md:549 — `2. best-of-{CZ,MGM,Circa} vs best-of-{CZ,MGM} — Circa's marginal increment per leg and` [x2]
- docs/multibook-memo.md:565 — `**Head-to-head MGM vs CZ is a wash**: on 511 rows of 2026-07-27's props archive carrying`
- docs/multibook-memo.md:566 — `both prices, per-leg EV(MGM) − EV(CZ) at the row's fair: **median +0.00 pp, mean +0.08**,`
- docs/multibook-memo.md:567 — `IQR ±1.6. MGM better on 223, CZ on 245. The Circa "half the hold" claim is **unmeasurable`
- docs/multibook-memo.md:575 — `| best-of{DK,FD,MGM,CZ} vs settling blind at CZ | 511 | **+1.70 pp mean / +1.30 median**, 371 legs improved | ≈ **+5.1 pp** |` [x2]
- docs/multibook-memo.md:576 — `| **MGM's marginal increment over the current {DK,FD,CZ} basis** | 511 | **+0.75 pp mean** (median 0 — tail value), 170 legs improved | ≈ **+2.2 pp** |`
- docs/multibook-memo.md:579 — `DK/FD basis vs CZ: **median +3.20 pp, mean +7.13**. 17 tickets cleared +2% at CZ (they died` [x2]
- docs/multibook-memo.md:595 — `| 'shTicketSnap' (L3365) | writes 'czOdds/czDec' "straight" plus 'bs*' — settlement implicitly Caesars; **no settlement-book field exists** |` [x2]
- docs/multibook-memo.md:596 — `| grader | pays P/L from the ticket's cz price (NV-confirm overlays cz) |` [x2]
- docs/multibook-memo.md:598 — `| 'ledger-segments' (L70–74, 208, 241) | 'nvTax' ≡ "what settling at Caesars cost vs the basis" — meaningless when settlement ≠ CZ |`
- docs/multibook-memo.md:599 — `| settlement-audit | outcome-grading is book-agnostic (statsapi); P/L reconstruction assumes cz |`
- docs/multibook-memo.md:603 — `as 'sb ?? "cz"' — every historical entry stays valid on first write and forever. Downstream:`
- docs/multibook-memo.md:604 — `grader pays at 'sbDec ?? czDec'; CLV sights the 'sb' book's close (a Circa-settled ticket`
- docs/multibook-memo.md:611 — `- 'coreCzEvMin' (the settlement floor) must apply **at the ticket's actual settlement`
- docs/multibook-memo.md:613 — `whole-slip price (one book per parlay). CZ stops being special; it becomes one candidate.`
- docs/nfl-desk.md:82 — `…te can carry), revalidateSec 7200, liveRevalidateSec 600, boardRetainSec 36 h, czMissingRevalidateSec 1800, czMissingWindowSec 4 h, regions 'us', minBooks 2, settleBook 'williamhil…` [x2]
- docs/nfl-desk.md:111 — `…dentical, so NO side clears the +2 % core gate on the fixture (builder A's report: best evCz −0.72) — the store test sweetens in-test; a core-bearing fixture needs a deliberate pri…`
- docs/phase2-memo.md:12 — `| **inputs accruing** ('fp', 'fair', 'cz' in 'props-history') | **NO** | a GitHub Actions archive on the 'line-history' branch, public |`
- docs/phase2-memo.md:354 — `| Caesars-in-fair ('czf') | — | — | — | **UNMEASURABLE** |`
- docs/phase2-memo.md:360 — `and 'czf' were added to 'snapshot_props.py' on 2026-07-25/26 and are absent from this`
- docs/phase2-memo.md:370 — `> **The second caveat is worse than it looks, because 'czf' IS the 'booksInd' dimension.**`
- docs/phase2-memo.md:510 — `Series B also supports a **Caesars-only Shin** variant via the stored 'cz' pair`
- docs/phase2-memo.md:537 — `| 'fair', 'n', 'cz', 'czf', 'bo', 'bu', 'no' | same | 07-12 / 07-25 / 07-26 respectively |` [x2]
- docs/phase2-memo.md:546 — `'line-history' branch, readable by anyone with the repo. 'fp', 'fair', 'cz' are all`
- docs/phase2-memo.md:605 — `'kind: "close"' snapshot as the close instead of taking the last one; carry 'bo'/'bu'/'czf',`
- docs/phase2-memo.md:718 — `| 'bo'/'bu'/'czf' postdate the vintage | unchanged |`
- docs/phase2-memo.md:746 — `| **consensus depth / 'czf'** — "the de-vigged consensus behind a prop row is often thin" | 'data/props' | **YES — relabelled.** Snapshot 1: mean 'n' **1.40**, 'czf' **2.2%**. Snap…` [x3]
- docs/phase2-memo.md:750 — `**The later reading is DEEPER, not thinner** — 1.66 books vs 1.40, and 'czf' (settlement book`
- docs/progress.md:268 — `…very 'createEngine' call (engine-client, /api/generate, the scheduler), so the engine's 'cz*' numbers, the Builder, the Board, the lock card and the paper ledger are DraftKings-pri…`
- docs/progress.md:272 — `…Caesars and DraftKings keys exchanged; the parlay-generator fixtures pass 'pricingBook: "CZ"' because the captured pool predates this change; 'docs/harness-substitutions.md' docume…`
- docs/progress.md:429 — `… independent-sample significance claimed. Today's public card: one $15 core experiment, czEv -12.5, forced:true, gatedSum:0. Grading football tickets is not learned football weight…`
- docs/session-handoff.md:73 — `- MLB: blended czEv > 0;`
- docs/session-handoff.md:133 — `…x scores (in parallel, ≤16) on each pass with 'gradePrediction'. A ticket counts only when every leg graded won, priced at confirmed or czDec (never czOdds). The read never throws.` [x2]
- docs/session-handoff.md:147 — `4. czOdds fallback → fixed (removed).`
- docs/session-handoff.md:182 — `… the bare name ('propRowLabel'). A sportsbook hide saved under the old "Name (null)" key migrates to the bare key once, on load ('migrateCzHidden'), so nothing Josh hid comes back.`
- docs/session-handoff.md:642 — `remaining allowance (10 − carried − gated); (3) no retry after thin-pool fires (CZ`
- docs/session-handoff.md:781 — `…eRules' (= 'CORE_RULES' in 'src/lib/paper-mode.ts', since "2026-09-03") and 'probRaw'/'czEvRaw'/'bsEvRaw' beside the shrunk numbers. Diagnosis measured over the 19 paper days 2026-…`
- docs/session-handoff.md:782 — `…untouched); ticket prob scales by ∏legP'/∏legP (the engine's simJoint number survives); czEv/bsEv/ev recomputed. Motivation: 56.0 predicted vs 46 actual; HRR edge buckets inverted.`
- docs/session-handoff.md:783 — `2. **Raw numbers recoverable** ('src/lib/server/lock-card.ts' toTicket): 'probRaw', 'czEvRaw', 'bsEvRaw' on every core/alt ticket. 'validateLedger' is additive (index signature) — …`
- docs/session-handoff.md:834 — `… chip with the cutoffs in its title ('GradeChip.tsx'). Every Board grade — live rows on czEv/bsEv, stamped picks and All-scope rows on edge — flows through 'gradeFromEv', so S appe…`
- docs/session-handoff.md:861 — `…board/page.tsx', the 'allRows' memo) now keeps only the prop-board lines Caesars posts ('cz.o' priced); a line only another book posts at a different number — the "O 0.5 H+R+RBI" r…`
- docs/session-handoff.md:865 — `…here some market has no Caesars quote on any row is re-priced every 'CFB_PROPS.czMissingRevalidateSec' (30 min) inside 'czMissingWindowSec' (4 h) of kickoff; zero-row games stay on…` [long line; 3 occurrences on this line; first shown]
- docs/session-handoff.md:961 — `- ITEM 2 — VARIANT A, what Josh most likely saw: a board generated pregame, 'czEv' frozen at the value 'legacy/index.html:2531' computed then ('shEV(r.p, czDec)', emitted as a PERC…` [x3]
- docs/session-handoff.md:1006 — `('playable = !!cz && upcoming', 'src/lib/cfb/props.ts'): a market-derived fair has zero edge over`
- docs/session-handoff.md:1098 — `'evOpp' beside 'evCz', and 'mlbLiveView(q, side)' ('src/lib/mlb/live-client.ts') is the ONE place`
- docs/session-handoff.md:1562 — `… independent-sample significance claimed. Today's public card: one $15 core experiment, czEv -12.5, forced:true, gatedSum:0. Grading football tickets is not learned football weight…`
- docs/session-handoff.md:1694 — `…) now passes 'settlementBook: SETTLE_BOOK' and the facade rebinds that variable, so the 'cz*' fields on rows, parlays, tickets and the lock card are DraftKings numbers; 'attachBook…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:1712 — `…ftKings-only toggle are gone (DK is the settlement book everywhere via 'SETTLE_BOOK'; 'czOnly' stays in the spec type, default false, no UI); the sheet is chip rows: Legs · **Categ…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1809 — `'{czHidden: {key: {hidden, at}}}', last-write-wins per key by 'at';`
- docs/session-handoff.md:1810 — `'src/lib/cz-offered.ts' pulls on load + pushes on toggle when the device holds the`
- docs/session-handoff.md:1815 — `'src/lib/cz-hidden-merge.ts' (client + route import the SAME merge, ledger-merge`
- docs/session-handoff.md:1819 — `'removeItem'; tombstones prune after 'CZ_PRUNE_MS' 45d (hides never expire);`
- docs/session-handoff.md:1822 — `'pl:prefs:v1' — never replaces — 413 over 'CZ_MAX_BYTES' 256KB. Client: NEW ls key`
- docs/session-handoff.md:1823 — `'pl_cz_hidden_v2' '{hidden,at}' per key; **v1 migrates on first load and is LEFT IN`
- docs/session-handoff.md:1827 — `'tests/cz-sync.test.ts' (14) observed RED first (module-missing). Gate: **106`
- docs/session-handoff.md:1848 — `phraseless browser: hide → **'pl_cz_hidden_v2' wrote`
- docs/session-handoff.md:1853 — `read:** c69dcc6's 'czHiddenHere = rows.length - visibleRows.length' counted`
- docs/session-handoff.md:1856 — `"1 pick hidden". Guard added (cz-sync.test.ts); gate 106/834, tsc 0. Shipped as`
- docs/session-handoff.md:1867 — `null-priced rows wear "—"). A grade is a LABEL ON THE ENGINE'S OWN EV — czEv (bsEv in`
- docs/session-handoff.md:1881 — `ev_gated/caesars_ev→czEv, probability→prob; stable; ORDERING ONLY — every pick still`
- docs/session-handoff.md:1948 — `— deterministic composer over the board's own HR-over rows (engine prob + CZ price,`
- docs/session-handoff.md:2670 — `≥2 and no-op, and cz/bs/cons reprice a single decimal — so the branch is expected dark. It is`
- docs/session-handoff.md:4414 — `'date', 'locked', 'core[]', 'funT[]' (tickets: 'id', 'stake', 'prob', 'czDec', 'czEv',` [x2]
- docs/session-handoff.md:4415 — `'legs[]' with 'lkey'/'label'/'prop'/'cz'), 'bankroll', 'grading.legs{}' keyed`
- docs/session-handoff.md:4456 — `hit = won/(won+lost) → 46.3 ±0.05 pp; implied = mean of am→prob('l.cz') over`
- docs/session-handoff.md:4499 — `entry.bankroll × max(0, min(0.25 × kelly(prob/100, czDec), 0.02)))' — 'prob' and`
- docs/session-handoff.md:4500 — `'czDec' present since 2026-07-11, 'kellyStakeMult' = 4 frozen — and print: how`
- docs/session-handoff.md:4510 — `tickets and what was staked on them; (3) count with negative 'czEv' at`
- docs/session-handoff.md:4528 — `{susp, watch, bsBadge, czBadge, edgeBadge} on pitcher_outs rows, non-empty`
- docs/session-handoff.md:4884 — `| 'batter_hits' | 247 | 12 | 4.9% | — *(no 'cz' on hits rows)* |`
- docs/session-handoff.md:5065 — `$250 vs a $10 ceiling = 25.0×, 6 of 6 over, 5 $0-ceilings, 5 negative-czEv**; **'caesars_ev'`
- docs/session-handoff.md:5066 — `$250 vs $265 = 0.9×, 2 over, ZERO negative-czEv**; 'ev_gated' $225 vs $225 = **1.00×, zero`
- docs/session-handoff.md:5524 — `LIVE FIRE WAS A FALSE ONE:** the $2 "K's single" flagged 'ticketDec 1.6757' vs 'legCz`
- docs/session-handoff.md:5528 — `correction is dated. **Fixed with unit conversion (|cz| ≥ 100 → American; 1.01–51 →`
- docs/session-handoff.md:5765 — `ORDER (the arrays the tabs render; sort r.prob, engine L2575), storing p/pMkt/edge/cz`
- docs/session-handoff.md:5774 — `player, line, price (cz/odds/book), model prob, implied, edge, susp flag — plus the`
- docs/session-handoff.md:5852 — `(reading 32):** 0 singles / 2 parlays — both 2-leg Total Bases (stakes $16 czEv 2.8, $23`
- docs/session-handoff.md:5853 — `czEv 7.7); **zero singles cleared the gate = the GATE reading, declared VACUOUS by the`
- docs/session-handoff.md:6343 — `| 'l.cz' is American | a decimal price (e.g. '2.5') yields **97.6% implied** — plausible and wrong | **warns with the count and examples** |`
- docs/session-handoff.md:6549 — `re-typed in 'tools/gate_activity.py' — 'czEv >= 2' ('coreEvMin'), 'legs > 3' ('coreMaxLegs'),`
- docs/session-handoff.md:6550 — `'czDec > 15' ('coreMaxDec'), 'ro.get('need', 100)' ('consMinN') — all four agree, and the first`
- docs/session-handoff.md:6805 — `| 6 | 'coreCzEvMin' | the settlement floor at Caesars |`
- docs/singles-vs-parlays.md:27 — `expressions (L2641–2712) — 'czEv = prob*czDec − 1', 'consCzEv = (imp/100)*czDec − 1',` [x4]
- docs/singles-vs-parlays.md:51 — `| stake | ticket | czEv | hit | consCzEv |` [x2]
- docs/singles-vs-parlays.md:67 — `and the per-leg 'consCzEv' distribution does not come close:`
- docs/singles-vs-parlays.md:106 — `### 1. Per-leg czEv behind each card — the pools are the same quality`
- docs/singles-vs-parlays.md:113 — `**The hypothesis is not confirmed at the card level.** Mean per-leg czEv is 5.80% vs 5.76% —`
- docs/singles-vs-parlays.md:176 — `> Every number above was computed in a one-book world. With PLAYABLE = {CZ, MGM}`
- docs/singles-vs-parlays.md:205 — `> mean-shift (czDec + gain/p; +1.01 pp legs, +1.42/+1.58/+1.74 pp slips at k=2/3/4) and`
- docs/singles-vs-parlays.md:271 — `> 'min($62.50, 2500 × kelly(p, czDec))' per ticket, and on the 1-book parlay card ticket 5's`
- docs/singles-vs-parlays.md:276 — `> (pools re-gated and re-staked at bumped 'czEv'/'czDec', mean-shift +1.01/+1.42/+1.58/+1.74):` [x2]
- docs/singles-vs-parlays.md:344 — `> 'czEv ≥ coreEvMin' (L3002; 'coreEvMin: 2', frozen, L1075) — better prices admit more`
- docs/singles-vs-parlays.md:506 — `> | czEv of ticket | 7.0% | 12.9% | 25.5% | 26.5% | 3.3% | 6.6% |`
- docs/singles-vs-parlays.md:770 — `| stake | ticket | czEv | hit |`

##### cz identifier fragment (cz, czEv, evCz, czMissing, _cz ... ; names and hashes excluded) — tools (43 lines)

- .github/workflows/board-archive.yml:9 — `# czEv/bsEv/consCzEv. So Phase 3's >=20-board threshold was unreachable by construction:` [x2]
- tools/archive_boards.py:18 — `parlays[] czEv/bsEv/consCzEv -> the +2%-gate chain` [x2]
- tools/gate_activity.py:83 — `return t.get("czEv") is not None and t["czEv"] >= 2` [x2]
- tools/gate_activity.py:92 — `"coreMaxDec(15)": {"fires": sum(1 for t in tix if t.get("czDec") and t["czDec"] > 15), "of": len(tix), "unit": "tickets over the odds ceiling"},` [x2]
- tools/hr_overround.py:9 — `worth ~+0.6pp of czEV. But 'batter_home_runs' is 'n = 0' on 100% of rows: no book`
- tools/hr_overround.py:13 — `overround 1.07 -> czEV overstated ~+0.7pp`
- tools/hr_overround.py:14 — `overround 1.15 -> czEV overstated ~+5.5pp`
- tools/hr_overround.py:15 — `overround 1.25 -> czEV overstated ~+11.7pp`
- tools/hr_overround.py:211 — `f"overround {ov:.3f} vs the hardcoded 1.06 -> czEV overstated ~{65 * (ov / 1.06 - 1):.1f}pp "`
- tools/ledger-report.mjs:13 — `* recomputable without 'selMode' because 'prob' and 'czDec' are present since`
- tools/ledger-report.mjs:56 — `export function kellyFrac(prob, czDec) {`
- tools/ledger-report.mjs:57 — `if (prob == null || czDec == null) return null;`
- tools/ledger-report.mjs:58 — `const p = Number(prob) / 100, d = Number(czDec);`
- tools/ledger-report.mjs:102 — `const czs = entries.flatMap((e) => [...(e.core ?? []), ...(e.funT ?? [])].flatMap((t) => (t.legs ?? []).map((l) => l.cz))).filter((c) => c != null && Number.isFinite(Number(c)));` [x2]
- tools/ledger-report.mjs:103 — `const suspect = czs.filter((c) => Math.abs(Number(c)) < 100 && Number(c) !== 0);`
- tools/ledger-report.mjs:104 — `if (suspect.length) warnings.push('${suspect.length} of ${czs.length} \'cz\' values have |cz| < 100 (e.g. ${suspect.slice(0, 3).join(", ")}) — American odds never do. If these ar…` [x3]
- tools/ledger-report.mjs:114 — `const f = kellyFrac(t.prob, t.czDec);`
- tools/ledger-report.mjs:117 — `…ush({ date: e.date, id: t.id, stake: t.stake, ceiling, ratio: ceiling > 0 ? +(t.stake / ceiling).toFixed(2) : Infinity, market: mkt(t), czEv: t.czEv, selMode: e.selMode ?? null });` [x2]
- tools/ledger-report.mjs:127 — `/* 'Number(null)' is 0 and '0 < 0' is false, so an ABSENT czEv was silently classified`
- tools/ledger-report.mjs:129 — `negativeCzEv: rows.filter((r) => (num(r.czEv) ?? 0) < 0).length,` [x2]
- tools/ledger-report.mjs:130 — `czEvUnknown: rows.filter((r) => num(r.czEv) === null).length,` [x2]
- tools/ledger-report.mjs:151 — `const ip = amToProb(l.cz); if (ip != null) imps.push(ip);`
- tools/ledger-report.mjs:251 — `if (excluded) console.log('(0) ${excluded} of ${o.tickets} tickets have NO computable ceiling (prob or czDec missing/invalid) — EXCLUDED from (1), not counted as compliant.');`
- tools/ledger-report.mjs:256 — `console.log(' negative czEv at placement: ${o.negativeCzEv}');` [x2]
- tools/phase2_series_b.py:49 — `"""{(event, market, player, line): (fair, n, czf)} for one snapshot"""`
- tools/phase2_series_b.py:61 — `out[(e["id"], mkt, who, lnf)] = (r["fair"], r.get("n") or 0, bool(r.get("czf")))`
- tools/phase2_series_b.py:90 — `for k, (f0, n0, cz0) in o.items():`
- tools/phase2_series_b.py:98 — `"n_open": n0, "n_late": l[k][1], "czf_open": cz0,` [x2]
- tools/price-path.mjs:18 — `* WHY 'fair' AND NOT 'bo'/'cz': 'fair' is already a probability, so it is comparable across`
- tools/price-path.mjs:20 — `* different things at -110 and at +400 — and 'cz' is null on a large share of rows (the CZ-less` [x2]
- tools/selection_effect.py:66 — `pool = [p for p in (d.get("parlays") or []) if p.get("czDec") is not None]`
- tools/selection_effect.py:68 — `if p.get("czDec") is not None and not any(l.get("live") for l in p["legs"])]`
- tools/selection_effect.py:71 — `or len(pl["legs"]) > 3 or (pl.get("czDec") is not None and pl["czDec"] > 15))` [x2]
- tools/selection_effect.py:72 — `sel_tix = [p for p in pool if core(p) and (p.get("czEv") or -99) >= 2]`
- tools/snapshot_props.py:27 — `CZ = "williamhill_us"`
- tools/snapshot_props.py:58 — `1. is the settlement book pricing itself? -> 'czf'`
- tools/snapshot_props.py:61 — `'n = 1' plus a two-sided 'cz' recovers (1) exactly for past days, but (2) is`
- tools/snapshot_props.py:68 — `is_cz = bk["key"] == CZ` [x2]
- tools/snapshot_props.py:78 — `r = acc.setdefault(m["key"], {}).setdefault(kk, {"fairs": [], "fb": [], "fp": {}, "no": 0, "cz": None, "bo": None, "bu": None})`
- tools/snapshot_props.py:91 — `if is_cz:`
- tools/snapshot_props.py:92 — `r["cz"] = {"o": pair.get("o"), "u": pair.get("u")}`
- tools/snapshot_props.py:114 — `"czf": CZ in r["fb"],` [x2]
- tools/snapshot_props.py:124 — `"cz": r["cz"],` [x2]

#### BetMGM

50 matching lines in 23 files (242 occurrences).

##### BetMGM — fetch code (1 lines)

- app/api/ufcprops/route.ts:18 — `const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);`

##### BetMGM — config (1 lines)

- src/lib/sportsbook/books.ts:5 — `{key:'betmgm',label:'BetMGM',short:'MGM'},` [x2]

##### BetMGM — calculations (3 lines)

- legacy/index.html:529 — `…OOKS=[{id:uid(),name:"Circa Sports",url:"https://www.circasports.com"},{id:uid(),name:"BetMGM NV",url:"https://sports.nv.betmgm.com"},{id:uid(),name:"Caesars NV",url:"https://sport…` [x2]
- src/engine/legacy-src.gen.ts:5 — `…[{id:uid(),name:\"Circa Sports\",url:\"https://www.circasports.com\"},{id:uid(),name:\"BetMGM NV\",url:\"https://sports.nv.betmgm.com\"},{id:uid(),name:\"Caesars NV\",url:\"https:/…` [long line; 2 occurrences on this line; first shown]
- src/lib/prop-lean.ts:75 — `if (k.includes("betmgm") || k === "mgm") return "MGM";`

##### BetMGM — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:40 — `betmgm: "MGM",`
- src/components/cfb/CfbProps.tsx:113 — `betmgm: "MGM",`
- src/components/props/props-model.ts:70 — `betmgm: "MGM",`

##### BetMGM — tests (35 lines)

- tests/cfb-h1.test.ts:63 — `…opts, names), book("fanduel", "FanDuel", { ...opts, homeSpreadPrice: -110 }, names), book("betmgm", "BetMGM", { ...opts, homeSpreadPrice: -110 }, names)].slice(0, opts.books ?? 3),` [x2]
- tests/cfb-props.test.ts:159 — `// at 245.5: DK -115 (1.8696), FD -114 (1.8772), MGM -110 (1.9091) → BetMGM; EV = 100·(0.508664·0.909091 − 0.491336)`
- tests/cfb-props.test.ts:161 — `expect(r.best?.book).toBe("betmgm");`
- tests/cfb-props.test.ts:207 — `expect(r.best?.book).toBe("betmgm");`
- tests/discovery-release.test.ts:107 — `expect(rowQuoteAt(row)).toBe("2026-09-20T18:00:00Z");expect(rowQuoteAt({...row,displayBook:"betmgm"})).toBeNull();`
- tests/dkfd-basis.test.ts:13 — `The NV-blindness proof: perturb Caesars/BetMGM quotes by scaling both sides'`
- tests/dkfd-basis.test.ts:34 — `const NV_BOOKS = new Set(["williamhill_us", "betmgm"]);`
- tests/dkfd-basis.test.ts:129 — `it("wild CZ/BetMGM price perturbation (fair-preserving) leaves every pick, ranking, and card byte-identical", async () => {`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:524 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:525 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3177 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3178 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4451 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4452 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5585 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5586 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6504 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6505 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8925 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8926 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9793 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9794 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11465 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11466 — `"title": "BetMGM",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:575 — `"key": "betmgm",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:576 — `"title": "BetMGM",`
- tests/fixtures/fix39/odds.json:1 — `…:"Over","price":100,"point":9.0},{"name":"Under","price":-121,"point":9.0}]}]},{"key":"betmgm","title":"BetMGM","last_update":"2026-07-10T05:50:48Z","markets":[{"key":"h2h","last_u…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…betrivers":{"book":"betrivers","title":"BetRivers","price":130,"line":null,"dec":2.3},"betmgm":{"book":"betmgm","title":"BetMGM","price":140,"line":null,"dec":2.4},"fanatics":{"boo…` [long line; 160 occurrences on this line; first shown]
- tests/fixtures/nfl/odds-event-props-401872925.json:806 — `"key": "betmgm",`
- tests/fixtures/nfl/odds-event-props-401872925.json:807 — `"title": "BetMGM",`
- tests/props-model.test.ts:70 — `expect(bookAb("BetMGM")).toBe("MGM");`
- tests/sportsbook.test.ts:16 — `…ute another book when selected book is missing',()=>{const out=priceFootballProp(prop,'betmgm');expect(out.cz).toBeNull();expect(out.grade).toBeNull();expect(out.playable).toBe(fal…`
- tests/sportsbook.test.ts:26 — `…noffered tickets have no combined selected-book odds',()=>{const out=priceMlbBoard(data,'betmgm');expect(out.parlays[0].czDec).toBeNull();expect(out.parlays[0].czEv).toBeNull();});`
- tests/sportsbook.test.ts:27 — `…book',()=>{const row=data.propBoard![0].markets.batter_hits[0];expect(priceMlbProp(row,'draftkings').cz).toEqual({o:120,u:null});expect(priceMlbProp(row,'betmgm').o).toBeNull();});`
- tests/sportsbook.test.ts:64 — `expect(priceMlbRow(row,'betmgm',index).czKellyF).toBeNull();`

##### BetMGM — docs (7 lines)

- CLAUDE.md:937 — `…ti-book scoping memo (2026-07-28, corrected three times same day)**: feed census (only BetMGM of five targets; DK/FD NOT playable from NV — verified); THE PLAYABLE PRIZE **+1.01 pp…`
- ENGINE2.md:338 — `**The proof** ('tests/dkfd-basis.test.ts'): CZ + BetMGM quotes perturbed by scaling`
- docs/multibook-memo.md:57 — `Owner context: live BetMGM NV and Circa accounts exist. 'PLAY_BOOKS' is a single-entry`
- docs/multibook-memo.md:65 — `| **betmgm** | ✅ h2h, totals | ✅ **5 of 6** on the sampled event (hits, TB, HRR, K's, outs — no 'batter_home_runs' there; single-event sample, re-check on a fuller day) |`
- docs/multibook-memo.md:72 — `via the proxy queries in this memo's history. **Only BetMGM of the five targets is in the`
- docs/multibook-memo.md:77 — `manual either way (this system prices, the owner executes). Feed-'betmgm' is the national`
- docs/session-handoff.md:822 — `…d's H+R+RBI row "Jose Caballero (NYY)" carried 'lu: "projected"' and a generation-time BetMGM −155, 'gameInfo' said the Yankees lineup was not posted when it was built, and statsap…` [long line; 1 occurrences on this line; first shown]

#### mgm outside 'betmgm'

41 matching lines in 10 files (45 occurrences).

Note: Short label 'MGM' and prose about a BetMGM account; no separate book key.

##### mgm outside 'betmgm' — config (1 lines)

- src/lib/sportsbook/books.ts:5 — `{key:'betmgm',label:'BetMGM',short:'MGM'},`

##### mgm outside 'betmgm' — calculations (1 lines)

- src/lib/prop-lean.ts:75 — `if (k.includes("betmgm") || k === "mgm") return "MGM";` [x2]

##### mgm outside 'betmgm' — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:40 — `betmgm: "MGM",`
- src/components/cfb/CfbProps.tsx:113 — `betmgm: "MGM",`
- src/components/props/props-model.ts:70 — `betmgm: "MGM",`

##### mgm outside 'betmgm' — tests (9 lines)

- tests/cfb-props.test.ts:138 — `// Ty Simpson pass yds: DK -115/-105 → 0.510834, FD -114/-106 → 0.508664, MGM -110/-110 → 0.5 at 245.5;`
- tests/cfb-props.test.ts:159 — `// at 245.5: DK -115 (1.8696), FD -114 (1.8772), MGM -110 (1.9091) → BetMGM; EV = 100·(0.508664·0.909091 − 0.491336)`
- tests/cfb-props.test.ts:168 — `// Katin Houser pass TDs O 1.5: CZ -125/-105, DK -120/-110, FD -118/-112, MGM -115/-115 → de-vigged`
- tests/cfb-props.test.ts:178 — `// Germie Bernard rec yds O 52.5 — MGM posts none, three books remain: median 0.504330, EV at CZ -110 = −3.72`
- tests/cfb-props.test.ts:199 — `// Jam Miller: CZ -140 → 0.583333/1.08, DK -135, FD -138, MGM -130 → sorted 0.523349, 0.531915, 0.536882, 0.540123`
- tests/cfb-props.test.ts:200 — `// true median = (0.531915 + 0.536882) / 2 = 0.534398; EV at CZ (1.714286) = −8.39; best = MGM -130 (1.769231), EV −5.45`
- tests/games.test.ts:114 — `{ label: "Miami Marlins ML", odds: "+140", book: "MGM", cz: "+135", gkey: "miamimarlins@kansascityroyals" },`
- tests/games.test.ts:155 — `expect(byPk[2].away.ml).toEqual({ odds: "+140", book: "MGM", cz: "+135" });`
- tests/props-model.test.ts:70 — `expect(bookAb("BetMGM")).toBe("MGM");`

##### mgm outside 'betmgm' — docs (27 lines)

- docs/multibook-memo.md:34 — `> on measurement, and nothing in this memo still argues for the MGM account on price`
- docs/multibook-memo.md:83 — `{DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,`
- docs/multibook-memo.md:89 — `**THE PLAYABLE PRIZE — best-of-{CZ, MGM}, the set the owner can actually bet (n=511`
- docs/multibook-memo.md:94 — `| per LEG: max(CZ,MGM) − CZ | **+1.01 pp mean** (median +0.00, p75 +1.60), **44% of legs improved** — empirically confirming the owner's dispersion arithmetic (analytic ≈ +0.95): e…` [x2]
- docs/multibook-memo.md:96 — `…-26 ticket-level restriction | **uncomputable** — per-book prices ('fp') begin 07-27, so MGM's 07-26 prices are unrecoverable. The DK/FD-basis ticket numbers below (+3.20 median, 1…` [x2]
- docs/multibook-memo.md:100 — `**Per-market per-leg gain (max(CZ,MGM) − CZ)** — the gain is IN the ticket markets:`
- docs/multibook-memo.md:181 — `key instability: 22 existed pre and gained cz/MGM/fair coverage by close (coverage`
- docs/multibook-memo.md:233 — `count of rows carrying BOTH a CZ price and an MGM 'fp' price · the fixture-day`
- docs/multibook-memo.md:243 — `branch: the joined gain is NEGATIVE on any market → MGM prices worse than CZ`
- docs/multibook-memo.md:268 — `> **Multi-book does not just improve prices; MGM settlement UNLOCKS hits and K's as`
- docs/multibook-memo.md:306 — `settlement book and is being thrown away with it. **As coded: a Circa/MGM-settled ticket`
- docs/multibook-memo.md:308 — `decoupling is necessary under multi-book anyway (every MGM-settled hits ticket would`
- docs/multibook-memo.md:354 — `claim inverts, and the largest stated justification for the MGM account disappears."* That`
- docs/multibook-memo.md:388 — `K's were never feed-unsettleable at CZ; the largest stated justification for the MGM`
- docs/multibook-memo.md:389 — `account disappears.** What remains for MGM is §2b's dispersion prize, now stamped (see the`
- docs/multibook-memo.md:484 — `COUNT ('books') — **not book identities and no MGM price** (field census: 'book, books,`
- docs/multibook-memo.md:502 — `production log" branch cannot execute: the production record retains **no MGM per-row`
- docs/multibook-memo.md:511 — `archive has MGM where production doesn't. The join ran on 07-26 (the only board day),`
- docs/multibook-memo.md:531 — `CZ coverage on these markets is ~67–74%, not 100% and not 0%. **MGM's coverage argument`
- docs/multibook-memo.md:541 — `do it within ~15 minutes of a props snapshot hour so CZ/MGM comparisons are`
- docs/multibook-memo.md:549 — `2. best-of-{CZ,MGM,Circa} vs best-of-{CZ,MGM} — Circa's marginal increment per leg and` [x2]
- docs/multibook-memo.md:565 — `**Head-to-head MGM vs CZ is a wash**: on 511 rows of 2026-07-27's props archive carrying`
- docs/multibook-memo.md:566 — `both prices, per-leg EV(MGM) − EV(CZ) at the row's fair: **median +0.00 pp, mean +0.08**,`
- docs/multibook-memo.md:567 — `IQR ±1.6. MGM better on 223, CZ on 245. The Circa "half the hold" claim is **unmeasurable`
- docs/multibook-memo.md:575 — `| best-of{DK,FD,MGM,CZ} vs settling blind at CZ | 511 | **+1.70 pp mean / +1.30 median**, 371 legs improved | ≈ **+5.1 pp** |`
- docs/multibook-memo.md:576 — `| **MGM's marginal increment over the current {DK,FD,CZ} basis** | 511 | **+0.75 pp mean** (median 0 — tail value), 170 legs improved | ≈ **+2.2 pp** |`
- docs/singles-vs-parlays.md:176 — `> Every number above was computed in a one-book world. With PLAYABLE = {CZ, MGM}`

#### Circa

22 matching lines in 5 files (25 occurrences).

Note: All sportsbook references (Circa is not in the Odds API feed per ENGINE2.md:85 and docs/multibook-memo.md:66).

##### Circa — calculations (2 lines)

- legacy/index.html:529 — `var DEFAULT_BOOKS=[{id:uid(),name:"Circa Sports",url:"https://www.circasports.com"},{id:uid(),name:"BetMGM NV",url:"https://sports.nv.betmgm.com"},{id:uid(),name:"Caesars NV",url:"…` [x2]
- src/engine/legacy-src.gen.ts:5 — `…rage.setItem(k,JSON.stringify(v));}catch(e){}}};\n\nvar DEFAULT_BOOKS=[{id:uid(),name:\"Circa Sports\",url:\"https://www.circasports.com\"},{id:uid(),name:\"BetMGM NV\",url:\"https…` [long line; 2 occurrences on this line; first shown]

##### Circa — docs (20 lines)

- CLAUDE.md:937 — `…CLV coupling RUN (38/319 props + 14/14 ML discards carried computable fairs; 47 panel signatures / 111 rows); Circa one-paste-day spec; sb schema; freeze posture execution-change |`
- ENGINE2.md:85 — `Circa is NOT in the feed — checked 2026-07-11).`
- docs/multibook-memo.md:57 — `Owner context: live BetMGM NV and Circa accounts exist. 'PLAY_BOOKS' is a single-entry`
- docs/multibook-memo.md:66 — `| **circa** | ❌ absent | ❌ absent — confirms the standing memory |`
- docs/multibook-memo.md:75 — `basis-eligible. Operationally: open the Circa app pre-lock, paste the props board (~1–2`
- docs/multibook-memo.md:306 — `settlement book and is being thrown away with it. **As coded: a Circa/MGM-settled ticket`
- docs/multibook-memo.md:537 — `## 3-CIRCA. ONE PASTE DAY TO MEASURE, THEN DECIDE — spec only, nothing built (2026-07-28)`
- docs/multibook-memo.md:539 — `- **What to paste**: the Circa app's MLB player-props listings per game (hits / TB / HRR /`
- docs/multibook-memo.md:543 — `- **Storage**: 'data/circa/<date>.txt' raw + a parsed JSON keyed exactly as the props`
- docs/multibook-memo.md:545 — `lenient one-off parser ('tools/circa_sample.py', ~an hour), NOT the app paste flow.`
- docs/multibook-memo.md:547 — `1. Circa's two-way hold per market vs Caesars' (per-line 'iO + iU − 1', median per`
- docs/multibook-memo.md:549 — `2. best-of-{CZ,MGM,Circa} vs best-of-{CZ,MGM} — Circa's marginal increment per leg and` [x2]
- docs/multibook-memo.md:551 — `3. Circa's coverage (which of the board's lines it posts at all).`
- docs/multibook-memo.md:554 — `two-book design and Circa drops out.`
- docs/multibook-memo.md:556 — `Circa-settled ticket gets NO automated close — a real cost against Exit 2's only`
- docs/multibook-memo.md:557 — `instrument. The sample day measures the share of slips where Circa is the argmax book;`
- docs/multibook-memo.md:560 — `Circa result, the bigger the instrument cost. **The build decision must price both sides`
- docs/multibook-memo.md:567 — `IQR ±1.6. MGM better on 223, CZ on 245. The Circa "half the hold" claim is **unmeasurable`
- docs/multibook-memo.md:604 — `grader pays at 'sbDec ?? czDec'; CLV sights the 'sb' book's close (a Circa-settled ticket`
- docs/multibook-memo.md:616 — `exclusion set for each candidate book. Circa (absent from the feed) is trivially`

#### Westgate

3 matching lines in 3 files (3 occurrences).

##### Westgate — calculations (2 lines)

- legacy/index.html:529 — `…/sportsbook.caesars.com/us/nv/bet"},{id:uid(),name:"STN Sports",url:"https://www.stationcasinos.com/sports/"},{id:uid(),name:"Westgate SuperBook",url:"https://www.superbook.com"}];`
- src/engine/legacy-src.gen.ts:5 — `…,name:\"STN Sports\",url:\"https://www.stationcasinos.com/sports/\"},{id:uid(),name:\"Westgate SuperBook\",url:\"https://www.superbook.com\"}];\n\n/* ===== embedded snapshot fallba…` [long line; 1 occurrences on this line; first shown]

##### Westgate — docs (1 lines)

- docs/multibook-memo.md:67 — `| westgate / superbook | ❌ absent (the historical 'superbook' key is gone) | ❌ |`

#### SuperBook

4 matching lines in 4 files (7 occurrences).

##### SuperBook — calculations (2 lines)

- legacy/index.html:529 — `…/sportsbook.caesars.com/us/nv/bet"},{id:uid(),name:"STN Sports",url:"https://www.stationcasinos.com/sports/"},{id:uid(),name:"Westgate SuperBook",url:"https://www.superbook.com"}];` [x2]
- src/engine/legacy-src.gen.ts:5 — `…TN Sports\",url:\"https://www.stationcasinos.com/sports/\"},{id:uid(),name:\"Westgate SuperBook\",url:\"https://www.superbook.com\"}];\n\n/* ===== embedded snapshot fallback (real …` [long line; 2 occurrences on this line; first shown]

##### SuperBook — tests (1 lines)

- tests/props-model.test.ts:75 — `expect(bookAb("SuperBook")).toBe("SUPE");`

##### SuperBook — docs (1 lines)

- docs/multibook-memo.md:67 — `| westgate / superbook | ❌ absent (the historical 'superbook' key is gone) | ❌ |` [x2]

#### South Point

1 matching lines in 1 files (1 occurrences).

##### South Point — docs (1 lines)

- docs/multibook-memo.md:68 — `| south point | ❌ absent | ❌ |`

#### STN / Station

5 matching lines in 5 files (8 occurrences).

Note: docs/collection-period.md and docs/freeze-exit-bundle.md hits are the word 'stationary' (false positives). The only code hit is the Nevada bookmark list at legacy/index.html:529.

##### STN / Station — calculations (2 lines)

- legacy/index.html:529 — `…:uid(),name:"Caesars NV",url:"https://sportsbook.caesars.com/us/nv/bet"},{id:uid(),name:"STN Sports",url:"https://www.stationcasinos.com/sports/"},{id:uid(),name:"Westgate SuperBoo…` [x2]
- src/engine/legacy-src.gen.ts:5 — `…),name:\"Caesars NV\",url:\"https://sportsbook.caesars.com/us/nv/bet\"},{id:uid(),name:\"STN Sports\",url:\"https://www.stationcasinos.com/sports/\"},{id:uid(),name:\"Westgate Supe…` [long line; 2 occurrences on this line; first shown]

##### STN / Station — docs (3 lines)

- docs/collection-period.md:2565 — `This does not change the freeze. A stationary weight channel during a collection window is`
- docs/freeze-exit-bundle.md:503 — `printed). 200-seed mean sits inside the 5-seed range (generator stationary — the`
- docs/multibook-memo.md:69 — `| STN / station | ❌ absent | ❌ |` [x2]

#### Pinnacle

135 matching lines in 41 files (148 occurrences).

Note: Weight 3 in the MLB consensus (legacy/index.html:1557), weight 2 in football game lines (src/lib/cfb/rules.ts:75, src/lib/nfl/rules.ts:66), a selectable display book (src/lib/sportsbook/books.ts:8).

##### Pinnacle — config (7 lines)

- src/lib/cfb/rules.ts:31 — `* pinnacleWeight — Pinnacle counts twice in the consensus median (the sharp anchor).` [x2]
- src/lib/cfb/rules.ts:75 — `pinnacleWeight: 2,`
- src/lib/football/league.ts:69 — `pinnacleWeight: number;`
- src/lib/nfl/rules.ts:20 — `* blend / spreadBlend / pinnacleWeight / minBooks / settleBook — as the CFB desk: the home win`
- src/lib/nfl/rules.ts:22 — `* and the FPI gap; Pinnacle counts twice; two books make a consensus; Caesars`
- src/lib/nfl/rules.ts:66 — `pinnacleWeight: 2,`
- src/lib/sportsbook/books.ts:8 — `{key:'pinnacle',label:'Pinnacle',short:'PIN'},` [x2]

##### Pinnacle — calculations (15 lines)

- legacy/index.html:1557 — `var SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};`
- legacy/index.html:2851 — `…IORS?Object.keys(SH_PRIORS.batters).length+" batters":"unavailable")+"), Shin de-vig, Pinnacle-weighted consensus across "+((SH_V2.regions)||"us")+" books, ump K-zones + temperatur…`
- src/engine/legacy-src.gen.ts:5 — `…e numbers was intended. */\nvar SH_V2=null,SH_PRIORS=null,SH_CTX=null;\nvar SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};\nfunction shBookW(k){return (SH_V2&&S…` [long line; 2 occurrences on this line; first shown]
- src/engine2/allstar.ts:7 — `weighted consensus across every posted book (Pinnacle ×3, exchanges ×2).`
- src/engine2/devig.ts:65 — `/** Pinnacle is the classic sharp anchor; exchanges (Betfair/Matchbook) carry`
- src/engine2/devig.ts:68 — `pinnacle: 3,`
- src/engine2/sharpBoard.ts:4 — `Pinnacle-weighted consensus across us+eu books, judged at the Caesars line.`
- src/engine2/sharpBoard.ts:55 — `hasSharp: boolean; // pinnacle or an exchange present`
- src/engine2/sharpBoard.ts:58 — `const SHARPS = new Set(["pinnacle", "betfair_ex_eu", "matchbook"]);`
- src/lib/cfb/h1.ts:18 — `* (H1_SIGMA_SCALE); the same Pinnacle-weighted median (minBooks); the market P(side) of each`
- src/lib/cfb/model.ts:34 — `* 5. Consensus = Pinnacle-weighted median across books (null under the league's 'model.minBooks').`
- src/lib/cfb/model.ts:328 — `const weightOf = (key: string, M: LeagueModel) => (key === "pinnacle" ? M.pinnacleWeight : 1);` [x2]
- src/lib/cfb/model.ts:397 — `return { all: quotes, cz: find(settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };`
- src/lib/cfb/props.ts:30 — `* else it is null. Every book counts equally (Pinnacle rarely posts CFB props). It is the`
- src/lib/engine-client.ts:344 — `the integrated pipeline on (skill-prior shrinkage, Shin de-vig, Pinnacle-`

##### Pinnacle — stored-data fields (1 lines)

- src/lib/cfb/types.ts:131 — `/** Pinnacle when posted (the sharp anchor; weight 2 in the consensus) */`

##### Pinnacle — UI (11 lines)

- src/components/cfb/CfbGameCard.tsx:29 — `* book counts, FPI for both teams, and each side's best / DK / FD / Pinnacle quotes.`
- src/components/cfb/CfbGameCard.tsx:39 — `pinnacle: "Pinnacle",` [x2]
- src/components/cfb/CfbProps.tsx:112 — `pinnacle: "PIN",`
- src/components/cfb/CfbSharp.tsx:59 — `{ key: "pin", label: "Pinnacle", games: count("pin") },`
- src/components/cfb/CfbSharp.tsx:273 — `Games each book prices on this slate. Paper tickets retain their recorded settlement book; Pinnacle counts ×{L.model.pinnacleWeight} in the consensus median; a` [x2]
- src/components/cfb/CfbSharp.tsx:383 — `<Term k={'Pinnacle ×${m.pinnacleWeight} · min ${m.minBooks} books'} label="Consensus">` [x2]
- src/components/cfb/CfbSharp.tsx:384 — `Each market&apos;s consensus is a weighted median across books, Pinnacle counting twice as the sharp anchor. Under {m.minBooks} books at a line, the`
- src/components/mlb/SharpDesk.tsx:14 — `/* ENGINE V2 · sharp desk — Shin de-vig + Pinnacle/exchange-weighted consensus`
- src/components/mlb/SharpDesk.tsx:66 — `Engine v2 · sharp desk — Shin de-vig, Pinnacle-weighted`
- src/components/mlb/SharpDesk.tsx:145 — `Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a`
- src/components/props/props-model.ts:75 — `pinnacle: "PIN",`

##### Pinnacle — tests (81 lines)

- tests/cfb-card.test.ts:81 — `{ key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },` [x2]
- tests/cfb-card.test.ts:87 — `{ key: "pinnacle", title: "Pinnacle", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },` [x2]
- tests/cfb-card.test.ts:94 — `{ key: "pinnacle", title: "Pinnacle", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },` [x2]
- tests/cfb-card.test.ts:416 — `{ key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },` [x2]
- tests/cfb-model.test.ts:131 — `if (r.pin) expect(r.pin.book).toBe("pinnacle");`
- tests/cfb-model.test.ts:191 — `const nt = row(iu, "North Texas +40.5"); // consensus line +40.5 (fixture: DK/FD 40.5, Caesars 39.5, Pinnacle 41)`
- tests/cfb-model.test.ts:194 — `expect(nt.pin).toMatchObject({ book: "pinnacle", price: -116, line: 41 });`
- tests/cfb-model.test.ts:227 — `* CHECK 1 — Alabama −28 spread, books = Caesars + Pinnacle ONLY, FPI withheld.`
- tests/cfb-model.test.ts:228 — `* fixture prices: Caesars ALA −28 @ −114 / ECU +28 @ −106; Pinnacle ALA −28 @ −105 / ECU +28 @ −109.`
- tests/cfb-model.test.ts:231 — `* Pinnacle: imp 105/205 = 0.512195, 109/209 = 0.521531 → p_cover = 0.4954843`
- tests/cfb-model.test.ts:241 — `it("CHECK 1 · Alabama −28 / East Carolina +28 at Caesars (fixture prices, Pinnacle-weighted median)", () => {`
- tests/cfb-model.test.ts:242 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings", "pinnacle"])], fpi: null });`
- tests/cfb-model.test.ts:263 — `// evBest: the best price at the consensus line among the two books — ECU +28: Caesars −106 beats Pinnacle −109`
- tests/cfb-model.test.ts:270 — `* fixture prices: Caesars O 52.5 −112 / U −109; Pinnacle O 52.5 −106 / U −110.`
- tests/cfb-model.test.ts:272 — `* Pinnacle: imp 106/206 = 0.514563, 110/210 = 0.523810 → p_over = 0.4955476 → μT_pin = 52.299108`
- tests/cfb-model.test.ts:274 — `* Over 52.5 (half line, no push): win = 1 − Φ((52.5 − 52.299108)/18) = 0.4955476 — exactly Pinnacle's de-vigged over.`
- tests/cfb-model.test.ts:279 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings", "pinnacle"])], fpi: null });`
- tests/cfb-model.test.ts:327 — `* CHECK 4 — James Madison moneyline at Caesars, books = Caesars + Pinnacle h2h ONLY, FPI withheld.`
- tests/cfb-model.test.ts:328 — `* fixture prices: Caesars JMU −230 / LIB +188; Pinnacle JMU −228 / LIB +192.`
- tests/cfb-model.test.ts:330 — `* Pinnacle: imp 228/328 = 0.6951220, 100/292 = 0.3424658 → p_pin = 0.6699404`
- tests/cfb-model.test.ts:336 — `const b = build({ oddsEvents: [reduced("James Madison Dukes", ["draftkings", "pinnacle"], ["h2h"])], fpi: null });`
- tests/cfb-picks.test.ts:162 — `{ key: "pinnacle", title: "Pinnacle", h2h: [-250, 210], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },` [x2]
- tests/dkfd-basis.test.ts:273 — `{ key: "pinnacle", markets: [mk(-110, -110)] },`
- tests/engine-v2-integration.test.ts:45 — `// two retail books at 55%, pinnacle-weighted 60% wins the median`
- tests/engine2-allstar.test.ts:37 — `key: "pinnacle",`
- tests/engine2-allstar.test.ts:38 — `title: "Pinnacle",`
- tests/engine2-allstar.test.ts:85 — `expect(book.ml.find((r) => r.book === "pinnacle")).toMatchObject({ al: 116, nl: -125 });`
- tests/engine2-devig.test.ts:60 — `// retail says 55%, pinnacle says 60% (both no-vig for test isolation)`
- tests/engine2-devig.test.ts:64 — `{ key: "pinnacle", a: americanFromProb(0.6), b: americanFromProb(0.4) },`
- tests/engine2-devig.test.ts:67 — `// pinnacle weight 3 vs 1+1 ⇒ weighted median lands on the sharp number`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:860 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:861 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1606 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1607 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2492 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2493 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3569 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3570 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4843 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4844 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5893 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5894 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7002 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7003 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8060 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8061 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8978 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8979 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10277 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10278 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11026 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11027 — `"title": "Pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11826 — `"key": "pinnacle",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11827 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:13 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:14 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:237 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:238 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:461 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:462 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:685 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:686 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:909 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:910 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1133 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1134 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1357 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1358 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1581 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1582 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1805 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:1806 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2029 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2030 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2253 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2254 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2477 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2478 — `"title": "Pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2701 — `"key": "pinnacle",`
- tests/fixtures/nfl/odds-2026-09-13.json:2702 — `"title": "Pinnacle",`
- tests/sportsbook.test.ts:54 — `expect(priceMlbMoneylines(data,"pinnacle")[0].odds).toBeUndefined();`

##### Pinnacle — docs (18 lines)

- CLAUDE.md:144 — `…ib/cfb/h1.ts' holds 'parseH1' (the full game's 'readBooksOf' under the half's σ, same Pinnacle-weighted median, 'pHome' = ML + spread-implied blend with NO FPI term) and 'attachH1'…` [long line; 1 occurrences on this line; first shown]
- ENGINE2.md:45 — `temperature on HR (0.8%/°F vs 70°, capped 0.90–1.12), Shin de-vig + Pinnacle-weighted`
- ENGINE2.md:79 — `median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in`
- ENGINE2.md:84 — `- Consensus weighted toward **Pinnacle** (confirmed available in the 'eu' region for MLB;`
- ENGINE2.md:107 — `- Score champion vs challenger daily: log-loss, calibration, CLV vs Pinnacle close, ROI`
- ENGINE2.md:184 — `only 'baseball_mlb' event during the break — ML at 15 books (Pinnacle + Betfair`
- ENGINE2.md:322 — `**The opinion is untouched:** the Pinnacle-weighted, Shin de-vigged, all-books`
- ENGINE2.md:472 — `'luRes'/'boAct' reconciliation (Update 2). Pinnacle-close CLV: NOT yet wired (needs the`
- PARLAY_LAB_QUANT_ENGINE.md:6 — `> percentiles, Shin de-vig + Pinnacle-weighted consensus, ump/weather/bullpen`
- docs/cfb-desk.md:30 — `| 'pinnacleWeight' | 2 | Pinnacle counts twice in the weighted median |` [x2]
- docs/cfb-desk.md:38 — `3. Consensus per market = weighted median across books (Pinnacle ×2); null under 'minBooks'.`
- docs/collection-period.md:8155 — `Pinnacle, the sharp anchor) through the app's own odds proxy, appending one compact`
- docs/collection-period.md:8336 — `| every 3h | ~15–18 | ~78 | **~13.3** | nothing any tool reads; the unbuilt Pinnacle-close reader loses density |`
- docs/credit-budget.md:222 — `output). The game-line archive feeds the Pinnacle-close CLV reader that 'ENGINE2.md'`
- docs/nfl-desk.md:37 — `…l site), blend '{ mkt .6, spread .25, fpi .15 }', spreadBlend '{ mkt .75, fpi .25 }', pinnacleWeight 2, minBooks 2, settleBook 'williamhill_us' (Caesars), matchWindowMs 3 h. The pi…`
- docs/phase2-memo.md:521 — `using the engine's own 'SH_BOOKW' weights ('pinnacle' 3, 'betfair_ex_eu' 2,`
- docs/progress.md:139 — `…ame's own reader ('readBooksOf' under the half's σ, 'H1_SIGMA_SCALE = 1/√2', the same Pinnacle-weighted median at 'minBooks 2'); 'pHome' blends the 1H moneyline and the spread-impl…`
- docs/session-handoff.md:852 — `…argins through a normal curve (σ 16.5 margin, 18 total, HFA 2.6, 0 at neutral sites), Pinnacle-weighted median consensus across 'us,eu' books, blend {market .60, spread-implied .25…` [long line; 1 occurrences on this line; first shown]

##### Pinnacle — tools (2 lines)

- .github/workflows/line-history.yml:2 — `# Hourly odds snapshots (MLB h2h/totals/spreads, us+eu incl. Pinnacle) into the`
- tools/snapshot_odds.py:4 — `Pulls MLB h2h/totals/spreads across us+eu regions (eu carries Pinnacle, the`

#### Bovada

62 matching lines in 16 files (258 occurrences).

Note: No calculation special-cases this book; it reaches numbers only as a member of the all-book consensus / best-price scans.

##### Bovada — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:42 — `bovada: "Bovada",` [x2]
- src/components/cfb/CfbProps.tsx:115 — `bovada: "BOV",`
- src/components/props/props-model.ts:74 — `bovada: "BOV",`

##### Bovada — tests (57 lines)

- tests/board-scope.test.ts:40 — `non-Caesars lines from ALL") — the "O 0.5 H+R+RBI" rows he saw were Bovada / BetOnline lines`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:312 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:313 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1645 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1646 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2545 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2546 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2965 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2966 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4239 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4240 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5429 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5430 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6398 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6399 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8113 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8114 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8533 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8534 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9687 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9688 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11065 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11066 — `"title": "Bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11387 — `"key": "bovada",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11388 — `"title": "Bovada",`
- tests/fixtures/fix39/odds.json:1 — `…:"Over","price":105,"point":9.0},{"name":"Under","price":-125,"point":9.0}]}]},{"key":"bovada","title":"Bovada","last_update":"2026-07-10T05:49:45Z","markets":[{"key":"h2h","last_u…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…5},{"name":"Under","description":"Ryan Weathers","price":-149,"point":5.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"pitcher_outs","last_update":"2026-07-10T05:50:49Z…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…},{"name":"Under","description":"Shota Imanaga","price":-106,"point":17.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"batter_total_bases","last_update":"2026-07-10T05:…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…:5.5},{"name":"Under","description":"Aaron Nola","price":-113,"point":5.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"batter_hits_runs_rbis","last_update":"2026-07-10T…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…},{"name":"Under","description":"Jac Caglianone","price":-137,"point":1.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T05:…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…,{"name":"Under","description":"Sandy Alcantara","price":-117,"point":5.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"pitcher_outs","last_update":"2026-07-10T05:50:25Z…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…},{"name":"Under","description":"Brandon Sproat","price":-162,"point":5.5}]}]},{"key":"bovada","title":"Bovada","markets":[{"key":"batter_total_bases","last_update":"2026-07-10T05:…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…": "Under", "description": "Ryan Weathers", "price": -149, "point": 5.5}]}]}, {"key": "bovada", "title": "Bovada", "markets": [{"key": "pitcher_outs", "last_update": "2026-07-10T05…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:344 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:360 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:378 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:432 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:450 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:470 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:521 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:539 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:575 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:593 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:629 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:665 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:667 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:1597 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:1667 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:1685 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:1703 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:1705 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:3169 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:3656 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:3694 — `"uBook": "Bovada",`
- tests/fixtures/gen-pool.json:3710 — `"oBook": "Bovada",`
- tests/fixtures/gen-pool.json:4590 — `"uBook": "Bovada",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…,"fanatics":{"book":"fanatics","title":"Fanatics","price":155,"line":null,"dec":2.55},"bovada":{"book":"bovada","title":"Bovada","price":150,"line":null,"dec":2.5}},"probabilities"…` [long line; 160 occurrences on this line; first shown]

##### Bovada — docs (2 lines)

- docs/session-handoff.md:859 — `… live MLB board: the H+R+RBI "O 0.5" rows Josh saw under ALL (Butler, Duran) are lines Bovada / BetOnline post that Caesars does not (Caesars price null, tagged watch, H+R+RBI susp…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:861 — `…r book posts at a different number — the "O 0.5 H+R+RBI" rows on Butler and Duran that Bovada / BetOnline posted while Caesars had 1.5 — is skipped, never graded, and the ALL footn…`

#### BetOnline

35 matching lines in 11 files (65 occurrences).

Note: Carries a 1.5 consensus weight in SH_BOOKW (legacy/index.html:1557; src/engine2/devig.ts:68-71).

##### BetOnline — calculations (3 lines)

- legacy/index.html:1557 — `var SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};`
- src/engine/legacy-src.gen.ts:5 — `…ull,SH_PRIORS=null,SH_CTX=null;\nvar SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};\nfunction shBookW(k){return (SH_V2&&SH_V2.sharpW&&SH_BOOKW[k])||1;}\n/* DK/F…` [long line; 1 occurrences on this line; first shown]
- src/engine2/devig.ts:71 — `betonlineag: 1.5, // sharp-adjacent US-facing`

##### BetOnline — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:44 — `betonlineag: "BetOnline",` [x2]
- src/components/cfb/CfbProps.tsx:119 — `betonlineag: "BOL",`
- src/components/props/props-model.ts:76 — `betonlineag: "BOL",`

##### BetOnline — tests (26 lines)

- tests/board-scope.test.ts:40 — `non-Caesars lines from ALL") — the "O 0.5 H+R+RBI" rows he saw were Bovada / BetOnline lines`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:64 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:65 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1489 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1490 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2178 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2179 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2714 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2715 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3935 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3936 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5195 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5196 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6133 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6134 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7838 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7839 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8282 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8283 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9450 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9451 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10888 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10889 — `"title": "BetOnline.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11192 — `"key": "betonlineag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11193 — `"title": "BetOnline.ag",`
- tests/fixtures/fix39/odds.json:1 — `…Over","price":-105,"point":9.0},{"name":"Under","price":-115,"point":9.0}]}]},{"key":"betonlineag","title":"BetOnline.ag","last_update":"2026-07-10T05:50:48Z","markets":[{"key":"h2…` [long line; 30 occurrences on this line; first shown]

##### BetOnline — docs (3 lines)

- docs/phase2-memo.md:522 — `'matchbook' 2, 'betonlineag' 1.5, else 1). Same function, same aggregation — that is`
- docs/session-handoff.md:859 — `…board: the H+R+RBI "O 0.5" rows Josh saw under ALL (Butler, Duran) are lines Bovada / BetOnline post that Caesars does not (Caesars price null, tagged watch, H+R+RBI suspended from…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:861 — `…ts at a different number — the "O 0.5 H+R+RBI" rows on Butler and Duran that Bovada / BetOnline posted while Caesars had 1.5 — is skipped, never graded, and the ALL footnote says "…`

#### BetRivers

33 matching lines in 8 files (215 occurrences).

##### BetRivers — fetch code (1 lines)

- app/api/ufcprops/route.ts:18 — `const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);`

##### BetRivers — config (1 lines)

- src/lib/sportsbook/books.ts:6 — `{key:'betrivers',label:'BetRivers',short:'BR'},` [x2]

##### BetRivers — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:41 — `betrivers: "BetRivers",` [x2]
- src/components/cfb/CfbProps.tsx:114 — `betrivers: "BR",`
- src/components/props/props-model.ts:72 — `betrivers: "BR",`

##### BetRivers — tests (28 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:630 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:631 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1344 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1345 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2125 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2126 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3373 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3374 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4737 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4738 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5762 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5763 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6769 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6770 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7746 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7747 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8745 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8746 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9899 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9900 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10849 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10850 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11557 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11558 — `"title": "BetRivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12309 — `"key": "betrivers",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12310 — `"title": "BetRivers",`
- tests/fixtures/fix39/odds.json:1 — `…"Over","price":100,"point":9.0},{"name":"Under","price":-122,"point":9.0}]}]},{"key":"betrivers","title":"BetRivers","last_update":"2026-07-10T05:51:20Z","markets":[{"key":"h2h","l…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…6},"fanduel":{"book":"fanduel","title":"FanDuel","price":185,"line":null,"dec":2.85},"betrivers":{"book":"betrivers","title":"BetRivers","price":130,"line":null,"dec":2.3},"betmgm"…` [long line; 152 occurrences on this line; first shown]

#### PointsBet

0 matching lines in 0 files (0 occurrences).

No hits anywhere in the repo.

#### Wynn

7 matching lines in 7 files (9 occurrences).

Note: ALL FALSE POSITIVES: player names (Kerwynn Williams, Austin Wynns). No Wynn sportsbook reference exists.

##### Wynn — stored-data fields (4 lines)

- public/data/first-sunday-six/first-td-games.csv:220 — `2016_15_NO_ARI,2016,15,REG,2016-12-18,16:05,NO,ARI,48.5,False,first_td,00-0030117,Kerwynn Williams,RB,ARI,rush,1,12:27,153,drive_game_clock_end,12:38`
- public/data/first-sunday-six/history.json:1 — `…":"Kerryon Johnson","firstTDs":2,"earlySlateWins":0,"fastestSeconds":267},{"player":"Kerwynn Williams","firstTDs":1,"earlySlateWins":0,"fastestSeconds":153},{"player":"Kevin Byard"…` [long line; 1 occurrences on this line; first shown]
- public/model/priors.json:1 — `…hit_pct":37.0,"sprint":26.7,"pct":{"sprint_speed":33.0},"stands":"R"},"642851":{"name":"Wynns, Austin","pa":66.0,"ba":0.098,"xba":0.207,"slg":0.148,"xslg":0.319,"woba":0.143,"xwoba…` [long line; 1 occurrences on this line; first shown]
- src/lib/nfl/first-sunday-six-history.json:1 — `…":"Kerryon Johnson","firstTDs":2,"earlySlateWins":0,"fastestSeconds":267},{"player":"Kerwynn Williams","firstTDs":1,"earlySlateWins":0,"fastestSeconds":153},{"player":"Kevin Byard"…` [long line; 1 occurrences on this line; first shown]

##### Wynn — tests (3 lines)

- tests/fixtures/fix39/hit_2026-06-09.json:1 — `…":"Atlanta Braves","link":"/api/v1/teams/144"},"player":{"id":642851,"fullName":"Austin Wynns","link":"/api/v1/people/642851","firstName":"Robert","lastName":"Wynns"},"league":{"id…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/hit_2026-06-10.json:1 — `…":"Atlanta Braves","link":"/api/v1/teams/144"},"player":{"id":642851,"fullName":"Austin Wynns","link":"/api/v1/people/642851","firstName":"Robert","lastName":"Wynns"},"league":{"id…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix45/priors.json:1 — `…hit_pct":39.6,"sprint":28.0,"pct":{"sprint_speed":67.0},"stands":"L"},"642851":{"name":"Wynns, Austin","pa":62.0,"ba":0.086,"xba":0.213,"slg":0.086,"xslg":0.322,"woba":0.107,"xwoba…` [long line; 1 occurrences on this line; first shown]

#### ESPN Bet

5 matching lines in 5 files (60 occurrences).

Note: Test-fixture hits are ESPN scoreboard logo URLs, not prices. Code hits are display-label maps only.

##### ESPN Bet — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:51 — `espnbet: "ESPN Bet",` [x2]
- src/components/cfb/CfbProps.tsx:117 — `espnbet: "ESPN",`
- src/components/props/props-model.ts:71 — `"espn bet": "ESPN",`

##### ESPN Bet — tests (2 lines)

- tests/fixtures/nfl/espn-scoreboard-2026-09-10.json:1 — `…Side":"none","betType":"straight"}}},"header":{"logo":{"dark":"https://a.espncdn.com/i/espnbet/dark/espn-bet-square-off.svg","light":"https://a.espncdn.com/i/espnbet/espn-bet-squar…` [long line; 4 occurrences on this line; first shown]
- tests/fixtures/nfl/espn-scoreboard-2026-09-13.json:1 — `…Side":"none","betType":"straight"}}},"header":{"logo":{"dark":"https://a.espncdn.com/i/espnbet/dark/espn-bet-square-off.svg","light":"https://a.espncdn.com/i/espnbet/espn-bet-squar…` [long line; 52 occurrences on this line; first shown]

#### Fanatics

76 matching lines in 17 files (273 occurrences).

##### Fanatics — config (1 lines)

- src/lib/sportsbook/books.ts:7 — `{key:'fanatics',label:'Fanatics',short:'FAN'},` [x2]

##### Fanatics — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:43 — `fanatics: "Fanatics",` [x2]
- src/components/cfb/CfbProps.tsx:116 — `fanatics: "FAN",`
- src/components/props/props-model.ts:73 — `fanatics: "FAN",`

##### Fanatics — tests (72 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:807 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:808 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1149 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1150 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1853 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1854 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3516 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3517 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4790 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4791 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5854 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5855 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6949 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6950 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7421 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7422 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10224 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10225 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10686 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10687 — `"title": "Fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11734 — `"key": "fanatics",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11735 — `"title": "Fanatics",`
- tests/fixtures/fix39/odds.json:1 — `…"Over","price":-124,"point":8.5},{"name":"Under","price":102,"point":8.5}]}]},{"key":"fanatics","title":"Fanatics","last_update":"2026-07-10T05:50:49Z","markets":[{"key":"h2h","las…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…},{"name":"Under","description":"Ryan Weathers","price":-156,"point":5.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:50:2…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…},{"name":"Under","description":"Shota Imanaga","price":-111,"point":5.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:49:3…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…5.5},{"name":"Under","description":"Aaron Nola","price":-128,"point":5.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:51:0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…},{"name":"Under","description":"Luinder Avila","price":-142,"point":4.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:50:3…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…{"name":"Under","description":"Sandy Alcantara","price":-122,"point":5.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:50:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…},{"name":"Under","description":"Brandon Sproat","price":126,"point":4.5}]}]},{"key":"fanatics","title":"Fanatics","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:51:1…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…: "Under", "description": "Ryan Weathers", "price": -156, "point": 5.5}]}]}, {"key": "fanatics", "title": "Fanatics", "markets": [{"key": "batter_hits", "last_update": "2026-07-10T…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:52 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:54 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:324 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:1270 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:1272 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:1542 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:1544 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:1559 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2156 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2178 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2502 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2504 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2519 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:2649 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3171 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3201 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3203 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3217 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3219 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3234 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3236 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3394 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3396 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3458 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3487 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3489 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3624 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3626 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3641 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:3643 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4280 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4297 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4554 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4556 — `"uBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4571 — `"oBook": "Fanatics",`
- tests/fixtures/gen-pool.json:4573 — `"uBook": "Fanatics",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:415 — `"key": "fanatics",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:416 — `"title": "Fanatics",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…":2.3},"betmgm":{"book":"betmgm","title":"BetMGM","price":140,"line":null,"dec":2.4},"fanatics":{"book":"fanatics","title":"Fanatics","price":155,"line":null,"dec":2.55},"bovada":{…` [long line; 160 occurrences on this line; first shown]
- tests/mlb-live-props-route.test.ts:85 — `const GARCIA_H = "luisgarciajr|batter_hits|0.5"; // quoted by fanatics ALONE — must be dropped`
- tests/mlb-live-props-route.test.ts:471 — `// Soto: Caesars 2.5, DK 1.5, FD 1.5, Fanatics 2.5 — tied, so the book Josh settles at wins`
- tests/mlb-live-props-route.test.ts:482 — `expect(b.rows[liveQuoteKey(G_NYY, GARCIA_H)]).toBeUndefined(); // fanatics alone is not a market`

#### Hard Rock

3 matching lines in 3 files (4 occurrences).

Note: Fixture hit is 'Hard Rock Stadium' (venue, false positive). Code hits are display-label maps only.

##### Hard Rock — UI (2 lines)

- src/components/cfb/CfbGameCard.tsx:52 — `hardrockbet: "Hard Rock",` [x2]
- src/components/cfb/CfbProps.tsx:118 — `hardrockbet: "HR",`

##### Hard Rock — tests (1 lines)

- tests/fixtures/nfl/espn-scoreboard-2026-08-22-final.json:1 — `…ion":false,"playByPlayAvailable":true,"recent":false,"venue":{"id":"3948","fullName":"Hard Rock Stadium","address":{"city":"Miami Gardens","state":"FL","country":"USA"},"indoor":fa…` [long line; 1 occurrences on this line; first shown]

#### bet365

1 matching lines in 1 files (1 occurrences).

##### bet365 — tests (1 lines)

- tests/props-model.test.ts:76 — `expect(bookAb("bet365")).toBe("BET3");`

#### Unibet

46 matching lines in 3 files (47 occurrences).

##### Unibet — UI (2 lines)

- src/components/cfb/CfbGameCard.tsx:49 — `unibet_us: "Unibet",` [x2]
- src/components/cfb/CfbProps.tsx:123 — `unibet_us: "UNI",`

##### Unibet — tests (44 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:669 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:670 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:731 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:732 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1383 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1384 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2088 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2089 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3426 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3427 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3463 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3464 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4610 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4611 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4663 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4664 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5677 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5678 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5716 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5717 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6716 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6717 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6859 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6860 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7672 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7673 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8692 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8693 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8835 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8836 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9952 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9953 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10028 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10029 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10826 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10827 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11596 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11597 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11642 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11643 — `"title": "Unibet (NL)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12219 — `"key": "unibet_se",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12220 — `"title": "Unibet (SE)",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12256 — `"key": "unibet_nl",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12257 — `"title": "Unibet (NL)",`

#### Barstool

0 matching lines in 0 files (0 occurrences).

No hits anywhere in the repo.

#### BetUS

20 matching lines in 5 files (50 occurrences).

##### BetUS — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:47 — `betus: "BetUS",` [x2]
- src/components/cfb/CfbProps.tsx:122 — `betus: "BUS",`
- src/components/props/props-model.ts:78 — `"betus": "BUS",`

##### BetUS — tests (17 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:195 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:196 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2820 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2821 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4094 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4095 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5312 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5313 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6292 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6293 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8388 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8389 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9556 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9557 — `"title": "BetUS",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11270 — `"key": "betus",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11271 — `"title": "BetUS",`
- tests/fixtures/fix39/odds.json:1 — `…":"Over","price":-120,"point":8.5},{"name":"Under","price":100,"point":8.5}]}]},{"key":"betus","title":"BetUS","last_update":"2026-07-10T05:50:30Z","markets":[{"key":"h2h","last_up…` [long line; 30 occurrences on this line; first shown]

#### LowVig

26 matching lines in 5 files (56 occurrences).

##### LowVig — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:45 — `lowvig: "LowVig",` [x2]
- src/components/cfb/CfbProps.tsx:120 — `lowvig: "LV",`
- src/components/props/props-model.ts:77 — `lowvig: "LOW",`

##### LowVig — tests (23 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:103 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:104 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1450 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1451 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2217 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2218 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2661 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2662 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3988 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3989 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5234 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5235 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6186 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6187 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7799 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7800 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8229 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8230 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9503 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9504 — `"title": "LowVig.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11153 — `"key": "lowvig",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11154 — `"title": "LowVig.ag",`
- tests/fixtures/fix39/odds.json:1 — `…:"Over","price":-124,"point":8.5},{"name":"Under","price":100,"point":8.5}]}]},{"key":"lowvig","title":"LowVig.ag","last_update":"2026-07-10T05:51:21Z","markets":[{"key":"h2h","las…` [long line; 30 occurrences on this line; first shown]

#### MyBookie

28 matching lines in 5 files (58 occurrences).

##### MyBookie — UI (3 lines)

- src/components/cfb/CfbGameCard.tsx:46 — `mybookieag: "MyBookie",` [x2]
- src/components/cfb/CfbProps.tsx:121 — `mybookieag: "MB",`
- src/components/props/props-model.ts:79 — `mybookieag: "MYB",`

##### MyBookie — tests (25 lines)

- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:754 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:755 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1684 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1685 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1800 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1801 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3283 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3284 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4557 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4558 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5801 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5802 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6896 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6897 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7368 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7369 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8872 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8873 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10171 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10172 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10594 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10595 — `"title": "MyBookie.ag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11681 — `"key": "mybookieag",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11682 — `"title": "MyBookie.ag",`
- tests/fixtures/fix39/odds.json:1 — `…"Over","price":-120,"point":8.5},{"name":"Under","price":100,"point":8.5}]}]},{"key":"mybookieag","title":"MyBookie.ag","last_update":"2026-07-10T05:49:23Z","markets":[{"key":"h2h"…` [long line; 30 occurrences on this line; first shown]

#### Betfair

30 matching lines in 12 files (30 occurrences).

Note: betfair_ex_eu carries a 2.0 consensus weight (legacy/index.html:1557; src/engine2/devig.ts:68-71) and is a member of SHARPS (src/engine2/sharpBoard.ts:58).

##### Betfair — calculations (5 lines)

- legacy/index.html:1557 — `var SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};`
- src/engine/legacy-src.gen.ts:5 — `…was intended. */\nvar SH_V2=null,SH_PRIORS=null,SH_CTX=null;\nvar SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};\nfunction shBookW(k){return (SH_V2&&SH_V2.sharp…` [long line; 1 occurrences on this line; first shown]
- src/engine2/devig.ts:65 — `/** Pinnacle is the classic sharp anchor; exchanges (Betfair/Matchbook) carry`
- src/engine2/devig.ts:69 — `betfair_ex_eu: 2,`
- src/engine2/sharpBoard.ts:58 — `const SHARPS = new Set(["pinnacle", "betfair_ex_eu", "matchbook"]);`

##### Betfair — UI (2 lines)

- src/components/mlb/SharpDesk.tsx:145 — `Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a`
- src/components/props/props-model.ts:80 — `betfair: "BF",`

##### Betfair — tests (18 lines)

- tests/engine2-allstar.test.ts:65 — `key: "betfair_ex_eu",`
- tests/engine2-allstar.test.ts:66 — `title: "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:977 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:978 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2309 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2310 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3770 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3771 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5023 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5024 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7182 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7183 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7930 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7931 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9158 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9159 — `"title": "Betfair",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10422 — `"key": "betfair_ex_eu",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10423 — `"title": "Betfair",`

##### Betfair — docs (5 lines)

- CLAUDE.md:981 — `and the p90 offshore-book artifact (fat tail = coolbet, winamax_de, betfair_ex_eu, nordicbet,`
- ENGINE2.md:79 — `median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in`
- ENGINE2.md:184 — `only 'baseball_mlb' event during the break — ML at 15 books (Pinnacle + Betfair`
- docs/collection-period.md:837 — `(coolbet, winamax_de, betfair_ex_eu, nordicbet, betclic_fr, betsson). **Those books are all`
- docs/phase2-memo.md:521 — `using the engine's own 'SH_BOOKW' weights ('pinnacle' 3, 'betfair_ex_eu' 2,`

#### Fliff

0 matching lines in 0 files (0 occurrences).

No hits anywhere in the repo.

#### PrizePicks

0 matching lines in 0 files (0 occurrences).

No hits anywhere in the repo.

#### Underdog

7 matching lines in 7 files (36 occurrences).

Note: ALL FALSE POSITIVES for the Underdog app: generic word 'underdog' and ESPN's awayTeamOdds.underdog flag.

##### Underdog — calculations (2 lines)

- src/lib/cfb/card.ts:341 — `// left the 9/5 fixture's fun ticket with three underdogs (the only fair-or-better sides)`
- src/lib/ufc.ts:221 — `"Best-value underdog paired with the safest favorite — one swing, one seatbelt.",`

##### Underdog — tests (3 lines)

- tests/cfb-grade.test.ts:413 — `// every core leg is an underdog spread on this fixture card; blowout finals make each one lose`
- tests/fixtures/nfl/espn-scoreboard-2026-09-10.json:1 — `…"details":"LAR -3.5","overUnder":48.5,"spread":-3.5,"awayTeamOdds":{"favorite":false,"underdog":true,"team":{"id":"25","uid":"s:20~l:28~t:25","abbreviation":"SF","name":"49ers","di…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/nfl/espn-scoreboard-2026-09-13.json:1 — `…"details":"CIN -3.5","overUnder":50.5,"spread":-3.5,"awayTeamOdds":{"favorite":false,"underdog":true,"team":{"id":"27","uid":"s:20~l:28~t:27","abbreviation":"TB","name":"Buccaneers…` [long line; 26 occurrences on this line; first shown]

##### Underdog — docs (2 lines)

- docs/cfb-desk.md:68 — `…ecision record: the first fixture card's fun ticket, ranked by EV, was the same three underdogs as its core singles at +631 (fixture data) — the opposite of fun money on favourites…` [x2]
- docs/session-handoff.md:852 — `…n be reversed): the first fixture card's fun parlay, ranked by EV, was the same three underdogs as its core singles at +631 (fixture data), so the fun picker now takes the likelies…` [long line; 3 occurrences on this line; first shown]

#### DraftKings

520 matching lines in 112 files (1214 occurrences).

##### DraftKings — fetch code (1 lines)

- app/api/ufcprops/route.ts:18 — `const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);`

##### DraftKings — config (10 lines)

- src/lib/cfb/rules.ts:77 — `settleBook: "draftkings",`
- src/lib/cfb/rules.ts:372 — `so a slate is capped at 'maxEvents' priced events; 'settleBook' is DraftKings, as everywhere (INSTRUCTION 67, 2026-09-17; was Caesars).`
- src/lib/cfb/rules.ts:476 — `settleBook: "draftkings",`
- src/lib/found-mode.ts:126 — `* pass seats any bet at or above +1% EV at DraftKings instead of +2%. Stakes, the $2,500 ceiling, the`
- src/lib/mlb/live-props-rules.ts:150 — `settleBook: "draftkings",`
- src/lib/nfl/rules.ts:68 — `settleBook: "draftkings",`
- src/lib/nfl/rules.ts:197 — `settleBook: "draftkings",`
- src/lib/sportsbook/books.ts:3 — `{key:'draftkings',label:'DraftKings',short:'DK'},` [x2]
- src/lib/sportsbook/books.ts:11 — `/** The book every grade, edge %, EV and Kelly stake is computed at (INSTRUCTION 67, 2026-09-17: DraftKings replaces Caesars). */`
- src/lib/sportsbook/books.ts:12 — `export const SETTLE_BOOK: BookKey = 'draftkings';`

##### DraftKings — calculations (47 lines)

- app/api/cfb/lock/route.ts:451 — `note: 'no DraftKings price on any of the ${d.ahead} games still ahead (${why}) — nothing written, the next poke retries. A day is never locked NO-PLAY for want of lines.',`
- app/api/nfl/lock/route.ts:262 — `note: 'no DraftKings price on any of the ${d.ahead} games still ahead (${why}) — nothing written, the next poke retries. A day is never locked NO-PLAY for want of lines.',`
- legacy/index.html:1306 — `var dkm=mls.filter(function(x){return x.k==="draftkings";})[0],fdm=mls.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1328 — `var dkr=use.filter(function(x){return x.k==="draftkings";})[0],fdr=use.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1372 — `var bsb=(bk.key==="draftkings"||bk.key==="fanduel");`
- legacy/index.html:1394 — `if(!abb[kk2])abb[kk2]={draftkings:{o:null,u:null},fanduel:{o:null,u:null}};`
- legacy/index.html:1423 — `var dkx=r.list.filter(function(x){return x.k==="draftkings";})[0],fdx=r.list.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1425 — `var dkO=(dkx&&dkx.o!=null)?dkx.o:(abk&&abk.draftkings.o!=null?abk.draftkings.o:null);` [x2]
- legacy/index.html:1426 — `var dkU=(dkx&&dkx.u!=null)?dkx.u:(abk&&abk.draftkings.u!=null?abk.draftkings.u:null);` [x2]
- legacy/index.html:1560 — `DraftKings and FanDuel ONLY, line-shopped within that pair — tie goes to DK.`
- src/engine/legacy-src.gen.ts:5 — `…/FD basis layer (additive) */\n var dkm=mls.filter(function(x){return x.k===\"draftkings\";})[0],fdm=mls.filter(function(x){return x.k===\"fanduel\";})[0];\n var bmh=…` [long line; 10 occurrences on this line; first shown]
- src/engine2/sharpBoard.ts:74 — `function mlConsensus(ev_: OddsEvent, book = "draftkings") {`
- src/engine2/sharpBoard.ts:90 — `if (bk.key === "draftkings") { dkAway = away.price; dkHome = home.price; }`
- src/engine2/sharpBoard.ts:102 — `function totalConsensus(ev_: OddsEvent, book = "draftkings") {`
- src/engine2/sharpBoard.ts:123 — `const dk = best.books.find((b) => b.key === "draftkings") ?? null;`
- src/engine2/sharpBoard.ts:134 — `export async function loadSharpBoard(book = "draftkings"): Promise<{ games: SharpGame[]; at: number }> {`
- src/lib/board-order.ts:46 — `dk_fd: "ranked by EV @ DK/FD basis (DraftKings settles)",`
- src/lib/board-order.ts:47 — `ev_gated: "ranked by EV @ DraftKings (EV gate lives at the card)",`
- src/lib/board-order.ts:48 — `caesars_ev: "ranked by EV @ DraftKings",`
- src/lib/cfb/card.ts:249 — `const props = (board.paperProps?.rows ?? []).map(r => priceFootballProp(r, "draftkings", opts.bankroll, R)).filter(r => {`
- src/lib/cfb/card.ts:368 — `const gate = 'no playable side clears +${R.minEvPct}% EV at DraftKings under ${R.maxDec.toFixed(2)} (${playable.length} priced sides on ${board.games.length} games)';`
- src/lib/cfb/found.ts:26 — `* that start after 'now', EV >= rules.minEvPct (+2%; +1% from EV1_SINCE 2026-11-01) at DraftKings, dec <= rules.maxDec`
- src/lib/cfb/found.ts:34 — `* ranking ticket EV at the DraftKings price, descending; ties by probability, then by the`
- src/lib/cfb/found.ts:45 — `* Prices are never touched: every leg's price is the slate's DraftKings quote, carried as given.`
- src/lib/cfb/found.ts:90 — `.map((r) => priceFootballProp(r, "draftkings", FOUND.bankroll, R))`
- src/lib/cfb/found.ts:244 — `if (plan.pricedAhead === 0) return 'no DraftKings price on any ${cfg.short} game still ahead on ${date} — nothing new was added.';`
- src/lib/cfb/found.ts:246 — `…till ahead on ${date} clears +${foundFootballMinEv(date, cfg.rules.minEvPct)}% EV at DraftKings on a game and bet type the card is not already on — nothing added, $${plan.roomBefor…`
- src/lib/cfb/lock-server.ts:244 — `… day went unpriced: all ${plural(total, "game")} on ${board.date} kicked off with no DraftKings price ever available on the games still ahead, so the server refused rather than sta…`
- src/lib/cfb/lock-server.ts:315 — `…e: ${board.date} was poked inside its lock window and every poke refused, because no DraftKings price was ever available on the games still ahead. The day was lost to the odds feed…`
- src/lib/cfb/model.ts:397 — `return { all: quotes, cz: find(settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };`
- src/lib/cfb/props.ts:346 — `dk: find("draftkings"),`
- src/lib/cfb/season.ts:94 — `defaultBook: "DraftKings",`
- src/lib/fun-hr.ts:88 — `return { tickets: [], sum: 0, note: "fun: no DraftKings-priced HR-over pool today" };`
- src/lib/parlay-gen.ts:137 — `/** only legs whose price is the settlement book's quote (DraftKings since INSTRUCTION 67; the selected book on display surfaces) */`
- src/lib/prop-lean.ts:58 — `* MLB: the settlement-book pair ('cz', DraftKings since INSTRUCTION 67) when both sides are posted`
- src/lib/prop-lean.ts:68 — `/** "draftkings" → "DK", "fanduel" → "FD", anything else → first two letters upper-cased */`
- src/lib/prop-lean.ts:72 — `if (k.includes("draftkings") || k === "dk") return "DK";`
- src/lib/server/clv-core.ts:21 — `const DK = "draftkings";`
- src/lib/server/clv-core.ts:72 — `/* INSTRUCTION 67: a ticket locked since 2026-09-17 carries 'settlementBook: "draftkings"'; older`
- src/lib/server/football-lock.ts:545 — `? 'no DraftKings price on any game still ahead that the core is not already on — $${d.room} of core and $${paper.fun - cfbStakeOf(entry.funT)} of fun stay undeployed an…`
- src/lib/server/football-lock.ts:829 — `note: 'no DraftKings price on any of the ${args.ahead} games still ahead (${why}) — nothing written, the next poke retries. A day is never locked NO-PLAY for want of line…`
- src/lib/server/lock-card.ts:129 — `* from every pregame board row that has BOTH a DraftKings (cz) and a DK/FD basis (bs) price`
- src/lib/server/lock-card.ts:707 — `/* INSTRUCTION 67 (2026-09-17): the book this fire priced at — DraftKings — rides every ticket it`
- src/lib/server/mlb-live-quote.ts:120 — `const DK = "draftkings";`
- src/lib/sportsbook/mlb.ts:101 — `// a board is served as-is only at the book it was priced at; a Caesars-stamped (pre-2026-09-17) cache is repriced at DraftKings from the quote index`
- src/lib/ufc.ts:129 — `function sideFromBooks(ev: OddsEvent, fighter: string, book = "draftkings"): UfcSide {`
- src/lib/ufc.ts:202 — `"The two best DraftKings prices vs the market consensus — the closest thing to +EV on this card.",`

##### DraftKings — stored-data fields (4 lines)

- src/engine/index.ts:296 — `/* INSTRUCTION 67 (2026-09-17): the settlement book is DraftKings. The parity-locked blob`
- src/engine/index.ts:298 — `is legal) makes every '*_cz' capture, grade, EV, edge and Kelly stake read the DraftKings`
- src/lib/cfb/types.ts:177 — `/** ESPN's embedded DraftKings line — CONTEXT ONLY (rendered when the odds feed has no match) */`
- src/lib/mlb/live-quote-types.ts:79 — `/** the book every czAm / evCz on this overlay is priced at (INSTRUCTION 67, 2026-09-17: DraftKings); overlays from before that date carry no stamp and are Caesars-priced */`

##### DraftKings — UI (59 lines)

- app/board/page.tsx:91 — `the settle book is DraftKings now — same rule, the 'cz' quote is the DraftKings one. */` [x2]
- app/board/page.tsx:702 — `… <span className="text-[10px] text-faint" title="The in-play pull prices DraftKings only — there is no live DK/FD basis, and the pregame one prices a different line">`
- app/board/page.tsx:708 — `<span className="text-[9.5px] uppercase text-muted">{String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}</span>`
- app/board/page.tsx:713 — `title="No DraftKings or FanDuel quote — card-ineligible under dk_fd (still a real pick; manual slips only)"`
- app/board/page.tsx:739 — `…eOf(r.sub))} basis="EV at the live selected-book line" note="the in-play pull prices DraftKings, so there is no live DK/FD basis — this is the EV at the live selected-book line" />`
- app/board/page.tsx:782 — `<span className="text-[10px] text-faint" title="The in-play pull prices DraftKings only — no all-books survey exists at the live line">`
- app/board/page.tsx:1181 — `? "Consensus de-vigged probability · EV at the DK/FD basis, settled at DraftKings"`
- app/board/page.tsx:1448 — `…/FD basis (the better de-vigged price of the pair, tie → DK) — the exact price the Builder selects on. DraftKings is the settlement price; the DK app can differ — confirm at lock."`
- app/builder/page.tsx:187 — `title="¼-Kelly stake at this ticket's probability and DraftKings price (2%-of-bankroll cap) — the bankroll-growth-consistent size"`
- app/builder/page.tsx:195 — `title="DK/FD selection basis — the better of DraftKings/FanDuel, the price that picked and sized this ticket"`
- app/builder/page.tsx:205 — `title="Informational: EV at the DraftKings price, and the tax vs the DK/FD basis — you settle at DK, selection never sees it"`
- app/builder/page.tsx:281 — `title="Lineup not posted yet — projected everyday starter; DraftKings auto-voids the leg if he sits"`
- app/builder/page.tsx:377 — `{best !== null ? <span className="text-muted"> (best refused: +{best}% EV at DraftKings)</span> : null}`
- app/builder/page.tsx:742 — `? "UFC — build any parlay from the card's DraftKings moneylines, priced against market consensus"`
- app/builder/page.tsx:745 — `: "Exact-sum daily card from the engine's allocator, the FUN bucket, and a manual slip — all priced at DraftKings"`
- app/builder/page.tsx:796 — `DraftKings props live for {czCover.have} of {czCover.total} games right now`
- app/builder/page.tsx:979 — `<div className="text-[15px] font-semibold text-text">No positive-EV core card at DraftKings today</div>`
- app/builder/page.tsx:1060 — `… title={'Core tickets must clear +${gatePct}% EV at the selection price (${basisMode ? "DK/FD basis" : "DraftKings"}) — below the gate is a NO-PLAY, not a smaller bet'}`
- app/design/page.tsx:56 — `{ key: "cz", header: "DraftKings", numeric: true, sortValue: (r) => r.cz, cell: (r) => <OddsCell odds={r.cz} book="caesars" /> },`
- app/design/page.tsx:240 — `@ DraftKings`
- app/design/page.tsx:429 — `<span className="text-[11px] text-muted">DraftKings (gold, always)</span>`
- app/ledger/page.tsx:366 — `sub="Locked CFB paper cards only — append-only, its own bank and its own ledger, graded from final scores at the DraftKings line."`
- app/ledger/page.tsx:382 — `sub="Locked NFL paper cards only — append-only, its own bank and its own ledger, graded from final scores at the DraftKings line."`
- app/ledger/page.tsx:545 — `sub={'Locked cards only, since ${api.seed} — append-only, auto-graded from official MLB box scores under DraftKings void rules.'}`
- app/ledger/page.tsx:776 — `CLV compares your locked price to the last DraftKings price seen before first pitch (Caesars for cards locked before 2026-09-17) — the true closing`
- app/settings/page.tsx:78 — `DraftKings EV`
- app/settings/page.tsx:114 — `Kelly, FUN tiers — computes at the DraftKings price, the book the ticket actually settles at. A day with no`
- app/settings/page.tsx:117 — `discipline priced at the better de-vigged price between DraftKings and FanDuel (tie goes to DK); no other`
- app/settings/page.tsx:119 — `both a DK/FD basis and a DraftKings quote, and one that goes negative-EV at DraftKings is refused at lock.{" "}` [x2]
- app/settings/page.tsx:121 — `anchored to the full multi-book consensus — DraftKings only prices and sizes what was already chosen, and picks`
- app/settings/page.tsx:122 — `it doesn&apos;t offer are listed separately, never substituted. <b className="text-muted">DraftKings EV</b> is the`
- app/settings/page.tsx:498 — `<span className="text-[12px] text-gold">DraftKings — the only book the card prices</span>`
- app/sharp/page.tsx:363 — `? 'Today's plays — EV at the DK/FD basis, gate +${gatePct}% (the Builder's exact bar; DraftKings settles, never picks)'`
- app/sharp/page.tsx:384 — `{String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}`
- app/sharp/page.tsx:527 — `title="Lineup not posted yet — projected everyday starter; DraftKings auto-voids the leg if he sits"`
- app/sharp/page.tsx:585 — `…${Number(r.prob).toFixed(1)}% true · basis ${String(r.bsOdds)} (${String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}) · +${Number(r.bsEv).toFixed(1)}% EV'`
- src/components/cfb/CfbBuilder.tsx:542 — `No side cleared +{L.rules.minEvPct}% EV at DraftKings under {L.rules.maxDec.toFixed(2)} that day — recommended stake $0.`
- src/components/cfb/CfbBuilder.tsx:563 — `{slate.games.length} games{slate.oddsMissing ? " · DraftKings prices missing" : ""}`
- src/components/cfb/CfbBuilder.tsx:576 — `No playable side clears +{L.rules.minEvPct}% EV at DraftKings under {L.rules.maxDec.toFixed(2)} on this slate.`
- src/components/cfb/CfbGameCard.tsx:37 — `draftkings: "DK",`
- src/components/cfb/CfbPicksBoard.tsx:563 — `headerTitle: "Price at the selected sportsbook (DraftKings settles every desk)",`
- src/components/cfb/CfbPicksBoard.tsx:754 — `{selectedBook === "DraftKings" && propsQ.data.czMissing`
- src/components/cfb/CfbPicksBoard.tsx:755 — `…ame${propsQ.data.czMissing === 1 ? "" : "s"} post player props at other books but no DraftKings line yet — re-checked every ${CFB_PROPS.czMissingRevalidateSec / 60} min inside ${CF…`
- src/components/cfb/CfbProps.tsx:104 — `{ key: "cz", label: "DraftKings" },`
- src/components/cfb/CfbProps.tsx:110 — `draftkings: "DK",`
- src/components/cfb/CfbProps.tsx:1305 — `{selectedBook === "DraftKings" && board.czMissing ? ' · ${board.czMissing} game${board.czMissing === 1 ? "" : "s"} post player props at other books but no DraftKings li…` [x2]
- src/components/cfb/CfbSharp.tsx:56 — `{ key: "cz", label: "DraftKings", games: count("cz") },`
- src/components/cfb/CfbSharp.tsx:57 — `{ key: "dk", label: "DraftKings", games: count("dk") },`
- src/components/cfb/CfbTicketCard.tsx:259 — `…single ? <span className={'single-ticket-price hero-price ${heroTone}'} aria-label={'DraftKings price ${fmtAmerican(t.czOdds)}'}>{fmtAmerican(t.czOdds)}</span> : <span className="n…`
- src/components/cfb/CfbTicketCard.tsx:267 — `<span className={'hero-price ${heroTone} shrink-0'} aria-label={'DraftKings price ${fmtAmerican(t.czOdds)}'}>`
- src/components/cfb/CfbTicketCard.tsx:338 — `<GradeChip grade={evGrade} basis="EV at DraftKings" />`
- src/components/ledger/ReceiptsPanel.tsx:137 — `<span className="ml-1 text-faint">— what settling at DraftKings cost vs the price that picked the card</span>`
- src/components/mlb/ParlaysSection.tsx:231 — `title="No DraftKings or FanDuel quote on every leg — browsable and manual-slip eligible, but the card never selects without a basis price"`
- src/components/mlb/ProScoreboard.tsx:195 — `CLV = de-vigged cross-book closing probability minus the probability implied by your locked DraftKings price`
- src/components/props/props-model.ts:68 — `draftkings: "DK",`
- src/components/props/props-model.ts:277 — `/** The price for one side: the settlement book (DraftKings) when it posts it, else the feed's best. */`
- src/components/props/useParlayGen.ts:178 — `/* INSTRUCTION 67 (2026-09-17): "settle-book only" keeps legs priced at the selected sportsbook — DraftKings by default */`
- src/components/stats/ClvPanel.tsx:33 — `caesars_ev: "DraftKings EV",`
- src/components/stats/ClvPanel.tsx:165 — `…<th className="pb-2 text-right" title="Locked settlement-book price vs the last pre-pitch price at that book (DraftKings since 2026-09-17), in cents; positive = we beat the close">`

##### DraftKings — tests (364 lines)

- tests/basis-surfaces.test.ts:138 — `key: "draftkings",`
- tests/board-compact.test.ts:57 — `expect(src).toMatch(/header: "Book",\s*headerTitle: "Price at the selected sportsbook \(DraftKings settles every desk\)"/);`
- tests/board-live-anchor.test.ts:120 — `bsBk: "draftkings",`
- tests/board-live-anchor.test.ts:142 — `settleBook: "draftkings", // the route stamps its settle book (INSTRUCTION 67); an unstamped overlay would be repriced as a Caesars one`
- tests/board-teamless-row.test.ts:226 — `"book:draftkings:batter_total_bases|Luis Garcia (null)|1.5|o": [true, 110],`
- tests/board-teamless-row.test.ts:235 — `"book:draftkings:batter_total_bases|Luis Garcia|1.5|o": [true, 110],`
- tests/board-teamless-row.test.ts:321 — `'book:draftkings:batter_hits|${p} (null)|0.5|o',`
- tests/board-teamless-row.test.ts:322 — `'book:draftkings:batter_hits|${p}|0.5|o',`
- tests/cfb-card.test.ts:83 — `{ key: "draftkings", title: "DraftKings", h2h: [czHome, 150], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },` [x2]
- tests/cfb-card.test.ts:89 — `{ key: "draftkings", title: "DraftKings", h2h: [-150, 130], spread: [-3, -110, -110], total: [48.5, -110, -110] },` [x2]
- tests/cfb-card.test.ts:96 — `{ key: "draftkings", title: "DraftKings", h2h: [-300, -200], spread: [-3, -200, -200], total: [48.5, -200, -200] },` [x2]
- tests/cfb-card.test.ts:280 — `expect(card.notes.some((n) => /no playable side clears \+2% EV at DraftKings/.test(n))).toBe(true);`
- tests/cfb-card.test.ts:418 — `{ key: "draftkings", title: "DraftKings", h2h: [-205, 175], spread: [-6.5, -110, -110], total: [50.5, -110, -110] },` [x2]
- tests/cfb-lock-route.test.ts:576 — `expect(String(body.note)).toMatch(/no DraftKings price/i);`
- tests/cfb-lock-route.test.ts:594 — `expect(String(body.note)).toMatch(/no DraftKings price/i);`
- tests/cfb-lock-route.test.ts:665 — `expect(String(body.note)).toMatch(/no playable side clears \+2% EV at DraftKings/);`
- tests/cfb-lock-route.test.ts:1142 — `expect(String(y.note)).toMatch(/no DraftKings price/i);`
- tests/cfb-lock-route.test.ts:1160 — `expect(String(y.note)).not.toMatch(/no DraftKings price/i);`
- tests/cfb-model.test.ts:130 — `if (r.cz) expect(r.cz.book).toBe("draftkings");`
- tests/cfb-model.test.ts:132 — `if (r.dk) expect(r.dk.book).toBe("draftkings");`
- tests/cfb-model.test.ts:193 — `expect(nt.cz).toMatchObject({ book: "draftkings", price: -104, line: 39.5 });`
- tests/cfb-model.test.ts:242 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings", "pinnacle"])], fpi: null });`
- tests/cfb-model.test.ts:264 — `expect(a.best).toMatchObject({ book: "draftkings", price: -106 });`
- tests/cfb-model.test.ts:279 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings", "pinnacle"])], fpi: null });`
- tests/cfb-model.test.ts:290 — `expect(u.best).toMatchObject({ book: "draftkings", price: -109, line: 52.5 });`
- tests/cfb-model.test.ts:294 — `* CHECK 3 — Alabama moneyline, books = DraftKings + FanDuel h2h ONLY (weights 1 and 1), FPI withheld.`
- tests/cfb-model.test.ts:336 — `const b = build({ oddsEvents: [reduced("James Madison Dukes", ["draftkings", "pinnacle"], ["h2h"])], fpi: null });`
- tests/cfb-model.test.ts:341 — `expect(h.cz).toMatchObject({ book: "draftkings", price: -230, line: null });`
- tests/cfb-model.test.ts:437 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["draftkings"])], fpi: null });`
- tests/cfb-picks-ui.test.ts:140 — `/\{selectedBook === "DraftKings" && propsQ\.data\.czMissing\s*\? ' · \$\{propsQ\.data\.czMissing\} game\$\{propsQ\.data\.czMissing === 1 \? "" : "s"\} post player props at ot…` [x2]
- tests/cfb-picks.test.ts:61 — `const cz = dec == null ? null : { book: "draftkings", title: "DraftKings", price: s.cz, line: s.line, dec };` [x2]
- tests/cfb-picks.test.ts:164 — `{ key: "draftkings", title: "DraftKings", h2h: [-180, 150], spread: [-6.5, 100, 100], total: [50.5, 100, 100] },` [x2]
- tests/cfb-picks.test.ts:686 — `const cz = { book: "draftkings", title: "DraftKings", price: decToAm(Math.round(dec * 1000) / 1000), line, dec };` [x2]
- tests/cfb-picks.test.ts:861 — `const cz = { book: "draftkings", title: "DraftKings", price: decToAm(dec), line: null, dec };` [x2]
- tests/cfb-props-ui.test.ts:165 — `/\{selectedBook === "DraftKings" && board\.czMissing \? ' · \$\{board\.czMissing\} game\$\{board\.czMissing === 1 \? "" : "s"\} post player props at other books but no DraftK…` [x2]
- tests/cfb-props.test.ts:70 — `settleBook: "draftkings",`
- tests/cfb-props.test.ts:150 — `expect(r.cz).toEqual({ book: "draftkings", title: "DraftKings", price: -110, line: 249.5, dec: expect.closeTo(1.909091, 5) });` [x2]
- tests/cfb-props.test.ts:226 — `const payload = { id: "x", bookmakers: [ou("draftkings", "DraftKings", -130, 100), ou("williamhill_us", "Caesars", -105, -115)] };` [x2]
- tests/cfb-props.test.ts:237 — `const mirrored = { id: "x", bookmakers: [ou("draftkings", "DraftKings", 100, -130), ou("williamhill_us", "Caesars", -115, -105)] };` [x2]
- tests/cfb-props.test.ts:253 — `{ key: "draftkings", title: "DraftKings", markets: [{ key: "player_anytime_td", outcomes: [` [x2]
- tests/cfb-props.test.ts:266 — `{ key: "draftkings", title: "DraftKings", markets: [{ key: "player_receptions", outcomes: [` [x2]
- tests/cfb-season-ui.test.ts:140 — `expect(legs[0].book).toBe("DraftKings");`
- tests/cfb-season.test.ts:196 — `const l3 = makeSeasonLeg(rookieProj, priceSeasonLeg(rookieProj, "over", 3300.5, +105)!, "DraftKings");`
- tests/cfb-season.test.ts:206 — `expect(l3.book).toBe("DraftKings");`
- tests/cfb-separation.test.ts:38 — `it("DraftKings settles (INSTRUCTION 67, 2026-09-17)", () => {`
- tests/cfb-separation.test.ts:39 — `expect(rules).toMatch(/settleBook:\s*"draftkings"/);`
- tests/defense-imagery.test.tsx:20 — `const rows=parseEventProps({id:'e',bookmakers:[{key:'draftkings',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Atlanta Falcons D/ST',price:400}]}]},{key:'f…`
- tests/defense-imagery.test.tsx:21 — `…er:'Atlanta Falcons D/ST',teamId:'1',teamAbbr:'ATL',pos:'D/ST',headshot:null});expect(rows[0].books).toBe(2);expect(Object.keys(rows[0].quotes!)).toEqual(['draftkings','fanduel']);`
- tests/discovery-release.test.ts:91 — `it("missing stored boards produce no invented candidates",()=>{expect(crossSportLegs({},"draftkings",Date.now())).toEqual([]);});`
- tests/discovery-release.test.ts:105 — `it("cannot borrow a newer DraftKings timestamp for a stale FanDuel quote",()=>{`
- tests/discovery-release.test.ts:106 — `const row={displayBook:"fanduel",bookQuotes:{o:{draftkings:{at:"2026-09-20T19:09:00Z"},fanduel:{at:"2026-09-20T18:00:00Z"}}}} as unknown as PropBoardRow;`
- tests/dkfd-basis.test.ts:9 — `gate, weights, Kelly, FUN tiers — computes at the better of DraftKings/FanDuel`
- tests/dkfd-basis.test.ts:82 — `o.bookmakers = (o.bookmakers as AnyObj[]).filter((b) => b.key !== "draftkings" && b.key !== "fanduel");`
- tests/dkfd-basis.test.ts:271 — `{ key: "draftkings", markets: [mk(-112, -108)] },`
- tests/engine2-devig.test.ts:63 — `{ key: "draftkings", a: americanFromProb(0.55), b: americanFromProb(0.45) },`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1227 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1228 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1945 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1946 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2608 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2609 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3882 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3883 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5156 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5157 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6080 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6081 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7527 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7528 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8176 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8177 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9397 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9398 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10725 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10726 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11114 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11115 — `"title": "DraftKings",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:199 — `"key": "draftkings",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:200 — `"title": "DraftKings",`
- tests/fixtures/fix39/odds.json:1 — `…Over","price":-120,"point":8.5},{"name":"Under","price":100,"point":8.5}]}]},{"key":"draftkings","title":"DraftKings","last_update":"2026-07-10T05:50:14Z","markets":[{"key":"h2h","…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…{"name":"Under","description":"Ryan Weathers","price":-118,"point":16.5}]}]},{"key":"draftkings","title":"DraftKings","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…,{"name":"Under","description":"Hunter Greene","price":-125,"point":6.5}]}]},{"key":"draftkings","title":"DraftKings","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…5},{"name":"Under","description":"Aaron Nola","price":-112,"point":16.5}]}]},{"key":"draftkings","title":"DraftKings","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…name":"Under","description":"Sandy Alcantara","price":-129,"point":18.5}]}]},{"key":"draftkings","title":"DraftKings","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…5},{"name":"Under","description":"Jake Mangum","price":-157,"point":1.5}]}]},{"key":"draftkings","title":"DraftKings","markets":[{"key":"batter_hits","last_update":"2026-07-10T05:5…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…"Under", "description": "Ryan Weathers", "price": -118, "point": 16.5}]}]}, {"key": "draftkings", "title": "DraftKings", "markets": [{"key": "batter_hits", "last_update": "2026-07-…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:22 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:37 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:67 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:69 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:82 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:84 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:97 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:99 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:112 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:114 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:127 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:129 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:142 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:144 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:157 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:159 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:172 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:174 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:187 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:189 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:202 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:204 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:217 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:219 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:232 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:234 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:247 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:249 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:262 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:264 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:277 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:279 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:292 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:294 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:307 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:309 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:342 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:396 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:414 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:468 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:485 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:557 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:647 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:682 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:702 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1223 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1253 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1255 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1285 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1287 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1300 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1302 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1315 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1317 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1330 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1332 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1345 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1347 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1360 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1362 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1375 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1377 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1390 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1392 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1405 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1407 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1420 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1422 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1435 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1437 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1450 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1452 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1465 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1467 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1480 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1482 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1495 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1497 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1510 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1512 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1525 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1527 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1577 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1613 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1631 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:1649 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2158 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2176 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2194 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2196 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2212 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2214 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2230 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2232 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2248 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2250 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2266 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2268 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2284 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2286 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2302 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2304 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2320 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2322 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2338 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2340 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2356 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2358 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2374 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2376 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2392 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2394 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2410 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2412 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2428 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2430 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2446 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2448 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2464 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2466 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2482 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2484 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:2647 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3502 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3504 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3517 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3519 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3532 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3534 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3547 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3549 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3562 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3564 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3577 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3579 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3592 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3594 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3607 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3609 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3674 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3712 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:3729 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4267 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4282 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4299 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4312 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4314 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4327 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4329 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4342 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4344 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4357 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4359 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4372 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4374 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4387 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4389 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4402 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4404 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4417 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4419 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4432 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4434 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4447 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4449 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4462 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4464 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4477 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4479 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4492 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4494 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4507 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4509 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4522 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4524 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4537 — `"oBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4539 — `"uBook": "DraftKings",`
- tests/fixtures/gen-pool.json:4606 — `"oBook": "DraftKings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:175 — `"key": "draftkings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:176 — `"title": "DraftKings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:467 — `"key": "draftkings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:468 — `"title": "DraftKings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:594 — `"key": "draftkings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:595 — `"title": "DraftKings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:652 — `"key": "draftkings",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:653 — `"title": "DraftKings",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…null,"fair":0.37037037037037035,"fairAm":170,"books":7,"assumedHold":true,"quotes":{"draftkings":{"book":"draftkings","title":"DraftKings","price":150,"line":null,"dec":2.5},"willi…` [long line; 356 occurrences on this line; first shown]
- tests/fixtures/nfl/espn-scoreboard-2026-09-10.json:1 — `…,"name":"Draft Kings","priority":1,"logos":[{"href":"https://a.espncdn.com/i/betting/Draftkings_Light.svg","rel":["light"]},{"href":"https://a.espncdn.com/i/betting/Draftkings_Dark…` [long line; 19 occurrences on this line; first shown]
- tests/fixtures/nfl/espn-scoreboard-2026-09-13.json:1 — `…,"name":"Draft Kings","priority":1,"logos":[{"href":"https://a.espncdn.com/i/betting/Draftkings_Light.svg","rel":["light"]},{"href":"https://a.espncdn.com/i/betting/Draftkings_Dark…` [long line; 223 occurrences on this line; first shown]
- tests/fixtures/nfl/odds-2026-09-13.json:119 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:120 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:343 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:344 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:567 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:568 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:791 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:792 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1015 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1016 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1239 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1240 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1463 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1464 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1687 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1688 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1911 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:1912 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2135 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2136 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2359 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2360 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2583 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2584 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2807 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-2026-09-13.json:2808 — `"title": "DraftKings",`
- tests/fixtures/nfl/odds-event-props-401872925.json:276 — `"key": "draftkings",`
- tests/fixtures/nfl/odds-event-props-401872925.json:277 — `"title": "DraftKings",`
- tests/football-ladders.test.ts:9 — `const books=['draftkings','williamhill_us','fanduel'];`
- tests/football-ladders.test.ts:55 — `const dk=priceFootballProp(raw,'draftkings');expect(dk.line).toBe(6.5);expect(dk.fair).toBeNull();expect(dk.grade).toBeNull();`
- tests/found-football.test.ts:206 — `/* every leg's price is the slate's own DraftKings quote */`
- tests/found-football.test.ts:527 — `cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 },`
- tests/found-football.test.ts:554 — `cz: {book: "draftkings", price: 100, line: 4.5, dec: 2},`
- tests/games-sheet-hold.test.tsx:368 — `/* the real 2026-09-05 CFB fixture board, built at two bankrolls (swapSettleBook: the fixtures predate DraftKings settling) */`
- tests/games-sheet-hold.test.tsx:380 — `expect(DEFAULT_BOOK).toBe("draftkings");`
- tests/gen-moved-note.test.ts:49 — `rows: parseEventProps(EVENT, ala, { now: T1, bankroll: 2500 }).map((r) => priceFootballProp(status ? { ...r, status } : r, "draftkings", 2500)),`
- tests/helpers/settle-book.ts:3 — `* DraftKings ('draftkings'). Every odds fixture under tests/fixtures was captured or synthesised` [x2]
- tests/helpers/settle-book.ts:10 — `williamhill_us: { key: "draftkings", title: "DraftKings" },` [x2]
- tests/helpers/settle-book.ts:11 — `draftkings: { key: "williamhill_us", title: "Caesars" },`
- tests/hr-line-rule.test.ts:23 — `p, tm: "LAD", ln, lkey: '${p.toLowerCase().replace(/ /g, "")}|batter_home_runs|${ln}', o: ln > 0.5 ? 6000 : 320, u: null, oBook: "DraftKings", uBook: null,`
- tests/live-board-reason.test.ts:208 — `gkey: GKEY, lkey: LKEY, czAm: -145, oppAm: 115, bsAm: -150, bsBk: "draftkings", books: 6,`
- tests/live-production-proof.test.ts:10 — `const rows=board.rows.map((r:any)=>priceFootballProp(r,'draftkings'));`
- tests/mlb-live-props-route.test.ts:752 — `expect(MLB_LIVE_PROPS.settleBook).toBe("draftkings");`
- tests/mlb-live-rules.test.ts:96 — `settleBook: "draftkings",`
- tests/mlb-live-rules.test.ts:304 — `bsBk: "draftkings",`
- tests/mlb-market-phases.test.ts:56 — `const books=[{key:"williamhill_us",title:"Caesars",price:-120},{key:"draftkings",title:"DraftKings",price:130}];` [x2]
- tests/mlb-market-phases.test.ts:61 — `expect(priceMlbBoard(captured,"draftkings").propBoard![0].markets[market][0].cz?.o).toBe(130);`
- tests/mlb-market-phases.test.ts:123 — `const quotes={draftkings:{o:150,u:-170},williamhill_us:{o:180,u:-200},fanduel:{o:120,u:-140}};`
- tests/mlb-postseason.test.ts:34 — `…ay",label:"A ML",prob:55}]},gameInfo:{"a@b":{away:"A",home:"B"}},bookQuotes:{"a@b|ml_away|o":{draftkings:{am:-120}},"a@b|ml_home|o":{draftkings:{am:105}}}} as unknown as BoardData;` [x2]
- tests/mlb-postseason.test.ts:35 — `const rows=priceMlbMoneylines(data,"draftkings");expect(rows).toHaveLength(2);`
- tests/mlb-postseason.test.ts:36 — `expect(rows[1]).toMatchObject({label:"B ML",odds:105,book:"DraftKings"});expect(rows[1].prob).toBeUndefined();`
- tests/nfl-lock-route.test.ts:378 — `…t(String(body.note)).toMatch(/^locked by the server before the first kickoff — 13 games on the slate · No core ticket — no playable side clears \+2% EV at DraftKings under 2\.60/);`
- tests/nfl-props-route.test.ts:168 — `expect(NFL_PROPS.settleBook).toBe("draftkings");`
- tests/nfl-variety-paper.test.ts:15 — `…s",side:"over",player:'Player ${i}',label:'Player ${i} O 4.5 Receptions',teamId:g.home.id,line:4.5,fair:.53,evCz:6,cz:{book:"draftkings",price:100,line:4.5,dec:2}} as CfbPropRow));`
- tests/parlay-gen-ui.test.ts:167 — `expect(out).not.toContain("DraftKings-priced legs only");`
- tests/prop-lean.test.ts:54 — `expect(bookTag("draftkings")).toBe("DK");`
- tests/prop-lean.test.ts:55 — `expect(bookTag("DraftKings")).toBe("DK");`
- tests/prop-lean.test.ts:63 — `…ow = (o: number | null, u: number | null, cz: { o: number | null; u: number | null } | null) => ({ cz, o, u, oBook: "fanduel", uBook: "draftkings", settlementBook: "draftkings" });` [x2]
- tests/prop-lean.test.ts:95 — `const l = footballPropLean([side("over", q("draftkings", -130, 245.5), null), side("under", q("draftkings", +110, 245.5), null)], "cz")!;` [x2]
- tests/prop-lean.test.ts:100 — `expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 245.5), null)], "cz")!.side).toBe("even");` [x2]
- tests/prop-lean.test.ts:103 — `expect(footballPropLean([side("over", q("draftkings", -115, 245.5), null), side("under", q("draftkings", -105, 249.5), null)], "cz")).toBeNull();` [x2]
- tests/prop-lean.test.ts:106 — `expect(footballPropLean([side("yes", q("draftkings", +140, null), null)], "cz")).toBeNull();`
- tests/prop-lean.test.ts:109 — `const rows = [side("over", q("draftkings", -140, 245.5), null), side("under", q("draftkings", +120, 245.5), null), side("yes", q("draftkings", +140, null), null)];` [x3]
- tests/props-model.test.ts:36 — `oBook: "DraftKings",`
- tests/props-model.test.ts:67 — `expect(bookAb("draftkings")).toBe("DK");`
- tests/props-model.test.ts:68 — `expect(bookAb("DraftKings")).toBe("DK");`
- tests/props-team-filter.test.ts:45 — `oBook: "DraftKings",`
- tests/sportsbook.test.ts:10 — `…:.5,status:'upcoming',kickoff:'2099-01-01',cz:quote('williamhill_us',-130),dk:quote('draftkings',120),fd:null,best:quote('draftkings',120),evCz:-11.5,grade:'F'} as unknown as CfbPr…` [x2]
- tests/sportsbook.test.ts:15 — `…selected quote and preserve the original row',()=>{const out=priceFootballProp(prop,'draftkings');expect(out.cz?.price).toBe(120);expect(out.grade).toBe('S');expect(prop.cz?.price)…`
- tests/sportsbook.test.ts:17 — `…t('different prop line requires its own probability',()=>{const r={...prop,dk:quote('draftkings',120,1.5)};expect(priceFootballProp(r,'draftkings').evCz).toBeNull();const out=price…` [x4]
- tests/sportsbook.test.ts:18 — `it('preserves explicit null probability rather than falling back',()=>expect(priceFootballProp({...prop,probabilities:{draftkings:null}},'draftkings').grade).toBeNull());` [x2]
- tests/sportsbook.test.ts:19 — `…ead',side:'home',label:'Home -3.5',line:-3.5,fair:.5,push:0,key:'g|spread',dk:quote('draftkings',-110,-7.5)} as never;const game={status:'upcoming',start:'2099-01-01',home:{short:'…` [x2]
- tests/sportsbook.test.ts:21 — `…ive:false,markets:{batter_hits:[{p:'Player',tm:'AW',ln:.5,lkey:'player|batter_hits|0.5',o:120,oBook:'DraftKings',u:-130,uBook:'Caesars',cz:{o:-130,u:110},pO:50,fO:48,books:3}]}}]};`
- tests/sportsbook.test.ts:22 — `…'one',home_team:'Home',away_team:'Away',commence_time:'2099-01-01',bookmakers:[{key:'draftkings',title:'DraftKings',last_update:'2098-12-31',markets:[{key:'h2h',outcomes:[{name:'Aw…` [x2]
- tests/sportsbook.test.ts:24 — `…quoteCapture();capture.capture(event);expect(capture.events.size).toBe(1);expect(event.bookmakers[0].key).toBe('draftkings');capture.clear();expect(capture.events.size).toBe(0);});`
- tests/sportsbook.test.ts:25 — `…ill_us');/* the fixture's cz prices are Caesars' */const out=priceMlbBoard(enriched,'draftkings');expect(out.categories.ml[0].czOdds).toBe(120);expect(out.categories.ml[0].czEv).to…`
- tests/sportsbook.test.ts:27 — `…book',()=>{const row=data.propBoard![0].markets.batter_hits[0];expect(priceMlbProp(row,'draftkings').cz).toEqual({o:120,u:null});expect(priceMlbProp(row,'betmgm').o).toBeNull();});`
- tests/sportsbook.test.ts:28 — `…ne for each side',()=>{const b={rows:{x:{ln:2.5,pLive:.3,czAm:-120,oppAm:100,quotes:{draftkings:{o:200,u:-220}}}}} as never;const out=priceLiveBoard(b,'draftkings')!;expect(out.row…` [x2]
- tests/sportsbook.test.ts:32 — `const r={label:'Player',sub:'Over 0.5',prob:50,odds:'+120' as never,book:'DraftKings'};`
- tests/sportsbook.test.ts:33 — `expect(priceMlbRow(r,'draftkings').czOdds).toBe(120);`
- tests/sportsbook.test.ts:34 — `expect(priceMlbRow(r,'draftkings').czEv).toBeCloseTo(10);`
- tests/sportsbook.test.ts:43 — `expect(priceMlbBoard(attachBookQuotes(data,[e],'williamhill_us'),'draftkings').propBoard![0].markets.batter_hits[0].cz?.o).toBe(120);`
- tests/sportsbook.test.ts:53 — `expect(priceMlbMoneylines(data,"draftkings")[0]).toMatchObject({odds:105,cz:105,book:"DraftKings"});` [x2]
- tests/sportsbook.test.ts:57 — `…er",sub:"Over 0.5",prob:50,odds:"+120",book:"FanDuel",bs:-110,bsBook:"DK"} as never,"draftkings");expect(row.czOdds).toBe(-110);expect(row.bestDisplayOdds).toBe("+120");expect(row.…`
- tests/sportsbook.test.ts:60 — `const row={prob:50,settlementBook:'draftkings',gkey:'g',lkey:'p',sub:'Over 0.5'};`
- tests/supplemental.test.ts:279 — `{ key: "draftkings", markets: [mk(-112, -108)] },`
- tests/ticketstack-markets.test.tsx:61 — `…er", player: 'Player ${i}', label: 'Player ${i} O 4.5 Receptions', teamId: g.home.id, line: 4.5, fair: 0.53, evCz: 6, cz: { book: "draftkings", price: 100, line: 4.5, dec: 2 } }));`

##### DraftKings — docs (30 lines)

- CLAUDE.md:110 — `…enerator has NO build styles, odds presets or "Your mix", and NO sportsbook toggle — DraftKings prices and grades everything ('SETTLE_BOOK'); do not bring a "Safer/Balanced" or "Fa…`
- CLAUDE.md:158 — `- **Settlement book = DraftKings (INSTRUCTION 67, 2026-09-17).** 'SETTLE_BOOK' in 'src/lib/sportsbook/books.ts' is the book every grade, edge %, EV and Kelly stake is computed at, …`
- ENGINE2.md:311 — `**The idea:** shop at DraftKings/FanDuel, settle at Caesars NV. The basis price per`
- docs/harness-substitutions.md:255 — `…enever the caller passes 'settlementBook' — production always passes 'SETTLE_BOOK' ('draftkings', INSTRUCTION 67, 2026-09-17); a test that omits it runs the blob's own 'var CAESARS…` [x2]
- docs/multibook-memo.md:83 — `{DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,`
- docs/progress.md:90 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/progress.md:96 — `Refresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that re…`
- docs/progress.md:122 — `…ency and archive failure reporting. Corrected stale orientation facts to the current DraftKings default and MLB $350 daily core. Application remains the verified September 19 relea…`
- docs/progress.md:225 — `…written): Safer/Balanced mixes, Favorites/Even/Longshots presets, "Your mix" and the DraftKings-only toggle are gone. Chip rows: Legs · Categories (multi-select — one ticket can mi…`
- docs/progress.md:264 — `# Progress — 2026-09-17 (DraftKings settlement book)`
- docs/progress.md:266 — `INSTRUCTION 67: Josh asked for every grade, edge %, EV and Kelly stake to be computed at DraftKings instead of Caesars, with nothing else on the site changed.`
- docs/progress.md:268 — `- 'SETTLE_BOOK = "draftkings"' ('src/lib/sportsbook/books.ts') is now the one settlement constant. The legacy MLB engine's 'CAESARS_KEY' variable is rebound to it by the facade on …` [x2]
- docs/progress.md:269 — `…oard') short-circuit on that stamp rather than on the default book, so a stale Caesars board is repriced at DraftKings from its quote index until the next refresh slot rebuilds it.`
- docs/progress.md:270 — `… UFC helper, the season lab default book and the offered-book scoping all flipped to DraftKings. The parlay generator's book-only toggle now reads "DraftKings-priced legs only" and…` [x3]
- docs/progress.md:271 — `- Labels, notes and refusal strings that named Caesars as the settle book now name DraftKings (Board, Builder, Settings, Ledger, CLV panel, CFB/NFL lock notes, football props). Ver…`
- docs/progress.md:272 — `… 'tests/helpers/settle-book.ts' loads the hand-checked fixtures with the Caesars and DraftKings keys exchanged; the parlay-generator fixtures pass 'pricingBook: "CZ"' because the c…`
- docs/progress.md:273 — `- Astra's uncommitted DraftKings pass was archived (never committed) in the handoff's 'review-2026-09-17-draftkings/'.` [x2]
- docs/progress.md:290 — `…fault. Production verified Emmett Johnson anytime TD: Caesars +650 / F / -7.4% EV to DraftKings +750 / A / +4.9% EV, same fair probability. Deployment proof is recorded in review-2…`
- docs/september-19-phases.md:3 — `Baseline reviewed: Claude's 33807d1 handoff and 9c048d8 app release. Preserve DraftKings pricing, daily ballpark modeling, first-half football markets, paper budgets and quote fres…`
- docs/september-19-phases.md:8 — `- Verify minimum one-hour window, midnight/end-of-day, pins, history, same-game constraints and unchanged DraftKings math.`
- docs/session-handoff.md:159 — `…ith 'shrinkTicket(…, CORE_RULES.shrinkW)'; a ticket qualifies when its blended EV at DraftKings is positive. Why the blend and not the strict allocator gate: the gate passed ZERO b…`
- docs/session-handoff.md:162 — `… in 'src/lib/server/football-lock.ts').** Candidates are the existing football gate: DraftKings price, +2% EV ('rules.minEvPct'), 'maxDec', not first-half, game not started; single…`
- docs/session-handoff.md:181 — `…player "Name (TEAM)" from the stats pull. When the book's spelling misses that pull (DraftKings' "Leonardo Bernal" is statsapi's "Leo Bernal"), the row has no team, and the Board's…`
- docs/session-handoff.md:450 — `…e pull now bypasses empty-market hold as well as quote-age reuse. Three-book quotes (DraftKings, Caesars/williamhill_us, FanDuel) remain fetched together and repriced locally per s…`
- docs/session-handoff.md:478 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/session-handoff.md:484 — `Refresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that re…`
- docs/session-handoff.md:861 — `…s Caesars ('williamhill_us') on both desks until Josh says he is in another state on DraftKings or FanDuel, and the switch is made only for that trip. Pinned in 'tests/board-scope.…`
- docs/session-handoff.md:1694 — `…e website besides exactly what I explain. I want all parlays etc calculated based on DraftKings odds instead of Caesars. So everything the exact same with the engine/website except…` [long line; 10 occurrences on this line; first shown]
- docs/session-handoff.md:1706 — `… are a ton of HR live props on the board and just starting. I can access them on the Draftkings, william hill & caesars apps. I refreshed the board as well from 5:00pm last refresh…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1712 — `…src/components/props/GenSheet.tsx') — build styles, odds presets, "Your mix" and the DraftKings-only toggle are gone (DK is the settlement book everywhere via 'SETTLE_BOOK'; 'czOnl…` [long line; 1 occurrences on this line; first shown]

##### DraftKings — tools (5 lines)

- tools/sync-handoff.sh:256 — `| **MLB** (baseball) | $350 (since September 18) | $25 | DraftKings via The Odds API + free MLB statsapi |`
- tools/sync-handoff.sh:257 — `| **CFB** (college football) | $250 | $25 | DraftKings via The Odds API |`
- tools/sync-handoff.sh:258 — `| **NFL** | $350 | $25 | DraftKings via The Odds API |`
- tools/sync-handoff.sh:263 — `DraftKings is the default and settlement book; browsing can select another sportsbook. A locked card is`
- tools/sync-handoff.sh:639 — `- The default and settlement book is **DraftKings** ('draftkings'); browse filters may select another book.` [x2]

#### FanDuel

153 matching lines in 55 files (485 occurrences).

##### FanDuel — fetch code (1 lines)

- app/api/ufcprops/route.ts:18 — `const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);`

##### FanDuel — config (1 lines)

- src/lib/sportsbook/books.ts:4 — `{key:'fanduel',label:'FanDuel',short:'FD'},` [x2]

##### FanDuel — calculations (17 lines)

- legacy/index.html:1306 — `var dkm=mls.filter(function(x){return x.k==="draftkings";})[0],fdm=mls.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1328 — `var dkr=use.filter(function(x){return x.k==="draftkings";})[0],fdr=use.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1372 — `var bsb=(bk.key==="draftkings"||bk.key==="fanduel");`
- legacy/index.html:1394 — `if(!abb[kk2])abb[kk2]={draftkings:{o:null,u:null},fanduel:{o:null,u:null}};`
- legacy/index.html:1423 — `var dkx=r.list.filter(function(x){return x.k==="draftkings";})[0],fdx=r.list.filter(function(x){return x.k==="fanduel";})[0];`
- legacy/index.html:1427 — `var fdO=(fdx&&fdx.o!=null)?fdx.o:(abk&&abk.fanduel.o!=null?abk.fanduel.o:null);` [x2]
- legacy/index.html:1428 — `var fdU=(fdx&&fdx.u!=null)?fdx.u:(abk&&abk.fanduel.u!=null?abk.fanduel.u:null);` [x2]
- legacy/index.html:1560 — `DraftKings and FanDuel ONLY, line-shopped within that pair — tie goes to DK.`
- src/engine/legacy-src.gen.ts:5 — `…unction(x){return x.k===\"draftkings\";})[0],fdm=mls.filter(function(x){return x.k===\"fanduel\";})[0];\n var bmh=shBasisPick(dkm?{am:dkm.h,bk:\"DK\"}:null,fdm?{am:fdm.h,bk:…` [long line; 10 occurrences on this line; first shown]
- src/engine2/sharpBoard.ts:91 — `if (bk.key === "fanduel") { fdAway = away.price; fdHome = home.price; }`
- src/engine2/sharpBoard.ts:124 — `const fd = best.books.find((b) => b.key === "fanduel") ?? null;`
- src/lib/cfb/model.ts:397 — `return { all: quotes, cz: find(settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };`
- src/lib/cfb/props.ts:347 — `fd: find("fanduel"),`
- src/lib/prop-lean.ts:68 — `/** "draftkings" → "DK", "fanduel" → "FD", anything else → first two letters upper-cased */`
- src/lib/prop-lean.ts:73 — `if (k.includes("fanduel") || k === "fd") return "FD";`
- src/lib/server/clv-core.ts:22 — `const FD = "fanduel";`
- src/lib/server/mlb-live-quote.ts:121 — `const FD = "fanduel";`

##### FanDuel — UI (11 lines)

- app/board/page.tsx:708 — `<span className="text-[9.5px] uppercase text-muted">{String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}</span>`
- app/board/page.tsx:713 — `title="No DraftKings or FanDuel quote — card-ineligible under dk_fd (still a real pick; manual slips only)"`
- app/builder/page.tsx:195 — `title="DK/FD selection basis — the better of DraftKings/FanDuel, the price that picked and sized this ticket"`
- app/settings/page.tsx:117 — `discipline priced at the better de-vigged price between DraftKings and FanDuel (tie goes to DK); no other`
- app/sharp/page.tsx:384 — `{String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}`
- app/sharp/page.tsx:585 — `…${Number(r.prob).toFixed(1)}% true · basis ${String(r.bsOdds)} (${String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}) · +${Number(r.bsEv).toFixed(1)}% EV'`
- src/components/cfb/CfbGameCard.tsx:38 — `fanduel: "FD",`
- src/components/cfb/CfbProps.tsx:111 — `fanduel: "FD",`
- src/components/cfb/CfbSharp.tsx:58 — `{ key: "fd", label: "FanDuel", games: count("fd") },`
- src/components/mlb/ParlaysSection.tsx:231 — `title="No DraftKings or FanDuel quote on every leg — browsable and manual-slip eligible, but the card never selects without a basis price"`
- src/components/props/props-model.ts:69 — `fanduel: "FD",`

##### FanDuel — tests (114 lines)

- tests/cfb-h1.test.ts:63 — `bookmakers: [book(SB, "Settle Book", opts, names), book("fanduel", "FanDuel", { ...opts, homeSpreadPrice: -110 }, names), book("betmgm", "BetMGM", { ...opts, homeSpreadPrice: -11…` [x2]
- tests/cfb-model.test.ts:133 — `if (r.fd) expect(r.fd.book).toBe("fanduel");`
- tests/cfb-model.test.ts:294 — `* CHECK 3 — Alabama moneyline, books = DraftKings + FanDuel h2h ONLY (weights 1 and 1), FPI withheld.`
- tests/cfb-model.test.ts:306 — `const b = build({ oddsEvents: [reduced("Alabama Crimson Tide", ["williamhill_us", "fanduel"], ["h2h"]) /* the swapped capture: the old DK ML sits under williamhill_us */], fpi:…`
- tests/cfb-props.test.ts:270 — `{ key: "fanduel", title: "FanDuel", markets: [{ key: "player_receptions", outcomes: [` [x2]
- tests/defense-imagery.test.tsx:20 — `…time_td',outcomes:[{name:'Yes',description:'Atlanta Falcons D/ST',price:400}]}]},{key:'fanduel',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Atlanta Falcons…`
- tests/defense-imagery.test.tsx:21 — `…er:'Atlanta Falcons D/ST',teamId:'1',teamAbbr:'ATL',pos:'D/ST',headshot:null});expect(rows[0].books).toBe(2);expect(Object.keys(rows[0].quotes!)).toEqual(['draftkings','fanduel']);`
- tests/discovery-release.test.ts:105 — `it("cannot borrow a newer DraftKings timestamp for a stale FanDuel quote",()=>{`
- tests/discovery-release.test.ts:106 — `const row={displayBook:"fanduel",bookQuotes:{o:{draftkings:{at:"2026-09-20T19:09:00Z"},fanduel:{at:"2026-09-20T18:00:00Z"}}}} as unknown as PropBoardRow;` [x2]
- tests/dkfd-basis.test.ts:9 — `gate, weights, Kelly, FUN tiers — computes at the better of DraftKings/FanDuel`
- tests/dkfd-basis.test.ts:82 — `o.bookmakers = (o.bookmakers as AnyObj[]).filter((b) => b.key !== "draftkings" && b.key !== "fanduel");`
- tests/dkfd-basis.test.ts:272 — `{ key: "fanduel", markets: [mk(-105, -115)] },`
- tests/engine2-allstar.test.ts:27 — `key: "fanduel",`
- tests/engine2-allstar.test.ts:28 — `title: "FanDuel",`
- tests/engine2-devig.test.ts:62 — `{ key: "fanduel", a: americanFromProb(0.55), b: americanFromProb(0.45) },`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:365 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:366 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1110 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1111 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1747 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1748 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3018 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3019 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4292 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:4293 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5468 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5469 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6451 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6452 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7315 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7316 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8586 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8587 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9740 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9741 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10555 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10556 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11426 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11427 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12066 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12067 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12129 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12130 — `"title": "FanDuel",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:387 — `"key": "fanduel",`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:388 — `"title": "FanDuel",`
- tests/fixtures/fix39/odds.json:1 — `…"home_team":"Detroit Tigers","away_team":"Philadelphia Phillies","bookmakers":[{"key":"fanduel","title":"FanDuel","last_update":"2026-07-10T05:51:21Z","markets":[{"key":"h2h","last…` [long line; 30 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…home_team":"Washington Nationals","away_team":"New York Yankees","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…11:00Z","home_team":"Cincinnati Reds","away_team":"Chicago Cubs","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…"home_team":"Detroit Tigers","away_team":"Philadelphia Phillies","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…"home_team":"Baltimore Orioles","away_team":"Kansas City Royals","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…Z","home_team":"Miami Marlins","away_team":"Cleveland Guardians","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…"home_team":"Pittsburgh Pirates","away_team":"Milwaukee Brewers","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_update":"2026-07-10T0…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…eam": "Washington Nationals", "away_team": "New York Yankees", "bookmakers": [{"key": "fanduel", "title": "FanDuel", "markets": [{"key": "pitcher_strikeouts", "last_update": "2026-…` [long line; 2 occurrences on this line; first shown]
- tests/fixtures/gen-pool.json:20 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:35 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:1225 — `"uBook": "FanDuel",`
- tests/fixtures/gen-pool.json:1238 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:1240 — `"uBook": "FanDuel",`
- tests/fixtures/gen-pool.json:3184 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:3186 — `"uBook": "FanDuel",`
- tests/fixtures/gen-pool.json:3456 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:3470 — `"oBook": "FanDuel",`
- tests/fixtures/gen-pool.json:3472 — `"uBook": "FanDuel",`
- tests/fixtures/gen-pool.json:4265 — `"oBook": "FanDuel",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:295 — `"key": "fanduel",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:296 — `"title": "FanDuel",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:509 — `"key": "fanduel",`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:510 — `"title": "FanDuel",`
- tests/fixtures/nfl-live-2026-09-20.json:1 — `…ll_us":{"book":"williamhill_us","title":"Caesars","price":146,"line":null,"dec":2.46},"fanduel":{"book":"fanduel","title":"FanDuel","price":185,"line":null,"dec":2.85},"betrivers":…` [long line; 280 occurrences on this line; first shown]
- tests/fixtures/nfl/odds-2026-09-13.json:172 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:173 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:396 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:397 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:620 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:621 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:844 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:845 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1068 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1069 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1292 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1293 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1516 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1517 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1740 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1741 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1964 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:1965 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2188 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2189 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2412 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2413 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2636 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2637 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2860 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-2026-09-13.json:2861 — `"title": "FanDuel",`
- tests/fixtures/nfl/odds-event-props-401872925.json:541 — `"key": "fanduel",`
- tests/fixtures/nfl/odds-event-props-401872925.json:542 — `"title": "FanDuel",`
- tests/football-ladders.test.ts:9 — `const books=['draftkings','williamhill_us','fanduel'];`
- tests/football-ladders.test.ts:49 — `const row=parse(p)[0];expect(row.fair).toBeNull();expect(row.grade).toBeNull();expect(priceFootballProp(row,'fanduel').cz).toBeNull();`
- tests/football-ladders.test.ts:56 — `expect(priceFootballProp(dk,'fanduel').fair).not.toBeNull();`
- tests/mlb-market-phases.test.ts:123 — `const quotes={draftkings:{o:150,u:-170},williamhill_us:{o:180,u:-200},fanduel:{o:120,u:-140}};`
- tests/mlb-postseason.test.ts:37 — `expect(priceMlbMoneylines(data,"fanduel")).toHaveLength(1);`
- tests/parlay-gen-ui.test.ts:168 — `expect(out).not.toMatch(/(Caesars|FanDuel|Book|Sportsbook)-priced legs only/);`
- tests/prop-lean.test.ts:56 — `expect(bookTag("fanduel")).toBe("FD");`
- tests/prop-lean.test.ts:63 — `…ow = (o: number | null, u: number | null, cz: { o: number | null; u: number | null } | null) => ({ cz, o, u, oBook: "fanduel", uBook: "draftkings", settlementBook: "draftkings" });`
- tests/props-model.test.ts:38 — `uBook: "FanDuel",`
- tests/props-model.test.ts:69 — `expect(bookAb(" FanDuel ")).toBe("FD");`
- tests/props-team-filter.test.ts:47 — `uBook: "FanDuel",`
- tests/sportsbook.test.ts:35 — `expect(priceMlbRow(r,'fanduel').czOdds).toBeNull();`
- tests/sportsbook.test.ts:51 — `const data={categories:{ml:[{label:"Team",gkey:"g",lkey:"ml_home",sub:"ML",cz:-150,czOdds:"-150",odds:"+110",book:"FanDuel",bs:105,bsBook:"DK"}]}} as unknown as BoardData;`
- tests/sportsbook.test.ts:57 — `…e",()=>{const row=priceMlbRow({label:"Player",sub:"Over 0.5",prob:50,odds:"+120",book:"FanDuel",bs:-110,bsBook:"DK"} as never,"draftkings");expect(row.czOdds).toBe(-110);expect(row…` [x2]
- tests/sportsbook.test.ts:61 — `const index={'g|p|o':{fanduel:{am:120,line:.5,book:'fanduel'},williamhill_us:{am:-130,line:.5,book:'williamhill_us'}}};` [x2]
- tests/sportsbook.test.ts:62 — `expect(priceMlbRow(row,'fanduel',index).czKellyF).toBe(.02);`
- tests/supplemental.test.ts:278 — `{ key: "fanduel", markets: [mk(-110, -110)] },`

##### FanDuel — docs (9 lines)

- ENGINE2.md:311 — `**The idea:** shop at DraftKings/FanDuel, settle at Caesars NV. The basis price per`
- docs/multibook-memo.md:83 — `{DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,`
- docs/progress.md:90 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/progress.md:96 — `…es the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that refreshed sn…`
- docs/session-handoff.md:450 — `…old as well as quote-age reuse. Three-book quotes (DraftKings, Caesars/williamhill_us, FanDuel) remain fetched together and repriced locally per selection. API coverage still limit…`
- docs/session-handoff.md:478 — `…+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.`
- docs/session-handoff.md:484 — `…es the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that refreshed sn…`
- docs/session-handoff.md:860 — `…; hide the non-Caesars lines from ALL 2. If i go to another state like Arizona & I'm using Draft Kings or FanDuel then I will let you know and we will switch it while I'm there")**`
- docs/session-handoff.md:861 — `… ('williamhill_us') on both desks until Josh says he is in another state on DraftKings or FanDuel, and the switch is made only for that trip. Pinned in 'tests/board-scope.test.ts'.`

#### SETTLE_BOOK / settleBook / settlementBook

117 matching lines in 42 files (151 occurrences).

##### SETTLE_BOOK / settleBook / settlementBook — fetch code (2 lines)

- app/api/scheduler/route.ts:1 — `import {SETTLE_BOOK} from "@/lib/sportsbook/books";`
- app/api/scheduler/route.ts:248 — `const eng = createEngine({ settlementBook: SETTLE_BOOK,` [x2]

##### SETTLE_BOOK / settleBook / settlementBook — config (13 lines)

- src/lib/cfb/rules.ts:33 — `* settleBook — Caesars (The Odds API key 'williamhill_us'): the price every ticket`
- src/lib/cfb/rules.ts:77 — `settleBook: "draftkings",`
- src/lib/cfb/rules.ts:372 — `so a slate is capped at 'maxEvents' priced events; 'settleBook' is DraftKings, as everywhere (INSTRUCTION 67, 2026-09-17; was Caesars).`
- src/lib/cfb/rules.ts:476 — `settleBook: "draftkings",`
- src/lib/football/league.ts:71 — `settleBook: string;`
- src/lib/football/league.ts:89 — `settleBook: string;`
- src/lib/mlb/live-props-rules.ts:150 — `settleBook: "draftkings",`
- src/lib/nfl/rules.ts:20 — `* blend / spreadBlend / pinnacleWeight / minBooks / settleBook — as the CFB desk: the home win`
- src/lib/nfl/rules.ts:68 — `settleBook: "draftkings",`
- src/lib/nfl/rules.ts:197 — `settleBook: "draftkings",`
- src/lib/sportsbook/books.ts:12 — `export const SETTLE_BOOK: BookKey = 'draftkings';`
- src/lib/sportsbook/books.ts:13 — `export const SETTLE_BOOK_SHORT = 'DK';`
- src/lib/sportsbook/books.ts:14 — `export const DEFAULT_BOOK: BookKey = SETTLE_BOOK;`

##### SETTLE_BOOK / settleBook / settlementBook — calculations (59 lines)

- app/api/discovery/route.ts:16 — `data.mlb=b?{date:b.date,at:b.at,data:{settlementBook:b.data.settlementBook,gameInfo:b.data.gameInfo,propBoard:b.data.propBoard,categories:{ml:b.data.categories?.ml??[],rl:b.data.c…` [x2]
- app/api/generate/route.ts:3 — `import {SETTLE_BOOK} from "@/lib/sportsbook/books";`
- app/api/generate/route.ts:392 — `const eng = createEngine({ settlementBook: SETTLE_BOOK,` [x2]
- app/api/generate/route.ts:446 — `const data = attachBookQuotes(eng.analyze(slate) as BoardData, bookCapture.events.values(), SETTLE_BOOK);`
- src/lib/cfb/model.ts:395 — `function collect(quotes: CfbQuote[], settleBook: string): SideQuotes {`
- src/lib/cfb/model.ts:397 — `return { all: quotes, cz: find(settleBook), dk: find("draftkings"), fd: find("fanduel"), pin: find("pinnacle") };`
- src/lib/cfb/model.ts:508 — `const sq = collect(quotes, M.settleBook);`
- src/lib/cfb/props.ts:56 — `* Football and NFL desks. 'parseEventProps' reads its knobs ('minBooks', 'settleBook', the Kelly`
- src/lib/cfb/props.ts:95 — `/** the league's props knobs ('minBooks', 'settleBook'); CFB_PROPS when omitted */`
- src/lib/cfb/props.ts:301 — `const cz = find(P.settleBook);`
- src/lib/engine-client.ts:2 — `import {SETTLE_BOOK} from "@/lib/sportsbook/books";`
- src/lib/engine-client.ts:111 — `engine = createEngine({ settlementBook: SETTLE_BOOK, fetchJson: async (url) => {const r=await browserFetchJson(browseOddsUrl(url));if(r.ok)bookCapture.capture(r.body);return r;…` [x2]
- src/lib/engine-client.ts:397 — `const data = attachBookQuotes(eng.analyze(slate), bookCapture.events.values(), SETTLE_BOOK);`
- src/lib/mlb/market-board.ts:3 — `import {SETTLE_BOOK,bookName} from "@/lib/sportsbook/books";`
- src/lib/mlb/market-board.ts:39 — `const settle=row.bookQuotes?.o?.[SETTLE_BOOK]?.at ?? row.bookQuotes?.u?.[SETTLE_BOOK]?.at;` [x2]
- src/lib/mlb/market-board.ts:88 — `o:q.czAm,u:q.oppAm,settlementBook:SETTLE_BOOK,oBook:row.displayBook??bookName(SETTLE_BOOK),uBook:row.displayBook??bookName(SETTLE_BOOK),` [x4]
- src/lib/mlb/market-board.ts:93 — `fO:q.pLive==null?null:q.pLive*100,books:q.books}, row.displayBook ?? SETTLE_BOOK));`
- src/lib/parlay-gen.ts:45 — `import { SETTLE_BOOK_SHORT } from "@/lib/sportsbook/books";`
- src/lib/parlay-gen.ts:538 — `if (spec.czOnly && l.book !== (spec.pricingBook ?? SETTLE_BOOK_SHORT)) return false;`
- src/lib/prop-lean.ts:62 — `export function mlbPropLean(r: Pick<PropBoardRow, "cz" | "o" | "u" | "oBook" | "uBook" | "settlementBook" | "displayBook">): PropLean | null {`
- src/lib/prop-lean.ts:63 — `const cz = r.cz && r.cz.o != null && r.cz.u != null ? leanFromPair(r.cz.o, r.cz.u, bookTag(r.displayBook ?? r.settlementBook ?? "DK")) : null;`
- src/lib/server/clv-core.ts:43 — `/** the settlement book of every leg locked BEFORE INSTRUCTION 67 (2026-09-17); later legs carry 'settlementBook' */`
- src/lib/server/clv-core.ts:46 — `export type PendingLeg = { lid: string; lkey: string; prop: string; gkey: string; start: number; settlementBook?: string };`
- src/lib/server/clv-core.ts:58 — `type LedgerLeg = { label?: string; prop?: string; gkey?: string | null; lkey?: string | null; settlementBook?: string };`
- src/lib/server/clv-core.ts:59 — `type LedgerTicket = { legs?: LedgerLeg[]; settlementBook?: string };`
- src/lib/server/clv-core.ts:72 — `/* INSTRUCTION 67: a ticket locked since 2026-09-17 carries 'settlementBook: "draftkings"'; older`
- src/lib/server/clv-core.ts:74 — `const entryBook = typeof entry.settlementBook === "string" ? entry.settlementBook : undefined;` [x2]
- src/lib/server/clv-core.ts:86 — `g.legs.push({ lid, lkey: l.lkey, prop: l.prop, gkey: l.gkey, start, settlementBook: l.settlementBook ?? t.settlementBook ?? entryBook });` [x3]
- src/lib/server/clv-core.ts:156 — `if (alt && bk.key !== (leg.settlementBook ?? CAESARS_KEY) && bk.key !== DK && bk.key !== FD) continue;`
- src/lib/server/clv-core.ts:169 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) {`
- src/lib/server/clv-core.ts:183 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) {`
- src/lib/server/clv-core.ts:236 — `if (bk.key === (leg.settlementBook ?? CAESARS_KEY)) cz = mine.price;`
- src/lib/server/lock-card.ts:709 — `const settlementBook = String(eng.get<string>("CAESARS_KEY"));`
- src/lib/server/lock-card.ts:731 — `settlementBook,`
- src/lib/server/lock-card.ts:835 — `settlementBook,`
- src/lib/server/lock-card.ts:1022 — `settlementBook: string,`
- src/lib/server/lock-card.ts:1052 — `settlementBook,`
- src/lib/server/lock-card.ts:1096 — `const settlementBook = String(eng.get<string>("CAESARS_KEY"));`
- src/lib/server/lock-card.ts:1223 — `settlementBook,`
- src/lib/server/lock-card.ts:1239 — `const f = buildFoundFun(data, usedLegs, startedGkey, tid, settlementBook);`
- src/lib/server/mlb-live-quote.ts:188 — `export type LiveSightCfg = { minBooks: number; settleBook: string };`
- src/lib/server/mlb-live-quote.ts:203 — `* books — Caesars is the settle book ('src/lib/cfb/props.ts' uses the same 'settleBook' rule), so`
- src/lib/server/mlb-live-quote.ts:227 — `if (isAlt && bk.key !== cfg.settleBook && bk.key !== DK && bk.key !== FD) continue;`
- src/lib/server/mlb-live-quote.ts:253 — `const czPoints = new Set(core.filter((c) => c.book === cfg.settleBook).map((c) => c.point));`
- src/lib/server/mlb-live-quote.ts:264 — `const cz = atLn.find((c) => c.book === cfg.settleBook) ?? null;`
- src/lib/server/mlb-live-quote.ts:266 — `const czAlt = altAt(cfg.settleBook);`
- src/lib/server/mlb-live-quote.ts:414 — `settleBook: MLB_LIVE_PROPS.settleBook,` [x2]
- src/lib/server/mlb-live-quote.ts:789 — `settleBook: MLB_LIVE_PROPS.settleBook,` [x2]
- src/lib/sportsbook/mlb.ts:3 — `import {american,DEFAULT_BOOK,SETTLE_BOOK,bookKey,bookName,decimal,validAm,valueAt} from './books';`
- src/lib/sportsbook/mlb.ts:16 — `export function attachBookQuotes(data:BoardData,events:Iterable<EventOdds>,settlementBook:string=SETTLE_BOOK):BoardData {` [x2]
- src/lib/sportsbook/mlb.ts:54 — `…?.am??null,oBook:bo?bookName(bo.book):null,uBook:bu?bookName(bu.book):null,cz:{o:o[settlementBook]?.am??null,u:u[settlementBook]?.am??null},pO:null,fO:fair.length?(fair[Math.floor(…` [x2]
- src/lib/sportsbook/mlb.ts:62 — `rs.map(r=>({...r,settlementBook,bookQuotes:{o:index['${g.gkey}|${r.lkey}|o']??{},u:index['${g.gkey}|${r.lkey}|u']??{}}}))`
- src/lib/sportsbook/mlb.ts:71 — `const stamp=(cs:Record<string,PickRow[]>|undefined)=>Object.fromEntries(Object.entries(cs??{}).map(([k,rs])=>[k,rs.map(r=>({...r,settlementBook}))]));`
- src/lib/sportsbook/mlb.ts:72 — `return {...data,settlementBook,categories:stamp(data.categories),...(data.categoriesLive?{categoriesLive:stamp(data.categoriesLive)}:{}),bookQuotes:index,propBoard,...(simMarkets?…`
- src/lib/sportsbook/mlb.ts:77 — `if(book===(r.settlementBook??'williamhill_us'))return american(r.czOdds)??american(r.cz);`
- src/lib/sportsbook/mlb.ts:83 — `if(book===(r.settlementBook??'williamhill_us'))return r;const am=knownPrice(r,book,index);const p=r.prob==null?null:r.prob/100;const v=valueAt(p,am);`
- src/lib/sportsbook/mlb.ts:92 — `if(book===(r.settlementBook??'williamhill_us'))return {...r,displayBook:book,o:r.cz?.o??null,u:r.cz?.u??null,oBook:r.cz?.o!=null?bookName(book):null,uBook:r.cz?.u!=null?bookName(b…`
- src/lib/sportsbook/mlb.ts:102 — `if(book===(data.settlementBook??'williamhill_us'))return {...data,propBoard:data.propBoard?.map(g=>({...g,markets:Object.fromEntries(Object.entries(g.markets).map(([k,rs])=>[k,rs.…`
- src/lib/sportsbook/useLivePrices.ts:7 — `if(!data||book===(data.settleBook??'williamhill_us'))return data; // overlays from before 2026-09-17 (INSTRUCTION 67) carry no stamp and are Caesars-priced`

##### SETTLE_BOOK / settleBook / settlementBook — stored-data fields (8 lines)

- src/engine/index.ts:24 — `settlementBook?: string;`
- src/engine/index.ts:36 — `settlementBook?: string;`
- src/engine/index.ts:77 — `settlementBook?: string;`
- src/engine/index.ts:122 — `settlementBook?: string;`
- src/engine/index.ts:154 — `settlementBook?: string;`
- src/engine/index.ts:299 — `quote. Callers that omit 'settlementBook' keep the legacy Caesars behaviour (parity tests). */`
- src/engine/index.ts:300 — `if (deps.settlementBook) scope.set("CAESARS_KEY", deps.settlementBook);` [x2]
- src/lib/mlb/live-quote-types.ts:80 — `settleBook?: string;`

##### SETTLE_BOOK / settleBook / settlementBook — UI (5 lines)

- app/board/page.tsx:26 — `import {bookName,DEFAULT_BOOK,SETTLE_BOOK,valueAt,decimal} from "@/lib/sportsbook/books";`
- app/board/page.tsx:410 — `cz: r.cz?.o ?? null, odds, book: r.o != null ? r.oBook : odds != null ? bookName(SETTLE_BOOK) : null,`
- src/components/props/props-model.ts:280 — `if (cz != null) return { am: cz, book: r.displayBook ? bookAb(bookName(r.displayBook)) : r.settlementBook ? bookAb(bookName(String(r.settlementBook))) : "CZ" };` [x2]
- src/components/props/useParlayGen.ts:23 — `import { BOOKS, SETTLE_BOOK_SHORT } from "@/lib/sportsbook/books";`
- src/components/props/useParlayGen.ts:180 — `const pricingBook = BOOKS.find((b) => b.key === selectedBook)?.short ?? SETTLE_BOOK_SHORT;`

##### SETTLE_BOOK / settleBook / settlementBook — tests (18 lines)

- tests/board-live-anchor.test.ts:142 — `settleBook: "draftkings", // the route stamps its settle book (INSTRUCTION 67); an unstamped overlay would be repriced as a Caesars one`
- tests/cfb-h1.test.ts:38 — `const SB = CFB_LEAGUE.model.settleBook;`
- tests/cfb-props.test.ts:70 — `settleBook: "draftkings",`
- tests/cfb-separation.test.ts:39 — `expect(rules).toMatch(/settleBook:\s*"draftkings"/);`
- tests/hr-line-rule.test.ts:7 — `import { SETTLE_BOOK } from "@/lib/sportsbook/books";`
- tests/hr-line-rule.test.ts:25 — `bookQuotes: { o: { [SETTLE_BOOK]: { am: ln > 0.5 ? 6000 : 320, line: ln, book: SETTLE_BOOK, at } }, u: {} },` [x2]
- tests/mlb-live-props-route.test.ts:732 — `const cfg = { minBooks: MLB_LIVE_PROPS.minBooks, settleBook: MLB_LIVE_PROPS.settleBook };` [x2]
- tests/mlb-live-props-route.test.ts:752 — `expect(MLB_LIVE_PROPS.settleBook).toBe("draftkings");`
- tests/mlb-live-props-route.test.ts:758 — `const dkSettles = sightLiveQuote(ev(), "juansoto", "batter_hits_runs_rbis", { ...cfg, settleBook: "williamhill_us" });`
- tests/mlb-live-rules.test.ts:96 — `settleBook: "draftkings",`
- tests/mlb-market-phases.test.ts:10 — `import {SETTLE_BOOK} from "@/lib/sportsbook/books";`
- tests/mlb-market-phases.test.ts:78 — `const stored=(over:Partial<PropBoardRow>={}):PropBoardRow=>({...row,bookQuotes:{o:{[SETTLE_BOOK]:{am:-120,line:.5,book:SETTLE_BOOK,at}},u:{[SETTLE_BOOK]:{am:100,line:.5,book:SETTL…` [x4]
- tests/mlb-market-phases.test.ts:94 — `const r=stored({bookQuotes:{o:{[SETTLE_BOOK]:{am:-120,line:.5,book:SETTLE_BOOK,at:t}},u:{}}});` [x2]
- tests/nfl-engine.test.ts:106 — `expect(r.cz!.book).toBe(NFL_MODEL.settleBook);`
- tests/nfl-engine.test.ts:133 — `if (bk.key !== NFL_MODEL.settleBook) continue;`
- tests/nfl-props-route.test.ts:168 — `expect(NFL_PROPS.settleBook).toBe("draftkings");`
- tests/prop-lean.test.ts:63 — `…ow = (o: number | null, u: number | null, cz: { o: number | null; u: number | null } | null) => ({ cz, o, u, oBook: "fanduel", uBook: "draftkings", settlementBook: "draftkings" });`
- tests/sportsbook.test.ts:60 — `const row={prob:50,settlementBook:'draftkings',gkey:'g',lkey:'p',sub:'Over 0.5'};`

##### SETTLE_BOOK / settleBook / settlementBook — docs (12 lines)

- CLAUDE.md:110 — `… or "Your mix", and NO sportsbook toggle — DraftKings prices and grades everything ('SETTLE_BOOK'); do not bring a "Safer/Balanced" or "Favorites/Longshots" control back (Josh: tho…`
- CLAUDE.md:158 — `- **Settlement book = DraftKings (INSTRUCTION 67, 2026-09-17).** 'SETTLE_BOOK' in 'src/lib/sportsbook/books.ts' is the book every grade, edge %, EV and Kelly stake is computed at, …` [x5]
- docs/cfb-desk.md:32 — `| 'settleBook' | 'williamhill_us' | Caesars — the only book tickets are written at |`
- docs/cfb-desk.md:94 — `…iced against a 1.08 overround; every book is quoted at its own line with EV re-evaluated there; Caesars ('settleBook') is the settle book and the grade / Kelly source, as on sides.`
- docs/harness-substitutions.md:255 — `| 'CAESARS_KEY' → 'deps.settlementBook' | whenever the caller passes 'settlementBook' — production always passes 'SETTLE_BOOK' ('draftkings', INSTRUCTION 67, 2026-09-17); a test th…` [x4]
- docs/nfl-desk.md:37 — `…d .25, fpi .15 }', spreadBlend '{ mkt .75, fpi .25 }', pinnacleWeight 2, minBooks 2, settleBook 'williamhill_us' (Caesars), matchWindowMs 3 h. The pipeline ('buildCfbBoard', 'price…`
- docs/nfl-desk.md:82 — `…36 h, czMissingRevalidateSec 1800, czMissingWindowSec 4 h, regions 'us', minBooks 2, settleBook 'williamhill_us', dailyBudget **1000**, measuredCreditsPerEvent **31**. Props rows' …`
- docs/progress.md:268 — `- 'SETTLE_BOOK = "draftkings"' ('src/lib/sportsbook/books.ts') is now the one settlement constant. The legacy MLB engine's 'CAESARS_KEY' variable is rebound to it by the facade on …`
- docs/progress.md:269 — `- Boards, rows, lock-card tickets and CLV pending legs carry a 'settlementBook' stamp; anything without the stamp (pre-2026-09-17 caches and ledger entries) is treated as Caesars-p…`
- docs/progress.md:270 — `- CFB and NFL 'settleBook' constants (model, props, live props), MLB live props, the sharp board, the UFC helper, the season lab default book and the offered-book scoping all flipp…`
- docs/session-handoff.md:1694 — `…Kings. That includes Builder, Board, Parlay Generator, etc". Shipped: one constant, 'SETTLE_BOOK = "draftkings"' in 'src/lib/sportsbook/books.ts', is the book every grade, edge %, …` [long line; 5 occurrences on this line; first shown]
- docs/session-handoff.md:1712 — `…" and the DraftKings-only toggle are gone (DK is the settlement book everywhere via 'SETTLE_BOOK'; 'czOnly' stays in the spec type, default false, no UI); the sheet is chip rows: L…` [long line; 1 occurrences on this line; first shown]

#### bookmakers

133 matching lines in 48 files (157 occurrences).

##### bookmakers — fetch code (23 lines)

- app/api/propsnap/route.ts:97 — `const raw = await oddsFetch<{ bookmakers?: unknown[] }>(`
- app/api/propsnap/route.ts:100 — `if (!raw?.bookmakers?.length) continue;`
- legacy/index.html:946 — `var bks=(res.body&&res.body.bookmakers)||[];`
- legacy/index.html:1003 — `arr.forEach(function(g){var books=g.bookmakers||[];var bk=books.filter(function(b){return b.key===CAESARS_KEY;})[0]||books[0];var hp=null,ap=null,hpt=null,apt=null,bn="";`
- legacy/index.html:1277 — `(g.bookmakers||[]).forEach(function(bk){var bn=bk.title||bk.key,cz=bk.key===CAESARS_KEY;`
- legacy/index.html:1367 — `var bks=(pr.body&&pr.body.bookmakers)||[];if(!bks.length)return;`
- src/engine2/allstar.ts:78 — `for (const bk of json.bookmakers ?? []) {`
- src/engine2/sharpBoard.ts:80 — `for (const bk of ev_.bookmakers) {`
- src/engine2/sharpBoard.ts:106 — `for (const bk of ev_.bookmakers) {`
- src/engine2/sharpBoard.ts:189 — `hasSharp: e.bookmakers.some((b) => SHARPS.has(b.key)),`
- src/lib/cfb/model.ts:345 — `for (const b of ev.bookmakers) {`
- src/lib/cfb/names.ts:40 — `for (const b of Array.isArray(e.bookmakers) ? e.bookmakers : []) {` [x2]
- src/lib/cfb/props.ts:136 — `for (const b of arr(ev.bookmakers)) {`
- src/lib/server/clv-core.ts:150 — `for (const bk of ev.bookmakers ?? []) {`
- src/lib/server/clv-core.ts:222 — `for (const bk of ev.bookmakers ?? []) {`
- src/lib/server/mlb-live-quote.ts:222 — `for (const bk of (ev.bookmakers ?? []) as Bookmaker[]) {`
- src/lib/sportsbook/mlb.ts:13 — `…t e of Array.isArray(body)?body:[body]){if(!e||typeof e!=='object'||!Array.isArray(e.bookmakers)||!e.id)continue;const prior=events.get(e.id);events.set(e.id,prior?{...e,bookmakers…` [x4]
- src/lib/sportsbook/mlb.ts:25 — `for(const b of e.bookmakers)for(const m of b.markets)for(const o of m.outcomes){`
- src/lib/sportsbook/mlb.ts:46 — `for(const b of e.bookmakers) for(const m of b.markets) if(m.key===market) for(const o of m.outcomes)`
- src/lib/sportsbook/mlb.ts:68 — `for(const b of e?.bookmakers??[])for(const m of b.markets){if(m.key!=='totals')continue;const o=m.outcomes.find(o=>o.name==='Over'),u=m.outcomes.find(o=>o.name==='Under');if(o&&u…`
- src/lib/ufc.ts:134 — `for (const bk of ev.bookmakers) {`
- src/lib/ufc.ts:154 — `for (const bk of ev.bookmakers) {`
- src/lib/ufc.ts:248 — `.filter((e) => e.bookmakers.length > 0 && new Date(e.commence_time).getTime() > Date.now())`

##### bookmakers — calculations (11 lines)

- src/engine/legacy-src.gen.ts:5 — `…ick another game.\";OB.err=m;obSetStatus();return;}\n var bks=(res.body&&res.body.bookmakers)||[];\n /* prefer Caesars, else fall back to any US book carrying the market */\n…` [long line; 4 occurrences on this line; first shown]
- src/engine2/allstar.ts:66 — `bookmakers?: OddsBookmaker[];`
- src/engine2/sharpBoard.ts:18 — `bookmakers: { key: string; markets: { key: string; outcomes: Outcome[] }[] }[];`
- src/lib/cfb/names.ts:29 — `bookmakers: OddsBookmaker[];`
- src/lib/cfb/names.ts:39 — `const bookmakers: OddsBookmaker[] = [];`
- src/lib/cfb/names.ts:59 — `bookmakers.push({`
- src/lib/cfb/names.ts:72 — `bookmakers,`
- src/lib/server/clv-core.ts:40 — `bookmakers?: Bookmaker[];`
- src/lib/server/mlb-live-quote.ts:194 — `* STAMPED at, so it walks the same 'bookmakers[].markets[].outcomes[]' tree, normalises names with`
- src/lib/sportsbook/mlb.ts:8 — `type EventOdds={id:string;home_team:string;away_team:string;commence_time:string;bookmakers:{key:string;title:string;last_update?:string;markets:{key:string;last_update?:string;out…`
- src/lib/ufc.ts:75 — `bookmakers: {`

##### bookmakers — tests (89 lines)

- tests/basis-surfaces.test.ts:132 — `bookmakers?: { key: string; markets: { key: string; outcomes: { name: string; description?: string; point?: number; price: number }[] }[] }[];`
- tests/basis-surfaces.test.ts:134 — `const wh = body.bookmakers?.find((b) => b.key === "williamhill_us");`
- tests/basis-surfaces.test.ts:137 — `body.bookmakers!.push({`
- tests/cfb-card.test.ts:67 — `bookmakers: books.map((b) => ({`
- tests/cfb-h1.test.ts:63 — `bookmakers: [book(SB, "Settle Book", opts, names), book("fanduel", "FanDuel", { ...opts, homeSpreadPrice: -110 }, names), book("betmgm", "BetMGM", { ...opts, homeSpreadPrice: -11…`
- tests/cfb-model.test.ts:46 — `const bks = (ev.bookmakers as Array<{ key: string; markets: Array<{ key: string }> }>)`
- tests/cfb-model.test.ts:49 — `return { ...ev, bookmakers: bks };`
- tests/cfb-names.test.ts:58 — `bookmakers: [],`
- tests/cfb-names.test.ts:174 — `bookmakers: [{ key: "b", title: "B", markets: [{ key: "h2h", outcomes: [{ name: "H", price: -110 }, { name: "A", price: "bad" }] }] }],`
- tests/cfb-names.test.ts:176 — `expect(e?.bookmakers[0].markets[0].outcomes).toEqual([{ name: "H", price: -110 }]);`
- tests/cfb-picks.test.ts:146 — `bookmakers: books.map((b) => ({`
- tests/cfb-props.test.ts:132 — `expect(parseEventProps({ bookmakers: [{ key: "x", markets: [{ key: "player_pass_yds", outcomes: [{ name: "Over", price: -110 }] }] }] }, ala, { now: NOW, bankroll: 2500 })).toE…`
- tests/cfb-props.test.ts:226 — `const payload = { id: "x", bookmakers: [ou("draftkings", "DraftKings", -130, 100), ou("williamhill_us", "Caesars", -105, -115)] };`
- tests/cfb-props.test.ts:237 — `const mirrored = { id: "x", bookmakers: [ou("draftkings", "DraftKings", 100, -130), ou("williamhill_us", "Caesars", -115, -105)] };`
- tests/cfb-props.test.ts:250 — `bookmakers: [`
- tests/cfb-props.test.ts:265 — `bookmakers: [`
- tests/clv-core.test.ts:86 — `bookmakers: [`
- tests/clv-core.test.ts:125 — `bookmakers: [`
- tests/clv-core.test.ts:126 — `ev.bookmakers![0],`
- tests/clv-core.test.ts:144 — `bookmakers: [`
- tests/defense-imagery.test.tsx:20 — `const rows=parseEventProps({id:'e',bookmakers:[{key:'draftkings',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Atlanta Falcons D/ST',price:400}]}]},{key:'f…`
- tests/dkfd-basis.test.ts:44 — `function perturbBookmakers(body: unknown): unknown {`
- tests/dkfd-basis.test.ts:49 — `if (Array.isArray(o.bookmakers)) {`
- tests/dkfd-basis.test.ts:50 — `for (const bk of o.bookmakers as AnyObj[]) {`
- tests/dkfd-basis.test.ts:68 — `url.includes("the-odds-api") ? { ok: r.ok, body: perturbBookmakers(r.body) } : r,`
- tests/dkfd-basis.test.ts:81 — `if (Array.isArray(o.bookmakers)) {`
- tests/dkfd-basis.test.ts:82 — `o.bookmakers = (o.bookmakers as AnyObj[]).filter((b) => b.key !== "draftkings" && b.key !== "fanduel");` [x2]
- tests/dkfd-basis.test.ts:269 — `bookmakers: [`
- tests/doubleheader.test.ts:74 — `shiftPrices(e1.bookmakers);`
- tests/engine2-allstar.test.ts:25 — `bookmakers: [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1108 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1745 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:2606 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3880 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5154 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6078 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7313 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:8174 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9395 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10553 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11112 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12064 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:12127 — `"bookmakers": [`
- tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json:9 — `"bookmakers": [`
- tests/fixtures/fix39/odds.json:1 — `…6-07-10T22:41:00Z","home_team":"Detroit Tigers","away_team":"Philadelphia Phillies","bookmakers":[{"key":"fanduel","title":"FanDuel","last_update":"2026-07-10T05:51:21Z","markets":…` [long line; 15 occurrences on this line; first shown]
- tests/fixtures/fix39/props_250b0373676b10f51ed1c59c93714245.json:1 — `…-07-10T22:46:00Z","home_team":"Washington Nationals","away_team":"New York Yankees","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_55c7996867831d050e3a904c541089d8.json:1 — `…me":"2026-07-10T23:11:00Z","home_team":"Cincinnati Reds","away_team":"Chicago Cubs","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_895dfbfbbb57ff9ecc3cb430a9c69076.json:1 — `…6-07-10T22:41:00Z","home_team":"Detroit Tigers","away_team":"Philadelphia Phillies","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_b11bed54d0340b0a1865d2f8d41bb050.json:1 — `…6-07-10T23:06:00Z","home_team":"Baltimore Orioles","away_team":"Kansas City Royals","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_e1b31472ec00cc3475d077ee22298ef8.json:1 — `…2026-07-10T23:11:00Z","home_team":"Miami Marlins","away_team":"Cleveland Guardians","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix39/props_f308816130f3007f771929f15d62862c.json:1 — `…6-07-10T22:41:00Z","home_team":"Pittsburgh Pirates","away_team":"Milwaukee Brewers","bookmakers":[{"key":"fanduel","title":"FanDuel","markets":[{"key":"pitcher_strikeouts","last_up…` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/fix40/props_alt_250b0373676b10f51ed1c59c93714245.json:1 — `…0T22:46:00Z", "home_team": "Washington Nationals", "away_team": "New York Yankees", "bookmakers": [{"key": "fanduel", "title": "FanDuel", "markets": [{"key": "pitcher_strikeouts", …` [long line; 1 occurrences on this line; first shown]
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:53 — `"bookmakers": [`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:465 — `"bookmakers": [`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:559 — `"bookmakers": []`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:568 — `"bookmakers": [`
- tests/fixtures/mlb/odds-event-live-props.synthetic.json:626 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:11 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:235 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:459 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:683 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:907 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:1131 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:1355 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:1579 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:1803 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:2027 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:2251 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:2475 — `"bookmakers": [`
- tests/fixtures/nfl/odds-2026-09-13.json:2699 — `"bookmakers": [`
- tests/fixtures/nfl/odds-event-props-401872925.json:9 — `"bookmakers": [`
- tests/football-ladders.test.ts:10 — `…t payload=(market:string,points:number[],prices=[120,150,180],under=false)=>({id:'e',bookmakers:books.map((book,i)=>({key:book,title:book,markets:[{key:market,outcomes:points.flatM…`
- tests/football-ladders.test.ts:27 — `const p=payload('player_receptions_alternate',[6]);p.bookmakers.forEach(b=>{b.markets[0].outcomes[0].name='6+';});`
- tests/football-ladders.test.ts:31 — `const p=payload('player_1st_td',[0]);p.bookmakers.forEach(b=>{b.markets[0].outcomes[0].name='Yes';});`
- tests/football-ladders.test.ts:48 — `const p=payload('player_receptions_alternate',[5.5]);p.bookmakers=p.bookmakers.slice(0,1);` [x2]
- tests/football-ladders.test.ts:53 — `p.bookmakers[0].markets[0].outcomes.forEach(o=>o.point=6.5);`
- tests/football-ladders.test.ts:72 — `const p=payload('player_1st_td',[0]);p.bookmakers.forEach(b=>{b.markets[0].outcomes[0].name='Yes';});`
- tests/mlb-live-props-route.test.ts:55 — `byEvent: Record<string, { id: string; away_team: string; home_team: string; commence_time: string; bookmakers: unknown[] }>;`
- tests/mlb-live-props-route.test.ts:70 — `const E3 = "6f2c4b9ad1e34a7c8b5d0e91f7a23c45"; // MIA @ ATL — bookmakers: [] (the EMPTY-EVENT RULE)`
- tests/mlb-market-phases.test.ts:57 — `…e",home_team:"Boston Red Sox",away_team:"New York Yankees",commence_time:game.start!,bookmakers:books.map(b=>({...b,markets:["batter_rbis","batter_runs_scored"].map(key=>({key,outc…`
- tests/nfl-engine.test.ts:132 — `for (const bk of ev.bookmakers as Rec[]) {`
- tests/nfl-engine.test.ts:315 — `for (const bk of src.bookmakers as Rec[]) {`
- tests/prop-board.test.ts:159 — `bookmakers: { key: string; markets: { key: string; outcomes: Record<string, unknown>[] }[] }[];`
- tests/prop-board.test.ts:162 — `const cz = body.bookmakers.find((b) => b.key === "williamhill_us" && b.markets.some((m) => m.key === "batter_hits_alternate"))!;`
- tests/sportsbook.test.ts:22 — `const event={id:'one',home_team:'Home',away_team:'Away',commence_time:'2099-01-01',bookmakers:[{key:'draftkings',title:'DraftKings',last_update:'2098-12-31',markets:[{key:'h2h',out…`
- tests/sportsbook.test.ts:24 — `…quoteCapture();capture.capture(event);expect(capture.events.size).toBe(1);expect(event.bookmakers[0].key).toBe('draftkings');capture.clear();expect(capture.events.size).toBe(0);});`
- tests/sportsbook.test.ts:42 — `const e={...event,bookmakers:[{...event.bookmakers[0],markets:[{key:'batter_hits_alternate',outcomes:[{name:'Over',description:'Player',point:1,price:120}]}]}]};` [x2]
- tests/supplemental.test.ts:276 — `bookmakers: [`

##### bookmakers — docs (6 lines)

- docs/multibook-memo.md:71 — `39 bookmakers in the game census, 15 in the props census; the full lists are reproducible`
- docs/session-handoff.md:3609 — `if not od or not od.get("bookmakers"):`
- docs/session-handoff.md:3613 — `**An event with no bookmakers is PAID FOR AND DROPPED.** So 'archived ≤ fetched', always, and`
- docs/session-handoff.md:5144 — `…i** | **print the FETCH count in 'snapshot_props.py'** — one 'print()' beside the no-bookmakers drop, so 'spent ÷ fetched' becomes measurable instead of estimated from survivors (§…`
- docs/session-handoff.md:6261 — `whose response carried bookmakers (L325–326 'continue'); every dropped event was **billed and never`
- docs/session-handoff.md:7536 — `L325–326 drops any event whose response carried no bookmakers **after billing it**. The series it`

##### bookmakers — tools (4 lines)

- tools/snapshot_odds.py:47 — `for b in e.get("bookmakers", []):`
- tools/snapshot_props.py:67 — `for bk in eventodds.get("bookmakers", []):`
- tools/snapshot_props.py:261 — `if not raw or not raw.get("bookmakers"):`
- tools/snapshot_props.py:324 — `if not od or not od.get("bookmakers"):`

#### regions= / regions: / regions

129 matching lines in 42 files (150 occurrences).

Note: Matches the word regions anywhere (URL parameter, config key, prose).

##### regions= / regions: / regions — fetch code (13 lines)

- app/api/clv/route.ts:90 — `? await viaProxy<OddsEvent[]>('${V4}/odds?regions=us,eu&markets=h2h,spreads&oddsFormat=american')`
- app/api/clv/route.ts:108 — `const full = await viaProxy<OddsEvent>('${V4}/events/${ev.id}/odds?regions=us&markets=${mkts.join(",")}&oddsFormat=american');`
- app/api/odds/route.ts:13 — `* B — the 'markets × regions' product must match one of the two shapes this product uses;`
- app/api/propsnap/route.ts:98 — `'/events/${e.id}/odds?regions=us&oddsFormat=american&markets=${MARKETS}',`
- legacy/index.html:941 — `…="https://api.the-odds-api.com/v4/sports/"+SPORTS[SPORT].oddsKey+"/events/"+OB.game+"/odds?regions=us&oddsFormat=american&markets="+OB.market+"&apiKey="+encodeURIComponent(OB.key);`
- legacy/index.html:997 — `var url="https://api.the-odds-api.com/v4/sports/"+cfg.oddsKey+"/odds?regions=us&markets="+mkt+"&oddsFormat=american&apiKey="+encodeURIComponent(OB.key);`
- legacy/index.html:1257 — `return obFetchJson("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions="+((SH_V2&&SH_V2.regions)||"us")+"&markets=h2h,spreads,totals&oddsFormat=american&apiKey="+…` [x2]
- legacy/index.html:1366 — `… obFetchJson("https://api.the-odds-api.com/v4/sports/baseball_mlb/events/"+e.id+"/odds?regions=us&oddsFormat=american&markets="+SH_PROP_MARKETS+","+SH_PROP_ALT+"&apiKey="+encodeURI…`
- legacy/index.html:3060 — `daily, HR 100%. Threshold is 1 and not 2: props are fetched at regions=us only`
- src/engine2/sharpBoard.ts:10 — `"https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,totals,spreads&oddsFormat=american";`
- src/lib/server/football-props.ts:128 — `'&regions=${cfg.props.regions}&markets=${cfg.feeds.oddsPropMarkets}&oddsFormat=american';` [x2]
- src/lib/ufc.ts:84 — `"https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds?regions=us&markets=h2h,totals&oddsFormat=american",`
- src/lib/useAllStar.ts:77 — `oddsUrl('/v4/sports/baseball_mlb/events/${asg.id}/odds?regions=us,eu&markets=${MARKETS}&oddsFormat=american'),`

##### regions= / regions: / regions — config (18 lines)

- src/lib/cfb/rules.ts:367 — `"https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";`
- src/lib/cfb/rules.ts:376 — `slate call), NOT the 6 per event the endpoint's "[markets] × [regions]" note suggests. The`
- src/lib/cfb/rules.ts:474 — `regions: "us",`
- src/lib/football/league.ts:87 — `regions: string;`
- src/lib/mlb/live-props-rules.ts:147 — `regions: "us",`
- src/lib/mlb/live-props-rules.ts:233 — `* 'regions' is byte-equal "us", so 'shapeAllowed' passes on the first shape with NO EDIT to`
- src/lib/mlb/live-props-rules.ts:243 — `/** The per-event in-play re-price: one call per selected live game, the six core markets, regions=us. */`
- src/lib/mlb/live-props-rules.ts:245 — `return '${MLB_LIVE_EVENTS_URL}/${encodeURIComponent(eventId)}/odds?apiKey=${apiKey}&regions=${MLB_LIVE_PROPS.regions}&markets=${MLB_LIVE_MARKETS}&oddsFormat=american';` [x2]
- src/lib/nfl/rules.ts:170 — `"https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";`
- src/lib/nfl/rules.ts:195 — `regions: "us",`
- src/lib/server/odds-shape.ts:4 — `* The Odds API bills per request as a 'markets × regions' PRODUCT, and '/api/odds' lets the`
- src/lib/server/odds-shape.ts:9 — `* OURS six player-prop markets × regions=us (~6 credits/event call)`
- src/lib/server/odds-shape.ts:10 — `* SharpDesk h2h / spreads / totals × regions=us,eu (~6 credits/call)`
- src/lib/server/odds-shape.ts:44 — `const SHAPES: { markets: Set<string>; regions: string }[] = [`
- src/lib/server/odds-shape.ts:45 — `{ markets: PROP_MARKETS, regions: "us" },`
- src/lib/server/odds-shape.ts:46 — `{ markets: SHARP_MARKETS, regions: "us,eu" },`
- src/lib/server/odds-shape.ts:54 — `const regions = url.searchParams.get("regions") ?? "";` [x2]
- src/lib/server/odds-shape.ts:55 — `return SHAPES.some((s) => regions === s.regions && requested.every((x) => s.markets.has(x)));` [x2]

##### regions= / regions: / regions — calculations (6 lines)

- app/api/generate/route.ts:404 — `regions: "us,eu",`
- legacy/index.html:1553 — `SH_V2 is set by the app shell at runtime ({priors,ctx,shin,sharpW,regions}).`
- legacy/index.html:2851 — `… batters":"unavailable")+"), Shin de-vig, Pinnacle-weighted consensus across "+((SH_V2.regions)||"us")+" books, ump K-zones + temperature ("+(SH_CTX?"context live":"context unavail…`
- src/engine/legacy-src.gen.ts:5 — `…//api.the-odds-api.com/v4/sports/\"+SPORTS[SPORT].oddsKey+\"/events/\"+OB.game+\"/odds?regions=us&oddsFormat=american&markets=\"+OB.market+\"&apiKey=\"+encodeURIComponent(OB.key);\…` [long line; 8 occurrences on this line; first shown]
- src/lib/engine-client.ts:362 — `regions: "us,eu",`
- src/lib/server/mlb-live-quote.ts:74 — `* 'regions' is byte-equal "us", so 'shapeAllowed' passes on the first shape and`

##### regions= / regions: / regions — UI (1 lines)

- app/board/page.tsx:736 — `/* the in-play pull asks for the six core markets at us regions only, so there is`

##### regions= / regions: / regions — tests (35 lines)

- tests/cfb-props-route.test.ts:283 — `expect(String(url)).toMatch(/\/v4\/sports\/americanfootball_ncaaf\/events\/[^/]+\/odds\?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td/);`
- tests/cfb-props-route.test.ts:1113 — `…/sports/americanfootball_ncaaf/events/${oddsIdOf(G)}/odds?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player…`
- tests/cfb-props.test.ts:68 — `regions: "us",`
- tests/engine-v2-integration.test.ts:124 — `// regions stays "us" (fixtures recorded us URLs); simN kept at a test-fast 2000`
- tests/helpers/fixture-env.ts:95 — `priors: true, ctx: true, regions: "us,eu",`
- tests/live-board-only.test.ts:23 — `* inside one of three regions, and 'boardOnly' cannot enter any of them. That is what the last`
- tests/live-board-only.test.ts:182 — `/* THE THREE REGIONS boardOnly CANNOT ENTER.`
- tests/live-board-only.test.ts:194 — `it("the regions are in the order the proof assumes", () => {`
- tests/mlb-live-props-route.test.ts:430 — `it("asks for the eight core markets at regions=us, with no alternate ladder and the key threaded", async () => {`
- tests/mlb-live-props-route.test.ts:436 — `expect(first).toContain("regions=us");`
- tests/mlb-live-rules.test.ts:94 — `regions: "us",`
- tests/mlb-live-rules.test.ts:255 — `expect(url).toContain("regions=us");`
- tests/mlb-live-rules.test.ts:270 — `// PLANT: the check is real — widening the regions on our markets is a LARGER product, refused`
- tests/mlb-live-rules.test.ts:271 — `expect(shapeAllowed(new URL(url.replace("regions=us", "regions=us,eu")))).toBe(false);` [x2]
- tests/mlb-market-phases.test.ts:49 — `const source="https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc/odds?markets=batter_hits&regions=us";`
- tests/nfl-props-route.test.ts:23 — `* url — '/v4/sports/americanfootball_nfl/events/<id>/odds?apiKey=…&regions=us&markets=<six>&oddsFormat=american'`
- tests/nfl-props-route.test.ts:167 — `expect(NFL_PROPS.regions).toBe("us");`
- tests/nfl-props-route.test.ts:253 — `…m\/v4\/sports\/americanfootball_nfl\/events\/[^/]+\/odds\?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player…`
- tests/nfl-props-route.test.ts:259 — `…'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${cinOdds}/odds?apiKey=test-key-never-logged&regions=us&markets=${CFB_PROPS_ODDS_MARKETS}&oddsFormat=american');`
- tests/nfl-props-route.test.ts:445 — `expect(body).toMatch(/cfg\.props\.regions/);`
- tests/odds-hardening.test.ts:19 — `* B — SHAPE ALLOW-LIST: the 'markets × regions' product is validated against the two shapes`
- tests/odds-hardening.test.ts:30 — `const ev = (markets: string, regions: string) =>`
- tests/odds-hardening.test.ts:31 — `'https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc123/odds?markets=${markets}&regions=${regions}&oddsFormat=american';` [x2]
- tests/odds-hardening.test.ts:34 — `it("allows OUR props shape: six markets x regions=us", () => {`
- tests/odds-hardening.test.ts:45 — `const u = new URL('https://api.the-odds-api.com/v4/sports/baseball_mlb/events/abc/odds?regions=us&oddsFormat=american&markets=${core},${alt}&apiKey=');`
- tests/odds-hardening.test.ts:48 — `u.searchParams.set("regions", "us,eu");`
- tests/odds-hardening.test.ts:51 — `it("allows the SharpDesk shape: h2h/spreads/totals x regions=us,eu", () => {`
- tests/odds-hardening.test.ts:110 — `* markets at 'regions=us' — a strict SUBSET of 'PROP_MARKETS' on a byte-equal region string —`
- tests/odds-hardening.test.ts:131 — `const liveEventOdds = (regions = "us") =>`
- tests/odds-hardening.test.ts:134 — `'?apiKey=&regions=${regions}&markets=${LIVE_MARKETS}&oddsFormat=american',` [x2]
- tests/odds-hardening.test.ts:138 — `it("six core markets x regions=us passes with odds-shape.ts unchanged", () => {`
- tests/odds-hardening.test.ts:161 — `expect(shape).toMatch(/\{\s*markets:\s*PROP_MARKETS,\s*regions:\s*"us"\s*\}/);`
- tests/odds-hardening.test.ts:162 — `expect(shape).toMatch(/\{\s*markets:\s*SHARP_MARKETS,\s*regions:\s*"us,eu"\s*\}/);`
- tests/odds-hardening.test.ts:164 — `expect((shape.match(/regions:\s*"/g) ?? []).length, "a shape was added or removed").toBe(2);`
- tests/shrink-activity.test.ts:19 — `* 'regions=us' for props, the ump 'g >= 5' guard, and 'GAP_BUCKET_MIN_N'.`

##### regions= / regions: / regions — docs (51 lines)

- CLAUDE.md:1120 — `'1.06', props-'regions', ump 'g>=5', 'GAP_BUCKET_MIN_N'). 7 of 9 sites sit below 0.6`
- ENGINE2.md:31 — `- **Line history we own**: hourly snapshots (h2h/totals/spreads, us+eu regions) →`
- ENGINE2.md:46 — `consensus for ML/RL/props, us+eu game-odds regions. Dormant = byte-identical to`
- ENGINE2.md:82 — `ML/totals vs the Caesars line, us+eu regions, comparability guard when CZ hangs a`
- docs/board-open-experiment.md:47 — `'regions=us,eu × markets=h2h,totals,spreads' = **3 × 2 = 6 credits** on a cache miss.`
- docs/branch-firing-audit.md:250 — `… per invocation** | one '/events' call (measured at **0**) + **6 credits per event** ('regions=us', six markets, L33/L98), capped at 'MAX_EVENTS = 16' (L37) → **up to 96 credits pe…`
- docs/branch-firing-audit.md:590 — `distinguishes them: **Variant B step 1 is a request of KNOWN product (3 markets × 2 regions = 6),`
- docs/branch-firing-audit.md:896 — `**Step 1 is a request of KNOWN product**: 'regions=us,eu × markets=h2h,totals,spreads' = **3 × 2 =`
- docs/branch-firing-audit.md:1742 — `controls markets, regions, sport and event id inside 'u'.`
- docs/branch-firing-audit.md:1763 — `…arameter's shape** | '…/v4/sports/baseball_mlb/events' first, then '…/events/<id>/odds?regions=us&…&markets=batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pi…` [x4]
- docs/branch-firing-audit.md:1910 — `?regions=us&markets=batter_hits,batter_total_bases,batter_home_runs,`
- docs/cfb-desk.md:16 — `| The Odds API 'americanfootball_ncaaf', regions 'us,eu', markets 'h2h,spreads,totals', american odds | 'CFB_ODDS_URL' | 'revalidate: 240' | 'oddsMissing: true', scores-only board,…`
- docs/cfb-desk.md:18 — `- One fresh odds pull costs 6 credits (3 markets × 2 regions): the prod read on 2026-09-05 moved the quota from 17578 to 17572 remaining. The key is 'ODDS_API_KEY', server only. Lo…`
- docs/cfb-desk.md:100 — `…ll per pricing pass, 'oddsPayload' in 'src/lib/cfb/slate-server.ts', whose URL carries regions us,eu and markets h2h,spreads,totals: the 6-credit shape the props docblock in 'src/l…` [long line; 1 occurrences on this line; first shown]
- docs/collection-period.md:823 — `| 'regions' — **GAME MARKETS ONLY** ('h2h,spreads,totals', L1231) | 'us,eu' | 'us,eu' |`
- docs/collection-period.md:824 — `| **prop-market regions — HARDCODED, ignores 'SH_V2.regions'** (L1335) | **'us'** | **'us'** |` [x2]
- docs/collection-period.md:828 — `**The 'regions' row described half of what it appeared to describe (fixed 2026-07-25).**`
- docs/collection-period.md:829 — `'SH_V2.regions' governs the **game-odds** pull only (L1231). The per-event **prop** pull`
- docs/collection-period.md:830 — `hardcodes 'regions=us' (L1335) and ignores the setting entirely. Same omission class as`
- docs/collection-period.md:1125 — `('legacy/index.html' L1335) and 'snapshot_props.py' fetch props at 'regions=us', so this is`
- docs/collection-period.md:1646 — `and the props-regions split.`
- docs/collection-period.md:1942 — `Game markets are also the only ones fetched with 'regions=us,eu' (L1231), so their pools are`
- docs/collection-period.md:2046 — `Game markets are the only ones fetched at 'regions=us,eu' (L1231), so their pools are the`
- docs/collection-period.md:7983 — `had not counted is **'line-history.yml': hourly ('12 * * * *'), 3 markets × 2 regions =`
- docs/collection-period.md:8154 — `**What it collects**: MLB 'h2h'/'totals'/'spreads' across **us+eu** regions (eu carries`
- docs/collection-period.md:8157 — `('tools/snapshot_odds.py'). **Its own header states the cost: "3 markets × 2 regions =`
- docs/collection-period.md:8787 — `'/v4/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,totals,spreads' — **3 markets`
- docs/collection-period.md:8788 — `× 2 regions = 6 credits per uncached call.** It is mounted unconditionally at`
- docs/collection-period.md:8791 — `2. **'useAllStar.ts' L77** fetches per-event odds at 'regions=us,eu' with a MARKETS list —`
- docs/credit-budget.md:367 — `| '/v4/sports/baseball_mlb/events/<id>/odds', six core markets × 'regions=us', 'oddsFormat=american' | one live game's in-play re-price | **~6 budgeted** per event |`
- docs/multibook-memo.md:61 — `## 1. FEED REALITY — measured today (28 events; 1 event's props; regions us,us2,eu)`
- docs/nfl-desk.md:43 — `| game lines | 'NFL_ODDS_URL' (':164-165'): '…/v4/sports/americanfootball_nfl/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american' — WITHOUT the key; the server appen…`
- docs/nfl-desk.md:44 — `…tBase' '…/v4/sports/americanfootball_nfl/events', markets 'player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds', regions 'us' |`
- docs/nfl-desk.md:82 — `…dateSec 600, boardRetainSec 36 h, czMissingRevalidateSec 1800, czMissingWindowSec 4 h, regions 'us', minBooks 2, settleBook 'williamhill_us', dailyBudget **1000**, measuredCreditsP…`
- docs/session-handoff.md:840 — `…ince 08-02 was props-blind. Fix: the three ladders join the proxy's props shape (still regions=us only — 'tests/odds-hardening.test.ts' pins the engine's exact URL passing and the …`
- docs/session-handoff.md:987 — `asking the SIX core prop markets at 'regions=us'. No '_alternate' ladders: the three ladders are`
- docs/session-handoff.md:990 — `allow-list ('src/lib/server/odds-shape.ts:20-53' — 'PROP_MARKETS' is a superset and 'regions' is`
- docs/session-handoff.md:2164 — `OURS = 6 markets, regions=us ONLY`
- docs/session-handoff.md:2167 — `SharpDesk = 3 markets, regions=us,eu (h2h, totals, spreads)`
- docs/session-handoff.md:2927 — `… AND setting 'APP_PASSCODE' later can no longer kill the morning batch; B — 'markets × regions' allow-list (our six-prop×us, sharp h2h/spreads/totals×us,eu, events-list free class)…`
- docs/session-handoff.md:3480 — `**6 markets × 'regions=us'**; SharpDesk's is **3 markets × 'regions=us,eu'**. **So per-call cost` [x2]
- docs/session-handoff.md:3515 — `It was the best remaining candidate: it **can** reach the Odds API (L89 'regions=us,eu&markets=h2h,spreads'`
- docs/session-handoff.md:3600 — `'tools/snapshot_props.py' L323 requests **'?regions=us&oddsFormat=american&markets=<6 markets>'** —`
- docs/session-handoff.md:3608 — `od = fetch(.../events/{e["id"]}/odds?regions=us&...) # ← BILLED, 6 credits`
- docs/session-handoff.md:4048 — `| **'u''s shape** | **six markets, 'regions=us' ONLY** ('batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs') | **SharpDesk's is …` [x2]
- docs/session-handoff.md:4107 — `?regions=us&markets=<the props sweep's own six>`
- docs/session-handoff.md:5495 — `| **B** | **SHAPE ALLOW-LIST** — validate 'markets × regions' against the two shapes we actually use; reject others | small, additive: a validator before the upstream call | bounds…`
- docs/session-handoff.md:5838 — `suspends HRR alternates above the line). **COST (§12X model: billing = markets × regions`
- docs/session-handoff.md:6257 — `was wrong. 'snapshot_props.py' L323 requests 'regions=us' × six markets — **6 credits per event`
- docs/session-handoff.md:7533 — `**THE COST MODEL, CORRECTED (§12X):** the billing object is **'markets × regions' per request**.`
- docs/session-handoff.md:7534 — `'snapshot_props.py' L323 sends 'regions=us' × six markets → **6 credits per event FETCHED**, plus 1`

##### regions= / regions: / regions — tools (5 lines)

- tools/burn-report.mjs:18 — `export const CREDITS_PER_TICK = 6; // 3 markets x 2 regions (tools/snapshot_odds.py header)`
- tools/snapshot_odds.py:4 — `Pulls MLB h2h/totals/spreads across us+eu regions (eu carries Pinnacle, the`
- tools/snapshot_odds.py:9 — `Cost: 3 markets x 2 regions = 6 credits/run; hourly ~ 2.7k/month.`
- tools/snapshot_odds.py:24 — `"?regions=us,eu&markets=h2h,totals,spreads&oddsFormat=american")`
- tools/snapshot_props.py:323 — `f"?regions=us&oddsFormat=american&markets={MARKETS}")`

#### consensus

667 matching lines in 124 files (1069 occurrences).

Note: Mostly the de-vigged cross-book consensus fair. src/lib/splits.ts, app/api/splits/route.ts and src/components/ui/SplitsChip.tsx use 'consensus' for scoresandodds public bet%/money% splits, which is not a price consensus.

##### consensus — fetch code (18 lines)

- app/api/splits/route.ts:2 — `import { parseConsensus, SPLITS_SOURCE_URL, type SplitsFeed, type SplitsLeague } from "@/lib/splits";`
- app/api/splits/route.ts:6 — `* scoresandodds.com's public consensus page (see src/lib/splits.ts for the source note).`
- app/api/splits/route.ts:31 — `const games = parseConsensus(html, league);`
- app/api/splits/route.ts:32 — `return NextResponse.json({ ...base, games, ...(games.length ? {} : { error: "no consensus cards parsed" }) }, { headers: cache(games.length ? TTL_SEC : 60) });`
- src/lib/splits.ts:6 — `* SOURCE: scoresandodds.com's public consensus pages ('/{nfl|mlb|ncaaf}/consensus-picks'), which` [x2]
- src/lib/splits.ts:7 — `* republish Action Network's consensus — one card per game and market (moneyline / spread /`
- src/lib/splits.ts:14 — `* consensus card, simply shows no split. Player props have no public split anywhere — none is`
- src/lib/splits.ts:25 — `export type MarketSplit = { a: SideSplit; b: SideSplit; /** the consensus line printed beside the sides ("-3.5" for the away spread, "44.5" for the total) */ line: number | null };`
- src/lib/splits.ts:49 — `export const SPLITS_SOURCE_URL = (league: SplitsLeague) => 'https://www.scoresandodds.com/${league}/consensus-picks';`
- src/lib/splits.ts:53 — `const CARD_SPLIT = /(?=<div class="trend-card consensus )/;`
- src/lib/splits.ts:66 — `/** the consensus line off the sides strip: "GB (-3.5)" → -3.5; "Over (o44.5)" → 44.5; "GB" → null */`
- src/lib/splits.ts:73 — `* Parse one consensus page into games. Cards for the same event (moneyline / spread / total) are`
- src/lib/splits.ts:76 — `export function parseConsensus(html: string, league: SplitsLeague): GameSplits[] {`
- src/lib/splits.ts:80 — `const mk = /consensus-table-(moneyline|spread|total)/.exec(card.slice(0, 200));`
- src/lib/splits.ts:110 — `/* ---------- matching a desk game to a consensus game ---------- */`
- src/lib/splits.ts:157 — `// "newyorkyankees" ends with the consensus nickname "yankees"; "pennstate" equals "pennstate"`
- src/lib/splits.ts:167 — `* The consensus game for a desk game — both sides must match (away↔away, home↔home; a swapped`
- src/lib/splits.ts:194 — `// a desk team that matched the consensus HOME slot while the desk called it away (neutral site) still reads its own bar`

##### consensus — config (9 lines)

- src/lib/cfb/rules.ts:25 — `* game: the de-vigged moneyline consensus, the consensus spread through` [x2]
- src/lib/cfb/rules.ts:30 — `* market's consensus margin, nudged by FPI.`
- src/lib/cfb/rules.ts:31 — `* pinnacleWeight — Pinnacle counts twice in the consensus median (the sharp anchor).`
- src/lib/cfb/rules.ts:32 — `* minBooks 2 — a consensus needs two books at the line, else the market is null.`
- src/lib/found-mode.ts:26 — `* blended halfway to the de-vigged consensus). The engine's own strict gate passed ZERO bets on the`
- src/lib/found-mode.ts:28 — `* consensus), so "lock what it finds" under that gate would lock nothing; the raw model number`
- src/lib/nfl/rules.ts:21 — `* probability blends the de-vigged moneyline consensus, the consensus spread` [x2]
- src/lib/nfl/rules.ts:22 — `* and the FPI gap; Pinnacle counts twice; two books make a consensus; Caesars`
- src/lib/paper-mode.ts:156 — `* Every leg prob is blended halfway to the de-vigged consensus (shrink.ts).`

##### consensus — calculations (131 lines)

- app/api/calibrate/route.ts:274 — `can score the model against the consensus-only baseline — upgrade 03)`
- app/api/calibrate/route.ts:461 — `/* WHEN DOES THE CONSENSUS GATE REOPEN? MEASURED NIGHTLY, NEVER PROJECTED ONCE.`
- app/api/calibrate/route.ts:463 — `ticket must ALSO clear the de-vigged consensus — which is what blocked all 18 tickets`
- app/api/clv/route.ts:20 — `* last Caesars price + de-vigged consensus fair for every still-pregame leg`
- legacy/index.html:457 — `…ransparent math on live data: every price de-vigged across all posted books (median = consensus prior); the model — Monte Carlo game sims (4,000/game) for ML/RL/H+R+RBI, Poisson pr…` [x2]
- legacy/index.html:1084 — `than consMinN graded ledger legs also needs the de-vigged consensus itself to price it`
- legacy/index.html:1161 — `the Caesars playable price on existing rows — never consensus, line shopping, or new rows. */`
- legacy/index.html:1274 — `/* market layer: de-vig EVERY book (multiplicative), consensus = median fair prob,`
- legacy/index.html:1275 — `line-shop the best price per side. The consensus is the model's prior. */`
- legacy/index.html:1294 — `book. 'ml_books' keeps its old meaning (pool size, drives the "consensus of N`
- legacy/index.html:1302 — `/* Caesars-only playable layer: the user's book. Captured additively — consensus/best-price above untouched. */`
- legacy/index.html:1313 — `/* consensus at the modal (most-quoted) home run-line point */`
- legacy/index.html:1335 — `if(SH_V2){ /* consensus at the modal total point + Caesars quote (v2 totals pricing) */`
- legacy/index.html:1369 — `consensus fair P(over) = median across books, prices kept = best per side (line shopping). */`
- legacy/index.html:1375 — `They ONLY fill playable/basis prices on rows the consensus books`
- legacy/index.html:1561 — `Captured additively, exactly like the Caesars layer: consensus and best-price`
- legacy/index.html:1700 — `shMedian: consensus aggregator across books (median is robust to one stale book). */`
- legacy/index.html:1735 — `/* edge-engine config (doc Phase 4). The market consensus is the prior: final = w·model + (1−w)·consensus.` [x2]
- legacy/index.html:1741 — `design — a multiplier can pull the model toward the consensus (floor 5% absolute)`
- legacy/index.html:2164 — `/* consensus prior: median de-vigged fair prob across every book (fallback: de-vig best prices) */`
- legacy/index.html:2181 — `if(go.ml_books>=2){bits.push("consensus of "+go.ml_books+" books, de-vigged");tags.push("consensus");}` [x2]
- legacy/index.html:2183 — `/* market-anchored blend: the consensus is the prior; the model must earn its deviation */`
- legacy/index.html:2448 — `/* consensus prior (median de-vig across books) + market-anchored blend.`
- legacy/index.html:2452 — `if(row.books>=2)tags.push("consensus");`
- legacy/index.html:2529 — `and the price edge vs the de-vigged market consensus (fair prob − Caesars implied) */`
- legacy/index.html:2603 — `/* market fair for the OVER: the consensus de-vig when both sides are posted, else the`
- legacy/index.html:2629 — `consensus books don't mirror — browsable here, flagged ALT, Caesars-priced. */`
- legacy/index.html:2753 — `/* de-vigged consensus read of the same ticket at the basis price: what the market`
- legacy/index.html:2851 — `…H_PRIORS.batters).length+" batters":"unavailable")+"), Shin de-vig, Pinnacle-weighted consensus across "+((SH_V2.regions)||"us")+" books, ump K-zones + temperature ("+(SH_CTX?"cont…` [x2]
- legacy/index.html:2861 — `consensus, EV at the Caesars quote when CZ hangs the same number), first-5`
- legacy/index.html:3052 — `/* NO INDEPENDENT CONSENSUS -> NOT ELIGIBLE (2026-07-26). This blocks at ANY mktN,`
- legacy/index.html:3054 — `stop consulting the consensus" is coherent when a consensus EXISTS and the` [x2]
- legacy/index.html:3065 — `blocked.push({name:w.pl.name,type:w.pl.type||null,bsEv:basisMode?w.pl.bsEv:w.pl.czEv,czEv:w.pl.czEv,reason:"no_ind_consensus"});return;}`
- legacy/index.html:3067 — `the de-vigged consensus on side, read at the mode's own selection price */`
- legacy/index.html:3074 — `/* the gate fires only when the consensus read EXISTS and disagrees — an absent`
- legacy/index.html:3079 — `blocked.push({name:w.pl.name,type:w.pl.type||null,bsEv:basisMode?w.pl.bsEv:w.pl.czEv,czEv:w.pl.czEv,consEv:cEv,reason:"consensus"});return;}`
- src/engine/legacy-src.gen.ts:5 — `…y market with fewer\n than consMinN graded ledger legs also needs the de-vigged consensus itself to price it\n no worse than consMinEv% at the basis. mktN arrives from …` [long line; 35 occurrences on this line; first shown]
- src/engine2/allstar.ts:7 — `weighted consensus across every posted book (Pinnacle ×3, exchanges ×2).`
- src/engine2/allstar.ts:13 — `- The sim is calibrated so P(AL win) and P(over) REPRODUCE the consensus`
- src/engine2/allstar.ts:23 — `consensusProb,`
- src/engine2/allstar.ts:114 — `const c = consensusProb(rows.map((r) => ({ key: r.book, a: r.al, b: r.nl })));`
- src/engine2/allstar.ts:118 — `/** Consensus O/U at the MODAL posted point (books hang different totals —`
- src/engine2/allstar.ts:125 — `const c = consensusProb(modal[1].map((r) => ({ key: r.book, a: r.over, b: r.under })));`
- src/engine2/allstar.ts:263 — `/** Calibrate (total scale, AL share) so the sim reproduces the consensus`
- src/engine2/allstar.ts:264 — `ML fair and the consensus total fair — the market defines the game, the`
- src/engine2/allstar.ts:422 — `note: string; // honesty tag: consensus width, CZ-only, book-anchored…`
- src/engine2/allstar.ts:470 — `note: fair.n === 1 ? "CZ-only market, de-vigged two-way" : 'consensus of ${fair.n} books',`
- src/engine2/allstar.ts:483 — `// CZ hangs a different number than the consensus point — the fair isn't`
- src/engine2/allstar.ts:485 — `const own = consensusProb([{ key: "williamhill_us", a: cz.over, b: cz.under }]);`
- src/engine2/allstar.ts:500 — `note: 'CZ ${cz.point} vs consensus ${fair.point} — own de-vig only',`
- src/engine2/allstar.ts:518 — `note: 'consensus of ${fair.n} books at ${fair.point}',`
- src/engine2/calibration.ts:20 — `/* upgrade 03: the de-vigged consensus probability at statement time (0-100), when`
- src/engine2/calibration.ts:21 — `logged — lets the summary score the model AGAINST the consensus-only baseline */`
- src/engine2/calibration.ts:167 — `/* upgrade 03: model vs consensus Brier over the SAME records (both probs known) —`
- src/engine2/calibration.ts:168 — `the day model < consensus in a market is the day its blend weight earned a raise */`
- src/engine2/calibration.ts:169 — `mktCmp?: { n: number; model: number; consensus: number } | null;`
- src/engine2/calibration.ts:213 — `/* 2026-07-27: WHEN EACH MARKET'S CONSENSUS GATE REOPENS, recomputed nightly from the`
- src/engine2/calibration.ts:215 — `that market to clear the de-vigged consensus as well, which is what a NO-PLAY day is`
- src/engine2/calibration.ts:284 — `consensus:`
- src/engine2/calibration.ts:342 — `every graded leg with p' = consensus + s·(p − consensus) brings the pooled` [x2]
- src/engine2/calibration.ts:344 — `act below 150 graded legs that logged their consensus baseline.`
- src/engine2/calibration.ts:353 — `n: number; // graded legs with a logged consensus baseline`
- src/engine2/calibration.ts:414 — `* So: bucket by |p − pMkt| (stated probability minus the de-vigged consensus, in points)`
- src/engine2/calibration.ts:456 — `/** "high" = model above the de-vigged consensus, "low" = below. NOT redundant with the`
- src/engine2/calibration.ts:458 — `consensus and still negative-EV because Caesars is worse than consensus. Both are` [x2]
- src/engine2/calibration.ts:553 — `/** Replay a stated probability at confidence s against its consensus anchor. */`
- src/engine2/calibration.ts:621 — `/** SH_CFG.mktN: graded legs per market — the small-sample consensus gate's input.`
- src/engine2/devig.ts:1 — `/* Engine v2 market layer — de-vig methods + sharp-weighted consensus.`
- src/engine2/devig.ts:64 — `/* ---------- sharp-weighted consensus ---------- */`
- src/engine2/devig.ts:87 — `/** consensus fair prob for outcome A of a two-way market across books:`
- src/engine2/devig.ts:89 — `export function consensusProb(`
- src/engine2/sharpBoard.ts:4 — `Pinnacle-weighted consensus across us+eu books, judged at the Caesars line.`
- src/engine2/sharpBoard.ts:7 — `import { consensusProb, decFromAmerican, americanFromProb } from "@/engine2/devig";`
- src/engine2/sharpBoard.ts:40 — `/* dk_fd basis at the consensus point (always apples-to-apples) */`
- src/engine2/sharpBoard.ts:74 — `function mlConsensus(ev_: OddsEvent, book = "draftkings") {`
- src/engine2/sharpBoard.ts:94 — `c: consensusProb(books, "shin"),`
- src/engine2/sharpBoard.ts:102 — `function totalConsensus(ev_: OddsEvent, book = "draftkings") {`
- src/engine2/sharpBoard.ts:103 — `// consensus over the MOST COMMON total point among books (apples to apples)`
- src/engine2/sharpBoard.ts:121 — `// dk_fd basis at the consensus point — drawn from the same point-matched set,`
- src/engine2/sharpBoard.ts:127 — `c: consensusProb(best.books, "shin"),`
- src/engine2/sharpBoard.ts:143 — `const ml = mlConsensus(e,book);`
- src/engine2/sharpBoard.ts:144 — `const tot = totalConsensus(e,book);`
- src/engine2/sharpBoard.ts:148 — `// CZ total EV only comparable when CZ hangs the consensus point`
- src/lib/cfb/card.ts:260 — `….player).length} fresh O/U prop singles; distinct games and players. Props use market-consensus estimates. Missing or older-than-30-minute quotes stay out; sides fill available slo…`
- src/lib/cfb/h1.ts:3 — `import { bookQuote, consensusMedian, coverProb, readBooksOf, sideRow } from "@/lib/cfb/model";`
- src/lib/cfb/h1.ts:15 — `* h2h_h1 / spreads_h1 / totals_h1 beside the six player markets) → the game's 1H consensus`
- src/lib/cfb/h1.ts:19 — `* side through the same coverProb. Consensus-only: no FPI blend (FPI rates the full game).`
- src/lib/cfb/h1.ts:38 — `const mkt = consensusMedian(books.mls, (b) => b.pHome, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:39 — `const mktMargin = consensusMedian(books.spreads, (b) => b.mu, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:40 — `const spreadLine = consensusMedian(books.spreads, (b) => b.s, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:41 — `const mktTotal = consensusMedian(books.totals, (b) => b.muT, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:42 — `const totalLine = consensusMedian(books.totals, (b) => b.T, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:44 — `// the full-game blend minus its FPI term: the moneyline consensus and the spread-implied win chance,`
- src/lib/cfb/model.ts:34 — `* 5. Consensus = Pinnacle-weighted median across books (null under the league's 'model.minBooks').`
- src/lib/cfb/model.ts:35 — `* 6. P(home) = blend of {ML consensus, spread-implied, FPI-implied} over what exists;`
- src/lib/cfb/model.ts:37 — `* 7. One row per side per market at the consensus line, with every book's quote at ITS OWN`
- src/lib/cfb/model.ts:86 — `* The model's (win, push) for a side of a game at an arbitrary line — the consensus line for`
- src/lib/cfb/model.ts:377 — `export function consensusMedian<T>(items: T[], value: (t: T) => number, weight: (t: T) => number, minBooks: number): number | null {`
- src/lib/cfb/props.ts:41 — `* 6. 'best' = highest decimal among the books posting the consensus line (all books for the`
- src/lib/cfb/props.ts:268 — `const consensus = fairAt(g.reads, line, P.minBooks);`
- src/lib/cfb/props.ts:317 — `const fair = consensus ? pOf(consensus.p) : null;` [x2]
- src/lib/cfb/props.ts:340 — `books: consensus?.n ?? 0,`
- src/lib/clv-report.ts:9 — `* - fairPts = 100 × (closing de-vigged consensus fair − locked de-vigged`
- src/lib/clv-report.ts:10 — `* consensus fair), both for the side we bet. Positive = the market moved`
- src/lib/clv-report.ts:45 — `type Sight = { am?: number | null; at?: number; consensusFair?: number | null };`
- src/lib/clv-report.ts:68 — `lockedFair != null && s.consensusFair != null ? s.consensusFair * 100 - lockedFair : null;` [x2]
- src/lib/engine-client.ts:345 — `weighted consensus, us+eu books, ump/temperature context). Best-effort —`
- src/lib/engine-client.ts:379 — `// small-sample consensus gate (2026-07-22): graded-leg counts per market from the`
- src/lib/football/gen-pool.ts:14 — `* consensus, so there is no fair for that line — gets no leg here either, because the leg comes`
- src/lib/football/gen-pool.ts:150 — `/* the win % is the de-vigged consensus across the books that posted this line, never a`
- src/lib/gate-rebuild.ts:8 — `* small-sample consensus gate ('consMinN', frozen at 100): while a market sits`
- src/lib/gate-rebuild.ts:9 — `* under that count, its tickets must ALSO clear the de-vigged consensus, so the`
- src/lib/gate-rebuild.ts:96 — `return 'Market sample rebuilding since the 0.5 restart (${rebuildCounts(rows)}) — consensus gate temporarily strict; this is not a model signal.';`
- src/lib/ledger-segments.ts:13 — `* fairPts = 100 x (de-vigged consensus fair at close - implied(locked price))`
- src/lib/ledger-segments.ts:15 — `* side, both prices carry it); fairPts grades against the sharp consensus.`
- src/lib/ledger-segments.ts:18 — `export type ClvEntry = { am: number; at: number; consensusFair?: number | null; bsAm?: number | null; bsBk?: string | null };`
- src/lib/ledger-segments.ts:38 — `fairPts: number | null; // mean vs consensus fair, over legs where it was stored`
- src/lib/ledger-segments.ts:140 — `.filter((l) => l.clv!.consensusFair != null)`
- src/lib/ledger-segments.ts:141 — `.map((l) => l.clv!.consensusFair! * 100 - impliedPct(l.lockedAm!));`
- src/lib/noplay.ts:75 — `core: DiscSplit; // tickets that faced the EV gate, the settlement floor and the consensus gates`
- src/lib/prop-lean.ts:5 — `* prop LINES for NFL but no percentages, and Covers / Action Network publish game-market consensus`
- src/lib/server/clv-core.ts:14 — `* consensus fair probability, so CLV can be graded against both closes.`
- src/lib/server/clv-core.ts:19 — `export type ClvSight = { am: number; at: number; consensusFair: number | null; bsAm?: number | null; bsBk?: string | null };`
- src/lib/server/clv-core.ts:205 — `consensusFair: fairOver == null ? null : under ? 1 - fairOver : fairOver,`
- src/lib/server/clv-core.ts:243 — `return { am: cz, at, consensusFair: fairs.length >= 2 ? median(fairs) : null, bsAm: bs?.am ?? null, bsBk: bs?.bk ?? null };`
- src/lib/server/mlb-live-quote.ts:143 — `* honest way to keep 'fO' comparable with 'consensusFair'.`
- src/lib/shrink.ts:13 — `* consensus implied probability the engine already carries on the leg ('imp'):`
- src/lib/ufc.ts:5 — `the true probability of each side is the de-vigged consensus across every`
- src/lib/ufc.ts:202 — `"The two best DraftKings prices vs the market consensus — the closest thing to +EV on this card.",`
- src/lib/ufc.ts:210 — `"The three most likely winners by consensus. High hit rate, thin price — entertainment chalk.",`
- src/lib/ufc.ts:230 — `"Every consensus favorite on the card. Longshot by construction — FUN-money only.",`

##### consensus — stored-data fields (17 lines)

- src/engine/index.ts:106 — `/* de-vigged consensus EV% of the whole ticket at the basis price (small-sample gate input) */`
- src/lib/cfb/props-types.ts:75 — `/** books behind the consensus */`
- src/lib/cfb/props-types.ts:77 — `/** At least one consensus input uses the disclosed assumed one-sided hold. */`
- src/lib/cfb/types.ts:55 — `/** The FIRST-HALF model behind a game's 1H rows (2026-09-19): consensus-only (no FPI blend — FPI`
- src/lib/cfb/types.ts:75 — `/** blended expected total (points), null when the market has no total consensus */`
- src/lib/cfb/types.ts:82 — `/** de-vigged moneyline consensus P(home), pre-blend */`
- src/lib/cfb/types.ts:84 — `/** P(home) implied by the consensus spread through the normal margin model */`
- src/lib/cfb/types.ts:88 — `/** consensus spread margin (home perspective: +7 means home favored by 7) */`
- src/lib/cfb/types.ts:93 — `/** books behind the consensus per market */`
- src/lib/cfb/types.ts:111 — `/** consensus line for this side (spread signed for the side; the total number; null for ML) */`
- src/lib/cfb/types.ts:119 — `/** de-vigged market consensus probability for this side at 'line', pre-blend (null = none) */`
- src/lib/cfb/types.ts:127 — `/** best price among books posting the consensus line (or the ML) */`
- src/lib/cfb/types.ts:131 — `/** Pinnacle when posted (the sharp anchor; weight 2 in the consensus) */`
- src/lib/cfb/types.ts:440 — `/** one priced 1H side, exactly the inputs priceGame's own push takes: the consensus line, the de-vigged market P(side), the book count and every book's quote */`
- src/lib/engine-echo.ts:125 — `/** graded legs per market at arm time — the COUNT that arms the consensus gate`
- src/lib/mlb/live-quote-types.ts:45 — `/** de-vigged consensus fair probability of the OVER at 'ln' (median of per-book fairs) */`
- src/lib/pred-serialize.ts:19 — `pMkt: number; // consensus de-vigged %`

##### consensus — UI (98 lines)

- app/board/page.tsx:262 — `/* bet % / money % on ML / RL rows (2026-09-18) — the consensus page carries no player props; the`
- app/board/page.tsx:1175 — `? "UFC — de-vigged market consensus vs your selected sportsbook, records live from ESPN"`
- app/board/page.tsx:1179 — `…isMode ? "priced at the DK/FD basis (Builder's selection price) · Caesars settles" : "consensus is multi-book, prices follow your selected sportsbook"} · ${SIM_PATHS_TXT}-path sims…`
- app/board/page.tsx:1181 — `? "Consensus de-vigged probability · EV at the DK/FD basis, settled at DraftKings"`
- app/board/page.tsx:1182 — `: "Consensus de-vigged probability vs the selected sportsbook line"`
- app/board/page.tsx:1642 — `…l ? "—" : '${view.ev > 0 ? "+" : ""}${view.ev.toFixed(1)}% vs market'}: the de-vigged consensus at the live ${view.side} ${view.ln} — the market's own price, not a model read. No l…`
- app/board/page.tsx:1689 — `title="The de-vigged consensus at the live line — the market's own number, not the model's. No edge is claimed over a price it was derived from."`
- app/builder/page.tsx:59 — `"nv_tax" (negative EV at the settling book) or "consensus" (small-sample market`
- app/builder/page.tsx:60 — `the de-vigged consensus disagrees with) */`
- app/builder/page.tsx:116 — `<span className="num">({rebuildCounts(rows)})</span> — consensus gate temporarily strict;{" "}`
- app/builder/page.tsx:121 — `a market is treated as unproven, so its tickets must also clear the de-vigged consensus — the card gets`
- app/builder/page.tsx:322 — `cleared +2% EV and every one died at the small-sample consensus gate, because CAL_START`
- app/builder/page.tsx:325 — `Reasons are ordered by count so whatever dominates leads; today that is 'consensus',`
- app/builder/page.tsx:326 — `and 'no_ind_consensus' is currently a non-event (zero tickets). */`
- app/builder/page.tsx:337 — `consensus: "consensus disagrees",` [x2]
- app/builder/page.tsx:339 — `no_ind_consensus: "no independent consensus",` [x2]
- app/builder/page.tsx:344 — `/* PHONE (2026-09-19): the summary line stays; the per-ticket list and the consensus paragraph fold behind`
- app/builder/page.tsx:379 — `{counts.consensus ? (`
- app/builder/page.tsx:381 — `The consensus gate applies to every market under 100 graded legs. That counter restarted at CAL_START, so it`
- app/builder/page.tsx:394 — `{b.reason === "consensus"`
- app/builder/page.tsx:395 — `? ' (small-sample market · consensus EV ${b.consEv != null ? b.consEv + "%" : "—"})'`
- app/builder/page.tsx:396 — `: b.reason === "no_ind_consensus"`
- app/builder/page.tsx:523 — `graded count, and mktN feeds the small-sample consensus gate — so for a few`
- app/builder/page.tsx:742 — `? "UFC — build any parlay from the card's DraftKings moneylines, priced against market consensus"`
- app/design/page.tsx:202 — `De-vigged consensus, Monte Carlo sims, ¼-Kelly discipline — priced at the window you`
- app/games/page.tsx:310 — `/** 'split' (2026-09-18): the consensus bet%/money% on this club's moneyline; the ML grade rides beside the price (Josh: "grades next to every pick on the games page") */`
- app/settings/page.tsx:121 — `anchored to the full multi-book consensus — DraftKings only prices and sizes what was already chosen, and picks`
- app/settings/page.tsx:124 — `weight toward the consensus when 150+ graded picks show statistically significant overconfidence (capped ±10%`
- app/sharp/page.tsx:315 — `? "The desk's UFC read — market consensus vs the selected sportsbook line, no fight model, no key needed"`
- app/sharp/page.tsx:317 — `? "The desk's All-Star read — consensus-anchored ML/F3/F5, sim-priced correct scores, straight bets only"`
- app/sharp/page.tsx:644 — `the median across books is the consensus &quot;fair&quot; probability. The engine has to earn any`
- app/sharp/page.tsx:671 — `consensus for props (15/85 for ML-RL). Displayed EV is computed at your selected sportsbook. Paper tickets retain their recorded prices. EDGE badges need both the…`
- app/sharp/page.tsx:711 — `? "UFC numbers are market-derived only (de-vigged consensus) — no model, nothing invented. Informational only, not betting advice."`
- src/components/allstar/AllStarSurfaces.tsx:181 — `<Panel title="Market read — consensus fair vs the Caesars price">`
- src/components/allstar/AllStarSurfaces.tsx:230 — `return 'Consensus fair ${fmtP(l.market)} (${l.note}) vs ${fmtAm(l.odds)} at Caesars — fair price ${fairAm(l.blend)}.';`
- src/components/cfb/CfbGameCard.tsx:88 — `/** The game's rows keyed by market and side (null where the market has no consensus). */`
- src/components/cfb/CfbGameCard.tsx:119 — `/** A book's quote as text: the price, plus its own line when it differs from the row's consensus line. */`
- src/components/cfb/CfbGameCard.tsx:164 — `// 2026-09-18: the row's own grade rides every cell, and the consensus bet%/money% for this side when the page carries the game`
- src/components/cfb/CfbGameCard.tsx:210 — `/** the consensus bet%/money% card for this game, when the page carries it (2026-09-18) */`
- src/components/cfb/CfbGameCard.tsx:323 — `{unmatched ? "No odds-feed match yet — nothing priced." : "No market has a consensus yet (two books at a line are needed)."}`
- src/components/cfb/CfbGameCard.tsx:458 — `<Line k="Books behind the consensus">`
- src/components/cfb/CfbPicksBoard.tsx:572 — `<span className={'num text-[9.5px] ${accentText}'} title="The selected sportsbook line differs from the consensus line">`
- src/components/cfb/CfbPicksBoard.tsx:857 — `<div className={'num text-[9.5px] ${nfl ? "text-nfl" : "text-cfb"}'} title="The selected sportsbook line differs from the consensus line">`
- src/components/cfb/CfbPicksBoard.tsx:883 — `/** the consensus bet%/money% for a SIDE pick — the row's own side off the game's card, or null (2026-09-18) */`
- src/components/cfb/CfbProps.tsx:218 — `// 2026-09-18: the grade off the EV at the price shown, and the consensus split for this side`
- src/components/cfb/CfbProps.tsx:406 — `* (Caesars alone at 249.5 against a 245.5 consensus) has no fair, so it gets no leg — the muted`
- src/components/cfb/CfbSharp.tsx:92 — `…ate.games.length === 1 ? "" : "s"} on ${railLabel(date)}: ${matched} matched to the odds feed, ${withMl} with a two-book moneyline consensus, ${withFpi} with FPI on both sides. ' +`
- src/components/cfb/CfbSharp.tsx:234 — `P(home) in probability points: the moneyline consensus alone vs the {Math.round(L.model.blend.mkt * 100)}/{Math.round(L.model.blend.spread * 100)}/`
- src/components/cfb/CfbSharp.tsx:264 — `consensus books · ML {sumBooks(slate.games, "ml")} · Spread {sumBooks(slate.games, "spread")} · Total {sumBooks(slate.games, "total")}`
- src/components/cfb/CfbSharp.tsx:273 — `Games each book prices on this slate. Paper tickets retain their recorded settlement book; Pinnacle counts ×{L.model.pinnacleWeight} in the consensus median; a`
- src/components/cfb/CfbSharp.tsx:377 — `Weights on the de-vigged moneyline consensus, the spread-implied probability and the FPI-implied probability. They renormalize over what exists —`
- src/components/cfb/CfbSharp.tsx:381 — `The expected margin every spread is priced off: mostly the market&apos;s consensus margin, nudged by FPI.`
- src/components/cfb/CfbSharp.tsx:383 — `<Term k={'Pinnacle ×${m.pinnacleWeight} · min ${m.minBooks} books'} label="Consensus">`
- src/components/cfb/CfbSharp.tsx:384 — `Each market&apos;s consensus is a weighted median across books, Pinnacle counting twice as the sharp anchor. Under {m.minBooks} books at a line, the`
- src/components/cfb/CfbSharp.tsx:390 — `EV, grade and stake are all at the selected book&apos;s own quote at its own line (re-priced when its line differs from the consensus). Other books only`
- src/components/cfb/CfbSharp.tsx:391 — `inform the consensus and the &quot;best&quot; column.`
- src/components/football/FootballModelExplorer.tsx:14 — `…eHeader title="Simulator" eyebrow={L.label} sub={'${L.short} pregame Model explorer · consensus lines + ESPN ratings. Football uses a margin model; the baseball Monte Carlo simulat…`
- src/components/ledger/ReceiptsPanel.tsx:41 — `<th className="py-1 pr-2">vs consensus fair</th>`
- src/components/mlb/SharpDesk.tsx:14 — `/* ENGINE V2 · sharp desk — Shin de-vig + Pinnacle/exchange-weighted consensus`
- src/components/mlb/SharpDesk.tsx:16 — `a green number means selected book is beating the sharp consensus price. */`
- src/components/mlb/SharpDesk.tsx:70 — `? "Fair price = sharp-consensus with the longshot bias stripped; EV is at the DK/FD basis (bold), selected book in gold settles. Pure market read — the quant board …`
- src/components/mlb/SharpDesk.tsx:71 — `: "Fair price = sharp-consensus with the longshot bias stripped; EV is at the selected book line. Pure market read — the quant board above is the model view."}`
- src/components/mlb/SharpDesk.tsx:82 — `<Panel><ErrorState title="Sharp consensus unavailable" onRetry={() => q.refetch()} /></Panel>`
- src/components/mlb/SharpDesk.tsx:110 — `<span className="text-text" title="DK/FD basis at the consensus point">`
- src/components/mlb/SharpDesk.tsx:145 — `Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a`
- src/components/mlb/SharpDesk.tsx:146 — `sharp book posted show the retail consensus and say so. Informational only, not betting advice.`
- src/components/mlb/SimDesk.tsx:8 — `markets: game totals (model blended 30/70 with the de-vigged consensus, EV at`
- src/components/props/GenSheet.tsx:698 — `market consensus — the toggle would empty the pool and explain nothing. */`
- src/components/stats/CalibrationPanel.tsx:122 — `…global shrink applied — pooled reliability slope {s.globalShrink.slopeBefore != null ? s.globalShrink.slopeBefore.toFixed(2) : "—"} over {s.globalShrink.n} consensus-logged rows</>`
- src/components/stats/CalibrationPanel.tsx:126 — `toward the de-vigged consensus (confidence ×{s.globalShrink.s.toFixed(2)}) — backtested pooled`
- src/components/stats/CalibrationPanel.tsx:155 — `<th className="pb-2 text-right" title="Consensus-only baseline Brier over the same records — Lower is better; a point-estimate improvement still needs validation …`
- src/components/stats/CalibrationPanel.tsx:190 — `className={pm.mktCmp.model < pm.mktCmp.consensus ? "text-pos" : "text-muted"}`
- src/components/stats/CalibrationPanel.tsx:191 — `title={'Model ${pm.mktCmp.model.toFixed(3)} vs consensus ${pm.mktCmp.consensus.toFixed(3)} over the same ${pm.mktCmp.n} records'}` [x2]
- src/components/stats/CalibrationPanel.tsx:193 — `{pm.mktCmp.consensus.toFixed(3)}`
- src/components/stats/CalibrationPanel.tsx:194 — `{pm.mktCmp.model < pm.mktCmp.consensus ? " ▲" : ""}`
- src/components/stats/CalibrationPanel.tsx:246 — `a stronger reduction. None of these mechanisms raises model weight above its shipped default. <b className="text-muted">vs market</b> is the consensus-only`
- src/components/stats/ClvPanel.tsx:160 — `<th className="pb-2 text-right" title="100 × (closing consensus fair − locked consensus fair); positive = we beat the close">` [x2]
- src/components/stats/DisciplinePanel.tsx:100 — `FUN never faces the EV gate, the settlement floor or the consensus gates, so its rows are shown apart`
- src/components/ufc/UfcBoard.tsx:64 — `header: "Consensus %",`
- src/components/ufc/UfcBuilder.tsx:19 — `Same market math as the Board's UFC desk (consensus = de-vigged median`
- src/components/ufc/UfcBuilder.tsx:226 — `True % is the de-vigged consensus across every US book in the feed — no fight model. Different fights are`
- src/components/ufc/UfcProps.tsx:13 — `anchors fighter totals to the 7-book moneyline consensus, and shows every`
- src/components/ufc/UfcProps.tsx:74 — `/* anchor fighter totals to the multi-book ML consensus when we can */`
- src/components/ufc/UfcProps.tsx:116 — `de-vigs it{fights.length > 0 ? ", anchors it to the 7-book moneyline consensus," : ""} and prices every`
- src/components/ufc/UfcProps.tsx:198 — `{calc.anchored && <span className="ml-2 text-pos">· anchored to ML consensus</span>}`
- src/components/ufc/UfcProps.tsx:205 — `{" "}with a fight selected on Method, fighter totals are re-anchored to the multi-book moneyline consensus —`
- src/components/ufc/UfcSharp.tsx:16 — `consensus, no fight model), framed as a daily card: overview, value spots,`
- src/components/ufc/UfcSharp.tsx:52 — `? '${d.fights.length} fights left on ${d.eventName ?? "the card"}. Consensus across every US book prices this ' +`
- src/components/ufc/UfcSharp.tsx:53 — `'card ${posCount === 0 ? "tight — no selected book line beats the market right now" : 'with ${posCount} selected book line${posCount === 1 ? "" : "s"} above consensus'}. ' +`
- src/components/ufc/UfcSharp.tsx:62 — `<div className="text-[11px] text-muted">Market read only — de-vigged 7-book consensus vs the selected book line</div>`
- src/components/ufc/UfcSharp.tsx:103 — `<span className="text-text">{fmtPct(s.side.prob!)} consensus</span>`
- src/components/ufc/UfcSharp.tsx:123 — `Consensus says {fmtPct(trap.side.prob!)} — selected book&apos; price gives up{" "}`
- src/components/ufc/UfcSharp.tsx:175 — `the median is the consensus &quot;true&quot; probability. selected book&apos; price is then judged against it —`
- src/components/ui/OddsGrid.tsx:32 — `/** bet % · money % for this side (scoresandodds consensus), drawn as a third line under the price */`
- src/components/ui/OddsGrid.tsx:86 — `…me="odds-cell-split num" data-splits-chip title={'${cell.split.bets}% of bets · ${cell.split.money}% of the money on this side (consensus via scoresandodds.com / Action Network)'}>`
- src/components/ui/SplitsChip.tsx:5 — `* the share of the handle (scoresandodds / Action Network consensus). Green when the money share`
- src/components/ui/SplitsChip.tsx:8 — `* a player prop, or a game the consensus page does not carry, shows no chip.`
- src/components/ui/SplitsChip.tsx:14 — `…st title = '${split.bets}% of bets and ${split.money}% of the money are on this side (consensus via scoresandodds.com / Action Network)${gap >= 5 ? " — the money is heavier than th…`

##### consensus — tests (180 lines)

- tests/a1-shade.test.ts:65 — `// gate OPEN (~08-06 state): mktN at proven counts so the consensus branch never`
- tests/a1-shrink.test.ts:33 — `* CONTEXT THE NUMBERS SIT IN: leg est is ALREADY blended 35% model / 65% consensus for`
- tests/a1-shrink.test.ts:34 — `* props (SH_W, legacy) — λ here composes on top; λ=1 ≡ pure consensus fair. At λ=1,`
- tests/a1-shrink.test.ts:35 — `* ticket EV at the CZ price equals the consensus-at-CZ EV (consCzEv) — line-shopping`
- tests/a1-shrink.test.ts:183 — `} · pool ${pool0.length} tickets · legs already 35% model / 65% consensus (SH_W props)\n${"=".repeat(90)}' +`
- tests/a1-shrink.test.ts:229 — `' — these are consensus-at-CZ EVs (line-shopping dispersion), NOT model edge; max ${Math.max(...evs).toFixed(1)}%',`
- tests/accrual-volume.test.ts:12 — `* consensus too, which is what a NO-PLAY day is made of. Its accrual rate therefore sets the`
- tests/arming-parity.test.ts:66 — `it("derives mktN (the consensus gate's input) from the reliability counts", () => {`
- tests/arming-parity.test.ts:240 — `it("mktN — the consensus gate's input — comes from the 45-day window", () => {`
- tests/arming-parity.test.ts:242 — `// and n over consMinN is what stops the small-sample consensus gate applying`
- tests/autopsy-floors.test.ts:8 — `- small-sample consensus gate: a ticket touching a market with <100 graded ledger`
- tests/autopsy-floors.test.ts:9 — `legs also needs de-vigged consensus EV ≥ −1% at the basis`
- tests/autopsy-floors.test.ts:106 — `describe("small-sample consensus gate — unproven markets need the market on side", () => {`
- tests/autopsy-floors.test.ts:111 — `it("an ML ticket (64 graded legs) with consensus EV −5% is refused", () => {`
- tests/autopsy-floors.test.ts:114 — `expect(a.blocked?.[0]).toMatchObject({ name: "MLFade", reason: "consensus" });`
- tests/autopsy-floors.test.ts:116 — `it("the same ticket at consensus EV −0.5% (≥ −1%) plays", () => {`
- tests/autopsy-floors.test.ts:120 — `it("a proven market (hits, 290 legs) is exempt — consensus may disagree", () => {`
- tests/autopsy-floors.test.ts:127 — `expect(a.blocked?.[0]?.reason).toBe("consensus");`
- tests/autopsy-floors.test.ts:129 — `it("ev_gated mode (2026-07-22 default): the same gate reads the consensus at the CZ price", () => {`
- tests/autopsy-floors.test.ts:140 — `expect(a.blocked?.[0]).toMatchObject({ name: "CzFade", reason: "consensus" });`
- tests/autopsy-floors.test.ts:142 — `it("a ticket with NO consensus read is never blocked by it — absence can't disagree", () => {`
- tests/blend-sweep.test.ts:10 — `* The shipped leg est is final = w0·model + (1−w0)·consensus (SH_W: props .35,`
- tests/blend-sweep.test.ts:203 — `'\n a −12.9 mean lies BEYOND the market (truth below the CONSENSUS itself).',`
- tests/board-overview-toggle.test.ts:28 — `"Engine v2 — consensus de-vigged probability vs the Caesars line; 10k-path sims on every pick; TOP 50 ranks on EV gated at the selection mode. " +`
- tests/board-overview-toggle.test.ts:75 — `expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"[^>]*>Engine v2 — consensus/);`
- tests/books-ind-gate.test.ts:7 — `* booksInd — "no independent consensus ⇒ NOT ELIGIBLE", at ANY mktN (2026-07-26).`
- tests/books-ind-gate.test.ts:77 — `it("BLOCKS a ticket whose leg has booksInd === 0, with reason no_ind_consensus", () => {`
- tests/books-ind-gate.test.ts:80 — `expect(blockedReasons(r)).toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:87 — `expect(blockedReasons(r)).not.toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:98 — `// the small-sample consensus gate is switched OFF at this mktN...`
- tests/books-ind-gate.test.ts:103 — `expect(blockedReasons(blocked)).toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:108 — `// booksInd 1 + a consensus read that would FAIL consMinEv, but the market is proven,`
- tests/books-ind-gate.test.ts:117 — `expect(blockedReasons(r)).toContain("consensus");`
- tests/books-ind-gate.test.ts:118 — `expect(blockedReasons(r)).not.toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:124 — `expect(blockedReasons(run(eng(), [t]))).toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:130 — `expect(blockedReasons(run(eng(), [ticket(null)]))).not.toContain("no_ind_consensus");`
- tests/books-ind-gate.test.ts:135 — `expect(blockedReasons(r)).not.toContain("no_ind_consensus");`
- tests/calibration.test.ts:184 — `describe("upgrade 03: model vs consensus Brier over the same records (mktCmp)", () => {`
- tests/calibration.test.ts:185 — `it("hand-computed: model beats the consensus when its probabilities are sharper", () => {`
- tests/calibration.test.ts:187 — `// model said 70, consensus 55, it won: model sq (.3)^2=.09, consensus (.45)^2=.2025` [x2]
- tests/calibration.test.ts:189 — `// model said 60, consensus 50, it lost: model .36, consensus .25` [x2]
- tests/calibration.test.ts:200 — `expect(pm.mktCmp!.consensus).toBeCloseTo((0.2025 + 0.25) / 2, 10);`
- tests/calibration.test.ts:202 — `it("no consensus anywhere -> mktCmp null, everything else unchanged", () => {`
- tests/calibration.test.ts:234 — `// model BELOW consensus but still +EV at Caesars: a real combination, and the two`
- tests/cfb-h1.test.ts:96 — `describe("parseH1 — the per-event first-half consensus", () => {`
- tests/cfb-model.test.ts:111 — `it("every game with an ML consensus has pHome in (0,1); every game has spread + total rows", () => {`
- tests/cfb-model.test.ts:189 — `it("quotes sit at the BOOK'S OWN line; 'best' only among books at the consensus line", () => {`
- tests/cfb-model.test.ts:191 — `const nt = row(iu, "North Texas +40.5"); // consensus line +40.5 (fixture: DK/FD 40.5, Caesars 39.5, Pinnacle 41)`
- tests/cfb-model.test.ts:235 — `* consensus line = median home point = −28 (both books).`
- tests/cfb-model.test.ts:263 — `// evBest: the best price at the consensus line among the two books — ECU +28: Caesars −106 beats Pinnacle −109`
- tests/cfb-model.test.ts:273 — `* weighted median → μT_pin (w2). consensus total = 52.5 (both books).`
- tests/cfb-model.test.ts:436 — `it("one book at a line is below minBooks → that market has no consensus", () => {`
- tests/cfb-props-ui.test.ts:70 — `// for CZ alone at 249.5 against a 245.5 consensus, so the slip must not price that leg either`
- tests/cfb-props.test.ts:137 — `it("de-vigs each book's pair and takes the equal-weight median at the consensus line", () => {`
- tests/cfb-props.test.ts:139 — `// Caesars sits alone at 249.5. Consensus line = median(249.5, 245.5, 245.5, 245.5) = 245.5.`
- tests/cfb-props.test.ts:158 — `it("best = highest decimal among the books at the consensus line, with EV there", () => {`
- tests/cfsel-guard.test.ts:56 — `proven counts is the ~08-06 state (the consensus gate is not what this guard`
- tests/chain-tools.test.ts:219 — `it("reopen: consensus blocks and mktN are read together", () => {`
- tests/chain-tools.test.ts:221 — `{ blocked: [{ reason: "consensus", type: "pitcher_strikeouts" }, { reason: "nv_tax", type: "ml" }] },`
- tests/chain-tools.test.ts:224 — `expect(r.byReason.consensus).toBe(1);`
- tests/clv-core.test.ts:79 — `describe("sightProp — Caesars close + hand-computed consensus fair", () => {`
- tests/clv-core.test.ts:112 — `expect(s.consensusFair).toBeCloseTo(HAND_FAIR, 10);`
- tests/clv-core.test.ts:117 — `expect(sightProp(ev, uLeg, 0)!.consensusFair).toBeCloseTo(1 - HAND_FAIR, 10);`
- tests/clv-core.test.ts:134 — `expect(s.consensusFair).toBeNull(); // one real book is not a consensus` [x2]
- tests/clv-core.test.ts:169 — `expect(s.consensusFair).toBeCloseTo((f1 + f2) / 2, 10);`
- tests/clv-core.test.ts:199 — `"Jake Mangum (PIT)|Hits O 0.5": { am: -230, at: 1, consensusFair: 0.68 },`
- tests/clv-core.test.ts:209 — `const first = applySights(entry(), { L: { am: -200, at: 1, consensusFair: null } }).entry;`
- tests/clv-core.test.ts:210 — `const second = applySights(first, { L: { am: -220, at: 2, consensusFair: 0.7 } });`
- tests/clv-core.test.ts:213 — `const noop = applySights(second.entry, { L: { am: -220, at: 2, consensusFair: 0.7 } });`
- tests/clv-report.test.ts:13 — `clv: Record<string, { am: number; at: number; consensusFair?: number | null }>,`
- tests/clv-report.test.ts:45 — `"A. Over|Hits O 0.5": { am: -170, at: 5, consensusFair: 0.43 },`
- tests/clv-report.test.ts:46 — `"B. Under|K's U 5.5": { am: 120, at: 6, consensusFair: 0.52 },`
- tests/clv-report.test.ts:73 — `"NoImp|TB O 1.5": { am: -120, at: 1, consensusFair: 0.5 },`
- tests/clv-report.test.ts:74 — `"NoCz|HR O 0.5": { am: 300, at: 2, consensusFair: 0.24 },`
- tests/clv-report.test.ts:91 — `{ "A|Hits O 0.5": { am: -150, at: 1, consensusFair: 0.42 } },`
- tests/clv-report.test.ts:97 — `e1.clv = { ...e1.clv, "F|HR O 0.5": { am: 300, at: 2, consensusFair: 0.25 } } as never;`
- tests/clv-report.test.ts:101 — `{ "B|K's U 5.5": { am: 100, at: 3, consensusFair: 0.53 } },`
- tests/clv-report.test.ts:125 — `['${label}|Hits O 0.5']: { am: -120, at: 1, consensusFair: close },`
- tests/dkfd-basis.test.ts:10 — `(tie → DK). Caesars is display + settlement only. The consensus fair probability`
- tests/engine2-allstar.test.ts:19 — `books that exercise every path: consensus, CZ-only F3, modal-point split,`
- tests/engine2-allstar.test.ts:96 — `it("ML consensus lands where the books say (AL a small dog)", () => {`
- tests/engine2-devig.test.ts:7 — `consensusProb,`
- tests/engine2-devig.test.ts:59 — `it("consensus weights the sharp book", () => {`
- tests/engine2-devig.test.ts:66 — `const c = consensusProb(books, "shin")!;`
- tests/fixtures/baseline-armed-v1.json:1 — `…"-162",66.9,8.3,58.8,8.1,null,null,-162,8.3,0.02,"confirmed",null,"opp-offense,sv-pct,consensus,market-gap"],["Luinder Avila (KC)","Pitcher K's O 4.5","+112",50.1,6.3,44.2,5.9,null…` [long line; 107 occurrences on this line; first shown]
- tests/fixtures/baseline-armed-v2-singles.json:1 — `…"-162",66.9,8.3,58.8,8.1,null,null,-162,8.3,0.02,"confirmed",null,"opp-offense,sv-pct,consensus,market-gap"],["Luinder Avila (KC)","Pitcher K's O 4.5","+112",50.1,6.3,44.2,5.9,null…` [long line; 107 occurrences on this line; first shown]
- tests/fixtures/consensus-mlb.html:1 — `<!-- trimmed real scoresandodds.com consensus markup, saved 2026-09-18; first 12 cards -->`
- tests/fixtures/consensus-mlb.html:3 — `<div class="trend-card consensus consensus-table-moneyline--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class=…` [x4]
- tests/fixtures/consensus-mlb.html:7 — `<div class="trend-card consensus consensus-table-spread--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-fla…` [x4]
- tests/fixtures/consensus-mlb.html:13 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-mlb.html:19 — `<div class="trend-card consensus consensus-table-moneyline--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class=…` [x4]
- tests/fixtures/consensus-mlb.html:23 — `<div class="trend-card consensus consensus-table-spread--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-fla…` [x4]
- tests/fixtures/consensus-mlb.html:29 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-mlb.html:35 — `<div class="trend-card consensus consensus-table-moneyline--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class=…` [x4]
- tests/fixtures/consensus-mlb.html:39 — `<div class="trend-card consensus consensus-table-spread--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-fla…` [x4]
- tests/fixtures/consensus-mlb.html:45 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-mlb.html:51 — `<div class="trend-card consensus consensus-table-moneyline--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class=…` [x4]
- tests/fixtures/consensus-mlb.html:55 — `<div class="trend-card consensus consensus-table-spread--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-fla…` [x4]
- tests/fixtures/consensus-mlb.html:61 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:1 — `<!-- trimmed real scoresandodds.com consensus markup, saved 2026-09-18; first 15 cards -->`
- tests/fixtures/consensus-ncaaf.html:3 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-ncaaf.html:7 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-ncaaf.html:13 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:19 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-ncaaf.html:23 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-ncaaf.html:29 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:37 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-ncaaf.html:43 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:49 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-ncaaf.html:53 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-ncaaf.html:59 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:65 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-ncaaf.html:69 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-ncaaf.html:75 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-ncaaf.html:81 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-nfl.html:1 — `<!-- trimmed real scoresandodds.com consensus markup, saved 2026-09-18; first 12 cards -->`
- tests/fixtures/consensus-nfl.html:3 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-nfl.html:7 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-nfl.html:13 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-nfl.html:19 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-nfl.html:23 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-nfl.html:29 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-nfl.html:35 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-nfl.html:39 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-nfl.html:45 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/fixtures/consensus-nfl.html:51 — `<div class="trend-card consensus consensus-table-moneyline--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-…` [x4]
- tests/fixtures/consensus-nfl.html:55 — `<div class="trend-card consensus consensus-table-spread--0 active" data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="te…` [x4]
- tests/fixtures/consensus-nfl.html:61 — `<div class="trend-card consensus consensus-table-total--0 " data-group="consensus-table--0"> <div class="event-header"> <div class="team-pennant left small"> <span class="team-flag…` [x4]
- tests/football-gen.test.ts:186 — `it("Caesars alone at 249.5 against a 245.5 consensus: no fair at that line, so no leg", () => {`
- tests/football-gen.test.ts:187 — `/* the fixture's real shape: Caesars posts -110 at 249.5 while the consensus line is 245.5,`
- tests/football-gen.test.ts:248 — `/* market-sourced, every one of them: the win % is the de-vigged consensus of the books`
- tests/football-gen.test.ts:549 — `const NOTE = "Every win % here is the de-vigged consensus of the books that posted the line; the EV beside it is measured against the one price you would take.";`
- tests/football-ladders.test.ts:47 — `it('keeps unavailable books and insufficient consensus ungraded',()=>{`
- tests/gate-rebuild.test.ts:7 — `* market's graded count, mktN feeds the small-sample consensus gate, so for a`
- tests/gate-rebuild.test.ts:85 — `* Under 'consMinN' a market's tickets must ALSO clear the de-vigged consensus, which is what`
- tests/helpers/settle-book.ts:6 — `* the prices every hand-computed number was worked from, and the consensus set (the same prices,`
- tests/ledger-segments.test.ts:11 — `// day 1 (override day): two hits legs, one sighted with consensus fair`
- tests/ledger-segments.test.ts:33 — `clv: { "A One|Hits O 0.5": { am: -250, at: 1, consensusFair: 0.72 } }, // B Two unsighted`
- tests/ledger-segments.test.ts:60 — `clv: { "Cleveland Guardians|ML vs PIT": { am: -160, at: 2, consensusFair: null } },`
- tests/ledger-segments.test.ts:82 — `// consensus-fair grading: 72% fair vs 66.667% locked = +5.333 pts`
- tests/ledger-segments.test.ts:87 — `expect(ml.fairPts).toBeNull(); // sighting had no consensus stored`
- tests/legacy-harness/int39a.js:35 — `chk("multi-book ML consensus present",multiML>0,multiML+" games with 2+ books de-vigged");`
- tests/legacy-harness/int39a.js:42 — `chk("multi-book prop consensus",multiProp>20,multiProp+" rows from 2+ books");`
- tests/legacy-harness/int39a.js:56 — `var consTag=top.filter(function(r){return r.tags.indexOf("consensus")>=0;}).length;`
- tests/legacy-harness/int39a.js:57 — `chk("consensus tag flows through",consTag>0,consTag+"/50");`
- tests/legacy-harness/int40cz.js:16 — `Caesars price from batter_hits_alternate; consensus and best price stay untouched`
- tests/legacy-harness/int40cz.js:25 — `chk("alternate never enters consensus (books count = standard books only)",altBooks.every(function(b){return b>=1&&b<=2;}),"books counts: "+altBooks.slice(0,6).join(","));`
- tests/nfl-engine.test.ts:127 — `transform: the raw synthetic slate is priced at the consensus and seats NO core ticket (a read`
- tests/nfl-engine.test.ts:145 — `it("the raw synthetic slate is priced at the consensus: no side clears +2 % EV, so no core ticket — only the $25 fun parlay", () => {`
- tests/nfl-engine.test.ts:156 — `it("with Caesars 8 % better than the consensus the engine seats core tickets and the fun parlay", () => {`
- tests/nfl-engine.test.ts:168 — `// prob is the model's win probability at the Caesars line (re-evaluated when cz's line differs from the consensus)`
- tests/nfl-pages.test.ts:121 — `expect(src).toMatch(/\{ sport: "nfl", blurb: "Consensus lines \+ ESPN FPI · ML, spread, total · own ledger & bank · Sundays, TNF, MNF" \}/);`
- tests/prediction-idempotency.test.ts:26 — `* the consensus gate the Phase 1 banner exists to explain.`
- tests/predictions.test.ts:7 — `pick with its true/model/consensus probabilities and blend weight — from a`
- tests/predictions.test.ts:35 — `// blend metadata present on rows the engine priced with a consensus`
- tests/prop-board.test.ts:151 — `/* ---- Caesars milestone ladders ("2+ hits") — real posted lines the consensus`
- tests/prop-lean.test.ts:16 — `* LINES with no percentages; Covers and Action Network publish game-market consensus only), so the`
- tests/reliability.test.ts:18 — `/** n legs stated at p% with exactly 'won' winners; consensus pMkt logged. */`
- tests/reliability.test.ts:28 — `stated deviations are exactly 2x the real ones (true slope 0.5). Consensus`
- tests/reliability.test.ts:94 — `it("refuses to act below 150 consensus-logged legs", () => {`
- tests/shrink.test.ts:10 — `* Every leg prob is blended toward the de-vigged consensus 'imp'; the ticket prob scales`
- tests/singles-counterfactual.test.ts:25 — `* consensus branch never fires. That is not a hack: it is exactly the state the engine`
- tests/singles-counterfactual.test.ts:44 — `* consensus branch, greedy selection, the leg/game dedupe, the K's rules, 1/4-Kelly sizing,`
- tests/singles-counterfactual.test.ts:197 — `run(selRows, cfgOpen, "A1. THE 37 SELECTED LEGS AS SINGLES — consensus gate OPEN (~08-06 state)");`
- tests/singles-counterfactual.test.ts:572 — `// disables the EV floor and the consensus gate at the same time, which confounds it.`
- tests/singles-counterfactual.test.ts:646 — `// ---- the per-leg consensus bar, stated directly -------------------------`
- tests/singles-vintage.test.ts:26 — `* | consensus gate (consMinN) | YES | per-market, leg-count-blind |`
- tests/splits.test.ts:4 — `import { findGameSplits, mlbLegSplit, parseConsensus, sideSplit, splitText, teamKeys } from "../src/lib/splits";`
- tests/splits.test.ts:7 — `* BETTING SPLITS (2026-09-18) — the parser reads REAL scoresandodds.com consensus markup saved on`
- tests/splits.test.ts:8 — `* 2026-09-18 (tests/fixtures/consensus-*.html, trimmed to the first cards) and every number below`
- tests/splits.test.ts:14 — `describe("splits — parseConsensus reads the page's own bars", () => {`
- tests/splits.test.ts:15 — `const nfl = parseConsensus(fx("consensus-nfl.html"), "nfl");` [x2]
- tests/splits.test.ts:30 — `const mlb = parseConsensus(fx("consensus-mlb.html"), "mlb");` [x2]
- tests/splits.test.ts:39 — `const ncaaf = parseConsensus(fx("consensus-ncaaf.html"), "ncaaf");` [x2]
- tests/splits.test.ts:44 — `expect(parseConsensus("<html><body>nope</body></html>", "nfl")).toEqual([]);`
- tests/splits.test.ts:45 — `expect(parseConsensus('<div class="trend-card consensus consensus-table-spread--0"><div class="event-header"></div></div>', "nfl")).toEqual([]);` [x3]
- tests/splits.test.ts:50 — `const nfl = parseConsensus(fx("consensus-nfl.html"), "nfl");` [x2]
- tests/splits.test.ts:81 — `const feed = { games: parseConsensus(fx("consensus-mlb.html"), "mlb") };` [x2]
- tests/splits.test.ts:104 — `it("the chip renders nothing without a split and names the consensus source in its title", () => {`
- tests/supplemental.test.ts:284 — `expect(s.consensusFair).not.toBeNull(); // >=2 books de-vigged`

##### consensus — docs (211 lines)

- CLAUDE.md:20 — `> desk in src/lib/ufc.ts + src/components/ufc/: 7-book de-vig consensus vs CZ moneyline, ESPN records,`
- CLAUDE.md:42 — `> HR-anytime-parlay suspended from auto-selection; <100-graded-leg markets need consensus-fair EV ≥ −1%;`
- CLAUDE.md:44 — `> consensus-fair floor, the EV gate and the settlement floor — applies ONLY inside the disciplined`
- CLAUDE.md:101 — `- **Market layer**: every posted book de-vigged multiplicatively ('shDevig2'), consensus = median ('shMedian') — game odds carry 'home_fair'/'home_rl_fair'/'ml_books', prop rows …`
- CLAUDE.md:104 — `- **Edge engine**: 'final = SH_W·model + (1−SH_W)·consensus' ('SH_W={props:.35,ml:.15,rl:.15}'); **EV at best price** on every pick; **EDGE badge** when EV ≥ 'SH_EDGE_MIN' (4% pr…`
- CLAUDE.md:109 — `… % / money % come ONLY from 'src/lib/splits.ts' + '/api/splits' (public scoresandodds consensus, 10-min cache, HTTP 200 with 'games: []' on failure) through 'SplitsChip' — never ty…`
- CLAUDE.md:160 — `…Corr/negCorr'. Cards display/stake Caesars prices only (probabilities stay multi-book consensus); picks/tickets Caesars doesn't price sit in collapsed "Not at Caesars" strips ('una…` [x2]
- CLAUDE.md:964 — `- **'consMinN' (100) only bites while a market is unproven** — so the small-sample consensus`
- CLAUDE.md:970 — `- **'batter_home_runs' has 'n = 0' (no de-vigged consensus) on 100% of 4,524 rows** — it is`
- CLAUDE.md:1002 — `consensus (0.215). 'Lipg' was the prime suspect and is **exonerated** — recovered in closed`
- CLAUDE.md:1237 — `market must also clear the de-vigged consensus — that is what blocked all 18 tickets on`
- CLAUDE.md:1545 — `## Consensus depth rises toward first pitch — but thinness does not move`
- CLAUDE.md:1549 — `at every horizon**, so it does not fix thin consensus. 'booksInd == 0' baseline on the 16:46 UTC`
- CLAUDE.md:1572 — `Only consensus depth moves — mean 'n' 1.40 → 1.66, 'czf' 2.2% → 0.3% — and it moves so that the`
- ENGINE2.md:46 — `consensus for ML/RL/props, us+eu game-odds regions. Dormant = byte-identical to`
- ENGINE2.md:79 — `median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in`
- ENGINE2.md:84 — `- Consensus weighted toward **Pinnacle** (confirmed available in the 'eu' region for MLB;`
- ENGINE2.md:104 — `- NEXT for the harness: store model-vs-consensus probability decomposition on locked legs`
- ENGINE2.md:193 — `swing-off deciding the WINNER only) is CALIBRATED to reproduce the consensus ML`
- ENGINE2.md:246 — `current Caesars price + the de-vigged multi-book consensus fair`
- ENGINE2.md:247 — `('clv[lid] = {am, at, consensusFair}'). Odds go through our own '/api/odds' proxy (shared`
- ENGINE2.md:256 — `(implied(close) − implied(locked); 'fairPts' grades vs the consensus close), segmented by`
- ENGINE2.md:266 — `'perMarket.mktCmp = {n, model, consensus}' — model vs consensus-only Brier over the SAME` [x2]
- ENGINE2.md:268 — `Brier beats the consensus: that's the earn-a-raise signal; until then shrink-only stands.`
- ENGINE2.md:323 — `consensus remains the model's probability anchor. dk_fd swaps the price the model`
- ENGINE2.md:328 — `1. One-sided markets (anytime HR — no opposite side to de-vig, so no true consensus`
- ENGINE2.md:366 — `the consensus point, 'basisPick' (better payout, tie → DK) shared rule, EV judged at`
- ENGINE2.md:483 — `rank by engine true % (consensus-anchored); Caesars prices/sizes only, never chooses; picks`
- ENGINE2.md:509 — `4. **Small-sample consensus gate** — a ticket touching any market with <'consMinN:100'`
- ENGINE2.md:511 — `time; missing store ⇒ every market small) must also carry de-vigged consensus-fair EV`
- ENGINE2.md:513 — `reason 'consensus' → Builder chip "consensus disagrees".` [x2]
- PARLAY_LAB_QUANT_ENGINE.md:6 — `> percentiles, Shin de-vig + Pinnacle-weighted consensus, ump/weather/bullpen`
- PARLAY_LAB_QUANT_ENGINE.md:14 — `…y beats the market's de-vigged probability by more than our uncertainty.** The market consensus is the smartest baseline on earth — we anchor to it and only deviate when the model …`
- PARLAY_LAB_QUANT_ENGINE.md:35 — `[Odds Snapshots] → [Market Layer: de-vig + consensus] → [Edge Engine]`
- PARLAY_LAB_QUANT_ENGINE.md:49 — `/market # odds math, de-vig, consensus, line shopping, snapshots`
- PARLAY_LAB_QUANT_ENGINE.md:89 — `- **Consensus probability:** de-vig per book, then aggregate across books (median or weighted mean; make weighting configurable so sharper books can be up-weighted later).`
- PARLAY_LAB_QUANT_ENGINE.md:93 — `**Deliverable:** 'market.consensus(game, market)' returns fair probability + per-book prices, fully tested against hand-computed fixtures.`
- PARLAY_LAB_QUANT_ENGINE.md:129 — `- **Blend with the market:** 'final_prob = w × model_prob + (1 − w) × consensus_prob'. Fit 'w' per market type by out-of-sample log loss. Expect small w (~0.2–0.4) for props and sm…`
- PARLAY_LAB_QUANT_ENGINE.md:149 — `- **Metrics:** log loss & Brier vs. market baseline (the model must beat de-vigged consensus on held-out data or it earns w = 0), calibration/reliability curves per market, ROI (fl…`
- PARLAY_LAB_QUANT_ENGINE.md:158 — `…r: every recommendation and every placed bet (market, line, book, price, stake, model/consensus/blended prob, timestamp) with automatic grading from box scores, correct void handli…`
- PARLAY_LAB_QUANT_ENGINE.md:174 — `…d (JSON → UI) contains, per pick: player/team, market & line, best book & price (plus consensus price), model prob, market prob, blended prob, fair odds, EV%, edge-source tags (e.g…`
- PARLAY_LAB_QUANT_ENGINE.md:189 — `2. Market consensus is the prior; the model must EARN deviation weight out-of-sample.`
- PARLAY_LAB_QUANT_ENGINE.md:198 — `- [ ] De-vig/consensus layer passes hand-computed test fixtures`
- docs/cfb-desk.md:38 — `3. Consensus per market = weighted median across books (Pinnacle ×2); null under 'minBooks'.`
- docs/cfb-desk.md:40 — `5. Each 'CfbRow' prices its side at the consensus line ('fair', 'push', 'fairAm'), then quotes every book at the book's OWN line with EV re-evaluated there — that is why a Games ca…` [x3]
- docs/cfb-desk.md:94 — `…cfb/props.ts' ('parseEventProps'): O/U pairs devigged per book at the same point; the consensus line is the weighted median of posted lines (always a posted line); fair = the true …`
- docs/cfb-desk.md:105 — `…; a prop leg reaches the slip only when the row has a fair price and Caesars' line equals the consensus line ('propLegOf'), so the slip never prices one line while showing another.`
- docs/cfb-desk.md:141 — `… the model-only toggle is hidden because every football win % is the de-vigged market consensus ('src: "market"'), so the toggle would empty the pool; and the note says that rather…` [long line; 1 occurrences on this line; first shown]
- docs/clv.md:25 — `| 'imp' | the de-vigged multi-book consensus fair probability at lock (percent, oriented to the side we bet) |`
- docs/clv.md:35 — `| 'consensusFair' | the de-vigged multi-book consensus fair probability at that sighting, same side |` [x2]
- docs/clv.md:45 — `- **Fair points** = '100 × (closing consensusFair − locked imp)'. Fair-vs-fair, so vig`
- docs/clv.md:46 — `is out of the comparison entirely. Positive = the consensus moved toward our side`
- docs/clv.md:59 — `locked 'imp' + closing 'consensusFair' for fair points; locked 'cz' + closing 'am' for`
- docs/collection-period.md:35 — `> every consensus reopen, and the parameter exit (~13,500).`
- docs/collection-period.md:47 — `> **Scope: the consensus-reopen tables were already correct at 35/day; only the Phase-2 ICC block`
- docs/collection-period.md:87 — `> **reading 29's instrument** — the consensus-gate crossing. So the reopen clock is read off a`
- docs/collection-period.md:519 — `shrink-only (it can only pull the model TOWARD the de-vigged consensus, never away),`
- docs/collection-period.md:569 — `zero, so the small-sample consensus gate is strict and H+R+RBI is unlikely to be`
- docs/collection-period.md:577 — `significance at 20–50 legs by measuring bias against the closing consensus instead`
- docs/collection-period.md:585 — `sample that included FUN, from before the ev_gated default and before the consensus`
- docs/collection-period.md:623 — `| 'consMinN' / 'consMinEv' | '100' / '−1' (%) | markets under 100 graded legs also need consensus-fair EV ≥ −1% |`
- docs/collection-period.md:740 — `**Mechanism:** the de-vigged consensus is priced against Caesars, whose measured overround is`
- docs/collection-period.md:742 — `'consMinEv ≥ −1%' asks the consensus to price a ticket at near-zero vig against the`
- docs/collection-period.md:791 — `| 'SH_W' | 'props .35 · ml .15 · rl .15' | model weight vs de-vigged consensus — **ANNOTATED 2026-07-29 (owner's item 3)**: swept in-loop on the archived board ('tests/blend-sweep.…`
- docs/collection-period.md:839 — `artifact and the 31-book ML consensus depth are properties of the *game* markets alone and`
- docs/collection-period.md:860 — `'shAllocate' (legacy/index.html, the small-sample consensus gate) — and the cron never`
- docs/collection-period.md:885 — `| adjustment cap | ±10% per week, shrink-only (toward consensus) |`
- docs/collection-period.md:940 — `Measured: the "de-vigged multi-book consensus" behind a prop row is often thin, and on some`
- docs/collection-period.md:941 — `rows the settlement book is inside its own consensus — so the independent check on Caesars`
- docs/collection-period.md:968 — `2. **The dominant hole is 'n = 0' — no consensus fair at all**, because the market is`
- docs/collection-period.md:970 — `there has never been a de-vigged HR consensus in this dataset. For those rows the engine`
- docs/collection-period.md:972 — `with a flat 6% haircut, so the "independent consensus" for such a row is the row's own`
- docs/collection-period.md:976 — `HR**: the consensus gate lives in 'shAllocate', 'coreNoHR' keeps HR off core, and FUN does`
- docs/collection-period.md:988 — `**no independent consensus ⇒ NOT ELIGIBLE in an unproven market.**`
- docs/collection-period.md:1007 — `- **A counter crossing silently NARROWS it.** The moment 'mktN[m] ≥ 100', the consensus`
- docs/collection-period.md:1053 — `Then the gate (L2877–2890) blocks, reason 'no_ind_consensus'. This changes selection, so it`
- docs/collection-period.md:1062 — `The rule was first written as "no independent consensus ⇒ not eligible **in an unproven`
- docs/collection-period.md:1064 — `graded legs, so stop consulting the consensus" is coherent when a consensus *exists* and the` [x2]
- docs/collection-period.md:1083 — `> 'shCoreEligible' → basis → **+2% EV** → 'nv_tax' → **consensus gate**, and 'coreNoHR'`
- docs/collection-period.md:1145 — `| 'consMinN' / 'consMinEv' (consensus gate) | yes | **no** |`
- docs/collection-period.md:1149 — `'coreNoHR' means HR can *only* land on FUN, and FUN is ungated — therefore **the consensus`
- docs/collection-period.md:1237 — `Against the **multi-book consensus fair** rather than Caesars' own de-vig (n ≥ 2 rows), the`
- docs/collection-period.md:1238 — `overstatement is slightly larger because it also carries Caesars' offset from consensus:`
- docs/collection-period.md:1405 — `small-sample consensus gate ('consMinN' 100) applies to more markets than usual —`
- docs/collection-period.md:1796 — `'reason: "no_ind_consensus"', and the card composition before/after on the same board.`
- docs/collection-period.md:1801 — `three directions in one week** — via the HR consensus question, via the 'booksInd' scope`
- docs/collection-period.md:1813 — `| 'consMinN' / 'consMinEv' (small-sample consensus gate) | ✅ | ❌ |`
- docs/collection-period.md:1814 — `| **'booksInd' (no independent consensus)** | ✅ | ❌ |`
- docs/collection-period.md:1841 — `the settlement floor, the consensus gate, or 'booksInd'.**`
- docs/collection-period.md:1946 — `market that silently loses its consensus should still be caught.**`
- docs/collection-period.md:1949 — `the "consensus of N books" tag on the board. Changing displayed board text to satisfy a gate`
- docs/collection-period.md:2056 — `"consensus of N books" board tag. Changing displayed text to satisfy a gate is the wrong trade.`
- docs/collection-period.md:2418 — `consensus and still negative-EV because Caesars is worse than consensus.` [x2]
- docs/collection-period.md:2528 — `The reasoning offered: a voided row has no outcome but does have a closing consensus price,`
- docs/collection-period.md:2764 — `| **consensus gate ('consMinN'/'consMinEv')** | **18 → 0** |`
- docs/collection-period.md:2768 — `'blocked by reason: {"consensus": 18}'.`
- docs/collection-period.md:2771 — `consensus gate.** The card is empty not because the model found no edge, but because`
- docs/collection-period.md:2774 — `recorded (a thin or self-referential consensus reads the hold, not disagreement).`
- docs/collection-period.md:2777 — `small-sample consensus gate applies to more markets than usual — selection tightens…`
- docs/collection-period.md:2813 — `The question was whether the consensus gate is *structurally impossible for parlays*`
- docs/collection-period.md:2814 — `(compounding, telling us nothing about edge) or whether *the consensus genuinely`
- docs/collection-period.md:2822 — `| leg consensus EV | min −12.6% · p25 −7.6% · **median −7.1%** · p75 −5.7% · max −1.7% |`
- docs/collection-period.md:2828 — `consensus disagrees with the model on all 46 legs.**`
- docs/collection-period.md:2832 — `'consCzEv = p_consensus × czDec − 1'. A leg the consensus agrees with *exactly* still reads` [x2]
- docs/collection-period.md:2836 — `> **Measured median −7.10% − structural hold −3.43% = ~3.67 points of GENUINE consensus`
- docs/collection-period.md:2839 — `And the model's own claim on these legs is 'czEv ≥ +2%', so model-minus-consensus is`
- docs/collection-period.md:2840 — `≥ **9.1 EV points**, which converts to model-over-consensus of:`
- docs/collection-period.md:2850 — `roughly **3–5 probability points** of model-over-consensus on exactly the legs the +2% gate`
- docs/collection-period.md:2869 — `'consMinN'. So resetting a calibration counter **turned the small-sample consensus gate on`
- docs/collection-period.md:3020 — `tickets can form, and those 8 must *still* clear +2% EV and the consensus gate on their own`
- docs/collection-period.md:3040 — `it is betting into — cannot take daily money for the whole window. The consensus gate is`
- docs/collection-period.md:3091 — `at **100**) every ticket touching that market must ALSO clear the de-vigged consensus — which`
- docs/collection-period.md:3152 — `| market | consensus gate reopens |`
- docs/collection-period.md:3265 — `**The mechanism runs backwards from safe, stated plainly: reopening IS the consensus gate`
- docs/collection-period.md:3274 — `blocked at 'consensus'.**`
- docs/collection-period.md:3278 — `| as-was (07-26 real) | 0 — NO-PLAY | $0 | — | 18 @ consensus |`
- docs/collection-period.md:3293 — `further from consensus than the board) arriving with real money attached. And suspending`
- docs/collection-period.md:3433 — `# CONSENSUS DEPTH IS A FUNCTION OF TIME-TO-FIRST-PITCH (2026-07-27)`
- docs/collection-period.md:3468 — `> consensus check is a de-vigged Caesars price — is **a morning phenomenon**, peaking at 6.3%`
- docs/collection-period.md:3473 — `**Add to the retime's measured value: elimination of 'czf', +13% consensus depth. Do not claim`
- docs/collection-period.md:3474 — `it fixes thin consensus — it does not.**`
- docs/collection-period.md:6771 — `| the consensus gate ('mktN' vs 'consMinN=100') | **COUNT-armed** | graded rows per market crossing 100 | off-disk (server 'pl:cal:*') | unknown | **the class the owner named** — i…`
- docs/collection-period.md:6807 — `or not we generate boards. **For the consensus gate, YES** — 'mktN' counts OUR`
- docs/collection-period.md:7450 — `said it — *"reopening IS the consensus gate turning off; 'consMinEv' applies only`
- docs/collection-period.md:7464 — `reason 'consensus' proves that market is still under 100.`
- docs/collection-period.md:7475 — `100 the ticket must additionally clear the de-vigged consensus at 'consMinEv'; above`
- docs/collection-period.md:7478 — `"assumed consensus was live"**; the risk runs the other way — measurements taken`
- docs/collection-period.md:7480 — `board reproduced NO-PLAY with 18 tickets blocked at 'consensus'.`
- docs/collection-period.md:7493 — `18 tickets were blocked at 'consensus' — the gate demonstrably bound eleven days ago.`
- docs/collection-period.md:7676 — `counts**, so the 'consensus' count is visible whether or not it is zero — a zero printed`
- docs/collection-period.md:7692 — `| 3 | L3032–3034 | **'booksInd' — the independent-consensus requirement** |`
- docs/collection-period.md:7693 — `| 4 | L3037–3048 | **'consMinN'/'consMinEv' — the small-sample consensus gate** |`
- docs/collection-period.md:7713 — `| consensus gates ('booksInd', 'consMinN'/'consMinEv') | **IN** |`
- docs/collection-period.md:7723 — `every EV-, consensus-, suspension- and sizing-related protection.** No protection was`
- docs/collection-period.md:7745 — `….5+ and HR-anytime-parlay suspended from auto-selection; <100-graded-leg markets need consensus-fair EV ≥ −1%" — **no mode qualifier** | **CORRECTED 2026-07-30** — see the dated li…`
- docs/collection-period.md:8065 — `picks**, i.e. on exactly the NO-PLAY day the consensus gate most likely caused.`
- docs/collection-period.md:8610 — `| 29 (consensus crossing / 'mktN') | **PROSE** |`
- docs/collection-period.md:8694 — `- **Any 'consensus' block on 'pitcher_strikeouts' or 'pitcher_outs'** → the 'consMinEv'`
- docs/collection-period.md:8700 — `- Zero consensus blocks **with the per-market pool counts printed beside them** →`
- docs/collection-period.md:8881 — `**Every projected date in this file — the Phase-2 ICC schedule (L2575–79), the consensus-reopen`
- docs/credit-budget.md:119 — `…ement percentiles that set 'lockMaxAgeMin', the p90 offshore-book artifact, the 31-book ML consensus depth | cheapest line in the budget, highest realised yield — never cut first |`
- docs/credit-budget.md:228 — `of each game's own first pitch, with the de-vigged consensus fair, the seam-free cents`
- docs/first-sunday-six.md:32 — `…e independence is assumed. Current football fair values use existing disclosed market-consensus/assumed-overround behavior, not a separately trained player prediction. No unsupport…`
- docs/freeze-exit-bundle.md:47 — `… 'consMinN') is hidden when 'picks.length === 0', i.e. on exactly the NO-PLAY day the consensus gate most likely caused. Spec-only fix: surface the ratio with a breach label, drop …`
- docs/freeze-exit-bundle.md:51 — `…EvMin' (the EV gate, L3008) · 'coreCzEvMin' (settlement floor, L3011–18) · 'booksInd' consensus (L3032–34) · 'consMinN'/'consMinEv' (L3037–48) · NO-PLAY as a first-class result (L3…` [long line; 1 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:55 — `…e general finding**: 'shUmpKf' counts real MLB games (cadence-independent), while the consensus gate counts OUR graded rows against 'consMinN=100' — **so rationing boards changes w…` [long line; 1 occurrences on this line; first shown]
- docs/freeze-exit-bundle.md:251 — `remaining EVs are consensus-at-CZ (vig), the shrink target IS the market-implied`
- docs/freeze-exit-bundle.md:253 — `35% model / 65% consensus for props ('SH_W') — λ composes on top; λ=1 ≡ pure`
- docs/freeze-exit-bundle.md:254 — `consensus fair. The nine 'shShrink' k's implement a DIFFERENT shrinkage — player`
- docs/harness-substitutions.md:406 — `| 7 | '/api/clv''s consensus fair **vs** the board's 'fair' for the same leg | CLV is scored as 'closing fair − locked implied'. If the two fairs are built differently, CLV has a c…`
- docs/harness-substitutions.md:508 — `consensus-fair movement was not. The first two are right; the third is **also** independent,`
- docs/harness-substitutions.md:514 — `Anything that later treats 'props-history.fair' as the engine's consensus (a prop-CLV`
- docs/harness-substitutions.md:547 — `consensus → 'booksInd' — drops 20 of 67 tickets at 'shCoreEligible' alone, on leg count and`
- docs/hrr-recalibration.md:132 — `> stakes grading at consensus truth is the CZ vig drag; in-loop at λ=1 the gate`
- docs/multibook-memo.md:304 — `'consensusFair' from all books and THEN discards everything on 'if (cz == null) return`
- docs/multibook-memo.md:324 — `rows**, and CZ sits INSIDE the consensus on 36 of 111 (in-panel where present, out where`
- docs/multibook-memo.md:337 — `read (owner: Upstash console, count legs carrying 'clv' and those with 'consensusFair'`
- docs/multibook-memo.md:460 — `workflows. Calibration/'mktN' come from the prediction store, consensus from the live`
- docs/multibook-memo.md:580 — `at consensus, not EV — so "would they clear at a better book" is a fortiori yes, 15/17 also`
- docs/multibook-memo.md:614 — `- 'consMinEv''s consensus **excludes the settlement book per the booksInd rule** — and with`
- docs/multibook-memo.md:617 — `settlement-independent — its rows' consensus is automatically clean.`
- docs/phase2-memo.md:132 — `'mktN' and made the small-sample consensus gate universal. With zero locked cards:`
- docs/phase2-memo.md:153 — `1. the model holds ~17 pp of **real information** the consensus lacks, on ~46 legs a day; or`
- docs/phase2-memo.md:238 — `record says the model *beats* the market — model Brier **0.099** vs consensus **0.109**, the`
- docs/phase2-memo.md:251 — `within 0.012 of consensus. An ambiguous return is therefore the *expected* failure mode, and`
- docs/phase2-memo.md:484 — `~2,400 graded legs. Measuring bias against the **closing consensus** instead reaches`
- docs/phase2-memo.md:746 — `| **consensus depth / 'czf'** — "the de-vigged consensus behind a prop row is often thin" | 'data/props' | **YES — relabelled.** Snapshot 1: mean 'n' **1.40**, 'czf' **2.2%**. Snap…` [x2]
- docs/phase2-memo.md:751 — `inside its own consensus) falls 2.2% → 0.3%. So a thinness figure computed on the second reading`
- docs/phase2-memo.md:754 — `> **The "consensus is often thin" finding is CONSERVATIVE, not overstated.** Measured on the`
- docs/phase2-memo.md:755 — `> whole-slate population the consensus is thinner and the settlement book is inside its own`
- docs/phase2-memo.md:756 — `> consensus **seven times more often**. Relabelled with its population, not retracted — and the`
- docs/pitcher-outs-audit.md:194 — `'opp-offense' 35, 'market-gap' 34, 'consensus' 27, 'shrunk-to-mean' 24, 'laboring' 6,`
- docs/pitcher-outs-audit.md:210 — `| market | n | predicted | actual | model Brier | consensus Brier |`
- docs/pitcher-outs-audit.md:222 — `Brier is materially worse than simply taking the consensus fair** (0.285 vs 0.215; every`
- docs/progress.md:94 — `…medHold and UI explains the assumption. Missing book prices or insufficient same-line consensus remain unavailable/ungraded. No fabricated odds or probabilities; do not claim every…`
- docs/progress.md:140 — `…ble while the kickoff is ahead). Labels "1H Indiana -3.5" / "1H Over 27.5"; 'model.h1' holds the half's consensus; 'rowProbAt' prices a 1H side off it and returns null without one.`
- docs/progress.md:212 — `…('src/lib/splits.ts', '/api/splits', 'useSplits', 'SplitsChip'): public scoresandodds consensus page per league (nfl / mlb / ncaaf), 10-min server cache, always 200; chip on footba…`
- docs/progress.md:365 — `Football remains market-consensus guided, not an independent player forecast.`
- docs/progress.md:429 — `…ence of outage. Five of eight market-level model Brier point estimates are worse than consensus; no independent-sample significance claimed. Today's public card: one $15 core exper…`
- docs/session-handoff.md:408 — `…ied matchup team, DK quote, per-game age <=30 minutes. Player forecasts remain market-consensus estimates. Client queries props separately to avoid inflating shared Games payloads;…`
- docs/session-handoff.md:448 — `…are still excluded. Mode is saved/restored with recipes. Football props remain market-consensus estimates, not simulated player forecasts; UI discloses source and unmodeled same-ga…`
- docs/session-handoff.md:482 — `…medHold and UI explains the assumption. Missing book prices or insufficient same-line consensus remain unavailable/ungraded. No fabricated odds or probabilities; do not claim every…`
- docs/session-handoff.md:782 — `…lt and forced passes all read the same numbers. legP' = 0.5·prob + 0.5·imp (de-vigged consensus; a leg with no imp is untouched); ticket prob scales by ∏legP'/∏legP (the engine's s…`
- docs/session-handoff.md:852 — `…urve (σ 16.5 margin, 18 total, HFA 2.6, 0 at neutral sites), Pinnacle-weighted median consensus across 'us,eu' books, blend {market .60, spread-implied .25, FPI .15} for win probab…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:856 — `…elpers 'src/lib/cfb/slate-server.ts'); O/U pairs devigged per book at the same point, consensus line = weighted median of posted lines, fair = true median of the devigged probs (nu…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:1562 — `…ence of outage. Five of eight market-level model Brier point estimates are worse than consensus; no independent-sample significance claimed. Today's public card: one $15 core exper…`
- docs/session-handoff.md:1608 — `Football remains market-consensus guided, not an independent player forecast.`
- docs/session-handoff.md:1694 — `…ers/settle-book.ts' loads them with the two books' keys exchanged — same prices, same consensus, every hand-computed number unchanged. Astra's uncommitted 30-file DraftKings pass (…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1708 — `…tsbook or public page publishes ticket/handle splits on player props (re-checked; the consensus page carries sides only), so props carry a **price-implied market lean** instead — '…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:1710 — `…e logo. **(3)** 'src/lib/splits.ts' parses the public scoresandodds '/{nfl|mlb|ncaaf}/consensus-picks' page (left pennant = AWAY, verified against statsapi; 'findGameSplits' by abb…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:2791 — `Kelly ceiling / caps / coreEvMin / suspensions / consensus / noParlay ALL cover it; M24/M25`
- docs/session-handoff.md:4588 — `29. **Consensus-gate crossing, observed not projected (added 2026-07-30, owner's`
- docs/session-handoff.md:4590 — `reason 'consensus' proves that market is still under 'consMinN = 100', i.e. the`
- docs/session-handoff.md:4591 — `"expiry" has NOT happened for it. Zero 'consensus' blocks → consistent with the`
- docs/session-handoff.md:4600 — `'consensus' count is visible whether or not it is zero — a zero beside a non-zero`
- docs/session-handoff.md:6807 — `| 8 | 'consMinEv' | the consensus floor that pairs with it |`
- docs/session-handoff.md:7803 — `"THE REOPEN CALENDAR IS COUNT-ARMED"): there is **no date anywhere in the consensus gate**; the`
- docs/session-handoff.md:7823 — `| **2026-08-08** | ML · RL consensus reopen | 7.5 graded legs/day | **0/day** | **STOPPED** — 'reopenDays' → 'null' |`
- docs/session-handoff.md:7825 — `| **2026-08-17** | Total Bases consensus reopen | 4.5/day | **0/day** | **STOPPED** |`
- docs/session-handoff.md:7827 — `| **2026-08-23** | Hits · HR · H+R+RBI consensus reopen | 3.5/day | **0/day** | **STOPPED** |`
- docs/session-handoff.md:7828 — `| **2026-09-03** | K's · Outs consensus reopen (the positive control) | 2.5/day | **0/day** | **STOPPED** |`
- docs/session-handoff.md:7869 — `consensus-reopen tables were **already derived at 35/day and are correct**. **Only the Phase-2 ICC`
- docs/session-handoff.md:7943 — `the pool. Every consensus reopen is further still.`
- docs/singles-vs-parlays.md:18 — `consensus branch never fires. That is not a modified engine: it is exactly the state the`
- docs/singles-vs-parlays.md:31 — `floor, 'nv_tax', 'booksInd', the consensus branch, greedy selection, leg/game dedupe, the`
- docs/singles-vs-parlays.md:62 — `> **picks 0 · staked $0 · blocked '{"consensus": 24}'**`
- docs/singles-vs-parlays.md:64 — `**None of the wall is compounding.** 24 of the 37 legs reach the consensus branch as singles`
- docs/singles-vs-parlays.md:83 — `| blocked | none | '{"consensus": 18}' |`
- docs/singles-vs-parlays.md:541 — `> > selection rank by engine true % anchored to the multi-book consensus; **Caesars prices`
- docs/singles-vs-parlays.md:555 — `> floor and consensus gate at the same time, which confounds it.)`
- docs/singles-vs-parlays.md:780 — `'{"consensus": 46}'.**`

##### consensus — tools (3 lines)

- tools/board-report.mjs:248 — `if ((r.byReason.consensus ?? 0) > 0) console.log(" >>> CONSENSUS BLOCKS PRESENT: the expiry fired but the gate STILL BINDS — those markets did NOT reopen.");` [x2]
- tools/gate_activity.py:181 — `# de-vigged consensus, and that is what produced the NO-PLAY card. Its reopening date is`
- tools/snapshot_props.py:104 — `# NEVER read this as "the engine's consensus fair"; recompute from 'fp' instead.`

#### best line

0 matching lines in 0 files (0 occurrences).

No hits anywhere in the repo.

#### bestPrice / best price

27 matching lines in 24 files (28 occurrences).

##### bestPrice / best price — calculations (6 lines)

- legacy/index.html:1275 — `line-shop the best price per side. The consensus is the model's prior. */`
- legacy/index.html:2164 — `/* consensus prior: median de-vigged fair prob across every book (fallback: de-vig best prices) */`
- src/engine/legacy-src.gen.ts:5 — `…g EVERY book (multiplicative), consensus = median fair prob,\n line-shop the best price per side. The consensus is the model's prior. */\n var mls=[],rls=[],tots=[];\n…` [long line; 2 occurrences on this line; first shown]
- src/lib/games.ts:144 — `/** decimal payout of an American price — used only to rank "best price" */`
- src/lib/prop-lean.ts:84 — `* price toggle: the selected book's quote, or the best price with the selected book as fallback.`
- src/lib/ticket-math.ts:18 — `cz: number; // american — the Caesars price when posted, else the best price in the feed`

##### bestPrice / best price — stored-data fields (3 lines)

- src/lib/cfb/types.ts:127 — `/** best price among books posting the consensus line (or the ML) */`
- src/lib/pred-serialize.ts:22 — `ev: number | null; // EV % at best price`
- src/lib/pred-serialize.ts:23 — `odds: number | null; // best price (american)`

##### bestPrice / best price — UI (8 lines)

- app/board/page.tsx:252 — `// EV at the all-books best price — a price no mode selects at). Rows missing`
- app/board/page.tsx:259 — `Caesars price — off-book rows render with their best price and Josh's own ⓘ toggle`
- app/design/page.tsx:425 — `<span className="text-[11px] text-muted">best price</span>`
- app/props/page.tsx:82 — `* posts the line, otherwise the best price in the feed, labelled with the book),`
- src/components/cfb/CfbProps.tsx:105 — `{ key: "best", label: "Best price" },`
- src/components/props/props-model.ts:7 — `* posts the line, otherwise the best price in the feed, labelled with the book),`
- src/components/ufc/UfcBoard.tsx:95 — `header: "Best price",`
- src/components/ufc/UfcLiveProps.tsx:13 — `For each prop selected book prices we show the best price elsewhere and the`

##### bestPrice / best price — tests (5 lines)

- tests/cfb-model.test.ts:263 — `// evBest: the best price at the consensus line among the two books — ECU +28: Caesars −106 beats Pinnacle −109`
- tests/cfb-props-ui.test.ts:73 — `it("keeps the Caesars / Best price toggle on props", () => {`
- tests/games.test.ts:152 — `it("matches ML rows by team name, keeps the best price + book, and carries the Caesars price", () => {`
- tests/legacy-harness/int40cz.js:16 — `Caesars price from batter_hits_alternate; consensus and best price stay untouched`
- tests/props-model.test.ts:91 — `it("without Caesars, the feed's best price is labelled with its book", () => {`

##### bestPrice / best price — docs (4 lines)

- CLAUDE.md:104 — `…final = SH_W·model + (1−SH_W)·consensus' ('SH_W={props:.35,ml:.15,rl:.15}'); **EV at best price** on every pick; **EDGE badge** when EV ≥ 'SH_EDGE_MIN' (4% props / 2% ML-RL) AND ≥ …`
- ENGINE2.md:329 — `exists) anchor their fair to the BASIS price instead of the all-books best price;`
- docs/harness-substitutions.md:516 — `construction: it consumes 'bo', the raw best price, not 'fair'.`
- docs/session-handoff.md:1718 — `…poses a 1-leg ticket from every pregame board row that carries a settlement price, a best price, an engine % and a leg key (ML/RL, Hits, TB, H+R+RBI, K's, Outs; 'straight: true', E…` [long line; 1 occurrences on this line; first shown]

##### bestPrice / best price — tools (1 lines)

- tools/snapshot_props.py:54 — `fair P(over) (the classic CLV convention), best prices, book count.`

#### median

369 matching lines in 72 files (423 occurrences).

Note: Includes purely statistical medians in docs/tools that have nothing to do with books; the book-relevant ones are the cross-book median fairs (legacy shMedian/shMedianW, src/lib/cfb/model.ts, src/lib/cfb/props.ts, src/lib/server/clv-core.ts, src/lib/server/mlb-live-quote.ts, src/lib/ufc.ts, src/lib/sportsbook/mlb.ts, tools/snapshot_props.py, tools/close_fair.py).

##### median — fetch code (1 lines)

- app/api/scheduler/route.ts:27 — `* Vercel, not GitHub Actions — Actions delivery here is ~56-min median with a weekend`

##### median — config (1 lines)

- src/lib/cfb/rules.ts:31 — `* pinnacleWeight — Pinnacle counts twice in the consensus median (the sharp anchor).`

##### median — calculations (72 lines)

- legacy/index.html:457 — `… engine, transparent math on live data: every price de-vigged across all posted books (median = consensus prior); the model — Monte Carlo game sims (4,000/game) for ML/RL/H+R+RBI, …`
- legacy/index.html:1105 — `ML moves a median 0.97 implied points and p90 2.55 (line-history archive, n=182) —`
- legacy/index.html:1274 — `/* market layer: de-vig EVERY book (multiplicative), consensus = median fair prob,`
- legacy/index.html:1297 — `o.home_fair=shMedianW(mls.map(function(x){var v=shDevigPair(shImp(x.h),shImp(x.a));return v==null?null:{v:v,w:shBookW(x.k)};}).filter(function(v){return v!=null;}));`
- legacy/index.html:1319 — `o.home_rl_fair=shMedianW(use.map(function(x){var v=shDevigPair(shImp(x.h),shImp(x.a));return v==null?null:{v:v,w:shBookW(x.k)};}).filter(function(v){return v!=null;}));`
- legacy/index.html:1340 — `o.total_fair_over=shMedianW(tuse.map(function(x){var v=shDevigPair(shImp(x.o),shImp(x.u));`
- legacy/index.html:1344 — `}else o.total=shMedian(tots);`
- legacy/index.html:1369 — `consensus fair P(over) = median across books, prices kept = best per side (line shopping). */`
- legacy/index.html:1413 — `behind this fair" becomes underivable downstream. shMedianW reads .v/.w only. */`
- legacy/index.html:1432 — `fair:fairs.length?shMedianW(fairs):null,books:fairs.length,`
- legacy/index.html:1575 — `/* weighted median over [{v,w}] — plain median when sharp weighting is off */` [x2]
- legacy/index.html:1576 — `function shMedianW(list){if(!list||!list.length)return null;`
- legacy/index.html:1577 — `if(!(SH_V2&&SH_V2.sharpW))return shMedian(list.map(function(x){return x.v;}));`
- legacy/index.html:1700 — `shMedian: consensus aggregator across books (median is robust to one stale book). */` [x2]
- legacy/index.html:1702 — `function shMedian(a){if(!a||!a.length)return null;var s=a.slice().sort(function(x,y){return x-y;});var n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;}`
- legacy/index.html:2164 — `/* consensus prior: median de-vigged fair prob across every book (fallback: de-vig best prices) */`
- legacy/index.html:2448 — `/* consensus prior (median de-vig across books) + market-anchored blend.`
- legacy/index.html:2851 — `…ount efficiency, totals/F5/team-total pricing":"")+". ":"")+"Market-anchored engine: every price de-vigged across all posted books (median = consensus prior), model blended in at "`
- src/engine/legacy-src.gen.ts:5 — `…nly ledger. Measured basis: over a 4-5h gap near first pitch, Caesars\n ML moves a median 0.97 implied points and p90 2.55 (line-history archive, n=182) —\n small, but the …` [long line; 19 occurrences on this line; first shown]
- src/engine2/calibration.ts:429 — `* +2% EV ALL sit in the 0–5 point buckets (|gap| median 2.3, max 4.8), while the 10–20 and`
- src/engine2/devig.ts:75 — `/** weighted median — robust to one book's stale/outlier number */`
- src/engine2/devig.ts:76 — `export function weightedMedian(values: number[], weights: number[]): number {`
- src/engine2/devig.ts:88 — `Shin-devig each book, then sharp-weighted median. */`
- src/engine2/devig.ts:103 — `return { p: weightedMedian(ps, ws), n: ps.length };`
- src/lib/cfb/h1.ts:3 — `import { bookQuote, consensusMedian, coverProb, readBooksOf, sideRow } from "@/lib/cfb/model";`
- src/lib/cfb/h1.ts:18 — `* (H1_SIGMA_SCALE); the same Pinnacle-weighted median (minBooks); the market P(side) of each`
- src/lib/cfb/h1.ts:38 — `const mkt = consensusMedian(books.mls, (b) => b.pHome, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:39 — `const mktMargin = consensusMedian(books.spreads, (b) => b.mu, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:40 — `const spreadLine = consensusMedian(books.spreads, (b) => b.s, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:41 — `const mktTotal = consensusMedian(books.totals, (b) => b.muT, (b) => b.w, M.minBooks);`
- src/lib/cfb/h1.ts:42 — `const totalLine = consensusMedian(books.totals, (b) => b.T, (b) => b.w, M.minBooks);`
- src/lib/cfb/model.ts:1 — `import { americanFromProb, decFromAmerican, devigProportional, impliedFromAmerican, weightedMedian } from "@/engine2/devig";`
- src/lib/cfb/model.ts:34 — `* 5. Consensus = Pinnacle-weighted median across books (null under the league's 'model.minBooks').`
- src/lib/cfb/model.ts:377 — `export function consensusMedian<T>(items: T[], value: (t: T) => number, weight: (t: T) => number, minBooks: number): number | null {`
- src/lib/cfb/model.ts:378 — `return median(items, value, weight, minBooks);`
- src/lib/cfb/model.ts:380 — `function median<T>(items: T[], value: (t: T) => number, weight: (t: T) => number, minBooks: number): number | null {`
- src/lib/cfb/model.ts:382 — `return weightedMedian(items.map(value), items.map(weight));`
- src/lib/cfb/model.ts:415 — `const mkt = median(books.mls, (b) => b.pHome, (b) => b.w, M.minBooks);`
- src/lib/cfb/model.ts:416 — `const mktMargin = median(books.spreads, (b) => b.mu, (b) => b.w, M.minBooks);`
- src/lib/cfb/model.ts:417 — `const spreadLine = median(books.spreads, (b) => b.s, (b) => b.w, M.minBooks);`
- src/lib/cfb/model.ts:418 — `const mktTotal = median(books.totals, (b) => b.muT, (b) => b.w, M.minBooks);`
- src/lib/cfb/model.ts:419 — `const totalLine = median(books.totals, (b) => b.T, (b) => b.w, M.minBooks);`
- src/lib/cfb/props.ts:2 — `import { americanFromProb, decFromAmerican, devigProportional, impliedFromAmerican, weightedMedian } from "@/engine2/devig";`
- src/lib/cfb/props.ts:28 — `* exists only AT A LINE THE BOOKS PRICED: the fair at line L is the median of the de-vigged`
- src/lib/cfb/props.ts:31 — `* TRUE median ('median' below): on an even count the mean of the two middle reads, so the` [x2]
- src/lib/cfb/props.ts:33 — `* is then also the median of the under reads).`
- src/lib/cfb/props.ts:34 — `* 4. The row's 'line' is the median of the books' lines (lower-middle on an even count, so it`
- src/lib/cfb/props.ts:191 — `// Ladder rungs are separate contracts, never a median line or one quote overwriting another.`
- src/lib/cfb/props.ts:198 — `* The true equal-weight median: the middle value, or the MEAN of the two middle values on an even`
- src/lib/cfb/props.ts:199 — `* count. engine2's 'weightedMedian' returns the lower-middle value on an even count; used on the`
- src/lib/cfb/props.ts:202 — `* quotes. This estimator is symmetric: median(1 − reads) = 1 − median(reads).` [x2]
- src/lib/cfb/props.ts:204 — `export function median(values: number[]): number {`
- src/lib/cfb/props.ts:210 — `/** median of the de-vigged over probabilities of the books posting exactly 'line'; null under 'minBooks' */`
- src/lib/cfb/props.ts:214 — `return { p: median(at.map((r) => r.pOver)), n: at.length };`
- src/lib/cfb/props.ts:265 — `// the row's line must be a line some book POSTED (a fair exists only there), so the line median`
- src/lib/cfb/props.ts:266 — `// is engine2's lower-middle weightedMedian, never an average of two posted lines`
- src/lib/cfb/props.ts:267 — `const line = g.market.kind !== "yes" ? weightedMedian(g.reads.map((r) => r.line as number), g.reads.map(() => 1)) : null;`
- src/lib/cfb/season.ts:36 — `* 4. projected total = current + rateUsed × remaining. This is the model's FAIR LINE (the median`
- src/lib/cfb/season.ts:280 — `/** current + rateUsed × remaining — the model's fair line (the median) */`
- src/lib/server/clv-core.ts:51 — `const median = (xs: number[]): number | null => {`
- src/lib/server/clv-core.ts:199 — `const fairOver = fairs.length >= 2 ? median(fairs) : null;`
- src/lib/server/clv-core.ts:243 — `return { am: cz, at, consensusFair: fairs.length >= 2 ? median(fairs) : null, bsAm: bs?.am ?? null, bsBk: bs?.bk ?? null };`
- src/lib/server/mlb-live-quote.ts:140 — `* The plain median. 'src/lib/server/clv-core.ts' has this exact helper but does not export it, and`
- src/lib/server/mlb-live-quote.ts:141 — `* 'weightedMedian' ('src/engine2/devig.ts:76') is a DIFFERENT function on an even count — it returns`
- src/lib/server/mlb-live-quote.ts:145 — `function median(xs: number[]): number | null {`
- src/lib/server/mlb-live-quote.ts:205 — `* quote among the tied points it breaks to their median, which is deterministic and takes no side.`
- src/lib/server/mlb-live-quote.ts:248 — `// the modal point across books, ties to Caesars' point, else the median of the tied points`
- src/lib/server/mlb-live-quote.ts:254 — `const ln = tied.length === 1 ? tied[0] : (tied.find((p) => czPoints.has(p)) ?? (median(tied) as number));`
- src/lib/server/mlb-live-quote.ts:282 — `fO: median(fairs),`
- src/lib/ufc.ts:15 — `const median = (xs: number[]) => {`
- src/lib/ufc.ts:26 — `/** de-vigged median probability across all posted books */`
- src/lib/ufc.ts:148 — `const prob = probs.length ? median(probs) : null;`

##### median — stored-data fields (3 lines)

- public/data/first-sunday-six/history.json:1 — `…8,"firstTDs":2761,"earlySlates":175,"tiedSlates":1,"latestCompletedDate":"2026-09-17","medianFirstTDSeconds":564,"positionCounts":{"WR":963,"RB":950,"QB":180,"TE":406,"OLB":8,"CB":…` [long line; 1 occurrences on this line; first shown]
- src/lib/mlb/live-quote-types.ts:45 — `/** de-vigged consensus fair probability of the OVER at 'ln' (median of per-book fairs) */`
- src/lib/nfl/first-sunday-six-history.json:1 — `…8,"firstTDs":2761,"earlySlates":175,"tiedSlates":1,"latestCompletedDate":"2026-09-17","medianFirstTDSeconds":564,"positionCounts":{"WR":963,"RB":950,"QB":180,"TE":406,"OLB":8,"CB":…` [long line; 1 occurrences on this line; first shown]

##### median — UI (13 lines)

- app/ledger/page.tsx:740 — `Season end: 10th pct {fmtMoney(proj.endLo)} · median {fmtMoney(proj.endMid)} · 90th pct{" "}`
- app/sharp/page.tsx:644 — `the median across books is the consensus &quot;fair&quot; probability. The engine has to earn any`
- src/components/cfb/CfbSeason.tsx:61 — `* line, the median) per stat. Tapping a stat chip or a team row loads it into the builder.`
- src/components/cfb/CfbSeason.tsx:306 — `<StatTile label="Fair line" value={n0(proj.projected, proj.kind === "player" && !isCount(proj.stat) ? 0 : 1)} tone="cfb" sub="model median" />`
- src/components/cfb/CfbSharp.tsx:273 — `Games each book prices on this slate. Paper tickets retain their recorded settlement book; Pinnacle counts ×{L.model.pinnacleWeight} in the consensus median; a`
- src/components/cfb/CfbSharp.tsx:384 — `Each market&apos;s consensus is a weighted median across books, Pinnacle counting twice as the sharp anchor. Under {m.minBooks} books at a line, the`
- src/components/mlb/SharpDesk.tsx:145 — `Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a`
- src/components/ufc/UfcBuilder.tsx:19 — `Same market math as the Board's UFC desk (consensus = de-vigged median`
- src/components/ufc/UfcLiveProps.tsx:14 — `cross-book median — an honest line-shop read. The median implied % is used` [x2]
- src/components/ufc/UfcLiveProps.tsx:136 — `&quot;vs mkt&quot; compares selected book to the cross-book median for the same outcome — a line-shop read, not a`
- src/components/ufc/UfcLiveProps.tsx:137 — `model. On big longshots the median overstates true chances (vig can&apos;t be fully stripped from partial`
- src/components/ufc/UfcLiveProps.tsx:139 — `Slip probability uses the market median, same caveat. Method-of-victory prices from the selected book NV app`
- src/components/ufc/UfcSharp.tsx:175 — `the median is the consensus &quot;true&quot; probability. selected book&apos; price is then judged against it —`

##### median — tests (47 lines)

- tests/cfb-h1.test.ts:106 — `// three books at -3.5 / -110 both ways: every book's margin is exactly 3.5 → the median is 3.5`
- tests/cfb-model.test.ts:225 — `describe("hand-computed EV checks from fixture prices (reduced books so the medians are readable)", () => {`
- tests/cfb-model.test.ts:233 — `* weighted median over {μ_pin (w2), μ_cz (w1)}: sorted ascending μ_pin first, cumulative`
- tests/cfb-model.test.ts:235 — `* consensus line = median home point = −28 (both books).`
- tests/cfb-model.test.ts:241 — `it("CHECK 1 · Alabama −28 / East Carolina +28 at Caesars (fixture prices, Pinnacle-weighted median)", () => {`
- tests/cfb-model.test.ts:273 — `* weighted median → μT_pin (w2). consensus total = 52.5 (both books).`
- tests/cfb-model.test.ts:298 — `* weighted median, equal weights: sorted ascending p_dk first, cumulative 1 ≥ half (1) → mkt = p_dk.`
- tests/cfb-model.test.ts:331 — `* weighted median over {p_cz (w1), p_pin (w2)}: ascending p_cz (cum 1 < 1.5), then p_pin (cum 3) → mkt = p_pin.`
- tests/cfb-props.test.ts:6 — `import { ATD_YES_ONLY_OVERROUND, hasLiveEvent, median, parseEventProps, playerSlug, propLabel, propsWindowSec, selectPropEvents } from "@/lib/cfb/props";`
- tests/cfb-props.test.ts:19 — `* median, evPct) from the fixture prices named in the comments — not by the module under test.`
- tests/cfb-props.test.ts:137 — `it("de-vigs each book's pair and takes the equal-weight median at the consensus line", () => {`
- tests/cfb-props.test.ts:139 — `// Caesars sits alone at 249.5. Consensus line = median(249.5, 245.5, 245.5, 245.5) = 245.5.`
- tests/cfb-props.test.ts:169 — `// over reads sorted 0.5, 0.506069, 0.510121, 0.520305; TRUE median (mean of the two middle) = 0.508095;`
- tests/cfb-props.test.ts:178 — `// Germie Bernard rec yds O 52.5 — MGM posts none, three books remain: median 0.504330, EV at CZ -110 = −3.72`
- tests/cfb-props.test.ts:198 — `it("anytime TD, yes-only at every book: implied ÷ the stated overround, then the median", () => {`
- tests/cfb-props.test.ts:200 — `// true median = (0.531915 + 0.536882) / 2 = 0.534398; EV at CZ (1.714286) = −8.39; best = MGM -130 (1.769231), EV −5.45`
- tests/cfb-props.test.ts:210 — `it("median is the true median: middle value, or the mean of the two middles on an even count", () => {` [x2]
- tests/cfb-props.test.ts:211 — `expect(median([3, 1, 2])).toBe(2);`
- tests/cfb-props.test.ts:212 — `expect(median([0.5, 0.52, 0.51, 0.5])).toBeCloseTo(0.505, 9);`
- tests/cfb-props.test.ts:213 — `expect(median([0.48917, 0.53061])).toBeCloseTo(0.50989, 9);`
- tests/cfb-props.test.ts:214 — `expect(median([7])).toBe(7);`
- tests/cfb-props.test.ts:219 — `// The lower-middle rule (engine2 weightedMedian) would have read 0.489166 → over −13.46 / under +2.17,`
- tests/cfb-props.test.ts:275 — `// fair at 4.5 = median(0.5, 0.5, cz: imp(+130)=0.434783 vs imp(-110)=0.523810 → 0.453543) = 0.5; EV at +130 = 100·(0.5·1.3 − 0.5) = 15 → S`
- tests/cfb-season.test.ts:70 — `// the fair line is the median: P(over projected) = 0.5`
- tests/clv-core.test.ts:105 — `// median of [.56899, .5506, .5860] = .56899`
- tests/clv-core.test.ts:108 — `it("over leg: Caesars price + median de-vigged fair across books", () => {`
- tests/engine-v2-integration.test.ts:37 — `it("armed: devigPair uses Shin, weighted median leans sharp", () => {`
- tests/engine-v2-integration.test.ts:44 — `const wmed = eng.get<(l: { v: number; w: number }[]) => number>("shMedianW")!;`
- tests/engine-v2-integration.test.ts:45 — `// two retail books at 55%, pinnacle-weighted 60% wins the median`
- tests/engine2-devig.test.ts:8 — `weightedMedian,`
- tests/engine2-devig.test.ts:54 — `it("weighted median resists a single outlier", () => {`
- tests/engine2-devig.test.ts:55 — `// four books at ~57%, one stale outlier at 80% — median stays home`
- tests/engine2-devig.test.ts:56 — `expect(weightedMedian([0.57, 0.565, 0.575, 0.57, 0.8], [1, 1, 1, 1, 1])).toBeCloseTo(0.57, 3);`
- tests/engine2-devig.test.ts:67 — `// pinnacle weight 3 vs 1+1 ⇒ weighted median lands on the sharp number`
- tests/football-ladders.test.ts:51 — `it('uses the chosen book probability even when the default book differs from the median line',()=>{`
- tests/hrr-compression.test.ts:12 — `* the same: H+R+RBI's 'shShrink' site (L2359, k=10 at n median 26) has the BEST own-sample`
- tests/hrr-compression.test.ts:133 — `'${"stage".padEnd(48)}${"n".padStart(5)}${"p25".padStart(8)}${"median".padStart(9)}' +`
- tests/hrr-compression.test.ts:157 — `' median ${cap.powers.length >= 4 ? q(cap.powers, 0.5).toFixed(3) : "—"}' +`
- tests/legacy-harness/unit39.js:20 — `eq("median odd",shMedian([0.5,0.7,0.6]),0.6);` [x2]
- tests/legacy-harness/unit39.js:21 — `eq("median even",shMedian([0.4,0.6,0.5,0.7]),0.55);` [x2]
- tests/legacy-harness/unit39.js:22 — `eq("median empty",shMedian([]),null);` [x2]
- tests/mlb-live-props-route.test.ts:463 — `expect(q.fO).toBeCloseTo(0.5599, 3); // the median of the three de-vigged book fairs`
- tests/singles-counterfactual.test.ts:235 — `' median ${(100 * qq(0.5)).toFixed(2)}% p75 ${(100 * qq(0.75)).toFixed(2)}%' +`
- tests/singles-counterfactual.test.ts:660 — `'\n min ${cq(0).toFixed(2)} p25 ${cq(0.25).toFixed(2)} median ${cq(0.5).toFixed(2)}' +`
- tests/singles-counterfactual.test.ts:702 — `' min ${q(0)?.toFixed(3)} p25 ${q(0.25)?.toFixed(3)} median ${q(0.5)?.toFixed(3)}' +`
- tests/workflow-timing.test.ts:15 — `* model '30 9' -> 12:09-17:24Z (+2.6 to +7.9h, median +5.7h)`
- tests/workflow-timing.test.ts:133 — `measured ~56-min median delay with a weekend collapse supports it). The two-condition`

##### median — docs (194 lines)

- CLAUDE.md:101 — `…Market layer**: every posted book de-vigged multiplicatively ('shDevig2'), consensus = median ('shMedian') — game odds carry 'home_fair'/'home_rl_fair'/'ml_books', prop rows carry …` [x2]
- CLAUDE.md:144 — `…ds 'parseH1' (the full game's 'readBooksOf' under the half's σ, same Pinnacle-weighted median, 'pHome' = ML + spread-implied blend with NO FPI term) and 'attachH1' (joins the store…` [long line; 1 occurrences on this line; first shown]
- CLAUDE.md:809 — `…08-02** | Sunday keep rate: **≥90%** confirms the retime · **6–30%** means the cadence, not the hour · between = partial. Also the scheduler delay revisit (median **and spread**) |`
- CLAUDE.md:999 — `**−23.1 pp median, 0 of 38 above market** (the only 100%-one-sided market on the board);`
- CLAUDE.md:1085 — `−0.501% at 2, −0.334% at 3. Measured: median −5.60%, max −0.60%, **1 of 205 rows clears even as`
- CLAUDE.md:1376 — `consumer tables, 'expAB' median 4.1. **Parity/byte claims are unaffected** — determinism is not`
- CLAUDE.md:1419 — `unselected: 'batter_hits' O0.5 median **+0.3 pp**, under-has-edge **47%**; all 0.5 lines **+0.6 pp`
- CLAUDE.md:1423 — `'expAB' recovered from 45 'case' strings: median **4.1** (3.5–4.5), so the +4.8 pp error is at REAL`
- CLAUDE.md:1467 — `**Sim minus closed-form 'pModel':** hits +9.2 pp median, TB +5.0, HR +1.2, HRR 0.0 (control).`
- CLAUDE.md:1495 — `leaves pitcher markets at 100%.** Implied park error on a closed-form row: hit rate median 1.5%`
- CLAUDE.md:1496 — `/ max 3.5%; **HR rate median 4.5% / p90 11.0% / max 14.5% (PNC)**. 'batter_home_runs' bleeds most.`
- CLAUDE.md:1508 — `**'shLaborF''s dead zone is by design and correctly centred** — 141 starters, median 89.7 ppg,`
- CLAUDE.md:1563 — `underway are gone from the odds API. Kept games median first pitch **22.68 UTC** vs **18.18**`
- ENGINE2.md:67 — `the modal total point (Shin + weighted-median fair, Caesars quote captured); the sim`
- ENGINE2.md:79 — `median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in`
- PARLAY_LAB_QUANT_ENGINE.md:89 — `- **Consensus probability:** de-vig per book, then aggregate across books (median or weighted mean; make weighting configurable so sharper books can be up-weighted later).`
- docs/auto-lock-memo.md:315 — `Reference-snapshot lead: median **155 min** before first pitch (min 1, max 775) — **so every figure`
- docs/auto-lock-memo.md:348 — `At >180: **mean 1.20, median 0.86, p99 5.59, max 11.42.** The tail is ~13× the median. A criterion` [x2]
- docs/auto-lock-memo.md:488 — `closes captured **3–14** (median ~5). A capture restricted to events with first pitch inside the`
- docs/auto-lock-memo.md:1039 — `| market | n | min | p25 | **median** | p75 | max | **CV = √((1−p)/p) at median** |` [x2]
- docs/auto-lock-memo.md:1166 — `| market \| rung | n | p10 | median | p90 | **share inside HR's 15.1–30.9% band** |`
- docs/auto-lock-memo.md:1181 — `47.8% median, TB 1.5 at 45.9%), because an *alternate rung on a high-probability market is still a`
- docs/auto-lock-memo.md:1183 — `at a **2.2% median**, far *below* the band. **Admitting rungs widens the gap; it does not close it.**`
- docs/auto-lock-memo.md:1249 — `…41** | 'row.ln!==0.5' on HR | **every HR rung but anytime** — 7,467 rows at 1.5 and 3,254 at 2.5 in the archive | **yes, done** — HR\|1.5 sits at a 2.2% median | now, as of today |`
- docs/auto-lock-memo.md:1266 — `§H10 excludes HR 1.5/2.5. Lifting it adds rows at a 2.2% median, which **widens** HR's CV gap`
- docs/auto-lock-memo.md:1269 — `board measurement taken this session, including §H10's per-market medians. **Nothing on disk`
- docs/auto-lock-memo.md:1345 — `| market | rows | **dropped** | share | unmatched | median implied kept / dropped |`
- docs/auto-lock-memo.md:1353 — `**'ab30' of the dropped rows: min 5, median 16, max 24** — genuine low-AB players (callups, platoon,`
- docs/auto-lock-memo.md:1356 — `**🔴 THE DROP IS SMALL AND PRICE-NEUTRAL — THE SECOND BRANCH FIRES.** The kept/dropped median`
- docs/auto-lock-memo.md:1369 — `| **§H10 CV table and per-market medians** | **the BOARD — post-filter** | **yes, by ≤4.5% of rows, price-neutral** — medians shift negligibly and the 15.1–30.9% band is unchanged …` [x2]
- docs/auto-lock-memo.md:1407 — `**Simulation, 2,000 runs, 90% band ('branch-firing-audit.md' L940–946): 2026-08-01 → median 4,`
- docs/auto-lock-memo.md:1408 — `band [2, 6]. OBSERVED: EXACTLY 4.** Not merely inside the band — **on the median.** Observed rate`
- docs/auto-lock-memo.md:1421 — `would falsify uniform assignment — **does not fire**: today's 4 is one observation at the median,`
- docs/auto-lock-memo.md:1483 — `| **CV table and per-market medians (§H10)** | **POST — board rows** | 1 |`
- docs/auto-lock-memo.md:1498 — `| | n | min | p1 / p10 | median | p90 / p99 | max |`
- docs/board-timing.md:36 — `Median first pitch **19:07 UTC**.`
- docs/branch-firing-audit.md:322 — `**n = 7. min 2.8 · p25 18.2 · median 32.6 · p75 35.1 · max 88.0 · mean 38.5 minutes. 7/7 inside`
- docs/branch-firing-audit.md:341 — `…phase2_series_b' (model-vs-close slope) | close-side fair prices | **yes** — a far-from-pitch close attenuates the slope toward zero. Measured median 32.6 min: **not attenuated** |`
- docs/branch-firing-audit.md:399 — `| delivery band | producing cron | paid snaps | ev/snap | median lead | **closes** | share of all props spend |`
- docs/branch-firing-audit.md:421 — `- cron: "0 17 * * *" # -> 20:0x-20:5x, 19/20 days. The same-day 'pre', median lead 112 min.`
- docs/branch-firing-audit.md:639 — `median **1.041** · p75 **1.127** · max **1.388**.`
- docs/branch-firing-audit.md:944 — `| date | armed, median | 90% band |`
- docs/cfb-desk.md:30 — `| 'pinnacleWeight' | 2 | Pinnacle counts twice in the weighted median |`
- docs/cfb-desk.md:38 — `3. Consensus per market = weighted median across books (Pinnacle ×2); null under 'minBooks'.`
- docs/cfb-desk.md:94 — `…s'): O/U pairs devigged per book at the same point; the consensus line is the weighted median of posted lines (always a posted line); fair = the true median of the devigged probabi…` [x2]
- docs/collection-period.md:625 — `…it keeps HR out of CORE, and a separate unnamed literal keeps it out of MIXED. Measured basis added 2026-08-01: CV 1.97 at HR's median implied vs 0.70–1.03 for every other market |`
- docs/collection-period.md:737 — `2026-07-26): median **−5.60%**, p25 −7.00%, **max −0.60%**, and **1 of 205 clears −1% even`
- docs/collection-period.md:1230 — `| market | n | p25 | **median** | p75 | p90 | fair overstated by | relative | czEV overstated by |`
- docs/collection-period.md:1239 — `total bases **+0.70 pp** median / +1.59 p90, H+R+RBI +0.63 / +1.40, outs +0.61 / +1.46.`
- docs/collection-period.md:1937 — `| market | 'books' (pool) | 'booksInd' min / median / max | rows at 'booksInd == 0' |`
- docs/collection-period.md:1943 — `the deepest in the system — the line-history archive puts the ML pool median at 31 books.`
- docs/collection-period.md:2041 — `| market | pool | 'booksInd' min / median / max | rows at 0 |`
- docs/collection-period.md:2047 — `deepest in the system — line-history puts the ML pool median at 31 books. Reaching 0 would`
- docs/collection-period.md:2399 — `buckets** (|gap| median 2.3, max 4.8), while 'high 10-20' and 'high 20+' — the "tail"`
- docs/collection-period.md:2540 — `snapshots rather than real market removal; excluding them the median drop is **~20%**.`
- docs/collection-period.md:2544 — `1. **The close is not free.** Even for rows that existed in the morning, ~20% (median) have`
- docs/collection-period.md:2683 — `median **0.5060**, against the stored proportional **0.5057** — different numbers, as`
- docs/collection-period.md:2822 — `| leg consensus EV | min −12.6% · p25 −7.6% · **median −7.1%** · p75 −5.7% · max −1.7% |`
- docs/collection-period.md:2836 — `> **Measured median −7.10% − structural hold −3.43% = ~3.67 points of GENUINE consensus`
- docs/collection-period.md:2858 — `raw −7.10% median is the measurement.`
- docs/collection-period.md:2905 — `| market | n | p25 | **median** | p75 | p90 |`
- docs/collection-period.md:2924 — `| market | n distinct | **median** | board median | ratio | 95% CI (game-clustered) |` [x2]
- docs/collection-period.md:2995 — `(12.5%). Its board-wide median gap of **23.1 pp is 3× the board median and 8× 'rl''s**. That` [x2]
- docs/collection-period.md:3365 — `> ≥10 boards** (~25 close rows/day → ~2 weeks post-repair), **|median(pModel −`
- docs/collection-period.md:3366 — `> close_fair)| ≤ 3 pp** and the sim-priced subset's median residual **≤ 3 pp** (today:`
- docs/collection-period.md:3439 — `| h to first pitch | rows | mean 'n' | median | **'n ≤ 1'** | 'czf' |`
- docs/collection-period.md:3454 — `'median n = 1.0' at every horizon is the number that matters more than the mean.`
- docs/collection-period.md:3458 — `A 16:00 UTC board against a 23:15 median first pitch is **~7 h out**; a 22:00 board is **~1.25 h`
- docs/collection-period.md:4594 — `| | median | p90 | max |`
- docs/collection-period.md:4603 — `the 4.5% median / 14.5% max error. 'batter_total_bases' is next (a home run is 4 bases, so the`
- docs/collection-period.md:4605 — `in percentage terms (1.5% median) but on the most rows.`
- docs/collection-period.md:4668 — `| min | p10 | p25 | **median** | p75 | p90 | max |`
- docs/collection-period.md:4679 — `Quartiles and the median are unaffected.`
- docs/collection-period.md:4738 — `| market | n | **median** | p10 | p90 | mean abs | max abs |`
- docs/collection-period.md:4758 — `other three is not machinery — it is that every hits/TB/HR price moves by a median 1.2–9.2 pp,`
- docs/collection-period.md:4784 — `| **3** | **'shParkF' → closed form** | hit rate **1.5% median / 3.5% max**; **HR rate 4.5% median / 11.0% p90 / 14.5% max** | **the residual after 1 and 2** — pitcher K's permanen…` [x2]
- docs/collection-period.md:4800 — `…ected effect** | closed-form batter rows move by the per-venue error above: hits ±1.5% median, HR ±4.5% median / 14.5% max. **Directionally it removes a known bias rather than addi…` [x2]
- docs/collection-period.md:4935 — `**Median across a realistic grid: +4.9 pp. Re-priced on the board's own 36 hits O0.5 rows,`
- docs/collection-period.md:4936 — `inverting the engine's own λ: +6.3 pp median (p10 +5.8, p90 +6.8).**`
- docs/collection-period.md:5037 — `| | n | median | under-has-edge |`
- docs/collection-period.md:5096 — `median — de-vig noise against a 1.0 pp tolerance — against the model's **−23.4**. Everything else`
- docs/collection-period.md:5141 — `from 45 hits 'case' strings: min 3.5, **median 4.1**, p75 4.2, max 4.5. At λ = 0.958 and n = 4.1`
- docs/collection-period.md:5195 — `| Δmeasured — hits O1.5 residual minus the same player's O0.5 residual | **median +2.00 pp, mean +1.43** (n=18 pairs) |`
- docs/collection-period.md:5196 — `| Δpredicted — each row's own λ̂ and case-string expAB | **median +5.72, mean +5.75** (n=17) |`
- docs/collection-period.md:5207 — `Rungs elsewhere: **TB** O2.5 carries n=1 model-priced row and O0.5 is M8 (−22.6 median on this`
- docs/collection-period.md:5394 — `0.6994 = **+1.1 pp**. On the board's own parameters (λ median 0.930, sim PA overshoot +3.1`
- docs/collection-period.md:5445 — `these medians). 55 hits O0.5 legs joined across all four runs + closed form + market:`
- docs/collection-period.md:5447 — `| term | median pp | mean pp |`
- docs/cron-jobs.md:175 — `| **record** | **median delay AND its spread** (p10/p90, or IQR) — see below |`
- docs/cron-jobs.md:176 — `| **trigger** | **median delay under ~3 minutes → move Sunday to '30 17 * * 0'** |`
- docs/cron-jobs.md:177 — `| **if the median delay exceeds ~3 min** | **shift EVERY entry earlier by the observed median** — this is the DEFAULT response, not a fallback for Sunday. It is the correction GitH…` [x2]
- docs/cron-jobs.md:180 — `**Record the SPREAD, not just the median — they call for opposite responses.**`
- docs/cron-jobs.md:184 — `| median ≈ 0, tight spread | punctual | move Sunday to 17:30 |`
- docs/cron-jobs.md:185 — `| **median large, tight spread** | **a consistent offset** | **shift every entry earlier by the median — correctable** |` [x2]
- docs/cron-jobs.md:186 — `| median ≈ 0, **fat tail** | intermittent queueing | **NOT correctable by shifting.** A shift moves the median onto the wrong side and the tail still misses. Needs the self-pacing …` [x2]
- docs/cron-jobs.md:188 — `A punctual median with a fat tail and a consistent offset look identical in the median alone,` [x2]
- docs/cron-jobs.md:262 — `| median ≈ 0, tight | move Sunday to '30 17 * * 0'. Nothing else changes |`
- docs/cron-jobs.md:263 — `| median large, tight | shift **every** entry earlier by the observed median |` [x2]
- docs/cron-jobs.md:264 — `| **median ≈ 0, fat tail** | run the redundancy calculation above on the observed joint delays. Add fires only if the measured marginal gain justifies them. Do **not** shift the ho…` [x2]
- docs/cron-jobs.md:265 — `| large median **and** fat tail | shift by the median first, then re-run the redundancy calculation on the residual |` [x2]
- docs/cron-jobs.md:568 — `| dow | games | p10 | p25 | median | p75 | p90 | **started by 22:00 UTC** | shape |`
- docs/cron-jobs.md:618 — `| 'model' | '30 9' | 12:09–17:24, median ~15:1x | **+2.6 to +7.9 h**, median **+5.7 h** |` [x2]
- docs/freeze-exit-bundle.md:30 — `…he closed-form factors** | **VARIANCE, not level.** Per-row error today: hit rate 1.5% median / 3.5% max; **HR rate 4.5% median / 11.0% p90 / 14.5% max**. But across the 07-26 venu…` [x2]
- docs/freeze-exit-bundle.md:31 — `…m2-interlock.test.ts') | gap **−23.3 → −11.5 pp**; above-market rows **0/38 → 11/38**; median λ 13.7 → 15.3 — all PROVISIONAL pending the corrected pitcher estimator | **each other…`
- docs/freeze-exit-bundle.md:278 — `| pitcher outs | λ_model − λ_market **−2.48 outs (−0.83 IP) median, negative 38 of 38** | 'docs/pitcher-outs-audit.md' L100 | 38 rows, one board — a RATE gap in outs units, sign-de…`
- docs/harness-substitutions.md:770 — `**checking that recovery rather than assuming it** — median error −0.01 pp, max 0.26 pp`
- docs/harness-substitutions.md:976 — `| median calls per site | 161 |`
- docs/harness-substitutions.md:1022 — `| 'pitcher_outs' compression **CONFIRMED** | 20-board median ratio ≤ **0.70** and the p10–p90 band excludes 1.0 |`
- docs/harness-substitutions.md:1023 — `| **RETRACTED** as a board-specific artifact | median > **0.85**, or the distribution straddles 1.0 |`
- docs/harness-substitutions.md:1024 — `| the "**only** market below 1.0" claim | retracts if any second market's median falls below 1.0. Fixture-free baselines from 2026-07-26: outs 0.50, hits 1.32, HR 1.35, K's 1.72, H…`
- docs/harness-substitutions.md:1071 — `…e** — the gap keeps its sign across rungs | **the ladder finding is RETRACTED**, regardless of what the 20-board median says. A single-λ model cannot produce a rung-invariant gap |`
- docs/harness-substitutions.md:1200 — `the same instrument. So a twenty-board range-detector median agreeing with the one-board reading`
- docs/harness-substitutions.md:1243 — `gets the separate pre-commitment already recorded** — median ≤ 0.70 with p10–p90 excluding 1.0`
- docs/harness-substitutions.md:1244 — `confirms; median > 0.85 or straddling 1.0 retracts — and its independent check remains Phase 2's`
- docs/harness-substitutions.md:1491 — `| **M8**, the ladder finding, the outs audit, the park/consumer tables, 'expAB' median 4.1 | **REAL BOARD** | ✅ **not provisional** |`
- docs/hrr-recalibration.md:187 — `> | | min | p25 | median | p75 | max |`
- docs/hrr-recalibration.md:197 — `> | lineup status | n | median 'expAB' | median 'abG' | median ratio |` [x3]
- docs/hrr-recalibration.md:233 — `> | slot | n | median raw | max raw | rows > 1.15 |`
- docs/hrr-recalibration.md:249 — `> bottom-of-order alt lines**; the re-basing as built **raises** them (median 1.35 at #8),`
- docs/hrr-recalibration.md:270 — `> | 'abG' band | n | median model−market gap | median 'abG' |` [x2]
- docs/hrr-recalibration.md:451 — `> | correction factor | min 0.850 · **median 1.144** · max 1.150 |`
- docs/hrr-recalibration.md:464 — `> | line | n | median correction | median p_pre-fix | median p_post-fix | **median effect** | range |` [x4]
- docs/hrr-recalibration.md:487 — `> suspended ones. The re-basing contributes a median +4.8 pp of that — correctly, per the`
- docs/hrr-recalibration.md:522 — `> to go 6+ IP, and **−23.1 pp median, 0 of 38 rows above market**, on the 2026-07-26 board.`
- docs/hrr-recalibration.md:743 — `| | min | median | max | **spread** |`
- docs/hrr-recalibration.md:921 — `pool hid: **hits carries a real rung signature, +1.4 mean / +2.0 median pp at O1.5 relative to`
- docs/hrr-recalibration.md:946 — `wrong within hours, and the reason is worth keeping: it was reached from a pooled median over a`
- docs/multibook-memo.md:94 — `| per LEG: max(CZ,MGM) − CZ | **+1.01 pp mean** (median +0.00, p75 +1.60), **44% of legs improved** — empirically confirming the owner's dispersion arithmetic (analytic ≈ +0.95): e…`
- docs/multibook-memo.md:95 — `| per 3-leg SLIP, **one book per slip** (bootstrap 4,000 slips) | **+1.60 pp mean** (median +0.08 — tail value; p75 +2.66), **51% of slips improved**. The naive 3×-per-leg figure (…`
- docs/multibook-memo.md:96 — `…, so MGM's 07-26 prices are unrecoverable. The DK/FD-basis ticket numbers below (+3.20 median, 10 new clears) are unplayable-basis artifacts. **Follow-up, dated: the first day carr…`
- docs/multibook-memo.md:436 — `cz-absent rows carry median 1 book behind the fair vs 4 for cz-present (thin alt rungs).`
- docs/multibook-memo.md:547 — `1. Circa's two-way hold per market vs Caesars' (per-line 'iO + iU − 1', median per`
- docs/multibook-memo.md:566 — `both prices, per-leg EV(MGM) − EV(CZ) at the row's fair: **median +0.00 pp, mean +0.08**,`
- docs/multibook-memo.md:575 — `| best-of{DK,FD,MGM,CZ} vs settling blind at CZ | 511 | **+1.70 pp mean / +1.30 median**, 371 legs improved | ≈ **+5.1 pp** |`
- docs/multibook-memo.md:576 — `| **MGM's marginal increment over the current {DK,FD,CZ} basis** | 511 | **+0.75 pp mean** (median 0 — tail value), 170 legs improved | ≈ **+2.2 pp** |`
- docs/multibook-memo.md:579 — `DK/FD basis vs CZ: **median +3.20 pp, mean +7.13**. 17 tickets cleared +2% at CZ (they died`
- docs/multibook-memo.md:588 — `best-single-book-per-ticket (the +3.20 median above respects that), not per-leg best (the`
- docs/phase2-memo.md:40 — `… with 'mins'-to-pitch and day/night stamps; **spot-checked**: stored fair = recomputed median de-vig to 4dp on all samples (07-27: 6 events, 434 rows, 0 post-pitch) | **✅ built + s…`
- docs/phase2-memo.md:54 — `stored 'fair' equals the median per-book de-vig recomputed from the stored raw prices to`
- docs/phase2-memo.md:148 — `Measured on the real 2026-07-26 board: the legs the +2% gate selects sit a median of`
- docs/phase2-memo.md:149 — `**16.2 probability points** from the de-vigged market, against a board median of **7.6** —`
- docs/phase2-memo.md:386 — `| market | rung | n | median move | % up |`
- docs/phase2-memo.md:467 — `…26-07-22** | PA-conditioning re-basing shipped ('lam *= clamp(expAB/abG, .85, 1.15)') | median **+4.8 pp** on O0.5, **+4.7 pp** on O1.5 — pre- and post- rows are different models |`
- docs/phase2-memo.md:502 — `| matches the engine? | **yes** — same 'shShin2', same weighted median | no |`
- docs/phase2-memo.md:520 — `2. **Close fair** = weighted median over 'fp' of 'shShin2(imp(o), imp(u))' per book,`
- docs/phase2-memo.md:687 — `| | n | median first pitch (UTC) | p10 | p90 |`
- docs/phase2-memo.md:737 — `median first pitch 22.68 UTC kept vs 18.18 dropped). That does **not** make every archive-derived`
- docs/pitcher-outs-audit.md:6 — `while being 12.5% of board rows, at a board-wide median disagreement of **23.1 pp** — 3× the`
- docs/pitcher-outs-audit.md:7 — `board median, 8× 'rl''s — in a market the books price competently.`
- docs/pitcher-outs-audit.md:70 — `— 0 fair mismatches, ratio '(pO−fO)/(pModel−fair)' median **0.350** = 'wBlend'. Raw model`
- docs/pitcher-outs-audit.md:75 — `| market | n | median | mean | **% above market** |`
- docs/pitcher-outs-audit.md:100 — `> ### λ_model − λ_market = **−2.48 outs** (−0.83 IP) median. **Negative in 38 of 38.**`
- docs/pitcher-outs-audit.md:101 — `> Range −0.8 to −5.5 outs. Median λ_model 13.7 · λ_market 16.1.`
- docs/pitcher-outs-audit.md:128 — `| 'oo' observed | 0.303 – 0.492 (median 0.428) |`
- docs/pitcher-outs-audit.md:152 — `| median raw gap | **−23.3 pp** | **−11.5 pp** |`
- docs/pitcher-outs-audit.md:154 — `| median λ | 13.7 outs | 15.3 outs |`
- docs/pitcher-outs-audit.md:155 — `| median λ − λ_market | −2.48 outs | **−1.13 outs** |`
- docs/pitcher-outs-audit.md:240 — `| median (model − market), outs | ALL (38) | lines ≤15.5 (20) | lines ≥16.5 (18) |`
- docs/pitcher-outs-audit.md:254 — `Measured consequence: the shrunk estimator spans **4.67 → 6.17 IP/start** (median 5.32), and`
- docs/pitcher-outs-audit.md:454 — `| median raw model gap | **−23.3 pp** | **−11.5 pp** |`
- docs/pitcher-outs-audit.md:456 — `| median λ | 13.7 outs | 15.3 outs |`
- docs/pitcher-outs-audit.md:457 — `| median λ − λ_market | −2.48 outs | −1.13 outs |`
- docs/pitcher-outs-audit.md:459 — `| median (lines ≥16.5) | −3.03 outs | **−2.57 outs** — residual, see §8 |`
- docs/progress.md:96 — `… from that refreshed snapshot. Fixed football default-book fast path that could expose median-line probability against a different DK line; always resolves that book's line-specifi…`
- docs/progress.md:139 — `…('readBooksOf' under the half's σ, 'H1_SIGMA_SCALE = 1/√2', the same Pinnacle-weighted median at 'minBooks 2'); 'pHome' blends the 1H moneyline and the spread-implied chance at the…`
- docs/props-window-cron.diff:35 — `- cron: "0 17 * * *" # -> 20:0x-20:5x, 19/20 days. The same-day 'pre', median lead 112 min.`
- docs/session-handoff.md:484 — `… from that refreshed snapshot. Fixed football default-book fast path that could expose median-line probability against a different DK line; always resolves that book's line-specifi…`
- docs/session-handoff.md:852 — `…normal curve (σ 16.5 margin, 18 total, HFA 2.6, 0 at neutral sites), Pinnacle-weighted median consensus across 'us,eu' books, blend {market .60, spread-implied .25, FPI .15} for wi…` [long line; 1 occurrences on this line; first shown]
- docs/session-handoff.md:856 — `…-server.ts'); O/U pairs devigged per book at the same point, consensus line = weighted median of posted lines, fair = true median of the devigged probs (null under 'CFB_PROPS.minBo…` [long line; 2 occurrences on this line; first shown]
- docs/session-handoff.md:3062 — `**drops 19 of 24 ticks** and the delay is **40–80 min, median ~56** (§0.16). **The delay is larger`
- docs/session-handoff.md:3104 — `First pitch, time-of-day: **earliest 16:10Z · median 16:30Z · latest 19:05Z.**`
- docs/session-handoff.md:3130 — `**All 26 Saturdays are split slates** (≥90-min gap; median gap **143 min**). First pitch, time-of-day:`
- docs/session-handoff.md:3131 — `**earliest 15:05Z · median 17:10Z · latest 20:10Z** — a five-hour spread.`
- docs/session-handoff.md:3679 — `> **THE DELAY IS 40–80 MINUTES, MEDIAN ~56. THE ~3-HOUR ASSUMPTION THE PAIR WAS PLACED ON IS WRONG`
- docs/session-handoff.md:3690 — `**THE FIX IS ARITHMETIC, NOT ARCHITECTURE.** At a ~56-minute median, a capture landing 60–120 minutes`
- docs/session-handoff.md:4841 — `rows · 149 games · 16 fixture-days.** Reference lead median **155 min**, so **every figure is a`
- docs/session-handoff.md:4857 — `finding the mean hides: median 0.86 against p99 5.59 and max 11.42.`
- docs/session-handoff.md:4863 — `| market | median implied | **CV = √((1−p)/p)** |`
- docs/session-handoff.md:4882 — `| market | rows | dropped | share | median implied kept / dropped |`
- docs/session-handoff.md:4890 — `'ab30' of dropped rows: **min 5 · median 16 · max 24.** **The drop is small and PRICE-NEUTRAL**, so`
- docs/session-handoff.md:4898 — `| | n | min | p1 | median | p99 | max |`
- docs/session-handoff.md:4910 — `Simulation (2,000 runs, 90% band, 'branch-firing-audit.md' L940–946): **2026-08-01 → median 4,`
- docs/session-handoff.md:4911 — `band [2, 6]. OBSERVED: EXACTLY 4.** On the median. Observed **4 crossings in 3 days = 1.33/day**`
- docs/session-handoff.md:4969 — `| **POST — board rows / tickets** (4) | **the CV table and per-market medians · the 07-26 HR-pair exposure census · the simJoint implied-ratio audit · the clamp census** |`
- docs/session-handoff.md:5117 — `still a high-probability event, and **HR's own rungs go the other way at a 2.2% median.**`
- docs/session-handoff.md:5342 — `| 6 | "the delay distribution killed fixed-hour targeting" | **median ~56 min, spread ~40 — fixed hours work** | **more measured than exists** |`
- docs/session-handoff.md:5567 — `79 singleton blocks (the night-game shape), bulk at 7–12. Median inter-block gap 2.42h,`
- docs/session-handoff.md:6085 — `fetch burned-down slates (§0.004). The Vercel case stands on the **hours** (median ~56-min`
- docs/session-handoff.md:7748 — `matched deliveries ran **+40, +44, +56, +66, +80 minutes** behind their declared hours — **median`
- docs/session-handoff.md:7752 — `> median, a capture landing 60–120 min before a ~23:05Z first pitch wants **≈ '20 20 * * *'**, not`
- docs/singles-vs-parlays.md:69 — `| min | p25 | median | p75 | max | clearing −1% |`
- docs/singles-vs-parlays.md:108 — `| card | n legs | min | p25 | median | p75 | max | **mean** |`
- docs/singles-vs-parlays.md:741 — `| min | p25 | median | p75 | max |`
- docs/singles-vs-parlays.md:750 — `> The median same-game group is worth **+2.9%** over the naive product, and **nothing on the`

##### median — tools (38 lines)

- .github/workflows/props-history.yml:27 — `# 20-21Z 17 paid, 7.9 ev/snap, median lead 112 min -> 0 closes (17 min outside the window)`
- .github/workflows/props-history.yml:28 — `# 23Z 4 paid, 6.2 ev/snap, median lead 18 min -> 4 closes`
- .github/workflows/props-history.yml:29 — `# 00Z 3 paid, 4.0 ev/snap, median lead 85 min -> 3 closes`
- .github/workflows/props-history.yml:30 — `# 06-11Z 33 paid, 13.5 ev/snap, median lead 508 min -> 0 closes, and 72% OF ALL SPEND`
- .github/workflows/props-history.yml:35 — `- cron: "0 17 * * *" # -> 20:0x-20:5x, 19/20 days. The same-day 'pre', median lead 112 min.`
- tools/board_window.py:18 — `and the delay itself is **40-80 minutes, median ~56** (session handoff §0.16). **The delay is`
- tools/close_capture.py:115 — `# median first pitch 22.68 UTC for kept vs 18.18 for dropped. Whether the retimed cadence`
- tools/close_fair.py:13 — `(median across books of the per-book two-sided de-vig, iO/(iO+iU)) and prints stored vs`
- tools/close_fair.py:22 — `from statistics import median`
- tools/close_fair.py:70 — `print(f"\nSPOT CHECK — stored 'fair' vs median per-book de-vig from the stored raw prices:")`
- tools/close_fair.py:75 — `rec = median(per_book) if per_book else None`
- tools/first-sunday-six-history.py:85 — `…m(r['tieCount']>1 for r in slates),'latestCompletedDate':max(r['date'] for r in rows),'medianFirstTDSeconds':statistics.median(r['elapsed'] for r in training if r['elapsed'] is not…` [x2]
- tools/hrr_pa_audit.py:12 — `ANSWER ON THE 2026-07-26 BOARD: no, and no. Median correction 1.144; 38 of 44 rows are`
- tools/hrr_pa_audit.py:59 — `print(f" correction factor: min {min(x['corr'] for x in out):.3f} median {med([x['corr'] for x in out]):.3f} max {max(x['corr'] for x in out):.3f}")`
- tools/hrr_pa_audit.py:81 — `print(f" O{ln}: median {med(b):.1f} pp (n={len(v)})")`
- tools/hrr_pa_audit.py:86 — `print(f" O{ln}: median {med(g):+.1f} pp n={len(v)}")`
- tools/ledger-report.mjs:268 — `if (ll.n) console.log(' min ${ll.min} median ${ll.p50} max ${ll.max}');`
- tools/m10_eiv.py:113 — `print(f"\npooled λ̂ median {lam:.3f}, expAB median {eabm:.1f} → "` [x2]
- tools/outs_audit.py:10 — `median disagreement of 23.1 pp. Two defects were found and neither is board-specific in`
- tools/outs_audit.py:83 — `print(f"{'market':<24}{'n':>6}{'median':>9}{'mean':>8}{'%>0':>7}")`
- tools/outs_audit.py:141 — `print(f" lamModel - lamMkt median {med(dl):+.2f} outs ({med(dl)/3:+.2f} IP)"`
- tools/outs_audit.py:143 — `print(f" with {OF_CONST_AS_BUILT} -> {OF_CONST_CORRECT} median {med(dlf):+.2f} outs"`
- tools/phase2_series_b.py:130 — `print(f"\n open_fair of SURVIVING rows: p10 {q(kept,.10):.3f} median {med(kept):.3f} p90 {q(kept,.90):.3f}")`
- tools/phase2_series_b.py:135 — `print(f"{'market':<26}{'rung':>6}{'n':>7}{'median':>9}{'p25':>8}{'p75':>8}{'|move|med':>11}{'%up':>6}")`
- tools/price-path.mjs:15 — `* median P(over), 'compact()' in tools/snapshot_props.py — in PERCENTAGE POINTS, bucketed by the`
- tools/price-path.mjs:120 — `console.log('REFERENCE-SNAPSHOT LEAD (minutes before first pitch): median ${f(rl.p50, 0)} min ${f(Math.min(...refLeads), 0)} max ${f(Math.max(...refLeads), 0)}');`
- tools/range_compression.py:50 — `(where the true 'pModel' is stored) the error is median -0.01 pp, p05/p95 -0.17/+0.16,`
- tools/range_compression.py:158 — `f"median {err[len(err)//2]:+.2f} pp, p05 {err[int(.05*len(err))]:+.2f}, "`
- tools/rung_signature.py:20 — `rows without a case-string expAB fall back to the slate median ONLY in the labelled column.`
- tools/rung_signature.py:163 — `print(f" O{ln}: n={len(rs)} median(model−market) {med([r[1] for r in rs]):+.1f} pp"`
- tools/rung_signature.py:188 — `print(f" Δmeasured (rung − 0.5 residual): median {med(meas_all):+.2f} pp"`
- tools/rung_signature.py:195 — `print(f" Δpredicted (own expAB): median {med([p for _, p in pairs]):+.2f} pp"`
- tools/selection_effect.py:9 — `The pooled ratio median|pModel-implied| over SELECTED legs / same over the BOARD came out`
- tools/self_consistency.py:165 — `print(f"{name:<24}{len(mo):>5}{bm:>11}{st.median([x['delta'] for x in mo]):>+8.1f}"`
- tools/self_consistency.py:166 — `f"{bk:>13}{st.median([x['delta'] for x in mk]):>+8.1f}{flag}")`
- tools/snapshot_props.py:47 — `def median(xs):`
- tools/snapshot_props.py:53 — `"""per market/player/line: Caesars O/U, cross-book proportional-devig median`
- tools/snapshot_props.py:105 — `"fair": round(median(r["fairs"]), 4) if r["fairs"] else None,`
