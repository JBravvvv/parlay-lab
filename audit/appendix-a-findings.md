<!-- Part of AUDIT.md (repo root). Split out for size; content unchanged. -->

# Appendix A. Full record of every medium and low finding

In the rank order of the table in section 4.1. Text is the area auditor's, unchanged; the reviewer's note follows where one exists.

### A.1 Medium findings

<a id="f-c1-2"></a>
#### C1-2 — FanDuel is never the lock price on any path: EV gate, stake and settlement all use DraftKings even when FanDuel is better (owner can bet both)

- Severity: medium. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** MLB: src/lib/server/lock-card.ts:158 (row needs czDec AND bsDec), :1149 (`!(ev > 0)` where ev is the DraftKings czEv -> found_no_edge), :1183 (`foundStake(c.prob/100, c.dec, room)` at the cz price), :1207-1229 stored ticket carries settlementBook + czDec; src/lib/ticket-payout.ts:34-43 settlingDec = confirmed -> czDec -> czOdds (bsDec never settles). Football: src/lib/cfb/found.ts:90 (`priceFootballProp(r, "draftkings", ...)`), :138 (`r.cz != null && r.evCz != null ... r.evCz >= ...`). Command: python3 /private/tmp/claude-501/audit-out/scripts/areaC_fd.py over 27 archived boards >= 2026-09-18 (1,461 pregame straight-market category rows excl. HRR overs): shrunk EV>0 at DK 62; at better-of-DK/FD 77; +EV at bs but not cz 16; cz missing but bs present 11; rows where the bs price beats cz 273 of 1,000. Example archived ML row: bs -102 (bsBook FD) vs cz -103, czEv 0, bsEv 0.5.

**Impact.** Paper profit and volume: about 24% more qualifying straights (77 vs 62) are left unlocked, 11 FanDuel-only rows can never lock, and on roughly 27% of two-book rows the paper record is graded at a worse price than the owner could actually take. The record therefore understates achievable ROI and the EV gate rejects bets that are +EV at the owner's other legal book.

**Proposed fix.** Evaluate EV and Kelly at max(DK, FD) per selection, stamp the chosen book and its unrounded price on the ticket (per-ticket settlementBook = the chosen book), and settle at that price. Allow a row with only one of the two books priced. Apply the same rule in found.ts (rows and props).

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but the impact is overstated; I rate it medium, not high.

CODE (all opened; line numbers match the finding):
- src/lib/sportsbook/books.ts:11-12: SETTLE_BOOK = 'draftkings', commented as the book every grade, EV and Kelly stake is computed at.
- src/lib/server/lock-card.ts:158: a straight row is skipped unless both czDec and bsDec exist.
- lock-card.ts:1147-1150: the gate reads `Number(pl.czEv)` and `Number(pl.czDec)`; `!(ev > 0)` counts as found_no_edge. bsEv is computed (:182, and src/lib/shrink.ts:80) but never used for the gate.
- lock-card.ts:1183: `foundStake(c.prob / 100, c.dec, room)` sizes at the cz price.
- lock-card.ts:1223: every ticket is stamped with the single engine settlementBook (:1096, `CAESARS_KEY` rebound to DraftKings per src/engine/index.ts:297-300).
- src/lib/ticket-payout.ts:34-43: settling price is confirmed -> czDec -> czOdds. The engine grader in src/engine/legacy-src.gen.ts does the same (`baseDec=(t.confirmed!=null)?amToDec(t.confirmed):t.czDec`).
- Football: src/lib/cfb/found.ts:90 prices props at "draftkings"; :97-98 and :138 gate on r.cz / r.evCz; src/lib/cfb/grade.ts settle() multiplies `legs[i].cz`. found.ts:42 states every leg's price is the DraftKings quote.
- No guard or alternate path prices at FanDuel. The branch az-two-book-anytime is the same commit as frontend-rebuild (8ab9e46), so no two-book work exists yet.

DATA: I re-ran scripts/areaC_fd.py and the numbers reproduce exactly (27 boards, 1,461 rows, 62 / 77 / 16 / 11 / 273 of 1,000). My own breakdown is in /private/tmp/claude-501/audit-out/verify-c1-2/chk.py and chk2.py.

CORRECTIONS TO THE IMPACT:
1. This is deliberate design (INSTRUCTION 67, single settlement book), not a bug. It is a missed line-shopping opportunity under the Arizona DK+FD premise.
2. The "27% graded at a worse price" figure does not apply to the record. 273 of 1,000 is over all rows; of the 62 rows that pass the DK EV gate, only 5 (8%) have a better FanDuel price, worth 0.5 to 4.4 EV points each.
3. The 11 FanDuel-only rows add nothing in this sample: none is +EV at FanDuel after shrink. All 16 "bs but not cz" rows have a DK price present.
4. The volume gain is small and mostly predates found mode. The 15 extra rows sit over 27 board-days, 12 of them on 09-19 to 09-27; on boards from FOUND_SINCE (2026-10-03) only 3 extra rows appear (10-06, 10-07, 10-11). These are raw row counts before the leg, player-market, under-bias and minimum-stake gates.
5. `bs` is not a strict max(DK, FD). 23 of 1,000 two-book rows have bs below cz (e.g. 2026-10-15 Glasnow K's O 6.5: cz +126, bs +114 FD), and one DK-positive row is not bs-positive, which is why 62 + 16 does not equal 77. The fix must compute the max explicitly from both quotes.
6. Several extra rows show very wide DK/FD gaps on the same label (Tatis Hits O 1.5 +159 vs +210; Javier K's O 4.5 -108 vs +108). I could not determine whether these are same-line quotes or stale/mismatched ones; a best-of gate would favour such outliers and needs a freshness and same-line check.

FIX NOTES: The direction is right. The football rows already carry a `best` quote (src/lib/cfb/types.ts:127-128) and priceFootballProp takes a book argument. Per-leg settlementBook is already read by CLV (src/lib/server/clv-core.ts:86, :156-183). The football grader would need the chosen book's price written into the leg, since it settles on legs[i].cz.

Severity is medium because it is paper-only, errs conservative, corrupts no data, and the measured effect is small.

<a id="f-b2-4"></a>
#### B2-4 — FanDuel is never a bet price in football although the owner can bet it; it had the better price on 26 of 57 rows

- Severity: medium. Area: football model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** playable and evCz are tied to the settle book only (src/lib/cfb/model.ts:516-518); found game-line filter reads r.cz / r.evCz (src/lib/cfb/found.ts:138); found props are priced at the literal "draftkings" (found.ts:90); FanDuel is carried only as a reference quote (model.ts:397; fd field at src/lib/cfb/types.ts:130). Probe /private/tmp/claude-501/audit-out/b-football/probe2.ts on the real CFB capture (probe2.out.txt): rows with both DK and FD quotes at dec <= 2.6: 57; FanDuel EV higher on 26; mean EV gain of best-of-two over DraftKings-only 0.66 pp (0.67 with FPI removed).

**Impact.** Line shopping across the two legal books is worth about two-thirds of a point of EV per bet on this slate, which is larger than most of the stated edge at a +1% floor, and it is free. The paper record understates what the owner could actually get and overstates nothing.

**Proposed fix.** Price every row at both draftkings and fanduel, bet the better of the two (same leave-one-out fair), and store the book on the ticket so grading and any closing-line check use the right price.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Structural claim confirmed; impact claim overstated, so high -> medium.

CONFIRMED IN CODE
- src/lib/cfb/model.ts:516-518: evCz = evAt(sq.cz), playable = !!sq.cz && upcoming; sq.cz is the settle-book quote (model.ts:397, 508). Kelly is sized at sq.cz only (model.ts:519-523).
- settleBook is "draftkings" for both football leagues: src/lib/cfb/rules.ts:77 and :476, src/lib/nfl/rules.ts:68 and :197; SETTLE_BOOK at src/lib/sportsbook/books.ts:12.
- Found game-line filter reads r.playable / r.cz / r.evCz only (src/lib/cfb/found.ts:138); found props priced at the literal "draftkings" (found.ts:90); the core card does the same (src/lib/cfb/card.ts:249). Neither found.ts nor card.ts references evBest / best / fd.
- fd is carried on the row (src/lib/cfb/types.ts:130; model.ts:397).
- No guard elsewhere makes the automatic paper card consider FanDuel.

PROBE REPRODUCED
I rebuilt the probe independently (/private/tmp/claude-501/audit-out/verify-b2-4/v.ts, v.cjs). Same headline numbers: 57 rows quoted by both books at dec <= 2.6, FanDuel EV higher on 26, mean best-of-two lift 0.661 pp (0.669 with FPI removed).

CORRECTIONS
1. The 0.66 pp is NOT "per bet". It is the mean over all 57 both-quoted rows, nearly all negative-EV rows that never clear the gate. On the rows that actually clear the +1% floor at DraftKings (4 rows with FPI), best-of-two lift is 0.005 pp total: FanDuel was worse on two (3.60 vs -1.35; 3.14 vs 0.22), equal on one (6.07 vs 6.07) and 0.02 pp better on one (2.60 vs 2.62). Best-of-two adds zero new qualifying rows (4 at DK, 4 at best-of-two; with FPI removed 0 and 0). The auditor's own probe2.out.txt already prints ">=+1% at DK 4, at FD 2, at best-of-two 4" and the finding omitted it. So the sentence "larger than most of the stated edge at a +1% floor" is not supported: on this slate the measured gain on bets is nil.
2. Evidence base is one slate: a single 14-event test fixture (tests/fixtures/cfb/odds-ncaaf-2026-09-05.json, 12 games priced, 72 full-game rows). No football price history exists in pl-history, so the size of the effect in general could not be determined. No NFL data was tested.
3. 14 of the 57 comparisons are at different lines (DK vs FD spread/total points differ); there the "FanDuel better" verdict depends on the model's line-to-probability mapping, not a pure price comparison. Same-line/ML subset: 43 rows, FanDuel price strictly better on 17.
4. "FanDuel is carried only as a reference quote" is slightly too strong. The client can reprice every football row and prop at any chosen book including FanDuel (src/lib/sportsbook/football.ts:14-19 priceFootballRow, :38 priceFootballProp, via useFootballPrices in src/lib/sportsbook/useFootballPrices.ts:8-9). That is display/manual-builder only; the automatic found card and core card remain DraftKings-only, which is the finding's real point.
5. The fair is a weighted median over all books including DK and FD (model.ts:415-419), not leave-one-out. Picking the better of two books against a consensus fair that contains both also raises selection bias, so the proposed fix needs the leave-one-out fair it mentions to exist first; it does not today.

SEVERITY
Medium. It is a real design gap against the stated constraint (owner can bet DraftKings and FanDuel; the paper card only ever prices DraftKings, a deliberate INSTRUCTION 67 choice per books.ts:11). But it is paper trading, errs conservative (understates, never overstates, the record), and the only data on disk shows no change to which bets fire and no material price gain on them.

FIX
Proposed fix is sound in direction. It must also carry the book through grading/CLV and ticket labels (found.ts:246 text hardcodes "at DraftKings"; legs store the price in a field named cz).

<a id="f-b2-3"></a>
#### B2-3 — With only DraftKings and FanDuel there is no independent consensus: game-line 'fair' becomes the lower of two numbers and prop 'fair' is half DraftKings

- Severity: medium. Area: football model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Consensus = weightedMedian over every bookmaker in the response, settle book included (src/lib/cfb/model.ts:345, 380-383, 415-419); minBooks 2 (src/lib/cfb/rules.ts:76, src/lib/nfl/rules.ts:67). weightedMedian returns the first value where cumulative weight >= half (src/engine2/devig.ts:76-85): probe section K shows weightedMedian([0.52,0.48],[1,1]) = 0.48 and ([3.1,2.4]) = 2.4. Props fair = median of books posting exactly the line, minBooks 2, DraftKings included (src/lib/cfb/props.ts:204-215; src/lib/cfb/rules.ts:475). Probe run restricted to draftkings+fanduel, FPI removed (section D): 0 candidates; mean DK EV spread:home -5.07 vs spread:away -3.82, total:over -5.37 vs total:under -3.63. Same rows with all books (section B): -4.28 / -4.62 and -4.73 / -4.25. Leave-DraftKings-out on the full 22-23 book feed (section E): mean |EV change| 0.08-0.09 pp, same 4 candidates.

**Impact.** Stated plainly: in a DK+FD-only feed the model has no signal on totals, 1H or props, and on sides only FPI. The two-book median hands away/under rows 1.3-1.7 pp of EV relative to home/over purely from the lower-middle rule. For props, fair = (DK no-vig + FD no-vig)/2, so a +1% bet at DK needs FanDuel's no-vig probability about 11% (relative) above DraftKings' (my arithmetic, 4.5% hold per side): it fires only when FanDuel is stale or an outlier. Circularity is immaterial on today's 22-23 book game lines (measured) but is structural wherever book count is small, which is the prop case today.

**Proposed fix.** Keep the wide feed for the fair price and never narrow it to the two bettable books. Build fair leave-one-out (exclude the book being bet), require at least 3 non-settle books at the line for a bet, and use a true median (average the two middles) on game lines as props already do. If the feed ever is only DK+FD, show the price gap but lock nothing.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The code facts and probe numbers are confirmed, but the headline scenario (a DK+FD-only feed) does not occur in the current code, so I rate this medium, not high.

**What I confirmed**
- Game-line consensus loops over every bookmaker with no settle-book exclusion (src/lib/cfb/model.ts:345) and takes `weightedMedian` once `minBooks` is met (model.ts:380-382, 415-419). First-half lines reuse it (src/lib/cfb/h1.ts:38-42).
- `minBooks` is 2 and `settleBook` is draftkings (src/lib/cfb/rules.ts:76-77, 475-476; src/lib/nfl/rules.ts:67-68, 196-197).
- `weightedMedian` returns the first value where cumulative weight reaches half, so two equal-weight books give the lower value (src/engine2/devig.ts:76-85).
- Totals are pure market consensus: `model.muTotal = mktTotal` (model.ts:458). FPI enters only the win probability and margin (model.ts:420-454).
- Prop fair is a true median of books at the exact line, DraftKings included (src/lib/cfb/props.ts:204-215, 268, 309). With exactly two books that is (DK + other)/2.
- No book-count guard exists downstream: found-mode gates on EV, fair and price only (src/lib/cfb/found.ts:98, 138).
- The probe output matches every cited figure (/private/tmp/claude-501/audit-out/b-football/probe.out.txt sections A-E, K). It runs the real `buildCfbBoard`.
- The "about 11%" arithmetic holds: at -110/-110, +1% EV needs fair of at least 0.529, so FanDuel's no-vig must be at least 0.558 against DraftKings' 0.50.

**Corrections to the evidence**
- Nothing narrows the feed to two books. Game lines pull `regions=us,eu` (src/lib/cfb/rules.ts:367, src/lib/nfl/rules.ts:170) and props pull `regions: "us"` (rules.ts:474, nfl/rules.ts:195). No `bookmakers=` filter exists anywhere in src.
- The probe data is one test fixture (tests/fixtures/cfb/odds-ncaaf-2026-09-05.json, 12 games, n=12 per cell), not stored history. The 1.3-1.7 pp side bias is a single-slate figure.
- "Small book count is the prop case today" is not supported by anything on disk. Both football prop fixtures are synthetic with four books (the NFL one says so in its `_note`), and pl-history holds no football prop data.
- "Prop fair is half DraftKings" is true only at lines where exactly two books post. Props already use a symmetric median, so there is no over/under side bias there.
- At exactly two prop books the rule is conservative in count: it fires only on a large DK/FD disagreement. The risk is false positives on thin evidence, not volume.

**Impact**
On today's 22-23 book game lines the circularity is measured at 0.08-0.09 pp with the same four candidates, so it is immaterial. The live exposure is props at lines with only two books, where DraftKings is half its own fair and found-mode can still lock. It is paper trading only.

**Fix**
The direction is sound: keep the wide feed, build fair leave-one-out, and require at least three non-settle books to lock. One correction: apply the true median only to the probability and implied-margin medians (`pHome`, `mu`, `muT`). `spreadLine` and `totalLine` must stay a line some book posted, as props.ts:265-267 notes for props; averaging two posted lines would invent a line nobody offers.

<a id="f-b1-11"></a>
#### B1-11 — Consensus 'market' for batter props is a median of about three US books that includes the bet book itself; FanDuel contributes no two-sided batter price

- Severity: medium. Area: MLB model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:1366 props pulled at regions=us; :1557-1558 sharp weights (pinnacle, betfair, matchbook) cannot apply to props; :1576-1580 weighted median of per-book Shin fairs with no exclusion of the settlement book; :2451 fallback `shDevig2(iO,iU)` is a multiplicative de-vig even when Shin is armed. Found replay (b6_found.py, current rule): 39 of 80 eligible bets rest on exactly 3 two-sided books, 5 on 1-2; booksInd (books other than the settlement book) is 2 on 38 of 80. Baseline (/private/tmp/claude-501/audit-out/baseline.md section 3.3): FanDuel two-sided on 0.0% of hits, H+R+RBI and total-base archive rows; DraftKings two-sided on 73.8%, 74.5% and 21.7%.

**Impact.** Accuracy: for a DraftKings/FanDuel-only bettor the fair value on batter props is largely DraftKings' own line plus two other recreational books, so 'edge against consensus' at DraftKings is thin and noisy, and total bases has a two-sided anchor on only about a fifth of rows.

**Proposed fix.** Re-specify the fair value for the two-book world: compute it from books other than the one being bet (leave-one-out), require at least three such books, add the eu region or a sharp props source if credits allow and otherwise drop the unused weights, and use Shin consistently in the fallback. Report per-row which books formed the fair.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code and data, with three corrections. I could not refute it; no guard elsewhere prevents it in the live found-straight path.

**Code checks (all in /private/tmp/claude-501/pl-audit)**
- legacy/index.html:1366: the prop pull hardcodes `regions=us`. `SH_V2.regions` ("us,eu", app/api/generate/route.ts:404) is only read by the game-line pull at legacy/index.html:1257. `browseOddsUrl` (src/lib/mlb/browse-markets.ts:9-16) only adds markets, never regions.
- legacy/index.html:1415 and :1432: each book's Shin fair goes into `fairs` with a `cz` flag, and `fair` is `shMedianW(fairs)` with no exclusion of the settlement book. `booksInd` (:1433) only counts the non-settlement books.
- The settlement book is DraftKings in production: src/lib/sportsbook/books.ts:12, rebound onto `CAESARS_KEY` at src/engine/index.ts:300.
- legacy/index.html:2451: the fallback is `shDevig2(iO,iU)`, not `shDevigPair` (:1574), so it is multiplicative even with `shin:true`. It is only reachable when no single book is two-sided, so it pairs the best over and best under from different books. This is a minor part of the finding.
- Guard search: the only independence gate is `booksInd===0` → `no_ind_consensus` at legacy/index.html:3063, inside the legacy allocator's `evGated` branch. The live found path (src/lib/server/lock-card.ts:1139-1154) has no books or booksInd gate; it needs only czDec, bsDec and ev>0. `buildStraightPool` hardcodes `booksInd: 0` on every straight leg (lock-card.ts:177), discarding the row's real value.
- The fair matters: every found bet is shrunk 50% toward it (`shrinkW` 0.5, src/lib/paper-mode.ts:192).

**Data checks**
- Re-running audit-out/areaB/b6_found.py reproduces the cited counts exactly: 80 eligible; books {1:2, 2:3, 3:39, 4:4, 5:10, 6+:22}; booksInd=2 on 38.
- My breakdown (audit-out/verify-b1-11/brk.py): the 80 mix 50 batter rows with 30 pitcher-strikeout rows. For batter rows alone it is stronger than stated: 38 of 50 rest on exactly 3 books and 3 on 2, and DraftKings is inside the fair on all 50.
- Props archive from 2026-09-17, last pre-start snapshot (audit-out/verify-b1-11/fb.py): the batter_hits fair has exactly 3 books on 2,682 of 3,744 rows. The books are betonlineag, draftkings and betmgm, plus fanatics occasionally. FanDuel is in the fair on 0.0% of hits, H+R+RBI and total-base rows.
- audit-out/baseline.md section 3.3 figures match the finding (73.8%, 74.5%, 21.7%, FanDuel 0.0%).

**Corrections**
1. The sharp-weight claim is partly wrong. `SH_BOOKW` (legacy/index.html:1557) has four entries, and the finding omits `betonlineag: 1.5`. That is a US-region book and sits in about 90% of hits fairs and 82% of total-base fairs, so that weight does apply. Only pinnacle, betfair_ex_eu and matchbook are unreachable at regions=us. In a 3-book pool the 1.5 weight gives the same result as the plain median; in a 2-book DK+BetOnline pool it makes the fair BetOnline's alone. "Drop the unused weights" should cover only those three, and "two other recreational books" is inaccurate for BetOnline.
2. "About three books" holds for hits (43 of the 50 batter bets) but not the other two markets. H+R+RBI is mostly 4-5 books (DK, BetMGM, Bovada, Caesars, BetOnline). Total bases is mostly 4+, with DraftKings in the fair on only about 26% of rows, so that fair is already largely leave-one-out. The "anchor on a fifth of rows" line describes DraftKings' own two-sided quote, not a thin consensus.
3. The bias is conservative, not inflating. Including DraftKings' own de-vig in a 3-book median pulls the market-only edge at DraftKings toward minus the vig; the replay shows only 13 of 80 bets are +EV on consensus alone. The cost is a narrow, non-independent anchor, not false edge.

**Fix caveat**
"Require at least three other books" would remove most hits bets on current data: booksInd is 2 on 558 of 724 DK-era hits board rows. It is only viable if another two-sided source is added. Whether the eu region carries two-sided MLB batter props could not be determined from disk.

**Severity**
Medium is the upper bound: paper trading only, and this is a design limitation with a conservative bias, not a wrong number. I kept it because the anchor carries half the weight in every found bet and the found path has no minimum-books gate.

Line cite: :1576-1580 is `shMedianW`; the no-exclusion evidence is at :1415 and :1432.

<a id="f-c1-1"></a>
#### C1-1 — MLB found pool is cut to the top 50 rows per market BY WIN PROBABILITY before EV is ever tested, so most +EV straights never become candidates

- Severity: medium. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2516-2518 (`cats[k].filter(pred).slice().sort(function(a,b){return b.p-a.p;})` then `rows.slice(0,50)`); legacy/index.html:2584-2588 comment: categories is 'deliberately narrow: top 50 per market ranked by win probability, ONE side per line'. src/lib/server/lock-card.ts:148-151 buildStraightPool reads only `data.categories`; lock-card.ts:1106-1116 found pool = shCardPool + buildStraightPool. Command: python3 /private/tmp/claude-501/audit-out/scripts/areaC_cat50d.py over /private/tmp/claude-501/pl-history/data/boards/*.latest.json.gz (boards >= 2026-09-18, markets whose category length == 50): 8 capped boards, rows +EV at DraftKings after an approximate 50% shrink: in categories 23, cut by the cap 62 (73% excluded). Per board {in,cut}: 09-19 {6,18}, 09-20 {3,5}, 09-22 {4,17}, 09-24 {0,1}, 09-25 {3,14}, 09-26 {7,7}. On 2026-09-22 (15 games) the hits category floor was 65.1% win prob, TB 61.5%, HRR 58.9% (areaC_cat50b.py). Broader count (areaC_cat50c.py, all markets hits/TB/HRR-under/K): shrunk +EV at DK 61 inside categories vs 65 outside.

**Impact.** Paper profit: on full slates the selection universe is the 50 heaviest favourites per market, where book hold is highest and EV thinnest; every plus-money or mid-probability +EV single (and the unfavoured side of every line) is invisible to the found pass. Roughly 3 of every 4 priced +EV hits/TB/HRR rows on capped days are never considered. The shrink in the script is an approximation (0.5*model + 0.5*fair), so treat counts as order-of-magnitude.

**Proposed fix.** Build the found straight pool from the uncapped priced rows (the propBoard / pre-slice cats) rather than from `categories`; if a cap is needed for payload size, rank by EV at the lockable price, not by probability, and emit both sides of each line. Keep `categories` as the display list only.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The mechanism is real and I could not refute it, but the severity is overstated: the cap has not yet bound on any archived found-mode day.

**Code evidence, confirmed by opening the files**
- `legacy/index.html:2517-2518` sorts each market by `b.p-a.p` and keeps `rows.slice(0,50)`; `legacy/index.html:2585-2586` says `categories` is the selection pool, top 50 per market by win probability, one side per line.
- `legacy/index.html:2953` returns `categories:preF.cats`, the sliced set.
- `src/lib/server/lock-card.ts:148` reads only `data.categories`; `lock-card.ts:1106-1116` builds the found pool from `shCardPool` plus `buildStraightPool`, then applies `shrinkTicket` at `CORE_RULES.shrinkW` = 0.5 (`src/lib/paper-mode.ts:192`).
- The only gate afterwards is `ev > 0` at the DraftKings price (`lock-card.ts:1150`), with candidates sorted by EV. No code path re-widens the pool from `propBoard` or the pre-slice rows.
- No stake floor hides the effect: `foundStake` (`src/lib/found-mode.ts:165-171`) is full Kelly on a $10,000 bankroll, so a 1.4% edge near even money stakes about $150.

**Data check, re-run and tightened**
- The auditor's `areaC_cat50d.py` reproduces exactly: 23 in, 62 cut.
- My stricter script (`/private/tmp/claude-501/audit-out/scripts/verify_c1_1b.py`) counts only the side the engine would pick (pO >= fO), skips alt rows, and uses the real shrink formula from `src/lib/shrink.ts:63`.
- On the same 8 boards (09-19 to 09-29) it gives 23 in vs 58 cut (72%). Per board {in, cut}: 09-19 {6,18}, 09-20 {3,4}, 09-22 {4,15}, 09-24 {0,0}, 09-25 {3,14}, 09-26 {7,7}.
- The shrink in the auditor's script is essentially the production formula, not a loose approximation.

**Corrections to the finding**
1. **No realized effect yet.** Found mode starts 2026-10-03 (`src/lib/found-mode.ts:53`). Every archived board from 10-03 to 10-17 is a 1–4 game postseason slate; the largest hits/TB/HRR category is 38 rows (`/private/tmp/claude-501/audit-out/scripts/verify_c1_1.py`). All capped boards are September, before found mode existed. The impact is prospective: hits/TB/HRR sat at exactly 50 on most 12+ game days in September, so it will bind on most full regular-season slates.
2. **"Hold highest, EV thinnest" is not supported.** Median shrunk EV is about 1.2% for in-category rows and 1.4% for cut rows. What the cap does lose is the tail: the largest cut EV is 15.7% against 4.5% inside.
3. **The unfavoured side is a minor point.** `categories` carries the side the model favours against the de-vigged fair (`legacy/index.html:2472-2477`), so the other side has negative model edge and is rarely +EV after shrink. The count of 58–62 is almost entirely model-favoured rows lost to the cap.
4. **The profit claim is speculative.** The model's edge is unproven (`src/lib/paper-mode.ts:154-156` records its overestimation), so more thin-edge candidates may not raise paper profit. This is a coverage defect: it contradicts the code's own stated intent of "every priced pregame straight" (`lock-card.ts:1105`).

**Fix**
The direction is sound. One caveat: `propBoard` rows carry no `bs`, `implied`, `gkey` per row, or `susp` fields, so building from them means re-deriving those. It is simpler to have the engine emit an uncapped selection list (or cap by EV at the lockable price) and leave `categories` as the display list.

<a id="f-b1-5"></a>
#### B1-5 — The Board lists only the side the model favours and only the top 50 by probability, so most price-driven value at DraftKings never reaches the found pool

- Severity: medium. Area: MLB model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2471 `sideCh=(pAdj>=nv)?"O":"U"` (one side per line, the model's side); :2186 moneyline lists only the more likely side; :2517-2518 rows sorted by blended probability then `rows.slice(0,50)`; src/lib/server/lock-card.ts:147-151 buildStraightPool reads only `data.categories` and skips live rows. Tests: inline script over boards >= 2026-09-17 (same loader as /private/tmp/claude-501/audit-out/areaB/b7_cut.py): of 8,885 pre-game DraftKings-priced prop sides with a two-sided consensus, 62 are +EV at DraftKings on the consensus fair alone; 45 of those 62 (73%) are absent from `categories` (hits 36 of 42, strikeouts 6 of 12, H+R+RBI 2 of 3, total bases 1 of 1). b7_cut.py: on the board files where a batter list is at the 50-row cap (17-19 of 56 files), 25-36% of the 50 slots are held by live rows the found pass cannot bet; using the blended price, 130 of 205 hits sides and 42 of 53 total-base sides with shrunk EV > 0 at DraftKings are not in categories (under probability approximated as 1 minus the over).

**Impact.** Paper profit and accuracy: the only edges the closing market supports (the book is off-market against consensus) are mostly invisible to the selector, while the visible pool is the model-favoured side. Size is small (about 0.7% of priced sides, roughly 2 a day) but these are the highest-quality candidates.

**Proposed fix.** Build the straight pool from the uncapped propBoard (both sides of every priced line, DraftKings and FanDuel quotes from bookQuotes) and from both moneyline/run-line sides, compute EV per side per book, and apply the filters there; keep the top-50 lists for display only. Exclude live rows before the cap, not after.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed: I could not refute it. The code behaves as described and the headline numbers reproduce exactly, with a few corrections.

**Code checked**
- **One side per line:** `sideCh=(pAdj>=nv)?"O":"U"` is at legacy/index.html:2474, not :2471 (2471 is the `dscp5` declaration). Only that side is pushed to `cats`.
- **Moneyline:** legacy/index.html:2186 `homeSide=pH>=0.5` lists only the likelier side; the other side rides along as `opp` and is not its own row.
- **Cap:** legacy/index.html:2517-2518 sorts by blended probability and takes `rows.slice(0,50)`, so the cut is by probability, not EV.
- **Live rows take slots:** `categories` is `preF.cats` (legacy/index.html:2953), whose predicate is `!r.live||(r.inning||0)<=6` (:2579). Live rows through the 6th inning are counted before the cap.
- **Found pool:** src/lib/server/lock-card.ts:147-152 reads only `data.categories` and skips `r.live`/`r.susp`. The found pass builds its pool from `shCardPool` plus `buildStraightPool` (:1106-1108).
- **No guard elsewhere:** the engine's own singles add one per category (legacy/index.html:2817-2819), so they do not widen the pool. A pregame-only set already exists (`pregameF`, :2578) but feeds only parlays (:2826) and is not exported on the board.

**Data reproduced** (my script: /private/tmp/claude-501/audit-out/verify_B1_5/repro.py)
- On the 28 `.best` board files from 2026-09-17, 62 pre-game sides are +EV at DraftKings on the consensus fair, and 45 are absent from `categories`.
- The per-market split matches exactly: hits 36 of 42, strikeouts 6 of 12, H+R+RBI 2 of 3, total bases 1 of 1.
- My denominator is 8,840 sides against the reported 8,885, a filter difference that does not matter.
- b7_cut.py re-run gives the same output: 17-19 of 56 files at the cap, 25-36% live, 130 of 205 hits and 42 of 53 total bases.

**Corrections to evidence and impact** (detail script: /private/tmp/claude-501/audit-out/verify_B1_5/detail.py)
- **Rate:** 62 over 28 dates is about 2.2 +EV sides a day; the absent ones run about 1.6 a day. They are concentrated: 40 of 45 fall on the regular-season dates 09-17 to 09-27, and almost none in the postseason, when lists are under the cap.
- **Cause of the 45:** 24 are lines not listed while the list was at the 50 cap, 16 have the other side listed (model-side rule), and 5 have no model probability. Those 5 would fail `buildStraightPool`'s `prob` requirement even under the proposed fix unless it prices on consensus alone.
- **Edge size:** median consensus EV is 1.05%; 23 are at least 1%, 14 at least 2%, 11 at least 3%. Ten of the 45 rest on a consensus of fewer than 2 books. "Highest-quality candidates" is asserted, not shown; no outcome test exists on a sample of 45.
- **Would they have been bet:** using the base 0.35 model weight and the 0.5 shrink, about 32 of the 40 with a model probability would still show czEv > 0. This is my approximation.
- **b7_cut.py caveats:** it counts both `.best` and `.latest` files, so the 56 files are 28 dates counted twice. It also uses a 0.5 blend where the engine's base props weight is 0.35 (legacy/index.html:1738) before the found-pass shrink. Treat 130 of 205 as a loose upper-bound illustration.
- **Not verified here:** the phrase "the only edges the closing market supports" comes from other findings.

**Severity:** medium stands, at the low end. It is a structural limit on the candidate universe for the only active strategy (straight bets), but the measured size is small and this is paper trading only.

**Fix:** the proposed fix is sound. The cheapest partial step is to build the straight pool from a pregame-only, uncapped set, since `pregameF` already filters live rows before the cap.

<a id="f-b2-2"></a>
#### B2-2 — No key-number handling: the smooth normal reads the standard -2.5 (-120) / -3 (+100) equivalence as a +1.39% edge, above the +1% floor

- Severity: medium. Area: football model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** coverProb is a pure normal with a +/-0.5 continuity band (src/lib/cfb/model.ts:76-83); each book's line and juice become an implied margin by mu = -point + sigma*normInv(p) (model.ts:361) and total by model.ts:369. grep -rn 'key number|keyNumber|key_number' over src/lib/cfb, src/lib/nfl, src/lib/football returned nothing. Probe section J (probe.out.txt), engine's own coverProb/devig with NFL sigma 13.5: home -2.5 (-120/+100) implies margin 3.236; home -3 (+100/-120) implies 2.264; gap 0.972 pts. DraftKings home -3 at +100 against a consensus at -2.5 (-120): win 0.4922, push 0.0295, EV +1.39%. Mirror case, DK away +2.5 at +100 against consensus -3 (+100): EV +1.39%. Model push mass on 3 is 2.95%. The found filter has no line-distance or key-number guard (src/lib/cfb/found.ts:138).

**Impact.** Any time DraftKings hangs the other side of 3 (or 7) from the median book at the customary juice, the NFL card sees a bet that clears the +1% floor with no real price difference; at +1.39% the stake is roughly $150 (my arithmetic from foundStake). The real frequency of NFL margins landing on exactly 3 is not measurable from disk; it is well known to be several times the 2.95% the model assumes, which makes the true EV of these bets negative. The same error mis-prices every re-evaluation of a DK line that differs from the consensus line (model.ts:510-515).

**Proposed fix.** Replace the normal push/cover step with an empirical margin distribution per league (push probabilities for 3, 7, 6, 10, 14 and half-point values across them), fitted on historical finals. Until then, refuse a spread candidate whose DraftKings line differs from the consensus line across 3 or 7, and require the DK line to equal the modal book line for a spread bet.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code and reproduced end to end; severity lowered from high to medium because the trigger frequency is unproven and the one real NFL snapshot on disk shows zero occurrences.

What I checked (all paths relative to /private/tmp/claude-501/pl-audit):
- src/lib/cfb/model.ts:76-83 coverProb is a pure normal with a +/-0.5 continuity band; no empirical margin mass anywhere. model.ts:361 (mu = -h.point + sigma*normInv(pc)) and :369 are as cited. grep for key number / keyNumber / key_number over src/lib/cfb, src/lib/nfl, src/lib/football returns nothing.
- The row's line is the median book line (model.ts:437), but evCz is computed at DraftKings' OWN line (model.ts:510-515, evAt -> rowProbAt(model, market, side, q.line)); playable is only `!!sq.cz && upcoming` (model.ts:518). The leg is written at DK's line (src/lib/cfb/card.ts:96).
- The found gate (src/lib/cfb/found.ts:138) has no line-equality or line-distance guard for game rows. Note the prop gate two screens up DOES require `r.cz.line === r.line` (found.ts:97) - game spreads/totals simply lack the equivalent.
- Floor: foundFootballMinEv = min(rules, 1) from 2026-11-01 (src/lib/found-mode.ts:131-135); NFL sigma 13.5, spreadBlend 0.75 mkt / 0.25 FPI, settleBook draftkings (src/lib/nfl/rules.ts:61-68).
- The prior probe output exists and matches (audit-out/b-football/probe.out.txt section J).

My own reproduction (audit-out/verify-b2-2/v.ts, output v.out.txt) runs the real buildCfbBoard + foundCandidates + planFound on tests/fixtures/nfl/odds-2026-09-13.json with one game's spreads rewritten:
- DK home -3 (+100/-120) vs other books -2.5 (-120/+100), no FPI: row evCz 1.39, and on a board dated 2026-11-08 planFound writes "SINGLE - Bengals -3 $144 ev 1.44". On a 2026-10-25 date (old +2% floor) nothing is written.
- Mirror (DK +2.5 at +100 vs others -3 +100/-120): evCz 1.39, ticket $139.
- Same across 7 (DK -7 +100 vs -6.5 -120): evCz 1.39, ticket $144.
- With the real FPI blended in for that game (FPI margin 3.80 vs market 3.24) the same phantom reads +2.30% and stakes $230 - it clears even the old +2% floor.

Corrections / limits to the finding:
1. Stake is $139-$144 in the neutral case, not "roughly $150" (immaterial), and up to $230 when FPI leans the same way.
2. The trigger is narrower than "any time DK hangs the other side of 3": it needs close to the full 20-cent juice compensation. DK -3 (-110/-110) vs -2.5 (-110/-110) gives evCz -1.59/-7.23 and no bet; a 10-cent shade (-105/-115 vs -115/-105) gives -3.08 and no bet. Only the fully compensated -120/+100 style quote clears +1%.
3. Frequency is not established. pl-history holds MLB only (README.md:3), so no NFL line history exists on disk. In the single real NFL snapshot (13 games, 4 books) DraftKings sat on the median line in every game: zero off-line DK spread/total rows and zero spread/total rows at >= +1%. The only book off the median there was williamhill_us.
4. The claim that the true push rate on 3 is several times the model's 2.95% is general betting knowledge, not verifiable from disk; I accept it as well known but it is not measured evidence. Under it the flagged bet is roughly -4% to -5% true EV rather than +1.4%.
5. The "mis-prices every re-evaluation of a DK line that differs from consensus" sentence is directionally right but overstated in effect: away from 3/7 the half-point error is small relative to vig and does not produce bets by itself.
6. Two-book note for the Arizona context: the feed today is still regions=us,eu, all books (src/lib/nfl/rules.ts:170). If it were narrowed to draftkings+fanduel, the lower-middle weightedMedian (src/engine2/devig.ts:76-85) makes the effect one-directional: DK -3 +100 vs FD -2.5 -120 yields no bet (evCz -4.34), but DK +2.5 +100 vs FD -3 yields the same +1.39% / $139 ticket.

Why medium not high: paper trading only; one ticket of about $140-$230 against a $2,500 daily ceiling per occurrence; requires a specific quote shape; no occurrence found in stored data. It is still a genuine systematic false-positive path that the +1% floor (since 2026-11-01) newly exposed.

Fix assessment: the interim guard is sound and cheap - require the DK line to equal the row (median) line for spread/total rows at found.ts:138, mirroring the existing prop rule at found.ts:97, or at minimum refuse when DK's line and the median line straddle or touch 3 or 7. The same guard should be applied to the core card path (src/lib/cfb/card.ts:141/144), which uses the same evCz. The empirical margin distribution is the proper long-term fix but needs historical finals that are not on disk.

<a id="f-b2-7"></a>
#### B2-7 — Football stakes are full Kelly on an unshrunk, uncalibrated probability

- Severity: medium. Area: football model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** FOUND.kellyMult 4 x kellyFrac 0.25, cap 0.02, bankroll 10000 (src/lib/found-mode.ts:55-73, comment at :64 '4 x quarter-Kelly = full Kelly on the bankroll'); FOUND_MAX_STAKE = 800 (:76); foundStake (:165-172) is called with the raw model probability (src/lib/cfb/found.ts:180; props use r.fair at found.ts:117,122). The MLB shrink is described at found-mode.ts:25 ('the model said 56.0 wins where 46 landed') and grep for 'shrink' in src/lib/cfb/found.ts and src/lib/cfb/card.ts returns nothing.

**Impact.** Full Kelly is only correct when the probability is right. Here the probability carries the FPI, key-number and median errors above, so every overstatement becomes an over-bet: up to $800 (8% of the stated bankroll, 32% of the day) on one football ticket. One day can be concentrated in three or four FPI-disagreement underdogs.

**Proposed fix.** Shrink football probabilities toward the no-vig market before staking (at least the MLB 0.5 until football has its own calibration), drop kellyMult to 1 for football (true quarter Kelly), and cap any one ticket at 2% of bankroll.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real: I could not refute any of the cited evidence. I rate it medium rather than high.

**What I confirmed in the code**
- `src/lib/found-mode.ts:55-73` sets `kellyMult` 4, `kellyFrac` 0.25, `kellyCap` 0.02 and `bankroll` 10000; the comment at `:64` reads "4 × quarter-Kelly = full Kelly on the bankroll".
- `FOUND_MAX_STAKE` at `:76` works out to $800.
- `foundStake` at `:165-172` reduces to min($10,000 × f*, $800, room left), which is full Kelly up to f* = 8%.
- Football calls it with the unadjusted draft probability at `src/lib/cfb/found.ts:180`; props carry `prob: r.fair!` at `found.ts:117,122`.
- Game-line leg probabilities come straight from `rowProbAt(game.model, …)` at `src/lib/cfb/card.ts:98`.
- The market shrink is used only on the MLB path (`src/lib/server/lock-card.ts:18, 312, 1115`). A grep for "shrink" in `src/lib/cfb/found.ts` and `src/lib/cfb/card.ts` returns nothing.
- There is no football calibration code: `src/lib/cfb/rules.ts:265-267` says `/api/calibrate` "has no CFB code at all".
- No guard elsewhere prevents it. `assertEntryMoney` only enforces whole dollars in the $5–$800 band and the day ceiling (`src/lib/cfb/lock-server.ts:175-198`), and `tests/found-football.test.ts:190` pins that band.
- There is no upper EV sanity cap on football rows: `playable` is just a settle-book quote plus an upcoming game (`src/lib/cfb/model.ts:518`).
- The path is live: `src/lib/server/football-lock.ts:736, 755, 838`.

**Corrections to the evidence and impact**
- "Unshrunk" is literally true but overstated. The football probability is already mostly market:
  - Moneyline: 0.6 de-vigged consensus + 0.25 spread-implied + 0.15 FPI.
  - Spread margin: 0.75 market + 0.25 FPI (`src/lib/cfb/rules.ts:73-74`, `src/lib/nfl/rules.ts:64-65`, `src/lib/cfb/model.ts:415-455`).
  - Totals: 100% market consensus (`model.ts:456`).
  - Props: a median of de-vigged book quotes (`src/lib/cfb/props.ts:27-46`).
- That does not rescue the sizing. The edge that clears the gate is exactly the FPI residual, or DraftKings sitting off the consensus median, and it is then bet at full Kelly.
- The $800 ticket is reachable but not routine. It needs f* ≥ 8%, which is roughly EV ≥ 7.3% at −110 or ≥ 12.8% at the 2.60 price cap.
- More typical is about $110 on a +1% edge at −110. That is still large against the pre-found $50 per-ticket cap (`rules.ts:53`), given the EV floor was lowered to +1% (`found-mode.ts:130-135`).
- Dedupe is per (game, family) (`found.ts:57-66`), so one game can carry a side and a total, each up to $800.
- I could not measure actual football stake sizes: no football ledger exists on disk in either checkout.

**Why medium, not high**
- It is paper money only.
- The 4× multiplier and $2,500 day are the owner's explicit, documented choice (`found-mode.ts:2-22`), not an accident.
- The damage is bounded by the day ceiling and the $800 cap.
- What remains is a real distortion of the paper record: variance and over-betting on an uncalibrated edge.

**On the proposed fix**
- Shrinking football probabilities toward the no-vig market before staking is sound.
- Dropping `kellyMult` to 1 and capping tickets at 2% ($200) contradicts the owner's stated sizing instruction and needs his sign-off; it should not be applied silently.

<a id="f-c1-3"></a>
#### C1-3 — Found staking is full Kelly on a constant $10,000, and the two desks feed it different probabilities and gates (MLB shrunk 50% to market, football raw model)

- Severity: medium. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/found-mode.ts:53-76: `FOUND = { daily: 2500, ..., bankroll: 10000, kellyMult: 4, kellyFrac: 0.25, kellyCap: 0.02, minStake: 5 }`, FOUND_MAX_STAKE 800; foundStake :165-172 = round(4 * 10000 * min(0.25*f*, 0.02)) => 1.0x Kelly capped at 8% of a fixed $10,000. found-mode.ts:61-63 says bankroll is 'a CONSTANT, never the engine's runtime bankroll' while the header at :43-47 says the bankroll '(10,000 + P/L, the ledger's own number) is what carries' (comment contradicts code). MLB: lock-card.ts:1115 shrinkTicket(w.pl, CORE_RULES.shrinkW) with shrinkW 0.5 (src/lib/paper-mode.ts:190-204) and gate czEv > 0 with no price cap (:1149). Football: src/lib/cfb/found.ts:180 `stakeOf: (d, r) => foundStake(d.prob, d.dec, r)` on the unshrunk draft prob; gate = +1% EV floor (found-mode.ts:133-135) and dec <= 2.6 (found.ts:97,138; cfb/rules.ts:49, nfl/rules.ts:41). src/lib/shrink.ts:6-10 documents the model's over-confidence (edge 10-20 bucket predicted .671, actual .443). found-mode.ts:25-30 records 16 tickets / $6,408 on 2026-10-03 under raw probabilities.

**Impact.** Bankroll risk and record accuracy: full Kelly on probabilities already measured as over-confident is over-betting by construction (single bets up to $800 = 8% of a nominal bankroll that never shrinks after losses or grows after wins). Stake for the same edge differs by desk: an MLB edge is halved before sizing, a football edge is not. The record cannot be read as a Kelly-disciplined test.

**Proposed fix.** One shared sizing function for all desks: fractional Kelly (kellyMult 1, i.e. quarter Kelly) on the ledger's live bankroll, applied to a probability shrunk by a per-market calibrated weight on both desks; one shared EV floor and price cap policy. Correct the header comment to match the code.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The mechanics are confirmed in code, but three parts of the framing are wrong and the severity is overstated; medium, not high.

CONFIRMED
- Sizing: src/lib/found-mode.ts:53-73 has FOUND = { daily 2500, bankroll 10000, kellyMult 4, kellyFrac 0.25, kellyCap 0.02, minStake 5 }; FOUND_MAX_STAKE at :76 is 800. foundStake at :165-172 is round(4 * 10000 * min(0.25*f*, 0.02)), trimmed to the day's room. That is 1.0x Kelly, capped at $800, on a constant $10,000. Both desks call this one function (src/lib/server/lock-card.ts:1183, src/lib/cfb/found.ts:180), so a shared sizing function already exists; only its inputs differ.
- MLB: src/lib/server/lock-card.ts:1115 applies shrinkTicket(w.pl, CORE_RULES.shrinkW), with shrinkW 0.5 at src/lib/paper-mode.ts:192. The gate at :1149 is czEv > 0 on the shrunk probability. I found no price cap in the found block (:1136-1151); CORE_RULES.maxDec 2.6 is not referenced there.
- Football: src/lib/cfb/found.ts:180 sizes on d.prob with no shrink. The gate is evCz >= foundFootballMinEv (found-mode.ts:133-135, +1% from 2026-11-01, +2% before) and dec <= R.maxDec (found.ts:97, :138; cfb/rules.ts:49 and nfl/rules.ts:41, both 2.6). No shrink call exists anywhere under src/lib/cfb, src/lib/nfl or src/lib/football.
- The gates and price-cap policy do differ by desk (MLB > 0% and uncapped; football +1% and <= 2.6).

CORRECTIONS
1. Path: the MLB file is src/lib/server/lock-card.ts. src/lib/lock-card.ts does not exist.
2. "Football raw model" is misleading. The football probability is mostly a de-vigged multi-book consensus, not an independent model:
   - Moneyline: 0.6 market consensus / 0.25 spread-implied / 0.15 FPI (src/lib/cfb/model.ts:33-36, :417-437; cfb/rules.ts:73; nfl/rules.ts:64).
   - Spread margin: 0.75 market / 0.25 FPI (cfb/rules.ts:74; nfl/rules.ts:65).
   - Totals: 100% market (model.ts:454, muTotal = mktTotal).
   - Props: the de-vigged median of the books at the line, with no model (src/lib/cfb/props.ts:27-46).
   The over-confidence evidence in src/lib/shrink.ts:6-10 is MLB-only (HRR buckets on MLB paper days). So "full Kelly on probabilities already measured as over-confident" describes the MLB model, which is the desk that is shrunk. No football calibration measurement was found either way. Shrinking football toward consensus would be a no-op on totals and props and would only halve the FPI tilt on sides.
3. The comment contradiction is overstated. found-mode.ts:46-47 says what carries day to day (the ledger bankroll, versus the per-day room that resets). :61-63 says what stakes are priced off. They describe different things. The real point is only that stakes never track the ledger bankroll.
4. "16 tickets / $6,408 on 10-03" (found-mode.ts:28-30) is a counterfactual measurement used to justify the blend. It is not a record of tickets locked under raw probabilities.

SEVERITY
- Exposure is bounded per sport per day at $2,500 plus that day's wins, and each stake at $5-$800, by a hard money guard (src/lib/cfb/lock-server.ts:175-198; found-mode.ts:43-47).
- The sizing is intentional and owner-requested: stake examples of $250 and $500 and "any number is fine" (found-mode.ts:8-11); "Bump the bankroll to $10,000" and "this is all hypothetical so cash flow can be much higher" (paper-mode.ts:38-48).
- It is paper only, so there is no real bankroll at risk. The impact is on reading the record: it is not a Kelly-disciplined or cross-desk-comparable test, and the stakes would be too aggressive if copied to real money.

FIX ADJUSTMENT
- Keep the shared foundStake. Make the Kelly multiple and the bankroll source explicit decisions for the owner (fractional Kelly, live ledger bankroll).
- Align the EV floor and price-cap policy across desks, or document why they differ. docs/session-handoff.md:784 records that MLB prices above 2.6 went 11-38 under the earlier regime, so the missing MLB price cap is the more defensible half of this finding.
- For football, measure calibration first rather than porting the MLB 0.5 shrink.

I did not check stored found-mode stakes: no found tickets exist in /private/tmp/claude-501/pl-history (a grep for the found policy stamps returned nothing), so realized stake sizes could not be determined.

<a id="f-b2-6"></a>
#### B2-6 — Every threshold was set before any football game was graded, and the EV floor was cut to +1% to produce volume; +1% is inside the model's own measured error

- Severity: medium. Area: football model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** git log -S: minEvPct 2, maxDec 2.6 and sigma 16.5 first appear in fb0e983 (2026-09-05, the desk's first commit); NFL sigma 13.5 in 10b6a63 (2026-09-08); ATD_YES_ONLY_OVERROUND 1.08 in fbe95af (2026-09-05). EV1_SINCE = '2026-11-01' (src/lib/found-mode.ts:130) with the comment at :124-128 recording the reason as wanting more NCAAF/NFL picks ('Lower EV bar +2% -> +1%'); commit 9bf08d9. Values: src/lib/cfb/rules.ts:46,49,70-74; src/lib/nfl/rules.ts:38,41,61-65. docs/cfb-desk.md:25-29 and docs/nfl-desk.md:37 list the constants with no fitting source. Error sizes from the probes: key-number artifact +1.39%; two-book median side bias 1.3-1.7 pp; 1.15-1.41% EV per FPI point; best-of-two price 0.66 pp. No football closing-line capture exists (app/api/clv/route.ts:36 reads the MLB key only, per pick-trace.md) and /private/tmp/claude-501/pl-history holds 0 football files (audit-out/baseline/g_football.out.md).

**Impact.** None of minEvPct, maxDec, sigma, hfa, the blend weights or the +1% floor is out of sample or even in sample; the floor was moved in the direction that admits more noise. A +1% bar is smaller than three separate known model artifacts, so a large share of bets passing it are expected to be zero or negative EV after a -110 vig. There is no stored data on disk with which the system could detect this.

**Proposed fix.** Restore +2% (or higher) until a football closing-line record exists; start storing the consensus probability, book, quote time and closing price for every football ticket; then set the floor from realised CLV by EV bucket. Fit sigma, hfa and push tables on historical finals and record the fit in the repo.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The core evidence is confirmed, but the severity is overstated and two of the four "error sizes" do not support the claim as worded.

CONFIRMED (opened and checked):
- Constants are where cited: src/lib/cfb/rules.ts:46 (minEvPct 2), :49 (maxDec 2.6), :70-74 (sigma 16.5, sigmaTotal 18, hfa 2.6, blend, spreadBlend); src/lib/nfl/rules.ts:38, :41, :61-65 (sigma 13.5, hfa 2.0, same blends).
- git log -S: minEvPct 2 / maxDec 2.6 / sigma 16.5 first appear in fb0e983 (2026-09-05, the CFB desk's first commit; CFB_PAPER.since is also 2026-09-05, rules.ts:37). NFL sigma 13.5 in 10b6a63 (2026-09-08, before NFL sundayPaperSince 2026-09-20). ATD_YES_ONLY_OVERROUND in fbe95af (2026-09-05), still 1.08 at src/lib/cfb/props.ts:65. None changed since.
- EV1_SINCE = "2026-11-01" at src/lib/found-mode.ts:130; the comment at :124-128 and the 9bf08d9 commit message both give volume as the only reason ("more NCAAF/NFL picks with the allotted money"); no result or CLV is cited. The floor is live: src/lib/cfb/found.ts:98 and :138 gate on foundFootballMinEv(board.date, R.minEvPct), and found mode is the only live seating path.
- No fitting record: the header comments (src/lib/cfb/rules.ts:16-34, src/lib/nfl/rules.ts:13-23) describe sigma as "the standard deviation of final margins about the closing spread" with no data source; docs/cfb-desk.md:22-31 and docs/nfl-desk.md:37 list values only.
- No football closing-line capture: app/api/clv/route.ts:36 uses STORE_KEY "pl:ledger:v1" (the MLB ledger); football ledgers are pl:cfb:ledger:v1 / pl:nfl:ledger:v1 (src/lib/cfb/rules.ts:355, src/lib/nfl/rules.ts:154). No CLV/closing writer found under src/lib/cfb, src/lib/nfl or src/lib/football (grep; `clv` appears only in comments). audit-out/baseline/g_football.out.md G3 reports 0 football files in the history archive.
- Probe numbers exist in audit-out/b-football/probe.out.txt: section J gives key-number EV 1.39% and EV per FPI point 1.41% (NFL) / 1.15% (CFB); probe2.out.txt gives best-of-two 0.66 pp.

CORRECTIONS:
1. "Two-book median side bias 1.3-1.7 pp": I could not find this figure anywhere in audit-out. probe.out.txt section K only shows weightedMedian([a,b],[1,1]) returns the lower value (src/engine2/devig.ts:76-85). It is also not production behaviour for sides: football consensus pulls regions=us,eu (src/lib/cfb/rules.ts:367) and the probe shows 14-23 spread books per event (section I). It would bite only on 2-book markets or after a restriction to DK+FD. Treat as unsupported.
2. "Best-of-two price 0.66 pp" is a forgone price improvement from not shopping FanDuel, not a model error; it does not belong in an "error larger than the floor" argument.
3. "1.15-1.41% EV per FPI point" is a sensitivity, not an error. The same probe line says a +1% bet at -110 needs a 3.93 pt (NFL) / 4.81 pt (CFB) FPI-vs-market gap; cutting +2% to +1% lowers that requirement by under one point. The stronger fact in the probe is sections A-D and F: with FPI removed there are zero candidates at +1% or +2%, so every football edge is the 25% FPI weight disagreeing with the market. That, not the 1-point floor move, is the main exposure.
4. Only the key-number artifact (+1.39%, an analytic calculation at NFL sigma 13.5) is a clean case of a model artifact that sits between the old and new floor.
5. "A large share of bets passing it are expected to be zero or negative EV after a -110 vig" is inference, not measurement; evCz is already net of the DraftKings price. Nothing on disk can confirm or refute it, which is the real point.
6. The probes ran on one 12-game fixture (tests/fixtures/cfb 2026-09-05; the NFL odds fixture is flagged SYNTHETIC in g_football.out.md), so the sizes are illustrative, not measured on live slates.
7. sigma 16.5 / 13.5 and hfa are conventional published values rather than arbitrary picks; "unfitted and unrecorded" is accurate, "wrong" is not shown.
8. Stale text nearby: comments at rules.ts:45 / nfl rules.ts:37 and docs/cfb-desk.md:31, docs/nfl-desk.md:37 still say Caesars / williamhill_us while the code's settleBook is "draftkings".

SEVERITY: medium, not high. It is paper trading only, the +1% change was the owner's explicit, documented choice, and the harm is an unverifiable record rather than a defect producing wrong output.

FIX: The valuable half is storing consensus probability, book, quote time and closing price per football ticket; that should stand. "Restore +2%" reverses an explicit owner decision and should be put to him as a choice (with the note that the edge is entirely FPI-driven), not applied unilaterally.

<a id="f-b2-5"></a>
#### B2-5 — Consensus is a one-book-one-vote median over 22-26 mostly soft and duplicated books; Pinnacle is about 8% of the weight and quote age is ignored

- Severity: medium. Area: football model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** No bookmakers= filter; feed is regions=us,eu (src/lib/cfb/rules.ts:367, src/lib/nfl/rules.ts:170). Weight is 2 for pinnacle, 1 for everything else (src/lib/cfb/model.ts:328; rules.ts:75). Real capture tests/fixtures/cfb/odds-ncaaf-2026-09-05.json holds 26 distinct keys; books per event [25,17,19,26,26,24,25,19,25,24,15,24,1,5]. Probe section I: on 23-book spread markets Pinnacle's share of median weight is 0.083, and 8 of the 23 are clone-family books (betrivers/unibet_se/unibet_nl/leovegas_se, betsson/nordicbet, betonlineag/lowvig); event 0 shows betsson and nordicbet with identical spread and total prices. last_update is parsed (src/lib/cfb/names.ts:22,62) and referenced nowhere else under src/lib/cfb or src/lib/server/football*.ts (grep). Props use regions 'us' (rules.ts:474, src/lib/nfl/rules.ts:195) with equal weights, so the props fair contains no sharp book at all.

**Impact.** The 'fair' price is the middle of the recreational market, with one platform's odds counted up to four times, not a sharp no-vig line. A stale book cannot be told from a fresh one. DraftKings is priced against a reference that is no sharper than DraftKings itself, so a positive market-only EV is as likely to be noise as value (zero market-only candidates appeared on the real slate).

**Proposed fix.** Use an explicit allowlist and weights for the fair: pinnacle, betfair_ex_eu, matchbook and the low-hold books weighted heavily; one vote per platform family; drop any quote whose last_update is older than a few minutes relative to the freshest book. For props, add a sharp region or mark the fair as 'US book average' and require more books before a bet.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The mechanics are confirmed, but the impact on game lines is overstated, so I rate this medium, not high.

**Confirmed in code**
- Both game-line feeds are `regions=us,eu` with no `bookmakers=` filter (src/lib/cfb/rules.ts:367, src/lib/nfl/rules.ts:170); a grep of `src` for `bookmakers=` returns nothing.
- Weight is 2 for `pinnacle` and 1 for every other key (src/lib/cfb/model.ts:328, `pinnacleWeight: 2` at src/lib/cfb/rules.ts:75).
- The consensus is engine2's `weightedMedian` over every book returned, gated only by `minBooks` 2 (src/lib/cfb/model.ts:377-382, 415-419); first-half lines reuse it (src/lib/cfb/h1.ts:38-42).
- `last_update` appears only in the type and parser (src/lib/cfb/names.ts:22, 62). The only other use in `src` is the MLB sportsbook file (src/lib/sportsbook/mlb.ts:34), so the football fair has no quote-age filter.
- Props are `regions: "us"` (src/lib/cfb/rules.ts:474, src/lib/nfl/rules.ts:195) with an equal-weight median (src/lib/cfb/props.ts:198-213, 267), so no Pinnacle or exchange enters the props fair.

**Confirmed in the fixture** (tests/fixtures/cfb/odds-ncaaf-2026-09-05.json, my own script)
- 26 distinct book keys; books per event are [25,17,19,26,26,24,25,19,25,24,15,24,1,5], exactly as cited.
- Pinnacle's share of spread weight is 0.083 on the 23-book events and 0.087-0.133 on the smaller ones.
- Event 0: betsson and nordicbet carry identical moneyline, spread and total prices; betrivers, unibet_nl and unibet_se carry identical spreads.

**Corrections to the impact**
1. "Middle of the recreational market" is overstated. The pool also holds betfair_ex_eu, matchbook, lowvig and betonlineag. On the 12 fixture events with a Pinnacle spread, the weighted-median implied margin sits within about 0.3 points of Pinnacle's every time (for example 27.91 vs 27.81 and 40.21 vs 40.21), and the median line equals Pinnacle's on 8 of 12, differing by half a point on the other 4. The game-line fair tracks the sharp line closely in this capture.
2. The stale-quote risk is real in code but small in the data: `last_update` across all books in the capture spans about 8 minutes (06:18:44Z to 06:26:35Z). It matters more for live pulls, which I did not measure.
3. The game fair is not the pure median. It blends in FPI at 15% of the win probability and 25% of the margin (src/lib/cfb/rules.ts:73-74, src/lib/cfb/model.ts:421-452), which moves the number more than the book weighting does.
4. "Zero market-only candidates appeared on the real slate" and "as likely to be noise as value" are not supported by anything cited here; I could not verify them.
5. The props half is the stronger part of the finding and stands unqualified: a US-only, equal-weight median with a two-book minimum, which includes the settlement book itself.

**Fix**
The proposal is sound in direction. Family de-duplication and a `last_update` freshness filter are cheap. A sharp allowlist would change little on game lines per this fixture and is worth more on props. Paper trading only, so no money is at risk.

Scripts: /private/tmp/claude-501/audit-out/b25_verify.py and /private/tmp/claude-501/audit-out/b25_verify2.py

<a id="f-b1-2"></a>
#### B1-2 — Pitcher outs model is still the broken one (0.140 anchor pinned at its 0.86 floor on every row, shrink k=4, no hook term) and is still priced on the Board at full model weight

- Severity: medium. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2253 `ipg=shShrink(ipg,nOut,4,Lipg)`; :2258 `of=shClamp(0.140/oo,0.86,1.12,"2258")` where oo = lineup TB/AB (league slugging in public/model/priors.json league.slg = 0.4028); :2260 `lam=ipg*3*of`; Poisson via :1543. Still listed for straights: src/lib/server/lock-card.ts:135 STRAIGHT_MARKETS; only the found card skips it (src/lib/found-mode.ts isOutsOff, OUTS_OFF_SINCE 2026-10-06). Whole-archive test `python3 -I /private/tmp/claude-501/audit-out/areaB/b3_tests.py` (T3): 1,097 pre-game outs rows on 71 board dates, 983 with a lineup read, 983 of 983 on the 0.86 clamp floor, 983 worded 'trims the start', 0 'lets him go deeper'; lineup TB/AB mean 0.405 (min 0.274, max 0.620), so the 1.12 side is unreachable. Raw model minus consensus, over-oriented: lineup posted mean -21.54 pts (93.9% below market); no lineup read mean +2.46 pts. Uncapped propBoard, blended (b5_tests.py T6): mean -4.00 pts, model above market on 11.6% of 976 rows; line 17.5: 0.4% above. In the found replay with outs allowed (b6_found.py) outs were 44 of 124 eligible bets and 43.8% of stake (12 overs mean raw gap +33.0, 32 unders +33.2): the side is decided by whether a lineup is posted. Baseline: outs rows had the largest claimed EV of any market (8.72%, /private/tmp/claude-501/audit-out/baseline.md section 3.2) and raw-model RMSE vs close 25.19 pts. docs/pitcher-outs-audit.md:1-3 records the finding as 'Nothing changed'.

**Impact.** Accuracy: every posted-lineup outs projection is cut a flat 14% regardless of opponent, so the model is roughly 2.5 outs short and one-sided; the Board, ranked lists and any parlay or manual use still show these as the highest-EV rows. Paper profit: bounded today only because the found card excludes the market; before 2026-10-06 it was the single largest stake sink.

**Proposed fix.** Replace 0.140 with the league TB/AB from the same pull (Ltb at legacy/index.html:2011, about 0.40) and recentre the clamp (0.93-1.07); raise the own-sample weight (shrink toward the pitcher's season IP/start with k of about 2, not toward league with k=4 at n of about 4); price the distribution from the simulator's leash/hook model (legacy/index.html:1923) or a binomial-style distribution with variance fitted to starts instead of Poisson; handle integer lines as pushes. Until graded out of sample, force the outs model weight to the 0.05 floor in shWm so the Board shows consensus, and remove it from STRAIGHT_MARKETS.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code and data; severity lowered from high to medium because the defect is already documented, owner-acknowledged and gated off the auto card, and two details of the finding are overstated.

What I checked (paths relative to /private/tmp/claude-501/pl-audit):
- legacy/index.html:2253 `ipg=shShrink(ipg,nOut,4,Lipg)`, :2258 `of=shClamp(0.140/oo,0.86,1.12,"2258")`, :2260 `lam=ipg*3*of`, :1543 shPOver (Poisson, floor(line)) all exist as quoted. offense() at :2158 is a shBlend of tb over ab (:1707), i.e. TB/AB (slugging). The factor leaves the 0.86 floor only if lineup TB/AB < 0.163 and reaches 1.12 only at <= 0.125, so it is a flat 0.86 multiplier on every posted-lineup row. public/model/priors.json league.slg = 0.4028 confirmed.
- Re-ran audit-out/areaB/b3_tests.py: 1,097 pregame outs rows, 983 with a lineup read, 983/983 on the floor, 983 'trims', 0 'deeper', TB/AB mean 0.405 (min 0.274, max 0.620); raw over-oriented gap -21.54 (93.9% below market) with lineup, +2.46 without. Spot-checked two raw archives directly (pl-history/data/boards/2026-08-20.best.json.gz: 10/10 on floor; 2026-09-25.best.json.gz: 31/31 on floor), so the loader is faithful.
- Re-ran b5_tests.py T6 (ALL pitcher_outs n=976, mean -4.00, 11.6% above market; line 17.5: 0.4%) and b6_found.py (44 of 124 eligible bets; stake share 18.7% + 25.1% = 43.8%; raw gaps +33.0 / +33.2). audit-out/baseline.md:184 (8.72% claimed EV, highest of any market) and :430 (RMSE raw vs close 25.19) confirmed.
- src/lib/server/lock-card.ts:135-143 STRAIGHT_MARKETS includes pitcher_outs; src/lib/found-mode.ts:146-151 OUTS_OFF_SINCE/isOutsOff; docs/pitcher-outs-audit.md:3 'Nothing changed'.

Guards found (limit the impact):
- lock-card.ts:260 routes every date >= 2026-10-03 to buildFoundLockEntry, and :1145 drops any ticket with a pitcher_outs leg when outsOff. So the STRAIGHT_MARKETS entry is inert for the auto paper card; removing it is cosmetic, not a fix.
- The engine default is outsSusp:true (legacy/index.html:1087, enforced at :2524/:2670/:3229) but it was lifted at runtime on 2026-08-15 (src/lib/paper-mode.ts:133-137, applied in app/api/generate/route.ts:438 and src/lib/engine-client.ts:125), so the found-mode gate is the only live guard.
- The generator marks the market suspended but still spins it (src/components/props/mlb-gen-pool.ts:49, GenSheet.tsx:1205-1207). The Board still lists it (app/board/page.tsx:101,118,378). So display/manual-use exposure is real.

Corrections to the evidence:
1. 'Full model weight' is only true for overs. Re-running b4_effw.py: rows report wBlend 0.35, but UNDERS (the majority of outs rows) have a median effective weight of 0.286 (08-16..09-16), 0.209 (09-17..10-02), 0.205 (>=10-03), because of the side-aware calW['mkt|u'] shrink at legacy/index.html:2459-2463. Example: 2026-09-25 U 15.5 row prob 60.9 / pModel 87.7 / implied 54 = 0.205 effective while wBlend says 0.35. Also the calibration loop had already pushed outs to the 0.05 floor on 2026-08-06..08-15 (224 rows). The row-reported wBlend therefore overstates the under-side weight, which is its own small display inaccuracy.
2. '71 board dates': outs rows appear on 69 distinct dates (2026-07-26..2026-10-17); the archive holds about 72 dated boards.
3. '2.5 outs short' is the top of the range: 14% of a 14.5-17.5 line is 2.0-2.45 outs.
4. Counter-evidence the finding omits: paper-mode.ts:131 records outs graded 49.8% vs 49.2% implied over 554 picks at the 08-15 lift, so a realised paper loss from this market is not shown in the repo; the proven harm is mis-stated probability/EV (25-pt RMSE vs close), not demonstrated lost paper profit. 'Single largest stake sink' is from the auditor's replay (43.8% of stake in a 09-17..10-17 hypothetical), not from the ledger.

Why medium not high: paper trading only; the auto card has excluded the market since 2026-10-06; the last archived MLB board is 2026-10-17 and the season is over, so nothing is being priced now; the defect is a known, written-down item awaiting owner sign-off rather than a new discovery. It becomes high if the outs-off gate is lifted, or next season starts, without a model fix.

Fix notes: replacing 0.140 with Ltb (legacy/index.html:2011 confirmed) and recentring the clamp is sound. The interim 'force weight to 0.05' should NOT be done by editing shWm in legacy/index.html (hashed/parity-tested engine); the same effect is available at runtime through SH_V2.calW['pitcher_outs'] (shWm :1743-1753 already floors at 0.05), set where calW is armed (app/api/generate/route.ts:423, src/lib/engine-client.ts:374). The simulator hook reference at legacy/index.html:1921-1923 exists. Minor extra display bug seen: the case text prints 'X IP over N starts last 30 days' even when N < 3 and the season branch supplied ipg (:2248-2250 vs :2266).

<a id="f-b1-3"></a>
#### B1-3 — Calibration loop put pitcher outs back to full model weight on 2026-08-16 and left hits and total bases untouched; it tests the blended probability and moves 10% a week

- Severity: medium. Area: MLB model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/engine2/calibration.ts:118-133 and :267-277 test `x.p` (the blended, market-anchored probability) against outcomes with a Wilson interval; :683-706 weekly step STEP 0.10, shrink-only, drift back +10% when not significant; :596-603 slope multipliers need n >= 100 and CI significance. Observed on archived boards, `python3 -I /private/tmp/claude-501/audit-out/areaB/b3_tests.py` (T1) and b4_effw.py: pitcher_outs wBlend 0.05 on 2026-08-06..08-15, then 0.35 from 2026-08-16 through 2026-10-17 (0.315 and 0.347 for two weeks in September); effective weight recovered from rows = 0.349-0.351 on outs overs and 0.205-0.286 on outs unders after 08-16, while the raw outs gap stayed at -21 pts. batter_hits 0.35 on all 2,197 rows, never adjusted. pitcher_strikeouts walked 0.35 -> 0.315 -> 0.284 -> 0.255 -> 0.23 -> 0.207 -> 0.186 -> 0.167 (one 0.9 step per week from 2026-08-23), batter_home_runs 0.35 -> 0.151 over nine weekly steps: the loop called both markets significantly overconfident every week for two months and still left a weight of 0.17. The jump from the floor to 1.0 in one day cannot come from the weekly +10% rule; it coincides with the side-aware change (docs/session-handoff.md:1971-1975). The stored Redis weight state is not on disk, so the cause of the reset could not be determined.

**Impact.** Accuracy and paper profit: the loop that is supposed to take weight away from a failing market gave the worst market (outs) the maximum weight for nine weeks, and reacts to a failing market at 10% a week. Because it scores the blend, a raw model that is 20 pts wrong reads as about 7 pts wrong and escapes on small samples.

**Proposed fix.** Score the raw model (pModel) against the consensus on the same rows by log loss / Brier and set each market's weight from that comparison: weight = 0 when the model does not beat consensus out of sample, fitted slope otherwise, applied immediately rather than walked. Keep per-side keys but never let a market-level key rise when its per-side key is at the floor. Persist the weight history to the line-history repo so a reset is auditable, and add a test that a market with a documented open defect cannot exceed the floor.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code and data, with three corrections and a severity downgrade.

What I checked (opened myself):
- src/engine2/calibration.ts:115-133, 263-277: bucket and per-market tests use x.p with a Wilson interval. src/lib/pred-serialize.ts:246-248 and 431-437 show p = r.prob (the blended probability); pModel is stored (pred-serialize.ts:247) but calibration.ts never reads it (grep: zero hits). fitReliability (calibration.ts:385-398) also regresses on the blended p.
- calibration.ts:682-684, 691-706: STEP 0.10, weekly clock, shrink-only, +10% drift when not significant. :596-603 slopeMults needs n>=100 and slope+1.96se<1. :636-639 effective mult = min(weekly state, slope mult).
- legacy/index.html:1738-1754 (shWm) and :2454-2465, :2499: row wBlend = max(0.05, 0.35*calW[mkt]*calG), written BEFORE the "|u" shrink, so wBlend is the market-level weight.
- Re-ran /private/tmp/claude-501/audit-out/areaB/wblend_scan.py directly against pl-history/data/boards/*.latest.json.gz: pitcher_outs 0.05 on 2026-08-06..08-15, 0.35 from 08-16 to 10-17 except 0.315 (09-06..09-12) and 0.347 (09-14..09-19). batter_hits 0.35 on every board. K's 0.315 from 08-23 down to 0.167 on 10-04 (seven 0.9 steps). b4_effw.py reproduces: outs overs eff w 0.349-0.351, outs unders 0.286/0.209/0.205 after 08-16.
- My own script /private/tmp/claude-501/audit-out/verify_b1_3/outs_gap.py on the raw boards: outs over-oriented raw gap mean -22.3 (n=248) before 08-16, mean -18.5 / median -22.1 (n=751) after; 580 of 751 listed rows are unders.

Corrections to the evidence:
1. Total bases was NOT untouched: wBlend 0.315 on 08-09..08-15, 0.347 on 08-16..08-22, 0.35 from 08-23 (one shrink step, then drifted back). TB unders also carry "|u" shrink later (eff w 0.257 then 0.207). Only batter_hits was never adjusted on either side.
2. Home runs took eight steps, not nine (0.35*0.9^8 = 0.151 on 09-27), then drifted UP to 0.166 on 10-04, so it was not called overconfident every single week.
3. The reset does NOT coincide causally with the side-aware change. The 08-16 board that already shows outs at 0.35 is stamped 2026-08-16T20:30Z (at=1786912209801), and the side-aware commit 5b88055 is 16:52 PDT = 23:52Z the same day. What it coincides with is the Sunday 10:00Z weekly fit (the same board shows HR 0.315->0.284 and TB 0.315->0.347, i.e. a weekly cycle ran). The cause is very likely determinable from code plus docs: docs/session-handoff.md:3829-3832 records mults {pitcher_outs: 0.1429} with the weekly log at 0 entries, so the outs floor came from the stateless slopeMults channel, not the weekly walk. slopeMults is all-or-nothing and recomputed from scratch each summary (calibration.ts:596-603, merged at :636-639); once the fit stops being CI-significant the key vanishes and the weight returns to 1.0 in one step. Since the fit scores the blended p, ten days of outs rows priced at w=0.05 (near-consensus) entering the window is a plausible reason the significance was lost, i.e. the shrink erased its own signal. This is inference; the Redis summary is not on disk so it is not proven.

Severity: downgraded to medium. Guards that limit the damage on outs specifically: per-side "|u" shrink from 08-23 cut outs unders (77% of listed outs rows) to ~0.2-0.29; src/lib/under-bias.ts pruneOutsUnder (lock-card.ts:484) kept outs-under tickets out of the paper pool from 08-16; src/lib/found-mode.ts:146 OUTS_OFF_SINCE 2026-10-06 takes outs off the card entirely; paper trading only; MLB boards end 10-17. The design defects (blend-scored test, 10%/week walk, memoryless slope mult that can snap a floored market back to full weight) are real and will recur next season, but the "worst market at maximum weight for nine weeks" impact was true only for the market-level/over side and the board ranking, not for the bulk of outs rows or the locked card.

Fix: the proposal stands; add that the slope multiplier needs memory (hysteresis or evaluate on pModel vs outcome rather than the already-shrunk blend), since that channel, not the weekly walk, is what released outs. Note calibration.ts:278-286 mktCmp already compares Brier vs consensus but on x.p (blend) and is display-only (CalibrationPanel.tsx:188-194).

<a id="f-b1-4"></a>
#### B1-4 — Game simulator is mis-calibrated: 1.36 runs per game above the market total, no home-field advantage, and half the market's moneyline spread

- Severity: medium. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Sim constants hand-set, not fitted: legacy/index.html:1770 SH_ADV; :1923 manager hook; :1927-1928 times-through-order multipliers; outcomes are BB/1B/2B/3B/HR/out only. Moneyline uses the sim directly with no home term: legacy/index.html:2169 `model=sim.pHome`; the only 0.52 home constant is in the non-sim fallback at :2175 (grep for hfa/homeAdv/home-field returns nothing else). Tests on archived boards, `python3 -I /private/tmp/claude-501/audit-out/areaB/b3_tests.py`: (T5) 327 pre-game simulated games: mean simulated total 9.58 runs vs mean market total line 8.22, difference +1.36 (median +1.32, above the line in 89.0% of games; +1.17 in August, +1.43 in September); sim P(over) minus de-vigged market +5.64 pts, above in 72.8%; simulated home runs 4.672 vs away 4.913. (T4) 365 pre-game sim moneylines: model home win 49.9% vs market 53.4% (-3.53 pts home-oriented); regression of (model-50) on (market-50) through the origin = 0.51; mean absolute gap 7.6 pts; run line home-oriented -2.55 pts on 379 rows. H+R+RBI is priced from the sim marginal pre-game (legacy/index.html:2392-2396): `b5_tests.py` T10 raw over-oriented gap +6.55 pts on 1,684 sim rows (+11.03 on 476 closed-form rows); uncapped blended gap +2.85 pts at line 0.5 with the model above market on 89.1% of 1,435 rows, +1.55 at line 1.5 (75.3% of 5,302).

**Impact.** Accuracy: the run environment is inflated by about a sixth, which is the mechanical source of the H+R+RBI over bias that CORE_RULES.noHrrOver (src/lib/paper-mode.ts:197) patches by banning the side; moneylines lean about 3.5 pts to the road team and understate favourites by half, so ML/RL model input is close to noise. Paper profit is bounded by the 0.15 ML/RL weight and the HRR-over ban, but the ban throws away a whole side of a market instead of fixing the cause.

**Proposed fix.** Calibrate the sim before it prices anything: scale per-PA on-base/extra-base rates (or the bullpen tail and advancement constants) so the mean simulated total matches the de-vigged market total and league runs per game on the archive (target within +/-0.3 runs); add a home-field term fitted so mean sim home win equals the market's about 53.5%; fit a slope/intercept from logit(sim) to logit(closing) and apply it, or set the ML/RL model weight to 0 until the sim beats consensus on log loss. Add a replay test on archived boards asserting those three statistics.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real, but two of its three headline claims are overstated and the severity should be medium, not high.

CONFIRMED IN CODE
- legacy/index.html:1770 SH_ADV is a hand-set constant table; :1921-1923 manager hook; :1925-1928 times-through-order multipliers.
- legacy/index.html:2169 `model=sim.pHome` with no home term; the only 0.52 is the non-sim fallback at :2175. A case-insensitive grep for hfa/homeAdv/home-field/homeField returns nothing. The vector builder (:2076-2093, :2107-2120) builds home and away vectors identically, with no home adjustment.
- SH_W = {props:0.35, ml:0.15, rl:0.15} at :1738. All 365 archived sim moneyline rows carry wBlend 0.15.
- H+R+RBI takes the sim marginal pre-game at :2392-2396.
- src/lib/paper-mode.ts:197 `noHrrOver: true`.

CONFIRMED IN DATA
I re-ran b3_tests.py and b5_tests.py and every quoted number reproduces: 327 pre-game sims, 9.58 vs 8.22, +1.36, 89.0%, +5.64 pts, home 4.672 vs away 4.913, moneyline 49.9 vs 53.4, through-origin slope 0.51, run line -2.55, H+R+RBI +6.55 / +11.03.

CORRECTIONS
1. "1.36 runs above the market total / inflated by a sixth" is overstated. It compares the sim's mean total with the market line, which is a median-like number, and run totals are right-skewed, so part of the gap is expected. The cleaner measure is P(over): +5.6 pts overall, and +8.1 pts on the 188 half-point lines (58.0% vs 49.9%). The 139 integer lines show only +2.3 pts. The sim is running hot, but by an amount this archive cannot pin to 1.36 runs. The fix should target sim P(over) or median against the market, not mean = line; forcing the mean down to the line would over-correct.
2. "Half the market's moneyline spread / understates favourites by half" is wrong as worded. My check on the same 365 rows: the sim's home-win standard deviation is 9.9 pts against the market's 9.1, correlation 0.54, OLS slope 0.59 with intercept 18.3. The sim is not compressed; it is as dispersed as the market but only moderately correlated with it. A logit slope/intercept refit would therefore not repair it. The proposal to set the ML/RL model weight to 0 until the sim beats consensus is the sound part of the fix.
3. The claim that sim run inflation is "the mechanical source" of the H+R+RBI over bias is not established. The closed-form (non-sim) rows show a larger over gap (+11.03 on 476 rows) than the sim rows (+6.55 on 1,684), so the bias exists without the sim. The category rows are also selection-biased.
4. Minor: "outcomes are BB/1B/2B/3B/HR/out only" omits the +1% HBP folded into the walk rate (:2088) and the ROE constant in SH_ADV. The October gap (+2.56) rests on 19 games.
5. No test here compares against actual results. Every statistic is sim versus market, so "mis-calibrated" means "disagrees with consensus"; the archive files used hold no final scores.

IMPACT IS NARROWER THAN "HIGH"
- The totals / first-5 / team-total sim desk is display-only: the comment at legacy/index.html:2860-2863 says none of it feeds parlays, the allocator or grading.
- At weight 0.15, the -3.5 pt home lean moves the blended moneyline about 0.5 pt and the 7.6 pt mean absolute gap about 1.1 pt.
- H+R+RBI overs are already barred from core (src/lib/server/lock-card.ts:382, except the dedicated hrr slot on variety days) and from found mode (src/lib/server/lock-card.ts:1144).
- It is paper trading only.

The no-home-field defect and the hot run environment are genuine and worth fixing before the sim is given more weight.

<a id="f-b1-6"></a>
#### B1-6 — Strikeout opponent factor is anchored at 0.235 against a per-at-bat rate, hits its +20% cap on a fifth of rows, and stacks a second lineup-strikeout factor on top

- Severity: medium. Area: MLB model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2279-2280 lineup rate = mean of `shBlend(hs, k, "ab", 10)` (strikeouts per at-bat, 7/15/30-day blend, not shrunk), `f=shClamp((kr/c)/0.235,.8,1.2,"2280")`; same line block `lam=kps*f*uf*wf` with `wf=shOppWhiffF(...)` (legacy/index.html:1626-1629, lineup whiff percentile, +/-7%); :2274 own-rate shrink k=4 on about 4 starts. `python3 -I /private/tmp/claude-501/audit-out/areaB/b3_tests.py` (T2): 789 pre-game strikeout rows with a lineup read: lineup K/AB mean 0.2454, median 0.2400 (p10 0.195, p90 0.298); factor mean 1.028, above 1 on 56.5% of rows, on the 1.2 cap on 20.8%; raw over-oriented model-minus-market gap +3.90 pts (64.4% above market) when a lineup is posted vs +0.55 pts (47.2%) on 108 rows with no lineup read; both factors apply together on 654 of 897 rows and point the same way on 60.6%. Uncapped blended gap +0.95 pts, above market on 61.9% of 896 rows (b5_tests.py T6); mean absolute raw gap 10.5 pts, 26.3% of rows >= 15 pts. In the found replay strikeout overs carry 32.0% of stake at a mean raw gap of +22.3 pts (b6_found.py, current rule).

**Impact.** Accuracy: strikeout overs are inflated by about 3 pts raw whenever a lineup is posted, and a noisy nine-man small-sample average swings the mean by up to 20%; this market is now the second-largest share of found stake.

**Proposed fix.** Anchor on the league K/AB from the same pull (LH.k/LH.ab, already summed at legacy/index.html:1483) instead of 0.235; shrink each hitter's K rate toward his prior before averaging; tighten the clamp to about +/-10%; apply either the K-rate factor or the whiff-percentile factor, not both; raise the own-sample weight as for outs. Re-fit on DraftKings/FanDuel lines.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED, with the framing corrected: the problem is mostly noise and over-application of the lineup factor, not a unit error, and the mean bias in the final probability is under 1 pt.

Code checked (all as cited):
- legacy/index.html:2279-2280 — lineup rate is the plain mean of `shBlend(hs, k, "ab", 10)` over hitters (needs c>=5), then `f=shClamp((kr/c)/0.235,.8,1.2,"2280")`. shBlend (legacy/index.html:1707-1712) is a 0.25/0.35/0.40 blend of last7/15/30 K/AB with no shrink.
- legacy/index.html:2282 `lam=kps*f*uf*wf`; `shOppWhiffF` at legacy/index.html:1626-1629 clamps 0.93-1.07.
- legacy/index.html:2274 `shShrink(kps,nK,4,LkgP)`.
- The fix is feasible: `LH=LG.hitting_last30` with LH.ab is already in scope at legacy/index.html:2010-2011, and L.k is summed at :1483.

Numbers reproduced by re-running b3_tests.py, b5_tests.py and b6_found.py — every quoted figure matches (789 of 897 rows; mean 0.2454; factor mean 1.028; 56.5% above 1; 20.8% at cap; +3.90 vs +0.55; 654 rows with both factors, 60.6% same direction; blended +0.95 with 61.9% above market on 896; mean |gap| 10.5 with 26.3% at 15+; 32.0% stake share at +22.3).

Independent corroboration:
- The engine's own stored clamp log (pl-history data/boards/*.best.json.gz, `clampActivity["2280"]`) sums to n=1010, 217 at the upper bound (21.5%) and 60 at the lower (5.9%).
- Deduped to 718 pitcher-date clusters (my script: /private/tmp/claude-501/audit-out/verify-b1-6/v1.py), the raw over-oriented model-minus-market gap rises monotonically with the factor: f<=0.9 -6.5 pts; 0.9-1.0 +2.6; 1.0-1.1 +5.5; 1.1-1.2 +10.9; at cap +10.5. Correlation 0.52. This is stronger evidence than the auditor's lineup/no-lineup split, which is confounded and thin (89 clusters, SE 1.5).
- The fitted shrink-only K blend weight has fallen every week, from 0.35 (through 2026-08-22) to 0.167 (2026-10-04 onward) in stored `wBlend`; mechanism at legacy/index.html:1738-1750 and :2453-2465. The system's own graded calibration is discounting the K model's deviations.

Corrections to the finding:
1. 0.235 is in the right unit (K/AB), not a scale mismatch; docs/pitcher-outs-audit.md:115 calls it correctly scaled. It is only about 4-5% low: stored lineup mean is 0.2454, and the league k_pct of 22.1152 per PA in tests/fixtures/fix45/priors.json implies roughly 0.245-0.25 per AB (my estimate, not a stored number). The mean inflation is therefore about +2.7% in lambda.
2. The stacking is real but small. Stored whiff factors range only 0.95-1.04 with mean 0.999; the combined f*wf maximum is 1.248. The double-count risk was already noted at docs/collection-period.md:5570.
3. Impact is two-sided. Low-K lineups push the model about 6.5 pts under the market, so "overs inflated" understates the issue: the factor drives dispersion in both directions, with a modest net over tilt.
4. No outcomes exist on disk, so "inflated" means relative to the market consensus only; it is not proven against results.
5. Partial guard: the market blend, now at 0.167 weight, cuts the +3.9 raw mean to about +0.95 blended (and less at the current weight). The harm is in selection — found-mode K bets sit at +14 to +22 pts raw gap — rather than in the average displayed probability. The found replay is small (21 K overs, 27 board dates).

Medium stands: it is paper trading only, the mean bias is small after the blend, but the factor demonstrably drives which K bets get selected. I did not evaluate the "raise the own-sample weight" part of the fix.

<a id="f-b1-7"></a>
#### B1-7 — Hot-form and walk-rate amendments (M10/M11) are computed as shadows on every row but never used; the shadow is measurably closer to the market

- Severity: medium. Area: MLB model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2308-2309 walk rate is an unshrunk 7/15/30-day blend per at-bat feeding expected at-bats; hit rate shrink k=60 against about 80 last-30 at-bats (legacy/index.html:2348-2349, batVec :2050-2093); shadow block legacy/index.html:2405-2445 (`m11` = 0.9 x expected-stat prior + 0.1 x last-30, `m10` walk rate shrunk k=75, `all`), stored on propBoard rows as `sh` and read by nothing in the pricing path. `python3 -I /private/tmp/claude-501/audit-out/areaB/b5_tests.py` (T9), pre-game closed-form rows joined to their shadow: batter_hits n=2,038, live raw model vs consensus fair mean +2.36 pts, RMSE 7.20; shadow `all` mean +1.43, RMSE 5.89 (m11 alone 6.08; m10 alone 7.04; m1 alone 7.20). batter_total_bases n=2,204: live RMSE 8.70, shadow `all` 7.29 (m11 alone 7.49). The found replay puts 49.4% of current-rule stake on hits overs at a mean raw gap of +14.1 pts (b6_found.py).

**Impact.** Accuracy: about a fifth of the raw model's distance from the market on hits and total bases is recent-form noise the engine already knows how to remove. Those gaps are what the found filter converts into stakes. No outcomes are on disk, so closeness to the market is the only yardstick; it does not prove the shadow is better against results.

**Proposed fix.** Grade the stored shadow series against outcomes in the prediction store (the data exist remotely), and if `all` beats live on log loss, promote m11 and m10 into the live path behind one config flag with a parity test; at minimum raise the hit-rate shrink constant so the prior carries most of the weight at about 80 at-bats.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code and data; I could not refute it, but several parts need correcting.

CODE (all opened):
- legacy/index.html:2308-2309: walk rate is `shBlend(...bb, "ab", 10)||0.09`, an unshrunk 7/15/30 blend (shBlend at :1707-1712 has no prior), only clamped 0-0.25, feeding `expAB`.
- legacy/index.html:2348-2349 (hits) and :2350-2351 (total bases): `shShrink(bn.r, bn.n, 60, shPriorH(...))`. `bn.n` is the largest window's at-bats (:1714-1719), and the prior is xBA when priors are armed (:1582-1583). At about 80 at-bats the recent blend keeps roughly 57% of the weight.
- Shadow block legacy/index.html:2417-2445 matches the description: m11 = 0.9 x prior + 0.1 x last-30, m10 = walk rate shrunk k=75, plus m1, m8 and `all`.
- The shadow is attached at :2507, copied to propBoard as `sh` at :2598 and :2612, and nothing else reads it. `shdw` appears only at 2417, 2438, 2507 and 2598. A grep of src/app/tools found no reader outside the generated engine copy, tests/shadow-prices.test.ts and tools/self_consistency.py.

DATA:
- Re-ran `python3 -I audit-out/areaB/b5_tests.py`; the T9 numbers reproduce exactly (hits n=2,038, RMSE 7.20 vs 5.89; total bases n=2,204, 8.70 vs 7.29).
- b6_found.py reproduces the 49.4% stake share and +14.1 raw gap, but that is one rule variant with only 29 hits-over bets.
- My own check (audit-out/verify/b1_7_check.py) used every propBoard row carrying `sh`, not the top-50-by-probability category rows, with the raw model backed out of the blended price. Hits n=6,733: raw RMSE 7.26 vs shadow `all` 5.94 (m11 alone 6.19). Total bases n=8,979: 7.99 vs 7.20. Shadow rows span 2026-08-06 to 2026-10-17 (68 dates).

CORRECTIONS:
1. "About a fifth" holds for hits (18%). For total bases it is about 10% on the full row set (16% only on the top-50 rows).
2. The +2.36 mean live bias on hits is a selection artefact of the top-50-by-probability list; on all rows the mean raw gap is about 0.0.
3. Impact is overstated by omission. Raw gaps do not reach stakes directly: the live price is `w x model + (1-w) x market fair` with w at most 0.35 (:1738, :2459-2464). The blended live price sits at RMSE about 2.5 from fair on hits, so promoting the shadow would move final prices by roughly 0.35 x 1.3, about 0.5 pt RMSE.
4. Not a new discovery. docs/freeze-exit-bundle.md:36 already ranks M11 "RANK 1 — WHOLE-ENGINE", and :66-129 describe the shadow series as a deliberate, signed-off evaluation with a pre-committed reading. "Never used" is by design, pending close-grading. The real defect is that the planned freeze-exit decision (2026-09-22 per the doc) has passed and the shadow is still unpromoted and ungraded in this checkout.
5. Closeness to market is weak evidence (a model equal to the market scores 0); the finding does say so.
6. Fix: the doc's signed-off M11 spec is the expected-metric-primary rate (0.9/0.1), not merely a larger k. "Raise k" is a weaker substitute, and any promotion breaks engine parity baselines, so it needs the parity or shadow-prices test updated.

Severity medium is acceptable: paper trading only and blend-attenuated, but it bears on the market that takes about half of found-mode stake.

<a id="f-b1-9"></a>
#### B1-9 — Every tuned threshold was set in sample on small Caesars-era samples or by hand; none was fitted out of sample or on DraftKings/FanDuel prices

- Severity: medium. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:1735-1738 comment that the blend weights are recommended ranges that could not be fitted out of sample, `var SH_W={props:0.35,ml:0.15,rl:0.15}`; :1755 SH_EDGE_MIN; :1557 SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5} while props are pulled at regions=us (:1366), so only the betonlineag weight can ever apply to props; :1734 SH_OVER_LEAN. src/lib/paper-mode.ts:152-197 CORE_RULES (shrinkW 0.5, maxDec 2.6, noHrrOver) 'motivated by the 19 paper days 2026-08-15..09-02 (129 core tickets)' and then applied to those same days' successors with no hold-out. src/lib/under-bias.ts:6,20 UNDER_BIAS overShare 0.75 from '3 served days, 619 graded picks'. src/lib/paper-mode.ts:133 SUSPENSIONS_LIFTED. src/lib/found-mode.ts:27-29 found-mode gate chosen by looking at three boards (2026-09-30, 10-01, 10-03). src/engine2/calibration.ts:70,358-360,551 sample floors (50/100/150). Settlement book was Caesars until 2026-09-16 and DraftKings from 2026-09-17 (src/lib/sportsbook/books.ts:12; archived rows' settlementBook), so every one of these numbers was read off Caesars-priced tickets or a consensus of books the owner cannot bet. Shrink constants k = 4, 10, 60, 150 are unjustified anywhere (docs/pitcher-outs-audit.md section 8 table).

**Impact.** Accuracy and profit: overfitting risk on all selection rules; rules such as the under cap and the HRR-over ban encode symptoms of model defects found on a few days, and the consensus weights assume sharp books that the props pull does not fetch.

**Proposed fix.** Flag all of the above for re-tuning on DraftKings/FanDuel: export the graded prediction store and ledger, split by date into fit and hold-out, re-fit blend weights, shrink constants and the found gate against outcomes at DraftKings and FanDuel prices, and record the fit window and hold-out result beside each constant. Until then treat them as priors, and prefer removing a rule whose cause is fixed at source (HRR-over ban once the sim is calibrated).

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in substance, but the "all Caesars-era, none on DraftKings/FanDuel prices" framing is overstated and needs four corrections. Medium is at the upper end: this is paper trading, and most of the rules only pull toward the market or restrict the card.

**Evidence that checks out (opened each file):**
- `legacy/index.html:1735-1738` carries the comment that the blend weights "can't" be fitted out of sample, with `SH_W={props:0.35,ml:0.15,rl:0.15}`; `:1755` is `SH_EDGE_MIN`; `:1557` is `SH_BOOKW`.
- The props pull is hard-coded to `regions=us` (`legacy/index.html:1366`) and the server allow-list enforces it (`src/lib/server/odds-shape.ts:9`). Game lines use `us,eu` (`legacy/index.html:1257`, `src/lib/engine-client.ts:361-362`), so the sharp-book weights reach ML/RL but only `betonlineag` can reach props. Which region each book belongs to could not be checked offline.
- `src/lib/paper-mode.ts:145-190` says every `CORE_RULES` number is "motivated by the 19 paper days 2026-08-15..09-02 (129 core tickets)"; `SUSPENSIONS_LIFTED` is at `:133`.
- `src/lib/under-bias.ts:6,20` gives "3 served days, 619 graded picks" and `overShare: 0.75`.
- `src/lib/found-mode.ts:27-30` shows the gate was chosen from three boards (2026-09-30, 10-01, 10-03).
- `src/engine2/calibration.ts:70,359-360,551` holds the floors 50/100/150.
- `docs/pitcher-outs-audit.md:275-292` has the k = 4/10/60/150 table and states "None of the nine is justified anywhere in the repo".
- A grep of `calibration.ts` for hold-out, out-of-sample or walk-forward logic found nothing.

**Corrections:**
1. **Not all Caesars-priced.** Selection has been on the DK/FD basis since 2026-08-21 (`src/lib/server/lock-card.ts:65-69`, commit a5243a6), so roughly 13 of the 19 `CORE_RULES` days were already selected at DK/FD prices. Only the settlement price was Caesars until 2026-09-17 (`src/lib/sportsbook/books.ts:11-12`). Archived boards for 09-02 and 09-16 carry no `settlementBook` stamp; 09-17 and 10-03 are stamped `draftkings`.
2. **The found-mode gate is DraftKings-era.** Its three boards are 09-30 to 10-03, after the switch, so it is small-sample (three boards) but not Caesars-priced.
3. **`SH_OVER_LEAN` is inert in production.** It applies only in legacy selection modes (`legacy/index.html:2470-2477`); the lock mode is `dk_fd`, so it is not a live threshold to re-tune.
4. **`SH_W` is not purely static.** A weekly, shrink-only adjustment from the graded record modifies it, with tier and significance guards (`legacy/index.html:1743-1754`, `src/engine2/calibration.ts:664-690`), and the 0.5 market shrink sits on top (`src/lib/shrink.ts`). That is a forward-applied fit, though with no hold-out validation.

**Smaller points:**
- The `calibration.ts` values are minimum-sample guards, not fitted selection thresholds. The 150 gap floor has a stated standard-error justification (`:541-551`), so listing them as in-sample tuning is a stretch.
- The same doc calls k = 150 on HR rate "statistically defensible" and records a measured k = 3.4 for the unshipped outs fix (`docs/pitcher-outs-audit.md:289,539`).

The proposed fix stands (record the fit window and hold-out result beside each constant, re-fit at DK/FD prices), but should drop `SH_OVER_LEAN` and the sample floors from the re-tune list.

<a id="f-b1-10"></a>
#### B1-10 — Model inputs frozen at 2026-07-29 are still fed to every board: Statcast priors, bullpen workload and pen quality

- Severity: medium. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** public/model/priors.json generated_at 2026-07-29T15:58:41+00:00 (last commit 671aed9, 2026-07-29); public/model/context.json date 2026-07-29 (last commit 64c42ad). .github/workflows/model.yml:7-10 schedule commented out ('PAUSED 2026-07-29'); .github/workflows/context.yml:30-33 context.json no longer committed. The engine loads both with no date check: app/api/generate/route.ts:365-366 and `eng.set("SH_CTX", ctx)`; legacy/index.html:1663-1669 shPenF weights `SH_CTX.bullpen_last3` by daysAgo relative to 2026-07-29 for every later game; priors drive hit/HR/K shrink targets (legacy/index.html:1582-1594), pitcher quality (:1622-1624), lineup whiff factor (:1626-1629) and park factors (:1643-1648). Archived boards echo the same priorsSha/ctxSha fields through October (data.echo on 2026-09-20: priorsSha 00994434..., ctxSha 2a8bcba9...).

**Impact.** Accuracy: by October the skill priors are ten weeks stale (no player called up or changed after July has a current prior), and the simulator's bullpen-fatigue factor is computed from three specific July days for every game. Each factor is clamped (0.96-1.05 for fatigue), so the size is bounded, but the staleness is silent.

**Proposed fix.** Resume the nightly priors build and the context commit now that the collection window has closed, or have the engine ignore context older than one day (return 1 from shPenF and the ump/pen factors when SH_CTX.date is not today) and show the artifact dates on the Board. Add a staleness guard that fails the generate health check when either file is more than three days old in season.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in substance, with two corrections. The title overstates it: the pen-quality factor is pinned off, so only the Statcast priors and the bullpen-fatigue factor are live stale inputs.

What I checked and found true:
- public/model/priors.json has generated_at 2026-07-29T15:58:41+00:00 (last commit 671aed9, 2026-07-29).
- public/model/context.json has date 2026-07-29 (last commit 64c42ad, 2026-07-29 20:32Z). origin/frontend-rebuild serves the same two files.
- .github/workflows/model.yml:7-10 has the schedule commented out ("PAUSED 2026-07-29"). .github/workflows/context.yml:30-33 git-adds only data/ump_k.json. origin/main, the copy GitHub actually schedules, carries the same pause (commit a46c1f8).
- app/api/generate/route.ts:361-398 fetches both artifacts and sets SH_PRIORS / SH_CTX with no date check.
- legacy/index.html:1663-1669 shPenF reads SH_CTX.bullpen_last3 with daysAgo weights and never looks at SH_CTX.date. It is called at legacy/index.html:2114 for any game with two posted lineups and probables.
- The prior consumers at legacy/index.html:1582-1594, 1620-1629 and 1643-1648 are as described.
- History archive: I decompressed every data/boards/*.latest.json.gz. All 70 boards from 2026-08-06 to 2026-10-17 echo priorsSha 00994434be... and ctxSha 2a8bcba934...; the 2026-07-26 board has no echo. Script: /private/tmp/claude-501/audit-out/b110_echo.py.

Corrections:
1. Pen quality is not a live stale input. shPenQF returns 1 because SH_CFG.penQFrozen is true (legacy/index.html:1135, 1690). Even unpinned it would be inert, because no team clears the 15-IP guard (comment at legacy/index.html:1122-1134). The ump K factor is likewise pinned off (umpKFrozen, legacy/index.html:1604). From context.json only shPenF acts on probabilities; pen_quality and ump data feed shadow readers only.
2. The freeze is not an accident and not wholly silent. It is the owner-signed "data-vintage pause" (docs/collection-period.md:338-378; origin/main a46c1f8), and the document itself records the prediction-quality cost as "UNMEASURED, not zero". The hashes are echoed on every archived board. What is missing is any resume, any runtime staleness guard, and any artifact date on the Board. The pause was scoped to a collection window with August targets (docs/collection-period.md:367-369) but ran to the last archived board on 10-17.

Severity: medium stands, at the low end of it.
- Bullpen fatigue is bounded at 0.96-1.05 (combined clamp 0.92-1.10 at legacy/index.html:2114) and touches only the post-starter batting vectors in the lineup sim.
- The priors are the larger issue: every shrink target, percentile nudge and handedness lookup is ten weeks old, and post-July call-ups have no prior and fall back to the league mean. Park factors barely matter here because they are slow-moving.
- It is paper trading and the MLB season is now over, so there is no current harm. If nothing is resumed, the 2027 season opens on 2026-07-29 priors and July bullpen workloads.

Fix: the proposed fix is sound. Resuming means reverting a46c1f8 on origin/main, which is the scheduling copy, not just editing this branch. For the guard, shPenF should return 1 when SH_CTX.date is not the slate date; no change is needed for the pen-quality or ump factors, which are already pinned.

<a id="f-a-1"></a>
#### A-1 — MLB player stats are looked up by normalized NAME ONLY: the Dodgers' Max Muncy was modelled on the Athletics' Max Muncy's stats on 26 of 36 archived board-days

- Severity: medium. Area: data integrity. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2007-2008 builds lookupStats/lookupPit/lookupTeam keyed by pnorm(name) only (`var n=pnorm(k.split(" (")[0]);lookupStats[n]=slate.player_stats[k];var t=shTeamOf(k);if(t)lookupTeam[n]=t;`) although the source key is "name (team)" (legacy/index.html:1491-1492) - the last key iterated wins. legacy/index.html:2243-2244 reads `lookupStats[pnorm(row.p)]` with no team check and silently drops unmatched names; legacy/index.html:2606 writes `tm:lookupTeam[pnorm(row.p)]` on the board row from the same lookup. Command `python3 /private/tmp/claude-501/audit-out/areaA/samename3.py` over pl-history/data/boards/2026-*.latest.json.gz: "Max Muncy" rows inside Los Angeles Dodgers games carry tm:'ATH' on 26 of 36 board-days (e.g. 2026-07-26 LAD@NYM, 08-07/08-08 LAD@ARI, 08-12, 08-14..08-28, 09-11, 09-19..09-27, 10-04, 10-11, 10-12) and tm:'LAD' on the other 10. On ATH-tagged days the model disagrees wildly with the market: 2026-08-17 LAD@COL "H+R+RBI U 2.5" pModel 88.4 vs implied 53.3, "HR O 0.5" pModel 14.3 vs 27, "Hits U 1.5" 79.4 vs 67.2; 2026-08-18 "H+R+RBI U 2.5" 88 vs 52.9. `samename2.py`: 26 normalized names carry 2+ team tags across the archive, incl. maxmuncy ['ATH','LAD'] and luiscastillo ['CWS','SEA'] (Luis Castillo tagged SEA in a 2026-08-06 CWS@BOS game).

**Impact.** Accuracy and paper profit: a wrong player's season stats drive pModel, producing large false edges (30+ points of model-vs-market gap) that pass the EV gate and can be locked and staked up to the $800 found cap. It also poisons the calibration sample with wrong-player predictions. Recurs every day both same-name players are active.

**Proposed fix.** Resolve each Odds API prop player inside the matchup: look up by `pnorm(name)+"|"+teamAbbr` restricted to the two teams of the row's game (the stats key already carries the team), or map to the MLB personId from that game's roster/lineup. If a name resolves to a player on neither team, or to more than one candidate, drop the row and count it in the gaps list instead of modelling it. Add a regression test with two same-name players on different teams.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed as real; I could not refute it. Severity lowered from high to medium because the blast radius is narrow and no locked bet is shown.

**Code (all opened, lines match):**
- `legacy/index.html:2007-2008` builds `lookupStats` / `lookupPit` / `lookupTeam` keyed by `pnorm(name)` only, so the last key iterated wins.
- `legacy/index.html:1491-1492` shows the source key is `p.name+" ("+p.team+")"` and also stores `p.id`, which the lookup then ignores.
- `legacy/index.html:2243-2244` reads `lookupStats[pnorm(row.p)]` with `if(!st)return;` and no team or game check.
- `legacy/index.html:2496` and `:2606` take the label and `tm` from the same name-only lookup.
- No guard exists elsewhere: `lookupTeam` appears only at 2005/2007/2008/2496/2606, and a grep for same-name handling found none on the MLB engine path.
- This is the production engine: `CLAUDE.md:176` says it runs verbatim via `src/engine/legacy-src.gen.ts`.

**Data (my own script, `/private/tmp/claude-501/audit-out/verifyA1/v.py`, over `pl-history/data/boards/2026-*.latest.json.gz`):**
- "Max Muncy" appears on 36 board-days, always inside a Dodgers game; `tm` is 'ATH' on 26 and 'LAD' on 10. The dates match the finding.
- The quoted rows reproduce exactly: 2026-08-17 H+R+RBI U 2.5 pModel 88.4 vs implied 53.3; HR O 0.5 14.3 vs 27; Hits U 1.5 79.4 vs 67.2; 2026-08-18 H+R+RBI U 2.5 88 vs 52.9.
- The row's own `case` text shows a different player's stats: 08-11 (LAD tag) "13-for-66 (.197) with 5 HR / 31 TB last 30" versus 08-17 (ATH tag) "5-for-32 (.156) with 0 HR / 7 TB last 30".
- The 08-17 and 08-18 H+R+RBI rows were published at ev 16.4 and 19.9, conviction A, kellyF 0.02.

**Corrections to the evidence and impact:**
- **Luis Castillo is not a confirmed collision.** He is tagged SEA only on 2026-08-06 and CWS on every later day (08-12, 08-17, 08-22, 08-28) in White Sox games. That pattern fits a deadline trade, not a namesake.
- **The "26 names with 2+ team tags" count is not evidence of 26 collisions.** `samename2.py` counts across days, so it mostly captures traded players. Max Muncy is the only collision I could confirm.
- **"30+ point gap" overstates the staked edge.** That is raw pModel; the engine blends toward market, so the published edge on the worst row was 12.3 points (prob 65.6 vs implied 53.3).
- **Only two large false edges exist in the archive.** Across the 26 ATH-tagged days there are 10 positive-EV Muncy rows; apart from the two A-conviction rows above, the rest are ev 0.4 to 4.1.
- **No locked or staked Muncy bet is demonstrated.** No ledger is on disk. The ATH-tagged days since found mode began (10-04, 10-11, 10-12) carry no positive-EV Muncy row in the latest boards. The "$800 stake" impact is plausible but hypothetical, and this is paper trading.
- Muncy legs do appear in the suggested parlay sets on ATH-tagged days.

**Fix notes:**
- Prefer resolving by MLB person id (already stored as `into[key].id`) or by name plus the row's two game teams.
- A pure name+team key would leave a traded player on his new-team split only, so id-based resolution is safer.
- `CLAUDE.md:1223` and `:1459` forbid adding or removing a line at or above `legacy/index.html` L2402 without re-baselining, because clampActivity site ids are line numbers. The fix at 2007-2008 and 2243 must keep the line count, and `legacy-src.gen.ts` must be regenerated via `tools/extract-engine.mjs`.

<a id="f-b2-9"></a>
#### B2-9 — Prop fair prices rest on unmeasured assumptions: 1.08 hold on one-sided markets, proportional de-vig, equal book weights

- Severity: medium. Area: football model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** ATD_YES_ONLY_OVERROUND = 1.08, described in the file header as 'a stated ASSUMPTION ... not a measured figure' (src/lib/cfb/props.ts:21-26, 65, applied at :179-180). Two-sided props use devigProportional (props.ts:178) although src/engine2/devig.ts:4-6 itself says proportional overstates longshot chances and power/Shin exist unused at devig.ts:24-54. The MLB analogue of this assumption was measured at 1.161 against an assumed 1.06 (audit-out/prior-audit-regression.md, pl-history/data/hr_overround.json). One-sided and ladder markets are not in the found list (src/lib/cfb/found.ts:81), so today this reaches the Board grades and parlay sets, not the auto card.

**Impact.** Anytime-TD and ladder EVs shown on the Board are overstated by however much the true one-sided hold exceeds 8%; if football resembles MLB that is several points of EV. Two-way props on short and long prices are biased toward the longshot. Bounded today because the auto card takes only half-point two-way props.

**Proposed fix.** Measure the one-sided overround from stored two-sided anytime-TD pairs where a book posts both, store it like hr_overround.json, and use power or Shin de-vig for props away from even money. Show no EV on a one-sided row until measured.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, with corrections. Severity medium holds only conditionally: the football one-sided hold is unmeasured, so the size (and strictly the direction) of the bias is not proven from disk.

WHAT I VERIFIED
- src/lib/cfb/props.ts:65 `ATD_YES_ONLY_OVERROUND = 1.08`; header :21-26 calls it "a stated ASSUMPTION ... not a measured figure". Applied at :179-180 to every non-"ou" market with no opposite price. Two-sided pairs use devigProportional at :178.
- Equal book weights: header :29 ("Every book counts equally") and the plain median at :206-217.
- Nothing suppresses the output for assumed-hold rows: evCz, grade and kelly are computed the same way (props.ts:309-350). The only use of `assumedHold` outside the pricer is a small "estimated hold" label at src/components/cfb/CfbProps.tsx:586. The generator pool takes prob straight from the fair (src/lib/football/gen-pool.ts:171) and so does cross-sport (src/lib/cross-sport.ts:44), so the bias compounds per leg in anytime-TD parlay sets (setBands 2-4 legs, src/lib/cfb/rules.ts:551, src/lib/nfl/rules.ts:241).
- Auto card is insulated: src/lib/cfb/found.ts:81 and :96 (five two-way markets, side !== "yes", half-point line), and the core card has the same filter at src/lib/cfb/card.ts:251.
- MLB analogue is real: pl-history/data/hr_overround.json shows overround 1.1609 (87 days, 7,581 rows) against 1.06 hard-coded at legacy/index.html:2491; audit-out/prior-audit-regression.md:91 records it.
- src/engine2/devig.ts:4-6 does say proportional overstates longshots.

CORRECTIONS TO THE EVIDENCE
1. "power/Shin exist unused" is wrong as stated. `consensusProb` defaults to Shin (devig.ts:89-92) and is called from src/engine2/allstar.ts:114, :125, :485 and src/engine2/sharpBoard.ts:94, :127. They are unused only by the football prop pricer.
2. Scope is wider than anytime TD. The 1.08 also prices First TD and every one-sided ladder rung (kinds at src/lib/cfb/props-types.ts:29-34: receptions_alt, pass_tds_alt, rush_yds_alt, rec_yds_alt, first_td, tds_over). First TD is the likeliest worst case, but I could not measure it from disk.
3. First Sunday Six is not affected: src/lib/nfl/first-sunday-six.ts normalises first_td fairs to shares (fair / sum of fairs), so the constant cancels.

CORRECTIONS TO THE IMPACT
- The bias direction is "overstated" only if true hold exceeds 8%; that is plausible from the MLB result but not shown for football.
- Partial mitigation: fair = median(implied)/1.08 with minBooks 2 (rules.ts:76, :475; nfl/rules.ts:67, :196), so a DraftKings price at the median shows about -7.4% EV. A one-sided row grades positive only when DK is more than 8% better than the median, so the error bites at the grade margin and in displayed parlay hit probabilities, not on every row.
- If hold were 1.16 like MLB HR, relative overstatement is about 7% of (1+EV) per leg.
- The "equal book weights" sub-claim is weak: Pinnacle rarely posts these props (props.ts:29) and the feed is regions=us (rules.ts:474); in a DK+FD-only world weighting is moot.
- Proportional vs Shin on two-way props matters only away from even money; most half-point O/U props sit near -115/-115 where the methods agree closely.

CORRECTIONS TO THE FIX
- "Measure from stored two-sided anytime-TD pairs" cannot be done from the on-disk archive. pl-history holds no football prop data: data/props/2026-10-28.json is MLB only (no "anytime" or "americanfootball" strings), and data/boards/2026-10-17.latest.json.gz has no paperProps or anytime_td.
- Yes/No pairs would measure the two-way hold, which the code already strips at :178; that is not the one-sided hold. The right measurement mirrors hr_overround.json: sum of implied yes-only probabilities against realised scorers per game. That needs a football prop archive to be started first.
- Until measured, hiding EV/grade/Kelly on assumedHold rows (keeping price and the label) is the safe interim step, and it should cover First TD and ladder rungs as well as anytime TD.

<a id="f-b2-10"></a>
#### B2-10 — Props freshness: 2-hour board window, 30-minute quote acceptance, per-book quote time never checked, and props reach the card only on the NFL lock

- Severity: medium. Area: football model quality. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** revalidateSec 7200, liveRevalidateSec 600, czMissingRevalidateSec 1800 inside a 4 h window (src/lib/cfb/rules.ts:462-473; NFL at src/lib/nfl/rules.ts:188-197). Found props accept a pricedAt stamp up to 30 minutes old (src/lib/cfb/found.ts:99). paperProps is set only in app/api/nfl/lock/route.ts:221 and :274 (grep over src/lib/server and app/api; app/api/cfb/lock/route.ts has 0 matches) and attachProps runs in the lock path only (src/lib/server/football-lock.ts:834). Game lines in the lock path use the 240 s cache: feedsOf passes no fresh option (football-lock.ts:69-75; ODDS_TTL at src/lib/cfb/slate-server.ts:48, fresh branch at :111). last_update is never read (src/lib/cfb/names.ts:22,62).

**Impact.** A prop can be locked at a DraftKings price up to 30 minutes old against a consensus of the same age, and the Board can show props EV up to 2 hours old pre-kick. CFB's auto card never sees a prop and NFL's sees them only at the day's lock, so the later found passes spend the remaining room on sides only: an artificial limit on the one market family where book disagreement is largest.

**Proposed fix.** Stamp each prop row with the settle book's own last_update and refuse a found prop older than about 5 minutes; pass fresh:true on the lock path's game-lines pull; attach a fresh props pull on every found pass for both leagues (credits now allow it per the rules.ts comment near :478) or state the limit on the card.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every cited fact checks out in the code, but the stale-price-at-lock impact is overstated and the proposed fix's credit claim is wrong.

**Confirmed**
- **Board windows:** `revalidateSec` 7200, `liveRevalidateSec` 600, `czMissingRevalidateSec` 1800 and `czMissingWindowSec` 4 h are at src/lib/cfb/rules.ts:463-473 and src/lib/nfl/rules.ts:189-195. A pre-kick game that has a DraftKings quote rides the 2 h carry (src/lib/server/football-props.ts:277, :299-300).
- **30-minute acceptance:** src/lib/cfb/found.ts:99 has `now - stamp <= 30*60_000`; the same gate is in src/lib/cfb/card.ts:251.
- **`last_update` unused on football:** it is only typed and copied at src/lib/cfb/names.ts:22 and :62. The only reader in src/app is src/lib/sportsbook/mlb.ts:34. `pricedAt` is the pull instant (football-props.ts:423-426), not the book's quote time.
- **Props only on the NFL first entry:** `paperProps` is assigned only at app/api/nfl/lock/route.ts:221 and :274, and `attachProps` is called only at src/lib/server/football-lock.ts:834 inside `foundFirstLock`. `foundPassDate` (football-lock.ts:672-766) makes only the game-lines pull (:710) and plans on a slate with no `paperProps`, so `propDrafts` returns [] (found.ts:86-87). app/api/cfb/lock/route.ts has no `paperProps` or `attachProps` match, and `slateFromEspnOf` never sets it (src/lib/cfb/slate-server.ts:155-162).
- **240 s game-lines cache on the lock path:** `feedsOf` passes no opts (football-lock.ts:69-75), app/api/nfl/lock/route.ts:242 passes none either, and `oddsPayloadOf` then uses `next.revalidate` `ODDS_TTL` 240 (slate-server.ts:48, :111).

**Corrections to the impact**
- **"Locked at a price up to 30 minutes old" is a worst case, not the normal path.** Both NFL attach sites call `footballPropsGet` with `forceFresh:true`. That marks every stored game for re-pull (football-props.ts:179, :288-290), sends it `cache: "no-store"` (:471), stamps `pricedAt` = now for fetched games (:426), and pulls the game lines fresh too (:192). The 30-minute gate only matters when a game's re-pull fails and its stored rows and old `pricedAt` are kept (docblock football-props.ts:76-78). In that case the gate is the guard, though a loose one.
- **The props-coverage limit is a documented design choice, not an accident.** The comment at football-lock.ts:784 says the attach is "run only where the pre-found lock ran it", and found.ts:28 describes props as present only "on a board that carries the NFL variety props". It is still a real limit on found mode: later passes and all of CFB are sides and totals only.
- **The 240 s item is minor.** I could not determine from disk whether Next serves stale-while-revalidate beyond 240 s on this route.

**Correction to the fix**
- **"Credits now allow it" does not follow from rules.ts:478.** That line only removes the app's daily ceiling; rules.ts:1 states the plan is 100k per month.
- **Arithmetic from the repo's own constants:** football found passes can fire on every 15-minute poke 08:00–18:45 PT (docblock above `foundOpenerOf`, football-lock.ts:896), which is about 44 pokes. At 31 credits per event, a forceFresh attach on every pass is at most 16 × 31 × 44 ≈ 21,800 credits per NFL day and 60 × 31 × 44 ≈ 81,800 per CFB Saturday. These are upper bounds, since `foundPassDate` skips when nothing is ahead or the room is spent.
- **What a workable fix needs:** throttle the attach (for example the existing 30-minute or 2 h per-game carry rather than forceFresh, or only games inside N hours of kickoff), or state the limit on the card.
- **The rest of the fix is sound:** stamp rows with the settle book's `last_update`, and pass `fresh:true` on the lock path's game-lines pull.

**Severity:** medium is the upper bound. This is paper trading, the normal lock path is fresh, and the substantive residue is Board prop EV up to 2 h old pre-kick, no book-level quote-age check, and the props coverage gap.

<a id="f-b3-13"></a>
#### B3-13 — Home-run fair value uses a 1.06 overround constant against a measured 1.16

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2491 one-sided HR fair = oneImp/1.06. pl-history/data/hr_overround.json: 87 days, 423 games, appeared sum_implied 1071.54 vs realized_hr_hitters 923 -> overround 1.1609 (all listed 1.1763); file's own verdict 'overround 1.161 vs the hardcoded 1.06 -> czEV overstated ~6.2pp'.

**Impact.** Every home-run row's fair probability is about 9% too high relative to realised frequency, so HR EV is overstated by roughly 6 points and HR rows look +EV when they are not. HR is currently excluded from the core card (echo coreNoHR: true) but still ranks on the board and in the generator.

**Proposed fix.** Replace 1.06 with the measured value (1.16), recomputed monthly by tools/hr_overround.py and stored as a config value rather than a literal.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED; I could not refute it.

Evidence checked:
- legacy/index.html:2491 is exactly `var fair=oneImp/1.06;` in the one-sided branch (`else if(iO!=null)`), with p = wPr*pO + (1-wPr)*fair. This is the live engine: src/engine/legacy-src.gen.ts:1 is auto-generated from legacy/index.html.
- pl-history/data/hr_overround.json matches the finding: days 87, games 423, appeared 1071.54 / 923 = 1.1609, all_listed 1.1763, and the quoted verdict string. Last written by commit 12c468d (2026-11-01).
- No compensating haircut exists. There is no HR-specific overround in legacy/index.html, and shWm (legacy/index.html:1743) only shrinks the model weight.
- The generator consumes the inflated EV: src/lib/parlay-gen.ts:289 and :646 weight legs by exp(ev%/3), so about 5pp of extra EV is roughly a 6x draw weight. Grades come from EV (src/lib/grade.ts:19).

Guards that limit the impact (the finding's "excluded from core" is right, and understated):
- Core card: coreNoHR at legacy/index.html:1121 and :3005.
- Found pass: skips any HR leg at src/lib/server/lock-card.ts:1143.
- Straight pool: leaves HR out (src/lib/server/lock-card.ts:132).
- HR fun ticket: built at lock-card.ts:1042, but no new fun since STRAIGHT_SINCE (lock-card.ts:1078).
So no auto-staked paper path prices off this constant today. The exposure is board/ranked grades and generator weighting. MLB is also out of season; the last props archive is 2026-10-28.

Corrections to the finding:
1. Magnitude: the model weight is 0.35 (SH_W.props, legacy/index.html:1738), so the market weight is 0.65. At the quoted price the EV overstatement is 0.65*(1/1.06 - 1/1.16), about 5.3pp. The tool's 6.2pp is the relative-bias form (tools/hr_overround.py:211). "Roughly 6" is slightly high; the 9.5% fair inflation is correct.
2. The fix as written is too blunt. The 1.06 literal sits at two sites (legacy/index.html:2491 and :2605) and applies to every one-sided row, not only HR. Two-sided props measured 1.071 (docs/collection-period.md:796), so a global 1.16 would over-haircut non-HR one-sided rows. It needs to be an HR-specific value.
3. The 1.16 was measured on `bo`, the best over across all books (tools/hr_overround.py docstring). In dk_fd mode the anchor is the DK/FD basis price (legacy/index.html:2489), which is no better than best-of-books, so the DK/FD-basis overround is at least 1.16. It should be re-measured on DK/FD prices before a value is hardcoded.
4. A single constant ignores longshot bias across the price range.
5. This is a known, documented item, not a new discovery. docs/collection-period.md:796 lists 1.06 as a frozen parameter, and :1188 sets a trigger to reopen the FUN question only at 1.20 or above; 1.16 is below it. Changing the constant is an owner sign-off decision, and needs the generated engine rebuilt via tools/extract-engine.mjs.
6. The measurement tool already runs weekly (hr-overround cron `0 15 * * 0`, docs/cron-jobs.md:619), not monthly.

Severity: medium is defensible as a measured pricing bias that drives user-facing grades and generator selection. It is not higher because every automatic card path excludes HR and the system is paper-only.

<a id="f-a-2"></a>
#### A-2 — Football found/lock passes price game lines from the 240-second stale-while-revalidate Next data cache, with no quote-age gate and no quote time stored on the ticket

- Severity: medium. Area: data integrity. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/slate-server.ts:46-48 `ODDS_TTL=240`; :111 `fetch(..., opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } })`. src/lib/server/football-lock.ts:69-75 `slateFromEspn: (date, espn, now, bankroll) => slateFromEspnOf(cfg, date, espn, now, bankroll)` - `opts` is never passed, so every lock/found pass (:499, :710, :810) takes the cached branch; grep `fresh` in app/api/nfl/lock/route.ts and app/api/cfb/lock/route.ts returns nothing. The repo itself documents the cache semantics at src/lib/server/football-props.ts:72-74 (a stale entry answers with the OLD body and refreshes in the background). src/lib/cfb/found.ts:128-143 game-line candidates need only `r.playable && r.cz != null && r.evCz >= floor && r.cz.dec <= R.maxDec` - no age test - while props do have one at src/lib/cfb/found.ts:85-99 (`stamp<=now && now-stamp<=30*60_000`). `last_update` is parsed only at src/lib/cfb/names.ts:22,62 and never read by the game-line model.

**Impact.** Record integrity and paper profit: with pokes every 15 minutes the first request after the TTL is answered with the body fetched at the PREVIOUS request, so a recorded DraftKings price can be ~15 minutes old (older after a quiet gap) and already moved. +EV picks at a stale price are exactly the ones the market has moved against, which inflates recorded EV and paper P&L versus what was bettable. Nothing on the ticket lets this be audited afterwards.

**Proposed fix.** Pass `{fresh:true}` from feedsOf for every lock and found pass (the credit cost is already governed by the poke cadence). Reject a DK/FD game-line quote whose book `last_update` is older than N minutes (reuse the props' 30-minute rule or tighter). Persist the quote's `last_update` and the fetch time on each leg.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code; I could not refute the mechanism. Severity lowered from high to medium.

What I checked (all paths relative to /private/tmp/claude-501/pl-audit):
- src/lib/cfb/slate-server.ts:48 `ODDS_TTL = 240`; :111 fetch uses `opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } }`; :155-156 `slateFromEspnOf(..., opts?)` forwards opts to `oddsPayloadOf`.
- src/lib/server/football-lock.ts:72 `feedsOf` calls `slateFromEspnOf(cfg, date, espn, now, bankroll)` with no opts; the `LockFeeds.slateFromEspn` type (:64) has no opts parameter at all. Call sites :499 (top-up), :710 (found pass), :810 (found first lock) all go through it. Two further direct no-opts calls the finding did not list: app/api/cfb/lock/route.ts:425 and app/api/nfl/lock/route.ts:242 (legacy lock path).
- Both lock routes are `export const dynamic = "force-dynamic"` (app/api/cfb/lock/route.ts:223, app/api/nfl/lock/route.ts:74). I checked whether that disables the fetch cache: it does not. Installed Next is 15.5.20; node_modules/next/dist/server/lib/patch-fetch.js:341 applies force-dynamic's no-cache default only when the fetch has NO explicit cache/revalidate config, and this fetch has an explicit `next.revalidate`. patch-fetch.js:697-717: outside an ISR revalidation, a stale entry returns the cached body and refreshes in the background. So the stale-while-revalidate claim holds for these routes.
- Poke cadence: src/lib/server/grading-progress.ts:192 football found slots every 15 min 08:00-18:45 PT; 15 min > 240 s, so every found pass with no intervening cached board view is a stale hit served the body fetched at the previous pass.
- src/lib/cfb/found.ts:128-143 game-line filter has no age test; props filter at :85-99 does (30 min on `pricedAt`). `last_update` is only typed/parsed at src/lib/cfb/names.ts:22,62; no reader in the football model (the only consumer in src is the MLB sportsbook file src/lib/sportsbook/mlb.ts:34).
- Ticket carries `foundAt: now` (src/lib/cfb/found.ts:199,210) = pass time, not quote or fetch time. No quote stamp on the leg.
- No guard found: grep for revalidate/no-store/stale in football-lock.ts, lock-server.ts, found.ts shows none on the game-line path.

Corrections to the evidence:
- "grep `fresh` in the lock routes returns nothing" is loosely stated: it returns comment hits (e.g. app/api/cfb/lock/route.ts:105,108), but no `fresh` option is passed anywhere. Substance stands.
- Josh's manual Refresh (?manual=1) runs the same found pass through the same feeds, so it is also priced from the cached body. A Board "fresh" pull (app/api/cfb/route.ts:61, app/api/nfl/route.ts:66) uses no-store, which does not write the data cache, so it does not warm it for the lock pass. Only non-fresh board/props views (same URL, same cache key) warm it.
- Staleness can exceed ~15 min: the first found slot of a day (08:00 PT) after the last slot (18:45 PT) could be served a body ~13 h old if nothing else made a cached pull in between. Could not determine whether Vercel's data cache actually retains the stale entry that long in production (no network allowed); treat as plausible, unverified.

Impact corrections:
- The EV-inflation claim is a reasonable inference (EV is DK vs consensus inside one snapshot, so DK-outlier quotes are the ones most likely since corrected) but it is not measured; no file I opened quantifies it.
- Why medium rather than high: paper trading only; typical staleness (~15 min) is inside the repo's own 30-minute tolerance for prop quotes (src/lib/cfb/found.ts:98); pregame game lines; the hours-stale case depends on unverified production cache retention. It is still systemic: every football game-line found ticket on an unattended slot is priced one poke late, and nothing on the ticket lets it be audited.

Fix corrections:
- Passing `{ fresh: true }` is credit-neutral: a stale hit already triggers one billed background pull per poke (the repo says as much at app/api/cfb/lock/route.ts:105-108), so no-store swaps a discarded-for-this-pass pull for a used one. It needs the `LockFeeds.slateFromEspn` signature (:64) widened or `feedsOf` hard-coding fresh, plus the two direct route calls (:425, :242).
- tests/cfb-route.test.ts:99-100 and tests/board-refresh-full.test.ts:234 pin the current fetch literal and ODDS_TTL; they stay green if only the callers change.
- A `last_update` gate needs the stamp carried from names.ts through the model rows first; today only the bookmaker-level field is parsed, not the market-level one.

<a id="f-c1-7"></a>
#### C1-7 — Locks can be written from stale prices: football lock path never bypasses the 240 s odds cache, and the MLB self-check backfill locks from a stored board up to 30 minutes old

- Severity: medium. Area: selection and staking. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** Football: src/lib/server/football-lock.ts:68-75 feedsOf binds `slateFromEspn: (date, espn, now, bankroll) => slateFromEspnOf(cfg, date, espn, now, bankroll)` with no opts; src/lib/cfb/slate-server.ts:48 `ODDS_TTL = 240`, :111 `opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } }`; only display routes pass fresh (app/api/cfb/route.ts:61, app/api/nfl/route.ts:66). MLB: app/api/scheduler/route.ts:225-294 - on a found day with a stored board and no lock, hold only if ageMin > 30 (:235-236), else buildLockEntry({ data: board.data, ..., trigger: "self-check-backfill" }) (:264) and writeLock (:265) with engine fetch disabled (:249). Board-only passes persist boards (generate/route.ts:518-548 runs before the boardOnly return at :577). The normal generate path reports `lockMaxAgeMin: "n/a - prices fresh by construction"`.

**Impact.** Record accuracy: bets recorded at prices that have already moved; with full-Kelly sizing a stale favourable price inflates both the EV gate and the stake. The football staleness may be shorter in production because the routes are force-dynamic (actual Next data-cache behaviour could not be verified offline); the 30-minute MLB backfill window is unconditional.

**Proposed fix.** Pass `{ fresh: true }` through feedsOf for every lock/found pull. For the backfill, accept only a board <= ~2 minutes old or drop any ticket whose game starts within the board's age, otherwise wait for the next priced pass.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Both halves confirmed in code; I could not refute it. One correction makes the football half worse than reported, not milder.

FOOTBALL (confirmed)
- src/lib/server/football-lock.ts:64 types `LockFeeds.slateFromEspn` with four arguments and no opts; :72 binds `slateFromEspnOf(cfg, date, espn, now, bankroll)` with no opts.
- Every lock/found/top-up pull is opts-less: football-lock.ts:499 (top-up), :710 (found pass, commented "the one paid call on this path"), :810; app/api/cfb/lock/route.ts:425; app/api/nfl/lock/route.ts:242.
- src/lib/cfb/slate-server.ts:48 `ODDS_TTL = 240`; :111 uses `{ cache: "no-store" }` only when `opts?.fresh`, else `{ next: { revalidate: ODDS_TTL } }`.
- Only the display routes pass `fresh`: app/api/cfb/route.ts:61 and app/api/nfl/route.ts:66, and only on a sync-authed `?refresh=1`.
- No guard elsewhere: the Odds API `last_update` is parsed at src/lib/cfb/names.ts:62 but nothing in src/lib/cfb, src/lib/football or football-lock.ts reads it to reject an old quote.

CORRECTION to the auditor's caveat ("may be shorter in production because the routes are force-dynamic")
- Wrong direction. The installed Next is 15.5.20 (node_modules/next/package.json).
- node_modules/next/dist/server/lib/patch-fetch.js:341 — `noFetchConfigAndForceDynamic` requires `!currentFetchRevalidate`, so force-dynamic does not disable caching for a fetch with an explicit `next.revalidate`. The 240 s cache is in force on the lock routes (cfb/lock/route.ts:223 and nfl/lock/route.ts:74 are force-dynamic, with no fetchCache override).
- patch-fetch.js:697-720 — a stale entry on a normal request is returned as the response while the refetch runs in the background. So 240 s is not an upper bound: a lock poke arriving after the TTL gets the previous pull's prices. With ~15-minute pokes (cfb/lock/route.ts:107) that can be about 15 minutes old or more, unless a non-fresh display pull of the same URL warmed the cache in between.
- Production (Vercel data cache) behaviour was not verified offline; this is from the installed Next source only.

MLB (confirmed)
- app/api/scheduler/route.ts:173 reads the stored board; :234-236 holds only when `ageMin > 30` or the age is unknown.
- Otherwise :248-249 builds an engine whose fetch rejects ("backfill lock never fetches"), :264 calls `buildLockEntry({ data: board.data, …, trigger: "self-check-backfill" })`, :265 `writeLock(entry)`, and the next line sends bet alerts.
- Board-only passes do persist the board first: app/api/generate/route.ts:518-548 runs before the `boardOnly` branch at :577, so a stored board with no lock is a reachable state.
- generate/route.ts:665 prints `lockMaxAgeMin: "n/a — prices fresh by construction"`, which is not true of the backfill path.
- Mitigating context: the 30-minute tolerance is a documented, deliberate rule (scheduler/route.ts:228-231), and the path only fires when a board exists with no lock. It is a design tolerance, not an accident, but the stale-price effect is as described.

SEVERITY
- Medium stands. It is paper only, so no money is lost, but the paper record exists for calibration and it sizes stakes by Kelly off these prices.
- I did not verify the "full-Kelly" wording in the impact statement; the staleness itself is established regardless.

FIX CORRECTION
- Changing `feedsOf` alone only covers the NFL shell calls. The CFB lock route builds its own `FEEDS` from the CFB-bound imports (app/api/cfb/lock/route.ts:244), and both lock routes also call the slate function directly (cfb/lock/route.ts:425, nfl/lock/route.ts:242).
- The `LockFeeds.slateFromEspn` type (football-lock.ts:64) needs an opts parameter, or the wrappers need to hard-code `{ fresh: true }`, at all of those sites.
- Cost should be roughly neutral: a poke past the TTL already triggers a billed background refetch; `fresh` just makes the lock use that pull's answer instead of the previous one.

<a id="f-e2-1"></a>
#### E2-1 — Football lock / found / top-up passes price paper bets off a stale-while-revalidate game-lines cache (and the 2 h props re-pull re-stamps an old body as fresh)

- Severity: medium. Area: API credits and efficiency. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/slate-server.ts:111 fetches the game lines with `opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } }` (ODDS_TTL = 240, :48). src/lib/server/football-lock.ts:69-75 `feedsOf` binds `slateFromEspn` with NO opts, so every server money path uses the cached branch: found pass (football-lock.ts:710 'the one paid call on this path'), first found lock (:810), top-up, and the CFB legacy lock (app/api/cfb/lock/route.ts:425). Pokes are 15 min apart (grading-progress.ts:192 FOUND_FOOTBALL_SLOTS_PT), far past the 240 s TTL. The repo itself states the cache semantics: src/lib/server/football-props.ts:72-76 'Next's data cache is stale-while-revalidate — a stale entry answers with the OLD body and refreshes in the background', and :465-468 fixed it with `cache: "no-store"` ONLY for czMissing/live prop re-pulls. The same file still sends an 'expired' 2 h prop re-pull with `next: { revalidate: pullSec }` (:469-472) and then counts it as fetched and re-stamps it priced now (:488-489, :520-526). package.json:16 `next ^15`. `last_update` is parsed into a type only (src/lib/cfb/names.ts:22,62); no price-age guard exists in the lock path. Not observed on production (no network allowed) - this rests on Next's documented SWR behaviour and the repo's own statement of it.

**Impact.** Each found/lock pass is answered with the body fetched by the PREVIOUS caller (>= 15 min old; the first 08:00 PT poke can receive the last body of the previous evening unless a page load refreshed it), while the fresh pull it triggers is billed (6 credits) and only consumed one poke later. Paper tickets are therefore stamped with DraftKings prices that may no longer be posted, which biases the paper record and any CLV/edge read off it. Upcoming-game football props are likewise one full 2 h cycle old but shown and stored as freshly priced.

**Proposed fix.** Pass `{ fresh: true }` from `feedsOf` (and the CFB route's FEEDS) so every lock/found/top-up pull is `cache: "no-store"`; make the props 'expired' branch `no-store` too (Redis + pricedAt already bound the cadence, as the comment at football-props.ts:467-468 says). Add a guard that refuses to lock a quote whose bookmaker `last_update` is older than N minutes, and stamp the quote's own `last_update` on the ticket.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code; could not refute. Not observed on production (no network), so real-world staleness depends on Vercel keeping the stale data-cache entry.

What I checked:
- src/lib/cfb/slate-server.ts:48 ODDS_TTL = 240; :111 uses `opts?.fresh ? { cache: "no-store" } : { next: { revalidate: ODDS_TTL } }`; :155-156 slateFromEspnOf forwards opts to oddsPayloadOf.
- src/lib/server/football-lock.ts:69-75 feedsOf binds slateFromEspnOf with no opts. Callers with no opts: top-up :499, found pass :710, first found lock :810, app/api/cfb/lock/route.ts:244 (FEEDS) and :425, app/api/nfl/lock/route.ts:93 and :242 (the NFL legacy lock call, not cited by the finding).
- The lock routes are `dynamic = "force-dynamic"` (app/api/cfb/lock/route.ts:223, app/api/nfl/lock/route.ts:74). I checked whether that forces no-store. It does not: installed Next is 15.5.20, and node_modules/next/dist/server/lib/patch-fetch.js:341 applies the force-dynamic opt-out only when the fetch has no explicit revalidate. Here it has one, so the data cache is used.
- Stale-while-revalidate is real in the installed Next: patch-fetch.js:697-720 returns the cached body for a stale entry on a non-revalidate request and starts the refetch in the background.
- No guard exists: grep finds no revalidate/no-store handling in football-lock.ts or either lock route; `last_update` on the football side is only typed and parsed (src/lib/cfb/names.ts:22,62).
- The authors assumed the opposite: app/api/cfb/lock/route.ts:107-108 says the cache revalidates every 240 s "so EVERY poke was a fresh billed call". The intent was fresh prices; the code serves the previous body.
- Props half confirmed: src/lib/server/football-props.ts:469-472 sends no-store only for refresh / czMissing / live-already-stored; an "expired" re-pull (:299) rides `next: { revalidate: pullSec }`, so it gets the roughly 2 h old entry. It is then counted as fetched (:488-489) and stamped nowIso (:423-427, :520-526).

Corrections to the evidence:
- FOUND_FOOTBALL_SLOTS_PT is at src/lib/server/grading-progress.ts:192 (the finding dropped `server/`); it is everyMinutes(8, 19, 15).
- "Previous caller" is not only the previous poke. The board routes hit the same URL and cache key (app/api/cfb/route.ts:61, app/api/nfl/route.ts:66, football-props.ts:192 with `fresh: refresh`), so a non-refresh page view also warms it. A Refresh Board tap (no-store) does not write the cache.
- Staleness can be far more than 15 min. Found passes that skip before the paid call (football-lock.ts:696-702) never touch the cache, so the next pricing pass can get a body hours old, or overnight on the first pass of a day.
- The "6 credits billed and consumed one poke later" point is not extra spend; it is the same one pull per stale hit, used late.

Severity lowered from high to medium: this is paper trading only, the markets are pregame football lines, and the common case is a price about 15 min old. It is still systematic — every football found/top-up/lock ticket is stamped with a price that was not fetched at lock time — and the overnight and after-skip cases can be materially wrong.

Fix: sound. Passing `{ fresh: true }` from feedsOf, the CFB FEEDS object and nfl/lock/route.ts:242 costs about the same credits as today, since each stale hit already triggers a billed background pull. Making the props "expired" branch no-store is consistent with the file's own comment at football-props.ts:467-468. The `last_update` age guard needs the field carried past names.ts first; today it is parsed but not used.

<a id="f-a-4"></a>
#### A-4 — Calibration shrink is fitted on probabilities that already contain the previous shrink, then applied as an absolute factor; its quality check is in-sample

- Severity: medium. Area: data integrity. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** The logged probability is already blended with the armed weights: legacy/index.html:1743-1752 `shWm(base,mkt)=base*calW[mkt]*calG` (floor 0.05), used at :2184 (ML), :2213 (RL), :2453 (props); src/lib/engine-client.ts:374,377 and app/api/generate/route.ts:399-424 arm `calW: armed.mults, calG: armed.globalS`. src/lib/pred-serialize.ts:425-448 `gradedFromBlob` feeds the calibrator `p: r.p, pMkt: r.pMkt` - the blended p - and never `r.pModel` or `r.w` (grep `pModel|\.w\b` in src/engine2/calibration.ts: no matches). src/engine2/calibration.ts:553-603 `fitGlobalShrink` searches s from 1 down to SHRINK_FLOOR 0.15 for a pooled slope in [0.85,1.15] on those p values and reports `slopeAfter` on the same picks; `slopeMults` sets multiplier = slope. src/engine2/calibration.ts:627-639 `effectiveCalibration` returns `globalS: summary?.globalShrink?.s` as the absolute multiplier; app/api/calibrate/route.ts:423,448 store it.

**Impact.** Accuracy of every MLB probability: the fitted s is relative to a history generated under a mix of earlier s values, but is applied as if relative to the raw model. Once a shrink is armed the shrunk history looks calibrated, the next fit returns s near 1, the shrink is released, and miscalibration returns (oscillation / systematic under-shrink). The in-sample `slopeAfter` overstates how well the correction works. This directly moves EV and Kelly stakes.

**Proposed fix.** Fit on the raw statement: reconstruct p_raw = pMkt + SH_W_base*(pModel-pMkt) from the stored pModel/pMkt (or store the armed calG and calW on each PredRecord and divide them out), then fit s and the per-market slopes on p_raw. Validate walk-forward (fit on dates < D, score on D) and report the out-of-sample slope, not the fitted one.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Mechanism CONFIRMED in code; severity downgraded from high to medium because the loop is latent, not running.

Checked and confirmed:
- legacy/index.html:1743-1754 shWm = base*calW[mkt]*calG, floor 0.05; used at :2184 (ML), :2213 (RL), :2453 (props). The logged prob is the blended one (e.g. :2491 `p:wPr*pO+(1-wPr)*fair`).
- src/lib/pred-serialize.ts:246-249 stores p (blended), pModel, pMkt, w; gradedFromBlob (:425-448) passes only `p: r.p, pMkt: r.pMkt` to the fits. grep for pModel/wBlend/un-shrink in src/engine2/calibration.ts and app/api/calibrate/route.ts: no matches.
- src/engine2/calibration.ts:553-589: shrunkP replays p at s around pMkt, so the fitted s is relative to whatever weight history carried; fitGlobalShrink returns slopeAfter from the same picks. :597-604 slopeMults sets mult = slope (same issue, also absolute). :626-639 effectiveCalibration hands `summary.globalShrink.s` straight to calG; app/api/generate/route.ts:382,423-424 and src/lib/engine-client.ts:374,377 arm it. app/api/calibrate/route.ts:423,448 store it. Auto defaults to "on" (calibrate/route.ts:526, calibration/route.ts:24).
- No guard composes the new s with the previously armed one. Contrast: the weekly state machine (calibration.ts:690-718) IS relative (`cur*(1-STEP)`), so only the nightly slope fit and global s have the defect.

Why not high:
1. The full fit is not scheduled. vercel.json crons hit only /api/scheduler and /api/nfl/lock; the scheduler forwards only `/api/calibrate?grade=only` (app/api/scheduler/route.ts:416-418), and summary/weights writes sit below the gradeOnly return (calibrate/route.ts:137-147, 401). The summary the engine reads is frozen unless someone manually calls the full route, so no feedback loop is currently iterating.
2. The global shrink has never fired in any documented reading: s=1 at n=70 (docs/collection-period.md:2596), s=1 slope 1.05 n=1487 (:795), s=1 slopeBefore 1.075 n=1908 (docs/session-handoff.md:2424, 3830). With s=1 history, the fit is relative to the raw model and correct. Per-market mults have moved (pitcher_outs 0.1429, session-handoff.md:2418-2419), so the calW side is the part with shrunk history today.
3. Paper trading only.

Corrections to impact: "shrink is released" is the extreme case. With a 45-date mixed window (SUMMARY_DAYS, calibrate/route.ts:73) and the [0.85,1.15] band, the more accurate statement is damped convergence to an under-shrunk fixed point (effective weight roughly sqrt(beta*w) instead of beta), plus on/off flapping for slopeMults since a key vanishes once its slope CI touches 1 (calibration.ts:600). The in-sample complaint is true but minor: one parameter on an 18-step grid over >=150 legs has little optimism; the bigger weakness is that the pooled slope is dominated by pMkt spread (the code's own note at calibration.ts:401-412).

Corrections to fix: reconstruction from stored fields is feasible (pModel and w are on PredRecord), but (a) stored `w` is wPr, not the under-direction wDn actually used when calW["mkt|u"] applies (legacy/index.html:2459-2462 vs :2499), so dividing out stored w is wrong for those rows - rebuild from pModel/pMkt with the base SH_W instead; (b) one-sided markets anchor on price/1.06 (:2491), fine as long as pMkt logged is that anchor; (c) pModel is null on older rows (pred-serialize.ts:247) and those must be excluded, not defaulted. Must be fixed before the full fit is ever put back on a schedule.

<a id="f-b3-2"></a>
#### B3-2 — No walk-forward or out-of-sample backtest exists; blend weights are unfitted constants and the 'backtest search' is in-sample

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** PARLAY_LAB_QUANT_ENGINE.md:146 'the model must beat de-vigged consensus on held-out data or it earns w = 0'; :148 'Walk-forward evaluation: train on past, predict forward, roll. No random shuffles, ever.'; :202 unchecked '- [ ] Walk-forward backtest report runs on >=1 season with zero-lookahead verification'; :56 lists a /backtest module that does not exist. legacy/index.html:1735-1737: 'w values are the doc's recommended ranges — we can't fit them out-of-sample without a backtest pipeline, so they stay conservative and configurable here.' app/api/calibrate/route.ts:415-423 runs computeCalibration, fitReliability, fitByEv and fitGlobalShrink on the same `graded` array with no holdout; src/engine2/calibration.ts:572-589 fitGlobalShrink is labelled a backtest search but scores the same rows it is fitted on. The only held-out evaluation in the repo is tools/first-sunday-six-history.py:80-84 (an NFL clock model, unrelated to the pick model). tools/self_consistency.py, selection_effect.py, range_compression.py, hrr_pa_audit.py use no outcomes; tools/recency_weights.py is a single in-sample regression over 2026-07-11..07-26.

**Impact.** Nothing in the system can tell whether any model input adds information beyond the market price, so losing weights persist indefinitely (see the critical finding). Every calibration number reported to the owner is in-sample and optimistic.

**Proposed fix.** Build tools/walkforward.py (or /api/backtest) over the prediction store: for each date D, fit per-market w on dates < D by regressing (y - pMkt) on (pModel - pMkt) through the origin, predict D, accumulate log loss and Brier for model-blend vs pMkt vs DK no-vig. Report per market with date-clustered standard errors. Gate: a market's w stays 0 unless out-of-sample log loss beats the market by more than 2 clustered se.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Core claim confirmed, but the impact is overstated, so I rate it medium rather than high.

CONFIRMED by opening the files:
- PARLAY_LAB_QUANT_ENGINE.md:148 (walk-forward rule), :202 (unchecked walk-forward checkbox), :56 (/backtest module listed). There is no backtest directory, no app/api/backtest and no tools/walkforward* (app/api and tools listings checked).
- legacy/index.html:1735-1738: the comment says the weights cannot be fitted out-of-sample without a backtest pipeline, then `var SH_W={props:0.35,ml:0.15,rl:0.15}`. ENGINE2.md:86-87 says the weight "gets FIT from tracked results once the harness exists".
- app/api/calibrate/route.ts:415-423: computeCalibration, fitReliability, fitByEv and fitGlobalShrink all run on the same `graded` array with no train/test split.
- src/engine2/calibration.ts:566-589: fitGlobalShrink picks s by replaying the same rows it then reports slopeAfter on, so that number is in-sample.
- A repo-wide grep for walk-forward / held-out / holdout / out-of-sample finds a real held-out evaluation only in tools/first-sunday-six-history.py:78-84 (the NFL clock model).
- tools/recency_weights.py:19,175 is one regression over 2026-07-11..07-26 (leak-free predictors, but no forward test). self_consistency.py, selection_effect.py, range_compression.py and hrr_pa_audit.py show no outcome use in a grep; I did not read them in full.

CORRECTIONS to the evidence:
- The "must beat de-vigged consensus on held-out data or it earns w = 0" quote is at PARLAY_LAB_QUANT_ENGINE.md:149, not :146 (146 is blank).
- tools/icc.py also uses the graded record (clustering of calibration residuals); it is not a backtest.

IMPACT OVERSTATED in three places:
1. "Nothing in the system can tell whether the model adds information beyond the market" is false at market level. src/engine2/calibration.ts:279-287 computes mktCmp, model vs consensus Brier per market on prediction-store records logged before outcomes. The base weights were never fitted on those outcomes, so this is a prospective comparison of the shipped model. It is surfaced in CalibrationPanel.tsx:155 and was used in docs/pitcher-outs-audit.md:222 (0.285 vs 0.215). What is missing is per-input attribution, log loss, clustered standard errors and any gate that acts on it.
2. "Losing weights persist indefinitely" is only partly true. Effective weight is SH_W × calW × calG (legacy/index.html:1743-1754), with shrink-only multipliers fitted on past graded legs and applied to later boards (calibration.ts:596-601, 683, 706; ENGINE2.md:409-418). But the floor is 5% absolute (legacy/index.html:1753, calibration.ts:683), so a weight can never reach the spec's w = 0, and nothing scores whether the shrink helped on later data.
3. "Every calibration number is in-sample and optimistic" is too broad. Predicted-vs-actual and Brier on pre-logged predictions are prospective; only the fitted quantities (slopeAfter, the reliability-slope multipliers) are in-sample. The UI already says an improvement "requires validation on later data" (CalibrationPanel.tsx:247-248).

FIX: the proposed walk-forward tool is sound and the prediction store already logs p and pMkt per leg. Two additions: let the gate actually set w = 0 (today's floor at legacy/index.html:1753 prevents it), and use date- or game-clustered standard errors, since calibration.ts:546-548 records that leg independence is an unresolved assumption. Paper trading only, so no money is at risk; the gap is methodological.

<a id="f-b3-3"></a>
#### B3-3 — Calibration regresses outcomes on the already-calibrated blended probability and uses the slope as the multiplier, producing a feedback loop and unstable weights

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/pred-serialize.ts:246-249 stores p (post-calibration blend), pModel, pMkt and w; gradedFromBlob at :425-448 passes only market, p, edge, lu, res, pMkt, ev, ln, side, susp, pop and drops pModel and w. src/engine2/calibration.ts:385-399 fitReliability is OLS of outcome on stated p; :596-604 slopeMults sets out[m] = max(MULT_FLOOR, round(max(0, slope), 3)) when n >= 100 and slope + 1.96*se < 1 ('the multiplier IS the slope'). The correct recalibration of model weight is the slope of (y - pMkt) on (pModel - pMkt); a slope of y on blended p is dominated by between-line variance in pMkt. On-disk effect, command: python3 -I /private/tmp/claude-501/audit-out/areaB/wblend_scan.py (wBlend per market from data.categories in pl-history/data/boards/*.latest.json.gz): H+R+RBI 0.35 -> 0.315 (08-23) -> 0.284 (08-30) -> 0.139 (09-06) -> 0.168 (09-14) -> 0.253 (09-20) -> 0.227 (09-27) -> 0.205 (10-04..10-17). The slope multiplier fired on 09-06 and 09-14 and stopped on 09-20, so model weight rose 82% in two weeks with model inputs frozen (echo ctxSha/priorsSha unchanged 08-06..10-17 per audit-out/areaB/echo_keys.py).

**Impact.** This week's fit input already contains last week's multiplier, so the adjuster chases its own output. Weights swing on a significance flip, not on evidence; stakes and EV on H+R+RBI moved accordingly.

**Proposed fix.** Carry pModel and w through gradedFromBlob (pred-serialize.ts:425-448) and refit on the raw deviation: beta_m = sum((y - pMkt)(pModel - pMkt)) / sum((pModel - pMkt)^2) per market, with date-clustered se, shrunk toward 0 (e.g. beta * n/(n+k)). Set the armed weight to that beta directly, replacing slopeMults and the weekly multiplier chain.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code and on disk; I could not refute it. Severity lowered from high to medium because the channel is shrink-only, floored, and paper-only.

**What I checked**
- **Stored fields:** `src/lib/pred-serialize.ts:246-249` stores `p: Number(r.prob)`, `pModel`, `pMkt`, `w`. `gradedFromBlob` (`:425-448`) projects only market, p, edge, lu, res, pMkt, ev, ln, side, susp, pop, so `pModel` and `w` are dropped.
- **p is post-calibration:** in `legacy/index.html:1743-1753`, `shWm` returns `max(0.05, base * calW[mkt] * calG)`. At `:2459-2464`, `pAdj = wDn*pO + (1-wDn)*nv`, and that becomes the row's prob with `wBlend: wPr` (`:2499`).
- **The fit:** `fitReliability` (`src/engine2/calibration.ts:385-399`) is OLS of the 0/1 outcome on `x.p/100`. `slopeMults` (`:596-604`) is as quoted. `effectiveCalibration` (`:626-639`) takes the min of the weekly mult and the slope mult.
- **No guard against feedback:** `app/api/calibrate/route.ts:415-421` fits directly on stated p over the 45-day window (`SUMMARY_DAYS`, `:73`). Nothing un-applies the multiplier in force when a row was written.
- **On-disk series:** I re-ran `wblend_scan.py` and the H+R+RBI values reproduce exactly: 0.35, 0.315, 0.284, 0.139 (09-06), 0.168 (09-14), 0.253 (09-20), 0.227, 0.205.
- **Decomposition:** hits stays at 0.35 throughout, so `calG` was 1. The weekly 0.9 chain alone would give 0.255 on 09-06 and 0.230 on 09-14 (strikeouts shows exactly those). So the slope mult was about 0.40 and 0.48 on those dates, and 0.253 on 09-20 is 0.2296 × 1.1, meaning the slope mult switched off and the weekly walk relaxed.
- **Market variance dominates:** my own check (`/private/tmp/claude-501/audit-out/verify_b3_3/var_check.py`) on stored H+R+RBI board rows (n=1979) gives sd(implied) 5.53 against sd(prob − implied) 2.16, so the market term is roughly 85% of the variance in stated p. The multiplier `b·w` equals the linear recalibration `a + b·p` only if pMkt were constant, so the comment "theoretically the exact recalibration" (`calibration.ts:593-594`) is wrong. Caveat: these are top-50 board rows, not the full graded population.

**Corrections to the evidence and impact**
- **Cadence is weekly, not nightly.** Summary and weights are only written on non-`grade=only` runs (`app/api/calibrate/route.ts:138-147`, `:401`), which is why wBlend is constant within each week. The "nightly" comments in `calibration.ts` are stale.
- **The slope mult is not chained with itself.** It is recomputed each fit and min'ed with the weekly mult. The failure is an on/off oscillation: a shrunk week pushes the slope toward 1, the significance gate flips, and the multiplier vanishes. "Weekly multiplier chain" properly describes only `applyWeeklyAdjustment` (`:689-721`), which damps the rebound — weight returned to 0.253, not 0.35.
- **Cause of the 09-20 flip is inferred, not proven.** The 45-day window also began sliding around 09-08 (`route.ts:425-428`), and the stored summary is not on disk to confirm which effect drove it.
- **Bounded harm.** Weight never exceeds the shipped 0.35 and never drops below 0.05. Only H+R+RBI shows the slope mult firing in this history; pitcher_outs jumping 0.05 to 0.35 on 08-16 looks like the same on/off cliff, but I could not determine its cause.

**Fix caveats**
- The proposed through-origin beta is sound, and `pModel` and `w` are already stored in the day blobs, so a refit can be retroactive.
- Cap beta at the base weight (0.35 props, 0.15 ML/RL) to keep the shrink-only invariant.
- Handle `pMkt` defaulting to 0 (`pred-serialize.ts:248`) and one-sided HR rows, where the anchor is a price/1.06 guess.
- Rows record the chosen side, so `pModel − pMkt` is sign-selected.

<a id="f-b3-4"></a>
#### B3-4 — Weekly adjuster restores model weight whenever a test is merely non-significant; pitcher outs went back to full weight

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/engine2/calibration.ts:706-707: `if (pm.significant && pm.direction === "hot") after = Math.max(MULT_FLOOR, cur * (1 - STEP)); else if (!pm.significant && cur < 1) after = Math.min(1, cur * (1 + STEP));`. Significance is 'predicted outside Wilson 95% CI' (:133) with SIG_MIN_N = 50 (:70). wblend_scan.py output: outs 0.05 (08-06..08-15) -> 0.35 (08-16..09-05) -> 0.315 (09-06) -> 0.347 (09-14) -> 0.35 (09-20 onward). Outs is the worst-evidenced market: baseline.md raw model 71.42 vs close fair 49.10; docs/session-handoff.md:1955-1961 outs unders 20-28, 41.7% actual vs 49.6% model. Hits, ML and RL wBlend never moved (0.35 / 0.15 / 0.15 on every board) although the close gives the model about 0.02-0.04 weight in hits (E1 slope +0.021; DK slope +0.044).

**Impact.** Absence of proof is treated as proof of calibration. The adjuster cannot converge to a low weight: any week the test lacks power, 10% of weight comes back. Outs returned to 0.35 and kept producing the largest model-vs-market gaps on the board.

**Proposed fix.** Remove the recovery branch. Weight should only rise when an out-of-sample estimate of beta (previous finding) is above the current weight by more than 2 se. Until that exists, pin outs at 0.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in substance, but the headline outs evidence is misattributed and the severity is overstated.

WHAT I CHECKED AND CONFIRMED
- src/engine2/calibration.ts:706-707 is exactly as quoted. Recovery fires on `!pm.significant && cur < 1`, +10% relative (STEP at :682), capped at 1.
- Significance is "mean predicted outside Wilson 95% CI" with SIG_MIN_N = 50 (:70, perMarket at :276-277). `direction` is forced to "ok" whenever not significant (:295).
- The tested `p` is the BLENDED, post-shrink probability (src/lib/pred-serialize.ts:17 "engine true % (blended)", :246). So the loop measures its own corrected output: once a shrink makes the output look calibrated, the recovery branch hands weight back. This is a stronger form of the finding than "lack of power".
- I re-ran /private/tmp/claude-501/audit-out/areaB/wblend_scan.py against pl-history/data/boards. The trajectory is as stated: outs 0.05 (08-06..08-15), 0.35 (08-16..09-05), 0.315 (09-06..09-12), 0.347 (09-14..09-19), 0.35 (09-20 onward). Hits 0.35 and ML/RL 0.15 on every board.
- The recovery branch demonstrably fired on outs: 0.315 -> 0.347 -> 0.35 is exactly 0.35 x 0.9 x 1.1, then capped. It also fired on total bases (0.315 on 08-09, 0.347 on 08-16, 0.35 on 08-23).
- audit-out/baseline.md:430 (pitcher_outs 71.42 raw vs 49.10) and docs/session-handoff.md:1957-1961 (outs unders 20-28, 41.7% vs 49.6%) are real.

CORRECTIONS TO THE EVIDENCE
1. The big restoration (0.05 -> 0.35 on 08-16) was NOT the weekly adjuster. A 10% step cannot move 0.05 to 0.35 in one cycle. The 0.05 was mult 0.1429 = MULT_FLOOR; docs/session-handoff.md:3829-3831 shows `mults: {"pitcher_outs": 0.1428...}` with `log: 0 entries`, i.e. the weekly adjuster had never acted. It came from the nightly reliability-slope channel, slopeMults (calibration.ts:596-601), merged by min() in effectiveCalibration (:636-637). That channel is memoryless: at :600 `if (f.slope + 1.96 * f.se >= 1) continue;` drops the multiplier entirely the moment the slope is not significantly below 1, so weight snaps from floor to full in one fit. Same logical flaw, different function, and worse (no 10% rate limit). The weekly adjuster's own contribution to outs was only 0.315 -> 0.35 (0.035 of absolute weight).
2. The finding omits the action gate: :703 requires tier ADJUST (n >= 150, :72-77), not just SIG_MIN_N = 50. So recovery cannot fire on tiny samples. Power is still limited (Wilson half-width about +/-8 points at n=150) and the training set is a 45-date rolling window (app/api/calibrate/route.ts:282-288), so n does not keep growing.
3. "Cannot converge to a low weight" is overstated. Where the test stayed significant the walk went down for weeks: strikeouts 0.35 -> 0.167 and home runs 0.315 -> 0.151 by early October (with a single uptick, 0.151 -> 0.166 on 10-04). The accurate statement is that it cannot HOLD a low weight once the blended output looks calibrated.
4. Recovery is intended, documented design (:685-689 "well-calibrated markets drift 10% back toward 1.0") and pinned by tests/calibration.test.ts:102-108. It is a design flaw, not an accident; the fix has to change that test.

MITIGATIONS / SEVERITY
- Shrink-only: weight never exceeds the shipped default 0.35 (legacy/index.html:1743-1752). The underlying problem that 0.35 is too high is the separate beta finding.
- Pitcher outs have been off the found card since 2026-10-06 (src/lib/found-mode.ts:146-150), and outs-under tickets were pruned from the paper pool from 08-16 (session-handoff.md:1962-1964). Board rows still carry the 0.35 weight but no bet seats.
- Paper trading only. Hence medium, not high.

CORRECTION TO THE FIX
Removing only the :707 recovery branch would not have prevented the outs jump. The fix must also make slopeMults sticky (do not drop a multiplier on non-significance at :600), or replace both channels with the out-of-sample beta estimate. Pinning outs at 0 also needs care: the engine floors any shrunk prop weight at 0.05 absolute (shWm, legacy/index.html:1752, and MULT_FLOOR at calibration.ts:683), so "0" requires a floor change or keeping outs off the card as now. I could not determine the per-week n or significance values behind each step; those live in the Redis weights log, which is not on disk.

<a id="f-b3-5"></a>
#### B3-5 — Calibration is fitted on the top-50-by-probability board rows with all populations pooled, not on the bets actually taken

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2517-2518: rows=cats[k].filter(pred).slice().sort(function(a,b){return b.p-a.p;}); out[k]=rows.slice(0,50). src/lib/pred-serialize.ts:222-262 logs only those category rows (skips 'all' and live rows). pred-serialize.ts:47-51 says of the population label 'The fits themselves ignore it'; gradedFromBlob (:425-448) trains selected, unselected, shadow, suspended (susp) and stale rows together. The code admits the mismatch at src/engine2/calibration.ts:404-412: 'The fit population is the WHOLE board (~203 rows/day), but the model is USED at the tail ... H+R+RBI hit 46.3% against 59.2% implied on BET legs while the pooled slope over all rows read 1.74'. tools/range_compression.py header: 'the sample is selected ON THE MODEL SIDE'. computeCalibration's model-vs-consensus Brier (calibration.ts:278-287) is computed but nothing acts on it; evGapShrink (:524-539) has no production caller (grep found it only in calibration.ts and tests/calibration.test.ts).

**Impact.** Rows are selected on the model's own preferred side and highest probability, then pooled with rows that were never bettable. The pooled fit reads well calibrated (slope 1.74) while the bet tail loses 12.9 points to implied. The multipliers therefore under-shrink exactly where money is placed.

**Proposed fix.** Log every priced line and both sides (not top 50 by p) to the prediction store, tag the bet population, and fit weights on rows with ev above the lock threshold (pop = selected plus the counterfactual shadow at the same threshold). Wire fitByEv/evGapShrink output into effectiveCalibration instead of leaving it as a diagnostic.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but the severity is overstated: this is a documented, deliberately deferred design state, not an unknown defect. I did not re-derive the 46.3% / 59.2% / 1.74 figures from pl-history; they are quoted from code comments dated 2026-07-26.

**Evidence that holds**
- **Top-50 by probability:** legacy/index.html:2517-2518 sorts by `b.p-a.p` and slices to 50 per market. The engine's own comment at legacy/index.html:2583-2587 calls `categories` the selection pool: top 50 per market by win probability, one side per line.
- **Model-favoured side only:** legacy/index.html:2475-2480 picks the side with `sideCh=(pAdj>=nv)?"O":"U"`.
- **What is logged:** src/lib/pred-serialize.ts:222-262 logs only category rows, skipping `all` and live rows.
- **Pooled fit:** `gradedFromBlob` (src/lib/pred-serialize.ts:425-448) drops only unsettled and superseded rows. It carries `susp` and `pop` through without filtering, and stale rows (:351) are not excluded.
- **No population filter downstream:** app/api/calibrate/route.ts:317-332 and 415-423 feed that pooled set straight into `computeCalibration`, `fitReliability` and `fitGlobalShrink`. src/engine2/calibration.ts has no `susp` or `pop` filter; :23-32 says "no consumer reads them yet, by design".
- **Admitted in code:** the quotes at src/lib/pred-serialize.ts:47-51, src/engine2/calibration.ts:401-412 and tools/range_compression.py:35 are verbatim.
- **Nothing acts on the diagnostics:** `evGapShrink` appears only in calibration.ts, tests and docs. `mktCmp` is display-only (src/components/stats/CalibrationPanel.tsx:188-194). `effectiveCalibration` (calibration.ts:626-639) uses only the weekly multipliers, `slopeMults` and the pooled `globalShrink`.

**Corrections to the finding**
1. `fitByEv` does have a production caller: app/api/calibrate/route.ts:422 and :447 store it as `summary.disagreement`. Nothing reads it to arm the engine, so the substance stands.
2. "Reads well calibrated (slope 1.74)" is loose. A slope of 1.74 reads as under-confident; `slopeMults` (calibration.ts:596-602) shrinks only when the slope is significantly below 1, so no shrink fires.
3. Bets are drawn from this same logged pool, so the bet rows are in the store and tagged `pop=selected` at grade time (app/api/calibrate/route.ts:174-181). The gap is that the fit ignores the tag, not that bet rows are missing.
4. Leaving the EV shrink unwired is a recorded decision: docs/collection-period.md:2957-2961 settles "Phase 3 applies no shrink" (WITHIN = 1.00, CI [0.90, 1.17]), to be revisited after 20 or more boards.

**Additional impact the finding missed**
`mktN` is the pooled reliability count (calibration.ts:633). It lifts the small-sample consensus gate at `consMinN` = 100 (legacy/index.html:3068) on rows that were mostly never bet.

**Why medium, not high**
- Paper trading only.
- Point guards already cover the worst measured cases: H+R+RBI alternates and pitcher outs are suspended (legacy/index.html:1087, 2524-2526), and the `no_ind_consensus`, consensus and settlement-EV floors apply (legacy/index.html:3043-3078).
- All multipliers are shrink-only.

**Fix**
- Fit, or at least gate, on `pop=selected` and the rows above the EV gate. This is the part that matters.
- "Log both sides and every priced line" is the weaker half of the proposal: it mostly adds rows that can never be bet.
- Wiring `evGapShrink` in reverses a recorded owner decision, so it needs the owner's sign-off.

<a id="f-b3-11"></a>
#### B3-11 — All calibration standard errors assume independent legs; the clustering measurement was never completed

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/engine2/calibration.ts:547-549: 'every SE here assumes INDEPENDENT legs ... Not yet measured on real graded data'. docs/singles-vs-parlays.md:392: 'clustering unit still unmeasured (tools/icc.py has not reported)'; docs/session-handoff.md:7821-7824 ICC rows marked STOPPED. docs/hrr-recalibration.md (clustered-errors caveat in the :591-634 amendment): at rho about 0.05 the 12.9-point gap falls from about 2.7 sigma to about 1.1 sigma. Board rows are ladders of the same player and same game (my DK sample of 2,135 rows is the same structure).

**Impact.** Significance flags that move weights (Wilson CI at calibration.ts:133, slope + 1.96*se at :596-604) are overstated by an unknown factor, so the adjuster reacts to noise in both directions.

**Proposed fix.** Compute all standard errors clustered by game date (or game), or bootstrap by date. Run tools/icc.py once against exported day blobs and record rho in the docs.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed; I could not refute it. Medium is defensible but sits at the low end, because the adjuster is shrink-only.

**Evidence checked (all real):**
- `src/engine2/calibration.ts:547-550` carries the "CAVEAT, UNRESOLVED: every SE here assumes INDEPENDENT legs ... Not yet measured on real graded data" comment verbatim.
- `docs/singles-vs-parlays.md:392` says "clustering unit still unmeasured (`tools/icc.py` has not reported)".
- `docs/session-handoff.md:7821-7822` and `:7824` mark the game, player and day ICC rows STOPPED (0 graded rows/day).
- `docs/hrr-recalibration.md:631-634` says at rho about 0.05 the 12.9-point gap falls from about 2.7 sigma to about 1.1 sigma, "Not yet done".
- `tools/icc.py` exists, and its header (lines 1-25) states the same problem and that "rho was never measured".
- I found no doc recording an ICC result.

**The naive SEs do move weights in production:**
- The Wilson interval (`calibration.ts:79-88`) sets `significant` at `:133`, `:277` and `:322`.
- `applyWeeklyAdjustment` (`:691-720`) shrinks a market's multiplier 10% a week when it is ADJUST tier (n >= 150) and `significant` and hot.
- `slopeMults` (`:596-604`) uses the plain OLS SE (`:380`) and sets the multiplier to the slope itself, floored at about 0.143, when slope + 1.96*se < 1 over 100+ legs.
- Both are merged by `effectiveCalibration` (`:626-638`), which is called from `app/api/generate/route.ts:382` and `app/api/calibration/route.ts:27`. The weekly walk runs at `app/api/calibrate/route.ts:529`.
- The gap `sig` flag at `:505` (|gap| >= 2*se) is also naive.
- `fitGlobalShrink` (`:572-589`) has no SE at all; it searches on the point slope once n >= 150.

**Corrections:**
1. "Reacts to noise in both directions" is overstated. The channel is shrink-only (`:686-689`, `:706-707`): multipliers never exceed 1, and a "cold" flag triggers nothing. A false positive pushes the engine toward the market (the conservative side) at 10% a week, or straight to the slope via `slopeMults`. The opposite move is only the drift back toward 1.0 when the flag clears. The real harm is spurious over-shrinking and flapping, plus an overstated verdict on the H+R+RBI gap criterion.
2. The overstatement factor is unknown, not established. The 2.7 to 1.1 sigma figure assumes day-level clustering with m about 100 and rho 0.05. The game-level case in `tools/icc.py:14-16` is much milder (2.66 to 2.33 sigma).
3. This is a known, documented gap rather than a hidden bug. The measurement stalled for lack of graded rows (a 300-row floor, about 70 on hand at the time of the handoff entry).
4. Whether any market currently meets the n >= 150 or n >= 100 thresholds, so that the flags are firing today, could not be determined without the prediction store.
5. The auditor's "DK sample of 2,135 rows" claim was not checked.
6. Minor inconsistency: the code comment at `:543-544` says 3.2 sigma (at n = 150) while the docs say 2.7 sigma.

**Fix:** the proposal is sound. A day-level cluster bootstrap is the conservative choice. `tools/icc.py` needs sync-phrase-gated day blobs exported by the owner, and enforces its own floors of 20 clusters and 300 rows.

<a id="f-b3-12"></a>
#### B3-12 — Football (CFB and NFL) has no calibration, no closing-line record and no fitted weights

- Severity: medium. Area: calibration and backtest. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** docs/progress.md:429 and docs/session-handoff.md:1560-1562: 'Grading football tickets is not learned football weights; current reviewed game weights are configured constants.' app/api/clv/route.ts:81 is MLB only. src/engine2/calibration.ts and app/api/calibrate/route.ts handle MLB markets only (mktN keys in every archived echo: hits, hits_runs_rbis, home_runs, total_bases, ml, outs, strikeouts, rl). audit-out/map-football-model.md:402 (map, not re-verified line by line) reports no fitting code; pl-history holds no football price, close or graded history.

**Impact.** Football carries the larger daily paper allocations yet its probabilities have never been scored against outcomes or against the market. No edge claim for football can be supported or refuted.

**Proposed fix.** Log football board rows to a prediction store with pModel, pMkt (DK/FD no-vig), and result; capture closes; set football model weight to 0 (price-shop only) until a walk-forward test passes.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in substance; severity lowered to medium and two parts of the impact/evidence need correcting.

What I checked (all paths relative to /private/tmp/claude-501/pl-audit unless noted):
- Doc quote is real: docs/progress.md:429 and docs/session-handoff.md:1562 both read "Grading football tickets is not learned football weights; current reviewed game weights are configured constants."
- Football weights are hard-coded constants: src/lib/cfb/rules.ts:70-77 (sigma 16.5, sigmaTotal 18, hfa 2.6, blend {mkt 0.6, spread 0.25, fpi 0.15}, spreadBlend {mkt 0.75, fpi 0.25}, pinnacleWeight 2, settleBook "draftkings"); src/lib/nfl/rules.ts:61-68 (sigma 13.5, hfa 2.0, identical blend/spreadBlend). src/lib/cfb/model.ts:427-450 just applies M.blend / M.spreadBlend. grep for fit/learn/backtest/walk in model.ts finds nothing.
- CLV is MLB only: app/api/clv/route.ts:81 hard-codes ".../v4/sports/baseball_mlb". grep for cfb|nfl|football in src/engine2/calibration.ts, app/api/calibrate/route.ts, app/api/calibration/route.ts, src/lib/server/clv-core.ts, src/lib/clv-report.ts, app/api/clv/route.ts, src/lib/predictions.ts, app/api/predictions/route.ts returned zero hits. The repo's own comments admit it: src/lib/cfb/rules.ts:265 and src/lib/cfb/lock-server.ts:348 say /api/calibrate?grade=only "has no CFB code at all".
- mktN keys: scanned every archived *.best board echo in pl-history/data/boards; keys are all, batter_hits, batter_hits_runs_rbis, batter_home_runs, batter_total_bases, ml, pitcher_outs, pitcher_strikeouts, rl (70 boards each). No football key. (The finding's short names are abbreviations of these; substance matches.)
- pl-history: regex scan of all boards/*.gz, props/*.json and daily odds files for americanfootball / sport keys / "cfb" / "nfl" found nothing (only a hex event-id substring false positive). No football price, close or graded history is archived. Football props boards in Redis are written with an expiry (src/lib/cfb/props-store.ts:251-252, EX boardRetainSec), so board rows are not retained.
- audit-out/map-football-model.md:402 does say no fitting code found; consistent with my own grep.

Corrections:
1. IMPACT "Football carries the larger daily paper allocations" is stale/wrong for the current code. Since found mode (FOUND_SINCE 2026-10-03) every sport runs the same $2,500/day ceiling (src/lib/found-mode.ts:55-57; src/lib/paper-mode.ts:68-70; src/lib/cfb/found.ts:18,175). Before that, MLB was $350 from 2026-09-18 (src/lib/server/lock-card.ts:273), equal to NFL $350 (src/lib/nfl/rules.ts:30) and above CFB $250 (src/lib/cfb/rules.ts ~line 38). Football was larger only in the 2026-09-08 to 09-17 window.
2. "Probabilities have never been scored against outcomes" is slightly overstated. Football tickets ARE graded (src/lib/cfb/grade.ts) and locked tickets carry a model prob (src/lib/cfb/types.ts:224,238); src/components/nfl/NflPaperExperiment.tsx:21 computes a ticket-level Brier for one NFL cohort (paperPolicy 'sunday-full-v1') and line 26 states it "does not automatically retrain NFL probabilities". So there is ticket-level W/L, P/L and one small Brier readout, but no row/leg-level calibration, no model-vs-market (consensus) comparison, no closing-line capture, and nothing feeds back into the weights. "Never scored against the market" stands.

Severity: medium rather than high. It is paper trading only; the football blend is 60% de-vigged market ML + 25% market spread (85% market-derived), so the unvalidated component is the 15% FPI weight plus sigma/hfa; and the gap is openly disclosed in the docs and UI rather than hidden. It is still a real measurement gap: no football edge claim can be supported or refuted from stored data.

Fix note: the proposed fix is reasonable. A cheaper first step exists because locked football tickets already store prob and settle price with grading; what is missing is persisting board rows (pModel, DK/FD no-vig pMkt), a football branch in the CLV route (currently baseball_mlb only), and archiving to the history branch. With the owner limited to DraftKings and FanDuel, the consensus/Pinnacle-weighted median (pinnacleWeight 2, regions us,eu) should be treated as the benchmark only, not as bettable prices.

<a id="f-a-3"></a>
#### A-3 — CLV capture is silently lost for whole games (alternate-market allow-list mismatch) and can read the stale cached price instead of the close

- Severity: medium. Area: data integrity. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** (a) src/lib/server/clv-core.ts:95-107 `marketsFor` appends `${market}_alternate` for every prop market on a ticket. src/lib/server/odds-shape.ts:20-56 lists only batter_hits_alternate, pitcher_strikeouts_alternate and batter_home_runs_alternate, and `shapeAllowed` requires `requested.every((x) => s.markets.has(x))`; app/api/odds/route.ts:36-38 answers 403 "market shape not allowed". So any game holding a Total Bases, H+R+RBI or pitcher-outs leg requests an unlisted `_alternate` market and the whole per-game pull is refused; app/api/clv/route.ts:108-116 treats the null response as "skip this game" with no log line. (b) app/api/clv/route.ts:48-55 `viaProxy` calls `/api/odds?u=...` without `fresh=1` or the pass header; app/api/odds/route.ts:46-54 then serves `next:{revalidate: 240}` (stale-while-revalidate). (c) No football CLV path exists: clv-core.ts and /api/clv are MLB-only.

**Impact.** Accuracy of the one metric that validates the model: closing-line value is missing for every prop leg in any game that also has a TB / H+R+RBI / outs leg (and for those legs themselves), biasing the CLV sample toward hits/Ks/HR. Where a sighting does land it may be the earlier cached body rather than the latest price. Football - the only sport in season now - has no CLV evidence at all, so the +1% EV floor cannot be checked against the close.

**Proposed fix.** In marketsFor only request `_alternate` for markets present in odds-shape.ts (or add the three missing ladders to the allow-list deliberately). Have /api/clv fetch with `no-store` (direct or with fresh=1 + the pass header) and store the book `last_update` with each sighting. Log and count refused/empty pulls. Add a football closing-price sighting using the same DK/FD quotes the lock uses.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Could not refute; all three parts confirmed by reading the code. Downgraded high -> medium because CLV is reporting-only.

(a) CONFIRMED, and wider than reported.
- src/lib/server/clv-core.ts:96-107 adds `${market}_alternate` for every prop leg. lkey is `player|oddsMarketKey|point` (src/lib/sportsbook/mlb.ts:32), so parts[1] is the real Odds API key.
- src/lib/server/odds-shape.ts:20-41 allows only three ladders (batter_hits, pitcher_strikeouts, batter_home_runs); :55 requires every requested market to be in the set.
- app/api/odds/route.ts:36-38 returns 403; app/api/clv/route.ts:48-55 maps any non-ok to null; :108-113 skips the game's prop legs with no log.
- No middleware or other guard exists. tests/clv-core.test.ts:68-71 only covers batter_hits, so the suite cannot catch it.
- Correction 1: batter_rbis and batter_runs_scored legs (odds-shape.ts:21-22) are refused too, not only TB / H+R+RBI / outs.
- Correction 2: from the 2026-08-02 hardening (0cb81fe, allow-list had zero `_alternate` keys) until 9df281e on 2026-09-04, every prop CLV pull would have been refused, since every marketsFor result contains an `_alternate`. The CLV route already used the proxy at 0cb81fe.
- Correction 3: "silently" is slightly overstated. No log line, but `games_pulled` is incremented before the null check (route.ts:109) and the response carries `coverage` (:157), so the gap shows as low coverage. ML/RL legs are unaffected (slate path, route.ts:89-102).

(b) CONFIRMED as a design choice with a real side effect.
- viaProxy sends no `fresh=1` and no pass header (route.ts:50), so odds/route.ts:52-54 uses `next:{revalidate:240}`. The route header (clv/route.ts:28-29) says this is intentional.
- The repo itself documents Next's data cache as stale-while-revalidate (src/lib/server/football-props.ts:72, :466); installed Next is 15.5.20.
- With WINDOW_MS 45 min and RATE_MS 25 min (route.ts:37, :41), a game sighted twice with the same market set would get the first pass's body on the second pass, stamped `at: now`. That defeats the "later sighting overwrites" intent at clv-core.ts:11-12. I inferred this from the code and the repo's own comments; I did not run it.

(c) CONFIRMED. /api/clv is hard-wired to baseball_mlb and `pl:ledger:v1` (route.ts:36, :81). In src/lib/cfb, src/lib/nfl, src/lib/football and app/api/cfb, "clv" appears only in comments about ledger fields. This is a missing feature, not a regression.

Severity reasoning:
- CLV feeds only reports (src/lib/clv-report.ts, ClvPanel, digest). I found no path into selection, staking or grading; the calibration.ts and lock-card.ts mentions are comments.
- Paper trading only, and the affected MLB path is out of season on 2026-11-12.
- Partial mitigation: near-pitch prices for six prop markets are archived separately (app/api/propsnap/route.ts:35-36; pl-history/data/props/ through 2026-10-28), so prop closes could be rebuilt offline. The in-app CLV sample stays biased and incomplete.
- No stored ledger with `clv` entries is on disk, so the size of the bias could not be measured.

Fix as proposed is sound. Whichever way the allow-list goes, add a test that marketsFor output passes shapeAllowed for every market in PROP_MARKETS. Note that requesting more `_alternate` markets increases credits per pull; dropping `_alternate` where the settlement book (DraftKings since INSTRUCTION 67) quotes the standard market avoids that.

<a id="f-b3-6"></a>
#### B3-6 — CLV is not tracked for every pick: MLB only, 45-minute window, no backfill, and locked legs drop the fields needed for fair-value CLV

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/clv/route.ts:81 sport key baseball_mlb only; :37 WINDOW_MS = 45 * 60_000; :41 RATE_MS = 25 * 60_000; :139 write skipped when the blob exceeds MAX_BYTES; docs/clv.md:56-61 'No backfill — ever'. src/lib/clv-report.ts:50-87: fairPts = s.consensusFair*100 - lockedFair where lockedFair = l.imp; :67-69 returns null when imp is missing. src/lib/server/lock-card.ts:176 builds imp on the in-memory leg, but the persisted leg at :729 (core) and :1221 (found) keeps only { lkey, label, prop, cz, gkey? }. So every server-locked leg has fairPts = null and only same-book cents CLV survives. No CLV route exists for CFB or NFL (grep of app/api found only app/api/clv).

**Impact.** The one unbiased, fast-converging measure of edge is missing for football entirely and reduced to a price-only number for MLB. A leg whose close snapshot is missed (cron gap, rate limiter, oversize blob) is lost permanently. Baseline measured same-book price CLV +0.21% vs fair-value CLV -5.00%, so the surviving metric is the flattering one.

**Proposed fix.** Persist imp, est/prob, pModel and w on the stored leg at lock-card.ts:729 and :1221. Add the same close capture to the CFB and NFL props pulls (they already run per event). Record close = last pre-start snapshot from the existing line-history archive as a fallback when the 45-minute window is missed, and report CLV against DK and FD no-vig separately.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real: every cited line checks out. I downgraded it from high to medium because one claim in the evidence and impact is overstated, and because this is a measurement gap on a paper-only system, not a wrong number or a money path.

**Confirmed in code**
- **MLB only:** `app/api/clv/route.ts:81` hard-codes `baseball_mlb`, and `:36` reads only `pl:ledger:v1`, the MLB ledger. Football ledgers live under separate keys (`src/lib/cfb/rules.ts:355`, `pl:cfb:ledger:v1`).
- **No football CLV writer:** `clv` appears in `src/lib/football/store.ts` and `src/lib/cfb/types.ts` only in comments and type text; `app/api/cfb/lock/route.ts` mentions it once in a comment and `app/api/nfl/lock/route.ts` not at all. `app/api/clv` is the only CLV route.
- **Window and rate limit:** `WINDOW_MS = 45 * 60_000` at `route.ts:37`, `RATE_MS = 25 * 60_000` at `:41`.
- **Silent oversize skip:** `route.ts:139` drops the write when the blob exceeds `MAX_BYTES` (900,000, `src/lib/ledger-merge.ts:111`), with no error or log.
- **No backfill:** `docs/clv.md:56-61`, and the same policy in `src/lib/clv-report.ts:18-21`.
- **Persisted legs drop `imp`:** `src/lib/server/lock-card.ts:176` sets `imp` on the in-memory leg, but the stored leg at `:729` and `:1221` keeps only lkey, label, prop, cz and optional gkey. The carry mappers at `:845` and `:1062` do the same.
- **Stats fair column is therefore empty for server locks:** `src/lib/clv-report.ts:66-68` returns `fairPts = null` without `imp`, and `src/components/stats/ClvPanel.tsx:67` is its only consumer.

**Correction to the evidence and impact**
"Only same-book cents CLV survives" is wrong. Two other paths compute a fair-value CLV that needs only the stored `cz` plus the closing `consensusFair`, so they still work for server-locked MLB legs:
- `src/lib/ledger-segments.ts:139-141` computes closing consensus fair minus implied(locked price), shown in `src/components/ledger/ReceiptsPanel.tsx:57-59`.
- `src/components/mlb/ProScoreboard.tsx:113-115` does the same.

This is the same kind of measure as the baseline's "CLV vs closing fair", not the flattering one. What is actually lost for server locks is narrower:
- the fair-vs-fair movement number in the Stats panel;
- the basis-price CLV, because `bs` is also dropped (`ledger-segments.ts:124`, `:144-146`);
- the per-leg `est` (`ledger-segments.ts:126`).

**Other qualifications**
- The −5.00% and +0.21% figures are the audit's own reconstruction over engine board rows with claimed EV > 0 (`audit-out/baseline.md:38-39`, `:334`), not locked legs. `baseline.md:23` says no CLV number is recorded on disk, so the stored-leg shape is confirmed from code only.
- The 45-minute window with 25-minute pacing is deliberate (`route.ts:38-40`): with the 15-minute cron it gives each game a sighting about 30 minutes or less before start. The defect is the lack of any fallback when that run is missed, not the window itself.
- The football gap is the strongest part of the finding: the only CLV job in the repo is MLB-only, so no football bet is ever sighted.

**Fix notes**
- Adding `imp`, `bs` and `est` to the stored leg should be safe for the merge gate: `legsDiffer` compares only the `LEG_IDENTITY` fields and treats a missing field as agreement (`src/lib/ledger-merge.ts:300`, `:330-339`).
- It does grow the ledger blob toward the 900,000-byte limit that `route.ts:139` skips on silently, so that skip should be surfaced at the same time.
- `clv-core.ts` matches MLB-shaped leg keys (`player|market|line`, `ml_`/`rl_`), so football close capture needs its own leg matching and is not a copy-paste.

<a id="f-e2-7"></a>
#### E2-7 — CLV sighting requests an _alternate market the proxy allow-list rejects, so any game with a total-bases, H+R+RBI or outs leg gets no prop closing line at all

- Severity: medium. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/clv-core.ts:96-107 `marketsFor` adds `${market}_alternate` for every prop leg; app/api/clv/route.ts:108 sends that list through `/api/odds` (viaProxy :48-55, returns null on non-2xx). src/lib/server/odds-shape.ts:20-43 PROP_MARKETS lists only three alternates (batter_hits_alternate, pitcher_strikeouts_alternate, batter_home_runs_alternate). Command `node /private/tmp/claude-501/audit-out/areaE/shape-check.mjs`: `clv props batter_total_bases,batter_total_bases_alternate false`, `...batter_hits_runs_rbis..._alternate false`, `...pitcher_outs..._alternate false`, and `clv mixed hits+TB false` (one disallowed key rejects the whole event request).

**Impact.** For every MLB game whose locked legs include total bases, H+R+RBI or pitcher outs, the per-event CLV pull is 403 before reaching the Odds API and `sightProp` never runs for ANY prop leg in that game (including hits / strikeouts / HR legs in the same game). Closing-line value - the main accuracy yardstick for the paper record - is silently missing for those legs. No credits are wasted, the data is simply never bought. (MLB is out of season today; the defect returns with the season.)

**Proposed fix.** In marketsFor add the `_alternate` key only for the three markets that have one in PROP_MARKETS (or share one exported constant between odds-shape.ts and clv-core.ts), and make /api/clv call the Odds API directly with the server key like /api/generate and /api/propsnap do. Log a warning when a CLV pull returns non-2xx instead of swallowing it.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code; could not refute. The finding is understated in scope and slightly overstated in severity.

What I checked
- src/lib/server/clv-core.ts:96-107: `marketsFor` adds `parts[1]` AND `${parts[1]}_alternate` for every 3-part prop lkey, unconditionally.
- app/api/clv/route.ts:105-109: that list goes into one per-event URL sent through `viaProxy` (:48-55), which returns null on any non-2xx and never logs; `sightProp` runs only `if (full)` (:110), so a 403 silently skips every prop leg of that game. `gamesPulled++` still increments, so the response looks like a pull happened.
- app/api/odds/route.ts:36-38: `shapeAllowed` is applied to every caller with no server-internal bypass; 403 "market shape not allowed" before the upstream is touched. No middleware.ts exists.
- src/lib/server/odds-shape.ts:20-43, 50-57: `requested.every(...)` against PROP_MARKETS, which holds only three alternates (hits, strikeouts, home runs). One disallowed key rejects the whole request.
- lkey format verified from stored data: /private/tmp/claude-501/pl-history/data/boards/2026-10-17.best.json.gz has lkeys of the form `player|<odds-api market key>|line` with batter_total_bases (71), batter_hits_runs_rbis (70), batter_rbis (18), batter_runs_scored (18), pitcher_outs (7) alongside hits/HR/Ks.
- Ran my own check (/private/tmp/claude-501/audit-out/areaE/e2-7-verify.mjs) against the real shapeAllowed: market+alternate passes for batter_hits, pitcher_strikeouts, batter_home_runs; FALSE for batter_total_bases, batter_hits_runs_rbis, pitcher_outs, batter_rbis, batter_runs_scored.
- No test covers this: tests/clv-core.test.ts:68-71 only asserts the batter_hits case; no test feeds marketsFor output into shapeAllowed.
- No other writer of entry.clv exists server-side (propsnap/generate do not write it; ledgerSync.ts:284-288 only pokes /api/clv), so there is no fallback closing-line source for these legs.

Corrections to the evidence/impact
1. Scope is wider than stated: FIVE of the eight prop markets are affected, not three. batter_rbis and batter_runs_scored (odds-shape.ts:21-22) also have no `_alternate` in the allow-list, so any game with an RBI or Runs leg is rejected too.
2. History: git shows the allow-list shipped 2026-08-02 (0cb81fe) with ZERO alternates, while marketsFor has added `_alternate` since 2026-07-19 (28a854c). So every prop CLV pull was 403 from 08-02 until 09-04 (9df281e admitted the three ladders); since then only games whose prop legs are exclusively hits/Ks/HR get a prop close. ML/RL sightings were never affected (slate call is h2h,spreads x us,eu, an allowed shape).
3. I could not measure actual clv coverage: the ledger (pl:ledger:v1) is not on disk in either checkout, so the real-world size of the gap is inferred from code, not observed.
4. "No credits wasted" is correct (403 precedes the upstream fetch).

Severity: downgraded to medium. It is a silent, unrecoverable loss of the main model-accuracy yardstick for most MLB prop legs, but it is paper trading only, costs no money or credits, corrupts no stored data, game-line CLV still works, and MLB is out of season so nothing is being lost today. It should be fixed before the next MLB season, not urgently.

Corrections to the fix
- The first half (only add `_alternate` for markets whose ladder is in PROP_MARKETS, ideally from one shared exported constant, plus a test that every marketsFor output passes shapeAllowed) is correct and sufficient.
- I would NOT take the second half as written: calling the Odds API directly from /api/clv drops the deliberate shared 4-minute proxy cache (route.ts:27-28 header) and would spend credits the current design avoids. Also do not "fix" it by adding all five alternates to the allow-list: each extra market adds billed product, and whether the Odds API even sells pitcher_outs_alternate / batter_hits_runs_rbis_alternate is unverified (no network allowed here); an unknown market key upstream could fail the whole call.
- Logging a warning (and not counting a null pull in gamesPulled) on non-2xx is a good addition.
- Arizona note: for legs locked since 2026-09-17 the settlement book is DraftKings (clv-core.ts:66-68, 153-155), so the ladders are only needed for DK/FD milestone quotes; the "Caesars ladder" rationale in the comment at clv-core.ts:95 is legacy.

<a id="f-b3-7"></a>
#### B3-7 — The owner's model-vs-no-vig-price comparison against real outcomes cannot be run from disk because graded results are never archived

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** pl-history contains boards, odds and props archives but no per-row outcomes: pl-history/data/hr_overround.json holds aggregates only (days 87, games 423, rows 7581, realized_hr_hitters 923 vs sum_implied 1071.54, overround 1.1609). baseline.md found 21 outcome-joinable fixture rows (model Brier 0.2096 vs board fair 0.2163, estimates nothing). Graded rows live only in Upstash (pl:pred:<date>, pl:ledger:v1, pl:cal:summary), unreadable offline; app/api/calibrate/route.ts:302-333 reads them at run time. DraftKings is two-sided at board time only from 2026-09-17 (cz field); FanDuel two-sided only for pitcher strikeouts and outs; no book has a two-sided home-run price; no game-line closes after 2026-07-30; football has no price, close or graded history on disk.

**Impact.** The single most important question (does the model beat the price) depends on a store that hit a 403 outage on 2026-10-18 and has a size cap. A store loss erases about 16,000 graded rows, and no offline audit can ever reproduce the calibration.

**Proposed fix.** In the daily grade-only pass, write each fully graded day blob (with res, pModel, pMkt, w, and DK/FD two-sided prices at log time) to the line-history branch next to the board archive. Then run the walk-forward script on that archive. Missing inputs to supply today: GET /api/predictions day blobs, GET /api/ledger, /api/cfb/ledger, /api/nfl/ledger, GET /api/calibration.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed, with the impact partly overstated and the fix needing one correction.

What I checked and confirmed:
- pl-history holds only data/<date>.json (2026-07-12..07-30 game-line odds), data/props (103 files, last 2026-10-28), data/boards (142 gz, 2026-07-26 then 08-06..10-17) and data/hr_overround.json. hr_overround.json values match exactly (days 87, games 423, rows 7581, realized 923, sum_implied 1071.54, overround 1.1609) and are aggregates only.
- The latest board archive (data/boards/2026-10-17.latest.json.gz) has zero "res"/"result"/"won"/"graded"/"outcome"/"settled" keys; rows carry pModel, prob, cz, bs, odds but no outcome.
- Graded rows live only in the store: pl:pred:<date> (app/api/calibrate/route.ts:44-46, read in the loop at ~:302-333 via redisGetJson(dayKey(date))), pl:ledger:v1 (app/api/ledger/route.ts:23, calibrate/route.ts:347), pl:cal:summary (app/api/calibration/route.ts:22).
- No guard exists: none of the workflows (.github/workflows board-archive.yml, hr-overround.yml, props-history.yml, line-history.yml) or pl-history/tools scripts reference predictions, ledger or calibration. tools/phase2_series_b.py:9 itself says pModel sits behind /api/predictions and needs the owner's sync key.
- Two-sided tally over board bookQuotes: DraftKings two-sided on hits, HRR, RBIs, runs, TB, outs, Ks; FanDuel two-sided only on pitcher_outs (133) and pitcher_strikeouts (199); no book has a two-sided batter_home_runs quote. No football price/graded dirs in pl-history.
- baseline.md:439-443 carries the 21-row figure (Brier 0.2096 vs 0.2163).

Corrections:
- Evidence: bookQuotes first appears in the 2026-09-14 board archive, not 09-17; I did not verify the 09-17 "cz field" rebinding date.
- "About 16,000 graded rows" traces to docs/progress.md:429 (16,322 graded board rows as of 2026-09-12); it is stale, and the current count is not determinable from disk.
- The 2026-10-18 403 outage is not evidenced in the checkout; it is only consistent with the board archive stopping at 10-17. The store "size cap" is not evidenced either; the only cap I saw is the per-blob MAX_BYTES 3,000,000 / MAX_RECORDS 800 in app/api/predictions/route.ts:20-22.
- Impact overstated: "no offline audit can ever reproduce the calibration" is too strong. Board archives keep pModel/prob/DK/FD prices for board rows on about 71 dates, and outcomes are public keyless statsapi box scores; pl-history/tools/hr_overround.py already does that join for home runs. A store loss would leave a degraded reconstruction (board rows only, not the full per-day record set or the frozen pre-start statements, and it needs network), not nothing.
- Fix: /api/predictions is gated by the sync key (route.ts:24-29), unlike the ungated /api/board that board-archive.yml uses, and a Vercel route cannot push to git. The practical form is a new GitHub workflow modelled on board-archive.yml that pulls day blobs, ledgers and /api/calibration with a repo secret and commits them to the line-history branch.

Severity stays medium: paper trading only, the store has no TTL or delete on pl:pred (calibrate/route.ts:277-278), so the risk is a single-copy dependency plus an audit gap, not active data loss.

<a id="f-c2-1"></a>
#### C2-1 — Same-game correlation model is side-blind: UNDER legs are priced with the OVER event's joint frequency, so over+under pairs are scaled the wrong way

- Severity: medium. Area: parlay pricing. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:1907 sim grades every prop leg as an over only (`v=val+(lg.base||0)>=Math.floor(lg.ln)+1`); legacy/index.html:2047 `shLegKey(player,mkt,ln)` has no side; legacy/index.html:2503 row `lkey` is identical for the over and the under row while legacy/index.html:2471-2478 does produce UNDER rows (`sideCh=(pAdj>=nv)?"O":"U"`). build() then uses that key for the joint ratio (legacy/index.html:2714-2717, clamp 0.25-4) and for posCorr/negCorr (legacy/index.html:2728-2735). The wrong ratio survives the lock shrink (src/lib/shrink.ts:69-70) and is printed as `naive X% -> joint Y%` (src/components/mlb/ParlaysSection.tsx:249-260). Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_simjoint_under.py` over all 142 archived boards: simJoint tickets 6364; with an UNDER prop leg inside a jointly priced group 2008 (31.6%), on 62 of 71 dates that had simJoint; single-group mixed over/under tickets n 925, median prob/probNaive 1.024, p95 1.125, max 1.770, scaled UP by >2% on 55.5% and down on 1.0%; all-under groups n 705, median 1.025, max 1.918. Real row: 2026-08-20.best.json.gz parlaysMixed 'H+R+RBI parlay - 4 legs', teammates Wade Meckler H+R+RBI U 1.5 + Tyler Heineman H+R+RBI O 0.5: probNaive 9.6 -> prob 10.6, posCorr true.

**Impact.** Wrong ticket probability on about a third of jointly priced same-game tickets. For teammates whose overs are positively correlated, an over+under pair is negatively dependent, yet the ticket is scaled up and flagged as positively correlated. That inflated probability fed ticket EV, the shaped-card selection and found-mode Kelly stakes while parlays were on the paper card (2026-08-15 to 2026-10-05) and still drives the Board parlay list and its EV badges today. Latent on the money path only because the card has been one-leg since 2026-10-06.

**Proposed fix.** Give the sim a side-aware key: register each prop leg twice in the sim leg list (over = current test, under = its complement) under a separate `simKey = lkey + '|O'/'|U'`, and have build() pass simKey to `jointAll`/`corr` (keep `lkey` unchanged for grading). Until that ships, skip simJoint and posCorr/negCorr for any same-game group that contains a ' U ' leg and price it naive with `probNaive` shown. Add a parity test: over+under on two positively correlated teammates must give ratio < 1.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Could not refute: the defect is real and the evidence reproduces, but I rate it medium, not high.

CODE (all opened and read):
- legacy/index.html:1907 grades every prop leg in the sim as an over only (`v=val+(lg.base||0)>=Math.floor(lg.ln)+1`).
- legacy/index.html:2138 registers one sim leg per row under `shLegKey(row.p,mkt,row.ln)`; legacy/index.html:2047 shows that key has no side.
- legacy/index.html:1979-1984 `legP`, `jointP` and `corr` are all keyed by that side-less key; `jointAll` (1988-) ANDs the over bitsets.
- legacy/index.html:2472-2478 does pick "U" rows in the disciplined modes; legacy/index.html:2503 gives the row the same side-less `lkey`.
- legacy/index.html:2709-2724 scales the ticket's own (under) leg probabilities by `jointAll(lkeys)/prod(legP[lkey])`, clamped 0.25-4, i.e. the over-event ratio.
- legacy/index.html:2728-2735 sets posCorr/negCorr from the over-event correlation.
- I found no guard: nothing in build() checks side before the joint or corr lookup.
- src/lib/shrink.ts:69-70 carries the ratio through (`probRaw * ratio`).
- src/components/mlb/ParlaysSection.tsx:241-262 prints CORRELATED, SIM-JOINT and `naive X% -> joint Y%`.

DATA (re-ran the auditor's script; all figures match):
- 6364 simJoint tickets, 2008 with an under prop leg inside a jointly priced group, on 62 of 71 dates.
- Mixed single-group tickets: n 925, median 1.024, p95 1.125, max 1.770, scaled up by more than 2% on 55.5% and down on 1.0%.
- All-under groups: n 705, median 1.025, max 1.918.
- The cited 2026-08-20.best.json.gz row is exact: Meckler `H+R+RBI U 1.5` and Heineman `H+R+RBI O 0.5`, same gkey, probNaive 9.6 -> prob 10.6, posCorr true.

CORRECTIONS to the evidence:
- The 142 boards are .best and .latest copies of the same dates, so absolute counts are roughly doubled. My own latest-only recount (/private/tmp/claude-501/audit-out/scripts/verify_c2_1b.py): 3260 simJoint tickets, 1039 (31.9%) with an under hitter leg in a same-game group. The share holds.
- Only 98 of those 1039 carry posCorr, so the mislabelled "CORRELATED" badge is the minority symptom; the wrong ratio is the main one.
- simJoint appears on archived boards from 2026-07-26 to 2026-10-17, so it was still occurring on the last archived board.
- All-under groups get the right direction but the wrong magnitude (the true ratio is 1+cov/((1-pA)(1-pB)), the engine uses 1+cov/(pA*pB)). Only mixed over+under groups are scaled the wrong way.

IMPACT, why medium:
- Paper trading only.
- The typical error is small: median about +2.4% relative on ticket probability, p95 about +12%.
- Multi-leg tickets have been off the card since STRAIGHT_SINCE = 2026-10-06 (src/lib/found-mode.ts:97-103), so it is latent on the card path and today only affects the Board parlay list display and EV badges.
- The code path to the card is confirmed: src/lib/server/lock-card.ts:312 and :1115 shrink the engine ticket, and :1146-1147 read `pl.czEv` and `pl.prob`.
- Not confirmed: the claimed 2026-08-15 start date, and that any actually locked ticket contained an over+under same-game group. No ledger is on disk.

FIX notes:
- Sound in principle. A cheaper variant than doubling the sim legs (L grows, the pair matrix is L squared): keep one leg per row and make `jointAll`/`corr` side-aware, ANDing with the complemented bitset for an under leg, using 1-legP as its marginal and flipping the corr sign for a one-under pair.
- If complementing, mask the padding bits of the last 32-bit word (nSims is not a multiple of 32) or the count will be inflated.
- Ticket legs on the board carry `side: null` (seen in the 2026-08-20 row), so build() must take the side from the row object or carry `side` onto the leg; the ' U ' prop-string test is only good enough for the interim skip.
- The interim skip (price naive, no posCorr/negCorr when a group has an under leg) is safe.

<a id="f-c2-2"></a>
#### C2-2 — Same-game parlays are priced, EV'd and paid as the product of straight leg prices everywhere; DraftKings/FanDuel SGP pricing is not modelled anywhere, and the correlation boost is booked as free edge

- Severity: medium. Area: parlay pricing. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Engine: headline dec legacy/index.html:2699, EV :2738, fair :2739, settlement-book product czDec :2743-2746, basis product :2749-2752; up to 2 legs from one game allowed on auto tickets (src/lib/env-adjust.ts:66 `parlayGameCap: 2`; legacy/index.html:2685-2687 second pass relaxes distinct-game). Grading pays `stake*eff` from czDec with no SGP price (legacy/index.html:3638-3654). Other product-of-straights paths: src/lib/sportsbook/mlb.ts:105; src/lib/ticket-math.ts:47-68 (header :1-8 admits same-game correlation not modelled); src/lib/my-parlay.ts:63,:72 (fairAm from naive product, same-game pairs only listed); src/lib/parlay-calc.ts:35-46; src/lib/parlay-gen.ts:430-463 (sameGame/sameTeam only listed, :460-461); 'stacks' style rewards a same-game pair +6 with no repricing (src/lib/parlay-strategy.ts:38, requires onePerGame off :23); UI toggle 'Allow legs from the same game' src/components/props/GenSheet.tsx:1029-1031. Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_parlay_probe.py`: 7306 of 27594 archived multi-leg tickets have 2+ legs from one game. Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_boost_flip2.py`: of 5427 simJoint tickets with a settlement-book product price, 1001 are +EV at prob*czDec and 588 of those (58.7%) are +EV only because of the joint boost (naive-product EV <= 0); 406 clear a 3% bar only through the boost.

**Impact.** A same-game ticket cannot be placed at the product of the straight prices: the books price SGPs themselves and pay less on positively correlated legs. The system raises the probability for positive correlation while holding the price at the uncorrelated product, so the correlation shows up as edge that does not exist at any book. Paper payouts and P/L for won same-game tickets in the 2026-08-15 to 2026-10-05 record are therefore overstated by an unknown amount (no ledger export on disk to size it), and every 'fair'/payout shown for a same-game ticket in the Board, My Parlay bar, calculator and generator is not an obtainable price.

**Proposed fix.** Treat any ticket with 2+ legs from one game as an SGP with price unknown: do not compute EV/Kelly or a paper payout from the leg product; show 'SGP - enter the book's quote' and only price/grade it from a book-entered price (`confirmed`, already honoured at legacy/index.html:3638 and src/lib/ticket-payout.ts:34-43). If an automatic number is wanted, apply the joint ratio to the PRICE as well (assume payout = product / max(1, joint ratio) minus an SGP margin) so positive correlation can never create edge. Keep one-leg-per-game mandatory for anything auto-locked, and drop the 'stacks' score bonus or label it unpriced.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code, severity lowered from high to medium.

What I checked (all paths relative to /private/tmp/claude-501/pl-audit):
- Engine build(): headline dec = product of leg decimals (legacy/index.html:2699); prob = product of leg probs, then each same-game group's product is scaled by joint/marginals clamped 0.25-4x when the sim is armed (:2707-2727); EV = prob*dec-1 (:2738), fair (:2739); settlement price czDec = product of leg cz (:2743-2746), czEv = prob*czDec-1; basis the same (:2749-2752). The probability moves for correlation, the price never does. No SGP price model exists anywhere: grep for SGP / "same-game parlay" in src, legacy and docs returns only comments about the PROBABILITY side (legacy/index.html:1837, docs/collection-period.md:5487).
- Same-game legs are allowed on auto-built tickets: pick() second pass drops distinct-game (:2687), capped at 2 per game by parlayGameCap (src/lib/env-adjust.ts:66); HR category does not prefer distinct games at all (pdg false in the plan loop, ~:2793).
- Grading pays stake*eff from confirmed else czDec (legacy/index.html:3645-3654); src/lib/ticket-payout.ts:34-44 same order.
- Other product-of-straights paths all as cited: src/lib/sportsbook/mlb.ts:105; src/lib/ticket-math.ts:47-68 (header :5-6 says same-game correlation is not modelled); src/lib/my-parlay.ts:63,:72; src/lib/parlay-calc.ts:35-46; src/lib/parlay-gen.ts:430-463 (sameGame/sameTeam listed only, :460-461); src/lib/parlay-strategy.ts:38 (+6 for a same-game pair) and :23; GenSheet toggle at src/components/props/GenSheet.tsx:1029-1031.
- Re-ran both cited scripts; numbers reproduce exactly: 142 board files, 27594 multi-leg tickets, 7306 with 2+ legs from one game; 5427 simJoint tickets with czDec, 1001 +EV, 588 +EV only through the joint boost, 406 clear 3% only through it. czDec equals the product of leg cz on all 18892 checked tickets (0 mismatches).
- My own probe (/private/tmp/claude-501/audit-out/scripts/verify_c2_2.py): on archived boards, 672 non-HR, 2-leg, non-live same-game tickets carried czEv >= 0 (407 at >= 3%), i.e. the shape the core allocator admits (shCardPool :2990-2996, shAllocate gate :3037-3038). No guard in the allocator or the found pass excludes same-game tickets: lock-card.ts found pass filters on live/started/HR/H+R+RBI over/outs and czEv > 0 only (src/lib/server/lock-card.ts:1138-1149); its per-day key blocks a repeated player market, not a repeated game.

Corrections / why not high:
1. The automatic money path no longer locks any multi-leg ticket: from 2026-10-06 every found pass on MLB, CFB and NFL seats one-leg bets only (src/lib/found-mode.ts:97-116, src/lib/server/lock-card.ts:1078-1080, src/lib/cfb/found.ts:142-143). So forward exposure today is display only: Board parlay lists, generator, calculator, My Parlay bar and hand-built tickets.
2. Football auto tickets were never same-game: before 2026-10-06 the football found pass kept singles and cross-game doubles only (src/lib/cfb/found.ts:144, `new Set(d.games).size === d.games.length`). The historical record exposure is MLB only.
3. That any same-game ticket was actually LOCKED and paid is not shown: the archive has boards (candidates), no ledger. The pool evidence makes it likely, but the "P/L overstated" claim is unsized and unproven; the auditor says so. The "2026-08-15 to 2026-10-05" record window could not be verified from disk; simJoint tickets appear on archived boards from 2026-07-26 to 2026-10-17.
4. The boost is not one-directional: the ratio is clamped 0.25-4x and over-only groups fall below 0.98 in 8.4% of cases (min 0.060). The "free edge" framing holds for the positive-correlation majority (median ratio 1.015-1.025), not every ticket.
5. In the generator the same-game toggle is off by default (onePerGame true, src/components/cfb/CfbProps.tsx:754) and 'stacks' refuses to run until it is switched off (parlay-strategy.ts:23), so that path needs a deliberate user action.

Fix note: the "keep one-leg-per-game mandatory for anything auto-locked" part is already moot while straights-only stands; it matters only if multi-leg auto tickets return. The core of the fix is right: mark any ticket with 2+ legs from one game as SGP / price unknown, suppress EV, Kelly and product payout, and grade only from a book-entered `confirmed` price (already honoured at legacy/index.html:3645 and ticket-payout.ts:34-36). Drop or label the 'stacks' +6 bonus as unpriced.

<a id="f-c1-12"></a>
#### C1-12 — No per-game or per-player exposure cap: correlated full-Kelly singles stack on one player or one game

- Severity: medium. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** MLB dedupe key is player|market, or gkey|mlrl for ML/RL (src/lib/server/lock-card.ts:1006-1013); usedMarkets/usedLegs are the only cross-ticket constraints in :1104-1200 (no game or player stake limit). Football key is (game, family) with families side / total / prop:player|market (src/lib/cfb/found.ts:49-60). Each admitted bet is sized independently by foundStake (lock-card.ts:1183; found.ts:180).

**Impact.** Bankroll risk: Hits, Total Bases and H+R+RBI on the same batter, or a team ML plus that team's batters, or side plus total plus several props in one football game, can each take up to $800 as if independent. Realised variance is far above what the Kelly sizing assumes and one game can consume the day's room.

**Proposed fix.** Add a per-game and per-player stake cap (for example the max single stake across the correlated group, or a group Kelly haircut) inside pickFound's admit/commit step on both desks.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed: every cited line is accurate and I found no guard elsewhere. Medium holds only as a sizing-model defect; on paper money with an owner-set ceiling it is arguably low-medium.

**What I checked**
- **MLB key:** `foundMarketKey` returns `player|market` for 3-part lkeys, else `gkey|mlrl` (src/lib/server/lock-card.ts:1006-1011). Hits, TB and H+R+RBI on one batter are three different keys.
- **MLB admit step:** `fitsDay` tests only `usedLegs`, `usedMarkets` and the under-bias share (lock-card.ts:1161-1172). There is no game or player stake limit.
- **MLB sizing:** `stakeOf` calls `foundStake(c.prob/100, c.dec, room)` per candidate (lock-card.ts:1183).
- **Football key:** `foundFamilyOf` / `foundKeyOf` give `gkey|side`, `gkey|total` or `gkey|prop:player|market` (src/lib/cfb/found.ts:49-60). The header says this is deliberate: "a game's total and its side are different bets" (found.ts:28-29).
- **Football admit and sizing:** admit checks only that key (found.ts:181); the stake is `foundStake(d.prob, d.dec, r)` (found.ts:180).
- **Shared loop:** `foundStake` is bankroll × min(f*, 8%), i.e. full Kelly capped at $800 and trimmed to room (src/lib/found-mode.ts:165-171). `pickFound` is a plain greedy loop with no group constraint (found-mode.ts:186-207).
- **Other guards:** a search of lock-card.ts, cfb/found.ts, found-mode.ts and cfb/lock-server.ts for exposure, game-cap or correlation logic found nothing relevant.

**Evidence from stored boards**
The archived boards for 2026-10-15, -16 and -17 are one-game slates, so every found bet that day lands on one game. At raw (pre-shrink) probability they show same-player multi-market positive-EV rows:
- 10-16: joseramirez on TB 1.5, Hits 0.5 and H+R+RBI 1.5; nickmartinez on K's and Outs; 11 distinct market keys in the one game.
- 10-17: joseramirez on Hits and H+R+RBI.

This is a raw-probability count from my script, not the engine's post-shrink selection. No stored ledger is on disk, so I could not confirm that a stacked card was actually locked.

**Corrections to the impact**
- **"Up to $800 each" is the worst case.** It needs f* ≥ 8% on a probability already blended halfway to market (`shrinkW` 0.5, src/lib/paper-mode.ts:192). Typical stakes are well below that.
- **Total exposure is bounded.** The day's ceiling is $2,500 plus same-day wins per sport (found-mode.ts:58, 295-296), about 25% of the $10,000 sizing bankroll. The owner set that ceiling explicitly.
- **Some stacks are already blocked on MLB.** HR legs, H+R+RBI overs and (since 10-06) pitcher outs are excluded (lock-card.ts:1146-1148), so an H+R+RBI stack can only be an under.
- **Football props are narrower than implied.** They enter only on boards carrying `paperProps` (found.ts:86-88), and all football candidates pass an EV floor and a 2.60 max-price gate.
- **Intent gap on MLB.** The header says the key exists "so a later price on the same player cannot stack a second bet on him" (lock-card.ts:997-998), yet it only blocks the same market, not the same player.

**Fix**
The proposed fix location is right: the `admit`/`commit` closures passed to `pickFound` on both desks. A per-game cap needs a rule for one-game slates, where it would otherwise cut the whole card.

Script: /private/tmp/claude-501/audit-out/c1-12-check.py

<a id="f-c1-4"></a>
#### C1-4 — MLB writeLock/getLockEntry treat an unparseable ledger blob as an empty ledger and overwrite it (football already guards this)

- Severity: medium. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/lock-card.ts:1304-1310 (`try { JSON.parse(...) } catch { cur = []; }`) then mergeLedgers(cur,[entry]) and a plain SET at :1322 `{ ledger: merged, at: entry.lockedAt, ...(epoch != null ? { epoch } : {}) }` - epoch is only carried if the parse succeeded, although the comment at :1307 says 'the epoch MUST ride through'. getLockEntry :1331-1339 returns null on parse failure, so generate/route.ts:597 gets carry = null and the day is re-seated from a fresh $2,500. Football has the explicit guard: src/lib/server/football-lock.ts:80-115 (FootballStoreUnreadable, 'A BLOB NOTHING CAN READ IS NOT AN EMPTY LEDGER'). src/lib/server/store.ts:26-28 notes that a reader predating the gz1: gzip marker reads the ledger as unparseable.

**Impact.** Record integrity (latent, catastrophic when it fires): one bad read (truncated value, gzip marker mismatch after a rollback, partial write) silently replaces the entire MLB paper ledger with today's entry, drops the resurrection epoch, and lets the same day's bets be locked a second time with full room. No alert is raised.

**Proposed fix.** Mirror the football guard: in writeLock and getLockEntry throw a named error when the stored value is non-null but fails to parse (or is not an object with an array ledger); never SET over it. Surface it in /api/generate's failure reason and the scheduler health row.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but I would rate it medium rather than high: the trigger is narrower than the finding says, and the fix scope is wider.

EVIDENCE CHECKED (all opened):
- src/lib/server/lock-card.ts:1301-1324 — writeLock: `catch { cur = []; }` at :1309-1311, then mergeLedgers(cur,[entry]) and an unconditional SET at :1322. `epoch` is assigned only inside the try (:1308), so a parse failure drops it. No log, no throw. Real.
- src/lib/server/lock-card.ts:1331-1339 — getLockEntry returns null on parse failure, the same answer as "no entry". Real.
- app/api/generate/route.ts:597 (the finding omitted the `app/api/` prefix) — `carry = await getLockEntry(date)`; a null carry gives allocSoFar from nothing and a fresh build, then writeLock at :647. Real.
- src/lib/server/football-lock.ts:80-115 — FootballStoreUnreadable and readLockStore/readLockBank throw on parse failure or wrong shape. Real; MLB has no equivalent.
- src/lib/server/store.ts:26-30 — the comment itself says an older build "would read a gz1: ledger as unparseable and could write it back as empty". Real.
- No test covers an unparseable MLB blob (tests/lock-card.test.ts mentions "unreadable" only for readShapeCalibration at :755).

CORRECTIONS:
1. Narrower trigger. In the current build a truncated or corrupt gz1: value does NOT reach this catch: redis() calls unpackValue -> gunzipSync (store.ts:41-44, :60), which throws from the GET at lock-card.ts:1302, outside the try, so writeLock aborts without writing. The ledger is almost certainly over the 2,048-byte pack threshold, so the "truncated value / partial write" examples are mostly covered by accident. The catch is reachable only by (a) a plain non-gz value that is not JSON, (b) a rollback to a build older than b29961e, or (c) a value that parses but has no `ledger` array (:1307 silently treats that as empty too, a case the finding did not mention).
2. The same pattern exists in two more places the finding missed, and one fires first. src/lib/server/ledger-epoch-server.ts:16-28: a parse failure gives stored=null, decideEpochMigration(null) returns migrate:true, archive:false (src/lib/ledger-epoch.ts:26-33), so it SETs `{ledger: [], epoch: 2}` over the unreadable blob without archiving it. The scheduler calls this at app/api/scheduler/route.ts:220, before lockExists/writeLock, and app/api/ledger/route.ts:75 and :93 call it on every authed GET/PUT. app/api/ledger/route.ts:61-70 (readStore) also maps unparseable to null and PUT merges into `[]`.
3. The dropped epoch is worse than "reopens resurrection". After writeLock stores a blob with no epoch, the next ensureLedgerEpoch reads epoch as 1, migrates, and resets the store to empty (the archive is SET NX, so an existing e1 archive is not updated). The day's fresh entry is wiped as well, and the day re-seats again.
4. "Locked a second time with full room" is accurate in effect (carry=null gives a fresh found-day room), but the first copy is gone by then, so it is a replacement, not a visible duplicate.

WHY MEDIUM, NOT HIGH: latent; needs a non-JSON or wrong-shape value under pl:ledger:v1 or a forbidden rollback; paper trading only; partial recovery exists because a device holding the epoch-2 ledger re-merges it through PUT /api/ledger (mergeLedgers, route.ts:122-124). I found no server-side ledger backup in the repo or in pl-history (only daily odds and boards), so the server alone cannot recover it.

FIX ADJUSTMENT: the proposed guard is right but must cover every reader-then-writer of pl:ledger:v1, not just lock-card.ts: writeLock, getLockEntry, ensureLedgerEpoch (never migrate or reset on an unparseable non-null value) and the ledger route's readStore. Treat only a missing key as empty; throw a named error on a non-null value that fails to parse or has no ledger array, and surface it in the generate lock.error and the scheduler health row.

<a id="f-e1-4"></a>
#### E1-4 — MLB writeLock treats an unparseable ledger blob as an empty ledger and overwrites it (and drops the epoch); the scheduler self-check reaches that path automatically

- Severity: medium. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/lock-card.ts:1302-1311: `try { const s = raw ? JSON.parse(raw) ... ; if (s && Array.isArray(s.ledger)) cur = s.ledger; epoch = s?.epoch; } catch { cur = []; }` then :1322 `await redis(["SET", LEDGER_STORE_KEY, JSON.stringify({ ledger: merged, ... (epoch != null ? { epoch } : {}) })])`. The comment at :1308 says the epoch 'MUST ride through - dropping it would reopen resurrection', yet on the catch path it is undefined. getLockEntry (:1331-1339) also swallows the parse error and returns null, so lockExists is false, needsLockAction (:208-213) returns 'backfill' whenever a board exists, and app/api/scheduler/route.ts:264-265 calls writeLock on the next poke. A concrete trigger is documented in src/lib/server/store.ts:26-33: values are stored gzip-packed with prefix `gz1:` and a build older than b29961e reads them raw. The football path does the opposite and refuses: src/lib/server/football-lock.ts:103-113 throws FootballStoreUnreadable.

**Impact.** One unreadable read (rollback, truncated value, a non-array `ledger`) replaces the entire MLB paper ledger - the whole betting record - with a single day's entry, silently, on an automatic poke.

**Proposed fix.** Mirror the football reader: in writeLock and getLockEntry throw a `LedgerUnreadable` error when `raw` is non-null and either JSON.parse fails or `ledger` is not an array; never SET in that state. Before any ledger SET, write the previous raw value to `pl:ledger:v1:prev` (one-deep backup) and refuse a write whose merged length is smaller than the stored length.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real, but the mechanism on the scheduler path is described wrongly, the proposed fix is incomplete, and "high" is overstated; I rate it medium.

**Confirmed as cited**
- `src/lib/server/lock-card.ts:1301-1324`: `writeLock` catches the `JSON.parse` failure, sets `cur = []`, leaves `epoch` undefined, then SETs `{ ledger: merged, at }` with no epoch. A non-array `ledger` also falls through to `cur = []`.
- `src/lib/server/lock-card.ts:1331-1340`: `getLockEntry` swallows the parse error and returns null, so `lockExists` is false.
- `src/lib/server/lock-card.ts:208-213`: `needsLockAction` returns "backfill" when a board exists and no lock does.
- `app/api/scheduler/route.ts:264-265` (backfill) and `:272` (reason record) call `writeLock`.
- `src/lib/server/store.ts:26-33` documents the rollback hazard.
- `src/lib/server/football-lock.ts:96-115` throws `FootballStoreUnreadable` instead of writing.

**Correction 1: the scheduler wipes the blob one step earlier, and more broadly**
- `app/api/scheduler/route.ts:219-224` runs `ensureLedgerEpoch()` before `lockExists` at `:225`.
- `src/lib/server/ledger-epoch-server.ts:15-30` also swallows the parse error (`stored = null`).
- `src/lib/ledger-epoch.ts:26-33`: `decideEpochMigration(null)` returns `{ migrate: true, archive: false }`.
- So line 28 SETs `{ ledger: [], epoch: 2 }` with no archive copy, on every poke, whether or not a board exists.
- The same call runs on every authed `/api/ledger` GET and PUT (`app/api/ledger/route.ts:75`, `:93`).
- On the scheduler path `writeLock` therefore sees a parseable empty ledger that carries the epoch; the "epoch dropped" branch is not what fires there.

**Correction 2: where the `writeLock` catch path is actually reached**
- It is reached directly from `/api/generate` (`app/api/generate/route.ts:597`, `:647`), which has no `ensureLedgerEpoch` call.
- The blob it writes has no epoch. The next `ensureLedgerEpoch` reads that as epoch 1 and resets the ledger to empty; the archive is `SET NX`, so an existing e1 archive is not replaced.
- Dropping the epoch is therefore harmful because it triggers a second wipe, not because of resurrection.

**Fix gap**
- The proposed fix covers only `writeLock` and `getLockEntry`. `ensureLedgerEpoch` must also refuse on a non-null unparseable blob, or the wipe still happens.
- `readStore` in `app/api/ledger/route.ts:60-69` has the same null-on-unparseable pattern feeding the PUT merge at `:118`.

**Why not high**
1. **The trigger is narrow in this build.** `redis()` unpacks on GET (`src/lib/server/store.ts:42-45`, `:61`), and `gunzipSync` throws on a truncated or corrupt `gz1:` value. That throws out of the read before any `JSON.parse`, so nothing is written. Every in-repo writer stores `JSON.stringify` of an object with an array `ledger`. Reaching the catch needs out-of-band corruption: a rollback to before b29961e (where the old build's code runs), a manual store edit, or a future format change.
2. **There is a partial recovery path.** A device that has synced holds the ledger locally and re-pushes it on its next sync (`src/lib/ledgerSync.ts:188-208`); the server merges it (`app/api/ledger/route.ts:118-123`). The loss is limited to days or server-written fields that no device holds.
3. **It is a paper-trading record.**

I found no server-side backup of the epoch-2 ledger in the code. I did not check whether the `pl-history` data files contain ledger copies.

<a id="f-d-2"></a>
#### D-2 — MLB money tickets are graded only in the browser; the server never grades or verifies them

- Severity: medium. Area: grading and ledger. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/mlb-day-won.ts:9-11: "An MLB ticket's grading on the shared ledger is written by the DEVICE ... nothing on the server grades a locked MLB ticket." app/ledger/page.tsx:450-480 runs the grader only when the Ledger page is open; src/lib/useLedger.ts:109 calls legacy shGrade (legacy/index.html:3677-3713), which writes result and payout locally and reaches the store only through PUT /api/ledger. The merge accepts the device's grading map as-is: src/lib/ledger-merge.ts:1959-1969 (a settlement on either copy fills in; no payout recomputation; `grep -n payout src/lib/ledger-merge.ts` shows no validation). Football has a server settle pass (src/lib/server/football-lock.ts:257-387); MLB has none.

**Impact.** MLB tickets stay ungraded until someone opens the Ledger tab on a device holding the sync phrase. Result and payout are whatever that device computed, so the MLB record cannot be reproduced or checked server-side. The same-day found-mode room is fed by a second, separate server read (foundWonBy) that can disagree with the device grade.

**Proposed fix.** Add a server MLB settle pass on the scheduler tick that reuses gradePrediction (src/engine2/grade.ts:62-136) plus the ticket rule in legacy shGradeTicket, writes grading with the same overlay rule football uses (overlayCfbGrading), and derives payout from the stored locked price. Treat device grading as display-only once the server has settled.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed, but high is overstated; medium.

**What I checked (all opened in /private/tmp/claude-501/pl-audit):**
- src/lib/server/mlb-day-won.ts:9-11 carries the quoted comment verbatim: the device writes MLB `grading`, and "nothing on the server grades a locked MLB ticket".
- app/ledger/page.tsx:450-480: `doGrade` and the auto-grade effect run only on the Ledger page. A grep for `shGrade` / `api.grade` finds no other caller in the Next app (only src/lib/useLedger.ts:109, plus legacy/index.html:4085 and 4237 inside the legacy page itself).
- legacy/index.html:3677-3713 (`shGrade`) fetches statsapi from the browser and saves `grading` locally via `shLedgerSave`; `shGradeTicket` is at 3638-3655.
- app/api/ledger/route.ts:83-150: the PUT is gated by the sync phrase, runs `validateLedger`, then `mergeLedgers`. `validateLedger` (src/lib/ledger-merge.ts:114-143) checks date, locked, core, placed and actualStake only; it never looks at grading or payout.
- src/lib/ledger-merge.ts:1959-1969 merges the grading maps as described: a settlement fills over an absence, with no payout recomputation.
- No server MLB settle pass exists. The only server writers of ledger `grading` are football (src/lib/server/football-lock.ts:257 `settlePass`, using `overlayCfbGrading` at 318 and 365). `gradePrediction` is used server-side only in mlb-day-won.ts:72 and app/api/calibrate/route.ts:225-256, and calibrate grades the prediction blob (`pl:pred:<date>` rows and `blob.parlays`), not the money ledger.

**Corrections to the finding:**
1. **"Can disagree" is overstated.** `foundWonByOf` (src/lib/found-mode.ts:256-274) makes a settled grade on the entry decide its ticket; the server read counts only while the ticket is unsettled. The read is deliberately conservative (mlb-day-won.ts:15-20: a ticket counts only when every leg won; a lost leg reads 0). The real gap is transient: a won ticket with a void or push leg adds nothing to the room until a device grades it.
2. **Nothing server-side consumes MLB ledger grading for sizing.** A grep for `computeBankroll` / `realizedPL` / `ledgerStats` in src/lib/server and app/api returns nothing. Model calibration uses its own server-graded prediction store; it reads ledger `grading.legs` only as a backfill when a prediction date is missing (app/api/calibrate/route.ts:344-360). src/lib/server/card-view.ts:57-59 only displays the grade.
3. **The device grade is deterministic.** It comes from public final box scores and the stored locked price, so the record is re-derivable in principle. What is missing is a server-side check, and the only writer is whoever holds the sync phrase.
4. **Not checked:** whether the legacy page is still served in production.

**Why medium:** this is a documented, deliberate design in a paper-trading, single-owner system. The impact is on record timeliness and auditability (MLB tickets stay pending until the Ledger tab is opened; payout is unverified by the server), not on stake sizing or model inputs.

**On the proposed fix:** sound. app/api/calibrate/route.ts:251-267 already applies the same ticket rule server-side to `blob.parlays` and is a ready template. A server pass must also reproduce `shGradeTicket`'s void/push divide-out using each leg's `cz` price (legacy/index.html:3644-3654), must use a football-style overlay rather than `mergeLedgers`, and must never overwrite a settled verdict.

<a id="f-e3-2"></a>
#### E3-2 — MLB money ledger is graded only when a device has the Ledger tab open; the server never grades it, so /taken, record, P/L and bankroll stall

- Severity: medium. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/mlb-day-won.ts:5-21 comment: an MLB ticket's `grading` on the shared ledger is written by the DEVICE and nothing on the server grades a locked MLB ticket. The only grade path is app/ledger/page.tsx:450-460 (`api.grade()` then `syncNow()`) plus the auto-grade-on-view effect at :467-480. src/lib/bet-alert.ts:125-135 `statusOf` returns "live" for any ungraded ticket whose game has started, with no upper time bound. vercel.json crons are only scheduler evening/night and two NFL lock pokes.

**Impact.** Reliability and accuracy of the record: if the owner does not open the MLB Ledger tab, finished MLB bets stay 'live' on /taken forever, the stored ledger carries no result, and every figure built on it (P/L, ROI, record, drawdown, bankroll chip) is stale. A paper-trading record that depends on a phone being opened is not an independent record.

**Proposed fix.** Add a server grading pass to the scheduler (night poke and the next morning) that grades pending MLB tickets from final box scores using the same grading function the device uses, writes `grading` to pl:ledger:v1, and leaves the device pass as a no-op fallback. Until then, have /api/taken derive won/lost from the server's own `foundWonBy` data.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but high is overstated; I rate it medium.

WHAT I CHECKED
- src/lib/server/mlb-day-won.ts:9-13 says it verbatim: an MLB ticket's `grading` on the shared ledger is written by the device, and "nothing on the server grades a locked MLB ticket".
- The only callers of the MLB grader are app/ledger/page.tsx:450-460 (`api.grade()` then `syncNow()`) and the auto-grade-on-view effect at :467-480. `api.grade` is src/lib/useLedger.ts:109, which calls the browser engine's `shGrade` (legacy/index.html:3677-3713). A repo grep for `.grade()` / `shGrade` / `doGrade` finds no other non-test caller for MLB.
- The MLB ledger component only mounts when the sport is MLB: app/ledger/page.tsx:359 and :375 return the CFB/NFL ledgers first, and `useLedger()` is at :393. So opening the Ledger on a football desk does not grade MLB either.
- No server route writes `grading` into pl:ledger:v1. The `grading` grep across app/api hits only the football lock routes, calibrate, and imports of grading-progress. /api/calibrate?grade=only (forwarded from app/api/scheduler/route.ts:333-340, 417-418) grades the prediction store and only READS pl:ledger:v1 (app/api/calibrate/route.ts:347-351).
- Football does have a server grader that writes `grading` (src/lib/server/football-lock.ts:260-370), so the gap is MLB-only.
- src/lib/bet-alert.ts:125-135 `statusOf` is as described: a ticket with no settled grade and a started game returns "live" with no upper time bound. app/api/taken/route.ts reads the stored ledgers only and does no grading.
- vercel.json crons are as cited (scheduler evening/night plus two NFL lock pokes).

CORRECTIONS TO THE EVIDENCE
- The vercel.json crons are not the only scheduler trigger. The scheduler comments describe an external 15-minute ticker (cron-job.org) with five daily grading slots (app/api/scheduler/route.ts:30, 333-336). The conclusion is unchanged because none of those passes grades MLB ledger tickets.
- "Stay live forever" is really "until the MLB Ledger tab is next opened". `shGrade` re-grades every locked day with `!grading.done` regardless of age (legacy/index.html:3679), then syncs. The record self-heals and no result is lost; it is delayed, not wrong.

WHY MEDIUM, NOT HIGH
- P/L, ROI, record and equity are rendered on the Ledger page itself, which triggers grading on view. The staleness therefore mainly shows on /taken and on server-side readers of `grading` (src/lib/server/card-view.ts:57-59, the calibrate ledger join).
- The found-mode room is not affected: the server reads box scores itself via `mlbDayWonBy` (app/api/generate/route.ts:634).
- This is paper trading for a single owner, and MLB is out of season on 2026-11-12, so there is no current live impact.
- I did not verify the "bankroll chip" or "drawdown" parts of the impact claim.

ON THE PROPOSED FIX
- A server MLB grading pass is reasonable, and the scheduler already has a grade slot it could ride.
- The interim suggestion (derive won/lost on /api/taken from `foundWonBy`) is only partial. `mlbReadWonBy` records a win only when every leg graded won, reads 0 for a lost leg, and skips void/push/ungradable (mlb-day-won.ts:15-20, 57-59). It also runs only inside a generate pass on found days (generate/route.ts:634), so it cannot give a full won/lost/push status.

<a id="f-d-3"></a>
#### D-3 — Every ledger write is read-modify-write with a plain SET (no compare-and-set), so concurrent writers can drop each other's records

- Severity: medium. Area: grading and ledger. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/lock-card.ts:1302-1322 (GET, merge, SET); app/api/ledger/route.ts:126-149; app/api/nfl/ledger/route.ts:99-117; src/lib/server/football-lock.ts:482-495 (claim), :515-521 (rollback), :754-759 (found write), :340-374 (settle); app/api/clv/route.ts:133-139. The CLV route's own comment at app/api/clv/route.ts:124-131 records that this already happened: a stale read "overwrote the sweep's freshly seated tickets out of the store, invisibly to every append-only assert". The repair was a second GET just before the SET, which narrows the window but does not close it. The device PUT also writes bank and noplay before the ledger SET (app/api/ledger/route.ts:139-149), so a failed ledger write leaves them out of step.

**Impact.** Scheduler found passes, the settle pass, CLV and device syncs all hit the same key on the same :00/:15/:30 minutes. A lost update removes freshly locked tickets or a just-written grade with no error. Append-only asserts compare against the writer's own stale read, so they cannot see it.

**Proposed fix.** Store a version counter in the blob and write through one Lua EVAL that SETs only if the stored version still equals the one read (retry on mismatch), or take a short SET NX PX lease per ledger key around every read-merge-write. Apply to all three ledgers and to bank/noplay in the same script.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but the finding misses a partial guard and overstates severity; I rate it medium, not high.

WHAT I CHECKED (all opened, lines match the citation):
- src/lib/server/lock-card.ts:1302-1322 writeLock: GET, mergeLedgers, two assertAppendOnly calls against the writer's own read, then plain SET.
- app/api/ledger/route.ts:126-149: readStore, merge, then SET bank (:142), SET noplay (:147), SET ledger (:149). This is the widest window: four store round trips sit between the ledger read and the ledger SET.
- app/api/nfl/ledger/route.ts:99-117: same pattern (bank SET :114, ledger SET :116).
- src/lib/server/football-lock.ts: claim :482-495, rollback :515-521, found write :754-759, settle :340-374. Each is readLockStore, map, plain SET.
- app/api/clv/route.ts:123-139: the comment does say a stale read overwrote a sweep's freshly seated tickets, and the repair is a second GET immediately before the SET. It narrows the window and does not close it.
- A grep of src/ and app/ for EVAL, WATCH, MULTI and SETNX found none, so there is no compare-and-set on any ledger key.

CORRECTIONS TO THE EVIDENCE:
1. "No guard" is not quite right. Found passes are serialised by a SET NX PX lease:
   - MLB: src/lib/server/found-lease.ts:15-20, taken in app/api/scheduler/route.ts (:230-288) and app/api/generate/route.ts (:568, :690).
   - Football: src/lib/server/football-lock.ts:635-651, taken at :705, with the stored copy re-read under the lease at :721-731.
   So found-vs-found races are closed. The lease does not cover the settle pass (:340-374), the claim and rollback (:482-521), CLV, or any device PUT, so cross-writer lost updates remain possible.
2. The finding undercounts writers. The same plain-SET pattern is also at src/lib/server/football-lock.ts:202, :598, :875, app/api/nfl/lock/route.ts:314, app/api/cfb/lock/route.ts:508 and app/api/cfb/ledger/route.ts:113-115.
3. The "bank and noplay out of step" point is weak. Both are append-only merges and the device re-sends them on its next sync, so a failed ledger SET after them is effectively harmless.

WHY MEDIUM, NOT HIGH:
- Apart from the device PUT, each window is one read then one write with only in-process merge work between them.
- The device only PUTs when its merged copy differs from the server's (src/lib/ledgerSync.ts:201), on a 4-minute heartbeat (HEARTBEAT_MS, :277).
- Most losses self-heal: a dropped grade is re-graded on the next settle poke, and a dropped device entry is re-pushed on the next heartbeat.
- The one loss that does not self-heal is a server found write overwritten by a stale device PUT, settle or CLV SET. Those tickets vanish silently after notifyNewBets (football-lock.ts:761) has already sent the alert, and they are only re-seated if still +EV at new prices. That is a real integrity hole in the paper record, but low probability per event, and this is paper trading only.

FIX: the proposed direction is sound. The cheapest version reuses the existing lease pattern: take a short per-ledger-key lease around every read-merge-write (settle, claim, rollback, CLV, device PUT), or use a version field checked in one Lua EVAL. Including bank and noplay in the same script is optional.

<a id="f-d-4"></a>
#### D-4 — 900 KB single-blob cap is a hard ceiling; past it MLB grading can never sync and football locks and settles stop

- Severity: medium. Area: grading and ledger. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/ledger-merge.ts:110-111 (MAX_ENTRIES 500, MAX_BYTES 900_000) and :140 (validateLedger rejects a device ledger over the cap with 400). app/api/ledger/route.ts:135-137 returns 413. MLB writeLock has no size check at all (src/lib/server/lock-card.ts:1301-1324; `grep -rn MAX_BYTES src app` shows no hit in lock-card.ts), so the server keeps appending while the only MLB grading path (device PUT) is refused. Football: src/lib/server/football-lock.ts:201, :373 (throws inside settle), :494, :597, :758 all stop with "merged ledger too large" in the day result only. app/api/clv/route.ts:139 silently skips its write. There is no rotation or archive of old days.

**Impact.** Found mode appends tickets on every pass (hourly MLB, every 15 minutes football), each carrying full leg objects, a games map and grading. When a ledger crosses 900,000 characters, grading and CLV for that sport stop with no alert. Current blob sizes could not be measured: no ledger export exists on disk.

**Proposed fix.** Split storage per day (pl:ledger:v1:<date> plus an index) or roll settled days older than N into a monthly archive key before the cap check. Add the size check and a push alert at 70% to writeLock and all football writers. Have the scheduler report blob length on every poke.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Verdict: the finding is real and every cited line checks out, but I rate it medium, not high. It is a slow, fail-closed, paper-only ceiling with a one-line stopgap, and nobody has measured how close any ledger is.

**Evidence confirmed**
- `src/lib/ledger-merge.ts:110-111` sets MAX_ENTRIES 500 and MAX_BYTES 900_000; `:140` rejects on `JSON.stringify(x).length`.
- `app/api/ledger/route.ts:111-112` returns 400 when validateLedger fails; `:135-137` returns 413 on the merged blob.
- MLB `writeLock` (`src/lib/server/lock-card.ts:1301-1324`) does GET, merge, SET with no size check. The only check nearby is `validateLedger([entry])` at `:1295-1296`, which sizes one day, not the blob.
- writeLock is called from `app/api/generate/route.ts:647` and `app/api/scheduler/route.ts:265, :272`.
- MLB ledger grading is device-only: `src/lib/server/mlb-day-won.ts:9-11` says "nothing on the server grades a locked MLB ticket". A grep for server-side `grading` writers found only football (`football-lock.ts:370`) and `nfl/replay`.
- The device PUTs the whole merged ledger (`src/lib/ledgerSync.ts:202-207`), so once the blob passes the cap every PUT is refused.
- Football cap sites confirmed at `src/lib/server/football-lock.ts:201, :373` (throw inside settle, caught into a day error at `:382`), `:494, :597, :758, :874`.
- More capped writers the finding did not list: `app/api/cfb/lock/route.ts:505`, `app/api/nfl/lock/route.ts:311`, `app/api/cfb/ledger/route.ts:106`, `app/api/nfl/ledger/route.ts:107`.
- `app/api/clv/route.ts:139` skips the SET silently when over the cap.
- No rotation or archive exists. The only reset is the one-time epoch migration (`src/lib/server/ledger-epoch-server.ts:15-29`, LEDGER_EPOCH = 2 at `src/lib/ledger-epoch.ts:18`), which needs a code change to trigger.

**Corrections to the finding**
1. "No alert" is overstated. The device shows the PUT error as its sync state (`src/lib/ledgerSync.ts:222-225`), and football errors come back in the lock response (413 or a day `action: "error"`). Only the CLV skip is truly silent. There is no push alert: `src/lib/server/push.ts` exports only `sendToAll` and `notifyNewBets`.
2. "MLB grading can never sync" holds only until the cap is raised. Nothing is destroyed: MLB locks keep landing, the found-mode room still reads wins from box scores, and the device can grade later. What cannot be recovered is football lock days missed while blocked and CLV sightings skipped.
3. The cap counts uncompressed JSON characters, but `src/lib/server/store.ts:25-37` gzips any value of 2,048 bytes or more before storing. The stored payload is therefore well under 900K, and raising MAX_BYTES is a cheap stopgap. I could not check the store's own request-size limit (no network).
4. Proximity is unmeasured. No ledger export exists in pl-history or the repo. The one stored entry on disk, `src/lib/nfl/week1-replay.json`, is 5,643 characters for 10 ungraded one-leg tickets (about 414 per ticket, measured). My extrapolation from that is roughly 60 to 150 heavy found-mode days per sport before the cap; this is an estimate, not a measurement.
5. The MLB blob has accumulated since the 2026-08-15 epoch reset with no rotation, so it will cross eventually. Whether it already has could not be determined.

**Why medium**
- Paper trading only; no money at risk.
- Football fails closed with nothing corrupted.
- The fuse is months long and its length is unknown.
- Raise to high if a measured blob is above about 70% of the cap.

**Fix**
The proposed fix is sound. The first step should be to measure the three blob lengths, and add the missing size check and report to writeLock. Per-day keys or a settled-day archive is the durable fix.

<a id="f-d-5"></a>
#### D-5 — The ledger can be changed after the fact by any holder of the sync phrase; validation is shape-only

- Severity: medium. Area: grading and ledger. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/ledger-merge.ts:114-142: validateLedger checks only the date pattern, locked===true, core being an array, placed/actualStake types and size. It does not check stakes, prices, legs, grades, payouts, or whether the date's games had started. src/lib/append-only.ts:13 ("Compares id + stake only (no leg comparison)"); restoreShrunkDays protects only against a missing id or a changed stake (:62-83), and for football only on days with source "server-lock" (app/api/nfl/ledger/route.ts:104, app/api/cfb/ledger/route.ts:103). src/lib/ledger-merge.ts:1499-1512: pickBase seats the copy with the higher gradeScore and mergeDay deep-copies that copy's tickets, prices and games map wholesale. legacy/index.html:4097-4107 (shLedgerImport) and src/lib/football/store.ts:1055 (importLedger) accept pasted JSON days, including dates not already present, and sync them up.

**Impact.** A device copy that already carries grading wins the merge, so its prices, leg text, games map, verdicts and payouts become the stored record. Whole back-dated days can be added. No route rejects a ticket or day whose event has already started when it arrives from a device. The paper record is therefore not tamper-evident and not safe against a stale or buggy client.

**Proposed fix.** Have the server stamp each server-locked ticket with a content hash over legs, price and stake, and refuse or restore any device copy whose hash differs. Reject device-originated days and tickets for dates the server locked, and any new device ticket whose stored game start is in the past. Accept only placed, actualStake and CLV fields from devices once server grading exists.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed by reading the cited code and by running the real merge kernel against synthetic days (probe at /private/tmp/claude-501/audit-out/d5/t.ts, bundled with the repo's esbuild; nothing written to the checkout).

Evidence checked:
- src/lib/ledger-merge.ts:113-142 validateLedger is shape-only, as described (date pattern, locked===true, core is an array, duplicate dates, placed/actualStake types, 500 entries, 900 KB). Nothing on stake, price, legs, grading, payout or game start.
- src/lib/append-only.ts:13 and :62-83 compare id + stake only.
- The protection predicate is `e.source === "server-lock"` at app/api/nfl/ledger/route.ts:104 and app/api/cfb/ledger/route.ts:103. MLB protects every stored day (`() => true`, app/api/ledger/route.ts:132).
- src/lib/ledger-merge.ts:1499-1510 pickBase orders by gradeScore, then clvCount, confirmedCount, byte length, byte order; mergeDay (:1513-1515) deep-copies the winner.
- legacy/index.html:4097-4107 shLedgerImport and src/lib/football/store.ts:1055 importLedger are as cited.
- Auth is only the shared phrase header (src/lib/server/store.ts:78-84).

Probe results (mergeLedgers then restoreShrunkDays, as the PUT routes do):
1. Stored server-lock day ungraded, device copy with the same id and stake but price 9.0 instead of 1.9 and grading done:true won/payout 225: the device price and verdict became the record; restored = [].
2. Same id and stake but the opposite side as the leg (BOS vs NYY): the device ticket stood, with only a console warning.
3. A back-dated 2026-08-30 day with a $500 ticket graded won $5,000 was accepted whole.
4. An extra ticket added by the device to a server-locked day was appended (append-only allows growth); no start-time check exists.

Corrections to the finding:
- "A device copy that already carries grading wins the merge" holds only when the stored copy has a lower gradeScore. With both copies at done:true, the stored "lost" verdict and 1.9 price stood in my probe. The remaining tiebreaks (CLV count, confirmed count, byte length) are still not integrity checks, so a longer device copy can win.
- unionCore's sameBet gate (:342-349) does not stop a leg swap; it keeps whichever ticket the base holds.
- For a football day without source "server-lock", a receiptless stake disagreement resolves to the smaller stake and grading is reopened (probe case 6), so a stake cannot be raised that way.
- Partial guard not mentioned: the MLB route refuses ledger merges from a sender on a stale epoch (app/api/ledger/route.ts:103-110). Football routes have no equivalent.

Severity: medium stands, but the "tamper" framing is overstated. The phrase is the owner's own secret and this is paper money, so the realistic risk is a stale or buggy client rewriting prices, verdicts or adding days. append-only.ts:53-57 documents that this already happened on 2026-09-05. It matters because P&L, CLV and calibration read this record.

Fix: the proposal is sound. The cheapest effective step is for the PUT routes to restore any stored server-locked ticket whose legs or price differ, not just id and stake, and to refuse device-originated days or tickets whose stored game start is in the past. I did not check whether legacy/index.html is still served in production.

<a id="f-e1-2"></a>
#### E1-2 — redis() discards the store's error body and has no timeout, retry or failure accounting

- Severity: medium. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/store.ts:50-58: `const r = await fetch(env.url, {... cache: "no-store" }); if (!r.ok) throw new Error(`store ${r.status}`);` - no AbortSignal, no retry, the response text (where Upstash states the reason, e.g. a plan/bandwidth limit) is never read. store.ts:64-72 `redisGetJson` additionally returns null on a JSON.parse failure. Every route's error therefore reads only `store 403`; the project's own outage record still says 'likely plan limit' because the cause was never captured.

**Impact.** Diagnosis of the two-week outage was guesswork; a hung Upstash connection holds a function until its maxDuration (90 s scheduler, 60 s lock routes) instead of failing fast; a single transient 5xx fails a whole poke.

**Proposed fix.** In redis(): `signal: AbortSignal.timeout(8000)`; on !r.ok read `(await r.text()).slice(0,300)` and throw a typed `StoreError{status, body}`; retry once (200 ms backoff) for network errors/5xx on idempotent reads (GET/MGET/SMEMBERS); treat 401/403/429 as `quota-or-auth` and surface that word in every route's error body and in the health route.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The code evidence is real, but "high" is overstated; this is an observability and resilience gap, not a correctness defect, so I rate it medium.

**Confirmed in code**
- `src/lib/server/store.ts:50-55`: the `fetch` has no `signal`, and there is no retry or failure counter anywhere in `redis()`.
- `src/lib/server/store.ts:56`: `if (!r.ok) throw new Error(`store ${r.status}`)` never reads the response body.
- `src/lib/server/store.ts:57-58`: the `j.error` branch only runs on a 2xx response, so any error text Upstash sends with a non-2xx status is discarded as well.
- `src/lib/server/store.ts:64-72`: `redisGetJson` returns null on a `JSON.parse` failure. The file's own comment at `store.ts:28-30` names that hazard (an unparseable ledger read as empty and written back).
- No guard elsewhere: `slate-server.ts`, `props-store.ts` and `live-props-store.ts` all import `redis` from `store.ts`, which about 37 files use. Other fetches in `src/lib/server` do set `AbortSignal.timeout` (e.g. `mlb-day-won.ts:107`, `player-images.ts:5`); the store call is the exception.
- The surfaced error is as described: `app/api/board/route.ts:77` returns `reason: store-unreachable: ${message}`, which reads `store-unreachable: store 403`.
- `maxDuration` values are right: `app/api/scheduler/route.ts:45` is 90; `app/api/nfl/lock/route.ts:76` and `app/api/cfb/lock/route.ts:225` are 60.

**Corrections to evidence and impact**
- The "likely plan limit" outage record is not in the repo (a grep for 403 / plan limit found nothing). It exists only in the owner's memory notes, which date the outage from 2026-10-18. The "two-week" duration could not be determined from disk.
- "Diagnosis was guesswork" holds for the app's own output only; whether the provider's dashboard shows the cause was not checkable here (no network).
- The hung-connection impact is theoretical. No evidence on disk that it has happened.
- "A single transient 5xx fails a whole poke" is only partly true. The unguarded store reads at `app/api/scheduler/route.ts:173` and `:183` throw out of `mlbTick` and so out of `GET`, failing the MLB tick. The CFB/NFL lock forwards are already started as separate requests (`scheduler/route.ts:135-137`) and still run; only their attached results are lost. The scheduler is re-poked (the code describes 15-minute pokes), so a transient failure heals on the next poke.
- None of this caused or would have prevented the 403 outage; it only slows diagnosis. The system is paper trading only.

**Corrections to the fix**
- There is no health route to surface the word in: `app/api` has `version` but no `health`. One would have to be added, or `/api/version` or `/api/board` used.
- No caller matches on the `store NNN` message text (grep found none), so a typed `StoreError` is safe to introduce.
- Keep the retry to idempotent reads only, as proposed.
- The `redisGetJson` null-on-parse-failure is better treated as a separate item: `(await redisGetJson(BLOCKS_KEY)) ?? {}` at `scheduler/route.ts:183` would read a corrupt registry as empty.

<a id="f-e1-3"></a>
#### E1-3 — board-archive workflow fails green: a store outage (or a missing board) silently ends the permanent board archive

- Severity: medium. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/board/route.ts:75-78 returns HTTP 200 `{ board: null, reason: `store-unreachable: ...` }` ('never a hard failure'); :27 does the same for store-not-configured. tools/archive_boards.py:154-160 prints 'nothing stored (expired, or no board was generated)' for a null board and :171 always `return 0`. .github/workflows/board-archive.yml:64 `git diff --cached --quiet && echo "no change" && exit 0`. Boards expire after 3 days (board-archive.yml:4, EX 259200) and WINDOW_DAYS = 3 (tools/archive_boards.py:54). Command: `git log` in /private/tmp/claude-501/pl-history - last 'board archive' commit 2026-10-18T15:27Z, while 'prop history' commits continue on 10-18, 10-19, 10-20, 10-23, 10-24, 10-26, 10-27, 10-28 (games were being played).

**Impact.** Every MLB board from 2026-10-18 through the end of the postseason is permanently missing from the history branch (unrecoverable after the 3-day TTL); the workflow showed green the whole time, so the calibration/backtest series has an unflagged gap.

**Proposed fix.** Make tools/archive_boards.py exit non-zero when any fetched reason starts with `store-unreachable` or `store-not-configured`, and when fetch() returns None after its 3 tries; add an in-season guard (statsapi schedule for the date has games but no board was archived -> exit 2). Add a final `if: failure()` step that opens/updates a GitHub issue (GitHub then emails the owner). Optionally have /api/board send `x-pl-store: down` or 503 when the caller passes `?strict=1` so the UI contract is untouched.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed the mechanism and the gap; downgraded from high because the causal part of the impact is unproven and the system is paper-only.

CHECKED (all opened, no network):
- app/api/board/route.ts:27 returns 200 `{board:null, reason:"store-not-configured"}`; :75-77 the catch returns 200 `{board:null, reason:"store-unreachable: ..."}` with the comment "never a hard failure". :73 returns 200 `no-board-for-date`. No status code or header distinguishes an outage from an empty day.
- tools/archive_boards.py:70-78 fetch() returns None after 3 tries; :104-106 prints the reason (or "fetch failed") and continues; :109-110 returns None; :159-160 prints "nothing stored (expired, or no board was generated)"; :171 unconditional `return 0`. No branch exits non-zero. WINDOW_DAYS = 3 at :54.
- .github/workflows/board-archive.yml:64 `git diff --cached --quiet && echo "no change" && exit 0`; TTL comment at :4. No failure/notify step. The only ways the job goes red are checkout/fetch/push errors.
- No guard elsewhere: the workflows directory holds only board-archive, context, hr-overround, line-history, model, props-history, ufc (no health/watchdog job). tests/workflow-timing.test.ts only pins the timing guard, not the outcome.
- pl-history `git log`: last "board archive" commit is 2026-10-18T15:27:19Z. data/boards/index.json has 71 dates, last 2026-10-17. data/props/ has files for 2026-10-18, 10-19, 10-20, 10-23, 10-24, 10-26, 10-27, 10-28 (8 dates with games, zero archived boards).
- Additional supporting evidence the auditor did not cite: the manifest already has earlier silent holes with prop files present (2026-07-27 through 08-05, 09-28, 10-02, 10-09), so this is not the first unflagged gap.

CORRECTIONS:
1. "The workflow showed green the whole time" is an inference from the code, not an observation; Actions run history is not on disk. It is a sound inference (every path returns 0) but should be worded as such.
2. Causation is overstated. Nothing on disk shows whether boards for 10-18 onward ever existed in Redis. If the cause was a store outage, the generate cron could not have written them either, so the archive job did not lose recoverable data; it failed to raise the alarm. A loud failure would have shortened the gap, not necessarily saved those dates. "Unrecoverable after the 3-day TTL" only applies if boards were written and merely unreadable/unarchived, which could not be determined.
3. Severity: paper trading, research-only archive, MLB season is over (the archive is dormant until spring), so no ongoing loss today. The 8-date postseason hole in the calibration series is real and unflagged, which is a medium data-integrity/monitoring defect, not high.
4. Fix notes: exiting non-zero on `store-unreachable` / `store-not-configured` / fetch()==None is correct and sufficient for the outage case. The statsapi in-season guard adds a new network dependency to a job that currently has one; a cheaper equivalent is to fail when all three window dates return no board while the newest manifest date is more than N days old during the season. The script is fetched from frontend-rebuild at run time (board-archive.yml:55-56), so a script fix propagates, but any workflow-file change (an `if: failure()` step) must also be made in the scheduler copy on `main` (CLAUDE.md:193 says schedules fire only from the default-branch copy), which I could not inspect.

<a id="f-e1-5"></a>
#### E1-5 — One external free-tier scheduler drives everything, with no watchdog; the two Vercel backup pokes cannot reach any grading/refill slot

- Severity: medium. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** vercel.json crons are only `/api/scheduler?poke=evening` 45 21 * * *, `/api/scheduler?poke=night` 0 0 * * *, and two Sunday `/api/nfl/lock` pokes (0 16 * * 0, 0 17 * * 0); there is no cron for /api/calibrate, /api/clv or a health route. The 15-minute ticker, the weekly full calibration (Sundays 10:00 UTC) and CLV exist only as cron-job.org rows (docs/cron-jobs.md:15-19). History of exactly this failing unnoticed: docs/cron-jobs.md:7-12 (rows documented as live were never created; ten days dark) and src/lib/server/store.ts:114-116 ('two days of live watching proved the external pokes go dark in the evening - 08-19 and 08-20'). The backups do not help grading/refills: slots are 08:00/09:30/12:00/15:00/16:45 PT with a 15-min window (src/lib/server/grading-progress.ts:55,57,124-129, `m >= sm && m < sm + windowMin`); 21:45Z and 00:00Z are 13:45/16:00 PST and 14:45/17:00 PDT - outside every window. docs/cron-jobs.md:62-66 puts the free tier at ~96-97 of 100 executions/day, so there is no room to add redundancy there.

**Impact.** If the cron-job.org row is disabled, rate-limited, deleted or its secret goes stale, MLB grading and refills stop entirely, football found-mode gets at most 2 passes a day, the weekly model fit never runs, and nobody is told. This already happened twice.

**Proposed fix.** Add a second, independent trigger plus a watchdog (see notes): a GitHub Actions workflow on main with `*/15 15-23,0-2 * * *` that calls /api/scheduler with the secret from a GitHub secret (the route is idempotent per slot/block), and a separate watchdog job that fails red when the heartbeat is stale. Move the weekly full fit to a vercel.json cron (`0 10 * * 0` -> /api/calibrate, Bearer auth already supported by cronHeaderAuthed) so it no longer depends on the external row.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code, with corrections; severity downgraded high -> medium.

What I checked and found true:
- vercel.json:8-25 has exactly four crons: /api/scheduler?poke=evening (45 21 * * *), ?poke=night (0 0 * * *), /api/nfl/lock sunday-early (0 16 * * 0) and sunday-standard (0 17 * * 0). No cron for /api/calibrate, /api/clv or any health route. app/api has no health/watchdog route, and a grep of app/, src/, .github/ for heartbeat/watchdog/last-tick finds only the client ledger-sync heartbeat (src/lib/ledgerSync.ts:277) - nothing records or checks scheduler liveness. None of the seven .github/workflows files poke /api/scheduler.
- The 15-min ticker, Sunday 10:00 UTC calibrate and CLV exist only as cron-job.org rows: docs/cron-jobs.md:19-23 (the auditor cited 15-19; the table is at 19-23 in the current file - the doc's own self-reference at :63 is stale by the same offset).
- Prior failures: docs/cron-jobs.md:7-14 (rows never created, carried as live for ten days) and src/lib/server/store.ts:114-116 (08-19/08-20 evening pokes dark). Both real.
- Slot maths: GRADE_SLOTS_PT = 08:00/09:30/12:00/15:00/16:45, window 15 min, `m >= sm && m < sm + windowMin` (src/lib/server/grading-progress.ts:55,57,124-129). 21:45Z/00:00Z = 13:45/16:00 PST and 14:45/17:00 PDT; 17:00 PDT misses the 16:45 window by its exclusive upper bound. Grading is only reachable through decideGradePass in the scheduler (app/api/scheduler/route.ts:340,371-372,394) and no other code calls /api/calibrate, so MLB grade passes and the weekly fit do stop if the external row dies.

Corrections that weaken the impact statement:
1. "MLB refills stop entirely" is wrong on found days, which is every day since FOUND_SINCE 2026-10-03 (src/lib/found-mode.ts:53,84-86). The scheduler uses decideFoundTick(now,"mlb") instead of the five refill slots (app/api/scheduler/route.ts:321-322), and FOUND_MLB_SLOTS_PT is hourly on the hour 08:00-18:00 PT (grading-progress.ts:191). The 00:00Z night poke is 16:00 PST / 17:00 PDT - a found MLB slot in both offsets - so the backup gives one MLB found pass a day (provided Vercel fires within 15 min of schedule; plan/precision could not be determined from disk). Block fires (route.ts:296, 396) and the lock self-check backfill (route.ts:211-293) are not slot-gated and also run on backup pokes.
2. Football "at most 2 passes a day" is accurate (FOUND_FOOTBALL_SLOTS_PT every 15 min 08:00-18:45 PT, grading-progress.ts:192; both backup times land on a slot), plus the two Sunday NFL lock pokes.
3. CLV is not external-only: any synced device with the app open nudges /api/clv (src/lib/ledgerSync.ts:281-288, "free redundancy under the cron-job.org schedule").
4. Manual fallback exists: the Refresh button POSTs /api/refill (src/lib/refill-client.ts:17; app/api/refill/route.ts:45-72), which runs the identical pass with slot "manual" for every desk. That is not a watchdog, but a silent outage is recoverable by one tap, and nothing but paper tickets is at stake.
5. The "~96-97 of 100/day, no room" claim is quoted from docs/cron-jobs.md:62-66, but the same doc says at :68-82 "DO NOT PRESENT THAT AS SETTLED" - it is inference from two contradicting paragraphs and the owner's dashboard is the ground truth. Treat as unverified, not as fact.
6. /api/calibrate has no football code (app/api/cfb/lock/route.ts:179,271), so the grading/weekly-fit half of the impact is MLB-only and dormant in mid-November; the live exposure today is football found-pass cadence dropping from ~44 to 2 a day with no alert.

Severity: medium, not high. Single point of failure with no liveness signal is real and has bitten twice, but it is paper trading, single user, manually recoverable, partially backed up (one MLB found pass, two football passes, client CLV nudge), and half the impact is off-season.

Fix corrections:
- A GitHub Actions `*/15` trigger is a poor second ticker for 15-minute slot windows: this repo's own measurements show scheduled runs arriving hours late (.github/workflows/props-history.yml:35 "0 17 -> 20:0x-20:5x"; :47-49), and schedules fire only from main, which lags frontend-rebuild (docs/cron-jobs.md:95-101). It is suitable as the stale-heartbeat watchdog (which needs the scheduler to first write a last-tick key - none exists today), not as a slot-accurate backup. It also needs the secret added as a GitHub secret by the owner.
- Moving the weekly fit to a vercel.json cron is sound: /api/calibrate accepts `Authorization: Bearer <CRON_SECRET>` through its own authed() (app/api/calibrate/route.ts:75-77), not through cronHeaderAuthed as the finding states; the 10-minute limiter (route.ts:121-125) makes a double fire harmless. Note the route is left open when CRON_SECRET is unset (route.ts:79-82).
- A cheaper slot-accurate backup than GitHub: widen the slot gate to a catch-up rule (fire a slot if it has not been stamped today and now is past it) so any late poke, including the two existing Vercel pokes, recovers missed grading/refill slots.

<a id="f-e1-9"></a>
#### E1-9 — Store traffic is unmetered and grows without bound: the grade pass re-reads every prediction day ever logged 5 times a day, year-round, and every poke reads three full ledgers

- Severity: medium. Area: scheduler and reliability. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** app/api/calibrate/route.ts:128 `SMEMBERS DAYS_SET`, :302-307 `for (const date of allDays) { ... const blob = await redisGetJson<DayBlob>(dayKey(date));` - one GET per logged date on EVERY run, grade-only included (:387 'written on EVERY run, grade-only or full'); the comment at :277-279 states the day blobs have no TTL and are never deleted. The grade pass is clock-only (app/api/scheduler/route.ts:340,372; slots at src/lib/server/grading-progress.ts:55), so it runs 5x/day in the MLB off-season too. Per poke, regardless of season (no season gate found: grep for seasonEnd/seasonStart/offseason in the lock/scheduler files returns nothing): MLB board GET (scheduler :173), block registry (:183, again via readMlbDay :326), full MLB ledger (lock-card.ts:1332 via :225), CFB ledger + bank and NFL ledger + bank (football-lock.ts:103-129 via cfb route :301 / nfl route :124). CLV adds a full-ledger GET every 30 min (app/api/clv/route.ts:72). 71 board dates are archived on disk (`ls data/boards | grep -c best.json.gz` in pl-history), so the per-run GET count is already of that order. Nothing reads or records Upstash usage.

**Impact.** Daily store bandwidth/commands rise linearly with season length and never fall, which is the failure mode behind the Oct-2026 plan-limit outage; the 60 s calibrate budget (calibrate/route.ts:42) is also consumed by sequential GETs that grow every day.

**Proposed fix.** Cache per-date graded rows once a date is fully settled and older than GRADE_DAYS (one compact `pl:pred:graded:<date>` or a single rolled-up key) and read raw day blobs only for the grade window; skip the grade forward when the last GRADE_DAYS dates have no pending rows (a tiny `pl:pred:pending` counter). Add season/slate gates so a sport with no games in +-2 days costs one small key read per poke. Record a daily command/byte counter in redis() (in-memory per invocation, flushed with one INCRBY) and expose it on the health route with a threshold alert at 70% of plan.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, with corrections. Paths relative to /private/tmp/claude-501/pl-audit.

CONFIRMED
- app/api/calibrate/route.ts:128 SMEMBERS of the day set; :302-307 one sequential redisGetJson per eligible date; the grade-only return is at :401, BELOW that loop, so every grade-only run pays the full re-read. Comment :277-279 confirms plain SET, no TTL, no DEL/SREM. The same run also reads the 6-date grade window + stranded dates a second time (:167-172) and the MLB ledger (:347).
- Grade pass is clock-only: decideGradePass (src/lib/server/grading-progress.ts:213-217) checks only the five slots (:55); scheduler forwards on gp.fire (app/api/scheduler/route.ts:340,372). No slate/season condition. grep for seasonEnd/seasonStart/offseason in scheduler, both football lock routes, lock-card.ts, football-lock.ts, refill.ts, grading-progress.ts returns nothing.
- Per poke, unconditional: board GET (scheduler :173), registry (:183, again in refill.ts:45), MLB ledger via lockExists (scheduler :225 -> lock-card.ts:1328-1332) and AGAIN via readMlbDay (refill.ts:46) - so the full MLB ledger is read at least twice per poke, one more than the finding counts. CFB/NFL ledger + bank read before any gate (app/api/cfb/lock/route.ts:301, app/api/nfl/lock/route.ts:125 -> football-lock.ts:103-129). CLV full-ledger GET at app/api/clv/route.ts:72, before the 'no locked card today' exit.
- No store command/byte metering: the only INCRBY counters are Odds-credit spend (src/lib/cfb/props-store.ts:261, src/lib/mlb/live-props-store.ts:138). redis() in src/lib/server/store.ts:45-62 records nothing.
- 71 best.json.gz files in pl-history/data/boards (first 2026-07-26, last 2026-10-17).

CORRECTIONS
1. 'Grows without bound' is overstated. A date enters the set only when a prediction write lands (app/api/generate/route.ts:764, app/api/predictions/route.ts:91), i.e. MLB slate days. In the off-season the set stops growing; the cost plateaus at ~N GETs x 5 runs/day and never falls, then resumes growing next season. Dates before CAL_START 2026-07-25 are skipped before the GET (:306, src/engine2/calibration.ts:657-660).
2. The finding's 'lock-card.ts:1332 via :225' means scheduler/route.ts:225; lock-card.ts:225 is readShapeCalibration (only on a lock write, scheduler :263).
3. Omitted mitigation: since 2026-10-12 store.ts gzips JSON values >= 2 KB on SET (src/lib/server/store.ts:17-38, PACK_WRITES true). That shrinks the ledgers, which are rewritten often. But it makes the day-blob half WORSE than stated: calibrate only re-SETs a day blob when a label or grade changed (:188, :270), so blobs for dates settled before packing went live were never rewritten and are still stored and re-read as plain JSON 5x/day. I found no repack/migration tool in app, src, tools or scripts. Day-blob size could not be determined from disk (cap is 3,000,000 bytes raw, generate/route.ts:73; 800 records per client write, predictions/route.ts:21).
4. The 60 s budget claim is weak today: ~80 sequential small GETs is seconds, not a timeout risk; it only matters over further seasons or with large blobs plus box fetches. Treat as secondary.
5. 'The failure mode behind the Oct-2026 plan-limit outage' is not provable from the checkout. store.ts:17 records a bandwidth near-limit warning on 2026-10-12; the cause of the later 403s cannot be determined from files on disk.
6. Football poke cadence could not be determined (docs/cron-jobs.md says the external scheduler account was not inspected), so the football per-poke cost is real per call but its daily multiple is unknown. MLB scheduler is 48 pokes/day and CLV 48/day per docs/cron-jobs.md:63-64.

SEVERITY: medium stands. It is paper trading, but the consequence already observed is the whole card going dark, and nothing would warn before it recurs.

FIX NOTES: the proposed fix is sound, with two cautions. (a) Stranded-date detection depends on the summary loop reading every eligible date (:151-160, :312-316), so only cache a date once it has zero pending rows, and the cached rollup must carry what gradedFromBlob, cohortDays and perDay need, not just graded picks. (b) Add a one-off repack of pre-2026-10-12 day blobs (read + SET through redis() packs them), which cuts bandwidth immediately without any logic change. Deduplicating the two MLB ledger GETs per poke (pass the entry from scheduler :225 into readMlbDay) is a cheap extra win.

<a id="f-e2-2"></a>
#### E2-2 — /api/odds proxy is an unauthenticated credit-drain: only the host and the markets x regions pair are validated, so any sport, the 10x historical endpoint and cache-busting params all pass

- Severity: medium. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/odds/route.ts:33-38 checks only `url.hostname === ALLOWED_HOST` and `shapeAllowed(url)`; :47-55 an unauthenticated call is served via `next: { revalidate: 240 }` keyed on the full caller-supplied URL (no auth is required for the cached path; with APP_PASSCODE unset even `fresh=1` is honoured, :49-50). src/lib/server/odds-shape.ts:49-57 `shapeAllowed` compares only `markets` and `regions`. There is no middleware.ts in the repo. Command: `node /private/tmp/claude-501/audit-out/areaE/shape-check.mjs` -> `historical us,eu sharp + cachebust  true` (URL https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/odds?regions=us,eu&markets=h2h,spreads,totals&date=...&zz=1) and `other sport us,eu sharp  true` (basketball_nba with &cb=123). The file's own header concedes 'B bounds the surface; it does not close it'. Related public spend surfaces: app/api/cfb/props/route.ts:26 and app/api/nfl/props/route.ts:35 call `footballPropsGet` with no auth, any `date` matching a regex (football-props.ts:172-173), no lease, and `dailyBudget: Number.POSITIVE_INFINITY` (src/lib/cfb/rules.ts CFB_PROPS).

**Impact.** Anyone who knows the URL can spend the account's Odds API credits: every distinct query string is a new cache key and a new billed upstream call (6 credits for a us,eu 3-market pull; historical odds are priced at 10x per market per region in the Odds API price list - that multiplier is from API documentation knowledge, not from a file on disk - i.e. ~60 credits per request, so ~1,700 requests would empty a 100,000 plan). With every in-app budget now infinite and no quota alert, exhaustion would silently stop all pricing on all three desks.

**Proposed fix.** In /api/odds: require the sync phrase / passcode for ANY upstream-reaching call, allow-list the path (`/v4/sports/(baseball_mlb|americanfootball_ncaaf|americanfootball_nfl)/(odds|events|events/<id>/odds)` only, never `/historical/`), and rebuild the upstream URL from an allow-list of params (regions|bookmakers, markets, oddsFormat) instead of forwarding the caller's string. Put a per-day finite ceiling and a lease on the public props routes, and restrict `date` to today..+7 days.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code; I could not refute the mechanism. Severity lowered from high to medium on impact grounds.

What I checked:
- app/api/odds/route.ts:33-38 — the only gates are `https:` + `hostname === ALLOWED_HOST` and `shapeAllowed(url)`. No path, sport or param check. :40-41 swaps in the server key (ODDS_API_KEY), so the caller needs no key of their own. :46-54 — auth only decides `no-store` vs `next: { revalidate: 240 }`; an unauthenticated call still does `fetch(url.toString(), …)` on the caller-built URL, so any URL not already in the data cache reaches the upstream. The header's claim at :16-17 ("an unauthenticated caller can never force an upstream fetch") is only true for a URL already cached. With APP_PASSCODE unset, :49 `(!pass || …)` honours `fresh=1` for anyone.
- src/lib/server/odds-shape.ts:49-56 — compares only `markets` and `regions`; :17 concedes "B bounds the surface; it does not close it".
- Re-ran `node /private/tmp/claude-501/audit-out/areaE/shape-check.mjs`: `historical us,eu sharp + cachebust  true`, `other sport us,eu sharp  true` — reproduced.
- No middleware: `git ls-files | grep -i middleware` is empty; next.config.ts has only a /media Cache-Control header; vercel.json has only crons and deploymentEnabled. No guard elsewhere on disk. (Vercel dashboard-level firewall / deployment protection cannot be determined from disk.)
- Props routes: app/api/cfb/props/route.ts:25-27 and app/api/nfl/props/route.ts:34-36 call footballPropsGet with no auth; src/lib/server/football-props.ts:172-173 accepts any date matching DATE_RE (:118); `syncAuthed` at :179 gates only `refresh=1`. dailyBudget is Number.POSITIVE_INFINITY at src/lib/cfb/rules.ts:479 and src/lib/nfl/rules.ts:199, so affordableEvents (src/lib/cfb/props-store.ts:309-314) never refuses. No lease/NX in football-props.ts or props-store.ts (grep empty).

Corrections / additions to the evidence:
1. The finding understates one hole: shapeAllowed returns true when `markets` is ABSENT (odds-shape.ts:51) and then never looks at `regions` at all. A `/odds` URL with no markets (upstream defaults to h2h) and any number of regions passes — a second way to enlarge the billed product, also valid on /historical/.
2. Cache-busting does not need junk params like `zz=1` (whether the upstream tolerates unknown params is not verifiable from disk). Legitimate params (`date` on historical, `commenceTimeFrom/To`, `eventIds`, `bookmakers`, `dateFormat`, `oddsFormat`) each mint a new cache key, so the vector does not depend on that assumption.
3. The props-route vector is narrower than a free-form drain but has a worse burst mode than stated: pulls are bounded by real slate events with an odds id and a settle-book price (src/lib/cfb/props.ts:381-386) and by Redis rail 1 (football-props.ts:249) once a board is written, BUT with no lease, N concurrent cold requests each read the same empty store and each fire up to maxEvents x ~31 credits (rules.ts:462, :481) before any board is written. That is the real exposure there, not arbitrary dates (dates with no priced events spend only the 6-credit slate call).
4. The 10x historical price and the "100,000 plan" figure are not on disk in the cited files; treat the ~1,700-request arithmetic as an estimate. "No quota alert" — I found no alerting code on quota in src/ or app/ (grep for quota + alert/push/notify returned only the usage tally at football-props.ts:491), consistent with the claim.
5. Not new to the owner: docs/branch-firing-audit.md:289 and :1389 already record /api/odds as UNGATED. What is new is the historical/any-sport path and the now-infinite budgets.

Severity: medium, not high. Exploitation is trivial but requires a hostile third party targeting an obscure personal paper-trading URL; no real money is at risk; damage is capped at the prepaid monthly credit plan (pricing goes dark on all desks until reset/top-up). No evidence on disk of it having been exploited. It is still the single cheapest way to take the whole product down, so it should not be rated low.

Fix caveats:
- "Require the passcode for ANY upstream-reaching call" will break current unauthenticated callers unless they are updated first: browser callers src/lib/fetcher.ts:25, src/engine2/sharpBoard.ts:135, src/lib/ufc.ts:86, src/lib/useAllStar.ts:65; server self-call app/api/clv/route.ts:50; and tools/snapshot_odds.py, tools/snapshot_props.py, tools/quota.mjs. docs/branch-firing-audit.md:1864 records that no current src/app file sends `x-pl-pass`. Sequence: ship the header in callers first, then gate.
- The path allow-list + canonical URL rebuild (fixed param set, reject /historical/, reject absent-markets-with-arbitrary-regions) is the part that can ship without breaking anything and removes the 10x and any-sport vectors. It does not close repeat polling of the legitimate shape every 240 s; only auth or a server-side daily ceiling does.
- The allow-list must keep whatever sports the existing callers use (UFC and All-Star callers exist; the UFC us h2h,totals shape is already rejected per the shape-check output, so check whether that caller is live before deciding).
- For the props routes, the lease matters more than the date window: a finite dailyBudget alone does not stop the concurrent-cold-request burst because every request reads spentBefore before any addSpend.

<a id="f-e2-3"></a>
#### E2-3 — Found-mode polling ignores time-to-start: football re-buys the game lines every 15 minutes all day and MLB re-buys the full props slate hourly

- Severity: medium. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/grading-progress.ts:191-192 `FOUND_MLB_SLOTS_PT = everyMinutes(8, 19, 60)` (11 passes) and `FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8, 19, 15)` (44 passes). app/api/scheduler/route.ts:134-136 forwards both football locks on every authed poke; app/api/cfb/lock/route.ts:357-366 and the NFL twin run `foundPassDate` on every found tick. src/lib/server/football-lock.ts:696-702 refuses for free only when no game is ahead or room < FOUND.minStake ($5, src/lib/found-mode.ts:70); otherwise :710 pays for a pull regardless of how far away kickoff is or whether any un-held bet remains. MLB: scheduler route.ts:322 `decideFoundTick(now, "mlb")` -> full generate; legacy/index.html:1350-1366 pulls the events list then up to 16 events (`.slice(0,16)`, :1359) x SH_PROP_MARKETS + SH_PROP_ALT (9 markets, :1157,:1162) plus batter_rbis,batter_runs_scored appended by src/lib/mlb/browse-markets.ts:7-16 (wired at app/api/generate/route.ts:393) = 11 markets, plus one us,eu game-lines call (:1257, regions set at generate/route.ts:404).

**Impact.** ESTIMATES (formula markets x regions; the 6-credit football pull was measured, football-lock.ts:404). Football: up to 44 x 6 = 264 credits/league/day; an NFL Monday or Thursday with one 17:15 PT kickoff is 38 pokes x 6 = 228 credits to re-price a single game. MLB in season: 6 + 16 x 11 = 182 credits/run x 11 hourly runs = ~2,002 credits/day = ~60,000/30 days, i.e. about 60% of the 100,000 plan for one sport, most of it re-buying props for night games that are 6-11 hours away.

**Proposed fix.** Cadence by time-to-start: one pass at open, then hourly until T-3h, then every 15-30 min inside T-3h, and only for events inside that window (per-event `commenceTimeFrom/To` or event-level calls). Skip the paid pull when the ledger shows no un-held (game, market) candidate. For MLB, re-pull props only for games starting within ~3 h of the slot and carry the stored rows for the rest (the football props path already does per-game carry via pricedAt).

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code; severity lowered from high to medium because the cadence is owner-authorised and the cost figures are upper bounds.

What I opened and verified (all cited lines match):
- src/lib/server/grading-progress.ts:191-192 — FOUND_MLB_SLOTS_PT = everyMinutes(8,19,60) (11 slots), FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8,19,15) (44 slots). decideFoundTick fires on the first tick in each slot window.
- app/api/scheduler/route.ts:135-137 — both football lock forwards start on every authed poke; :322 uses decideFoundTick(now,"mlb") on a found day.
- app/api/cfb/lock/route.ts:359,366 and app/api/nfl/lock/route.ts:175,182 — on a found day with an existing locked entry every found tick runs foundPassDate.
- src/lib/server/football-lock.ts:696-702 — the only free refusals are ahead===0 and room < FOUND.minStake (found-mode.ts:70 = 5); then a 5-min lease; then :710 slateFromEspn, the paid pull. No time-to-kickoff test and no "every (game,family) already held" test before paying; planFound runs only after the pull. foundPassDate has no same-slot/attempt cap.
- The pull is not absorbed by cache: src/lib/cfb/slate-server.ts:48 ODDS_TTL = 240 s vs a 15-min ticker, so each poke triggers a fresh upstream call. URL is regions=us,eu x h2h,spreads,totals (src/lib/cfb/rules.ts:367, src/lib/nfl/rules.ts:170) = 6 credits, matching the measured 6 at football-lock.ts:404. (The comment at grading-progress.ts:~180 saying "~3 credits" is wrong; the finding's 6 is right.)
- MLB: src/lib/server/blocks.ts:272-283 — on a found day decideTopUp drops the attempt cap; only owed >= $5, a pregame game left, and one buy per named slot bind. app/api/generate/route.ts:68 MAX_RUNS_PER_DATE = Infinity and :251 TOPUP_MAX is bypassed on found days. serverFetchJson (:81-96) is cache:"no-store". legacy/index.html:1157,1162,1257,1359 and src/lib/mlb/browse-markets.ts:7-16 (wired at generate/route.ts:393; regions us,eu at :404) are as described: up to 16 events x 11 markets + one 6-credit game-lines call, re-pulled in full every hourly slot with no per-game carry.

Corrections to impact:
1. MLB 182 credits/run is a formula CEILING (every market returned for 16 events). The code's own measurement is 114-150 per run on a 15-game slate (generate/route.ts:56-63), taken with 9 markets before the two browse markets were added (commit 62d5926, 2026-09-16); the event list also shrinks as games start (eligible = pregame + live pre-3rd). Realistic in-season cost is roughly 1,250-1,800/day (about 38-55k per 30 days), not a firm 2,002/60k. Still the largest single consumer.
2. MLB is out of season as of the audit date; with no pregame starts decideTopUp refuses free (blocks.ts:279), so the MLB spend is zero until next season. The live cost today is football only.
3. Football: 44 x 6 = 264/league/day is the ceiling for a day with a game still ahead at 18:45 PT. A single 17:15 PT kickoff gives 37 paying slots (08:00-17:00; the 17:15 poke lands at/after kickoff) = 222, not 228. Across a normal week (NFL ~3 game days, CFB ~4-5) that is roughly 7k credits/month combined, about 7% of the 100k plan. Days with no game cost nothing (ahead===0).
4. This is intended behaviour, not a defect: the cadence block at grading-progress.ts:170-186 quotes the owner ("more bets need to be made constantly all day long") and explicitly sizes hourly MLB against the 100,000-credit month; docs/credit-budget.md:1-3 records that the owner removed all application daily credit caps. Re-pricing also has some purpose (found mode looks for new +EV as lines move), so it is not pure waste.

Fix assessment: the proposal is sound as a cost optimisation. The cheapest high-value piece is a free pre-pull guard in foundPassDate (skip when every pregame game already holds every bettable family, or when no kickoff is inside a window) and per-game prop carry for MLB; per-game carry keyed on pricedAt does exist in the football props path (src/lib/server/football-props.ts:50-77, :265) and no commenceTimeFrom/To or eventIds filter is used anywhere today. Any cadence change alters an owner-stated rule, so it needs his sign-off rather than being treated as a bug fix.

<a id="f-e2-5"></a>
#### E2-5 — x-requests-last is never read and three spending routes read no quota header at all, so every per-call cost in the repo is an out-of-date estimate

- Severity: medium. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** `grep -rn "x-requests-last" src app tools` -> no hit in code (only prose at docs/credit-budget.md:184). app/api/generate/route.ts:81-101 `serverFetchJson` returns only `{ ok, body }` (fetch at :95); app/api/propsnap/route.ts:46-58 `oddsFetch` returns only the JSON; app/api/clv/route.ts:48-55 `viaProxy` returns only the JSON. Per-desk tallies infer cost from x-requests-used deltas across a 4-wide concurrent burst (src/lib/cfb/props-store.ts:322-330; CONCURRENCY = 4 at football-props.ts:119). Stale constants that contradict each other: `measuredCreditsPerEvent: 31` was measured 2026-09-05 when six prop markets were requested (football-props.ts:83-85, cfb/rules.ts:374-376) but the list is now 15 markets (cfb/rules.ts:606-607, nfl/rules.ts:295-296; grown by commits 9a6551f and 9c048d8 on 2026-09-19) and NFL was never measured; grading-progress.ts:179-180 says a football found pass is '~3 credits' against the measured 6; app/api/generate/route.ts:56 still says '114-150 Odds credits a run' while two markets were added (src/lib/engine-client.ts:178-179 says 172; formula gives 6 + 16 x 11 = 182); MLB live `rateMeasured: false` (live-props-rules.ts:144).

**Impact.** Nobody can state what a day costs: the largest spender (MLB generate) logs nothing, the football tally over- or under-counts by an unknown factor (31 vs a formula ceiling of 15 per event), and budgeting decisions (found cadence, liveReserveCredits 372/248) rest on numbers measured for a different request shape.

**Proposed fix.** Wrap every Odds API fetch in one helper that reads x-requests-last / -used / -remaining and appends `{at, route, sport, markets, cost, remaining}` to a per-day Redis list (one RPUSH); sum x-requests-last instead of delta-of-used; delete the 31 / 6 / 114-150 / 172 literals in favour of the measured rolling mean; surface the day total on the Settings page.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed by opening every cited file; I could not refute the core claim, but two parts of the impact are overstated and one path is wrong.

**Confirmed**
- `x-requests-last` is read nowhere in `src`, `app` or `tools`; the only hit is prose at docs/credit-budget.md:184.
- The three helpers discard response headers: app/api/generate/route.ts:81-101 (`serverFetchJson`, fetch at :95), app/api/propsnap/route.ts:46-58 (`oddsFetch`), app/api/clv/route.ts:48-55 (`viaProxy`). The generate route has no quota read at all; it only keeps run counters (`K_RUNS`, `K_MANUAL`, :55/:70).
- The football tally is `pullCredits` at src/lib/cfb/props-store.ts:322-330 (max minus min of `x-requests-used`, plus one `perEvent`), fed from a 4-wide burst (src/lib/server/football-props.ts:119, :480-491, :517).
- The repo itself says the delta is unreliable under concurrency: src/lib/mlb/live-props-store.ts:160-200.
- `measuredCreditsPerEvent: 31` is at src/lib/cfb/rules.ts:481 and src/lib/nfl/rules.ts:200, dated 2026-09-05 (docblock cfb/rules.ts:374-376). src/lib/nfl/rules.ts:180 says the NFL figure is the CFB measurement.
- The request is now 15 markets (cfb/rules.ts:607, nfl/rules.ts:296). `git log -S` shows the alternates arrived in 9a6551f (2026-09-19); 9c048d8 (same day) also touched cfb/rules.ts.
- "114-150" is at app/api/generate/route.ts:56 and repeated at :63, :185, :207, :346; `GEN_CREDITS_EST = 172` is at src/lib/engine-client.ts:178-179.
- The MLB allow-list has 11 prop markets (src/lib/server/odds-shape.ts:20-40), consistent with the 11-per-event term in the 182 formula. I did not verify the 6-credit slate term for MLB.
- `rateMeasured: false` is at src/lib/mlb/live-props-rules.ts:144.

**Corrections**
1. **Wrong path.** The "~3 credits" text is at src/lib/server/grading-progress.ts:179-180, not src/lib/grading-progress.ts. It does contradict the "6-credit slate call" at cfb/rules.ts:375 (three markets, `regions=us,eu` at :367).
2. **The stale constants no longer drive any budget.** Commit dfcb1fb (2026-09-19) set `dailyBudget: Number.POSITIVE_INFINITY` for CFB (cfb/rules.ts:479), NFL (nfl/rules.ts:199) and MLB live (live-props-rules.ts:153), and `MAX_RUNS_PER_DATE` is also infinite (generate/route.ts:67-68). So `affordableEvents` always returns `wanted`, and the 372/248 reserve subtracts from infinity. The claim that budgeting decisions rest on these numbers is wrong for football; the 31 only distorts the informational spend tally.
3. **One place the unmeasured rate still changes behaviour.** With `rateMeasured` false, every non-manual MLB live pass is capped at `probeEvents` = 3 (src/lib/server/mlb-live-quote.ts:660-661). The finding under-sells this.
4. **"Unknown factor" is too strong for multi-event football pulls.** With two or more readings the tally is the real delta, and the 31 enters only as the first-call add-back. It is a pure estimate only for single-event pulls (`fetched * perEvent`), or when another route spends during the burst.
5. **"Nobody can state what a day costs" is true per route, not in aggregate.** tools/quota.mjs does a free read and appends to data/quota-log.jsonl. It is manual, and the log in this checkout has 25 lines ending 2026-08-06, so the series is stale and has no per-route attribution.
6. **"Formula ceiling of 15" is not a trustworthy bound.** The repo's own measurement was 31 per event when the formula said 6 (cfb/rules.ts:374-376). The real per-event cost is simply unknown.

**Severity**
Medium holds, at the low end. This is an observability gap, not a wrong price or bet, and it is paper trading on a flat plan. It matters because every in-app credit ceiling was removed on 2026-09-19, so the stale tallies are the only spend signal left, and the largest spender (MLB generate) records none.

**Fix**
The proposed fix is sound. Add to it: flip `rateMeasured` and replace the MLB 6 once a real `x-requests-last` reading exists, since that is the one place the gap still throttles behaviour.

<a id="f-e2-6"></a>
#### E2-6 — The quota instrument is dead on the current plan and nothing alerts on low credits while every in-app ceiling is infinite

- Severity: medium. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** tools/quota.mjs:84 `export const PLAN_SIZE = 20_000;`, :85-90 `violatesIdentity` rejects any reading where remaining + used != 20,000, :114-115 'quota identity violated — NOTHING IS APPENDED'. docs/credit-budget.md:1-3 states the plan is 100,000 credits since Sept 19. data/quota-log.jsonl has 25 rows, the last `2026-08-06T00:14:32.457Z` (remaining 18030 / used 1970); `git log -- data/quota-log.jsonl` last commit 12ae04e 2026-08-05. Ceilings: `MAX_RUNS_PER_DATE = Number.POSITIVE_INFINITY` (app/api/generate/route.ts:68), `dailyBudget: Number.POSITIVE_INFINITY` in CFB_PROPS (src/lib/cfb/rules.ts), NFL_PROPS and MLB_LIVE_PROPS (src/lib/mlb/live-props-rules.ts:153). A failed Odds call is collapsed to `{ events: [], missing: true }` with no status distinction (src/lib/cfb/slate-server.ts:113) and the lock path just records an odds gap and retries next poke (football-lock.ts:711-713).

**Impact.** There has been no recorded quota reading for ~98 days. If the month's credits run out (or the key is drained through the public proxy), every desk degrades to 'odds missing' and keeps poking every 15 minutes with no alert - a silent outage of all paper betting, indistinguishable in the logs from a transient feed error.

**Proposed fix.** Set PLAN_SIZE from the first reading of the period (or 100_000) so the tool appends again; run the free `/v4/sports` read on the existing scheduler once a day and store it; send the existing Web Push alert when remaining < 15% of plan or projected run-out precedes the reset date; treat HTTP 401/429 from the Odds API as a distinct 'quota' state and stop paid polling for the day.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real; I could not refute any of the cited evidence, but severity is overstated and two details need correcting.

**Evidence confirmed (opened each file):**
- `tools/quota.mjs:84` has `PLAN_SIZE = 20_000`; `:85-90` `violatesIdentity` rejects any row where remaining + used != 20,000; `:114-115` throws "quota identity violated — NOTHING IS APPENDED" before the append. A reading on a 100,000 plan would throw.
- `docs/credit-budget.md:1-3` states the 100,000-credit monthly plan (Sept 19) and that Josh explicitly removed the daily budgets.
- `data/quota-log.jsonl` has 25 rows, the last `2026-08-06T00:14:32.457Z` (18030 / 1970). `git log --all` shows the last commit touching it is 12ae04e on 2026-08-05, on every branch in the clone. That is 98 days before today (2026-11-12).
- Infinite ceilings: `app/api/generate/route.ts:68`, `src/lib/cfb/rules.ts:479`, `src/lib/nfl/rules.ts:199`, `src/lib/mlb/live-props-rules.ts:153`, and also `src/lib/mlb/live-client.ts:60`.
- `src/lib/cfb/slate-server.ts:113` collapses any `!r.ok` to `{ events: [], missing: true }`; comments at `src/lib/server/football-lock.ts:503-506` and `src/lib/cfb/lock-server.ts:34` say 401/429/network are deliberately indistinguishable.
- `src/lib/server/football-lock.ts:711-718` only writes an odds-gap marker and says "the next refresh tries again".
- No low-credit alert exists. `src/lib/server/push.ts` is consumed only by the bet-alert, taken-feed and test paths (football-lock.ts:31, scheduler/route.ts:23, generate/route.ts:26, taken, push routes). A grep for low-credit / runway / quota-alert wording in `src` and `app` returned nothing. No workflow or script schedules `tools/quota.mjs`; it is referenced only by docs and `tools/burn-report.mjs`.

**Corrections:**
1. "Every desk ... no status distinction" is too broad. The MLB live-props path does distinguish 429 and has a circuit breaker that suspends automatic live pricing for the rest of the Pacific day (`src/lib/server/mlb-live-quote.ts:399, 534-545, 616-618`; key `pl:mlb:liveprops:429:` at `src/lib/mlb/live-props-rules.ts:256`). The collapse applies to the football game-lines and props pulls (`slate-server.ts:113`, `football-props.ts:132`). I did not trace the MLB `/api/generate` odds failure path.
2. The infinite ceilings are a recorded owner decision (`docs/credit-budget.md:3`, comment at `generate/route.ts:67`), not a defect. The defect is the missing visibility and alerting.
3. `tools/quota.mjs` was always a hand-run CLI, never a scheduled monitor. "Dead" is accurate in that it would now refuse to append, but no automated coverage was lost.
4. The odds-gap marker does make an odds failure distinguishable from "no-lock" after the fact (`football-lock.ts:143-155`). It cannot tell quota exhaustion from a transient error.

**Not verifiable offline:** whether the Odds API signals exhausted credits with 401 or 429. If it is 401, the MLB 429 breaker would not trip either, which supports the proposed fix of treating both as a quota state.

**Severity: medium, not high.** This is paper trading only, the plan has 5x the headroom it had, and the failure mode is a recoverable pause in pricing with nothing written, not data corruption. It stays above low because every in-app spend rail is now unbounded and no automated signal remains.

**Fix:** sound as proposed. Derive the plan size from the reading or set 100_000, schedule the free `/v4/sports` read daily, push below a threshold, and add a distinct quota state on 401/429 in `oddsPayloadOf`.

<a id="f-e2-9"></a>
#### E2-9 — Passive football props re-pricing is driven by page loads with no finite budget: live games re-buy up to 24 events every 10 minutes

- Severity: medium. Area: API credits and efficiency. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/rules.ts CFB_PROPS (:460-515): `maxEvents: 60`, `revalidateSec: 7200`, `liveRevalidateSec: 600`, `liveMaxEvents: 24`, `dailyBudget: Number.POSITIVE_INFINITY`, `measuredCreditsPerEvent: 31`. src/lib/server/football-props.ts:250 answers from Redis only while the board is fresh; otherwise :283-303 queues live games whose own pricedAt is older than liveRevalidateSec and upcoming games whose 2 h carry expired, on any GET of the public route (app/api/cfb/props/route.ts:26; `maxDuration = 300`). The 15 requested markets are at cfb/rules.ts:606-607. Upcoming games are re-bought every 2 h regardless of kickoff distance (same revalidateSec for a game 10 hours out and one 20 minutes out).

**Impact.** ESTIMATE (formula ceiling 15 markets x 1 region per event; the repo's own constant is 31): one full CFB Saturday pre-kick pass = 60 x 15 = 900 credits (1,860 at 31); with the app open through a 24-game live window, 6 passes/hour x 24 x 15 = 2,160 credits/hour, about 7,500 over 3.5 hours - 7.5% of the month from one afternoon, with nothing in the app able to stop it. In-play props usually return fewer markets, so the real figure is likely lower; could not determine without a live reading.

**Proposed fix.** Restore a finite daily ceiling sized to the plan (e.g. 100,000/30 minus the scheduled spend) with the existing live-reserve split; scale the upcoming-game window by time to kickoff (e.g. 6 h when > 6 h out, 2 h inside 6 h, 30 min inside 1 h); only request in-play markets that the paper card can actually act on for live games; add a lease so two concurrent loads cannot both pull.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed: every cited constant and code path is as described, and I found no guard that caps football props spend. The credit totals are unverifiable ceilings, and the proposed ceiling reverses a deliberate owner decision.

**What I checked**
- **Config:** `src/lib/cfb/rules.ts:460-515` has `maxEvents: 60`, `revalidateSec: 7200`, `liveRevalidateSec: 600`, `liveMaxEvents: 24`, `dailyBudget: Number.POSITIVE_INFINITY` (:479) and `measuredCreditsPerEvent: 31`. The market list at :607 has 15 markets.
- **Budget rail is inert:** `affordableEvents` (`src/lib/cfb/props-store.ts:309-314`) returns `wanted` for any spend when the budget is Infinity. The live-reserve split at `src/lib/server/football-props.ts:354-359` subtracts 372 from Infinity, so it never binds either.
- **Re-pricing logic:** `football-props.ts:283-303` queues a live game with rows once its own `pricedAt` is older than 600 s, and an upcoming game once its 2 h carry expires, with no kickoff-distance scaling.
- **Route:** `app/api/cfb/props/route.ts:25-26` is an unauthenticated GET with `maxDuration = 300` (:23).
- **No other stop:** there is no lease or lock in `football-props.ts` or `props-store.ts`, and no remaining-quota floor anywhere in `src` or `app`.

**Corrections to the evidence**
- **The trigger is stronger than "page loads".** `src/components/cfb/CfbProps.tsx:850-851` sets `refetchInterval: 60_000` with `refetchIntervalInBackground: false`. One visible Props or ranked view re-asks the route every minute, so the roughly 6 live passes per hour need no reloads. The comment at `src/lib/football/client.ts:121-123` ("NO refetchInterval anywhere — the route holds a daily budget") is stale on both counts. Polling stops when the tab is hidden.
- **A third uncapped driver is missing from the finding.** The settle-book-missing rule re-pulls an upcoming game every 30 min inside 4 h of kickoff when some market lacks a DraftKings quote (`rules.ts:468-470`, `settleBook: "draftkings"` at :476; `props-store.ts:207-219`). The repo's own docblock sized this at about 2,976 credits for 12 games.
- **NFL has the same exposure:** `src/lib/nfl/rules.ts:199` is also Infinity.
- **Scope of "no scheduler":** `vercel.json` crons do not call the CFB props route; they hit only `/api/scheduler` and `/api/nfl/lock`. The NFL lock route does call `footballPropsGet` server-side (`app/api/nfl/lock/route.ts:221`, :274).

**Corrections to the impact**
- **The cap removal was deliberate.** Commit dfcb1fb (2026-09-19, "Remove daily odds credit caps…") carries the comment "Josh, September 19: 100k/month plan; no application daily credit ceiling" (`rules.ts:478`). This is an owner-accepted exposure, not an accidental bug.
- **The 2,160 credits/hour figure is a ceiling.** It needs 24 simultaneously live games that each have stored prop rows. A live game whose last pull returned zero rows is held for 2 h (`football-props.ts:293-297`); the repo notes 29 of 46 priced games had no props on one Saturday.
- **Actual cost per event could not be determined.** The 31 figure was measured on 2026-09-05, and `pl-history` holds only MLB archives, with no football spend readings.

**Correction to the fix**
- Restoring a finite ceiling should go to the owner as a decision, since it undoes his 19 September instruction. The kickoff-distance window, the lease, and trimming in-play markets are compatible with that instruction.

Severity stays medium: the plan is flat-rate and paper-only, so the harm is exhausting the quota every desk draws on (the app has no remaining-quota floor), not money.

<a id="f-b3-10"></a>
#### B3-10 — Every calibrate run, including the five daily grade-only ticks, re-reads every day blob since 2026-07-25 inside a 60-second function

- Severity: medium. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/calibrate/route.ts:42 maxDuration = 60; :302-333 loops `for (const date of allDays)` and calls redisGetJson<DayBlob>(dayKey(date)) for every calibration-eligible date (CAL_START = '2026-07-25', src/engine2/calibration.ts:657); the 45-date window (:299) only limits which rows are fitted, not which are read. Grade-only mode (:137-147) takes the same path before returning at :401-413.

**Impact.** Redis reads and bandwidth grow linearly with the season (about 85 day blobs by mid-October, several times a day). This is the same store that hit the bandwidth problem fixed in b29961e and the 403 outage of 2026-10-18; it also risks the 60 s timeout, which would stop grading silently.

**Proposed fix.** Once a date has no pending rows, write a compact per-date graded projection (or per-market sufficient statistics) to its own key and read only that; read full blobs only for the last GRADE_DAYS dates and stranded retries.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed from the code; the evidence lines are exact. One impact claim is overstated and the size of the problem is unmeasured.

WHAT I CHECKED
- app/api/calibrate/route.ts:42 `maxDuration = 60`.
- :302 `for (const date of allDays)`, :306 skips only dates before CAL_START, :307 `redisGetJson<DayBlob>(dayKey(date))` for every eligible date, sequentially (await inside the loop).
- :299 `inWindow` (45 dates) is only tested at :329, after the read, so it limits what is fitted, not what is read.
- :147 sets gradeOnly; the only gradeOnly return is at :401, after the read-all loop and the ledger GET. Grade-only therefore pays the full read.
- src/engine2/calibration.ts:657 `CAL_START = "2026-07-25"`.
- Five daily ticks: src/lib/server/grading-progress.ts:55 GRADE_SLOTS_PT (08:00/09:30/12:00/15:00/16:45), forwarded at app/api/scheduler/route.ts:372, :400 and :416-421. decideGradePass is purely clock-based, and I found no off-season gate before the forward, so the passes continue on days with no MLB.
- No guard found: no cache, no MGET, no per-date projection key. The code states the design itself (:158-159 "the summary loop already reads every eligible date"; :323-324 "the only loop that reads every day blob").
- The route's own comment says nothing is pruned: plain SET, no TTL, no DEL/SREM on pl:pred:days.

WHAT MAKES IT WORSE THAN STATED
- The gzip fix only packs on SET (src/lib/server/store.ts:36-39, :50). Calibrate rewrites a day blob only when a grade or label changed (:187, :275). Day blobs written before packing went on (2026-10-12) and already outside the grade window are therefore still plain JSON and are read in full on every pass.
- b29961e addressed ledger reads in the scheduler; its diff does not touch the calibrate route.
- On top of the read-all loop, each pass re-reads up to 9 blobs in the grading loop (:172; GRADE_DAYS 6 + STRANDED_PER_RUN 3), so recent dates are fetched twice.

CORRECTIONS
- "Would stop grading silently" is overstated. Grades and labels are written per date in the first loop (:187, :275), before the read-all loop. A timeout there loses the learning-progress write (:399) and, on full runs, the summary, weights and stranded list, not the grades themselves. The scheduler does surface the forward's status (scheduler/route.ts:445-452), but nothing alerts on it.
- "About 85 day blobs" could not be confirmed: pl:pred:days lives in Redis. The on-disk board archive shows roughly 71 distinct dates from 2026-07-25 to 2026-10-17, so 70-85 is the plausible range.
- Day-blob size, and therefore actual bandwidth and timeout risk, could not be determined. No pl:pred blob exists on disk; these are inferences, not measurements. For scale only: archived boards average about 140 KB gzipped (pl-history/data/boards).
- Growth is linear only while MLB dates are being logged. Off-season the set is static, but it is still re-read five times a day for no new information.

SEVERITY
Medium stands. It is a real, unbounded read pattern on a store that has already hit a bandwidth limit and a 403 outage, but it is paper-trading only, causes no wrong numbers, and the magnitude is unmeasured.

FIX NOTES
- The proposed per-date projection must carry everything the loop derives from a full blob: gradedFromBlob rows, the cohortDay record (:319), the pending-row count for stranded (:313-316) and the per-day market counts (:324-326).
- Cheaper first steps: return early in grade-only mode when newlyGraded and labeled are both 0, reusing the stored progress; and reuse the blobs already loaded in the grading loop instead of fetching them again.
- A one-time re-SET of the old plain-JSON day blobs would gzip them. That is a production write and the owner's call.

<a id="f-e3-1"></a>
#### E3-1 — Ledger 'Pro scoreboard' never counts a graded ticket: it tests for "win"/"loss" but stored results are "won"/"lost"

- Severity: medium. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/components/mlb/ProScoreboard.tsx:93 `if (res.includes("win") || res.includes("loss") || res === "w" || res === "l")` and :95 `const won = res.includes("win") || res === "w"`. The stored grade vocabulary is won/lost: legacy/index.html:3636 (`"won":"lost"`), :3643 (`{result:"lost",payout:0}`), :3654 (`{result:"won",...}`); every other consumer uses those words (src/lib/ledger-stats.ts:51-52, src/lib/ticket-payout.ts:49,53, src/lib/bankroll.ts:103-104, src/lib/bet-alert.ts:128). "won" does not contain "win" and "lost" does not contain "loss". Panel is mounted on the MLB Ledger at app/ledger/page.tsx:690.

**Impact.** Accuracy of the record: the panel's 'Graded tickets' (ProScoreboard.tsx:163-165) is always 0, 'Verdict maturity' (:169) always 0%, and the calibration buckets (:174-192) never render, directly beneath tiles that show the true W-L. The one on-screen calibration check (did 60% tickets win 60%?) is silently dead, so the owner cannot see from the UI that the model's stated probabilities are not holding.

**Proposed fix.** Replace the substring test with exact matches: `const won = res === "won"; const lost = res === "lost"; if (won || lost) { graded++; ... }`. Add a unit test feeding one won and one lost ticket and asserting graded === 2.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED the defect; severity overstated (medium, not high).

What I checked:
- src/components/mlb/ProScoreboard.tsx:92-95 is exactly as quoted: `res = (g?.result ?? "").toLowerCase()`, then `res.includes("win") || res.includes("loss") || res === "w" || res === "l"`, and `won = res.includes("win") || res === "w"`. "won" contains neither "win" nor "w"-exact; "lost" contains neither "loss" nor "l"-exact. So the graded block never runs.
- Stored vocabulary is won/lost/push/void/pending/ungradable everywhere I looked: legacy/index.html:3636 (`"won":"lost"`), :3643 (`{result:"lost",payout:0}`), :3654 (`{result:"won",...}`), with the ticket grade written at legacy/index.html:3704 (`tickets[t.id]=g`); src/engine2/grade.ts:9 types result as "won"|"lost"|"push"|"void"|"pending"|"ungradable"; src/lib/ledger-stats.ts:51-52 reads `r.result === "won"` / `"lost"`. A grep of src/ and app/ for the literals "win"/"loss" returns ONLY ProScoreboard.tsx:93 and :95, and a grep of legacy/index.html for result:"win"/"loss"/"w"/"l" returns nothing. No writer of the alternate vocabulary exists, so there is no guard or legacy data path that rescues it (TicketGrade.result is typed plain `string` at src/lib/useLedger.ts:81, which is why tsc never caught it).
- Mount confirmed: app/ledger/page.tsx:40 import, :690 `<ProScoreboard entries={eraList} />`, directly under the tiles that render `{stats!.w}-{stats!.l}` (app/ledger/page.tsx:668) from ledgerStats.
- Consequences confirmed in the render: graded stays 0 (ProScoreboard.tsx:163-165 shows "0" with an empty W-L line), maturity `Math.round((0/500)*100)` = 0% (:169), buckets only get `b.n++` inside the dead block so `s.buckets.length > 0` (:174) is never true. No test references ProScoreboard (grep of tests/ found none). The bug has been there since the component was introduced (git log: 73087db, later touched by 6c50428).

Corrections to the finding:
1. The CLV half of the panel is NOT affected: the per-leg CLV loop (ProScoreboard.tsx:108-121) sits outside the dead `if`, so 'Avg CLV vs close' and 'Beat the close' still compute. Only 3 of the panel's elements are dead.
2. "The one on-screen calibration check" is overstated. A separate leg/market-level calibration read exists on the Stats page: src/components/stats/CalibrationPanel.tsx mounted at app/stats/page.tsx:634 (fed by useCalibration / engine2/calibration.ts), plus a SelectionCalibrationPanel at app/settings/page.tsx:450. What is lost here is specifically the TICKET-level predicted-vs-actual buckets and the '~500 bets' maturity gauge on the Ledger.
3. Severity: this is a display-only defect in one panel. It does not touch grading, payout, bankroll, staking, lock or the stored record; the true W-L is shown correctly a few lines above; the system is paper trading. It shows blank/zero rather than a wrong-but-plausible number (though "Verdict maturity 0%" is a false statement). Medium is the right level, not high.
4. Proposed fix is correct and minimal (`const won = res === "won"; const lost = res === "lost"; if (won || lost) {...}`); push/void/ungradable/pending correctly stay out of the graded count. Adding a unit test would require exporting `build` (currently module-private, and it fetches raw.githubusercontent.com per date) or extracting the tally into a pure function; the test as proposed cannot be written against the current exports without stubbing fetch.

Side observation (not part of this finding, not verified further): the same file's header comment and tile label still say Caesars/'CZ close' (ProScoreboard.tsx:10, :158) and the per-leg CLV reads `l.cz`, while the footer text says DraftKings (:197).

<a id="f-e3-3"></a>
#### E3-3 — Every MLB Ledger number is recomputed in the browser from localStorage, and the CLV tile/projection ignore the era and core/fun filter the other tiles use

- Severity: medium. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/ledger/page.tsx:433-434 `eraList = eraEntries(api.entries, era)`, `stats = ledgerStats(eraList, scope)`; :435-436 `proj = api.projection`, `clv = api.clv` (not filtered). src/lib/useLedger.ts:104 `entries = shLedger().filter(e=>e.locked)`, :106 `clv: shClvStats()`, :107 `projection: shProjection()`. legacy/index.html:3335 shLedger reads localStorage `pl_ledger`; :3930-3941 shClvStats iterates every locked entry, core and fun together. src/lib/ledger-stats.ts:37-83 is the only P/L/ROI/record computation and it runs client-side. No server endpoint returns a settled report (app/api has ledger, taken, clv, calibrate but no report route).

**Impact.** Accuracy: P/L, ROI, record and drawdown come from the device's local mirror, so two devices (or a device that has not synced) can show different records for the same stored ledger. The 'CLV (last-seen)' tile at app/ledger/page.tsx:677-685 sits in the same row as era- and scope-filtered tiles but covers the whole ledger and both buckets, so the row mixes populations without saying so.

**Proposed fix.** Add one server report endpoint (e.g. /api/report) that reads the three stored ledgers and returns staked, returned, P/L, ROI, W-L-P, pending, CLV per sport, per book (DK / FD / combined) and per era. Have every ledger page render that payload; keep the client computation only as an offline fallback and label it as such. Pass `eraList` and `scope` into the CLV computation.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The cited evidence is real, but "high" is overstated and one supporting claim is wrong. I rate it medium, and only the CLV tile part carries that.

**Confirmed in code**
- `app/ledger/page.tsx:433-434` filters by era and scope (`eraEntries(api.entries, era)`, `ledgerStats(eraList, scope)`), while `:435-436` take `api.projection` and `api.clv` unfiltered.
- `src/lib/useLedger.ts:104-107` builds entries, clv and projection from the legacy engine (`shLedger`, `shClvStats`, `shProjection`).
- `legacy/index.html:3335` reads localStorage `pl_ledger`. `:3930-3941` `shClvStats` walks every locked entry and `e.core.concat(e.funT)`, so it covers all eras and both buckets.
- The tile at `app/ledger/page.tsx:677-685` is labelled only "CLV (last-seen)" with "x/y legs sighted pre-pitch". It sits beside ROI, Record and Max drawdown, which are era- and scope-filtered.
- The page only offers core or fun (`:400`) and defaults to era "current" (`src/lib/ledger-stats.ts:20`), so the CLV tile never matches the slice the other tiles show. It always blends the 8/15–9/3 era and both buckets.
- `src/lib/ledger-stats.ts:37-83` is a pure client-side port of the stats computation.

**Corrections to the finding**
1. **"No server endpoint returns a settled report" is not accurate.** `app/api/digest/route.ts:8-12, 19-26` computes 7-day staked, P/L and CLV by segment server-side from the cloud ledger (`pl:ledger:v1`) via `ledgerSegments`. It is MLB-only and 7-day, not a full per-era or per-book report, so the gap is narrower than stated.
2. **The device-divergence impact is overstated.**
   - `src/lib/ledgerSync.ts:9-17` does pull → merge → push on open, on tab return, after any local change and on a heartbeat (`:292-323`).
   - The server merges append-only (`app/api/ledger/route.ts:10-14`).
   - `useLedger` recomputes on `SYNC_EVENT` (`src/lib/useLedger.ts:92-96`).
   - The page shows a `SyncChip` with sync state and locked-day count (`app/ledger/page.tsx:87-120`).
   - `ledgerStats` is deterministic over the entry list, so synced devices agree. Divergence needs sync off, misconfigured, or the store unreachable, and the chip shows that state. This part is an architecture observation, low on its own.
3. **The projection half is currently dead.** `shProjection` returns null once the days to `SH_CFG.seasonEnd` reach 0 (`legacy/index.html:3984-3986`), and `seasonEnd` is "2026-09-27" (`legacy/index.html:1155`). The panel at `app/ledger/page.tsx:723` does not render today. Using every locked ticket as the replay profile was the legacy design, and the panel title says what it simulates.

**Severity**
The real defect is the CLV tile's unlabelled population mismatch: the tile reads as "CLV for this era and bucket" but is whole-ledger. This is paper trading, the number is display-only, and no staking or locking logic reads it.

**Fix**
The minimal fix is to compute CLV over `eraList` and `scope` in a pure helper next to `ledgerStats`, or to relabel the tile "all eras · core+fun". A new `/api/report` endpoint with per-book splits is a feature request, not needed to fix this.

<a id="f-e3-4"></a>
#### E3-4 — 'Beat the CZ close' compares a DraftKings locked price with a Caesars close fetched in the browser from an archive that stopped on 2026-10-28

- Severity: medium. Area: front end. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/components/mlb/ProScoreboard.tsx:17 `RAW = "https://raw.githubusercontent.com/.../line-history/data/props"` fetched client-side per entry date (:73); :50 closeFor reads the archive row's `cz`; caption 'Beat the CZ close' (:158); footer says 'your locked DraftKings price' (:195); header comment says 'our locked Caesars price' (:10). Per prior-audit-regression.md the archive `cz` column is the williamhill_us quote (tools/snapshot_props.py:27, not re-opened by me). baseline.md records the props archive ending 2026-10-28. Settlement book is DraftKings: src/lib/sportsbook/books.ts:12.

**Impact.** Accuracy: the closing-line-value figure in this panel is cross-book (DraftKings entry vs Caesars close), which is not CLV, and for any card after 2026-10-28 there is no close to compare so coverage is zero. Combined with the graded-count bug the whole panel is unreliable.

**Proposed fix.** Stop reading the raw GitHub archive from the browser. Serve closes from the server's own CLV sightings for the book the bet was recorded at (DraftKings or FanDuel), label the column with that book, and show the coverage count (n legs with a close / n legs).

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but severity is overstated and one impact claim is wrong.

CONFIRMED (opened each file):
- src/components/mlb/ProScoreboard.tsx:17 RAW points at raw.githubusercontent.com .../line-history/data/props; :73 fetches `${RAW}/${date}.json` in a "use client" component, once per entry date.
- :50 closeFor reads the archive row's `cz` side as czClose; :116-118 counts `dec(l.cz) > dec(close.czClose)`; tile caption "Beat the CZ close" at :158; footer "your locked DraftKings price" at :195; stale header comment "our locked Caesars price" at :10.
- tools/snapshot_props.py:27 `CZ = "williamhill_us"`, and :91-92 writes `r["cz"]` only when `bk["key"] == CZ`, so the archive `cz` field is the Caesars quote.
- The ledger leg's `cz` is the settlement-book price: src/lib/sportsbook/books.ts:12 SETTLE_BOOK = 'draftkings'; src/engine/index.ts:23 and :297 rebind the legacy CAESARS_KEY; src/lib/server/lock-card.ts:129 calls it "a DraftKings (cz)" price. So for legs locked since the DraftKings switch (INSTRUCTION 67, 2026-09-17) the tile compares a DraftKings entry with a Caesars close.
- The component is live: app/ledger/page.tsx:40 imports it and :690 renders `<ProScoreboard entries={eraList} />`.
- Archive: /private/tmp/claude-501/pl-history/data/props runs 2026-07-12.json to 2026-10-28.json (103 files); last props commit 995f5a9 on 2026-10-28 23:42Z. The 10-28 file has 281 of 570 rows with a `cz` value.

CORRECTIONS:
1. Only one of the four tiles is cross-book. "Avg CLV vs close" (:113-115) uses the archive's cross-book de-vigged `fair` minus the implied probability of the locked price, which is what the footer at :195 describes. The finding's "the whole panel is unreliable" does not follow from this evidence.
2. The mismatch does not apply to every leg. The v1 era (2026-08-15 to 09-03, src/lib/ledger-stats.ts:17) and the first days of the current era (from 09-04, :16) were locked at Caesars, so those are like-for-like and the "CZ" label is right for them. The current-era figure is a blend of same-book and cross-book comparisons, with no settlement-book stamp consulted.
3. "The archive stopped on 2026-10-28, so coverage is zero after" is overstated. The archive is MLB-only (tools/snapshot_props.py:24 MARKETS, :299 baseball_mlb events) and the script returns when there are no events (:299-302). The gaps on 10-21, 10-22 and 10-25 followed by a 10-28 end look like a postseason schedule ending, not a broken job. I could not determine the last MLB game date without network. The panel only scores MLB props (MKT_OF at :24-33), so there are probably no later MLB legs to cover. Coverage is also already disclosed on the panel ("{clvCovered}/{clvN} legs covered", :155).
4. The "graded-count bug" the finding leans on is a separate finding; I did not verify it here.

SEVERITY: medium, not high. It is a mislabelled, mixed-book display metric on one tile of a paper-trading panel. It does not feed staking, grading or card selection. It matters more now because the owner cannot bet Caesars in Arizona, so a Caesars close is irrelevant, and the tile will keep comparing against Caesars next MLB season unless changed.

FIX: the proposed direction is sound. A smaller option: compare against the same book's close. The archive already stores per-book pairs in `fp` (tools/snapshot_props.py:78-88, :112), so a DraftKings or FanDuel close is recoverable from existing files for rows where that book posted both sides. Relabel the tile with that book, show its own n, and fix the comment at :10. The server CLV path already keys on the leg's settlementBook (src/lib/server/clv-core.ts:169, :183, :236) if a server-side source is preferred.

<a id="f-p-6"></a>
#### P-6 — HR one-sided fair price still uses a hard-coded 1.06 overround against a measured 1.161

- Severity: medium. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** legacy/index.html:2491 `var fair=oneImp/1.06` and :2605 `iO/1.06`; /private/tmp/claude-501/pl-history/data/hr_overround.json: days 87, rows 7581, appeared overround 1.1609, verdict "overround 1.161 vs the hardcoded 1.06 -> czEV overstated ~6.2pp". docs/collection-period.md:1217 heading records it as measured and not changed. Mitigation today: HR is barred from the core (legacy/index.html:3005-3006) and the found card (src/lib/server/lock-card.ts:1143).

**Impact.** Every HR-anytime row's fair probability and EV is overstated by roughly 6 points wherever it is displayed (Board, generator, manual slips). HR-anytime is one-sided at both DraftKings and FanDuel, so for a two-book Arizona bettor this is the price basis for the whole market; any decision to let HR back on the card would ride an inflated edge.

**Proposed fix.** Replace the constant with the measured value read from data/hr_overround.json (refreshed by the existing Sunday hr-overround workflow), with 1.16 as the fallback, and store the value used on the row.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-7"></a>
#### P-7 — M10 walk-rate shrinkage was specified and built only in the shadow path; live expected-AB is still unshrunk

- Severity: medium. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** Live: legacy/index.html:2308-2309 `var bbr=shBlend(st,...,"ab",10)||0.09; var expAB=pa*(1-shClamp(bbr,0,.25,"2309")*0.9);`. Specified fix `shShrink(bbr, n, k~75, lgBB)` (docs/freeze-exit-bundle.md:58) exists only in the shadow block at legacy/index.html:2434.

**Impact.** The audit measured about 12 pp of residual span across expected at-bats 3.0-4.6 on the hits board, the largest structure on that board. Hits and total-bases overs for low-walk hitters stay overpriced and high-walk hitters underpriced.

**Proposed fix.** Move the shadow's shrunk walk rate into the live expAB line behind a flag, replay on archived boards, then arm it.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-8"></a>
#### P-8 — M4, M6, M7+M9, M12 simulator-routing and distribution defects never shipped

- Severity: medium. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** legacy/index.html:2389-2396: the pregame sim marginal replaces the closed form only for batter_hits_runs_rbis (M4 TB/HR routing absent; M12 sim-vs-closed-form heat unresolved). No strikeout-count outcome in the sim (M6); the only per-starter sim output is outsBySP* at :1854-1871. legacy/index.html:1543 shPOver is unchanged Poisson (M7+M9 held, docs/freeze-exit-bundle.md:57).

**Impact.** Pitcher strikeouts, a market the found card bets, is priced with no simulation of the quantity and its same-game combinations fall back to a naive product; total bases and HR stay on the closed form the audit showed disagreeing with both the sim and the market. Bounded per row, but it touches most of the MLB board.

**Proposed fix.** Take these in the register's own order after M2/M10/M11: add strikeouts as a sixth plate-appearance outcome with a second RNG stream, then route TB to the sim, and settle the Poisson-vs-binomial question from graded outcomes by expected-AB tercile as the register specifies.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-9"></a>
#### P-9 — M13: props archive still omits alternate lines and still records Caesars as the settlement book

- Severity: medium. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** tools/snapshot_props.py:24 MARKETS = six standard keys, no *_alternate; :27 `CZ = "williamhill_us"`; request at :323 `regions=us`; identical lines in /private/tmp/claude-501/pl-history/tools/snapshot_props.py. Settlement book in the app is DraftKings (src/lib/sportsbook/books.ts:12). Six props-history crons remain active (.github/workflows/props-history.yml:35-49).

**Impact.** The stored history cannot answer what DraftKings and FanDuel offered on the alternate ladders the engine prices, and the archive's settlement-price fields (cz/czf) describe a book the owner cannot use, so any backtest or closing-line study built on it is against the wrong book. Credits are still being spent to collect it.

**Proposed fix.** Add the three alternate keys to MARKETS, change CZ to draftkings (or store DraftKings and FanDuel explicitly as named fields), stamp a schema version on each file, and add the register's guard that the sweep list is a superset of the engine's market list.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-10"></a>
#### P-10 — M28 passcode is still write-only, and /api/calibrate still allows any caller when CRON_SECRET is unset

- Severity: medium. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** app/settings/page.tsx:328 and :361-362 read/write localStorage `pl_pass`; grep for `pl_pass|passHeader|x-pl-pass` in app and src returns only those plus the two server readers app/api/odds/route.ts:49 and app/api/sharp/route.ts:70 - no client sends the header and src/lib/pass.ts does not exist. app/api/calibrate/route.ts:76-84 ends `return !cron` (open when CRON_SECRET is not configured), while app/api/scheduler/route.ts:156 documents that as the pattern it had to fail closed against.

**Impact.** If APP_PASSCODE is set, the app's own fresh-odds and Sharp requests are refused (the client can never present it); if it is not set, those endpoints, which spend Odds API credits, are open to anyone with the URL. An unauthenticated caller can also trigger the calibration fit. Whether either secret is set in production could not be determined.

**Proposed fix.** Add the specified passHeader() helper and spread it into the six fetch sites, or remove the passcode UI and document the endpoints as open. Make /api/calibrate fail closed like the scheduler.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-11"></a>
#### P-11 — Weekly calibration refit depends on an external scheduler that cannot be seen from the repo; the in-repo scheduler only grades

- Severity: medium. Area: prior audit regression. Auditor confidence: low. Verification: not-verified (regression table). Status: open.

**Evidence.** vercel.json has no /api/calibrate cron (four crons only: scheduler evening/night, nfl lock sunday-early/standard). docs/cron-jobs.md:22 lists the full fit as a cron-job.org job (Sundays 10:00) the owner was creating on 2026-08-06. The scheduler forwards only `/api/calibrate?grade=only` (app/api/scheduler/route.ts:416-418), which by design skips the summary and weight writes (app/api/calibrate/route.ts:138-147).

**Impact.** If the external job was never created or has stopped, the calibration summary and blend weights silently stop updating while grading continues, and the engine keeps blending with stale multipliers. No in-repo heartbeat for the fit was found. Status: CANNOT VERIFY.

**Proposed fix.** Stamp the last full-fit time into the board echo and alert when it is older than eight days; or move the Sunday fit into vercel.json so its schedule is version-controlled.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-12"></a>
#### P-12 — H+R+RBI suspension (autopsy fix 3 / Phase 2) lifted on all three generators; the suspended-market tagging is now inert

- Severity: medium. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** Engine default `hrrAltMax:-1` (whole market suspended, legacy/index.html:1087) is overridden to 99 by src/lib/paper-mode.ts:133-143 at app/api/generate/route.ts:438, app/api/scheduler/route.ts:255, src/lib/engine-client.ts:125; tagging site legacy/index.html:2524 therefore never tags an HRR row. The found card blocks only HRR overs (src/lib/server/lock-card.ts:1144). The lift's stated basis is 58.5% hit vs 57.2% implied over 1,010 graded legs (comment in src/lib/paper-mode.ts:133-143), while the later core diagnostics in the same file record HRR overs hitting 54% against 61% implied on 121 of 231 core legs (src/lib/paper-mode.ts:190-204 comment).

**Impact.** The market the prior audit called its most mispriced is back in the engine's parlay pool, the generator and the ranked lists without a suspended tag, and HRR unders can be seated on the found card. The shadow-cohort measurement the suspension was meant to produce no longer accumulates.

**Proposed fix.** Either restore the tag for HRR overs (so they show as suspended everywhere, matching what the found card already enforces) or record an explicit retirement of the suspension with the current graded numbers by side.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

### A.2 Low findings

<a id="f-a-5"></a>
#### A-5 — Model context and priors frozen at 2026-07-29 were applied for the rest of the season with no vintage check; the bullpen-fatigue factor is still live on that stale file

- Severity: low. Area: data integrity. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** public/model/context.json: `generated_at 2026-07-29T20:31:58+00:00`, `date 2026-07-29`, `bullpen_last3` for 30 teams; public/model/priors.json: `generated_at 2026-07-29T15:58:41+00:00`. .github/workflows/context.yml commits only `data/ump_k.json` ("context.json commit PAUSED 2026-07-29"). app/api/generate/route.ts:362-366 loads both files `no-store` with no comparison of their date to the slate date. legacy/index.html:1663-1669 `shPenF` reads `SH_CTX.bullpen_last3` with no date check (clamp 0.96-1.05) and is applied at :2114 `penH=shClamp(shPenF(g.home)*shPenQF(g.home),0.92,1.10,...)`. By contrast umpire K and pen quality are pinned off (legacy/index.html:1135 penQFrozen, :1147 umpKFrozen). legacy/index.html:1600-1603 `shUmpCtx` matches context games by team names only, no date.

**Impact.** Accuracy: every MLB board after 2026-07-29 adjusted run expectation by up to -4%/+5% per team from bullpen workloads of 27-29 July - noise presented as signal - and batter/pitcher priors stopped updating for the final two months and the postseason. Bounded by the clamps, but it biases totals/ML/RL and K/outs inputs on every slate.

**Proposed fix.** In the loader, compare `ctx.date` to the slate date and drop `bullpen_last3` (factor 1) and per-game context when they differ; refuse priors older than N days or stamp the board with `contextDate`/`priorsGeneratedAt` and surface it in the gaps list. Either resume the writer or pin `shPenF` off the same way ump K and pen quality are pinned.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real but the impact is overstated, so I downgrade it from medium to low. The staleness is the direct result of an owner-signed-off pause, and the bullpen factor reaches far less of the board than claimed.

**Evidence confirmed (all opened):**
- `public/model/context.json` has `generated_at 2026-07-29T20:31:58+00:00`, `date 2026-07-29` and `bullpen_last3` for 30 teams. `public/model/priors.json` has `generated_at 2026-07-29T15:58:41+00:00`, season 2026, 608 batters, 761 pitchers.
- `git log -- public/model/` shows the last commits are 64c42ad and 671aed9, both 2026-07-29; checkout HEAD is 2026-11-12. The files were never refreshed.
- `.github/workflows/context.yml:30-33` adds only `data/ump_k.json` ("context.json commit PAUSED 2026-07-29"). `.github/workflows/model.yml:7-10` has the schedule commented out with the same pause note.
- `app/api/generate/route.ts:362-366` fetches both files `no-store`; `:380`, `:397-398` parse them and set `SH_PRIORS`/`SH_CTX` directly, with `sim: true`. Grep of `app/` and `src/` finds no comparison of `ctx.date` or `generated_at` to the slate date.
- `legacy/index.html:1663-1669` `shPenF` has no date check and no frozen flag, and is applied at `:2114`. `src/engine/legacy-src.gen.ts` carries the same function.
- `penQFrozen` and `umpKFrozen` are pinned true at `legacy/index.html:1135` and `:1147`. `shUmpCtx` (`:1600-1603`) matches on team names only, but its live consumer `shUmpKf` is pinned off, so it only feeds shadow logging.
- No guard found elsewhere. `docs/collection-period.md:1739` and `:4472` state `shPenF` is "100% production-active" and "not pinned".

**I recomputed the frozen factor** from the file using the `shPenF` formula: 29 of 30 teams are non-identity, range 0.96 to 1.05, with 4 teams pinned at the 1.05 cap and 1 at the 0.96 floor. Those constants were applied to every later slate.

**Corrections to the impact:**
1. **This was not an accident.** The pause was deliberate and owner-signed-off (`docs/collection-period.md:338-412`, "THE BOT PAUSE"), with its effect on prediction quality recorded as "UNMEASURED, not zero" (`:371-374`). The actual defect is narrower: the pause was specified for a collection window (mid/late August dates in the doc), was never reversed through season end, and `shPenF` was left unpinned while its two sibling context factors were pinned.
2. **"Biases totals/ML/RL and K/outs on every slate" is wrong for the bullpen factor.** `shPenF` is sim-only: it is the `bpF` argument to the vs-bullpen `batVec` at `legacy/index.html:2114-2118`, reached only when both lineups have 9 or more and both probables are posted (`:2108-2109`). `docs/collection-period.md:4534` and `:4586` measure it reaching 33 of 200 batter rows (16.5%) on one slate and no pitcher row ever. The server cron comment at `app/api/generate/route.ts:407-410` says the sim path barely engages at 16:00 UTC. It never touches K/outs rows.
3. **The K/outs exposure comes from the stale priors, not the context file.** `shPriorKf` runs in the K closed form (`docs/collection-period.md:4538`). These are season-level Statcast skill priors with about four months of data at the freeze, so drift is slow; players debuting after 07-29 simply get no prior.
4. **Partial provenance exists.** The board echoes `priorsSha`/`ctxSha` (`app/api/generate/route.ts:513-514`), which gives attribution but is not a staleness guard. `app/settings/page.tsx:294` shows the context `generated_at` as time only, hiding the date.

**Why low:** paper trading only, clamped to -4%/+5% on vs-bullpen plate appearances in sim-priced batter rows, and the freeze itself was a documented decision.

**Fix:** the proposed fix is sound. The cheapest version is a `penFFrozen` pin matching the other two, or a `ctx.date !== slate date` guard returning 1 in `shPenF`. Either is an engine-behaviour change under the repo's freeze convention, so it needs the owner's sign-off. Before next season, also check `priors.season` against the slate season: `legacy/index.html` never reads `SH_PRIORS.season` or `generated_at`, so 2026 priors and 07-29 bullpen loads would apply on 2027 opening day unless the writers are resumed.

<a id="f-a-6"></a>
#### A-6 — MLB lock uses the request-START clock for board time, ticket time and the started-game test, and has no quote-age gate

- Severity: low. Area: data integrity. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** app/api/generate/route.ts:144 `const now = Date.now();` taken before the odds pull; :442-443 `collectSlate()` then `analyze`; :518 `encodeBoard({ date, at: now, data })`; :635-639 `buildLockEntry` with the same `now`; :454-468 started-game stamp is "Recorded, never enforced". src/lib/server/lock-card.ts:1097-1103 `startedGkey` compares game start to that `now`; :1196-1222 the ticket stores `foundAt: now` and no quote time. `grep -n 'last_update|bookQuotes|maxAge|stale|ageMin|board.at' src/lib/server/lock-card.ts` returns no matches. The scheduler backfill does gate on board age (app/api/scheduler/route.ts:225-296, `ageMin <= 30`), the primary path does not. Measured mitigation: `python3 /private/tmp/claude-501/audit-out/areaA/dk_age.py` over 28 archived board-days since 2026-09-17: 26,721 DK sides, age (board.at - DK last_update) p50 0.3 min, p99 1.2, max 8.7, none over 30 min, 467 negative (quote newer than the board's own timestamp, proving `at` precedes the fetch).

**Impact.** Record integrity, bounded: a game that starts while the slate is being collected still tests as not-started and can be locked at a price that is already in-play or suspended, labelled pregame; `foundAt` understates when the price was seen. If the feed ever stalls there is no guard at all. Archived data shows quotes were fresh in practice, hence medium.

**Proposed fix.** Re-read `Date.now()` after `collectSlate()` and use it for board `at`, `foundAt` and `startedGkey`; require start > lockNow + a safety margin (e.g. 2 min); require the DK quote's `last_update` to be within N minutes and persist it on each leg.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but I would downgrade to low: the race is real and unguarded, yet the window is about a minute, no archived board shows it happening, and this is paper trading.

**What I confirmed**
- `app/api/generate/route.ts:144` takes `const now = Date.now()` before any pull; `collectSlate()` and `analyze` follow at :445-446 (the finding cites :442-443).
- The same `now` feeds the started-game stamp (:464-468, "Recorded, never enforced" at :461), `gen.at` (:479), `encodeBoard({ date, at: now, data })` (:518) and `buildLockEntry` (:635-646).
- `src/lib/server/lock-card.ts:260` routes every day from 2026-10-03 to `buildFoundLockEntry`. Its `startedGkey` (:1099-1103) tests `start > now` with that request-start clock, and it is the only time test in the candidate filter (:1142).
- Each ticket stores `foundAt: now` (:1225, not within the cited :1196-1222). Legs keep only lkey/label/prop/cz/gkey (:1221), so no quote time is persisted.
- A grep of lock-card.ts for `last_update|bookQuotes|maxAge|stale|ageMin|board.at` returns nothing.
- The scheduler backfill does gate on board age over 30 min (`app/api/scheduler/route.ts:233-235`).
- The omission on the primary path is deliberate: route.ts:561-563 says lockMaxAgeMin is "NOT APPLICABLE on this path (prices were fetched by this same run — fresh by construction)". That covers fetch time, not the book's own `last_update`.

**No guard elsewhere closes it**
- The engine's `live` flag comes from the statsapi schedule read at the start of `collectSlate` and needs a non-pregame status plus inning >= 1 (`src/engine/legacy-src.gen.ts`, the `var phase=` block). A game that starts mid-collection is not flagged.
- I found no minimum-lead guard in `src/lib/server/blocks.ts` or `app/api/scheduler/route.ts`.

**Data checks**
- Re-running `audit-out/areaA/dk_age.py` reproduced the numbers exactly: 26,721 DK sides, p50 0.3 min, p99 1.2, max 8.7, none over 30 min, 467 negative.
- The negatives bottom out at -0.1 min, so they show `at` precedes the fetch but do not measure how long the fetch takes.
- Archived boards confirm top-level `at` equals `data.gen.at` (2026-10-17 and 2026-09-25 latest).

**Why low rather than medium**
- The exposure is the gap between `now` and the pull, which the route's own comment puts at about 60 s (route.ts:256).
- My script `audit-out/verifyA6/lead.py` ran over 142 archived board files. None had a game starting within 120 s after `at`; the closest were 285-287 s (2026-08-22 and 2026-09-05). Caveat: only two boards per day are archived, and the locked cards are not in pl-history, so I could not check locked tickets directly.
- Scheduled fires land roughly 10-20 s after a 5-minute or hourly grid mark (leads of 4.8, 9.8, 19.9, 59.8 min). Realistic exposure is therefore manual or forced refreshes and delayed cron fires.
- `start` is the scheduled time, and first pitch normally follows it by minutes, so a price pulled within a minute of it is unlikely to be in-play yet.
- The engine's own comment says started games drop off the props endpoint, so the mislabel risk is mainly moneyline and run-line straights.
- `foundAt` is understated by about a minute at most.
- The stale-feed case is a genuine missing guard, but the worst quote age observed was 8.7 min.

**Correction to the proposed fix**
Do not move the board's `at` to a post-collect clock. It keys `BOARD_GEN_KEY(date, now)` and the generation index (route.ts:527), and the scheduler's 30-minute gate reads `board.at`, so a later `at` would loosen that gate relative to true quote time. Instead take a separate post-collect `lockNow`, use it for `startedGkey` and `foundAt`, and persist the DK quote's `last_update` on each leg with a maximum-age check.

<a id="f-a-7"></a>
#### A-7 — NFL prop grading turns a real zero into a wash: a player missing from an ESPN box category stays pending, then is washed after 48 hours

- Severity: low. Area: data integrity. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/football/prop-settlement.ts: `PAPER_PROP_STATS` maps pass_yds/pass_tds/rush_yds/receptions/rec_yds to ESPN box labels with the comment "Only explicitly posted, numeric final stat cells count; absent athletes are never zero." src/lib/cfb/grade.ts:112-140 returns `{result:"pending",detail:"final player statistic unavailable"}` when the stat is null; src/lib/cfb/grade.ts:15,192-195 converts a pending leg older than `cfg.ungradableMs` (48 h) to ungradable, which books as a wash. ESPN box categories list only players who recorded an entry in that category.

**Impact.** Record accuracy: an active player with no carry / no catch is absent from that category, so an over that lost and an under that won are both booked as washes. This removes real outcomes from the paper record and the hit-rate sample in an outcome-dependent way (it only ever deletes the under-side wins and over-side losses at the zero boundary).

**Proposed fix.** Treat a missing category as 0 when the player appears anywhere in that game's box score (any category) or in the played roster; void only when the player is absent from the whole box (true inactive). Keep the 48 h wash for genuinely missing finals.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code; could not refute the mechanism, but severity is overstated and several citations are off.

WHAT I VERIFIED
- src/lib/football/prop-settlement.ts:2-4 has the stat map and the comment "absent athletes are never zero". parseFinalPlayerStats (lines 12-19) only records an athlete/stat when that athlete appears in a box group whose keys include the stat and the cell is numeric. An explicit "0" cell IS graded (tests/nfl-variety-paper.test.ts:22 parses receptions "0" -> 0; :21 grades receptions 0 as lost). Only an absent athlete/category falls through.
- src/lib/cfb/grade.ts:126-131: a prop leg with stat==null returns pending "final player statistic unavailable".
- src/lib/cfb/grade.ts:335-338: any pending leg past voidWindowMs becomes ungradable. For a prop on a final game with readable scores, voidWindowMs (grade.ts:249-253) returns cfg.ungradableMs, which is 48 h for NFL (src/lib/nfl/rules.ts:136, 280). settle() makes the ticket ungradable (grade.ts:350) and ticketPL returns 0 for it (src/lib/bankroll.ts:101-106).
- The path is live for NFL only: server settle attaches stats at src/lib/server/football-lock.ts:316, device at src/components/cfb/CfbLedger.tsx:580 via app/api/nfl/route.ts:55. Both over and under prop singles can be locked (src/lib/cfb/card.ts:249-253, src/lib/cfb/found.ts:82-98; only side "yes" is excluded).
- No guard found: nothing in src/app treats a missing category as zero or checks for the player elsewhere in the box. The 7-day recheck does not help because the stat stays absent.

CORRECTIONS TO THE EVIDENCE
- Cited lines are imprecise: grade.ts:15 is a doc comment (the constant is grade.ts:41, and NFL uses nfl/rules.ts:136); grade.ts:192-195 is a comment describing the wash, the actual escalation is grade.ts:335-338.
- "ESPN box categories list only players who recorded an entry" is an external claim. I could not verify it offline: there is no ESPN summary fixture in the repo beyond the synthetic one in the test.
- No observed instance. /private/tmp/claude-501/pl-history holds only MLB data for 2026-07-12..07-30 (no NFL ledger), and the string "final player statistic unavailable" appears nowhere on disk except grade.ts. So frequency is unmeasured.

SEVERITY: low, not medium
- This is a deliberate conservative choice ("never a guessed zero", football-prop-finals.ts:7), and a wash is the correct book outcome for a truly inactive player, which is the more common reason for absence.
- The wrong-wash case needs an active player with zero carries/targets on a prop the card picked (most plausible: QB rush_yds, fringe receiver receptions/rec_yds). pass_yds/pass_tds are effectively unaffected.
- Paper only, P/L goes to 0 rather than to the wrong sign. The bias direction claim is correct (drops over-losses and under-wins at the zero boundary).

CORRECTION TO THE FIX
- "Zero if the player appears anywhere in the box" is incomplete: an active receiver with no targets and no other stat is absent from the whole box too, so it would still wash. A reliable fix needs an explicit active/played signal (game roster or did-not-play flag from the same ESPN summary), which I could not confirm exists in the payload without a fixture.
- Also note the same pending->wash path is hit by a name-key mismatch (grade.ts:127 keys on teamId|imageNameKey(player)); any fix should distinguish that from a true zero.

<a id="f-a-8"></a>
#### A-8 — Per-book quote index lets DraftKings' alternate-ladder price overwrite its standard over/under price for the same line

- Severity: low. Area: data integrity. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** src/lib/sportsbook/mlb.ts:31-34 folds `_alternate` markets onto the standard key (`lk=...m.key.replace(/_alternate$/,'')`, point-0.5) and writes `[b.key]={am:o.price,...}` to `${gkey}|${lk}|${side}` - last market iterated wins. `python3 /private/tmp/claude-501/audit-out/areaA/dk_age.py`: 1,213 of 26,721 DK sides (4.5%) have bookQuotes.draftkings != cz. `dk_mismatch.py`: 1,136 are batter_hits overs and 77 pitcher_strikeouts overs, all same line; e.g. 2026-09-17 PHI@NYM Brett Baty O0.5 cz -110 vs index -111, Bo Bichette O1.5 +165 vs +163, Luis Arraez O0.5 -273 vs -267; median relative difference 0.17%, cz better 648 / worse 565.

**Impact.** Small price error (median 0.17%) in anything that reads `bookQuotes` - per-book display, reprice-by-book, and any future two-book (DK vs FD) line-shopping built on this index. The settled `cz` price itself is the standard-market price and is not affected.

**Proposed fix.** Keep standard and alternate quotes under separate keys, or let the standard market win when both exist for the same book/line/side; if the alternate is genuinely the better bettable price, record which market it came from.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-a-9"></a>
#### A-9 — Grading, CLV and found-dedupe keys are `label|prop` with no game key (doubleheader collision)

- Severity: low. Area: data integrity. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** legacy/index.html:3639 `legRes[l.label+"|"+l.prop]` and :3698-3701 `var lid=l.label+"|"+l.prop; if(!legRes[lid])legRes[lid]=shGradeLeg(...)` - first graded result is reused for any later leg with the same label and prop. src/lib/server/clv-core.ts:78-79 `lid = `${l.label}|${l.prop}``. src/lib/server/lock-card.ts:1013 `foundLegKey = (l) => `${l.label}|${l.prop}``. Board/slate keys are doubleheader-aware elsewhere (legacy/index.html:1188 shGkey with gnum; :1209-1216 evGnum; clv-core.ts:111-128 matchEvent).

**Impact.** On doubleheader days an identical leg in game 2 is rejected as `found_leg_used` (a missed bet), and where two tickets do hold the same label+prop in different games the second would inherit the first game's grade and CLV. Rare, but it is a wrong-record path.

**Proposed fix.** Key all three maps by `gkey|lkey|side` (the leg already carries gkey at src/lib/server/lock-card.ts:1196-1222) with a fallback to the old key for legacy tickets without gkey.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-a-10"></a>
#### A-10 — Football odds-event matching: exact and alias tiers have no kickoff/date window

- Severity: low. Area: data integrity. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** src/lib/cfb/names.ts:84-187 `matchOddsEvent`: tiers 1 (exact normalized names) and 2 (alias) pick the event with the nearest commence time with no bound (:162-168); only tier 3 (fuzzy token overlap) requires `|t-kickoff|<=windowMs` and the same PT date.

**Impact.** If the same two teams appear twice in the Odds API window (rematch, conference title game, rescheduled game, NFL divisional rematch listed early) and the current week's event is missing or not yet priced, the other game's lines are attached to this week's ESPN event and can be picked. Low frequency, wrong-price outcome.

**Proposed fix.** Apply the same time window and same-PT-date test to tiers 1 and 2; when no event passes, return unmatched and count it.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-a-11"></a>
#### A-11 — HR overround study uses the day's last snapshot as 'the close', which covers only the late games

- Severity: low. Area: data integrity. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** /private/tmp/claude-501/pl-history/tools/hr_overround.py (~line 143) `snap = snaps[-1]  # last read before the slate = the close`. `python3 /private/tmp/claude-501/audit-out/areaA/props_poststart.py` over pl-history/data/props/*.json (103 days): the last snapshot of each day holds 523 HR events versus 941 events in total; e.g. 2026-08-24 snapshots at 17:25:04 (10 events), 20:17:49 (10), 21:19:25 (10) and 22:54:46 (7 events - later games only).

**Impact.** Accuracy of a fitted constant: the measured anytime-HR overround that informs the HR de-vig is estimated on a time-of-day-selected ~56% of events (late/west-coast games) and at varying distances from first pitch, so the constant may not represent the full slate.

**Proposed fix.** For each event take its own last snapshot with snapshot time < event start (per-event close), and report the overround by hours-to-start so the dependence is visible.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-b1-8"></a>
#### B1-8 — One-sided markets are de-vigged with a hard-coded 1.06 while the stored measurement says 1.16; the same haircut is applied to over-only total-base, hits and outs rows

- Severity: low. Area: MLB model quality. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2491 `var fair=oneImp/1.06` (any row with no two-sided fair), :2605 `iO/1.06` for the browse fair. /private/tmp/claude-501/pl-history/data/hr_overround.json: days 87, games 423, rows 7,581, sum_implied 1071.54, realized_hr_hitters 923, overround 1.1609 (all_listed 1.1763), with its own verdict that czEV is overstated about 6.2 pts. `python3 -I /private/tmp/claude-501/audit-out/areaB/b5_tests.py` (T8) plus the inline count: priced pre-game rows with no two-sided consensus (over only): batter_home_runs 6,458 of 6,458 (100%), batter_total_bases 1,969 of 9,319 (21.1%), pitcher_outs 122 of 1,098 (11.1%), batter_hits 160 of 6,984 (2.3%). Baseline (/private/tmp/claude-501/audit-out/baseline.md section 3.2): home runs show the second-highest claimed EV (7.25% on 487 rows).

**Impact.** Accuracy: every home-run EV on the Board is overstated by roughly 6 pts of probability-relative edge, and over-only milestone prices in other markets get the same too-small haircut. Paper profit is bounded today because home runs are excluded from the found card and none of the replayed found bets had zero two-sided books, but any re-opening of home runs or alternate lines inherits the error.

**Proposed fix.** Replace 1.06 with a per-market, per-book overround measured from the archive (home runs about 1.16 on the stored aggregate; re-measure on DraftKings and FanDuel separately once per-book home-run prices are archived) and refresh it on a schedule; where a matching two-sided line exists at another book, anchor to that instead; mark one-sided rows as card-ineligible unless the measured haircut is applied.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed, but the practical impact is display-only for home runs and the non-home-run part is overstated, so I rate it low rather than medium.

**What I checked and confirmed**
- `legacy/index.html:2491` is `var fair=oneImp/1.06` inside `else if(iO!=null)`, reached only when no two-sided fair exists (`:2451`). `legacy/index.html:2605` uses `iO/1.06` for the browse fair. Both ship in `src/engine/legacy-src.gen.ts` (one occurrence each).
- `/private/tmp/claude-501/pl-history/data/hr_overround.json` matches exactly: days 87, games 423, rows 7,581, sum_implied 1071.54, realized 923, overround 1.1609 (all_listed 1.1763), with the "czEV overstated ~6.2pp" verdict.
- My own recount from the auditor's extracted rows (`/private/tmp/claude-501/audit-out/verify-b1-8/v.py`) reproduces the counts: home runs 6,458/6,458, total bases 1,969/9,319, outs 122/1,098, hits 160/6,984. Every one of those rows has no under and a stored `fO` equal to over-implied/1.06.
- Recomputing the 2,224 stored home-run category rows with 1.1609 instead of 1.06: mean EV overstatement 5.9 pts (range 3.5 to 9.6). Rows with EV above zero fall from 281 to 75.
- Home runs are off the found card (`src/lib/server/lock-card.ts:1143`), and the home-run fun ticket is off on straight-only days (`:1078`). The ev_gated path also blocks any leg with `booksInd===0` (`legacy/index.html:3063-3065`).
- Baseline figure of 7.25% on 487 home-run rows is at `/private/tmp/claude-501/audit-out/baseline.md:182`; those are positive-EV rows only.

**Corrections**
1. **Non-home-run impact is overstated.** The 21.1% / 11.1% / 2.3% figures are browse-board rows (display fair at `:2605`), not engine EV rows. In the engine's category rows, only 58 total-bases and 121 outs rows are one-sided, and all have no DK/FD basis and no Caesars price, so they are card-ineligible. Of 109 one-sided hits rows, 3 show positive EV.
2. **"Too-small haircut" for other markets is unproven.** 1.16 is measured only for anytime home runs. The repo's own measurement for two-sided props is 1.071 (`docs/collection-period.md:796`, `:1295-1307`), and one-sided total bases, hits and outs are unmeasured.
3. **1.1609 is not a DK/FD number.** `tools/hr_overround.py` measures the best over price across all books, and 923 realized hitters gives roughly ±3% sampling error. The proposed fix's caveat to re-measure per book is right; DK/FD overround is likely at or above this.
4. **Not a new discovery.** The constant is documented as a deliberately frozen parameter (`docs/collection-period.md:796`, `:1217-1223`) with a weekly measurement job (`.github/workflows/hr-overround.yml`). The doc's reopen trigger is 1.20 (`:1188-1189`), and the measured value is below it. The doc itself argues against per-market constants as false precision except for home runs.

**Net:** the home-run Board EV is overstated by about 5 to 6 pts and paper P&L is unaffected today. The only justified part of the fix is a measured haircut for home runs and keeping one-sided rows card-ineligible.

<a id="f-b1-12"></a>
#### B1-12 — Integer prop lines are priced without a push: the under is credited with the push probability

- Severity: low. Area: MLB model quality. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** legacy/index.html:1543 `shPOver(line,lam){return 1-shPoisCdf(Math.floor(line),lam);}` and the under is taken as 1 minus that (:2472). `python3 -I /private/tmp/claude-501/audit-out/areaB/b5_tests.py` (T7): 69 pre-game pitcher_outs rows carry an integer line (1,088 half lines); every other archived market is on half lines. Poisson P(X = 15 | mean 15) = 0.102 (inline check), so on a line of 15 the modelled under is about 10 pts too high relative to a push-refunded price.

**Impact.** Accuracy on about 6% of outs rows, in the direction (unders) the outs model already over-selects; no effect on other markets in the archive.

**Proposed fix.** For integer lines compute P(over) = P(X > line), P(push) = P(X = line), and compare prices on the no-push conditional (or grade EV with the push as a refund); add a unit test at an integer line.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-b1-13"></a>
#### B1-13 — Total-bases formula is wrong at 2.5 and 3.5+ (latent: almost no such rows are priced today)

- Severity: low. Area: MLB model quality. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** legacy/index.html:1549-1550: the 2.5 branch counts every one-hit game that is not a single or a home run as <= 2 TB (a triple is 3) and the 3.5+ branch `1-(P0+P1+P2*(s1+s2)*(s1+s2))` counts every one-hit game as an under, including a home run (4 TB), and ignores three-hit games; the code comment calls it 'rough'. :2350-2355 collapses the environment factor for total bases to x1.03 / x0.98 / 1. `b5_tests.py` (T7): priced total-base rows by line: 0.5 -> 3,693, 1.5 -> 5,607, 2.5 -> 19, none at 3.5+ (DraftKings alternate ladders are read at :1381-1398 but never become rows).

**Impact.** None on today's card; wrong probabilities the moment alternate total-base ladders (a DraftKings/FanDuel staple) are turned into rows.

**Proposed fix.** Replace the branch table with an exact compound sum over hit count and per-hit base distribution (single/double/triple/home-run shares, shrunk), valid for any line; let the park/pitcher power factor scale the extra-base shares instead of the three-level step.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-b2-11"></a>
#### B2-11 — First-half sigma of sigma/sqrt(2) is an assumption with no tie or key-number handling

- Severity: low. Area: football model quality. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** H1_SIGMA_SCALE = Math.SQRT1_2 (src/lib/cfb/markets.ts:37), described at :12-16 as a 'documented assumption' of independent equal-variance halves; applied at src/lib/cfb/h1.ts:35-36; 1H ML blends market and spread-implied only (h1.ts:46-58). 1H rows are excluded from the auto card (src/lib/cfb/found.ts:138 via isH1Market).

**Impact.** Display-only today: 1H grades and EVs on the Board and in hand-built parlays rest on an unfitted scale, and half-time ties (a real outcome for 1H ML) and 1H key numbers are not modelled. No paper money is staked on it.

**Proposed fix.** Fit the 1H margin and total spread from ESPN linescores already used for grading, model the half-time tie explicitly, and keep 1H off the card until then.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-b3-8"></a>
#### B3-8 — Slope-band criteria the project's own docs call unusable still drive live weights; the global shrink never fired

- Severity: low. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/engine2/calibration.ts:473-475: 'at the measured within-market sigma_p (0.022-0.064) its SE at n=100 is 0.78-2.27, so a [0.85,1.15] band admits a perfectly calibrated market only 5-15% of the time'; :544-545 'The SLOPE needs ~13,100 legs in that market for a 2-sigma test'. docs/hrr-recalibration.md:591-634 (proposed amendment, unsigned): a perfectly calibrated H+R+RBI market passes 13.9% of the time, a zero-information market still passes 7.1%. Yet fitGlobalShrink (calibration.ts:572-589) returns the largest s whose pooled slope lies in [0.85, 1.15] using no standard error, and slopeMults (:596-604) acts at SLOPE_MIN_N = 100 (:359). wblend_scan.py: hits wBlend = 0.35 on all boards, which proves calG was never below 1 across 2026-08-06..10-17.

**Impact.** The global shrink is a no-op in practice (a pooled slope dominated by market variance always lands in band at s = 1), and per-market slope multipliers fire or release on noise. Compute and review effort is spent on a control that cannot bind.

**Proposed fix.** Replace both with the deviation regression from the feedback-loop finding; drop the [0.85, 1.15] band. If a pooled fallback is wanted, fit one pooled beta on (y - pMkt) vs (pModel - pMkt) and use it for markets with fewer than about 2,000 rows.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Partly confirmed, partly mischaracterised; severity is overstated.

CONFIRMED (opened each file):
- src/engine2/calibration.ts:473-475 and :544-545 say what the finding quotes (slope is "DIAGNOSTIC ONLY and never a criterion"; needs ~13,100 legs for a 2-sigma test).
- docs/hrr-recalibration.md:591-604 is the unsigned 2026-07-26 amendment with the 13.9% / 7.1% / ~13,100 figures.
- fitGlobalShrink (calibration.ts:572-589) returns the largest s whose pooled slope is in [0.85, 1.15] with no standard error.
- SLOPE_MIN_N = 100 (:359); slopeMults is at :596-604.
- Both controls are live, not dead code: app/api/calibrate/route.ts:418-423 computes them nightly; effectiveCalibration (calibration.ts:626-638) feeds app/api/generate/route.ts:424 (calG) and src/lib/engine-client.ts:377; shWm in src/engine/legacy-src.gen.ts multiplies calW by calG.
- "Global shrink never fired": I re-ran audit-out/areaB/wblend_scan.py against pl-history/data/boards. batter_hits wBlend is exactly 0.35 on every archived board that has rows (2026-07-26 and 08-06..10-17; 09-13, 09-18 and 09-23 are empty). Because calG multiplies every market, calG was 1 or null on all of them. docs/collection-period.md:795 independently records s = 1 with a pooled slope of 1.05 over 1,487 legs.

CORRECTIONS:
1. The title is wrong that slope-BAND criteria drive live weights. The [0.85, 1.15] band exists only in fitGlobalShrink, which never moved a weight. slopeMults does not use the band; it uses a one-sided test, `f.slope + 1.96 * f.se >= 1 → skip` (:600).
2. The docs' "unusable" derivation is about the per-market H+R+RBI retirement criterion at within-market sigma_p. It does not transfer directly to the pooled cross-market slope, whose predictor spread is far larger. The finding's "always lands in band at s = 1" is a plausible mechanism, consistent with the 1.05 record, but not proven from stored data.
3. "wBlend = 0.35 on all boards" holds for hits only. Other markets moved, and some moves cannot be the 10% weekly walk, so slopeMults evidently did fire:
   - pitcher_outs sat at 0.05 (the MULT_FLOOR × 0.35 floor) from 08-06 to 08-15, then returned to 0.35 on 08-16.
   - batter_hits_runs_rbis went 0.284 → 0.139 → 0.168 between 08-30 and 09-14, then back to 0.253 on 09-20.
   This is inferred from stored wBlend values; no calibration summary is archived to confirm it directly. It contradicts the project's own claim that slopeMults is "effectively unfireable" (docs/collection-period.md:2345-2359, tools/gate_activity.py:108-109).
4. "Fire or release on noise" is not established. Both markets that fired have independently documented miscalibration, so the firings may be real signal. What is supportable: the multiplier is the raw slope point estimate, applied nightly with no step cap, with an SE that assumes independent legs (the clustering caveat at calibration.ts:547-549 is unresolved). So its magnitude is noisy and it snaps on and off.

SEVERITY: The global shrink being inert has harmed nothing; it is a missing protection, not a wrong output, and the system is paper-only. The stated impact ("compute and review effort spent") is low. It would rise to medium only if the slopeMults firings were shown to be noise, which nobody has measured.

FIX: Dropping the band from fitGlobalShrink is reasonable. Any slopeMults replacement should also add a step cap or hysteresis and clustered standard errors. The proposed pooled deviation regression is sensible but untested here.

<a id="f-b3-9"></a>
#### B3-9 — Full refit depends on one external cron job, the route fails open without the secret, and the 45-logged-date window shrinks and goes stale

- Severity: low. Area: calibration and backtest. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** vercel.json has no /api/calibrate cron; docs/cron-jobs.md:22 lists the calibrate job as an external one ('Josh creating 2026-08-06 ... Sundays 10:00'); app/api/scheduler/route.ts:416-418 forwards only /api/calibrate?grade=only. app/api/calibrate/route.ts:76-84 authed() returns `!cron` (open when CRON_SECRET is unset). SUMMARY_DAYS = 45 (:73) is applied to logged dates (:299). Command: python3 -I /private/tmp/claude-501/audit-out/areaB/echo_scan.py shows training n changing only on Sundays (the job did run 08-09..10-11) and then falling: 17,224 (09-27) -> 16,327 (10-04) -> 14,908 (10-11..10-17) as thin postseason slates displaced full ones. echo_keys.py: the board echo records no calW/calG, so the armed multipliers are not archived.

**Impact.** If the external job stops, weights freeze silently. The window will carry late-season/postseason multipliers into next April unchanged. A board cannot be reproduced after the fact because the multipliers in force are not stamped.

**Proposed fix.** Add a Vercel cron for the Sunday full fit (or have the scheduler run it when lastRun is older than 8 days). Make authed() fail closed like the scheduler (scheduler/route.ts:156). Window by calendar days and by minimum rows per market, decay weights at season start, and stamp calW/calG into the board echo.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every piece of cited evidence checks out, but the impact is overstated; I would rate this low, not medium.

CONFIRMED
- Single external dependency: vercel.json has four crons (two /api/scheduler pokes, two /api/nfl/lock) and none for /api/calibrate. docs/cron-jobs.md:22 lists calibrate as a cron-job.org row, Sundays 10:00. The only in-repo caller is app/api/scheduler/route.ts:416-418, which forwards /api/calibrate?grade=only; that mode returns at app/api/calibrate/route.ts:401, above the summary write (:523) and weights write (:534).
- No staleness guard: src/engine2/calibration.ts:626-639 (effectiveCalibration) reads summary and weights with no age check, and app/api/generate/route.ts:367-381 passes them straight through.
- Fail-open: app/api/calibrate/route.ts:76-84 ends in `return !cron`. scheduler/route.ts:156-162 fails closed and names this difference in its comment.
- Window: SUMMARY_DAYS = 45 (:73) is applied as `allDays.slice(-SUMMARY_DAYS)` (:299), i.e. 45 logged dates, not calendar days.
- History: I re-ran the scans over pl-history/data/boards (71 files, last 2026-10-17). echo.mktN changes only on Sundays, 08-09 through 10-11. mktN.all is 17,224 (09-27), 16,327 (10-04), 14,908 (10-11, unchanged to 10-17).
- Unstamped multipliers: calW/calG go into the engine at app/api/generate/route.ts:423-424, but BoardEcho/buildEcho (src/lib/engine-echo.ts:85-167) carries mktN and not calW/calG. No archived echo has them, and pl-history holds no calibration summary.

WHY THE SEVERITY IS OVERSTATED
- Fail-open is not reachable in a working deployment. It only applies when CRON_SECRET is unset, and then the scheduler returns 503 and Vercel crons carry no Bearer, so the whole system is already down. The route is also throttled to once per 10 minutes (:121-126), spends no Odds credits and writes only derived aggregates. It is a documented choice (:79-81); treat it as hardening.
- A freeze is conservative. Multipliers are shrink-only and never above 1.0 (calibration.ts:687-690, :634-637), so stale weights keep the engine more market-anchored. The owner deliberately used a stopped writer as a freeze on 2026-07-31 (commit 9324517).
- The 45-logged-date window is deliberate and documented (:55-72, :277-293). The falling n is still 505 to 3,174 per market against the consMinN = 100 gate, so nothing re-gates. The "carried into next April" concern is real but speculative.
- The system is paper trading only.
- I could not determine whether the Sunday job ran after 10-11; the archive ends 10-17, a Saturday.

CORRECTIONS
- The route docstring (:33-34, "runs nightly via Vercel cron") is stale and should be listed with this finding.
- The proposed "scheduler runs the fit when lastRun is older than 8 days" cannot use pl:cal:lastRun: it is written at :126, before the grade-only branch, so the daily grade-only ticks refresh it. Use the summary's `at` or weights.lastAdjust/at instead.
- The weekly weight walk is partly reconstructable from the append-only WeightState.log (calibration.ts:672-678), in Redis only. The slope-fit multipliers and globalS come from pl:cal:summary, which is overwritten each fit, so the reproducibility gap stands for those.
- Adjacent, read from code but not measured: applyWeeklyAdjustment skips when `now - lastAdjust < WEEK_MS` (calibration.ts:692) and sets lastAdjust to now. A weekly job firing slightly earlier in the minute than the previous week would skip that week's weight walk; the summary, slopes and globalS would still refresh.

The cheapest worthwhile fix is stamping calW/calG into the echo, which is additive and already the pattern used for mktN. A Vercel cron for the Sunday fit (or a scheduler fallback) plus an age warning is reasonable. Fail-closed auth and re-windowing by calendar days are optional, and re-windowing is a model change that needs the owner's sign-off per the comment at :55-72.

<a id="f-b3-14"></a>
#### B3-14 — Audit tools are not reproducible and a known under-shrinkage result remains unfixed

- Severity: low. Area: calibration and backtest. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** tools/hrr_clamp_audit.py and tools/hrr_ladder_audit.py hard-code input /private/tmp/claude-501/-Users-josh-Documents-Edge-Desk/43a0f1e0-7096-4c57-aa94-4cc966766115/scratchpad/b-2026-07-26.json; `ls` of that path returned 'No such file or directory'. tools/recency_weights.py: in-sample over 2026-07-11..07-26, player pool taken from current season stats at run time, duplicate s2 assignment in wls(). docs/freeze-exit-bundle.md:36 records its M11 result (hot-form under-shrinkage +0.79 pp per 10 pts, SE 0.09, n=3,061) and audit-out/prior-audit-regression.md lists the fix as still missing. Stale comment at src/engine2/calibration.ts:456-459 says EV is computed at the Caesars price (settlement book is DraftKings since 2026-09-17). src/engine2/grade.ts:86 run line has no push branch (margin + pt > 0 ? won : lost). iCloud conflict copies exist under tools/ (not analysed).

**Impact.** Past audit conclusions cannot be re-run or checked; a documented model defect sits unaddressed; a whole-number run line that lands exactly would grade as a loss.

**Proposed fix.** Point the two HRR tools at pl-history/data/boards/2026-07-26.latest.json.gz via an argument; add a held-out split to recency_weights.py; add the push case to grade.ts:86; correct the comment.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-c1-5"></a>
#### C1-5 — MLB found lease is taken AFTER the paid slate pull, a failed/busy lock burns the hourly slot, and the in-flight top-up yield is dead code

- Severity: low. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/generate/route.ts:445 eng.collectSlate() (114-150 Odds credits per the refill route comment) runs before the found lease at :582-587 (busy -> throws 'FOUND LEASE HELD ... this pass locked nothing'). On any lock failure the registry row is rewritten at :680-688 as `{ firedAt: now, tickets: 0, reason: "lock failed: ...", ...(slot ? { slot } : {}) }`, and src/lib/server/blocks.ts:280-282 refuses any later pass whose `row?.slot === slot` regardless of reason, so that hour is lost. Top-up claim at route.ts:245-269: `used` = count of keys starting 'topup-' (:247), `topupKey = topup-${used+1}` (:254), then the in-flight check reads `reg[topupKey]` (:264-267) - a key that by construction does not exist unless numbering has a gap, so it never yields; the code's own comment at :263 says 'Not atomic (GET + SET)'. TOPUP_MAX skip is bypassed on found days (:251); blocks.ts:272-284 has no attempt cap or manual cooldown on found days; app/api/refill/route.ts:30-87 forwards slot=manual with no rate limit.

**Impact.** Credits and reliability: two overlapping triggers (ticker + manual Refresh, or a double tap) each buy a full slate; the loser throws after spending and, if it was the scheduled slot, marks that slot fired with zero tickets so no bets are found that hour (1 of only 11 MLB passes/day). Lock errors of any kind have the same slot-burn effect.

**Proposed fix.** Claim before spending: take the found lease (or a SET NX claim row keyed by date+slot) before collectSlate and release in finally. On lock failure do not stamp `slot` (or stamp a retryable state) and retry lock-only from the board just persisted. Replace the dead `reg[topupKey]` test with the NX claim. Add a per-desk manual cooldown (e.g. 2 min) on found days.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The cited code is all real, but the impact is overstated and one causal claim is wrong; I rate it low, not high.

**Confirmed in code**
- `eng.collectSlate()` at app/api/generate/route.ts:445 runs before the found lease at :582-587, which throws "FOUND LEASE HELD" on a busy lease. The design comment at :566-570 accepts that the losing pass locks nothing; it just ignores that the pass already paid.
- The lock-failure catch at :680-688 rewrites the `topup-N` row with `firedAt`, `tickets: 0`, `reason: "lock failed: ..."` and the slot.
- src/lib/server/blocks.ts:280-282 refuses any named slot that already has a `topup-` row, whatever its reason; "manual" is exempt.
- The in-flight yield at route.ts:264-267 is effectively dead. The in-flight row is counted in `used` (:247), so the next caller computes `topup-(used+1)` (:254), a key that does not exist. If both callers read before either writes, both see `undefined` and both write `topup-1`. It can only fire after a registry lost-update leaves a numbering gap.
- No cap applies on found days: the TOPUP_MAX skip is bypassed (:251), and `MAX_RUNS_PER_DATE = Number.POSITIVE_INFINITY` (:67-68), so the run-cap check at :345 never trips. app/api/refill/route.ts has no rate limit, only the sync phrase.

**Corrections to the evidence and impact**
1. **The slot stamp is not what loses the hour.** The ticker pokes every 15 min (docs/cron-jobs.md:21) and a slot fires only on a tick inside [slot, slot+15 min) (src/lib/server/grading-progress.ts:57, :119-131, :202-203). An hourly MLB found slot therefore gets one tick whether or not the failed row carries `slot`. The real defect is that nothing retries a failed lock. The stamp is a deliberate credit guard (comment at route.ts:669-679).
2. **The in-flight row itself still works.** It is slot-stamped at :268, and the scheduler re-reads the registry and runs `decideMlbRefill` before forwarding (app/api/scheduler/route.ts:325-329), so a second scheduled poke on the same named slot is refused for free. Only the yield test inside generate is dead.
3. **A same-device double tap is blocked.** The Refresh button is disabled while any refresh mutation is pending (app/board/page.tsx:1191). Overlap needs the ticker plus a manual tap, or two devices or tabs.
4. **The lease collision window is narrow.** The lease is held only from :583 to the `finally` at :691, not for the ~60 s pull. Two runs must reach the lock section at nearly the same moment. Otherwise both spend and both lock in sequence, which is the intended found-mode behaviour (blocks.ts:266-270).
5. **In a collision, the hour's bets are not lost.** The lease holder locks from an equally fresh board. The loss is one wasted slate pull (114-150 credits per the route comment at :207).
6. **Credit impact is small by the owner's own choice.** The comment at route.ts:67 says the daily ceiling was removed after the upgrade to 100k credits/month.
7. **The path looks dormant.** The newest MLB archives in pl-history are data/props/2026-10-28.json and data/boards/2026-10-17.*, and this is paper trading only.

**One thing the finding missed:** the log line at :667, "LOCK FAILED — the self-check will backfill", is untrue once the day has an entry. The scheduler backfills only when no lock exists (scheduler/route.ts:225-229) and, on a found day, only from a board under 30 minutes old (:234-237).

**Fix adjustments**
- Taking the lease, or a SET NX claim keyed by date and slot, before `collectSlate` is sound. The lease TTL is 300 s (src/lib/server/found-lease.ts:14) and the pull is about 60 s, so it fits.
- Replace the dead `reg[topupKey]` test with that NX claim.
- Dropping the slot stamp on failure does nothing on its own. It needs an actual retry, for example a lock-only retry from the board just persisted, either in the same request or on the next tick.
- A manual cooldown on found days contradicts the owner's recorded instruction that nothing may block a Refresh (src/lib/mlb/use-board-refresh.ts:60-64), so that is his decision, not a bug fix.

<a id="f-c1-6"></a>
#### C1-6 — Commence-time check and foundAt use the request-start clock, up to 300 s (MLB) / 60 s (football) stale, with no safety margin

- Severity: low. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** MLB: app/api/generate/route.ts:144 `const now = Date.now()` once at request start, maxDuration 300 (:42); the same `now` is passed to buildLockEntry (:635-646) after collectSlate and the board write; lock-card.ts:1099-1103 startedGkey compares game start to that `now`; ticket `foundAt: now` (lock-card.ts:1207-1229). Football: app/api/nfl/lock/route.ts:119 and app/api/cfb/lock/route.ts:295 take `now` at request start (maxDuration 60, :76 / :225), sweep and settle run first, then foundPassDate uses args.now for the ahead check (football-lock.ts:695), the paid pull (:710) and planFound(cfg, slate, live, args.now) (:736); found.ts:95-99/:134 and :198 (`foundAt: now`). All clocks are server-side: found-day device locks are refused (app/builder/page.tsx:600-607; src/lib/football/store.ts:1094).

**Impact.** Record accuracy: a pass that begins shortly before first pitch/kickoff can record a bet after commence_time while stamping it as pre-game, at a pre-game price that may no longer be offered. Bounded to the route budget, but it sits exactly at the hourly :00 slots when many games start.

**Proposed fix.** Take a fresh Date.now() immediately before candidate filtering (after the slate pull, inside the lease) and require start - now >= a margin (e.g. 2 minutes). Stamp foundAt with that fresh clock.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The code facts are confirmed, but the impact is overstated and the ":00 slots" claim is backwards; I rate this low, not medium.

**Evidence confirmed (one path correction):**
- The file is `src/lib/server/lock-card.ts`, not `lock-card.ts` at the root of `src/lib`.
- MLB: `app/api/generate/route.ts:144` takes `now` once; `maxDuration` is 300 (`:42`). `collectSlate`/`analyze` (`:445-446`) and the board write run before `buildLockEntry` is called with that same `now` (`:635-646`).
- MLB: `src/lib/server/lock-card.ts:1099-1103` compares `gameInfo.start` with that `now`; `foundAt: now` is at `:1225`.
- Football: `app/api/nfl/lock/route.ts:119` and `app/api/cfb/lock/route.ts:295` take `now` at request start (`maxDuration` 60 at `:76` / `:225`). Sweep and settle run first (nfl `:139`, `:144`).
- Football: `src/lib/server/football-lock.ts:695`, `:710`, `:736` and `src/lib/cfb/found.ts:134` and `:198` all reuse `args.now`.
- Device locks are refused on found days at `app/builder/page.tsx:602-606` and `src/lib/football/store.ts:1094`.

**Why the impact is overstated:**
1. **The ":00 slots" argument is inverted.** Found slots are on :00 (MLB) and :00/:15/:30/:45 (football) (`src/lib/server/grading-progress.ts:191-192`), driven by a 15-minute external cron (`docs/cron-jobs.md:21`). The poke arrives at or after the mark, so a game scheduled on the mark already has `start <= now` and is excluded. The window only catches a start inside (request start, request start + run time]. For football that means a kickoff less than 60 s after a quarter-hour mark. For MLB a :05 start would need about 300 s of run time, which is the kill limit.
2. **The realistic triggers are different.** Manual refreshes (`?manual=1`, `nfl/lock/route.ts:162`) and late cron fires can land at any minute, so they can hit the window.
3. **There are second guards the finding omits.**
   - MLB: candidates are also dropped on `l.live` (`lock-card.ts:1142`), set from the MLB schedule's real game state fetched inside `collectSlate` (`src/engine/legacy-src.gen.ts`, `slate.liveInfo`, phase from `detailedState`/inning).
   - Football: game rows need `game.status === "upcoming"` from ESPN (`src/lib/cfb/model.ts:466`, `:518`), and prop drafts need `g.status === "upcoming"` (`found.ts:95`). The ESPN read is cached for 60 s (`src/lib/cfb/slate-server.ts:66`).
   - An in-play price is recorded only if the game actually starts between the status read and the odds read in the same request.
4. **The clock is not the main staleness on football.** The odds call is cached for 240 s unless fresh (`slate-server.ts:48`, `:111`), which is longer than the 60 s clock lag.
5. **Paper trading only.** Books usually keep pre-game markets open until the actual start, which trails the scheduled time, so the recorded price is most likely still a pre-game price.

No stored found ticket could be checked: the line-history data has no `foundAt` field, and actual request durations could not be determined from disk.

**Fix:** the proposed fix (fresh `Date.now()` just before candidate filtering, plus a small margin, and stamping `foundAt` from it) is sound and cheap. It should also stamp `lockedAt`/`firedAt` consistently. The priority is low.

<a id="f-c1-8"></a>
#### C1-8 — Football found pass keeps buying a priced board every 15 minutes after the day's ceiling is reached (funOpen ignores that fun is off on straight days)

- Severity: low. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/football-lock.ts:699 `const funOpen = !entry.funT.length && !cfbFunRefusedOf(entry).length && ahead >= cfg.rules.fun.legs.min;` and :700-702 `if (base.room < FOUND.minStake && !funOpen) return skipped`. On straight days foundFunOf returns 0 (src/lib/found-mode.ts:119-121) and planFound only builds fun when `foundFunOf(board.date) > 0` (src/lib/cfb/found.ts:204), so no fun ticket is ever written and funOpen stays true whenever >= 3 games are ahead (fun.legs.min 3: src/lib/cfb/rules.ts:64, src/lib/nfl/rules.ts:54). The paid pull follows at football-lock.ts:710. Cadence: FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8,19,15), 44 passes/day (src/lib/server/grading-progress.ts:192, comment :166-183 '~3 credits').

**Impact.** Credits: once room is exhausted the free early-exit never triggers, so every remaining poke (up to 44/day per desk) spends an Odds API game-lines pull to lock nothing.

**Proposed fix.** `const funOpen = foundFunOf(date) > 0 && !entry.funT.length && ...` so the room check short-circuits on straight days.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but the severity is overstated: this is a bounded credit inefficiency that only bites on a day a football desk actually hits its ceiling, and I could not find evidence that has happened.

What I checked (paths relative to /private/tmp/claude-501/pl-audit):
- src/lib/server/football-lock.ts:699-702 reads exactly as quoted. `funOpen` has no date or straight-day term, so the free early exit needs `room < FOUND.minStake && !funOpen`.
- src/lib/found-mode.ts:119-121: `foundFunOf` returns 0 on a straight day. STRAIGHT_SINCE is 2026-10-06 (:106), so every date from then on is a straight day.
- src/lib/cfb/found.ts:204: `planFound` only builds fun when `foundFunOf(board.date) > 0`, so `funT` stays empty on straight days. `cfbFunRefusedOf` (src/lib/cfb/lock-server.ts:490-496) only reads funDropped/funDroppedPL, which a straight day never sets. So `funOpen` is true whenever at least 3 games are ahead (fun.legs.min 3 at src/lib/cfb/rules.ts:64 and src/lib/nfl/rules.ts:54).
- The paid pull at football-lock.ts:710 then runs. `planFound` returns nothing and the pass reports "ceiling is reached" (found.ts:242) after paying.
- No upstream guard: app/api/cfb/lock/route.ts:362-367 and app/api/nfl/lock/route.ts:178-183 call `foundPassDate` on every fired found tick with no room check.
- No cache saves it: `oddsPayloadOf` uses revalidate ODDS_TTL = 240 s (src/lib/cfb/slate-server.ts:48, :111), shorter than the 15-minute cadence, and both routes are `force-dynamic` (cfb route :223, nfl route :74).
- Cadence is as cited: FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8,19,15), 44 slots (src/lib/server/grading-progress.ts:192).
- `git log` on football-lock.ts shows the straights commit (45e9f78) never touched this file, which fits an oversight.

Corrections to the finding:
- **Cost per pull:** the URLs request `regions=us,eu&markets=h2h,spreads,totals` (src/lib/cfb/rules.ts:366-367, src/lib/nfl/rules.ts:169-170). The "~3 credits" figure is only a code comment; if the Odds API bills markets x regions it is nearer 6, which I could not verify from disk.
- **Impact is conditional:** while room remains, every poke pays for a pull by design. The defect only adds spend for pokes after the desk reaches within $5 of $2,500 plus the day's wins, with at least 3 games still ahead. Worst case is the normal daily football spend (at most 44 pulls per desk), not anything beyond it.
- **No sign it has triggered:** pl-history holds only MLB archives, so there is no football ledger to check. The 2026-11-01 note at found-mode.ts:124-128 (Josh wanting more football picks "with the allotted money") suggests the ceiling was not being reached.
- **No correctness or money effect:** nothing is written or mis-staked, and the win-widened ceiling is still re-read from free ESPN finals before the gate (:691-694).

The proposed fix is sound: add `foundFunOf(date) > 0 &&` to `funOpen`. It mirrors the planner's own condition at found.ts:204 and keeps the 10-03 to 10-05 fun days intact. The source-pin test at tests/found-winnings.test.ts:294 pins only the `if (base.room < FOUND.minStake && !funOpen)` line, so it is not broken; `foundFunOf` would need importing into football-lock.ts.

<a id="f-c1-9"></a>
#### C1-9 — Football props are attached only on NFL's first found lock and never on CFB or on any append pass, while the UI preview plans props against a null entry

- Severity: low. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/football-lock.ts:834 `if (args.attachProps && args.ahead > 0) await args.attachProps(slate)` is the only props attach on a found path (foundFirstLock); foundPassDate :710-736 plans without props. app/api/nfl/lock/route.ts:182 (append pass, no props) vs :220-222 (first lock with attachProps); app/api/cfb/lock/route.ts:396-406 foundFirstLock with no attachProps. propDrafts returns [] without a same-date paperProps board (src/lib/cfb/found.ts:87). Preview: src/lib/cfb/card-preview.ts:13 `planFound(cfg, board, null, now)` and src/components/cfb/CfbBuilder.tsx:457 passes paperProps into the slate.

**Impact.** Profit and UI honesty: +EV NFL props that appear after the morning lock, and all CFB props, can never be locked; the Builder preview shows prop bets and a full $2,500 of room that the server will not act on (it also ignores the day's existing bets and game/family dedupe).

**Proposed fix.** On append passes read the stored props board (found.ts already enforces a 30-minute stamp) and attach it before planFound, for both desks; or remove props from the preview. Pass the stored day entry to previewFootballCard instead of null.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Half confirmed, half refuted; severity overstated.

CONFIRMED (server side):
- `paperProps` is assigned in exactly two places, both in app/api/nfl/lock/route.ts (:221 the found first-lock `attachProps`, :274 the pre-found lock). No slate-server code sets it.
- src/lib/server/football-lock.ts:834 is the only props attach on a found path. `foundPassDate` (:672) pulls the slate at :710 and calls `planFound(cfg, slate, live, args.now)` at :736 with no props attached, so `propDrafts` returns [] (src/lib/cfb/found.ts:86-87).
- app/api/nfl/lock/route.ts:182 (append pass) passes no props; app/api/cfb/lock/route.ts:396-406 calls `foundFirstLock` with no `attachProps`; cfb :366 append is the same.
- So NFL props can be locked only on the day's first found entry, and CFB props never.

CORRECTION: this is documented design, not an accidental bug.
- football-lock.ts:784 comments `attachProps` as "the NFL route's props attach (forceFresh), run only where the pre-found lock ran it".
- found.ts:28 scopes props to "the NFL variety props".
- The attach is a forceFresh paid props pull, so running it on every 15-minute poke would be a credit decision. It is a missed-opportunity/scope limitation: NFL props that turn +EV after the first pass are not picked up.

REFUTED (UI half):
- src/components/cfb/CfbBuilder.tsx:511-547 renders the stored LOCKED card whenever a ledger entry exists for the date (`locked`, :411). The preview panel (:558 onward) renders only when there is no entry.
- So `planFound(cfg, board, null, now)` at src/lib/cfb/card-preview.ts:13 is the correct "day's first entry" call (found.ts:168 documents null as exactly that). There are no existing bets or dedupe keys to ignore, and the full $2,500 room is right. The proposed fix "pass the stored day entry" is moot.
- The Builder's props query is enabled only for `L.id==="nfl"` (CfbBuilder.tsx:397), so the CFB preview never shows props.
- The NFL preview shows props for the first pass, which is the one pass where the server does attach them (nfl route :220-222). The preview does not promise bets the server will not act on.
- Residual gaps are small: the preview reads the stored props board while the server pulls fresh, and there is a short window between the server's first write and the device's ledger sync.

FIX: the cheap option (read the stored props board on append passes, relying on the 30-minute stamp gate at found.ts:104) is reasonable for NFL only if something keeps that stored board fresh; I did not verify what refreshes it. CFB props would be a new feature, not a fix. No preview change is needed. Paper trading only, so low.

<a id="f-c1-10"></a>
#### C1-10 — Room exhaustion silently drops +EV bets and is mislabelled; greedy EV% order plus first-come passes; football 2.6 decimal cap on singles

- Severity: low. Area: selection and staking. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/found-mode.ts:186-207 pickFound: `if (room < FOUND.minStake) break;` ends selection. src/lib/server/lock-card.ts:1196 `for (const c of cands) if (!picked.has(c.id) && !blockedBy.has(c.id)) reasons.found_under_min_stake++` counts every candidate left after the break as 'under min stake'. Sort is EV% then prob then id (lock-card.ts:1152; found.ts:146); room is consumed by whichever pass runs first (08:00 PT onward) with stakes up to $800 against a $2,500 ceiling (found-mode.ts:53-76). Football: `r.cz.dec <= R.maxDec` in found.ts:97 and :138 with maxDec 2.6 (src/lib/cfb/rules.ts:49, src/lib/nfl/rules.ts:41) - a parlay-era cap applied to one-leg bets.

**Impact.** Profit and diagnosability: as few as 4 max-stake bets fill the day, so later, better +EV bets (evening slates, late line moves) are dropped and the refusal log reports the wrong reason. Every football underdog ML above about +160 and any long prop is excluded regardless of EV.

**Proposed fix.** Add a distinct `found_no_room` reason. Size all day candidates jointly (or cap any one bet at a share of remaining room / reserve room per pass) instead of first-come full Kelly. Drop or raise maxDec for one-leg found bets and let EV plus shrink do the gating.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

I opened every cited file. The code evidence is accurate, but only the mislabel is a defect; the other two parts are documented owner decisions, so medium is overstated.

**Confirmed in code**
- `src/lib/found-mode.ts:198` — `if (room < FOUND.minStake) break;` inside `pickFound` (186-207).
- `src/lib/server/lock-card.ts:1196` — every candidate that is neither picked nor in `blockedBy` is counted as `found_under_min_stake`. That includes candidates never evaluated after the room break, as well as genuine sub-$5 Kelly stakes. The reasons object (`lock-card.ts:1135`) has no room-exhausted key.
- The histogram is summed into the carried `blockedReasons` on every pass (`lock-card.ts:1257-1258`), so the same un-roomed candidates are recounted each pass (hourly for MLB).
- Sort order is EV, then prob, then id (`lock-card.ts:1152`; `src/lib/cfb/found.ts:146`).
- Ceiling is $2,500 with an $800 maximum stake (`found-mode.ts:58`, `:68`, `:76`).
- The 2.6 cap gates one-leg football bets: `src/lib/cfb/found.ts:97` (props), `:138` and `:144` (game rows), with `maxDec: 2.6` at `src/lib/cfb/rules.ts:49` and `src/lib/nfl/rules.ts:41`. No found-specific override exists.
- Pass timing: MLB hourly 08:00–18:00 PT (`app/api/scheduler/route.ts:319`), football every poke 08:00–18:45 PT (`src/lib/server/football-lock.ts:899`).

**Corrections to the finding**
1. **"Silently" is overstated.** The MLB entry writes `allocSum`, `unallocated` and a note reading "day at $X of the $ceiling ceiling … none fit the day's rules or the room left" (`lock-card.ts:1280-1297`). Football has an explicit "ceiling is reached" message (`src/lib/cfb/found.ts:245`). Only the MLB histogram bucket is wrong. Nothing else in `src`, `app` or `tests` reads `found_under_min_stake`, so it is diagnostic only.
2. **First-come exhaustion is the owner's stated rule, not a bug.** `found-mode.ts:93-107` quotes him: bets lock as found "until it doesn't have money to bet because all daily cash is pending". Same-day wins add room (`found-mode.ts:43-47`). The last bet is trimmed to the remaining room rather than dropped (`foundStake`, `found-mode.ts:165-173`). Joint sizing would change an owner-specified policy and needs his sign-off.
3. **"As few as 4 max-stake bets" is the theoretical floor.** An $800 stake needs full-Kelly f* of at least 8%. From the formula, a +2% EV bet at about 1.91 stakes roughly $220, so around 11 such bets fill the day. The room can bind, but I could not determine how often: no ledger data is on disk (pl-history holds only boards, odds and props).
4. **The 2.6 cap on football singles is real but deliberate.** It excludes every football side or prop priced above +160 at DraftKings regardless of EV. It was retained on 2026-11-01: "the dedupe and the price cap are unchanged" (`found-mode.ts:124-128`). It is a conservative policy choice, and the profit cost is unquantified. MLB found bets have no such cap in `buildFoundLockEntry`.

**Fix assessment**
- Adding a distinct `found_no_room` reason is correct and cheap; ideally also stop re-summing the same candidates every pass.
- Joint sizing or per-pass room reservation, and raising `maxDec` for one-leg found bets, are policy proposals for the owner, not defect fixes.

<a id="f-c1-11"></a>
#### C1-11 — Historical allowlists and off-switches still gate straight bets (under quota, HRR-over ban, HR ban, outs off, narrow market lists)

- Severity: low. Area: selection and staking. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** Under quota: src/lib/under-bias.ts:1-20 (UNDER_BIAS.overShare 0.75; header quotes the owner's rule as scoped to 'use in parlays', from 3 days of data); applied to singles at src/lib/server/lock-card.ts:1155 and :1170 (`s.underLegs > 0 && (underLegs + s.underLegs)/(propLegs + s.propLegs) > maxUnderShare + 1e-9` - the first prop of a day can never be an under; 3 overs needed per under). lock-card.ts:1143 found_hr, :1144 found_hrr_over (CORE_RULES.noHrrOver, src/lib/paper-mode.ts:190-204), :1145 found_outs_off while pitcher_outs is still in STRAIGHT_MARKETS (:135-143, which also has no totals, HR, RBIs or runs). Football: src/lib/cfb/found.ts:81 PROP_MARKETS = pass_yds, pass_tds, rush_yds, receptions, rec_yds; :96 excludes side 'yes' and non-half-point lines; :138 excludes first-half markets.

**Impact.** Profit and model learning: +EV unders are refused purely by count, MLB game totals and whole prop families never reach the candidate list, and blanket bans prevent collecting the outcomes needed to recalibrate those markets. Each switch was introduced for a parlay-era or small-sample reason.

**Proposed fix.** Replace count quotas and blanket bans with per-market, per-side calibrated shrink weights (a weight of 0 where evidence says so), add totals to the MLB straight markets, and log refused candidates as shadow bets so the bans can be tested against results.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The cited code is real and the under-quota arithmetic is right, but two parts of the impact are wrong and the severity is overstated. I rate it low, not medium.

**Confirmed as described**
- `src/lib/under-bias.ts:1-20`: `UNDER_BIAS.overShare` is 0.75, and the header quotes the owner's rule as "for use in parlays", based on 3 served days.
- `src/lib/server/lock-card.ts:1155-1170`: `buildFoundLockEntry` (the straight-bet path, `straightDay` at :1079) applies the quota to singles. The first sided prop of a day can never be an under (1/1 > 0.25), and it takes 3 overs per under. ML/RL legs are sideless, so they never open room.
- `lock-card.ts:1143-1145`: the `found_hr`, `found_hrr_over` and `found_outs_off` drops exist. The H+R+RBI-over drop is hardcoded there, not read from `CORE_RULES.noHrrOver` (`src/lib/paper-mode.ts:197`).
- `lock-card.ts:135-143`: `pitcher_outs` is still in `STRAIGHT_MARKETS`, but it is dead while `isOutsOff` holds, so harmless.
- `src/lib/cfb/found.ts:81`, `:96`, `:138`: the five-market list, the `side !== "yes"` and half-point filters, and the first-half exclusion are all as cited.

**Corrections to the evidence and impact**
1. **Totals, RBIs and runs are not excluded by an allowlist.** The MLB board has no such categories. The four archived boards I opened (`pl-history/data/boards/2026-08-16`, `09-17`, `10-06`, `10-17` `.latest.json.gz`) carry only `batter_hits`, `batter_hits_runs_rbis`, `batter_home_runs`, `batter_total_bases`, `ml`, `rl`, `pitcher_outs` and `pitcher_strikeouts`. `STRAIGHT_MARKETS` covers every one except HR. "Add totals to the MLB straight markets" is therefore engine and model work, not a list edit.
2. **The bans do not block model learning.** `src/lib/pred-serialize.ts:215-238` logs every pregame board row in every category, HR and outs included, with side derived at :442. Calibration fits from that store, not from tickets placed.
3. **A per-market under-side calibrated shrink already exists.** `calW["mkt|u"]` is walked weekly at `src/engine2/calibration.ts:178-179` and `:695-700`. The count quota is a second penalty stacked on top of it, which is the strongest part of the finding. The proposed fix is partly built already, for the under side only.
4. **"Each switch was parlay-era or small-sample" is wrong for two of them.**
   - Outs off is the owner's verbatim order from 2026-10-06, the same day straights-only began, pending two confirmed model defects (`src/lib/found-mode.ts:137-150`).
   - The H+R+RBI-over ban rests on 121 of 231 core legs hitting 54% against 61% implied (`paper-mode.ts:163-165`).
   - `docs/session-handoff.md:159` records that all of these were deliberately kept when found mode shipped.
5. **The football exclusions are defensible, not historical leftovers.**
   - Football has no under quota at all.
   - The five markets are every over/under prop in `CFB_PROP_MARKETS` (`src/lib/cfb/props-types.ts:23-34`). Only yes-only and ladder markets are left out.
   - Anytime-TD fair value rests on an assumed 1.08 overround (`src/lib/cfb/props.ts:21-26, :64-65`).
   - First-half is a documented "full-game only" choice.

**Why low**
- Every MLB item is dormant: the last archived board is 2026-10-17 and today is 2026-11-12.
- It is paper trading only.
- Refusals are counted in `blockedReasons` (`lock-card.ts:1255-1256`), but no archived data shows how often `found_under_bias` actually fired, so the lost-EV claim is unmeasured.

**What survives**
A design critique: before MLB resumes, replace the count-based under quota on straights with the existing side-aware shrink. Logging refused candidates as shadow bets is a reasonable addition; today only counts are kept.

<a id="f-c1-13"></a>
#### C1-13 — Low-severity items: 2-decimal price rounding on straights, carried game start overwritten, non-atomic lease release, unfenced football ledger SET, early end of cadence

- Severity: low. Area: selection and staking. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** (a) lock-card.ts:194 `czDec: r2(czDec)` and :197 `bsDec: r2(bsDec)`; settlement uses czDec (src/lib/ticket-payout.ts:34-43), so e.g. -103 (1.9709) settles as 1.97. (b) lock-card.ts:1284 `games: { ...(carry?.games ?? {}), ...games }` lets a later run replace a carried game's {pk,start}; football keeps the existing value (found.ts:310). (c) src/lib/server/found-lease.ts:25-33 and football-lock.ts:655-663 release with GET then DEL (not atomic) and the ledger SET carries no fencing token; practically unreachable because the 300 s lease (found-lease.ts:14, football-lock.ts:644) is taken late and outlives the route budgets (generate 300 s with lease after collectSlate, scheduler 90, football 60). (d) football found/first-lock ledger writes are plain SET (football-lock.ts:759, :875) on a blob the settle pass and device PUT also write without the lease. (e) FOUND_MLB_SLOTS_PT = everyMinutes(8,19,60) and FOUND_FOOTBALL_SLOTS_PT = everyMinutes(8,19,15) end at 18:00 / 18:45 PT (src/lib/server/grading-progress.ts:191-192).

**Impact.** Small systematic payout rounding error on every straight; possible wrong start time for a carried game after a reschedule; theoretical lost-update windows on the football ledger; no found pass for late West-coast games after the last slot.

**Proposed fix.** Store and settle at the unrounded decimal (or the American price); keep the earliest-known start unless the feed marks a reschedule; release the lease with a compare-and-delete Lua script and add a version field checked before SET; extend slots to the last scheduled start.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-c2-4"></a>
#### C2-4 — Engine parlay headline price, EV, fair and 'to win' use best-of-any-book per leg, and the 'basis' ticket price mixes DraftKings and FanDuel legs

- Severity: low. Area: parlay pricing. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:2699 `dec` is the product of each leg's best price at any book; :2738 `evT=prob*dec-1`; :2759-2760 stake ladder and `toWin=Math.round(stake*(dec-1))` from that dec; :2749-2752 `bsDec` is the product of per-leg better-of-DK/FD. src/lib/sportsbook/mlb.ts:102 returns tickets untouched when the selected book is the settlement book, so those fields reach the page; src/components/mlb/ParlaysSection.tsx:108 badges `bsEv` in basis mode and :196 falls back to the engine `toWin` when czDec is missing. Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_mixed_basis.py` (all 142 archived boards): 24874 multi-leg tickets carry a full basis price and 9455 (38.0%) mix DK and FD legs; of 18892 tickets with both prices the headline price exceeds the settlement-book product by 2%+ on 14922 (79.0%) and by 10%+ on 5998 (31.7%); 8702 of 27594 multi-leg tickets have no settlement-book product at all yet still carry headline odds/EV/toWin. (Boards before 2026-09-17 settled at Caesars, so the settlement product there is Caesars.) Verified clean: czDec equals the product of leg prices on all 18892 checked tickets.

**Impact.** The 'basis' EV on 38% of tickets is the EV of a ticket that cannot be placed (half at DraftKings, half at FanDuel), and the headline odds/EV/to-win describe a price built from books outside DK/FD. Ranking by these overstates what the owner can actually get; the gap is at least 10% of payout on about a third of tickets.

**Proposed fix.** Compute two whole-ticket prices in build(): dkDec (all legs at DraftKings) and fdDec (all legs at FanDuel), null if any leg is missing at that book; set the basis to the larger and record which book. Remove `dec`/`odds`/`ev`/`fair`/`toWin` from the ticket or recompute them from the chosen single-book price, and hide tickets with neither.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in part: the engine fields are as described, but the two cited page paths are dead and nothing ranks or selects on these prices today, so medium is overstated. I downgrade to low.

**Engine evidence (confirmed)**
- legacy/index.html:2699 `dec` is the product of each leg's `l.odds`; legOf (:2647) takes that from `x.r.odds`, the row's headline price, and props are pulled at `regions=us` (:1366).
- :2738 `evT=prob*dec-1`; :2759-2760 stake ladder and `toWin` come from that `dec`.
- :2749-2752 `bsDecT` is the product of per-leg `l.bs`, each with its own `bsBook`.
- Correction: `fair` (:2739) is `1/prob` only, so it is not a book-price problem.
- Re-running `areaC_mixed_basis.py` reproduced every count: multi 27594, full_basis 24874, mixed 9455, both 18892, 2%+ 14922, 10%+ 5998, no_czDec 8702.

**Cited page paths (refuted)**
- src/components/mlb/ParlaysSection.tsx:105 hard-codes `const basisMode = false`, so :108 always badges `czEv`, and the `bsOdds` basis label (:203) and NO DK/FD BASIS chip (:228) never render.
- :154 `playable = shown.filter(t => t.czOdds != null)` is the only list rendered as cards, so the :196 fallback to engine `toWin` is unreachable. Tickets without a settlement price go to a collapsed list (:332-345) showing only name and missing legs.
- The card header shows `czOdds @ book` (:204); headline `odds` is not rendered.
- Order is `orderByMode(..., selMode)` (:130) with `selMode` fixed at "ev_gated" (:103, setter never called), which sorts by `czEv` (src/lib/board-order.ts:31). The "ranking overstates" impact does not hold for the page.

**Paper card (not affected today)**
- src/lib/server/lock-card.ts:260 routes found days to `buildFoundLockEntry`, which ranks on `czEv`/`czDec` (:1146-1151) and uses `bsDec` only as a non-null gate (:1149).
- Since STRAIGHT_SINCE 2026-10-06 (src/lib/found-mode.ts:103) it seats one-leg bets only, so a mixed-book basis cannot occur on new tickets.
- The dk_fd core allocator that did select on mixed `bsDec` (LOCK_SEL_MODE, lock-card.ts:69; legacy/index.html:3011, 3359) applies only before found mode.

**What does reach the page (missed by the finding)**
- ParlaysSection.tsx:310 renders `e.note`, and the engine note (legacy/index.html:2773-2779) embeds "Fair odds … · EV +N% … $stake to win ~$toWin" from the any-book `dec`. `priceMlbBoard` spreads `...t` (src/lib/sportsbook/mlb.ts:105), so the note survives repricing.
- On the newest archived board (pl-history/data/boards/2026-10-17.latest.json.gz, settlementBook draftkings), 19 of 45 rendered multi-leg tickets have a note EV at least 2 points off `czEv`. Example: the note says "EV +2% … $100 to win ~$125" while the same card shows +116 and `czEv` −2.1.
- The `stake` ladder and SAFER/BALANCED/LONGSHOT `tier` chip (:219, :267) also derive from the any-book `dec`.

**Impact, corrected:** a faint footnote on each ticket contradicts the card's own DraftKings price, EV badge and to-win. Mixed `bsDec`/`bsEv` is carried in the data and in pre-10-03 ledger records but is not shown or selected on now.

**Fix, corrected:** rebuild or drop the note's EV and to-win text from the single-book price, and derive `stake` and `tier` from `czDec`. The dkDec/fdDec whole-ticket split is only needed if a DK-vs-FD basis view is re-enabled. Hiding tickets with neither price is already done by the :154 filter.

<a id="f-c2-5"></a>
#### C2-5 — MLB parlay grading checks pending and ungradable before lost, so a ticket with a losing leg can sit outside the record

- Severity: low. Area: parlay pricing. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:3634-3637 order is pending -> ungradable -> lost (football checks lost first: src/lib/cfb/grade.ts:349-351). src/lib/ledger-stats.ts:48-49 skips pending and ungradable tickets entirely (not staked, not lost). Prediction-parlay grading has the same order: app/api/calibrate/route.ts:258-262 (pending skips, ungradable beats lost).

**Impact.** A multi-leg ticket that already has a lost leg plus one leg that can never be graded (postponed game, missing box score row) is recorded as ungradable: its stake never enters staked or losses, so parlay ROI and the prediction-parlay hit rate are biased upward. A ticket with a lost leg and a late game also shows as pending until the last game ends. Affects the 2026-08-15 to 2026-10-05 parlay record and the calibration parlays; one-leg tickets are unaffected.

**Proposed fix.** Reorder both graders to lost -> pending -> ungradable (a lost leg decides the ticket regardless of the others), then re-grade stored multi-leg tickets once and report how many flip from ungradable/pending to lost.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The ordering is real, but the impact is overstated and both worked examples in the finding are wrong. Downgrade to low.

**Confirmed in code**
- `legacy/index.html:3638-3643` (`shGradeTicket`) checks pending, then ungradable, then lost.
- This is the live MLB grader: `tools/extract-engine.mjs` copies the legacy script verbatim into `src/engine/legacy-src.gen.ts`, and `src/lib/useLedger.ts:109` calls `shGrade`.
- Football checks lost first (`src/lib/cfb/grade.ts:349-351`).
- `src/lib/ledger-stats.ts:48-49` counts pending and ungradable tickets but does not stake them.
- `app/api/calibrate/route.ts:258-262` has the same order for prediction parlays.

**Corrections to the impact**
1. A postponed, suspended or cancelled game grades the leg void, not ungradable (`legacy/index.html:3575`; `src/engine2/grade.ts:69-70`). A player missing from the box score is also void (`legacy/index.html:3613`). Void never short-circuits, so a lost leg plus a void leg already grades lost at line 3643.
2. A leg is ungradable only on data defects:
   - no stored game id (3572)
   - a Final game with a null score (3581)
   - no run-line point in the prop text (3588)
   - a malformed leg key (3602)
   - a non-finite pitcher stat (3617)
   - an unknown market (3632)
   
   A lost leg has to coincide with one of these on the same ticket.
3. "Pending before lost" is a display delay, not a record bias. `shGrade` re-grades every entry that is not done (`legacy/index.html:3679`, `3704-3705`), so the ticket flips to lost when the last game goes final. It stays out of the record only if a leg is pending forever (no schedule status for its game, or the box score fetch never succeeds: 3574, 3606).
4. The "prediction-parlay hit rate" bias is unsupported. I found no reader of the stored parlay result: the only references are the calibrate write and the merge that preserves it (`src/lib/pred-serialize.ts:375-378`).
5. Whether any stored ticket was actually affected could not be determined. The ledger is not on disk; `pl-history/data` holds only odds, board and prop archives, with no "ungradable" string anywhere.
6. Ungradable and pending counts are surfaced rather than hidden (`src/lib/ledger-stats.ts:81`), and the rule is pinned by `tests/ledger-eras.test.ts:60-64`.

**Fix notes**
- Lost-first is the right order. The MLB change must be made in `legacy/index.html` and regenerated with `tools/extract-engine.mjs`; the parity tests apply.
- Ungradable entries are never marked done, so they re-grade on the next run without a separate migration.
- Other consumers also skip ungradable tickets and would pick up any flips: `src/lib/ledger-segments.ts:168`, `src/lib/core-shapes.ts:305`, `src/lib/noplay.ts:104`.
- Multi-leg MLB tickets stopped being issued from 2026-10-06 (`src/lib/found-mode.ts:103`), so this affects the historical record only.

<a id="f-c2-6"></a>
#### C2-6 — Void leg handling differs by sport: football voids the whole parlay (payout 0, not counted), MLB divides the leg out

- Severity: low. Area: parlay pricing. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/grade.ts:350 any ungradable leg -> ticket `ungradable`, payout 0 (pushes are dropped and repriced at :354-358; a leg pending past the void window is turned into ungradable at :335-338). MLB: legacy/index.html:3640-3651 divides void and push legs out of the ticket price. src/lib/ledger-stats.ts:49 leaves ungradable tickets out of staked and returned.

**Impact.** A football double or 3-5 leg fun parlay with one cancelled/void leg and the rest winning drops out of the paper record instead of paying at the reduced price, which is what a sportsbook does with a void leg. Wins are understated and the two desks' records are not comparable. Bounded: football parlays were only on the card 2026-09-05 to 2026-10-05.

**Proposed fix.** In settle(), treat an ungradable (void) leg like a push: skip it, multiply the remaining leg prices, return the stake if no leg stood. Keep 'ungradable' only for a ticket where no leg price is stored.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real: I opened all three cited files and the behaviour is as described, but I would rate it low, not medium, and the proposed fix is too broad.

**Evidence confirmed**
- Football: `settle()` at src/lib/cfb/grade.ts:348-363 returns `ungradable`, payout 0, if any leg is ungradable (:350). Push legs are skipped and the rest repriced (:354-358). A leg still pending past the void window becomes ungradable at :336-338.
- MLB: `shGradeTicket` at legacy/index.html:3638-3655 divides void and push legs out of the ticket price (:3644-3651).
- Ledger: src/lib/ledger-stats.ts:49 skips ungradable tickets before staking. Football uses the same function (src/lib/cfb/ledger.ts:56-58), so a voided football parlay leaves both staked and returned.
- No guard elsewhere: `CfbLegResult` (src/lib/cfb/grade.ts:39) has no `void` state at all. MLB has one (src/engine2/grade.ts:9; postponed game :70, lineup scratch :97/:101/:111).

**Corrections to the finding**
- The difference is in how each sport classifies the leg, not in how it treats "ungradable". MLB also kills the whole ticket on an ungradable leg (legacy/index.html:3641-3642). MLB simply labels postponed games and scratches as `void`, while football sends everything to `ungradable`.
- Football checks `lost` before `ungradable` (:349), so a parlay with a lost leg still books as a loss. Only parlays where every other leg won or pushed are affected.
- The bounded window checks out: `STRAIGHT_SINCE = "2026-10-06"` (src/lib/found-mode.ts:103) and `legCap` is 1 on straight days (src/lib/cfb/found.ts:142-143). Football core `maxLegs` is 2 (src/lib/cfb/rules.ts:47, src/lib/nfl/rules.ts:39).

**Why low**
- Single-leg tickets are unaffected (void means stake not counted, which is correct), and every football ticket since 2026-10-06 is single-leg.
- It needs a postponed or cancelled game, or an unreadable stat, inside a parlay whose other legs all won, within a one-month window.
- I found no stored evidence that it ever happened. The history branch holds odds, board and props archives, not the ledger; a grep for `"ungradable"` over the uncompressed files in pl-history/data found nothing (the gzipped board archives were not searched).
- It is paper trading only, and the ticket is shown as void rather than mis-scored as a loss.

**Fix needs narrowing**
Football's `ungradable` currently mixes true voids with read failures:
- final game with an unreadable score (`voidWindowMs`, :249-253);
- "unsupported prop settlement" (:132);
- "final player statistic unavailable" (:128);
- a spread or total leg with no line (:149, :158).

Treating all of these as a push would pay a reduced parlay on a leg that may actually have lost. A safer fix adds a distinct `void` leg result for the postponed / no-final-after-48h case only, divides that out, and keeps whole-ticket `ungradable` for data failures.

Separately, the overlay accepts a late real result over `ungradable` (src/lib/football/store.ts:172, :213), so a repriced "won" must stay replaceable in the same way.

<a id="f-c2-7"></a>
#### C2-7 — Fun HR longshot and H+R+RBI ladder tickets allow same-game legs and multiply raw, unshrunk probabilities

- Severity: low. Area: parlay pricing. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/fun-hr.ts:101 the only exclusion is one-per-team, so two hitters from opposing teams in one game can share a ticket; price and probability are plain products at :121-122 and EV at :131 (header :24-26 says naive multiplication). Ladder: `teamCap: 2` at src/lib/fun-hr.ts:163-168 allows up to 4 legs from one game, products at :213-214. Pool probabilities are the raw engine `r.prob` (src/lib/server/lock-card.ts:782-801), not the shrunk number used for core tickets. The repo's own measurement records HR pair dependence 1.065 [1.022, 1.140] for opposing teams in the same game and 1.103 same team (docs/auto-lock-memo.md:763-776). The one-sided HR fair is implied/1.06 (legacy/index.html:2491) while /private/tmp/claude-501/pl-history/data/hr_overround.json measures overround 1.1609 over 87 days / 7581 rows ('czEV overstated ~6.2pp').

**Impact.** Each HR leg's probability is overstated by the too-small de-vig and that error compounds across 3-8 legs, so the stored probability and EV of every fun ticket are too high; same-game pairs are additionally paid at a product price a book would not offer on an SGP. Bounded: fun stakes were small and fun has been $0 since 2026-10-06, but the composer still runs if fun is re-enabled.

**Proposed fix.** Add a one-leg-per-game rule (gkey) to buildFunHrTickets and cut the ladder to one leg per game; feed both composers the shrunk probability; replace the 1.06 divisor with the measured overround (1.16) or a per-price de-vig before any HR leg is multiplied.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but severity is overstated: this is dormant, paper-only, small-stake code, so low rather than medium.

Verified as cited:
- src/lib/fun-hr.ts:100-102 — the HR composer excludes only on repeat cap, team and player. `gkey` is carried on FunLegSrc (:48) but never checked, so two hitters from opposing teams in one game can share a ticket.
- src/lib/fun-hr.ts:121-122, :131 — price, probability and EV are plain products; header :24-26 discloses the naive multiplication.
- src/lib/fun-hr.ts:163-168, :206, :213-214 — ladder `teamCap: 2` with no game cap, so up to 4 legs from one game; same products.
- src/lib/server/lock-card.ts:782-801 and :808-827 — both pools take raw `r.prob`. The found-day path `buildFoundFun` (:1017-1068) does the same. Core tickets go through `shrinkTicket(..., CORE_RULES.shrinkW)` at :312 and :1115; fun never does.
- docs/auto-lock-memo.md:771-775 — 1.103 [1.048, 1.168] same team, 1.065 [1.022, 1.140] opposing teams same game, 0.982 different games.
- legacy/index.html:2491 — `fair=oneImp/1.06` for one-sided markets.
- /private/tmp/claude-501/pl-history/data/hr_overround.json — days 87, rows 7581, appeared overround 1.1609, verdict "czEV overstated ~6.2pp". It is the repo's own tracked measurement (history-branch commits "hr overround: ...").

Corrections to the finding:
1. The 1.06 error does not hit the whole leg probability. At legacy/index.html:2491 the probability is `wPr*pO+(1-wPr)*fair`, so only the market-weighted share is biased; the overround file's own verdict says "0.65 x relative bias". The overstatement still compounds over 3-7 HR legs.
2. The 1.06 divisor applies to HR legs only. Ladder legs (H+R+RBI / Hits O 0.5) are not shown to use it; the ladder's defects are the missing game cap and the unshrunk probability.
3. The same-game dependence is positive, so the naive product slightly understates the true joint probability for those pairs (about 6.5% relative per opposing pair). That partly offsets the probability overstatement. The real same-game problem is the price: a book would not pay the product of singles on a same-game parlay.
4. The header comment (:24-26) only claims independence for legs "from different games", and the memo measured that case at 0.982. The code simply does not enforce the different-games condition.

Why low:
- Fun composition is gated off on every straights-only day: `foundFunOf(date)` returns 0 from STRAIGHT_SINCE 2026-10-06 (src/lib/found-mode.ts:103, :119-120), checked at src/lib/server/lock-card.ts:1238.
- Fun stakes were $25/day paper (PAPER.fun, src/lib/paper-mode.ts:37; FOUND.fun, src/lib/found-mode.ts:60) at flat size, so the inflated probability and EV never drove a stake. The effect is on the stored prob/czEv of fun tickets only.
- No stored fun tickets exist in pl-history to check for actual same-game pairs; I could not determine how often it happened.

The proposed fix is reasonable if fun is ever re-enabled: one leg per `gkey` in both composers, shrunk probability in, and the measured overround for the HR de-vig.

<a id="f-c2-8"></a>
#### C2-8 — Parlay sets still contain duplicate tickets, and same-game groups the sim cannot grade are priced as independent with no flag

- Severity: low. Area: parlay pricing. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** Tickets are pushed without a duplicate check at legacy/index.html:2798, :2809, :2819. Command `python3 /private/tmp/claude-501/audit-out/scripts/areaC_parlay_probe.py`: 1884 duplicate tickets (same set, same leg list) on 125 of 142 boards; 942 of 7306 same-game tickets (12.9%) priced naive with no simJoint, 485 of them pure pitcher strikeout/outs groups (the sim only grades hits, total bases, HR, H+R+RBI, moneyline and run line: legacy/index.html:1894-1910, :2124-2138); `probNaive` is only written when simJoint ran (legacy/index.html:2764).

**Impact.** Duplicates take list slots and per-player cap room from distinct tickets. Two pitchers' strikeout or outs legs from one game (opposing starters share the game's length and run environment) are multiplied as independent and the ticket carries no marker that it was not jointly priced.

**Proposed fix.** De-duplicate by sorted leg-key string before each push. Stamp `jointUnpriced: true` on any ticket with a same-game group the sim could not grade and exclude it from EV ranking (or add K/outs legs to the sim).

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-c2-9"></a>
#### C2-9 — Small payout-maths edge cases in parlay code

- Severity: low. Area: parlay pricing. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** (a) legacy/index.html:3647-3649 a void/push leg whose stored `cz` is null is not divided out, so the ticket pays as if that leg had won. (b) legacy/index.html:3598 run-line leg is `(margin+pt>0)?"won":"lost"`, an exact-margin result on a whole-number line grades lost instead of push. (c) src/lib/ticket-math.ts:32-33 `decToAm` returns -Infinity at dec = 1 (ticket where every leg is removed). (d) src/lib/server/lock-card.ts:838 fun ticket czDec rounded to 2 decimals while engine tickets keep 4, and grading pays stake x czDec. (e) src/lib/cfb/card.ts:135-137 football ticket EV uses win/(1-push) per leg, which overstates true EV by the factor 1/(1-push) and feeds Kelly at :141-147. (f) src/lib/ticket-math.ts:47-68 sandbox payout is unrounded stake x dec while src/lib/parlay-calc.ts:35-46 rounds to cents.

**Impact.** Each is a cents-to-few-percent error on rare tickets: an overpaid ticket when a void leg has no stored price, a mis-graded whole-number run-line push, a display glitch, and a slightly generous football EV/stake on spread and total legs that can push.

**Proposed fix.** (a) grade the ticket ungradable when a void/push leg has no stored price; (b) add `margin+pt===0 -> push`; (c) guard decToAm for dec <= 1; (d) store 4 decimals; (e) compute EV as win x dec + push - 1 and Kelly on the win/lose/push outcome set; (f) round sandbox payout to cents.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-d-6"></a>
#### D-6 — NFL player-prop legs with no ESPN stat row are voided at 48 hours instead of settled, then vanish from the record; CFB props can never settle

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** src/lib/football/prop-settlement.ts:4 ("absent athletes are never zero") and :12-19: a player is recorded only if he has a row in the ESPN stat group that carries that key. src/lib/cfb/grade.ts:126-128: missing stat gives pending "final player statistic unavailable"; :335-338 turns any pending leg into ungradable once the void window passes (ungradableMs 48h, src/lib/cfb/rules.ts:591); settle() at :348-363 books an ungradable ticket at payout 0. src/lib/ledger-stats.ts:49: ungradable tickets are skipped (not staked, not counted). src/lib/server/football-prop-finals.ts:7 swallows fetch errors with a 7 s timeout. src/lib/server/football-lock.ts:316 attaches player stats for NFL only. Found props are over/under on pass_yds, pass_tds, rush_yds, receptions, rec_yds (src/lib/cfb/found.ts:80-99).

**Impact.** An active player with zero carries or zero targets has no row, so an Over that lost (or an Under that won) is recorded as a void and drops out of staked, W-L and ROI. A name or team-id mismatch between the odds feed and ESPN has the same effect. The reported record is biased by an unknown amount and nothing flags which tickets were voided by the clock.

**Proposed fix.** Read the ESPN summary roster/participation data to tell did-not-play (void per sportsbook rules) from played-with-no-stat (settle at 0). Match by ESPN athlete id stored on the leg at lock rather than by display name. Push an alert listing every leg the 48-hour clock voids, and show clock-voided tickets as their own count in the stats.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The code path is confirmed, but the finding overstates its reach and visibility; I rate it low, not medium.

**Confirmed in code**
- src/lib/football/prop-settlement.ts:4,12-19: a player gets a stat only if he has a row in an ESPN boxscore group carrying that key with a numeric cell.
- src/lib/cfb/grade.ts:126-128: a missing stat returns pending "final player statistic unavailable".
- src/lib/cfb/grade.ts:249-253 and :335-338: the long re-check window applies only to unreadable home/away scores, so a prop leg voids at ungradableMs (48h for NFL at src/lib/nfl/rules.ts:136, for CFB at src/lib/cfb/rules.ts:591).
- src/lib/cfb/grade.ts:350: a ticket with a void leg settles as ungradable at payout 0.
- src/lib/server/football-lock.ts:316: player stats are attached for NFL only.
- src/lib/server/football-prop-finals.ts:7: 7 s timeout, errors swallowed.
- src/lib/cfb/found.ts:81,96: found props are over/under on the five markets named.
- Football stats skip ungradable tickets from staked and P/L (src/components/cfb/CfbLedger.tsx:757, and the comment at :942).

**Corrections**
1. **"Vanish from the record" and "nothing flags" are overstated.** Voids are counted and shown as "N void" on the Record tile (src/components/cfb/CfbLedger.tsx:957). The ticket card carries a VOID pill (src/components/cfb/CfbTicketCard.tsx:101). The leg detail reads "final player statistic unavailable · 48h past kickoff — void" (src/lib/cfb/grade.ts:337). What is missing is only a push alert and a split between clock-voids and true voids.
2. **"CFB props can never settle" is true but has no reach.** Paper prop legs come only from board.paperProps (src/lib/cfb/card.ts:249-251, src/lib/cfb/found.ts:86-87). That is populated only in app/api/nfl/lock/route.ts:221,274 and in the builder when L.id==="nfl" (src/components/cfb/CfbBuilder.tsx:397). No CFB prop leg is ever locked on the paper card.
3. **The trigger is narrow.** A player who did not play is correctly a void under sportsbook rules. The wrong case is an active player with a posted line who has no row in the relevant group. The repo's own test fixture (tests/nfl-variety-paper.test.ts:22) shows a "0" receptions row parsing to receptions:0. Whether ESPN omits zero-carry or zero-target players could not be checked offline; it is plausible but unproven here.
4. **Fetch failures are not a real contributor.** The settle pass re-reads on every poke inside the 48h window (src/lib/server/football-lock.ts:293-316), so a 7 s timeout would need to persist for two days.
5. **Name-mismatch risk is partly guarded.** A leg locks only when teamId was resolved through the ESPN context lookup and is one of the game's two teams (src/lib/cfb/found.ts:95, src/lib/cfb/props-context.ts:122,169). The fix point stands, though: athleteId is known at that lookup (src/lib/cfb/props-context.ts:169) but is not stored on the leg (src/lib/cfb/found.ts:103-119), and the grader re-matches by name via imageNameKey (src/lib/cfb/grade.ts:127).

**Could not determine**
- No stored NFL ledger data exists in pl-history (it holds only MLB-era daily files, boards and props), so whether a clock-void of a prop leg has ever happened is unknown.

**Impact as corrected**
A small, direction-ambiguous bias in paper ROI: Over losses and Under wins both become voids, on rare legs, and the void is visible. The proposed fix is reasonable; store the ESPN athlete id on the leg and separate did-not-play from played-with-no-stat. Drop the CFB part.

<a id="f-d-7"></a>
#### D-7 — MLB run line and moneyline grading ignores shortened games and has no run-line push; suspended games are voided permanently

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:3583-3584 and src/engine2/grade.ts:69-71: any state matching /final|game over|completed/ grades, which includes rain-shortened "Completed Early" games; /postpon|suspend|cancel|forfeit/ returns void. legacy/index.html:3593-3598 and src/engine2/grade.ts:80-86: ML is `hR>aR ? won : lost` and RL is `margin+pt>0 ? won : lost`, with no equal-to-zero push branch and no innings check. The grader header still names the ruleset as Caesars (legacy/index.html:3571-3577) while the settlement book is DraftKings. A suspended game graded void makes the ticket a push and the day done (legacy/index.html:3650-3653, :3703-3705), so it is never re-graded when the game resumes under the same gamePk.

**Impact.** On a shortened game a run-line ticket is graded won or lost where sportsbook rules I recall (not verifiable offline) void run lines and totals short of 9 innings (8.5 with the home side ahead). An integer run line landing exactly would be graded lost instead of push; this is latent because the board prices only the main +/-1.5 line from the `spreads` market (legacy/index.html:2216). Rare, but it is wrong money each time it occurs.

**Proposed fix.** Carry innings played from the linescore into GameStatus. Void RL (and any future totals) when fewer than 9 innings (8.5, home ahead) were played; keep ML action after 5 (4.5). Add `margin+pt===0` as push. Leave suspended games pending until statsapi shows a final or a postponement. Write the DK and FD rule each branch implements beside it and replace the Caesars header.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Could not refute the code claims: every cited line is as described. Severity is overstated (low, not medium), and the suspended-game half is weaker than the shortened-game half.

**Confirmed by direct read**
- legacy/index.html:3583-3584 and src/engine2/grade.ts:69-71: /postpon|suspend|cancel|forfeit/ returns void; /final|game over|completed/ grades. The input is statsapi `detailedState` (legacy/index.html:3688, app/api/calibrate/route.ts:108, src/lib/server/mlb-day-won.ts:131), so a "Completed Early" state would grade.
- legacy/index.html:3593-3598 and src/engine2/grade.ts:80-86: ML is `hR>aR ? won : lost`; RL is `margin+pt>0 ? won : lost`. There is no `=== 0` push branch and no innings input.
- `GameStatus` is `{state, away, home}` only (src/engine2/grade.ts:13). No innings field exists in grade.ts or mlb-day-won.ts, and I found no guard elsewhere. A search for "Completed Early" across src, app, tests, legacy and docs returned nothing.
- The header still says "Caesars void rules" (legacy/index.html:3571-3577; src/engine2/grade.ts:3-4 says the same), while `SETTLE_BOOK` is 'draftkings' (src/lib/sportsbook/books.ts:12).
- The void is terminal on both paths:
  - Ledger: an all-void ticket becomes a push (legacy/index.html:3653), which leaves `done` true (:3702-3705), and `shGrade` only revisits entries with `!grading.done` (:3679).
  - Calibration rows: any non-pending `res` is skipped (app/api/calibrate/route.ts:214-229, :249).
- The legacy grader is the live ledger grader: src/lib/useLedger.ts:109 calls `shGrade`.
- The run-line point is the modal `spreads` point, not hard-filtered to 1.5 (legacy/index.html:1313-1317), so the missing push is latent as the finding says.

**Corrections**
1. The title overstates the moneyline part. A "Completed Early" game is already an official game, so grading ML on it is right under the usual 5-inning (4.5 home ahead) rule as I recall it. Only RL (and any future totals) is wrong on a shortened game.
2. "Suspended voided permanently" is true of the code but not shown to be wrong. I could not verify DK or FD suspended-game rules offline; they may void bets when the resumption falls outside a time window. The proposed "leave pending until final" could itself diverge from book rules. Whether statsapi keeps the same gamePk on the original date after a resume was also not verifiable offline.
3. The proposed fix needs innings data on all three status fetchers. Legacy already hydrates the linescore (legacy/index.html:3685) but reads only runs. The calibrate route (:103) and mlb-day-won.ts (:127) fetch the schedule without linescore, so both need the hydrate added.
4. Impact also reaches the server found-mode win read: src/lib/server/mlb-day-won.ts:74 uses the same `gradePrediction`, so a mis-graded RL win on a shortened game would add room to the day's $2,500 ceiling.

**Why low**
- It is paper trading only.
- It needs an RL ticket to land on one of the few weather-shortened or suspended games per season.
- The integer-line push is latent.
- The affected sportsbook rules are recalled, not verified.

<a id="f-d-8"></a>
#### D-8 — Doubleheader handling is fragile: leg results and ticket ids ignore the game, the stored game reference can be overwritten, and one real mis-pointing needed a hard-coded repair

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** legacy/index.html:3639 and :3699-3701: leg results are stored and looked up by `label|prop` with no gkey, first leg with that text wins. legacy/index.html:2985-2987: shTicketId hashes only type plus sorted `label|prop`, so the same side in game 2 of a doubleheader produces the id already on the card and is skipped by the dedupe at src/lib/server/lock-card.ts:1110-1115. The gm suffix exists only when the day's schedule lists the matchup twice (legacy/index.html:1221, :1238) and the odds event is assigned by nearest start time (:1209-1216). src/lib/server/lock-card.ts:1284: `games: {...(carry?.games ?? {}), ...games}` lets a later pass replace the pk/start that already-locked legs point at. src/lib/ledger-merge.ts:2190-2208: hard-coded DH_REPAIR for 2026-07-18 pittsburghpirates@clevelandguardians, wrongPk 824412 to 824414, which also clears that day's grading.

**Impact.** A locked leg can be graded against the other game of a doubleheader (it happened once and was fixed by hand in code). The second game's identical bet can never be recorded. Any future recurrence needs another code change to repair.

**Proposed fix.** Store gamePk and scheduled start on every leg at lock time and grade from the leg's own pk. Key leg results by `gkey|lkey`. Include gkey in the ticket-id hash. Never overwrite an existing games[gkey] that a locked ticket references; write a new key and log the conflict instead.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every citation checks out, but the impact is overstated and the proposed fix is unsafe as written; I rate this low, not medium.

CONFIRMED EVIDENCE
- legacy/index.html:3639 and :3700-3701: leg results are keyed `l.label+"|"+l.prop`, first leg wins (`if(!legRes[lid])`).
- legacy/index.html:2985-2987: shTicketId hashes type plus sorted `label|prop`, no gkey. ML legs are label = team, prop = "ML vs opp" (legacy/index.html:2189), so the same side in GM1 and GM2 is textually identical.
- legacy/index.html:1221 and :1238: the gm suffix exists only when the day's schedule lists the matchup twice. :1209-1216: odds events are assigned by nearest start time.
- src/lib/server/lock-card.ts:1284 (and :934): `games: { ...(carry?.games ?? {}), ...games }`.
- src/lib/ledger-merge.ts:2190-2208: DH_REPAIR for 2026-07-18, wrongPk 824412 to 824414, clears grading and gradedAt.

CORRECTIONS
1. The 7/18 root cause is already fixed. The DH_REPAIR comment (src/lib/ledger-merge.ts:2180-2189) says the engine "used to collapse both games of a same-day matchup into one key". gameInfo is now keyed with the gm suffix (legacy/index.html:2896) and tests/doubleheader.test.ts:8-13 is a regression test for exactly this. DH_REPAIR is a one-off, idempotent data repair, not a sign of a live defect.
2. "A locked leg can be graded against the other game" is not reachable on the current card through the `label|prop` key. The card's no-repeat rule uses the same key (`foundLegKey`, src/lib/server/lock-card.ts:1013, checked at :1164-1166, carried legs seeded at :1124-1131), so two same-text legs never sit on one day's card. This is deliberate and test-enforced: tests/lid-coupling.test.ts:7-28 states the GM2 drop "is the ONLY reason `lid` never collides in grading and CLV", and docs/collection-period.md:2102-2117 documents it.
3. "The second game's identical bet can never be recorded" is true but known and intentional. The on-card skip is src/lib/server/lock-card.ts:1140 plus the usedLegs check; the cited :1110-1115 is only the within-pass pool dedupe. Player props are blocked in GM2 anyway by the one-bet-per-player-market rule (`foundMarketKey`, :1006-1011). The practical loss is an occasional GM2 ML/RL paper bet on the same side.
4. The games overwrite is theoretical. `games` is rebuilt from the full gameInfo each pass (:1265-1266) and gkey to pk is stable once the gm suffix exists. If a second game is added mid-day the keys change (a@b becomes a@bgm1 / a@bgm2), so the old key is kept, not overwritten. I found no concrete path where the same gkey gets a different pk on the same date. Updating `start` on a delay is harmless.
5. The proposed fix is dangerous as written. Keying legRes by gkey or adding gkey to the ticket-id hash on its own breaks the lid-coupling invariant (the test fails by design) and changes stored ticket ids that append-only carry and the ledger merge rely on. The repo's ordered lift procedure is at docs/collection-period.md:2234 onward: all six key sites change in one commit, using `gkey|label|prop`, not `gkey|lkey` (:2262).

RESIDUAL REAL RISK (low)
- GM2 same-text legs are dropped: a small, documented coverage gap on doubleheader days.
- The nearest-start-time heuristic in evGnum, and a gm suffix that depends on the schedule listing both games, are unguarded heuristics.
- Device-side shGrade is the only writer of MLB `grading` (src/lib/useLedger.ts:109; src/lib/server/mlb-day-won.ts:9-11), and it reads the pk from entry.games[leg.gkey] (legacy/index.html:3579). A wrong stored pk would still mis-grade silently, but I found no current path that produces one.

Paper trading only, and the MLB season is over as of today. I did not check pl-history for actual doubleheader days.

<a id="f-d-9"></a>
#### D-9 — MLB payouts are computed from a decimal price rounded to two places, not the locked American price

- Severity: low. Area: grading and ledger. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/lock-card.ts:145 (`r2 = Math.round(x*100)/100`) and :194 (`czDec: r2(czDec)`). legacy/index.html:3645 (`baseDec = confirmed != null ? amToDec(confirmed) : t.czDec`) and :3654 (`payout: Math.round(t.stake*eff*100)/100`). src/lib/server/mlb-day-won.ts:79-81 uses the same rounded czDec for the same-day winnings room. Football settles from the American price at four decimals (src/lib/cfb/grade.ts:356 per the earlier read).

**Impact.** The booked return differs from the real DraftKings return by up to 0.005 x stake per winning ticket. Worked example: $800 at -140 pays $1,371.43 at the book; 800 x 1.71 books $1,368.00, a $3.43 understatement. At -150 (1.6667 stored as 1.67) the same stake is overstated by $2.67. Errors accumulate across every MLB straight win and feed the found-day room.

**Proposed fix.** Settle MLB tickets from the leg's stored American price (`cz`) via amToDec at full precision, or store czDec at 4+ decimals. Keep rounding to cents only on the final payout.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code; severity overstated (low, not medium).

What I checked:
- src/lib/server/lock-card.ts:144-145 defines amDec (full precision) and `r2 = Math.round(x*100)/100`; :194 stores `czDec: r2(czDec)` (and :197 bsDec) on every straight-pool ticket. The found-mode writer copies it unchanged to the locked ticket (:1212 `czDec: pl.czDec ?? null`; core path :720). src/lib/shrink.ts:71-79 only reads czDec, never widens it.
- legacy/index.html:3645 `baseDec=(t.confirmed!=null)?amToDec(t.confirmed):t.czDec` and :3654 `payout:Math.round(t.stake*eff*100)/100`. The same line is present in src/engine/legacy-src.gen.ts (1 match), and src/lib/useLedger.ts:109 calls the engine's shGrade, so this is the live MLB ticket grader. I found no server-side ticket grader for MLB (app/api/calibrate grades board predictions, not ledger payouts).
- `confirmed` is null on server-locked tickets: lock-card.ts never sets it (no match), legacy snapshot sets `confirmed:null` (legacy/index.html:3404) and only a manual entry sets it (:3456-3459). So the 2-dp czDec is what settles.
- src/lib/server/mlb-day-won.ts:79-81 uses settlingDec (src/lib/ticket-payout.ts:34-37 -> czDec) so the found-day room carries the same rounding; its own comment (:18, :56) says this mirrors the device grader on purpose.
- Football contrast is real: src/lib/cfb/grade.ts:353-360 multiplies decFromAmerican(legs[i].cz) at full precision and rounds only the payout; src/lib/cfb/card.ts:161 stores czDec at 4 dp.
- No guard elsewhere: the leg does carry the American price (`cz`, lock-card.ts:174) but the grader only uses leg cz to divide out void/push legs (legacy/index.html:3649-3650), not to price a winning straight.
- Arithmetic verified: -140 = 1.714286 -> 1.71; $800 books $1,368.00 vs $1,371.43 (-$3.43). -150 = 1.666667 -> 1.67; $800 books $1,336.00 vs $1,333.33 (+$2.67). Max stake is $800 (src/lib/found-mode.ts:63-76: 4 x 10000 x 0.02), so the bound is $4.00 per winning ticket.

Corrections to the finding:
- Scope: this is specific to tickets built in lock-card.ts, not all MLB tickets. The legacy parlay builder stores czDec at 4 dp (legacy/index.html:2766). The 2-dp cases are the straight pool (:194) and the fun HR/ladder tickets (:838, :1055). Because MLB is straight-bets-only now, that does cover every new MLB ticket.
- Impact: the error is at most 0.5% of stake and is two-sided (round-to-nearest), so it behaves as near-zero-mean noise rather than a systematic bias; "errors accumulate" overstates it. It never changes a win/loss result, only cents-to-dollars of booked P&L and at most $4 of same-day room per won ticket. Paper trading only. That is a bookkeeping-precision defect, hence low.
- Fix: the cheapest correct change is storing 4 dp at lock-card.ts:194/:197 (and :838/:1055), matching legacy :2766 and cfb/card.ts:161, which fixes both the grader and mlb-day-won without touching legacy/index.html (editing the legacy grader would also require regenerating src/engine/legacy-src.gen.ts and passing the engine-parity tests). Check src/lib/ledger-segments.ts:225, which compares the grade's 4-dp `dec` to t.czDec at 1e-9 to flag "repriced": today a 2-dp czDec vs 4-dp graded dec would not trip it only because the grader's eff equals the same 2-dp czDec; a 4-dp store keeps them equal. Already-graded tickets would keep their booked payouts (grading is idempotent), so history will not self-correct without a deliberate regrade.
- Not verified against stored data: I did not find ledger tickets in /private/tmp/claude-501/pl-history (it holds odds/board archives), so the size of the realised error across past wins could not be determined from disk.

<a id="f-d-10"></a>
#### D-10 — MLB stats silently exclude ungradable and merge-dropped tickets; an ungradable MLB ticket never resolves

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** src/lib/ledger-stats.ts:48-49: pending and ungradable tickets are counted but excluded from staked and return; only e.core and e.funT are iterated (:42), so tickets the merge moved to coreDropped/funDropped with a settled receipt (coreDroppedPL / funDroppedPL, src/lib/ledger-merge.ts:722-738) are not in P/L. `grep -rn droppedPL src/lib/ledger-stats.ts src/lib/bankroll.ts app/ledger` returns nothing; only the football ledger component reads them (src/components/cfb/CfbLedger.tsx:199). legacy/index.html:3580, :3634, :3646 return ungradable for "no game id stored", "unknown market" and "no locked price", and :3705 keeps the day not-done, so the device refetches it on every Ledger open with no escalation.

**Impact.** A ticket that cannot be graded sits outside the record indefinitely, and a settled ticket dropped by a merge loses its P/L on the MLB desk. Reported profit is recomputed from per-ticket stake and stored payout at render (no stored running total to drift), so these omissions are the main way the MLB total can be wrong without any figure looking inconsistent.

**Proposed fix.** Show ungradable tickets as an explicit open-exposure line with age, alert when one is older than 48 hours, and add coreDroppedPL/funDroppedPL receipts to MLB ledgerStats and realizedPL the way CfbLedger does.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-d-11"></a>
#### D-11 — Epoch archive key is hard-coded to e1, so a future epoch bump would clear the ledger with no new archive

- Severity: low. Area: grading and ledger. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** src/lib/ledger-epoch.ts:21 (`EPOCH_ARCHIVE_KEY = "pl:ledger:archive:e1"`); src/lib/server/ledger-epoch-server.ts:25-28 writes the archive with SET ... NX and then resets the live ledger. With the e1 key already present, a bump of LEDGER_EPOCH to 3 would make the NX write a no-op and still reset the ledger.

**Impact.** The next deliberate "clear the ledger" would destroy the paper-era record instead of archiving it.

**Proposed fix.** Derive the archive key from the epoch being retired (pl:ledger:archive:e<cur>) and refuse to reset unless the archive write returned OK or an identical archive already exists.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-d-12"></a>
#### D-12 — CLV sightings on the ledger keep the base copy's value rather than the latest, and oversized CLV writes are skipped silently

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** src/lib/ledger-merge.ts:1589-1591: `out.clv = {...other.clv, ...out.clv}`, so the base copy's sighting wins per leg regardless of each sighting's `at`. app/api/clv/route.ts:139: `if (blob.length <= MAX_BYTES) await redis(["SET", ...])` with no else branch or log. CLV keys are `label|prop` (app/api/clv/route.ts:143-147), the same game-blind key as grading.

**Impact.** The closing-line record, which is the main honesty check on the model, can hold an earlier sighting than the true close and can stop updating without notice.

**Proposed fix.** Merge CLV per leg by greatest `at`. Log and alert when the write is skipped. Key sightings by gkey plus lkey.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-d-13"></a>
#### D-13 — Score-orientation repair rewrites stored grade detail strings in place with no prior value kept

- Severity: low. Area: grading and ledger. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** legacy/index.html:3661-3676 (shGradeOrientFix overwrites g.detail). Prior audit item M22 lists this as still missing in /private/tmp/claude-501/audit-out/prior-audit-regression.md.

**Impact.** A stored settlement detail can change after the fact with no trace, which weakens any later audit of how a ticket was graded.

**Proposed fix.** Keep the original string under detailPrev with a timestamp, or apply the orientation fix at render only.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e1-6"></a>
#### E1-6 — Slot ticks have a hard 15-minute window and no catch-up: one late or missed poke skips that grade/refill/found slot for the day

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/server/grading-progress.ts:119-131 `decideSlotTick` fires only when the Pacific minute-of-day is in [slot, slot+15) (GRADE_SLOT_WINDOW_MIN = 15 at :57) and the ticker cadence is also 15 minutes, so exactly one poke can land in each window. Nothing records 'slot X ran today' for a later poke to catch up on. A failed forward is also not retried: app/api/scheduler/route.ts:370-382 reports a rejected refill/grade forward in the response body only.

**Impact.** A single dropped cron-job.org execution, a 500 from a store blip, or a deploy in progress at :00 loses a refill slot (bets not placed) or a grading slot (record stale until the next slot, up to ~15 h after 16:45 PT). Found-mode MLB slots are hourly, so one miss is an hour of no new bets.

**Proposed fix.** Persist `pl:slot:<date>:<kind>:<slot>` (SET NX, EX 2 days) when a slot's work succeeds; in decideSlotTick fire for the most recent slot of today that has no success stamp and is less than e.g. 90 minutes old (and, for found passes, whose games are still ahead). That makes any later poke - including the Vercel backups - a retry.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The mechanism is real, but the impact is overstated; I would rate it low, not medium.

**Confirmed in code**
- `src/lib/server/grading-progress.ts:119-131`: `decideSlotTick` fires only when the Pacific minute-of-day is in [slot, slot+15); `GRADE_SLOT_WINDOW_MIN = 15` at `:57`. It is a pure clock test with no "slot X already ran today" state.
- Grading (`decideGradePass`, `:213`), MLB refill/found (`:154`, `:202`) and the MLB live pull (`app/api/scheduler/route.ts:368`) all go through it.
- `app/api/scheduler/route.ts:370-382`: a rejected or non-2xx refill, grade or live forward is only reported in the response body and logs. Nothing is stamped for a later poke to retry.
- A throw inside `mlbTick` before `:370` (for example a store read failing) also loses that tick's MLB grade/refill, and the next poke is outside the window.
- `vercel.json` backups (21:45 and 00:00 UTC) do not line up with any of the five grade slots in PDT or PST, so they are not a catch-up for grading.
- `src/lib/server/store.ts:114-116` records that external pokes really did go dark on 08-19 and 08-20, so missed pokes are not hypothetical.

**Why the impact is smaller than stated**
1. **"Loses a refill slot (bets not placed)" no longer describes how bets are placed.** Every date from 2026-10-03 is a found day (`src/lib/found-mode.ts:55`). The scheduler then uses `decideFoundTick(now, "mlb")` instead of the five refill slots (`app/api/scheduler/route.ts:322`), so a miss costs one hourly pass, not a fifth of the day.
2. **Football is effectively unaffected.** Found slots are every 15 minutes from 08:00 to 18:45 PT (`grading-progress.ts:192`), and the lock routes decide from their own clock on each poke (`app/api/cfb/lock/route.ts:352-360`, `app/api/nfl/lock/route.ts:168-176`). The next poke is itself a new slot. The football forwards also start before `mlbTick` (`scheduler/route.ts:134-138`), so an MLB-side 500 does not cost them.
3. **Football grading does not use these slots.** `/api/calibrate?grade=only` has no CFB code (`app/api/cfb/lock/route.ts:179`, `:271`); the lock route grades its own days.
4. **A missed MLB grading slot only delays grading.** The calibrate pass re-grades a multi-day window plus stranded dates on every run (`app/api/calibrate/route.ts:149-166`). The "~15 h stale after 16:45 PT" gap exists by design even with no miss, because evening games finish after the last slot.
5. **The day's first MLB card is not slot-gated.** Block fires use a multi-poke two-condition window with an orphan record and a self-check backfill (`scheduler/route.ts:186-205`, `:222-285`).
6. **A manual Refresh runs the same pass at any time**, and this is paper trading only.

**Corrections to the finding**
- "Exactly one poke per window" holds only if the cron-job.org job is aligned to :00/:15/:30/:45. That is the documented design (`docs/cron-jobs.md`, design banner), but the account itself was not inspected.
- The MLB refill path does stamp the slot on the registry row (`src/lib/server/refill.ts:19-21`), but only to refuse a duplicate, never to catch up.

**On the proposed fix**
It is reasonable as hardening for MLB found passes and the 16:45 grade slot. Catch-up must respect the calibrate route's 10-minute limiter (`app/api/calibrate/route.ts:121-125`) and the generate route's slot validation (`app/api/generate/route.ts:212`). A found-pass catch-up must also not double-spend Odds credits (114-150 per MLB generate).

<a id="f-e1-7"></a>
#### E1-7 — Missing/rotated CRON_SECRET: lock routes fail closed with only a response body, /api/calibrate fails OPEN, and CLV carries the secret in the URL

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Fail closed, silent: app/api/scheduler/route.ts:161-163 (503 'scheduler-not-configured: CRON_SECRET unset - failing closed'), app/api/cfb/lock/route.ts:281-283, app/api/nfl/lock/route.ts:105-107; a wrong secret is 401 + console.warn (scheduler :164-167, cfb :284-287). Fail open: app/api/calibrate/route.ts:76-84 ends `return !cron` when the env var is unset and compares with plain `===` (not timing-safe), on a route that rewrites grades and the calibration summary the engine reads. Query-string secret: app/api/clv/route.ts:27,60 with src/lib/server/store.ts:92-98; docs/cron-jobs.md:21-23 records that rotating the secret breaks the CLV job until its URL is edited. The calibrate limiter is stamped before the work (calibrate/route.ts:121-126), so a run that then fails blocks retries for 10 minutes.

**Impact.** An emptied or rotated secret produces a complete silent outage (every poke 503/401) while leaving /api/calibrate callable by anyone, who can trigger grading/fit writes. The secret also sits in request logs for the CLV row.

**Proposed fix.** Use cronHeaderAuthed in calibrate and return 503 when CRON_SECRET is unset (same wording as the other routes); accept header auth on /api/clv and switch the cron-job.org row to a header; move `SET K_LASTRUN` after a successful run (or clear it in the catch). Have the health route report `cronSecretSet: boolean` (name only) so the watchdog alerts on it.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every cited fact is in the code, but the impact is overstated and the finding bundles four small items; I rate it low, not medium.

**Confirmed**
- Fail closed: `app/api/scheduler/route.ts:161-167`, `app/api/cfb/lock/route.ts:281-287`, `app/api/nfl/lock/route.ts:105-109` return 503 when `CRON_SECRET` is unset and 401 + `console.warn` on a wrong header.
- Fail open: `app/api/calibrate/route.ts:76-84` ends `return !cron` and compares the Bearer value with plain `===`. The scheduler's own comment at `:156-158` acknowledges this.
- Query-string secret: `app/api/clv/route.ts:27,60` uses `cronKeyAuthed`, which reads `?key=` (`src/lib/server/store.ts:92-98`). `docs/cron-jobs.md:23,27-28` records the URL key and the rotation breakage.
- Limiter stamped before the work: `app/api/calibrate/route.ts:121-126`; the catch at `:549-551` returns 502 without clearing it.

**Corrections to evidence and impact**
1. **Rotation does not open calibrate.** The route is open only when the variable is unset or empty. After a rotation the variable is set, so calibrate returns 401 like the rest.
2. **Rotation does not kill every poke.** The four `vercel.json` cron rows get the current secret injected by Vercel as `Authorization: Bearer`, which `cronHeaderAuthed` accepts (`store.ts:113-121`). Only the cron-job.org rows break until edited.
3. **What an anonymous caller can do when the secret is unset is narrow.** They cannot inject data: grades come from statsapi and stored rows, and `force=1` needs the sync phrase (`:122`). They can:
   - trigger a full (non-`grade=only`) run that rewrites `pl:cal:summary` off-schedule;
   - start the weekly fit early, though `applyWeeklyAdjustment` is still held to once per 7 days (`src/engine2/calibration.ts:692`) and only shrinks;
   - stamp the 10-minute limiter.

   The real cost is breaking the "summary frozen between Sunday fits" invariant described at `calibrate/route.ts:137-147`, on a paper-trading system that is otherwise fully down in that state.
4. **Plain `===`** is not practically exploitable over the network; it is a consistency nit.
5. **The limiter issue is near zero.** Scheduler pokes are 15 minutes apart, longer than the 10-minute block, and the grade forward goes out on scheduler ticks (`scheduler/route.ts:372,400`). `/api/clv` has the same stamp-first pattern (`clv/route.ts:66-70`, 25 minutes), which the finding did not mention.
6. **The CLV key in the URL is already a documented, accepted item** ("security queue, spec-only", `docs/cron-jobs.md:23`). The same secret gates the credit-spending routes, so header migration is still worthwhile.
7. **"Silent" is partly fair.** I found no route that reports whether the secret is configured. Whether cron-job.org failure notifications are on could not be determined from disk.

**Fix corrections**
- There is no health route: `app/api` has no `health` or `status` directory. The `cronSecretSet` boolean would have to go on an existing surface such as `/api/version` or `/api/board`, or a new route.
- Swapping calibrate to `cronHeaderAuthed` plus a 503-when-unset is sound. The scheduler's grade forward already sends the Bearer spelling (`scheduler/route.ts:417-421`) and the documented cron row uses Bearer (`docs/cron-jobs.md:22`). Keep the `syncAuthed` branch.
- `/api/clv` can accept `cronHeaderAuthed` alongside `cronKeyAuthed`, so the cron-job.org row can be migrated without a breaking window.

<a id="f-e1-8"></a>
#### E1-8 — Timeouts do not line up: the 90 s scheduler awaits un-timed forwards into a 300 s generate; football forwards abort at 25 s while the callee keeps running

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/api/scheduler/route.ts:45 `maxDuration = 90`; block fire fetch at :396-399 and gradeForward at :417-422 have no signal/timeout; src/lib/server/refill.ts:83-101 forwardMlbRefill likewise; target app/api/generate/route.ts:42 `maxDuration = 300` and the found lease is 300_000 ms (src/lib/server/found-lease.ts). src/lib/server/slate.ts:29 statsapi fetch has no timeout and is awaited first on every poke (scheduler :172). Football: caller aborts at 25 s (src/lib/server/cfb-lock-forward.ts:22-41, nfl-lock-forward.ts:25-44) while app/api/nfl/lock/route.ts:76 and app/api/cfb/lock/route.ts:225 declare maxDuration 60 ('the caller's abort is the binding one', nfl route :75) - but an abort does not stop the callee, which may still write the card.

**Impact.** A generate longer than ~85 s gets the scheduler killed by the platform: the poke returns a timeout/500, the generate result (including lock errors) is never logged by the scheduler, and repeated timeouts are what makes external cron services auto-disable a job (not verifiable from disk). A football lock that takes 26-60 s is reported as 'forward failed' although it locked.

**Proposed fix.** Give every forward `AbortSignal.timeout(80_000)` and report `pending` rather than failure on abort; better, use `waitUntil`/`after()` to detach the generate and return 202 with a run id, and let the next poke read the outcome from a `pl:run:<date>:<slot>` status key. Add `AbortSignal.timeout(5000)` to slate.ts. Lower the lock routes' maxDuration to match the caller or have the caller treat abort as unknown and re-read the ledger.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every cited piece of evidence checks out, but the stated impact is overstated: this is a reporting gap, not a data or card-correctness problem, so I rate it low rather than medium.

**Confirmed in code**
- `app/api/scheduler/route.ts:45` sets `maxDuration = 90`.
- The block-fire fetch (`route.ts:396-399`) and `gradeForward` (`route.ts:417-422`) carry no signal or timeout.
- `forwardMlbRefill` (`src/lib/server/refill.ts:83-101`) has no signal either.
- `app/api/generate/route.ts:42` sets `maxDuration = 300`; `src/lib/server/found-lease.ts:14` sets `FOUND_LEASE_PX = 300_000`.
- The statsapi fetch in `src/lib/server/slate.ts:29` has no timeout and is awaited first in the tick (`route.ts:172`).
- Both football forwards abort at 25 s (`src/lib/server/cfb-lock-forward.ts:29`, `src/lib/server/nfl-lock-forward.ts:32`; `src/lib/cfb/rules.ts:127`, `src/lib/nfl/rules.ts:106`).
- Both lock routes declare 60 s (`app/api/nfl/lock/route.ts:76`, `app/api/cfb/lock/route.ts:225`).

**Why the severity is overstated**
1. The mismatch is already known and documented at `app/api/scheduler/route.ts:46-56`: a platform kill "costs the poke its HTTP answer, never an MLB write". The football forwards start concurrently with the MLB tick (`route.ts:116-135`), so a slow generate no longer costs them their slot.
2. "Lock errors are never logged" is wrong. `/api/generate` logs its own outcome (`app/api/generate/route.ts:667` LOCKED, `:670` LOCK FAILED, `:348` run cap). Only the scheduler's HTTP echo is lost.
3. A false "forward failed" has no downstream effect. It only produces a `console.warn` (`route.ts:146-147`) and a field in the response; nothing retries on it.
4. The cron-service auto-disable claim cannot be verified from disk. Docs name cron-job.org as the ticker (`docs/credit-budget.md:598`), but its timeout and disable policy are not in the repo.

**Additional evidence that strengthens the football half (NFL only)**
- The NFL lock route's header says "cheap, no per-event props pull" (`app/api/nfl/lock/route.ts:71`), but the route now calls `footballPropsGet(..., { forceFresh: true })` on the found first-lock path (`:221`) and the legacy lock path (`:274`).
- The props routes themselves are given 300 s (`app/api/nfl/props/route.ts:26`).
- So a 25 s caller abort is plausible on an NFL first lock, and the 60 s route limit could itself kill the lock mid-pull. That is a sharper issue than the one reported and deserves its own finding.
- CFB does not attach props; I found no such call in `app/api/cfb/lock/route.ts`.

**Corrections to the proposed fix**
- Do not lower the lock routes' `maxDuration` to match the caller; given the NFL props pull, that would kill more locks. Instead have the caller report an abort as "pending/unknown" and re-read the ledger, and consider raising the NFL lock route's limit.
- `AbortSignal.timeout(80_000)` on the MLB forwards and about 5 s on `slate.ts` are reasonable. Aborting the forward does not stop generate, so the status-key or `after()` approach is the real fix for observability.

<a id="f-e1-10"></a>
#### E1-10 — Coverage gaps in the poke window: London/Europe NFL kickoffs are never reachable, nothing runs after 02:45Z, and a statsapi outage is indistinguishable from an off day

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Ticker = every 15 min, UTC hours 15-23 and 0-2 (docs/cron-jobs.md:17). London/Germany kickoffs: docs/cron-jobs.md:889-894 'London / Germany 13:30Z kickoffs are NOT reached ... Open item for Josh'; app/api/nfl/lock/route.ts:56-61 (lock one hour before the first kickoff; a missed window becomes a NO-PLAY record). Football found slots start 08:00 PT (src/lib/server/grading-progress.ts:192), so in standard time the 15:00-15:45Z pokes do no found work. After the last poke (18:45 PST / 19:45 PDT, docs/progress.md:619) settlement of late games (MLB west coast, SNF/MNF, late CFB) waits for 15:00Z the next day - about 10 hours with a stale record. MLB: src/lib/server/slate.ts:36-44 returns [] on a statsapi failure and src/lib/server/scheduler-decide.ts:43 reports that as 'empty schedule - no games today' (not dead-slate, so no reason record is written, lock-card.ts:211-212). All slot clocks are America/Los_Angeles (grading-progress.ts:98, pt-date.ts:20-22) although the owner is on Arizona time (labels are one hour off Nov-Mar). Postseason and bowls are covered by construction: slate.ts:23 has no gameType filter and the football routes are date-driven with no season gate.

**Impact.** International NFL games (several Sundays a season) are never bet; a statsapi outage on a game day silently produces no MLB card and no record of why; overnight results and the win/loss record lag by up to ~10-12 hours.

**Proposed fix.** Add two Sunday pokes for the early-window lock (`45 12 * * 0` and `45 13 * * 0` to /api/nfl/lock, covering EDT and EST) via Vercel cron or the GitHub backup ticker; add one late settle poke (`30 6 * * *` -> /api/scheduler) so finals are graded overnight; make slateStarts return a tri-state (games / none / feed-down) and write a 'schedule feed unreachable' reason plus health flag when it is down.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The finding is real: every cited line matches the checkout. I rate it low rather than medium, because each gap is small on a paper-trading system and the largest ones are already documented open items.

**Confirmed in code**
- **Ticker hours:** every 15 min, UTC hours 15-23 and 0-2 (docs/cron-jobs.md:17, repeated in src/lib/nfl/rules.ts:80-82 and src/lib/server/grading-progress.ts:50-52). This is the documented design only; the cron-job.org account cannot be read from disk.
- **London/Germany 13:30Z gap:** documented as not covered and an open item for Josh (docs/cron-jobs.md:889-892, src/lib/nfl/rules.ts:89-95, docs/nfl-desk.md:104-106). The missed-window NO-PLAY behaviour is at app/api/nfl/lock/route.ts:56-61.
- **Football found slots:** start 08:00 PT (grading-progress.ts:192), so the 15:00-15:45Z pokes do no found work in standard time.
- **Statsapi outage:** `fetchStarts` returns null on any failure and `slateStarts` turns that into `[]` (src/lib/server/slate.ts:27-44). `decide()` then reports "empty schedule — no games today" (scheduler-decide.ts:43). The scheduler only passes `deadSlate` when the reason is "dead-slate" (app/api/scheduler/route.ts:227), so `needsLockAction` returns null and no reason record is written (lock-card.ts:208-213). With an empty list there are also no blocks, so no orphan rows.
- **Pacific clock:** grading-progress.ts:98 and pt-date.ts:21 both use America/Los_Angeles. The one-hour label offset for Arizona in Nov-Mar follows from that.
- **Last poke:** docs/progress.md:619 says the ticker stops at 18:45 PST / 19:45 PDT.
- **No gameType filter:** the schedule URL at slate.ts:23 has none.

**Corrections to the evidence**
1. **Existing Vercel crons were omitted.** vercel.json:8-25 already schedules `/api/scheduler` at 21:45Z and 00:00Z daily, and `/api/nfl/lock` at 16:00Z and 17:00Z on Sundays. None closes a gap (all sit inside 15-02Z), and docs/cron-jobs.md:3 says early international games remain uncovered. The fix should extend this existing pattern, not introduce a new mechanism.
2. **"Never bet" is narrower than stated.** Only the 13:30Z game is excluded; the rest of that Sunday locks normally (rules.ts:89-93). Only a London-only date becomes a NO-PLAY row. "Several Sundays a season" could not be verified from disk.
3. **The MLB settlement lag is overstated.** The MLB ledger grades itself client-side on view (app/ledger/page.tsx:462-464, "Grades post themselves ... grades on view"). The roughly 10-12 hour wait applies only to the server-side football settle pass (src/lib/server/football-lock.ts:257) and to anything read without opening the Ledger.
4. **The statsapi gap needs a sustained outage.** `slateStarts` is re-read on every poke (scheduler/route.ts:172), so one failed fetch is retried 15 minutes later. Only an outage spanning the whole lock window loses the card, and generation depends on statsapi anyway. The real defect is the misleading "no games today" reason and the missing reason record.

**Notes on the proposed fix**
- The Sunday pokes at 12:45Z and 13:45Z would work on a found day: a poke inside the lock window opens the card via `foundFirstLock` (app/api/nfl/lock/route.ts:206-210).
- That first entry would be priced four or more hours before the 17:00Z window. This is acceptable only because found mode appends later.
- Whether Vercel fires crons at the exact minute depends on the plan, which I could not determine from disk.
- The tri-state `slateStarts` fix is sound; `fetchStarts` already separates null from `[]` and `slateScope` already exposes the null (slate.ts:49-51).

<a id="f-e1-11"></a>
#### E1-11 — GitHub Actions workflows cannot fail loudly: no timeouts, no failure notification, push steps that lose work, and a daily no-op commit to the production branch in the off-season

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** `grep -c timeout-minutes .github/workflows/*.yml` = 0 for all seven files (board-archive, context, hr-overround, line-history, model, props-history, ufc); `grep -n "if: failure()|secrets\.|continue-on-error"` returns nothing. .github/workflows/context.yml:23,33-36 checks out frontend-rebuild and ends with a bare `git push` (no pull --rebase, so a concurrent owner push makes it fail and the day's ump data is dropped). .github/workflows/props-history.yml:102-105 `for i in 1 2 3; do git push && break; git pull --rebase origin line-history; done` exits 0 even if all three pushes fail (the paid snapshot is lost, job green). Off-season churn: `git log` on the audit checkout shows engine-v2-bot 'context: refresh (weather/umps/bullpen)' commits every day (8ab9e46 2026-11-12T03:09Z, c6c2ec3 11-11, eb40bd7 11-10, 65b5844 11-09 ...; 18 commits touched data/ump_k.json since 2026-10-25) and the HEAD diff only appends a date to the `days` array with league totals unchanged. vercel.json disables git deployments only for main and line-history, so each of these is a push to the deployed branch (whether Vercel rebuilds on each is not verifiable from disk). Commit times of 00:30-03:30Z for a `30 22 * * *` cron (context.yml:11) show 2-5 h scheduling delay.

**Impact.** A hung step can burn up to the 6 h default; lost snapshots and stale model inputs are invisible; production is redeployed daily for a no-information file change, each deploy being a window in which a poke can fail.

**Proposed fix.** Add `timeout-minutes: 10` to every job; add a shared final step `if: failure()` that creates/updates an issue labelled `automation-failure`; change context.yml to the pull --rebase retry loop and make both loops `exit 1` when the third push fails; in tools/build_context.py do not append a date when the day has no games (so there is nothing to commit), or move data/ump_k.json to the line-history branch so data commits never touch the deployed branch.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The cited facts are real, but the title and impact are overstated; this is low-severity ops hygiene on a paper-trading system, not medium.

CONFIRMED
- No `timeout-minutes` in any of the seven workflows (grep -c = 0 each). No `if: failure()`, `secrets.` or `continue-on-error` anywhere; the only `concurrency:` blocks are board-archive.yml:42 and props-history.yml:66.
- .github/workflows/context.yml:23 checks out frontend-rebuild and :36 is a bare `git push` (it stages only data/ump_k.json, :33).
- .github/workflows/props-history.yml:102-105 is exactly the quoted loop. Under GitHub's default `bash -e`, a failed `git push` inside `&&` does not trip errexit, so three rejected pushes followed by a successful third `git pull --rebase` end the step with exit 0 and the commit unpushed.
- Off-season churn: 18 engine-v2-bot commits touched data/ump_k.json since 2026-10-25, one per day (8ab9e46 2026-11-12T03:09Z, c6c2ec3, eb40bd7, 65b5844 ...). League totals are identical at 669b989 (10-25), HEAD~1 and HEAD (g 737, k 12154); only `days` grows (105 -> 122 -> 123 entries). Cause: tools/build_context.py:65 appends the date unconditionally, even when no Final game was folded.
- vercel.json disables git deployments only for `main` and `line-history`; there is no `ignoreCommand` in the repo. data/ump_k.json is not under public/, and the context.json commit is paused (context.yml:30-33), so these commits carry nothing deployable.
- The workflow files for context, props-history and board-archive are identical on origin/main (the default branch that actually schedules them).

CORRECTIONS / OVERSTATEMENTS
1. "Cannot fail loudly" is wrong for most paths. A rejected bare push in context.yml, board-archive.yml:68-69, hr-overround.yml:45 and similar exits non-zero, so the run goes red. The only genuinely silent path is the props-history loop.
2. The props-history silent loss is near-unreachable. Runs are serialised by the concurrency group (props-history.yml:66-68), and the only other scheduled writer to line-history is board-archive twice a day. Three consecutive non-fast-forward rejections within seconds, each with a successful pull, is very unlikely; an auth or network failure would fail the pull and go red.
3. "The day's ump data is dropped" is overstated. build_context.py:42-44 folds yesterday (UTC) whenever it is not yet in `days`, and context.yml has two crons a day (:10-11). If the first run's push fails, the second run on the same UTC day re-folds the same date from a fresh checkout. Data is lost only if every run that UTC day fails. The accumulator also feeds a feature the docs say is frozen (docs/collection-period.md:635, `umpKFrozen` true).
4. The 6-hour hang risk is small. Every network call in the workflow scripts has a socket timeout (build_context.py:20, snapshot_props.py:36 and :238, archive_boards.py:74, hr_overround.py:76, snapshot_odds.py:35, build_priors.py:25, build_ufc.py:58). The 5-hour in-runner wait in snapshot_props.py only runs with `--wait` (:287), which the workflow does not pass (props-history.yml:89). Side note: snapshot_props.py:189-191 claims the workflow sets an explicit `timeout-minutes`; that comment is stale.
5. "Each deploy is a window in which a poke can fail" is speculative and nothing on disk supports it. Whether Vercel rebuilds on each bot push is not verifiable from disk, as the finding itself admits.
6. The 2-5 hour delay inference is plausible and matches delays the repo documents (props-history.yml:6), but the commit timestamps cannot tell which of the two crons produced each commit.

FIX NOTES
- The cheapest fix for the churn is in tools/build_context.py: write ump_k.json (or append to `days`) only when at least one game was folded. The `pks` guard at :48 already prevents double counting.
- Moving ump_k.json to line-history is not trivial: build_context.py reads it from the frontend-rebuild checkout and tests/bot-path-whitelist.test.ts whitelists the path.
- A blanket `timeout-minutes: 10` is fine today, but would kill the `--wait` mode if it were ever re-enabled.
- Making the props-history loop exit 1 after the third failed push is a correct one-line hardening.

<a id="f-e1-12"></a>
#### E1-12 — Cron guard test contradicts vercel.json (standing red or dead guard), and the scheduler docs/comments still describe a two-cron, scheduler-only setup

- Severity: low. Area: scheduler and reliability. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** tests/vercel-cron-pokes.test.ts:61 requires every cron path to start with `/api/scheduler` and :70 `expect((cfg.crons ?? []).length).toBeLessThanOrEqual(2)` ('Hobby plan cap'). Static evaluation with node against vercel.json: `crons 4 allScheduler false <=2 false` - both assertions fail as written. tests/nfl-sunday-paper.test.ts:45 asserts the two /api/nfl/lock crons DO exist. app/api/scheduler/route.ts:84-90 still says vercel.json declares crons only for /api/scheduler; app/api/generate/route.ts:121 says 'Vercel Hobby allows only 2 crons'. (Test suite not run, per rules; result is from reading the assertions.)

**Impact.** Either the suite has a permanent red that hides new failures, or the guard is being ignored; and if the Hobby cap comment is still true, whether the two NFL Sunday crons are actually registered cannot be known from the repo.

**Proposed fix.** Update the guard to the real invariant (allowed path prefixes `/api/scheduler`, `/api/nfl/lock`, `/api/health`; distinct paths; count <= the plan's real limit) and have the health route list which cron pokes it has actually received in the last 8 days (`pl:hb:<poke-name>`), which settles the registration question from data.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e1-13"></a>
#### E1-13 — Errors swallowed without a log on the lock and alert paths

- Severity: low. Area: scheduler and reliability. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** app/api/nfl/lock/route.ts:221 and :274 `catch { /* Side picks remain available if props fail. */ }` around attachProps - no log, no field in the response; app/api/calibrate/route.ts:384-386 ledger read failure swallowed with a comment only, and :86-93 fetchJson returns null on any error with no timeout; src/lib/server/store.ts:64-72 redisGetJson returns null on corrupt JSON; src/lib/server/push.ts:52,178 a bet locked while VAPID keys are unset or no phone is subscribed is recorded `no-config`/`no-device` (terminal, never retried) and :190 the only signal of an undelivered alert is console.warn; the odds-missing refusal text at app/api/nfl/lock/route.ts:262 names DraftKings only.

**Impact.** A props-feed outage silently narrows the football card to sides; undelivered bet alerts are permanent with no summary; corrupt registry keys read as 'nothing there'.

**Proposed fix.** Return `propsError` in the lock body and console.warn it; count terminal `no-config`/`no-device`/`gave-up` alerts per day into the health record; log the calibrate ledger-read failure; make redisGetJson throw on non-null unparseable values (callers that want null can catch).

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e2-4"></a>
#### E2-4 — Every game-lines call uses regions=us,eu (2 regions) to fetch books the owner cannot bet; a <=10-book bookmakers= list halves it, while strict bookmakers=draftkings,fanduel would break the consensus rules

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/rules.ts:366-367 CFB_ODDS_URL and src/lib/nfl/rules.ts:169-170 NFL_ODDS_URL: `regions=us,eu&markets=h2h,spreads,totals`; MLB engine legacy/index.html:1257 with `regions: "us,eu"` from app/api/generate/route.ts:404 and src/lib/engine-client.ts:362; src/engine2/sharpBoard.ts:10; app/api/clv/route.ts:90 (`regions=us,eu&markets=h2h,spreads`). No `bookmakers=` parameter exists in any caller (grep of src, app, tools). Props are already 1 region: cfb/rules.ts:474, nfl/rules.ts:195, src/lib/mlb/live-props-rules.ts:147, legacy/index.html:1366, tools/snapshot_props.py:323. Measured cost of the football lines pull = 6 (football-lock.ts:404 'the quota moved 17578 -> 17572'). The proxy allow-list would 403 a bookmakers= URL: shape-check.mjs -> `bookmakers=dk,fd no regions (game lines)  false` (odds-shape.ts:55-56 requires `regions === s.regions`).

**Impact.** ESTIMATE: every game-lines call costs 3 markets x 2 regions = 6 instead of 3 x 1 = 3 (Odds API rule: up to 10 bookmakers = 1 region-equivalent). Per found day that is 264 -> 132 (CFB Saturday), 228 -> 114 (NFL), 2 -> ... 4 -> 2 per CLV slate call, 6 -> 3 per SharpDesk render and per MLB generate (182 -> 179, only -1.6% because MLB spend is props). Props spend does not change with bookmakers=draftkings,fanduel because props are already one region; it could fall only if DK/FD post fewer of the requested markets (cost is per market returned) - could not determine without a live call. Strictly two books would also starve the fair-value consensus (`minBooks: 2`, Pinnacle weighting reached only through the eu region today).

**Proposed fix.** Replace `regions=us,eu` with one curated list of <= 10 keys that contains the two bettable books plus the sharp anchors the consensus needs, e.g. `bookmakers=draftkings,fanduel,pinnacle,betmgm,williamhill_us,betrivers,espnbet,fanatics,bovada,betonlineag` (1 region-equivalent, 3 credits; book keys are from Odds API documentation knowledge - confirm against a live response). Keep settlement/selection restricted to draftkings and fanduel. Update odds-shape.ts to accept the exact bookmakers list as a shape.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed real, but it is a cost optimisation rather than a defect, and the saving is a small share of the plan, so I rate it low rather than medium.

**Evidence I opened and confirmed**
- `regions=us,eu` with h2h/spreads/totals is at src/lib/cfb/rules.ts:366-367, src/lib/nfl/rules.ts:169-170, src/engine2/sharpBoard.ts:9-10, app/api/clv/route.ts:90 (h2h,spreads only), app/api/generate/route.ts:404 and src/lib/engine-client.ts:362, feeding legacy/index.html:1257.
- No `bookmakers=` request parameter exists anywhere in src, app, tools or legacy.
- Props are one region: cfb/rules.ts:474, nfl/rules.ts:195, src/lib/mlb/live-props-rules.ts:147, tools/snapshot_props.py:323.
- The measured 6 credits per football lines pull is at src/lib/server/football-lock.ts:404.
- Stored history shows what the second region buys: pl-history/data/2026-07-12.json and 2026-07-30.json average about 30 books per event, including pinnacle, betfair_ex_eu and matchbook.
- The consensus does depend on those books: src/lib/cfb/model.ts:328 and :381 (pinnacleWeight 2, minBooks 2 at cfb/rules.ts:75-76 and nfl/rules.ts:66-67), legacy/index.html:1557 and src/engine2/sharpBoard.ts:58. A strict DK+FD pull would therefore degrade it, as the finding says.

**Corrections to the evidence**
- Two more `us,eu` callers were missed: tools/snapshot_odds.py:24 (its header at :9 says 6 credits/run, about 2.7k/month hourly) and src/lib/useAllStar.ts:77.
- The proxy check is at src/lib/server/odds-shape.ts:54-55, not 55-56. The logic is as described: a missing `regions` reads as "" and fails both shapes.
- The quoted `bookmakers=dk,fd` case is not in audit-out/shape-check.mjs as it sits on disk; the conclusion holds from the code alone.
- The allow-list only gates callers that go through /api/odds (SharpDesk, CLV, the device engine). Football lines are fetched directly at src/lib/cfb/slate-server.ts:111, so they need no allow-list change.
- src/lib/server/grading-progress.ts:179-180 budgets a football found pass at "~3 credits", contradicting the measured 6. The found-day arithmetic in the tree is understated, which slightly strengthens the finding.

**Corrections to the impact**
- 264 = 44 football slots x 6 checks out (grading-progress.ts:193). I could not reproduce NFL 228 (38 passes); the code gives NFL the same 44 slots.
- I did not verify 182 -> 179 for MLB generate; the in-tree comment says 114-150 measured.
- The top-up path refuses before paying when nothing is still pregame (football-lock.ts:399-404), so the per-day figures are upper bounds. I did not confirm that the found-pass path has the same guard.
- My own rough estimate is a few thousand credits a month against the 100,000-credit plan, on a paper-trading system.
- The "10 bookmakers = 1 region" billing rule is Odds API documentation knowledge. Nothing in the repo confirms it and it cannot be checked offline.

**Corrections to the fix**
- The proposed 10-key list drops betfair_ex_eu and matchbook, which the MLB engine weights x2 (legacy/index.html:1557) and SharpDesk treats as sharps (sharpBoard.ts:58).
- `espnbet` does not appear in the stored July odds data; it exists only as a UI label (src/components/cfb/CfbGameCard.tsx:51). Confirm the key against a live response before relying on it.
- Cutting the consensus from about 30 books to 10 or fewer changes every weighted median, and so the fair values and EV. That is a model change needing a parity check or backtest, not a pure cost switch.

<a id="f-e2-8"></a>
#### E2-8 — Redundant paid pulls of the same market: NFL first lock buys the game lines twice in one request, and three MLB routes ask for the same lines under different cache keys

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** NFL first found lock: src/lib/server/football-lock.ts:810 `slateFromEspn` (game lines), then :834 `args.attachProps(slate)` -> app/api/nfl/lock/route.ts:220-221 `footballPropsGet(NFL_LEAGUE, ..., { forceFresh: true })` -> src/lib/server/football-props.ts:185 `espnEventsOf` again and :192 `slateFromEspnOf(cfg, date, espn, now, bankroll, { fresh: refresh })` = a second h2h,spreads,totals x us,eu pull with `no-store`, plus a second `pl:discovery` SET (slate-server.ts:160); the legacy lock branch repeats it (nfl/lock/route.ts:274). forceFresh also re-prices every game on the slate with no-store (football-props.ts:197 `refresh ? slate.games.length : ...`). MLB: engine `markets=h2h,spreads,totals` (legacy/index.html:1257), SharpDesk `markets=h2h,totals,spreads` (src/engine2/sharpBoard.ts:10, different order = different data-cache key in app/api/odds/route.ts:53), CLV `markets=h2h,spreads` (app/api/clv/route.ts:90). MLB props are fetched by four independent callers with their own market literals: generate (legacy/index.html:1366), propsnap (app/api/propsnap/route.ts:33-34), GitHub props-history (tools/snapshot_props.py:24,322-323), live (src/lib/server/mlb-live-quote.ts:396).

**Impact.** ESTIMATE: 6 wasted credits plus two ESPN reads and one extra store write on every NFL first lock; up to 6 + 4 extra credits whenever the Board/Sharp page and CLV land inside the same 4-minute window as a generate; in season the props-history sweeps (docs/credit-budget.md table: ~615 credits/day ceiling) and propsnap (<= 96 per fire) re-buy event props that the hourly generate has already bought minutes earlier.

**Proposed fix.** Let `footballPropsGet` accept an already-built slate (skip espnEventsOf/slateFromEspnOf when the caller supplies one). Normalise the MLB game-lines URL to one canonical string shared by engine, SharpDesk and CLV. Have generate persist the raw per-event props payload it already paid for (keyed by event id + timestamp) and let props-history/propsnap/CLV read that store when it is younger than their own gap rule instead of pulling again.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Evidence confirmed in code, but the impact is overstated; medium should be low.

CONFIRMED
- NFL first found lock: src/lib/server/football-lock.ts:810 calls args.feeds.slateFromEspn (bound at :72 to slateFromEspnOf with no opts, so oddsPayloadOf uses revalidate ODDS_TTL=240, src/lib/cfb/slate-server.ts:48,111). Then :834 attachProps -> app/api/nfl/lock/route.ts:221 footballPropsGet(..., {forceFresh:true}) -> src/lib/server/football-props.ts:179 refresh=true, :185 espnEventsOf again, :192 slateFromEspnOf(..., {fresh: refresh}) = a second game-lines fetch with cache:"no-store" (slate-server.ts:111) and a second pl:discovery SET (slate-server.ts:160). NFL_ODDS_URL is regions=us,eu & markets=h2h,spreads,totals (src/lib/nfl/rules.ts:169-170), so 6 credits, consistent with the 6-credit measurement quoted at app/api/cfb/lock/route.ts:105-106.
- MLB literals as cited: legacy/index.html:1257 (h2h,spreads,totals), src/engine2/sharpBoard.ts:10 (h2h,totals,spreads), app/api/clv/route.ts:90 (h2h,spreads); props literals at legacy/index.html:1366, app/api/propsnap/route.ts:33-34, tools/snapshot_props.py:24 and :322-323, src/lib/server/mlb-live-quote.ts:396 (no-store). docs/credit-budget.md:17 (~615/day ceiling) and :24 (<=96 per fire) exist as quoted.

CORRECTIONS
1. "Two ESPN reads" are not extra cost: espnDay fetches with next.revalidate ESPN_TTL=60 on an identical URL (slate-server.ts:46,66), so the second read is a data-cache hit; ESPN is free anyway.
2. The first pull is cached (revalidate 240), so it is only a paid pull on a cache miss. The real waste is at most 6 credits per first lock, and zero when the cache is warm.
3. The legacy branch (nfl/lock/route.ts:274) is dead for current dates: isFoundDay is true from FOUND_SINCE 2026-10-03 (src/lib/found-mode.ts:53,84) and the found branch returns whenever d.kind==="lock" (route.ts:206-225). It only runs for an explicitly requested pre-October date.
4. Frequency: the first lock fires once per NFL slate date, so roughly 6 credits a few times a week. That is negligible next to the props pull the same request makes (16 events at the ~31 credits/event measured in docs/credit-budget.md:534-537).
5. The "forceFresh re-prices every game" parenthetical is not additional waste for NFL: maxEvents and liveMaxEvents are already 16 (src/lib/nfl/rules.ts:188,191), and selectPropEvents only admits upcoming or live games with a DraftKings row (src/lib/cfb/props.ts:381-386). The fresh re-pull at lock time is deliberate.
6. MLB engine: legacy obFetchJson fetches api.the-odds-api.com directly (legacy/index.html:893-895), not through /api/odds, and its regions come from SH_V2.regions || "us" (:1257). It never shared the proxy's data cache, so market order is not what separates it. Only SharpDesk and CLV go through the proxy, and CLV asks for 2 markets (4 credits) against Sharp's 3 (6 credits). A canonical 3-market URL would make a standalone CLV pull cost more, so that part of the fix is a trade-off, not a pure saving.
7. The MLB props callers serve different purposes. props-history and propsnap are deliberate time-series snapshots, and snapshot_props.py runs on a GitHub runner that cannot read the Vercel data cache. Having generate persist raw per-event payloads would add Upstash writes. Whether that store has the headroom could not be determined from the repo.
8. MLB is out of season on 2026-11-12, so the MLB half is latent until spring. I could not determine actual in-season overlap frequency from disk.

FIX
The footballPropsGet "accept a pre-built slate" change is sound and small. Because the lock's first pull may be up to 240 s old, either pass {fresh:true} on that first pull and hand the slate down, or accept the cached slate. Treat the MLB consolidation as optional clean-up.

<a id="f-e2-10"></a>
#### E2-10 — Artificial limits left from the 20,000-credit era: MLB live pulls capped at 3 events per pass and MLB props capped at the first 16 events

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/mlb/live-props-rules.ts:136-144 'EVERY pass is capped at `probeEvents`' while `rateMeasured: false`; src/lib/server/mlb-live-quote.ts:661 `const allowed = probing ? Math.min(affordable, cfg.probeEvents) : affordable;` and :779 'every pull is capped at ${cfg.probeEvents} events until a real credit reading lands'; the comment bounds a pass at '3 x 31 = 93 credits'. The measurement that lifts the cap was never recorded (flag still false at HEAD 8ab9e46). legacy/index.html:1359 `.slice(0,16)` drops every eligible MLB event after the 16th from the props pull, and app/api/propsnap/route.ts:37 `MAX_EVENTS = 16` does the same for the closing snapshot.

**Impact.** On an MLB day with more than three games in play at a live slot, only three get in-play prop lines, so live bets/found passes see a fraction of the board even though the daily budget is now infinite. On slates with more than 16 events (doubleheader days) the latest games get no props, no model rows and no closing snapshot. Bounded: MLB is out of season today.

**Proposed fix.** Run the 3-event probe once with x-requests-last logged, write the measured rate, flip `rateMeasured`, and remove the probe cap; raise the 16-event caps to the slate size (or make them time-window based) now that credits are not the binding constraint.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

The evidence is real at HEAD 8ab9e46, but I rate it low rather than medium: the live cap is a documented, deliberately retained guard with a manual bypass, and the 16-event cap almost never binds.

**What I confirmed**
- `src/lib/mlb/live-props-rules.ts:130` sets `probeEvents: 3` and `:144` sets `rateMeasured: false`; the comment at `:132-143` is as quoted.
- `src/lib/server/mlb-live-quote.ts:660-661` computes `probing = !manual && (!cfg.rateMeasured || spentNow === 0)` and `allowed = probing ? Math.min(affordable, cfg.probeEvents) : affordable`; the note is at `:779`.
- `dailyBudget` is `Number.POSITIVE_INFINITY` (`src/lib/mlb/live-props-rules.ts:153`), and `docs/credit-budget.md:499,594,690` still say the probe is not run.
- `legacy/index.html:1359` has `.slice(0,16)`, and it is live server code: the same string appears once in `src/engine/legacy-src.gen.ts`, and `src/engine/index.ts:303` rebinds `obFetchJson` to the server fetch.
- `app/api/propsnap/route.ts:37,90` has `MAX_EVENTS = 16`, applied after the unstarted-within-20h filter.

**Corrections to the finding**
1. **Not simply "left over".** The 19 September policy note (`docs/credit-budget.md:3`) removed daily budgets but explicitly kept the probe for automatic passes. It added the bypass: an authenticated manual refresh prices the whole selected slate (`mlb-live-quote.ts:659-660`). The owner is therefore not locked to three games.
2. **The cap guards a real unknown.** If MLB bills at CFB's 31 credits per event rather than the assumed 6, six passes of 12 events would be about 2,232 credits a day, which is material against a 100k/month plan. The proposed order (measure first, then lift) is right; the cap should not be removed without the reading.
3. **"Only three get lines" is slightly overstated.** A game priced within `liveRevalidateSec` (1800s) is not re-selected (`src/lib/mlb/live-divergence.ts:242-243`), and unpriced outranks expired (`:41`). Successive automatic passes can therefore reach different games. Still, with six slots (`live-props-rules.ts:221`) and quotes discarded after 30 minutes (`quoteMaxAgeSec`, `:114`), only about three to six games hold fresh live lines at once.
4. **"Found passes" impact is unverified.** I did not confirm that found or lock passes consume the live overlay; its consumers are the board, props and sharp pages, `refill.ts` and the scheduler. Treat the impact as live-line display coverage.
5. **The 16-event cap rarely binds.** A full MLB slate is 15 games, so it takes two or more doubleheaders with more than 16 unstarted events. In `pl-history/data/props`, 2 of 103 days had a snapshot with exactly 16 events (2026-07-29 and 2026-09-04) and none had more. Those snapshots are capped at 16 themselves, so they show the cap was reached, not whether games were dropped.
6. **A third 16-cap was missed.** `pl-history/tools/snapshot_props.py:321` has `for e in todays[:16]` and needs the same change.

**Severity**
Low: paper trading only, MLB is out of season on 2026-11-12, a manual bypass exists, the 16-cap binds on at most about 2% of days, and the live cap is an owner-acknowledged pending measurement, not a silent defect.

<a id="f-e2-11"></a>
#### E2-11 — Store traffic: every football slate build writes the whole slate to Redis, and one lock poke re-reads the whole ledger several times over one-command-per-request REST

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/cfb/slate-server.ts:160 `await redis(["SET", `pl:discovery:${cfg.id}:${date}`, JSON.stringify(slate), "EX", 129600])` runs inside `slateFromEspnOf` on every call - public page loads of /api/cfb and /api/nfl (app/api/cfb/route.ts:61, app/api/nfl/route.ts:66, any `date`), every props GET (football-props.ts:192) and every found/top-up/lock pass - and is awaited before the response. Its only reader is app/api/discovery/route.ts:18. src/lib/server/store.ts:45-62 sends one command per HTTP POST (no pipeline; MGET is used only in src/lib/cfb/props-store.ts:244). In src/lib/server/football-lock.ts the top-up path re-reads and re-writes the whole ledger blob repeatedly within one pass (readLockStore at :482, :515, :570 and whole-blob SETs at :495, :521, :598), after the route has already read ledger + bank, and sweep/settle read it again; football-props.ts reads the board then the spend key in separate round trips (:230, :250, :310).

**Impact.** With 2 leagues x 44 found pokes a day plus page loads, that is on the order of 100+ full-slate writes and several hundred whole-ledger transfers a day. The project already had an Upstash bandwidth incident and a store-wide 403 outage (data/boards archive stops 2026-10-17 per map-scheduler-infra.md). Each extra round trip also adds latency inside a 60 s lock route.

**Proposed fix.** Write `pl:discovery` only when the slate content hash changed (or only from the scheduled lock path, not from public GETs). Read the ledger once per poke and pass it down to sweep/settle/top-up/found, re-reading only immediately before the compare-and-write. Add a pipeline helper (Upstash REST `/pipeline`) for the read sets that are always fetched together.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Partly confirmed, but the ledger half is overstated and cites a dead path. Severity should be low, not medium.

CONFIRMED
- src/lib/cfb/slate-server.ts:160 does an awaited `SET pl:discovery:<league>:<date> ... EX 129600` inside `slateFromEspnOf` on every call, with no change check. Callers seen: app/api/cfb/route.ts:61, app/api/nfl/route.ts:66 (both public GETs, any regex-valid `date`), src/lib/server/football-props.ts:192, src/lib/server/football-lock.ts:499/:710/:810, app/api/cfb/lock/route.ts:425, app/api/nfl/lock/route.ts:242.
- The only reader of the key is app/api/discovery/route.ts:18.
- src/lib/server/store.ts:45-62 sends one command per HTTP POST. No pipeline helper exists anywhere in src/ or app/.
- The write was added in 7cfd1b7 (2026-09-19), before the 2026-10-12 bandwidth fix.
- pl-history data/boards does end at 2026-10-17.

CORRECTIONS TO THE EVIDENCE
1. The cited ledger re-reads (:482, :515, :570) and SETs (:495, :521, :598) are all inside `topUpDate` (football-lock.ts:423). The route runs that only when `!isFoundDay(date)` (app/api/cfb/lock/route.ts:362-367). `isFoundDay` is true for every date >= 2026-10-03 (src/lib/found-mode.ts:53, :84-86), so this path no longer runs in production. Also :515/:521 sit in the `oddsMissing` branch, which returns, so they never co-occur with :570/:598.
2. On the live found path a firing poke reads the ledger twice, not "several times":
   - once with the bank, in parallel, at route.ts:301;
   - once under the lease immediately before the write, at football-lock.ts:725, with a single SET at :759 only when a bet was found.
   Sweep re-reads only when it has a missed prior day to record (:198; the normal case stops at :186 with no read). Settle re-reads only when a date was actually attempted (:339-340). The proposed "re-read only immediately before the compare-and-write" is already how `foundPassDate` works.
3. "MGET is used only in props-store.ts:244" is wrong: it is also used at src/lib/server/push.ts:226 and app/api/taken/route.ts:21.
4. Bandwidth is already mitigated: `redis()` gzips every JSON SET value >= 2 KB (store.ts:36-39, :49), which covers both the discovery slate and the ledger blob.
5. "2 leagues x 44 pokes = 100+ full-slate writes a day" is an upper bound, not typical. `foundPassDate` returns before `slateFromEspn` when no game is still ahead, when room is below the minimum stake, or when the lease is held (football-lock.ts:697-708), and no-slate days never reach it. The 44 ticks (every 15 min, 08:00-18:45 PT) are real (src/lib/server/grading-progress.ts:202-204).
6. Client slate polling is modest: 4-minute staleTime, refetch only while a game is live (src/lib/football/useDesk.ts:60-63).
7. football-props.ts :230/:250/:310 are separate round trips, but :250 is in the rail-1 early-answer branch and :310 in the rail-2 path, so one request does not pay both.

COULD NOT DETERMINE
- The slate's byte size: no stored football slate is on disk.
- Whether this write contributed to the 2026-10-12 bandwidth warning or the 2026-10-18 403 outage: no in-repo record of the cause.

IMPACT
Efficiency and latency only, on a paper-trading, single-user app. The real residue is one redundant, awaited, gzipped SET per slate build, including on unauthenticated public GETs for arbitrary dates (a minor write-amplification surface with a 36 h TTL), plus the lack of a pipeline helper.

FIX
Keep the first part: write `pl:discovery` only on content-hash change, or only from the scheduled lock/props path, and do not await it on public GETs. Drop the "read the ledger once per poke" part for the found path, since it is already at the minimum that is safe for a compare-and-write. A pipeline helper is optional.

<a id="f-e2-12"></a>
#### E2-12 — The paid props archive keeps one-sided prices only for Caesars, a book the owner cannot bet

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** tools/snapshot_props.py:27 `CZ = "williamhill_us"`; :67-68 `is_cz = bk["key"] == CZ`; per-book prices (`fp`) are stored only when a book posts BOTH sides (`if "o" in pair and "u" in pair` block), and the only one-sided per-book record is `if is_cz: r["cz"] = {...}`; `bo`/`bu` are cross-book bests with no book attribution. The request is `regions=us` (:323) and returns DraftKings and FanDuel in the payload already paid for. .github/workflows/props-history.yml:35-49 still schedules six sweeps a day.

**Impact.** For one-sided markets (HR 'Yes' ladders and other milestone lines) the archive on the line-history branch cannot say what DraftKings or FanDuel were offering at the open or close, so closing-price and overround studies for the only two bettable books cannot be rebuilt from the data the credits bought (docs/credit-budget.md table: ~615 credits/day ceiling in season). Accuracy/credit-efficiency issue, not a money error.

**Proposed fix.** Store `dk` and `fd` one-sided records alongside `cz` in `compact()` (zero extra credits - the keys are already in the response), and make the settlement-book constant read from the same source as src/lib/sportsbook/books.ts (SETTLE_BOOK = 'draftkings').

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

CONFIRMED in code and in the stored data; severity lowered from medium to low and two details corrected.

What I checked
- tools/snapshot_props.py:27 `CZ = "williamhill_us"`; :68 `is_cz = bk["key"] == CZ`; :79-89 per-book `fp[bk]` is written only inside `if "o" in pair and "u" in pair`; :91-92 the only one-sided per-book record is `if is_cz: r["cz"] = {...}`; :93-96 `bo`/`bu` are a running max across books with no book key. :114 `czf` is likewise Caesars-only. :323 the request is `regions=us` with no bookmakers filter. No other field in the output dict (:99-126) carries a DraftKings or FanDuel one-sided price. No guard elsewhere: fold_vercel (:224+) runs the same compact(), and the raw payload behind it (app/api/propsnap/route.ts:36, :44) has a 4-day TTL, so raw is not a long-term fallback.
- .github/workflows/props-history.yml:35, :45, :46, :47, :48, :49 = six active crons (as claimed).
- src/lib/sportsbook/books.ts:12 `SETTLE_BOOK = 'draftkings'` - so the archive's "settlement book" fields (`cz`, `czf`) point at a book that is no longer the settlement book.
- Stored data (script: /private/tmp/claude-501/audit-out/e2_12_check.py, over all 103 files in /private/tmp/claude-501/pl-history/data/props): batter_home_runs has 107,706 rows; of the 99,040 that carry the `fp` field, 100% are purely one-sided (n=0, fp={}), Caesars' one-sided price is recorded on 64,524 of them, and DraftKings/FanDuel are attributed on zero. Example: pl-history/data/props/2026-07-27.json, snapshot 2026-07-27T20:56:12Z, ARI@PIT, "Brandon Lowe|0.5": `{"fp":{}, "bo":325, "no":2, "cz":{"o":290,"u":null}}` - two books posted, the 325 is unattributable. Same gap on batter_total_bases (18,792 rows with one-sided books and no DK/FD pair) and smaller counts on batter_hits (2,181) and pitcher_outs (889). FanDuel appears in `fp` only 7,864 times in total and never on any batter market, so FanDuel batter prices are essentially absent from the archive. DraftKings and FanDuel keys do appear in `fp` elsewhere, confirming they are in the paid payload.
- A real downstream consumer exists: tools/hr_overround.py:28-30 and :165-169 compute the HR overround from `bo` (best-of-all-books), and pl-history/data/hr_overround.json reports 1.1609 on that basis - it is not a DraftKings or FanDuel overround and cannot be made one from the archive.

Corrections to the finding
- The "~615 credits/day ceiling" is stale. docs/credit-budget.md:17 ties 615 to the old TEN-cron schedule; the workflow's own comments (props-history.yml:33-34, :43-44) put the current ceiling at about 185/day plus 36-96/day for the targeted pair. Impact is unchanged in kind (zero extra credits to fix) but the cited spend is overstated roughly 2-3x.
- Line cite ":67-68" is really :68 (and :91 for the cz write). Minor.
- The newest archive file is 2026-10-28 and all six markets are MLB, so nothing is being lost right now (off-season); the gap is historical plus next season.
- Fix refinement: a Python tool cannot import books.ts, so "read from the same source" needs a shared JSON/constant or a test that pins the two together. Better than adding only `dk`/`fd`: store a per-book one-sided map (e.g. over price by book key) so any book is recoverable; keep `cz`/`czf` for backward comparability with already-archived days.

Why low, not medium
No bet, stake, grade or displayed number is wrong because of this; it is a research-archive completeness gap on a paper-trading system. The owner's own bets get closing-line tracking through a separate path (docs/credit-budget.md:202 says /api/clv and the Stats CLV panel cover CLV). What is genuinely lost is unrecoverable history: per-book DraftKings/FanDuel open/close on one-sided markets (all of HR) for the 2026 season, which limits any future DK/FD-specific overround or closing-price study. Worth fixing before next season because it is free, but it does not change any current decision.

<a id="f-e2-13"></a>
#### E2-13 — Dead and duplicated code: 16 tracked iCloud conflict copies, two odds desks that can only 403, and market lists copied by hand across files

- Severity: low. Area: API credits and efficiency. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** `git ls-files | grep -E " [2-9]\.[a-z]+$"` -> tests/timezone-parity.test 3.ts, tools/build_ufc 3.py, tools/build_ufc 4.py, tools/burn-report 3.mjs, tools/burn-report 5.mjs, tools/guard-diff-audit 3.mjs, tools/guard-diff-audit 4.mjs, tools/hr-pair-dependence 3.mjs, tools/m10_eiv 3.py, tools/outs_audit 3.py, tools/phase2_series_b 3.py, tools/phase2_series_b 4.py, tools/price-path 3.mjs, tools/price-path 4.mjs, tools/price-path 5.mjs, tools/self_consistency 3.py (contents not analysed, per rules). UFC desk: src/lib/ufc.ts:83-86 requests `regions=us&markets=h2h,totals` through the proxy; shape-check.mjs -> `ufc us h2h,totals false` (always 403). All-Star desk: src/lib/useAllStar.ts:74-76 requests prop markets with `regions=us,eu`, which matches neither shape in odds-shape.ts:44-47. Duplicated literals: the 15 football prop markets at src/lib/cfb/rules.ts:606-607, src/lib/nfl/rules.ts:295-296 and src/lib/cfb/props-types.ts:40; the six MLB prop markets at legacy/index.html:1157, app/api/propsnap/route.ts:33-34, tools/snapshot_props.py:24 and odds-shape.ts:20-28; two near-parallel lock route bodies (app/api/cfb/lock/route.ts 514 lines, app/api/nfl/lock/route.ts 320 lines). legacy/index.html (337 KB) is NOT dead - tools/extract-engine.mjs:12 generates src/engine/legacy-src.gen.ts (299 KB) from it - but legacy/sw.js, manifest, icons and serve.command are remnants of the old app.

**Impact.** No credit cost. The conflict copies can be picked up by test globs or type checks (the project already had a local build broken by such copies), the UFC/All-Star surfaces are shipped but cannot load odds, and hand-copied market lists are how the CLV allow-list mismatch above happened.

**Proposed fix.** Remove the conflict copies from the index in one commit and add a `* [2-9].*` ignore rule; either add the UFC/All-Star shapes to the allow-list or remove those desks from the nav; export each market list once and import it everywhere (including the proxy allow-list).

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e3-5"></a>
#### E3-5 — DraftKings prices are labelled 'CZ' or shown with no book tag; Caesars/Nevada wording remains on money screens

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/props/page.tsx:374 `const book = r.displayBook ? bookName(String(r.displayBook)) : "CZ"` while :255 defaults the same data to "DK"; src/lib/sportsbook/mlb.ts:83 returns the row with no displayBook when the selected book is the settlement book, so the default DraftKings view takes the "CZ" branch. src/components/props/GameCard.tsx:227 same "CZ" default and :239 on-screen 'no CZ'. src/components/props/props-model.ts:280 fallback label "CZ". Tag is hidden when the label is CZ: src/components/props/GenSheet.tsx:540, PlayerRow.tsx:104, RankedPicks.tsx:362-363, Slip.tsx:104, src/components/cfb/CfbSlip.tsx:206. app/builder/page.tsx:204-207 prints '@CZ {czEv}%' with a tooltip saying DraftKings. app/ledger/page.tsx:173 'no CZ price'; :261-263 confirmed price suffixed '(NV)'; app/builder/page.tsx:815 'Confirm the NV app's price'. app/settings/page.tsx:69 'EV-gated @ CZ (default)' and :78 mode key `caesars_ev` labelled 'DraftKings EV'. src/components/cfb/CfbSharp.tsx:56-57 two coverage rows both labelled 'DraftKings' (keys cz and dk).

**Impact.** Accuracy of what the owner reads: on moneyline/run-line rows the price shown carries no book name at all, prop rows say DK, and several screens still say CZ or NV for a DraftKings number. In a two-book system an unlabelled price is a bet placed at the wrong book.

**Proposed fix.** Remove the 'hide the tag when it is CZ' rule and always render the short tag of the book the price came from (row.displayBook ?? row.settlementBook ?? SETTLE_BOOK). Replace the literal 'CZ'/'NV' strings listed above with the book tag or with 'DK'/'FD'. Collapse the duplicate cz/dk coverage row in CfbSharp. Rename the cz* fields in a later pass; fix the labels now.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every cited line exists and reads as quoted, and the behaviour is as described, but the number shown is always the right book's price, so this is a labelling defect and I rate it low, not medium.

**What I confirmed**
- `app/props/page.tsx:374` defaults the ranked moneyline/run-line book to "CZ", while `:255` defaults the same rows to "DK" for the generator pool.
- The "CZ" branch is the default path. `src/lib/sportsbook/mlb.ts:83` returns the row untouched when the selected book equals the settlement book, and `priceMlbBoard` (`mlb.ts:102`) leaves `categories` untouched in that case, adding `displayBook` only to `propBoard` rows via `priceMlbProp` (`mlb.ts:92`). With `SETTLE_BOOK = DEFAULT_BOOK = 'draftkings'` (`src/lib/sportsbook/books.ts:12-14`), the default view gives ML/RL rows no `displayBook`. No other non-football code stamps `displayBook` on category rows.
- The tag is then hidden by the `!== "CZ"` checks at `GenSheet.tsx:540`, `PlayerRow.tsx:104`, `RankedPicks.tsx:362-363`, `Slip.tsx:104` and `CfbSlip.tsx:206`.
- `GameCard.tsx:227` has the same "CZ" default and `:239` prints "no CZ".
- The stale wording is all present: `app/builder/page.tsx:204-207` ("@CZ" with a DraftKings tooltip), `:815` ("NV app's price"), `app/ledger/page.tsx:173` ("no CZ price"), `:262` ("(NV)"), `app/settings/page.tsx:69` ("EV-gated @ CZ (default)"), `:77-78` (`caesars_ev` labelled "DraftKings EV").
- `src/components/cfb/CfbSharp.tsx:56-57` lists two coverage rows both labelled "DraftKings" (keys `cz` and `dk`), rendered at `:257`.

**Corrections to the evidence**
- `props-model.ts:280` is weaker than stated. It falls back to `settlementBook` before "CZ", and `priceMlbProp` always sets `displayBook`, so that literal is reachable only for a row with neither field. Prop rows show "DK" in practice.
- A Caesars-stamped pre-2026-09-17 board is repriced at DraftKings with `displayBook` set (`mlb.ts:101-102`), so an untagged price is never a Caesars number.

**Why the severity is overstated**
- An untagged price is always the DraftKings settlement price. Selecting FanDuel goes through `priceMlbRow`, which sets `displayBook`, so the tag then shows.
- The impact line "an unlabelled price is a bet placed at the wrong book" is therefore not supported. The real defect is inconsistency (props tagged DK, ML/RL untagged) plus stale CZ/NV wording on a paper-trading tool.

**On the fix**
- The proposed fix is sound. The smallest correct change is to replace the "CZ" default at `app/props/page.tsx:374` and `GameCard.tsx:227` with `r.displayBook ?? r.settlementBook ?? SETTLE_BOOK`, using the short tag as `:255` does.
- After that, either drop the `!== "CZ"` hide rules or leave them as dead code.
- Before changing the label string, check `src/lib/parlay-gen.ts:538`, which compares `l.book` against `SETTLE_BOOK_SHORT`.

<a id="f-e3-6"></a>
#### E3-6 — Book selector offers seven books with Caesars first, and unstamped data silently falls back to Caesars in four places

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/sportsbook/books.ts:1-9 BOOKS = Caesars (williamhill_us), DraftKings, FanDuel, BetMGM, BetRivers, Fanatics, Pinnacle. src/components/sportsbook/SportsbookSelector.tsx:8 renders all seven. Fallbacks to 'williamhill_us': src/lib/sportsbook/football.ts:10, src/lib/sportsbook/mlb.ts:77 and :102, src/lib/sportsbook/useLivePrices.ts:7. src/lib/sportsbook/store.ts:4,6 the choice is device-local (localStorage `pl_display_sportsbook_dk_v1`) and accepts any of the seven.

**Impact.** Accuracy: five of the seven selectable books cannot be bet in Arizona, yet selecting one re-prices EV, grade and Kelly in the browser (src/lib/sportsbook/football.ts:14-20, mlb.ts:84-89) and blanks the board's trap/pass notes (mlb.ts:107). Any stored board or row without a settlementBook stamp is treated as Caesars-priced, so a DraftKings number can be re-labelled.

**Proposed fix.** Restrict the selector to DraftKings, FanDuel and 'Best of DK/FD'. Change the four fallbacks to SETTLE_BOOK. Keep the other books only as a read-only sharp reference (Pinnacle) that never drives EV, grade or stake.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Partly real, overstated; the second half of the proposed fix is wrong.

CONFIRMED in code:
- src/lib/sportsbook/books.ts:1-9 lists seven books, Caesars first.
- src/components/sportsbook/SportsbookSelector.tsx:8 renders all seven; mounted as the toolbar on /games, /board, /builder, /props, /sharp, /simulator, /ballpark, /stats (src/components/shell/AppShell.tsx:302).
- src/lib/sportsbook/store.ts:4,6 keeps the choice in localStorage and accepts any of the seven.
- The four 'williamhill_us' fallbacks exist: football.ts:10, mlb.ts:77, 83, 92, 102 (five sites in mlb.ts, not two), useLivePrices.ts:7.
- Picking a non-settlement book does re-price EV/grade/Kelly in the browser (football.ts:14-19, mlb.ts:82-89) and blanks trap/passes/overview (mlb.ts:107).

REFUTED or overstated:
1. "A DraftKings number can be re-labelled" is not supported. Every current board writer stamps the book: app/api/generate/route.ts:446 and src/lib/engine-client.ts:397 call attachBookQuotes(..., SETTLE_BOOK), which stamps the board and every row (mlb.ts:71-72); the live overlay is stamped at src/lib/server/mlb-live-quote.ts:414 and :789. My script (/private/tmp/claude-501/audit-out/e3-6-stamps.py) read all 71 pl-history data/boards/*.latest.json.gz files: every board from 2026-09-17 on has settlementBook 'draftkings' on the board and on 100% of rows; the only unstamped boards are 2026-09-16 and earlier, which really were Caesars-priced. The fallback is a correct legacy default, as the code comments say.
2. The football fallback (football.ts:10) only fires when a row has neither displayBook nor a settle quote; with DraftKings selected it then re-prices from the DK quote, which is harmless.
3. The default is already DraftKings (books.ts:12-14, store.ts:6), so Caesars-first is list order only. The owner has to actively choose an unbettable book.
4. The selector is a display projection only. src/lib/useBoard.ts:60-61 says auto-allocation and ledger callers keep useBoard(); server paper cards hardcode "draftkings" (src/lib/cfb/found.ts:90, src/lib/cfb/card.ts:249) and lock-card.ts stamps the engine's settlement book (src/lib/server/lock-card.ts:709, 1096). No server or API code reads the selected book (grep of src/lib/server and app/api found none). The paper record is not affected.
5. Blanking trap/pass notes also happens when FanDuel is selected; that is by design because those notes are DK-priced, not an Arizona defect.

Fix correction:
- Restricting the selector to DraftKings and FanDuel (Pinnacle as a non-staking reference) is reasonable. store.ts:6 already falls back to DEFAULT_BOOK for an unknown stored key, so removed books degrade safely.
- Do NOT change the fallbacks to SETTLE_BOOK: that would label genuinely Caesars-priced pre-2026-09-17 unstamped data as DraftKings, creating the mislabel the finding fears. Leave them, or treat unstamped as unknown.
- 'Best of DK/FD' does not exist as a BookKey today; it would be new work, not a restriction.

Severity: low. It is a display-only option the owner must opt into, with no effect on locked paper cards or grading. I did not trace whether a hand-built Builder ticket saved to the ledger records the selected book's prices; if it does, that is the one path that could put a non-DK/FD price into the record.

<a id="f-e3-7"></a>
#### E3-7 — Day card prints '$X of $NaN' for server-locked MLB days

- Severity: low. Area: front end. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** app/ledger/page.tsx:317 renders `${tix.length} tickets · $... of ${e.daily + e.fun}`. Server found entries are written without a top-level `fun`: src/lib/server/lock-card.ts:1266-1296 (entry literal has daily, bankroll, paperCfg{daily,fun,since} but no fun) and src/lib/ledger-merge.ts:811 comment 'MLB entries carry no top-level `fun`'. 2500 + undefined is NaN.

**Impact.** Accuracy of a money figure on every found-mode day card since 2026-10-03; the day's ceiling (which is $2,500 plus that day's wins) is not shown correctly anywhere on the card.

**Proposed fix.** Compute the ceiling as `(e.daily ?? 0) + (e.fun ?? 0)` for legacy days and, for found days, show the real room: daily + sum of foundWonBy profit. Add the missing `fun?: number` optionality to the LedgerEntry type in src/lib/useLedger.ts so the compiler catches it.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed real by reading the code; I could not refute it. Severity is overstated: this is a broken label, not a wrong number that could mislead.

What I checked:
- app/ledger/page.tsx:317 renders `of ${e.daily + e.fun}` with no fallback. DayCard is mounted only from MlbLedgerPage (app/ledger/page.tsx:768).
- The found-mode server writer omits top-level `fun`: the entry literal at src/lib/server/lock-card.ts:1265-1296 has `daily: FOUND.daily` and `paperCfg.fun` only.
- No guard exists downstream:
  - The merge deliberately does not mint `fun` on a day that never had one (src/lib/ledger-merge.ts:2139-2150, "a day neither copy stamped gains no key").
  - src/lib/ledgerSync.ts:189 and :236 write the merged result to localStorage unchanged.
  - The engine's shLedger() returns the raw `pl_ledger` array, and useLedger only filters on `locked` (src/lib/useLedger.ts:104).
- The `LedgerEntry` type declares `fun: number` as required (src/lib/useLedger.ts:55), which is why the compiler never flagged it.
- No stored ledger sample exists in pl-history (only boards, props and odds archives), so this is confirmed from code, not from a rendered page or stored entry.

Corrections to the finding:
- Scope is wider than "found-mode days since 2026-10-03". The pre-found server writer buildLockEntry also writes no top-level `fun` (src/lib/server/lock-card.ts:901-915), so every server-locked MLB day shows NaN.
- Reason records carry neither `daily` nor `fun` (src/lib/server/lock-card.ts:77-88), so they show NaN too.
- Only days locked on the device by the legacy engine (which stamps `daily:SH.daily,fun:SH.fun`) render a real number.
- The ledger-merge comment is at src/lib/ledger-merge.ts:811 as cited; :541-542 says the same ("MLB entries stamp no `fun` at all").

Impact: low, not medium. The ticket count and the staked figure on the same line are correct. NaN affects only the "of $X" denominator in a collapsed summary on a paper-trading ledger. It does not touch stakes, grading, the record, or the merge caps, which use deskPaperOf/funCap rather than this expression.

Fix: the proposed direction is sound, with two adjustments.
- Use `(Number(e.daily) || 0) + (Number(e.fun ?? e.paperCfg?.fun) || 0)` for legacy days; `paperCfg.fun` is present on both server writers.
- For found days, show daily plus the sum of `foundWonBy`, which matches the writer's own ceiling (src/lib/server/lock-card.ts:1077 and the note text at :1293). Whether the $25 fun belongs inside that ceiling should be decided against foundCeiling, which I did not open.
- Making `fun` (and `daily`) optional on `LedgerEntry` is the right way to get the compiler to catch this.

<a id="f-e3-8"></a>
#### E3-8 — Collapsed MLB ticket rows show a blank price for found-mode bets and no book

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** app/ledger/page.tsx:261-263 prints `t.confirmed != null ? amSign(t.confirmed) + ' (NV)' : String(t.czOdds ?? "")`. The stored found ticket (src/lib/server/lock-card.ts:1207-1229) has czDec, bsDec, legs[].cz and settlementBook but no czOdds. Nothing in the ticket row reads settlementBook.

**Impact.** Accuracy: the price the bet was recorded at is not visible on the ledger row for every bet since found mode began, and the book is never shown, so the stored record cannot be checked against a sportsbook slip from this screen.

**Proposed fix.** Derive the American price from czDec (or the single leg's cz) when czOdds is absent and append the book tag from t.settlementBook. For the two-book system store `book` and `price` on the ticket explicitly and render those.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code, but the impact is overstated, so I rate it low rather than medium.

What I checked:
- app/ledger/page.tsx:261-263 renders the ticket-header price as `t.confirmed != null ? amSign(t.confirmed) + ' (NV)' : String(t.czOdds ?? "")`. There is no fallback to czDec or a leg's cz.
- src/lib/server/lock-card.ts:1207-1229 (found-mode core ticket) stores czDec, bsDec, legs[].cz and settlementBook, with no czOdds. The candidate `pl` does carry czOdds (lock-card.ts:162,193) but it is not copied onto the stored ticket.
- No read-path hydration exists: czOdds does not appear in src/lib/ledger-merge.ts (only a comment at :1992) and src/lib/useLedger.ts:71 only types it as optional. So the header price span is an empty string for found core tickets.
- settlementBook is not referenced anywhere in app/ledger/page.tsx, so the book is never shown per ticket.
- No stored found tickets exist in /private/tmp/claude-501/pl-history, so this is confirmed from code only, not from data.

Corrections to the finding:
1. The price is not invisible on the ledger. Expanding the row renders LegLine, which prints `l.cz` via amSign (app/ledger/page.tsx:173). On straight-only days (STRAIGHT_SINCE 2026-10-06, src/lib/found-mode.ts:103) every ticket is one leg, so the leg price is the ticket price, one tap away. Only the header price is blank (the header stays blank when expanded too).
2. "Every bet since found mode began" is too broad. Found FUN tickets do store czOdds (lock-card.ts:1050-1057), so the 2026-10-03 to 10-05 fun tickets show a price. The gap is found core/straight tickets.
3. The book is stated at page level: the MLB ledger header says grading is under DraftKings void rules (app/ledger/page.tsx:545). It becomes a real per-ticket gap only once tickets can be on either DraftKings or FanDuel.
4. Won/paid amounts are unaffected: payout settles on confirmed, then czDec, then czOdds (src/lib/ticket-payout.ts:33-39).

Additional stale labels on the same row the fix should cover: the "(NV)" suffix on a confirmed price (page.tsx:262) and the "no CZ price" fallback text (page.tsx:173), both Nevada/Caesars leftovers.

The proposed fix is sound: derive American from czDec (or the single leg's cz) when czOdds is absent, and render a book tag from t.settlementBook; for the two-book system store explicit book and price on the ticket.

<a id="f-e3-9"></a>
#### E3-9 — The Card page shows the legacy allocator's hypothetical card and pre-found instructions, not what the server will lock

- Severity: low. Area: front end. Auditor confidence: medium. Verification: confirmed. Status: open.

**Evidence.** app/builder/page.tsx:516-520 `card = shCardCalc(d)` when unlocked and :553-558 `shadow = shCardCalc(d)` when locked (the old daily/fun multi-leg allocator); :913-960 'If unlocked — current card ... Hypothetical'; :965-973 empty-state copy about DAILY spread across at least 4 tickets, parlays and FUN longshots. The server rule is one-leg +EV straights only (STRAIGHT_SINCE 2026-10-06) sized by src/lib/found-mode.ts:55-76,165-172. :819-825 'Still filling — $X of $locked.daily' compares to the flat daily, not daily plus same-day wins. Bankroll chip is $2,500-based (src/lib/bankroll.ts:30,119-124) while found stakes are sized on a constant $10,000 (src/lib/found-mode.ts:61-63).

**Impact.** Accuracy: the page headed as today's card can show tickets, stakes and a bankroll that have no relation to what the paper system actually bets. The owner cannot preview the next found pass from the UI.

**Proposed fix.** On found days, replace the shCardCalc card/shadow with the server's own candidate list (same filter and foundStake the lock pass uses) plus the already-locked bets; show remaining room as daily + wins − staked; show the sizing bankroll the engine actually uses. Delete the pre-found empty-state copy.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Confirmed in code; I could not refute it, but I downgrade it from medium to low. It is display-only on the MLB desk, and the locked panel at the top of the page shows the real server bets.

**What I checked (all paths relative to /private/tmp/claude-501/pl-audit):**
- **Legacy allocator on the page:** app/builder/page.tsx:516-520 (`card = shCardCalc(d)` when unlocked) and :554-558 (`shadow = shCardCalc(d)` when locked) call the legacy function defined at legacy/index.html:3368. Neither is gated on `foundToday`.
- **Server path is different:** the MLB found pass is `buildFoundLockEntry` (src/lib/server/lock-card.ts:1071-1192). It builds its pool from `shCardPool` plus `buildStraightPool`, applies `shrinkTicket`, caps legs at `foundMaxLegs` (1 from STRAIGHT_SINCE, src/lib/found-mode.ts:103-116), and sizes with `foundStake` (found-mode.ts:165-172). It never calls `shCardCalc`.
- **Shadow panel:** page.tsx:913-960 is as described. Its copy says "The exact allocator + fun-pick pipeline", which is not the pipeline the server runs on a found day.
- **"Still filling" line:** page.tsx:819-825 compares against `locked.daily`. The server writes that as flat `FOUND.daily` = 2500 (lock-card.ts:1273), while the real ceiling is `foundCeiling(won)` (lock-card.ts:1076-1077). Once same-day wins push staked past $2,500 the line disappears even though room remains.
- **Bankroll mismatch:** the chip shows `getBankroll()`, built on `BANK_BASE` 2500 (src/lib/bankroll.ts:30,119-124; src/lib/engine-client.ts:501-517). Found stakes use the constant `FOUND.bankroll` 10000 (found-mode.ts:63,168).

**Corrections to the evidence:**
- **Empty-state copy is rarely reached.** `getMoney` resets fun to `FUN_DEFAULT` = 5 each new day (engine-client.ts:421, 505-510), so `money.daily === 0 && money.fun === 0` (page.tsx:966) is normally false. The stronger form of the defect is that, on a found day before the first server lock, the page renders a legacy "FUN money" longshot card by default (page.tsx:1095-1107), although `foundFunOf` is 0 on straight-only days (found-mode.ts:119-121).
- **Shadow stakes are doubly unrelated.** `getMoney` also stamps the ~$2,500 managed bankroll into the engine (engine-client.ts:511-512), so the legacy card's Kelly figures are priced off that, not the $10,000 the server uses.
- **Related stale copy:** page.tsx:815 still says "Confirm the NV app's price".

**Why low, not medium:**
- **No effect on money or the record.** The Lock button is hidden on found days (page.tsx:777-784) and `lock()` refuses (page.tsx:604-607).
- **The page already discloses the rule.** A note reads "Bets lock on their own as the engine finds them · up to $2500 today + today's wins" (page.tsx:778), the PaperBanner states straight-bets-only (src/components/ui/PaperBanner.tsx:17-29), and the shadow is labelled "Hypothetical".
- **The real locked bets are shown accurately** in the LOCKED panel (page.tsx:805-858). The impact claim that the page shows tickets with "no relation" to what is bet applies only to the pre-lock card and the shadow panel.
- **MLB desk only.** CFB and NFL route to their own builders (page.tsx:408-438), and `CfbBuilder` already uses `foundCeiling(foundWonOf(locked))` (src/components/cfb/CfbBuilder.tsx:469).
- **Likely dormant now.** It is November, and the last archived MLB board in pl-history is data/boards/2026-10-17. I could not determine live state without network.

**Fix notes:**
- The candidate filter lives in server-only src/lib/server/lock-card.ts. A client preview needs that filter extracted into a shared pure module, or a read-only endpoint; it cannot simply be imported.
- For remaining room, the entry already carries `unallocated = ceiling − staked` (lock-card.ts:1278), or the page can use `foundCeiling(foundWonOf(locked))` as `CfbBuilder` does.
- The cheapest interim fix is to skip `shCardCalc` and the shadow panel when `foundToday` is true.

<a id="f-e3-10"></a>
#### E3-10 — No visible build indicator, and the self-update compares commit SHA only, reloads once per SHA per session, and is a no-op when the SHA is empty

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** Command: `grep -rn 'BUILD_SHA\|api/version' src app next.config.ts` returns only src/components/shell/SwRegister.tsx:6,19,24,28 and next.config.ts:10-11 — no component renders the SHA. SwRegister.tsx:19 `if (!BUILD_SHA) return false`; :28-31 reload only when sha differs and sessionStorage `pl_reloaded_for` is not already that sha; :33-36 errors swallowed. app/api/version/route.ts:10 returns VERCEL_GIT_COMMIT_SHA. next.config.ts:11 inlines the same variable.

**Impact.** Reliability: the owner has no way to confirm which build the phone is running. Two deployments of the same commit (redeploy after an env change, or a CLI deploy of an uncommitted tree) share a SHA so the installed app never reloads; if the variable is empty on a build the check is disabled entirely. Whether CLI deploys populate the variable could not be determined from disk.

**Proposed fix.** Expose a deployment identity (env NAME VERCEL_DEPLOYMENT_ID, plus build time) through /api/version and NEXT_PUBLIC_*, compare that instead of the commit SHA, and print 'build <short sha> · <time>' in the Settings Data panel and the rail footer. If the check has reloaded once and the ids still differ, show a 'new version — tap to reload' banner instead of silently giving up.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Evidence confirmed by opening the files; severity overstated (low, not medium).

CONFIRMED
- src/components/shell/SwRegister.tsx:6 BUILD_SHA from NEXT_PUBLIC_BUILD_SHA; :19 `if (!BUILD_SHA) return false` (check disabled when empty); :28 reload only if server sha is non-empty and differs; :29-30 sessionStorage `pl_reloaded_for` blocks a second reload for the same sha; :33-36 catch swallows errors (intended as the offline path).
- app/api/version/route.ts:10 returns only `{ sha: VERCEL_GIT_COMMIT_SHA ?? "" }`. next.config.ts:11 inlines the same variable. No deployment id or build time anywhere (grep for VERCEL_DEPLOYMENT_ID / BUILD_ID / generateBuildId: no hits).
- No UI renders a build stamp: BUILD_SHA is referenced only in SwRegister.tsx; SwRegister is mounted once in app/layout.tsx:49 and returns null (SwRegister.tsx:56). The only other use of the commit SHA is app/api/calibrate/route.ts:398,522 (`rev` on server-side calibration records); my grep for `rev` in src/ and app/ found type fields only, no component displaying it.
- tests/board-refresh-full.test.ts:365-384 pin this exact behaviour, so any fix must update those assertions.

CORRECTIONS / MITIGATIONS THE FINDING OMITS
- The once-per-SHA guard is deliberate, documented at SwRegister.tsx:16-17 ("so an edge that lags the origin can never loop the app"). It is a design trade-off, not an oversight. The residual gap is narrower than stated: only if the single reload still returns the old bundle does the app stay stale until force-quit.
- public/sw.js:25-35 is network-first for navigations, so the one reload does fetch the new page when online; that makes the "silently giving up" case unlikely on the normal path.
- Deploy path: tools/sync-handoff.sh:510-514 says a git push to `frontend-rebuild` triggers the production deploy and is "the normal path"; vercel.json:3-6 disables git deploys only for `main` and `line-history`. On git-triggered deploys the SHA is populated and changes with every deploy, so the mechanism works for the normal path. (docs/session-handoff.md:1781 says the opposite — "git pushes do NOT deploy" — but that is an older entry; the two documents disagree.)
- The same-SHA scenario is real but limited to (a) a CLI deploy of an uncommitted tree — documented as having happened: tools/sync-handoff.sh:513-514 "uploads the local working tree, not the commit. That has shipped half-written files before" — and (b) a redeploy after an env change, where the only client-visible difference is NEXT_PUBLIC_* inlined values; server-side env changes take effect regardless because API calls hit the new deployment.
- Whether a CLI deploy populates VERCEL_GIT_COMMIT_SHA could not be determined from disk (the finding says the same). If it does not, the result is an empty sha on both sides and the check is a no-op for that build (SwRegister.tsx:19 and :28).

SEVERITY
Low. Single-owner paper-trading app; no money, grading or data-integrity effect. The worst outcome is a stale client bundle on the phone after an off-path deploy, cured by force-quitting the app. The missing visible build stamp is a diagnosability gap, not a defect.

FIX
The proposed fix is reasonable but must keep the anti-loop property. Comparing a deployment identity (env NAME VERCEL_DEPLOYMENT_ID) instead of the commit SHA would cover same-commit redeploys and dirty-tree CLI deploys; keep the once-per-id sessionStorage guard and add the tap-to-reload banner only as the fallback. Showing 'build <short sha> · <time>' in Settings is the cheapest and most useful part. tests/board-refresh-full.test.ts:371-384 would need updating.

<a id="f-e3-11"></a>
#### E3-11 — Service worker cache name is a fixed literal, so nothing is ever purged; icons and fonts are cache-first forever; offline fallback points at a redirect

- Severity: low. Area: front end. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** public/sw.js:4 `const CACHE = 'parlay-lab-next-v1'`; :10-16 activate deletes only caches whose name differs from CACHE (never true); :38-49 cache-first for /_next/static/ and any .png/.woff/.woff2 with no revalidation; :25-36 navigation falls back to caches.match(req) then caches.match('/'), while the app root redirects to /games and the manifest start_url is /games (public/manifest.webmanifest).

**Impact.** Reliability and speed: every deployment's hashed chunks accumulate on the phone indefinitely; a replaced icon or font under the same URL is never picked up; the offline fallback for an uncached route is likely a miss. HTML is network-first and /api is bypassed (sw.js:23), so this does not serve stale data — the stale-app risk sits in the SHA check above, not here.

**Proposed fix.** Name the cache with the build id so activate actually purges old entries, use stale-while-revalidate for png/woff, and fall back to the cached '/games' document.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e3-12"></a>
#### E3-12 — /taken feed and push alerts carry no book name, no loss amount and no totals; ungradable bets are shown as 'void'

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/bet-alert.ts:93-96 alertBody is `ticket words + American price + ($stake)` with no book; :129 void, ungradable and cancelled all map to 'void'. app/taken/page.tsx:193 prints an amount only for wins (`+$${Math.round(r.payout - r.stake)}`); the page has no P/L, ROI, record or book column. Football found tickets store no book name at all (per pick-trace.md section 2.8, not re-opened).

**Impact.** Accuracy: the one screen that lists every bet the system took cannot tell the owner which book to place it at, shows losses without an amount, and has no running result. An ungradable bet (a grading failure) is indistinguishable from a legitimate void.

**Proposed fix.** Store `book` on every found ticket in all three sports; add it to alertBody ('DK' / 'FD') and to each /taken row; show −$stake on losses; add a header strip with today's and all-time staked, P/L, ROI and W-L split DK / FD / combined; show 'ungradable' as its own state.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Every code claim checks out, but the impact is overstated; I rate it low, not medium.

**Confirmed in code**
- `src/lib/bet-alert.ts:93-96`: `alertBody` is ticket words + American price + `($stake)`, with no book. The same string is the push body (`src/lib/server/push.ts:171-172`) and the feed row text (`bet-alert.ts:155`).
- `src/lib/bet-alert.ts:129`: `void`, `ungradable` and `cancelled` all become status `void`. `TakenStatus` (`:107`) has no ungradable member, and `app/taken/page.tsx:27` prints the word "void".
- `app/taken/page.tsx:193`: an amount is printed only when the status is `won`. The page (`:182-200`, `:279-303`) has no P/L, ROI, record or book column, and `TakenRow` (`bet-alert.ts:109-123`) has no book field.
- Football tickets store no book: a grep for `settlementBook` under `src/lib/cfb`, `src/lib/football`, `src/lib/nfl`, `src/lib/server/football-lock.ts` and `football-props.ts` is empty. MLB does stamp it (`src/lib/server/lock-card.ts:1096`, `:1223`).

**Why the impact is overstated**
1. **Book is constant today.** Every bet is priced and settled at DraftKings (`src/lib/sportsbook/books.ts:12`; football `settleBook: "draftkings"` per `pick-trace.md:270`, not re-opened). The missing book name loses no information now. It becomes a real gap only if a FanDuel-priced bet is ever recorded, so it is a prerequisite for the two-book change, not a current accuracy bug.
2. **The alert wording is the owner's own spec.** `bet-alert.ts:2-6` quotes it verbatim ("Justin Jefferson Anytime TD +105 ($730)"), and the page header says each line is exactly what the alert said (`app/taken/page.tsx:297`).
3. **Loss amount is on the row.** A lost row shows "lost ✗" beside text that ends in `($stake)`, and on a straight bet the loss equals the stake. What is missing is an explicit −$ figure.
4. **/taken is not the only screen listing every bet.** It is a sub-page one tap from the Ledger (`app/ledger/page.tsx:338-345`). The Ledger carries staked, P/L, ROI and W-L (`src/lib/ledger-stats.ts:37-56`) and shows ungradable as its own gold pill (`app/ledger/page.tsx:74-75`). A totals strip on /taken is a feature request.
5. **The ungradable/void conflation is real but narrower than stated.**
   - MLB: `ungradable` is a true grading failure ("no final score", "stat missing", "unknown market" at `src/engine2/grade.ts:76,84,90,103,133`), distinct from the legitimate `void` at `:70,97,101,111`. Labelling it "void" on /taken does hide a failure.
   - Football: there is no `void` result at all (`src/lib/cfb/types.ts:244`). `ungradable` is the void state there ("a leg is void" at `src/lib/cfb/grade.ts:350`; "past kickoff — void" at `:337`), so "void" is roughly right.
   - `cancelled` is never produced anywhere in `src` or `app`; that branch is dead.

**Correction to the fix**
- Keep the book stamp on football tickets and the book in the alert/row as part of the two-book work.
- The separate ungradable state matters mainly for MLB.
- The totals strip is optional, since the Ledger already has it.

Paper trading only; nothing here changes a pick, stake or grade.

<a id="f-e3-13"></a>
#### E3-13 — Profit and ROI are adjacent on the ledgers but there is no staked tile on MLB, no book split, no combined core+fun or all-sport view

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** MLB: app/ledger/page.tsx:653-657 Net P/L, :659-663 ROI, :665-670 Record, :672-675 Max drawdown, :677-685 CLV; scope is core or fun only (comment :397-399 rules out a combined net). Football: src/components/cfb/CfbLedger.tsx:955-956 Net P/L and ROI StatTiles side by side, with staked printed in a caption a few lines above. No file under app/ or src/components renders a DK / FD / combined split; app/taken/page.tsx shows neither figure.

**Impact.** Accuracy of reporting: ROI is shown without its denominator on MLB, results cannot be compared by book, and there is no single number for the whole paper account across MLB, CFB and NFL.

**Proposed fix.** Add a Staked tile beside Net P/L and ROI on every ledger; add a three-way DK / FD / Combined segmented control that drives all tiles from the server report; add an 'All sports' summary row at the top of the Ledger.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Evidence confirmed by opening the files, but this is a presentation gap and partly a feature request, not a wrong number, so I rate it low rather than medium.

Confirmed:
- MLB ledger tiles are exactly Net P/L, ROI, Record, Max drawdown, CLV (app/ledger/page.tsx:654, 660, 666, 673, 677). The only "stake" mentions in that file are per-ticket (:260, :281) and the per-day "$X of $Y" line (:295, :316). No aggregate staked figure is rendered on the page.
- Scope is core or fun only, with the comment ruling out a combined net (app/ledger/page.tsx:397-400).
- Football: Net P/L and ROI StatTiles at src/components/cfb/CfbLedger.tsx:955-956, with "staked on settled tickets" in a caption at :948-950. Scopes are core/fun only (:47-50).
- No per-book results split and no all-sport P/L summary found by grep across app/ and src/components. app/taken/page.tsx renders no P/L or ROI.

Corrections and mitigations:
1. The MLB staked tile is a trivial render, not a data gap: ledgerStats already returns staked (src/lib/ledger-stats.ts:50, :76) and the page already holds that stats object (app/ledger/page.tsx:434). ROI is computed correctly; only its denominator is not displayed.
2. Staked, P/L and ROI do appear together for MLB on another page: the Stats page Discipline table (src/components/stats/DisciplinePanel.tsx:67-71, mounted at app/stats/page.tsx:633), though split gated/override by core/fun rather than as a ledger total.
3. "No combined core+fun" is a deliberate owner ruling, not a defect (app/ledger/page.tsx:397-399). ledgerStats supports an "all" scope (src/lib/ledger-stats.ts:37, :42) that was intentionally removed from the UI. The football bankroll tile does blend both buckets (src/components/cfb/CfbLedger.tsx:960-962), so that part of the title is slightly overstated for football.
4. The book split has nothing to split today: there is a single settlement book (src/lib/sportsbook/books.ts:12, SETTLE_BOOK = 'draftkings') and the lock path stamps one settlementBook per card (src/lib/server/lock-card.ts:709, :731). A DK / FD / Combined control only becomes meaningful after paper tickets can settle at FanDuel, so it is a dependent feature of the two-book work, not a reporting-accuracy bug.
5. The proposed "All sports" summary row and "Combined" view should be put to the owner first, since they sit close to the blended number he explicitly ruled out.

The only cheap, uncontroversial fix is the Staked tile on the MLB ledger (and optionally promoting the football caption to a tile).

<a id="f-e3-14"></a>
#### E3-14 — The only 'not offered' control is a Caesars-era, display-only, per-device hide that never reaches the lock pass or the record

- Severity: low. Area: front end. Auditor confidence: high. Verification: confirmed. Status: open.

**Evidence.** src/lib/cz-offered.ts:9-17 header 'IS THIS PICK OFFERED AT CAESARS RIGHT NOW?' and states it is display-only and never touches the engine, the card or the record; storage key `pl_cz_hidden_v2` (:35); keys scoped `book:${book}:${k}` unless Caesars (:171-173). Used only on the Board: app/board/page.tsx:59, 260, 290, 567, 964 and src/components/ui/CzInfo.tsx:25-34.

**Impact.** Paper profit accuracy: a market that Arizona DraftKings/FanDuel does not offer can still be locked by the server and counted in the record; marking it on the Board only hides the row on that device.

**Proposed fix.** Add a server-stored 'not available in AZ' list (sport, market, book, optional player/game) written from a control on each Board row and each /taken row; have the found pass in all three sports skip matching candidates, and let a marked, already-locked bet be voided with a reason so the record excludes it.

**Reviewer corrections** (second reviewer, verbatim; where this differs from the text above, this is the corrected version).

Core claim confirmed, but one part of the description is wrong and the impact is unproven, so I downgrade from medium to low.

CONFIRMED
- src/lib/cz-offered.ts:9-16 carries the header "IS THIS PICK OFFERED AT CAESARS RIGHT NOW?" and says the toggle "never touches the engine, the card, or the record — display only". Storage key `pl_cz_hidden_v2` is at :35.
- The toggle is consumed only by app/board/page.tsx (:59 import, :261 hook, :283 row filter, :289 hidden count, :567 and :964 CzInfo) and src/components/ui/CzInfo.tsx:25-34. No other component uses it.
- Nothing in the lock path reads it. A grep for prefs/czHidden/isHidden in app/api/generate, app/api/scheduler, app/api/cfb/lock, app/api/nfl/lock, src/lib/found-mode.ts and src/lib/football returned nothing.
- There is no user-driven void or "not available" control. app/api/taken/route.ts exports only GET, and app/taken/page.tsx's only mutating calls go to /api/push (bet alerts).
- The only market kill switch I found is a code constant: OUTS_OFF_SINCE at src/lib/found-mode.ts:146.

CORRECTIONS TO THE EVIDENCE
- "Per-device" is inaccurate. cz-offered.ts:18-24 and :75-110 sync the map across devices through /api/prefs, stored server-side in Redis under `pl:prefs:v1` (app/api/prefs/route.ts:26). It is device-local only when no sync phrase is entered. That server copy is read only by app/api/prefs/route.ts, whose own header (:21) says nothing there reaches the engine, card or record. The CzInfo.tsx:8 comment saying "device-local" is stale.
- Line citations are off. The file is 156 lines; the book scoping is at :154, not :171-173. The Board lines are 261 and 289, not 260 and 290.
- The scoping is as described: keys are bare for `williamhill_us`, otherwise `book:${book}:${k}`. The default book is now DraftKings (src/lib/sportsbook/books.ts:12-14), so the toggle already works per selected book. The UI wording is already generic ("offered at the selected sportsbook", CzInfo.tsx:25-34); only the code comments and names are Caesars-era.

WHY THE SEVERITY IS OVERSTATED
- "The only not-offered control" ignores an implicit gate: the found pass qualifies bets "at the settlement price" (src/lib/found-mode.ts:24), and the settlement book is DraftKings (books.ts:12). The NFL lock refuses to write when there is no DraftKings price (app/api/nfl/lock/route.ts:262). A bet is therefore locked only when the odds feed shows a DraftKings quote.
- The remaining gap is narrower: the feed's DraftKings quote is not Arizona-specific, and FanDuel availability is not checked at all. The finding cites no instance of an Arizona-unavailable market actually being locked, and I did not look for one in pl-history.
- This is paper trading, so the consequence is a possibly overstated record, not money. It is a missing feature (no server-side exclusion or void-with-reason), not a defect in existing behaviour.

ON THE FIX
- The direction is sound. It needs its own key scheme: the existing server-synced map is keyed by display strings (`label|sub`), which is unsuitable for matching lock candidates, so use sport/market/book/player/game keys as proposed.
- A void-with-reason must respect the append-only card rule (src/lib/append-only.ts is referenced at found-mode.ts:16). It should be a grade or exclusion flag on the ticket, not a deletion.
- The toggle exists only in app/board/page.tsx; I did not check whether the football boards expose any equivalent, so the fix should confirm coverage for all three sports.

<a id="f-e3-16"></a>
#### E3-16 — Settings 'Device passcode' is a dead control: saved to localStorage and never sent or checked

- Severity: low. Area: front end. Auditor confidence: high. Verification: not-verified (low). Status: open.

**Evidence.** Command: `grep -rn 'pl_pass' src app` returns only app/settings/page.tsx:328 (read into state), :361 (setItem) and :362 (removeItem). The panel at app/settings/page.tsx:454-465 says it gates spend-money actions and must match the APP_PASSCODE environment variable.

**Impact.** Reliability/credits: the UI promises a spend gate that does not exist in the client; the real gate is the sync phrase header. Misleading, and a prior-audit item still open (prior-audit-regression.md M28).

**Proposed fix.** Remove the panel, or send the value as a header on the credit-spending routes and verify it server-side.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-e3-17"></a>
#### E3-17 — Rest-of-season projection simulates with the model's own win probabilities and a season end that has passed

- Severity: low. Area: front end. Auditor confidence: medium. Verification: not-verified (low). Status: open.

**Evidence.** legacy/index.html:3974-4004 shProjection draws each stored ticket as a win with probability t.prob/100 and runs to SH_CFG.seasonEnd; seasonEnd is "2026-09-27", so days is 0 and the function returns null today. Rendered at app/ledger/page.tsx:723-744 when non-null. baseline.md reports the claimed edge (+5.11%) against −5.00% at closing fair.

**Impact.** Accuracy: when it is shown it projects bankroll growth from the model's unverified edge rather than from realised results. Currently hidden only because of a stale date constant.

**Proposed fix.** Either delete the panel or bootstrap from realised per-ticket returns (resample settled tickets), and label it as such.

**Reviewer corrections.** None. Low severity; not put through the second reviewer.

<a id="f-p-13"></a>
#### P-13 — M14/A1/A2/A4 allocator amendments never shipped; A3 decision due 2026-09-22 not found

- Severity: low. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** legacy/index.html:3083 `base:probMode?prob:...` with probMode true for ev_gated and dk_fd (:3032) - price-blind ranking unchanged; fixed EV floor :3033/:3039 (A2); perParlayCap 0.25 at :1069 and :3138 (A4); consMinEv structure :3068-3079 unchanged and no decision record located (docs/freeze-exit-bundle.md:632-642 required one by 2026-09-22); shared-game damping 0.5 never fitted at :3119 (M16).

**Impact.** None on the money path today because found mode does not call the allocator (src/lib/server/lock-card.ts:260). It still shapes the device Builder's card preview and would re-arm unchanged if found mode were switched off.

**Proposed fix.** Either delete the dead allocator path from the lock flow or ship A1 (edge-aware base weight) before any return to engine-allocated cards; record the A3 decision.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-14"></a>
#### P-14 — M20/M24/M26: legacy selection modes still selectable and the Kelly ceiling and oversizing banner are still mode-gated

- Severity: low. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** app/settings/page.tsx:74 and :77 still offer `probability` and `caesars_ev`; src/lib/engine-client.ts:58 persists them. Kelly ceiling applied only when `disciplined` (legacy/index.html:3139-3146) while p.kelly is stamped in every mode (:3377-3381). app/builder/page.tsx:1069 still gates the banner on `card.kellyDaily > 0`; :1041 still hides RebuildNote when there are no picks. Mitigation: the device lock is refused on found days (app/builder/page.tsx:600-607).

**Impact.** The Builder can still display a card sized far above its own computed Kelly ceiling with the warning suppressed. It cannot be locked from the device while found mode is on, so this is display-only today.

**Proposed fix.** Remove the two legacy modes from Settings (or apply the ceiling in all modes) and drop the positivity gate on the banner as the register specified.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-15"></a>
#### P-15 — M19 and M22 spec-only fixes never shipped (duplicate ticket emission; grade-detail rewrite keeps no prior value)

- Severity: low. Area: prior audit regression. Auditor confidence: medium. Verification: not-verified (regression table). Status: open.

**Evidence.** buildParlaySet pushes without ticket-level dedupe at legacy/index.html:2798, :2809, :2819; probNaive is set only when simJoint succeeded (:2764). shGradeOrientFix overwrites g.detail in place and stamps v=2 with no copy kept (legacy/index.html:3661-3676).

**Impact.** Duplicate and naive-priced tickets can still appear in the displayed parlay sets (the found card dedupes by id at src/lib/server/lock-card.ts:1107-1116, so no double stake there). The detail rewrite touches only the score string on ML/RL legs, never a result.

**Proposed fix.** Dedupe emitted tickets by leg-set id inside buildParlaySet and tag naive-priced same-game groups; keep the prior detail string in a `detailV1` field when rewriting.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

<a id="f-p-16"></a>
#### P-16 — The audit register itself is stale: M1 and M3 are listed as unshipped but shipped on 2026-08-27

- Severity: low. Area: prior audit regression. Auditor confidence: high. Verification: not-verified (regression table). Status: open.

**Evidence.** docs/freeze-exit-bundle.md:30 and :33 and CLAUDE.md:824-845 still describe M1/M3 as specs; code shows them live under SH_CFG.envCf: legacy/index.html:1643-1648, :2326, :2359; armed by src/lib/env-adjust.ts:24-27 at app/api/generate/route.ts:439, app/api/scheduler/route.ts:256, src/lib/engine-client.ts:126. Likewise M29 (dirPref) is now wired (src/lib/engine-echo.ts:108, :155; app/settings/page.tsx:34, :94) and M27 was narrowed (tests/sha-references.test.ts:53, :80-85) without the register being updated.

**Impact.** Anyone planning model work from the register will mis-state what is live, and the freeze is nowhere recorded as ended even though model changes shipped during it.

**Proposed fix.** Update the register rows with shipped dates and commit references, and record the freeze's actual end state.

**Reviewer corrections.** None. This finding was not put through the second reviewer; its status row is in the regression table in section 5.

### A.3 Refuted findings: reviewer notes

#### B2-8 — Fixed sigma does not fit blowout spreads: the market's own ML and spread disagree with the model by up to 4.5 points of win probability (REFUTED)

Refuted as stated: the quoted numbers reproduce, but the cause is the moneyline de-vig, not sigma, and the claimed impact cannot occur on a DraftKings/FanDuel basis.

**What I confirmed**
- Code citations are accurate: `pSpread = normCdf(mktMargin / sigma)` at src/lib/cfb/model.ts:422; sigma 16.5 at src/lib/cfb/rules.ts:70; blend weights at rules.ts:73; the found filter at src/lib/cfb/found.ts:138 has `cz.dec <= R.maxDec` and no minimum price.
- Section H figures match /private/tmp/claude-501/audit-out/b-football/probe.out.txt:67-79.
- The "real capture" is the test fixture tests/fixtures/cfb/odds-ncaaf-2026-09-05.json. pl-history holds MLB data only, so there is no football history to check against.

**Why the interpretation is wrong**
- I read the raw moneyline prices on the four 34+ games (script: /private/tmp/claude-501/audit-out/verify-b2-8/ml.py). Every book quotes the favourite at -100000 (BRY@ARMY, UNT@IU, BALL@OSU) or -15000/-20000 (UNH@SYR), a raw implied 0.993-0.999. The dogs are +1425 to +10000.
- The "ML consensus" of 0.938-0.976 is produced by `devigProportional` in `readBooksOf` (model.ts, the `keys.ml` branch) stripping a one-sided overround of 1.02-1.06 off the favourite. It is not the market disagreeing with the spread.
- The spread-implied 0.98-0.999 is closer to the raw moneyline than the consensus is. The "reconciling sigma" of 22-25 is reconciling against that artefact.
- On games with 13-25 moneyline books and margins of 6-28, the reconciling sigma is 14.63-17.45 and the largest gap is 0.018 (LIB@JMU), so 16.5 fits where moneylines are actually traded.
- Book counts are thinner than reported: UNH@SYR 2, BRY@ARMY 2, UNT@IU 3, BALL@OSU 5.

**Why the impact does not hold**
- Neither DraftKings nor FanDuel posts a moneyline on any of the four games. I rebuilt the board (/private/tmp/claude-501/audit-out/verify-b2-8/v.ts, output in v.out.txt): those moneyline rows have no DK quote, `evCz` null, `playable` false.
- Where DraftKings does quote heavy favourites (-800 to -6500), `evCz` on the home moneyline is -4.16 to -5.47.
- Dropping the spread term entirely moves those EVs by at most about 0.4 points (ECU@ALA -4.16 vs -4.52), and in both directions.
- When DraftKings is at consensus, favourite EV is bounded by 0.6/overround + 0.4*dec - 1. That cannot reach the +1% gate on a short price: DraftKings' -6500/+2000 has overround 1.032, which would need dec >= 1.07 even with the spread and FPI terms both at 1.
- The "too-thin tails at an alternative line" claim is weak: each book's margin is backed out and re-evaluated with the same sigma, so near-consensus lines are self-consistent.

**On the proposed fix**
- Fitting sigma to these moneyline readings, or dropping the spread term, would pull heavy-favourite fair values toward the de-vig artefact and make them worse.
- A minimum decimal price is harmless hygiene but does not address anything this mechanism can cause.

**Where the real distortion is**
The same proportional de-vig inflates longshot moneylines: DraftKings away dogs at dec 9-21 show `evCz` of +7.86 to +20.88 (ECU, ORST, CCU, OHIO). The core and found paths block these only through `maxDec` 2.6. Whether any other path (fun tickets, generator) can pick them up I did not check. That, plus the fact that sigma is an unbacktested constant, is the defensible residue, at low severity.

#### C2-3 — Parlay Generator fills legs with prices from books the owner cannot bet, and the one-book switch (czOnly) cannot be turned on from the UI (REFUTED)

Refuted: the cited code exists, but the best-of-any-book fallback is unreachable on every Parlay Generator path, because rows are repriced to one selected sportsbook before the pool is built.

What I confirmed as quoted:
- `sidePrice` falls back to `r.o`/`r.u` with `oBook`/`uBook` (src/components/props/props-model.ts:278-285).
- The pool takes `leg.cz`/`leg.book` from it (src/components/props/mlb-gen-pool.ts:102-127).
- The `czOnly` filter is at src/lib/parlay-gen.ts:538, defaults false (app/props/page.tsx:113, src/components/cfb/CfbProps.tsx:756), and no UI control sets it true (only src/components/props/GenSheet.tsx:138 sets it false).
- Seat rules have no same-book rule (src/lib/parlay-gen.ts:668-698).

The guard the auditor missed:
- **MLB generator:** the pool is built from `propBoard = browseProps.rows` (app/props/page.tsx:204-205, 249). Every row there has been through `priceMlbProp(r, book)` (src/lib/mlb/useBrowseProps.ts:15, and before that `usePricedBoard` -> `priceMlbBoard`, src/lib/useBoard.ts:62, src/lib/sportsbook/mlb.ts:100-101).
- **What `priceMlbProp` does** (src/lib/sportsbook/mlb.ts:91-97): it overwrites `o`/`u` with the selected book's price or null, and `oBook`/`uBook` with that book's name. So when the `cz` side is null, `r.o` is null too and `sidePrice` returns null; the side is dropped, not priced elsewhere.
- **Live rows:** also wrapped in `priceMlbProp` (src/lib/mlb/market-board.ts:87-93).
- **Football generator:** `mode` is hardcoded `"cz"` (src/components/cfb/CfbProps.tsx:809) and `propQuote` returns `row.cz` only in that mode (CfbProps.tsx:380-383).
- **Cross-sport pool:** reprices with one `book` argument (src/lib/cross-sport.ts:28-33, 44).
- **Default book:** the selected book defaults to DraftKings (src/lib/sportsbook/books.ts:12-14, src/lib/sportsbook/store.ts:6).

Data check: the auditor's script (audit-out/scripts/areaC_fallback_book3.py) counts raw stored rows and skips the client repricing. I wrote /private/tmp/claude-501/audit-out/scripts/verify_c2_3.py, which applies the `priceMlbProp` logic and then `sidePrice` to the same 28 DraftKings-settlement boards.
- Selected book DraftKings: 39,704 raw sides -> 32,346 legs, all tagged DraftKings; exactly 7,358 sides dropped (the auditor's "fallback" count).
- Selected book FanDuel: 13,245 legs, all tagged FanDuel.
- No leg at any other book in either run.

So the impact claims (one side in five quoted at an unbettable book; mixed-book tickets) do not occur. With a single-book pool, the missing `czOnly` toggle and the missing same-book seat rule are moot.

What remains, at low severity:
- The `sidePrice` fallback is a latent trap if a future caller feeds unrepriced rows to `buildPool`.
- The sportsbook selector still lists books the owner cannot use: Caesars, BetMGM, BetRivers, Fanatics, Pinnacle (src/lib/sportsbook/books.ts:1-9). Picking one gives a single-book ticket at that book. That is a separate, user-chosen issue.
- Sides DraftKings does not post are dropped (18.5% of sides) with no FanDuel fallback. That is a coverage or feature gap, not a wrong price.

The proposed fix (build DK and FD tickets separately) is an enhancement, not a bug fix.

#### E3-15 — No 'Run picks now' control: the existing Refresh buttons re-price the board but the found/lock pass only runs on its own schedule (REFUTED)

Refuted on its central claim: the existing Refresh buttons already run the found/lock pass on demand, so the pass does not run "only on its own schedule".

What I checked (all paths relative to /private/tmp/claude-501/pl-audit):

- The cited lines exist as quoted: app/board/page.tsx:1188-1194 ('Refresh MLB' / 'Generate board'), src/lib/mlb/use-board-refresh.ts:18-56 and :84/:115, app/builder/page.tsx:604-607 and :777-784, src/lib/refill-client.ts:14-20, src/lib/engine-client.ts:179 (GEN_CREDITS_EST = 172).
- MLB tap with the sync phrase stored: POST /api/refill?desk=mlb runs decideMlbRefill with slot "manual" (app/api/refill/route.ts:68-72).
- On a found day (FOUND_SINCE 2026-10-03, src/lib/found-mode.ts:53) decideTopUp takes the found branch (src/lib/server/blocks.ts:272-284). It refuses only when the day is fully deployed (under $5 open) or every game has started. The same-slot gate excludes "manual" (:280), and there is no attempt cap or manual-headroom gate in that branch.
- When it fires, it forwards to /api/generate?topup=1&slot=manual (src/lib/server/refill.ts:86-92). That route skips the top-up cap on a found day (app/api/generate/route.ts:251), and MAX_RUNS_PER_DATE is Infinity (:68). It then runs buildLockEntry, writeLock and notifyNewBets (:634-650); buildLockEntry routes to the found builder (src/lib/server/lock-card.ts:260).
- Football tap with the sync phrase: refillDesk (src/components/cfb/CfbPicksBoard.tsx:327) reaches /api/cfb/lock?manual=1, where manual gives fire:true (app/api/cfb/lock/route.ts:353-354) and foundPassDate runs (:364-366). A manual tap can also open the day's first lock (src/lib/server/football-lock.ts:895-896). The NFL route has the same shape (app/api/nfl/lock/route.ts:168-181).

Corrections to the evidence and impact:

- The comment at use-board-refresh.ts:19-25 ("slot-gated and attempt-capped … refused under one of seven reasons") is dated 2026-09-11 and describes pre-found behaviour. Those refusals do not apply to a manual tap on a found day.
- "A tap buys a full re-price and locks nothing" now happens only when there is nothing lockable (ceiling deployed, or no pregame game left), or on a held lease or generate failure. The forced re-price in that case is a documented owner instruction (use-board-refresh.ts:45-52).
- The builder refusal at :604-607 blocks a device-side lock so it cannot write a competing card. It is not evidence that a server-side "run now" is missing.

What survives, as low-severity UX points only:

1. The label 'Refresh MLB' / 'Refresh Board' does not say it also finds and locks bets.
2. Without a stored sync phrase the MLB tap is a browser-only re-price that locks nothing (use-board-refresh.ts:14-17).
3. After a fired MLB pass the note prints the decision reason, not what was locked. refillReason returns topup.reason first (src/lib/refill-client.ts:51-52), so the "card now holds N tickets" branch (:58) is never reached when a top-up decision is present. Bets with book and price are not listed in the note, though push alerts fire via notifyNewBets.
4. I found no on-screen next-scheduled-pass time. The found slots are defined server-side only (src/lib/server/grading-progress.ts:191-192), and the football pill tooltip still names the old five slots (CfbPicksBoard.tsx:344).
5. app/taken/page.tsx and app/builder/page.tsx have no refill control; useMlbBoardRefresh is used only by app/board and app/props.

Fix correction: no new route is needed, because /api/refill is already the authenticated "run the found pass now" route. The useful change is relabelling the button, surfacing the tickets locked or the exact reason none were, and showing the next slot time. Splitting off a cheaper "Refresh prices" action is the owner's call, since he asked for a full refresh on every tap.

---

<a id="appendix-b"></a>
