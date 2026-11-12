# G5 — Test-impact inventory for the two-book / any-time change

Checkout read: `/private/tmp/claude-501/pl-audit` (branch `az-two-book-anytime`), tracked files unmodified (`git ls-files -m` empty).
Method: static reading only. No test, tool, or network call was run. Line numbers are from the tracked files as read on 2026-11-12.
Ignored on purpose (in-progress, untracked): `src/lib/az/`, `src/lib/anytime/`, `src/lib/server/odds-client.ts`, `tests/az-two-book-core.test.ts`.
Baseline: 4,089 tests, 3,961 pass, 128 fail (names in the session scratchpad `base-fails.txt`).

Pin-kind legend used in every table:
- **URL** — the test asserts an Odds API URL string (either from a URL builder, or as seen by a mocked global `fetch`).
- **CONST** — the test asserts the value of an exported constant / config object.
- **FIXTURE** — the test's own data (inline or under `tests/fixtures/`) contains books other than DK/FD, or depends on book counts/weights.
- **GREP** — the test reads a source file as text (`readFileSync`, usually via `tests/helpers/source.ts` `stripComments`) and regex-matches it.

Confidence note: every line below was either read in the test file or taken from a repo-wide grep whose hit I then looked at in context. Where I only saw the grep hit and not the surrounding test body I say "grep hit".

---

## 1. Tests that PIN behaviour the change breaks

### Group (1) — `bookmakers=draftkings,fanduel` replaces `regions=us` / `regions=us,eu`

Key distinction for this group: a test that calls a **URL builder** keeps passing if the swap is done in a fetch wrapper (builders still emit `regions=`). A test that inspects what the **mocked global `fetch`** received breaks the moment the wrapper rewrites the URL or the `init` object.

| Test file:line | Quote (short) | Kind | Breaks when |
|---|---|---|---|
| tests/mlb-live-props-route.test.ts:434-440 | `expect(first).toBe(mlbLiveEventUrl(E1, KEY))`; `toContain("regions=us")` | URL (global fetch mock) | wrapper rewrites the URL |
| tests/nfl-props-route.test.ts:167 | `expect(NFL_PROPS.regions).toBe("us")` | CONST | `regions` field removed/renamed |
| tests/nfl-props-route.test.ts:252-254 | regex on fetchMock URL `…&regions=us&markets=player_anytime_td,…` | URL (global fetch mock) | wrapper rewrites the URL |
| tests/nfl-props-route.test.ts:256 | `expect(init).toEqual({ next: { revalidate: NFL_PROPS.revalidateSec } })` | URL/init (global fetch mock) | wrapper adds headers/options to `init` |
| tests/nfl-props-route.test.ts:259 | `urlsFetched toContain …&regions=us&markets=${CFB_PROPS_ODDS_MARKETS}&oddsFormat=american` | URL (global fetch mock) | wrapper rewrites the URL |
| tests/nfl-props-route.test.ts:445-446 | GREP `/cfg\.props\.regions/`; `refresh ? slate.games.length : cfg.props.maxEvents, … cfg.props.liveMaxEvents` | GREP (football-props.ts) | route stops reading `cfg.props.regions` / `maxEvents` |
| tests/cfb-props-route.test.ts:283-284 | regex `…ncaaf/events/[^/]+/odds?apiKey=test-key-never-logged&regions=us&markets=player_anytime_td`; `init` toEqual | URL/init (global fetch mock) | wrapper rewrites URL or init |
| tests/cfb-props-route.test.ts:1113 | full `regions=us` URL | URL (global fetch mock) | wrapper rewrites the URL |
| tests/mlb-live-rules.test.ts:80-112 | whole-object `expect(MLB_LIVE_PROPS).toEqual({… regions: "us" (:94), minBooks: 2, settleBook: "draftkings" (:96), dailyBudget: 600 (:97) …})` | CONST (whole object) | ANY field added/removed/changed on `MLB_LIVE_PROPS` |
| tests/mlb-live-rules.test.ts:255 | `expect(url).toContain("regions=us")` | URL (builder) | builder itself changes |
| tests/mlb-live-rules.test.ts:267-271 | `shapeAllowed(url)` true; planted `regions=us,eu` false | URL + proxy shape | `shapeAllowed` re-keyed on `bookmakers` |
| tests/cfb-props.test.ts:60-72 | whole-object `expect(CFB_PROPS).toEqual({ maxEvents: 60, … regions: "us" (:68), minBooks: 2 (:69), settleBook: "draftkings" (:70), dailyBudget: Infinity (:71), measuredCreditsPerEvent: 31 … })` | CONST (whole object) | ANY field added/removed/changed on `CFB_PROPS` |
| tests/cfb-props.test.ts:567 | GREP `apiKey=\$\{` | GREP | key handling moves into the wrapper |
| tests/odds-hardening.test.ts:34-69 | `shapeAllowed` allow/deny cases keyed on `regions` | URL + proxy shape | `shapeAllowed` re-keyed |
| tests/odds-hardening.test.ts:159-165 | odds-shape.ts must match `{ markets: PROP_MARKETS, regions: "us" }` and `{ markets: SHARP_MARKETS, regions: "us,eu" }` and contain **exactly 2** `regions: "` | GREP (src/lib/server/odds-shape.ts) | any edit to the SHAPES table |
| tests/odds-hardening.test.ts:138-157, :199, :204 | route source must contain `api.the-odds-api.com` and `ODDS_API_KEY` | GREP | proxy route delegates host/key to a new client module |
| tests/mlb-market-phases.test.ts:49-51 | `browseOddsUrl("…?markets=batter_hits&regions=us")` | URL (builder) | `browseOddsUrl` changes |
| tests/cfb-route.test.ts:107-109, :164 | h2h/spreads/totals URL with `regions=us,eu` (grep hit) | URL | sharp-market URL changes |
| tests/cfb-lock-route.test.ts:874; tests/nfl-lock-route.test.ts:241 | `not.toMatch(/api\.the-odds-api\.com/)` | URL (negative) | lock routes start calling the API (any-time engine) |
| tests/nfl-config.test.ts:142; tests/nfl-props-route.test.ts:187 | `oddsEventBase` | CONST/URL | base path changes |
| tests/helpers/fixture-env.ts:95; tests/engine-v2-integration.test.ts:124 | `regions: "us,eu"` inside the SH_V2 arming object | FIXTURE (engine config) | only if legacy engine config changes — NOT broken by a fetch-layer swap |

Where `regions` is authored in source (for whoever applies the swap): src/engine2/sharpBoard.ts:10; src/lib/ufc.ts:84; src/lib/useAllStar.ts:77; src/lib/engine-client.ts:362; src/lib/nfl/rules.ts:170, :195; src/lib/cfb/rules.ts:367, :474; src/lib/server/football-props.ts:128; src/lib/mlb/live-props-rules.ts:147, :245; app/api/propsnap/route.ts:98; app/api/generate/route.ts:404; app/api/clv/route.ts:90, :108; src/lib/server/odds-shape.ts (SHAPES); legacy/index.html:941, 997, 1257, 1366.

**Group (1) count: 11 test files pin it** (mlb-live-props-route, nfl-props-route, cfb-props-route, mlb-live-rules, cfb-props, odds-hardening, mlb-market-phases, cfb-route, cfb-lock-route, nfl-lock-route, nfl-config). Of these, 3 break on a pure fetch-wrapper swap (mlb-live-props-route, nfl-props-route, cfb-props-route — they read the global fetch mock); odds-hardening breaks only if `odds-shape.ts` is edited; the rest break only if builders/constants change.

### Group (2) — market fair = mean of two no-vig numbers (was weighted median over many books)

| Test file:line | Quote (short) | Kind |
|---|---|---|
| tests/engine2-devig.test.ts:56, :59-68 | weighted median; pinnacle weight 3 | CONST + FIXTURE (inline books incl. pinnacle) |
| tests/engine-v2-integration.test.ts:38, :45, :125 | sharp-weight arming on the legacy engine | FIXTURE (legacy; unaffected if legacy untouched) |
| tests/cfb-model.test.ts:131, :191-198, :206-207, :227-263, :270-279, :300-318, :327-336, :436 | consensus medians; `h.best` toEqual `{ book: "williamhill_us", price: -6500 }`; `reduced(…, ["draftkings","pinnacle"])` at :242/:279/:336 | FIXTURE (multi-book) + CONST (`pinnacleWeight`, `minBooks`) |
| tests/cfb-card.test.ts:79-95, :412-417 | pinnacle rows at :81/:87/:94 | FIXTURE |
| tests/cfb-picks.test.ts:158-163 | consensus rows | FIXTURE |
| tests/cfb-props.test.ts:137, :155, :158-164, :184, :207, :219, :226/:237/:250/:265 | `r.best?.book` `"betmgm"` (:161, :207) | FIXTURE (betmgm as best price) |
| tests/cfb-h1.test.ts:38, :63, :144 | first-half consensus over SB / fanduel / betmgm | FIXTURE |
| tests/clv-core.test.ts:68, :79-117, :122-134, :149-169 | close consensus across books | FIXTURE |
| tests/mlb-live-props-route.test.ts:85, :468-492, :732, :744-758, :846, :869 | `minBooks` gate; fanatics-alone row dropped (:482) | FIXTURE + CONST |
| tests/football-ladders.test.ts:9, :47 | `books=['draftkings','williamhill_us','fanduel']` | FIXTURE |
| tests/nfl-engine.test.ts:99, :106, :126-142, :145, :156 | consensus + pinnacle weight on NFL | FIXTURE + CONST |
| tests/engine2-allstar.test.ts:37, :45-46, :65, :85-86, :96, :147-163 | betfair_ex_eu (:65); `parseCaesarsBoard` | FIXTURE |
| tests/dkfd-basis.test.ts:34, :81-82, :241, :270-273, :283 | `NV_BOOKS = new Set(["williamhill_us","betmgm"])` | FIXTURE |
| tests/supplemental.test.ts:277-284 | multi-book consensus | FIXTURE |
| tests/prop-board.test.ts:131, :151-162 | `books` counts on prop rows | FIXTURE |
| tests/basis-surfaces.test.ts:134 | basis vs consensus | FIXTURE |
| tests/doubleheader.test.ts:128 | consensus in a doubleheader | FIXTURE |
| tests/sportsbook.test.ts:10-64 | all-books comparison quote kept beside selected price (:16, :26, :27, :52, :54, :57, :64) | FIXTURE |
| tests/autopsy-floors.test.ts:106-142 | consensus floors on stored fixtures | FIXTURE |
| tests/books-ind-gate.test.ts:77-135 | `no_ind_consensus` block when a leg has `booksInd === 0` | FIXTURE + engine behaviour |
| tests/engine-echo.test.ts:146-152 | consensus constants echoed from legacy source | GREP (legacy) |
| tests/mirrored-constants.test.ts:111 | mirrored consensus constant | GREP (legacy vs TS) |
| tests/chain-tools.test.ts:219-224 | consensus fields in tool output | FIXTURE |

Source being replaced: src/engine2/devig.ts:67-76, :103 (`weightedMedian`, `BOOK_WEIGHT`); src/engine2/sharpBoard.ts:58 `SHARPS = new Set(["pinnacle","betfair_ex_eu","matchbook"])`; src/lib/cfb/model.ts:328, :377, :397, :415-419; src/lib/cfb/h1.ts:38-42; src/lib/cfb/props.ts:211, :267; src/lib/cfb/rules.ts:75-76, :475; src/lib/nfl/rules.ts:66-67, :196; src/lib/server/mlb-live-quote.ts:188, :257; src/lib/mlb/live-props-rules.ts:149; legacy/index.html:1557-1558 (`SH_BOOKW`, `shBookW`).

**Group (2) count: 23 test files.** All but two are FIXTURE pins (their data contains pinnacle / betmgm / Caesars / betfair / fanatics). They do not fail because the fetch layer changes; they fail when the consensus function is replaced by a two-book mean, because the expected numbers were computed with a weighted median over 3+ books.

### Group (3) — bet price = better of DK/FD (was `SETTLE_BOOK = 'draftkings'`)

| Test file:line | Quote (short) | Kind |
|---|---|---|
| tests/nfl-props-route.test.ts:168 | `expect(NFL_PROPS.settleBook).toBe("draftkings")` | CONST |
| tests/mlb-live-props-route.test.ts:752 | settle book on the live quote | CONST |
| tests/cfb-separation.test.ts:39 | `/settleBook:\s*"draftkings"/` | GREP |
| tests/games-sheet-hold.test.tsx:380 | `expect(DEFAULT_BOOK).toBe("draftkings")` | CONST |
| tests/hr-line-rule.test.ts:7, :25 | settle-book price on HR rows | CONST/FIXTURE |
| tests/mlb-market-phases.test.ts:10, :58, :78, :94 | settle-book quote per phase | CONST/FIXTURE |
| tests/board-live-anchor.test.ts:142 | settle book in the live overlay | CONST (file is already 23 red) |
| tests/mlb-live-rules.test.ts:96; tests/cfb-props.test.ts:70 | `settleBook: "draftkings"` inside whole-object pins | CONST |
| tests/sportsbook.test.ts:25-35, :51, :57 | `attachBookQuotes(data,[event],'williamhill_us')`; "never claims a best-price fallback belongs to the selected book" (`priceMlbProp(row,'draftkings').cz` toEqual `{o:120,u:null}`); `priceMlbRow(r,'fanduel').czOdds` null | FIXTURE + behaviour — this is the direct opposite of "better of DK/FD" |
| tests/parity.test.ts:77-81 | rows with `cz != null` must carry `czOdds` / `czEv` | engine output shape |
| 15 importers of tests/helpers/settle-book.ts `swapSettleBook` | straight-only, cfb-lock-route, parlay-gen-multi, games-sheet-hold.test.tsx, cfb-card, cfb-h1, nfl-engine, cfb-picks, mlb-live-props-route, found-football, cfb-model, nfl-lock-route, football-gen, cfb-props, gen-moved-note | FIXTURE transform: the fixtures predate INSTRUCTION 67, so the helper exchanges `williamhill_us` and `draftkings` keys on load |

**Group (3) count: 11 files with direct pins + 15 `swapSettleBook` importers (22 distinct files).** A single-key settle book is assumed everywhere; "best of two" changes the type of the answer (a price plus which book), not just a value.

### Group (4) — Caesars / "CZ" fallbacks and the book selector removed

| Test file:line | Quote (short) | Kind |
|---|---|---|
| tests/props-model.test.ts:72, :80-91 | `cz` quote on prop rows | FIXTURE |
| tests/prop-lean.test.ts:57, :95-110, :157 | `footballPropLean(…, "cz")`; GREP `footballLeanIndex\(propRows, "cz"\)` | FIXTURE + GREP |
| tests/board-settled.test.ts:316-322 | GREP `if \(!live\) return <OddsCell odds=\{row\.czOdds as never\} book="caesars" \/>;` (:318) | GREP (app/board/page.tsx) |
| tests/board-scope.test.ts:39-43 | GREP `if \(r\.cz\?\.o == null\) \{\s*noCz\+\+;\s*continue;\s*\}`, `return \[out, noCz\];`, "the selected book posts on today&apos;s board", "only other books post hidden" | GREP (app/board/page.tsx) |
| tests/cfb-props-ui.test.ts:68-83, :159-163, :175-179 | GREP `if \(mode === "cz"\) return row\.cz;\s*return row\.best \?\? row\.cz;` (:75); `capped at ${CFB_PROPS.maxEvents}` | GREP (CfbProps) |
| tests/cfb-picks-ui.test.ts:74-89, :134-135, :402 | "the Caesars grammar" | GREP (CfbPicksBoard) |
| tests/cfb-card-ui.test.ts:9, :42 | Caesars price cell | GREP |
| tests/cz-sync.test.ts:15 | cz-offered sync store | CONST/behaviour |
| tests/picks-surface.test.ts:73-74 | cz columns | GREP |
| tests/parlay-gen-ui.test.ts:168, :361, :414 | GREP `generate\(pool, \{ \.\.\.spec, pricingBook \}, specSeed\(`; `czOnly: true, pricingBook: "CZ"` | GREP + FIXTURE |
| tests/parlay-gen.test.ts:66-67, :361, :368-370, :503-513 | `czOnly: false, pricingBook: "CZ"` (fixture `gen-pool.json` is Caesars-priced); `relax: "cz"` | FIXTURE (tests/fixtures/gen-pool.json) |
| tests/cfb-props-route.test.ts:193-195, :927-1297 | THE CAESARS-MISSING RULE (`czMissingRevalidateSec`, `czMissingWindowSec`) — ~370 lines | CONST + behaviour |
| tests/cfb-props.test.ts:56-58, :440-495 | `czMissingRevalidateSec` / `czMissingWindowSec` | CONST |
| tests/nfl-props-route.test.ts:178-182, :205, :221 | same rule on NFL | CONST |
| tests/cfb-lock-route.test.ts:130, :517-599, :1089-1205, :1341-1343, :2664 | cz-priced tickets through the lock rail | FIXTURE |
| tests/scheduler-route.test.ts:834 | cz re-check poke | behaviour |
| tests/board-overview-toggle.test.ts:28 | "…vs the Caesars line…" — this is the test's OWN fixture string, not a source pin (see section 5) | none (test data) |
| tests/games.test.ts:152 | Caesars price on game cards | GREP |
| tests/grade.test.ts:55-56 | GREP `gradeFromEv\(.*\bczEv\b` and `\bbsEv\b` | GREP |
| tests/board-selmode.test.ts:29-69 | `ev_gated`/`caesars_ev` rank by `czEv`; `dk_fd` by `bsEv` | behaviour |
| tests/m25-archive.test.ts:70 | modes `["probability","caesars_ev","ev_gated"]` | CONST |
| tests/paper-epoch.test.ts:143-152 | `not.toMatch(/selMode:\s*"caesars_ev"/)` | GREP |
| tests/chain-tools.test.ts:101-126 | `client/caesars_ev` census | FIXTURE |
| tests/books-ind-gate.test.ts:134 | `{ selMode: "caesars_ev" }` | behaviour |
| tests/first-sunday-six-ui.test.tsx:28, :40 | Caesars wording | render |
| tests/sizing-discipline.test.ts:117, :220-228; tests/fun-ladder.test.ts:81; tests/ticket-payout.test.ts:12-17 | `czDec` / `czOdds` on tickets | FIXTURE |
| tests/cfb-model.test.ts:157-212, :406, :445; tests/football-gen.test.ts:186-218, :312, :471, :516, :549 | `cz` quote, `propQuote(row, "cz")`, `poolFor(s, "cz")` | FIXTURE + CONST (`FootballPriceMode`) |

Type-only breakage (vitest still runs these through esbuild, but `tsc --noEmit` / `next build` fail): `czOnly` appears in a `GenSpec` literal in tests/football-ladders.test.ts:64, parlay-gen-ui:75, parlay-gen-mix:14, discovery-release:20, parlay-gen-reorder:49, parlay-gen-team:50 and :159, parlay-gen-multi:34, parlay-exclusions:7, pick-positions:182, mlb-market-phases:17, football-gen:81, builder-speed-reveal:68, gen-hold-drag:49 and :407, gen-moved-note:55 and :97, parlay-gen-setup:5, live-production-proof:9 (17 files, 23 hits).

Source facts: src/lib/sportsbook/books.ts lists 7 books (williamhill_us/CZ, draftkings, fanduel, betmgm, betrivers, fanatics, pinnacle); `bookKey()` maps cz/czr/caesars/williamhillus to `williamhill_us`. `CFB_PROPS.czMissingRevalidateSec = 1800`, `czMissingWindowSec = 4*3600`.

**Group (4) count: 30 test files with value/grep pins, plus 17 files with a `czOnly` GenSpec literal** (some overlap; about 42 distinct files).

### Group (5) — parlays priced at one book

| Test file:line | Quote (short) | Kind |
|---|---|---|
| tests/sportsbook.test.ts:21-26 | "unoffered tickets have no combined selected-book odds": `priceMlbBoard(data,'betmgm')` gives `parlays[0].czDec` / `czEv` null | behaviour — already encodes one-book parlay pricing, but for an arbitrary selected book incl. betmgm |
| tests/football-gen.test.ts:191-236 and `poolFor(s, "cz")` at :209–:679 | `for (const mode of ["cz", "best"] as FootballPriceMode[])` (:226, :236) | CONST (`FootballPriceMode`) + FIXTURE — `"best"` mode lets each leg take a different book, which is exactly what (5) forbids |
| tests/gen-moved-note.test.ts:60, :66 | `mode: "cz"`; `pricingBook: "DK"` | FIXTURE |
| tests/gen-hold-drag.test.ts:130, :137 | `pricingBook` inside the request key / deps | GREP |
| tests/parlay-gen.test.ts:513 | `czOnly: true` pool | FIXTURE |
| tests/cfb-picks.test.ts:222 | "dec = Π Caesars decimals" | FIXTURE |
| tests/cfb-card.test.ts:217-218 | `czEv = 100*(p*dec−1)`, `czOdds` from dec | FIXTURE |
| tests/dkfd-basis.test.ts:99-135, :172 | "dk_fd parlay building only prices the basis universe" — basis is the BETTER of DK/FD per leg (`bs`, `bsBook`) | legacy engine behaviour |
| tests/lock-card.test.ts:181, :678-698 | ticket `czDec` vs `bsDec` | FIXTURE |
| tests/variety-core.test.ts:100-132 | `bs`, `bsBook: "FD"`, czEv −8.1 | FIXTURE |
| tests/shrink.test.ts:21-80 | `czDec` / `bsDec` per ticket | FIXTURE |

**Group (5) count: 11 test files.** Two notes: (a) the legacy engine's `dk_fd` mode ranks tickets on a per-leg best-of-DK/FD basis (`bsDec`) while paying at the single `CAESARS_KEY` book (`czDec`); nothing in the tests asserts "every leg of a ticket is quoted by the same one of DK/FD", so (5) has no existing guard — it needs a new test. (b) football `FootballPriceMode = "cz" | "best"` is pinned by football-gen; removing `"cz"` or redefining `"best"` re-pins ~40 call sites in that one file.

### Group (6) — pick windows / slots / daily caps replaced by an any-time engine

| Test file:line | Quote (short) | Kind |
|---|---|---|
| tests/live-ticker.test.ts:88, :91-92, :99 | `[...REFILL_SLOTS_PT]` toEqual `["08:00","09:30","12:00","15:00","16:45"]`; `MLB_LIVE_PROPS.slots` toBe `REFILL_SLOTS_PT` (same object) | CONST |
| tests/live-ticker.test.ts:46-47, :111-140, :160 | six-slot live ticker; `MLB_LIVE_PROPS.dailyBudget` toBe(Infinity) | CONST |
| tests/mlb-live-tick.test.ts:38-39, :49-50, :64-65 | same array-identity + values | CONST |
| tests/daily-grading.test.ts:78, :104, :137-142 | `GRADE_SLOTS_PT` values; `REFILL_SLOTS_PT` toBe `GRADE_SLOTS_PT`; `TOPUP_MAX` toBe `REFILL_SLOTS_PT.length + 1` | CONST |
| tests/mlb-live-rules.test.ts:115, :135-136, :149-169, :204-206, :234-235, :350-358 | slots identity; budgets 600 / 2500 / 1000 (set with `Object.assign` in beforeEach) | CONST |
| tests/refill-helper.test.ts:2, :22 | `decideSlotTick`, `slotsAheadPT`, `unstampedSlotsAhead`, `manualHeadroomRefusal` over every slot | CONST + behaviour |
| tests/found-winnings.test.ts:191-195, :206 | `FOUND_MLB_SLOTS_PT` toEqual 11 hourly slots; `FOUND_FOOTBALL_SLOTS_PT.length` 44, first "08:00", last "18:45" | CONST |
| tests/found-mode.test.ts:32, :36, :37, :180-248 | `FOUND_SINCE` "2026-10-03"; `FOUND_MAX_STAKE` 800; `FOUND_POLICY` "found-v1"; lease `redis(["SET", foundLeaseKey(date), token, "NX", "PX", String(FOUND_LEASE_PX)])`, `FOUND_LEASE_PX = 300_000` | CONST + GREP |
| tests/straight-only.test.ts:33, :45, :134 | `STRAIGHT_SINCE` "2026-10-06"; `FOUND.daily` 2500 | CONST |
| tests/outs-off.test.ts:39 | `OUTS_OFF_SINCE` "2026-10-06" | CONST |
| tests/football-ev1.test.ts:28-30; tests/found-football.test.ts:190-196 | `EV1_SINCE`, `foundFootballMinEv`; stake between `FOUND.minStake` and `FOUND_MAX_STAKE` | CONST |
| tests/cfb-lock-route.test.ts:166, :2000, :3863; tests/scheduler-route.test.ts:284, :457 | behaviour inside / outside a `REFILL_SLOTS_PT` window | behaviour (slot-gated) |
| tests/live-board-only.test.ts:136-142 | GREP `if \(boardOnly && !manualReprice && runsUsed >= MAX_RUNS_PER_DATE\) \{`; `const MAX_RUNS_PER_DATE = Number\.POSITIVE_INFINITY;` | GREP (app/api/generate/route.ts) |
| tests/board-refresh-full.test.ts:339-342 | same two greps | GREP |
| tests/block-locking.test.ts:168 | `MAX_RUNS_PER_DATE = Number\.POSITIVE_INFINITY` | GREP |
| tests/paper-deficit.test.ts:495 | `MAX_RUNS_PER_DATE \+ \(topup \? TOPUP_MAX : 0\)` | GREP |
| tests/odds-credit-unlimited.test.ts:10, :14 | `for (const c of [CFB_PROPS,NFL_PROPS,MLB_LIVE_PROPS,MLB_LIVE_CLIENT]) expect(c.dailyBudget).toBe(Infinity)` | CONST |
| tests/nfl-props-route.test.ts:161-176, :190-194, :209, :302, :345, :383, :462-471 | `dailyBudget`, `maxEvents` 16; `Object.assign` to 2500/1000 then restore to Infinity | CONST (mutated live) |
| tests/cfb-props-route.test.ts:185-219, :278, :446, :512, :699-706, :765-802, :1297, :1337, :1349-1355 | `maxEvents` 60, `dailyBudget`; GREP `cfg\.props\.dailyBudget` | CONST + GREP |
| tests/live-reserve.test.ts:47-114, :149-257 | reserve 372 CFB / 248 NFL; `const CFB_PROPS = {...CURRENT_CFB_PROPS,dailyBudget:2500}` (:256-257) | CONST |
| tests/cfb-props-ui.test.ts:175-178 | `capped at ${CFB_PROPS.maxEvents}` | GREP |
| tests/mlb-live-props-route.test.ts:521, :547, :558, :572-573, :600, :986-991 | budget refusals at 600 | CONST (mutated live) |
| tests/board-live-anchor.test.ts:475, :483, :487 | `MLB_LIVE_CLIENT.dailyBudget` Infinity; GREP `dailyBudget: Number\.POSITIVE_INFINITY` | CONST + GREP |
| tests/football-props-duration.test.ts:27-32 | `Math.ceil((props.maxEvents + props.liveMaxEvents) / conc) * 10 ≤ 300` | CONST arithmetic |
| tests/arming-parity.test.ts:111-113, :154-155 | `CRON_SEL_MODE\s*=\s*"dk_fd"`; `cfg\.selMode\s*=\s*CRON_SEL_MODE` | GREP (generate route) |
| tests/helpers/modes.ts:40-41 | throws "CRON_SEL_MODE vanished from the generate route — re-point this extraction" | GREP helper (feeds hrr-suspension-coupling) |
| tests/lock-card.test.ts:202, :499, :541-558; variety-core:149; fun-ladder:119; autopsy-floors:62-70, :170, :222, :294; basis-surfaces:34, :155, :176; dkfd-basis:93, :218; clv-report:102-109; discipline:30 | `selMode: "dk_fd"` wiring | CONST/FIXTURE |
| tests/paper-epoch.test.ts:52, :62-63 | `PAPER` toEqual `{ since: "2026-08-15", daily: 350, dailyBefore: 150, dailySince: "2026-09-18", fun: 25, bankroll: 10000 }` | CONST (whole object) |
| tests/nfl-money-ui.test.ts:118; cfb-lock-route:219-220, :234-235; nfl-store:293; variety-core:27-28 | NFL `{ since: "2026-09-10", daily: 350, fun: 25 }`; `CFB_PAPER.daily` 250, fun 25 | CONST |
| `pl:` key pins — nfl-props-route:170, :345; mlb-live-props-route:788-790; mlb-live-rules:210; nfl-routes:182-183; nfl-lock-route:245-247; cfb-lock-route:130; nfl-store:121-125, :188; cfb-store:123-124; cfb-props-route:446, :512 | exact Redis key strings | CONST |

**Group (6) count: about 41 test files** — the largest group. No test enumerates the full set of `pl:` keys, so ADDING new keys is safe; the separation tests (section 2) only object to a desk tree naming another desk's keys.

Important mechanic (verified): the per-desk budget numbers 2500 / 1000 / 600 that many tests assert do not exist in source any more (source is `Number.POSITIVE_INFINITY`). The tests write them back onto the live exported config objects with `Object.assign` in `beforeEach` and restore Infinity in `afterEach` (cfb-props-route:1349-1355, nfl-props-route:462-471, mlb-live-rules:350-358, mlb-live-props-route:986-991). Deleting the `dailyBudget` field from the configs therefore breaks four files' setup blocks plus odds-credit-unlimited, and silently turns the budget-refusal tests into tests of dead code if the field is kept but no longer read.

---

## 2. Guard tests that must keep passing

Columns: effect of (a) a new source file, (b) a new route under `app/api/`, (c) a new workflow under `.github/workflows/`, (d) a new ROOT doc (AUDIT.md, RESULTS.md), (e) a new `docs/*.md`, (f) a CLAUDE.md edit.

| Guard test | What it protects | (a) file | (b) route | (c) workflow | (d) root doc | (e) docs/ doc | (f) CLAUDE.md |
|---|---|---|---|---|---|---|---|
| tests/hrr-suspension-coupling.test.ts (100 lines) | HRR suspension stays coupled to every selection mode the app can actually reach; uses `armedFixtureEngine` + `helpers/modes.ts` | none | red if the generate route loses `CRON_SEL_MODE = "<mode>"`, the `SelectionMode` union loses legacy modes or has <2 disciplined modes, `getSelectionMode` default shape changes, or builder text `shSetOverride")(true)` changes | none | none | none | none |
| tests/doc-structure.test.ts (208) | docs + CLAUDE.md cross-reference integrity: every `M<n>`/`A<n>` id has a row in docs/freeze-exit-bundle.md; `rule N` ≤ highest numbered rule in CLAUDE.md; dated open items carry date + trigger; no doc has two numbered headings with the same label | none | none | none | **not scanned** | red on an unknown `M12`/`A3`-style token, `rule 99`, or duplicate `## 3.`-style headings | same checks apply |
| tests/m2-interlock.test.ts (60) | legacy `of=shClamp(<k>/oo,` must stay 0.140 unless `offense(lineup)` gains `xslg|shShrink|SH_PRIORS` (pitcher-outs defect interlock) | none | none | none | none | none | none — only legacy/index.html |
| tests/retraction-markers.test.ts (96) | five fixed docs (collection-period, freeze-exit-bundle, harness-substitutions, hrr-recalibration, pitcher-outs-audit): a retraction marker needs a date nearby | none | none | none | none | new docs not scanned; edits to those five are | none |
| tests/workflow-timing.test.ts (195) | every SCHEDULED workflow carries `# TIMING: SENSITIVE|INSENSITIVE — reason`; sensitive ones name a real guard symbol; **exact lists**: sensitive `["board-archive.yml","context.yml","props-history.yml"]`, insensitive `["hr-overround.yml"]`; every workflow on `origin/main` must still exist | none | none | **RED for any new scheduled workflow** (exact-list pin), even if correctly classified; a manual-only (`workflow_dispatch`) workflow passes; deleting one that exists on origin/main is red | none | none | none |
| tests/factor-classification.test.ts (161) | legacy identity-fallback factor functions each classified in REGISTRY and mirrored in tools/factor_activity.py | none | none | none | none | none | none — only if legacy gains a factor |
| tests/calibration-window.test.ts (226) | source pins on app/api/calibrate/route.ts (`SUMMARY_DAYS = 45`, rev stamping, window fields) and a scan of calibrate / predictions / **generate** routes: any line with `"DEL"|"SREM"|"EXPIRE"` must also match `BOARD_|runsKey|manualKey` | none | none for NEW routes; **red if the any-time engine edits app/api/generate/route.ts to delete/expire a non-board key, or adds an unstamped `redisSetJson`** | none | none | docs/collection-period.md SYNCED-WINDOW row is derived from the constant | none |
| tests/sweep-covers-engine.test.ts (54) | legacy `SH_PROP_MARKETS`/`SH_PROP_ALT` vs tools/snapshot_props.py `MARKETS`; written as `it.fails` (open defect M13) | none | none | none | none | none | none. Note: it goes RED if someone "fixes" the mismatch without flipping `it.fails` |
| tests/vercel-cron-pokes.test.ts (74) | vercel.json: every cron path starts `/api/scheduler`, unique, `crons.length ≤ 2`, git deploys off for `main` and `line-history` | none | none directly | none | none | none | none. **Already red ×2** (4 crons, two are `/api/nfl/lock`). Any extra any-time cron keeps it red; removing the two NFL crons would turn it green |
| tests/sha-currency.test.ts (167) | docs/session-handoff.md `STATE-CLAIM` lines cite shas within 10 commits of a ref tip; `50d0f7a` must remain | none | none | none | none | only session-handoff.md | none. **Already red ×1** |
| tests/sha-references.test.ts (126) | every 7–10-char hex token in CLAUDE.md + docs/*.md is all digits, allow-listed, or reachable from an origin ref | none | none | none | **not scanned** | red (more failures) for unpushed-branch shas or hex-looking words | same. **Already red ×1** |
| tests/parity.test.ts (84) — the engine parity test | `fixtureEngine()` over stored fixtures (fix39/fix40), frozen clock 2026-07-10T03:30Z. Test 1: singles off, `JSON.stringify(digest(d))` equals `tests/fixtures/baseline43.json`. Test 2: shipped config equals `baseline44-singles.json`. Test 3: cz rows carry `czOdds`/`czEv`, `gameInfo` non-empty | none | none | none | none | none | none — only legacy/index.html, src/engine/, or the fixtures move it |

`digest()` (tests/helpers/fixture-env.ts) covers: every row of `categories` and `categoriesLive` as `[label, sub, String(odds), prob, ev]`, and every ticket of `parlays` / `parlaysMixed` / `parlaysLive` as `{ n: name, o: odds, p: prob, legs: "label|prop|odds" }`. It does NOT cover: book counts, `booksInd`, `cz`/`bs` quotes, stakes, Kelly, blocked reasons, or the prop board. The wider `armedDigest` (tests/armed-baseline.test.ts, 146 lines, vs `baseline-armed-v2-singles.json`, prop-board md5 `135f586f441efe59b35a54f31488e571`) covers implied, edge, cz, czEv, bs, bsEv, kellyF, tags, ticket czOdds/czEv/bsEv/consEv, the card pool, allocation at $250 daily / $5 fun, and blocked reasons.

### Other enumerating guards found while reading (not in the caller's list, but they bite on additions)

| Guard test | Goes red when |
|---|---|
| tests/workflow-branch-sync.test.ts | **ANY** workflow yml is added, edited or deleted relative to `origin/main` (byte-identical check; `ALLOWED_DIVERGENCE = {}` is empty; waivers need a dated entry and expire after 14 days). Currently green, so the tree is in sync today |
| tests/read-first-index.test.ts | a new `docs/*.md` is not named inside the "READ-FIRST INDEX" block of docs/session-handoff.md with a ≥15-char description. Editing session-handoff.md then exposes the edit to sha-currency, sha-references, doc-structure, fixture-citation and retracted-claims |
| tests/fixture-citation.test.ts | any docs/*.md line contains "8 of 18", "16 of 173", "15.1 pp" or "25 of 30" without a provenance word (`fixture`, `fix45`, `baseline-armed`, `synthetic`, `production measurement`, `test data`) within ±3 lines |
| tests/retracted-claims.test.ts | any docs/*.md repeats one of four retracted claims (e.g. "6-per-event model") without a retraction marker within ±4 lines |
| tests/server-date-basis.test.ts | a new top-level `app/api/<dir>/route.ts` derives a date with `new Date(…).toISOString().slice(0,10)` or `shToday")()`, uses `ptToday` without importing `@/lib/server/pt-date`, or contains a second copy of `timeZone: "America/Los_Angeles"` (exactly one allowed across those routes + pt-date.ts) |
| tests/nav-flat.test.ts | walks every `.ts/.tsx` under `app/` and `src/` — **including untracked in-progress files** — and goes red on an internal `<Link>` without `replace`, on any `router.push(`, or on backdrop blur in the listed glass classes/components |
| tests/nfl-separation.test.ts, tests/cfb-separation.test.ts | a file placed under src/lib/nfl, src/components/nfl, app/api/nfl, app/nfl (or the CFB equivalents) names the other desk's keys/routes (`pl:cfb`, `"/api/cfb`, `pl:nfl`, …) or MLB's (`pl:ledger:v1`, `pl:bank:v1`, `baseball_mlb`). Shared any-time code must live outside the desk trees |
| tests/strict-coercion.test.ts | a raw `Number(` is added to tools quota.mjs, burn-report.mjs, ledger-report.mjs, board-report.mjs, price-path.mjs or verify-served-engine.mjs (ratchet at 6) |
| tests/nav.test.ts | nav tab lists are enumerated (desktop rail, mobile bar, "all 11 nav pages"). **Already red ×7**; adding a tab adds to the drift |
| tests/guard-wiring.test.ts | not an enumerator but a hazard: during the suite it corrupts and restores real files in place (data/ump_k.json, docs/session-handoff.md twice, docs/freeze-exit-bundle.md, docs/progress.md), writes `.guard-wiring-*.tmp` / `.tool-wiring-*.tmp.json` at repo root, and spawns nested `npx vitest run`. It depends on the `| \`clv.md\` |` row existing in session-handoff.md. Do not edit those docs while the suite runs; a killed run can leave them corrupted |
| tests/calc-ui.test.ts:46, tests/nfl-pages.test.ts:112 | directory listings of the calc dir / NFL pages dir (files must not match `cfb=1`) |

Summary answers for section 2:
- **New source file**: safe everywhere except the tree-walkers — nav-flat (Link/replace, router.push), nfl/cfb-separation (if placed in a desk tree), strict-coercion (the six named tools).
- **New route under app/api/**: watched only by server-date-basis (top-level dirs) and, if under app/api/nfl or app/api/cfb, the separation tests. No test enumerates the route list itself.
- **New workflow**: red in workflow-branch-sync (always) and workflow-timing (if scheduled). This is the single hardest "addition" in the repo.
- **New root doc (AUDIT.md, RESULTS.md)**: scanned by none of the guards. Safe. (AUDIT.md already exists untracked at the repo root.)
- **New docs/ doc**: red in read-first-index until indexed; then subject to doc-structure, sha-references, fixture-citation, retracted-claims.
- **CLAUDE.md edit**: subject to doc-structure (ids, rule numbers, dated open items) and sha-references (hex tokens). Not subject to read-first-index.

---

## 3. Do the legacy parity test and tools/verify-served-engine.mjs survive a FETCH-LAYER-ONLY change?

**Yes to both, provided legacy/index.html and src/engine/ are untouched.**

- tests/parity.test.ts and tests/armed-baseline.test.ts build the engine with `createEngine({ fetchJson: fixtureFetchJson, today })`. The engine never touches the app's server or browser fetch layer in these tests; `fixtureFetchJson` routes by URL substring (`/events/<hex>/odds` to `fix39/props_<id>.json`, `/events?` to `fix39/events.json`, `the-odds-api` + `markets=h2h` to `fix39/odds.json`) and returns the STORED multi-book fixtures. They also omit `settlementBook`, so they run the legacy Caesars key. A wrapper that rewrites `regions=` into `bookmakers=` sits outside this path entirely.
- tools/verify-served-engine.mjs compares the engine STRING inside a served JS chunk against `src/engine/legacy-src.gen.ts` (sha256 + length; exit 0 match, 1 mismatch, 2 extraction defect). It has nothing to do with fetch shapes.

Stored fixtures vs live shapes — what the green result does NOT tell you:
1. The fixtures contain many books. Production responses will contain two. The legacy engine counts "independent" books as those that are not the settlement book (legacy/index.html:1293-1296, :1318, :1433), so with DK settling, `booksInd` is at most 1 (FanDuel), and 0 on any line FanDuel does not post. Line :3063-3065 blocks any ticket with a `booksInd === 0` leg with reason `no_ind_consensus`. That is a production behaviour change with zero source diff and zero parity coverage.
2. The sharp weights `SH_BOOKW = {pinnacle:3, betfair_ex_eu:2, matchbook:2, betonlineag:1.5}` (legacy :1557) become inert because none of those books arrive. The engine's fair value silently becomes an unweighted two-book figure through the OLD median code, not the planned "mean of two no-vigs" — the mean must be implemented outside the legacy engine or the engine must change (which breaks parity by design).
3. The legacy engine prices at a single key (`CAESARS_KEY`, rebound to `SETTLE_BOOK` by src/engine/index.ts:296-300). "Better of DK/FD" cannot be expressed inside the untouched engine; it has to live after the engine (`attachBookQuotes(…, SETTLE_BOOK)` in app/api/generate/route.ts:446) or in the new any-time code.
4. tools/quota.mjs calls `…/v4/sports/` with no `markets` parameter. A fetch-layer rule that appends `bookmakers=` to every Odds API URL must skip that endpoint (and the `/events?` list endpoint), or it will add a useless parameter to free calls.

So: parity stays green, but green means "the engine source did not change", not "the engine behaves the same on two-book input". A new fixture-based test with a DK+FD-only response is needed to cover that.

---

## 4. The nine tools — what they do and when to run them

| Tool | What it does | When to run | Reads / writes / network |
|---|---|---|---|
| tools/guard-diff-audit.mjs (64 lines) | `node tools/guard-diff-audit.mjs [--since 2026-07-24]`. Walks `git log --numstat` and lists every commit that DELETES lines from `tests/*.test.ts`, counting removed `expect(` / `it(` / `it.fails(` / `describe(` lines and flagging net-negative commits | After the change's commits exist, before sign-off: it gives the reviewer the exact list of weakened or deleted assertions. It narrows review; it is not a pass/fail gate | read-only git |
| tools/strict.mjs (47) | Library, not a CLI. `num(v)` (finite number or null), `req(v, what)` (throws "absent is not zero"), `numFromText(v)` | Never run directly. Import it in any new report tool instead of raw `Number(` (tests/strict-coercion ratchets this) | none |
| tools/verify-served-engine.mjs (106) | `node tools/verify-served-engine.mjs [--chunk /tmp/chunk.js] [--url <app-url>]`. Extracts the engine string from a served JS chunk and compares it to the repo's `legacy-src.gen.ts` | After every deploy, to prove the deployed engine equals the committed one. Unaffected by this change unless legacy changes | reads a downloaded chunk (`--url` needs network) |
| tools/outs_audit.py (179) | `python3 tools/outs_audit.py b-<date>.json` on a saved `/api/board?date=` blob. Audits pitcher_outs: recovers model means from the prop board (`fO` market fair, `pO` blended at 0.350) and compares the as-built 0.140 constant with the correct 0.400 | When touching pitcher outs, or to re-measure after the fair-value change. Caveat: `fO` is the market fair — under a two-book mean its meaning changes, so pre- and post-change boards are not comparable | read-only on a saved file |
| tools/hrr_pa_audit.py (86) | `python3 tools/hrr_pa_audit.py b-<date>.json`. Recovers the plate-appearance clamp from each H+R+RBI row's `case` string; uses `pModel` and `implied` | Same occasions as above for H+R+RBI. `implied` also shifts under the new fair | read-only on a saved file |
| tools/ladder_drift.py (66) | Poisson-implied lambda drift across consecutive ladder rungs; prints UNDER-DISPERSED when the ratio is below 0.5 | Diagnostic only. **Takes no argument: the input path is hardcoded to another session's scratchpad file** (`…/43a0f1e0-…/scratchpad/b-2026-07-26.json`), so it fails on any other machine/session until edited | read-only |
| tools/extract-engine.mjs (28) | Regenerates `src/engine/legacy-src.gen.ts` from the largest `<script>` in legacy/index.html (refuses if under 100,000 bytes) | ONLY after an intentional edit to legacy/index.html. Not needed for a fetch-layer change. Forgetting it after a legacy edit breaks served-extractor / engine-echo / stripper tests | **writes into the repo** |
| tools/ledger-report.mjs (276) | `node tools/ledger-report.mjs ~/pl-ledger-<date>.json` on a saved `/api/ledger` export. Placement census, realized over-stake check (`kellyFrac(prob, czDec)`), $0-ceiling census, HRR reproduction over 2026-07-17..22, field-presence census; exits non-zero on a bad shape | Before and after the change, on a fresh export, to confirm the ledger still parses. Caveat: it reads `czDec` per ticket; if tickets are priced at the better of DK/FD the field's meaning (or name) changes and the report needs the same update | read-only on a saved file |
| tools/quota.mjs (133) | `node tools/quota.mjs [--series|--no-append]`. Reads Odds API quota headers through the live app proxy (free call), appends a line to `data/quota-log.jsonl`, and names pool resets | Before the first two-book deploy and after it, to measure the real credit cost of `bookmakers=` requests (the 31-credits/event figure was measured under `regions=us`) | **network + appends to a tracked file** |

---

## 5. Standing-red tests (128) that look red from STALE expectations the two-book change touches anyway

Basis: failing test names plus the pins I had already read. I opened the test body only where noted; I did not run anything, so "why it is red today" is inference from the name and the source it reads.

### Likely touched by the change (fix or delete as part of the work, do not count as new breakage)

| File (reds) | Why it overlaps |
|---|---|
| tests/vercel-cron-pokes.test.ts (2) | Pins ≤2 crons, all `/api/scheduler`. vercel.json has 4 (two NFL lock pokes). The any-time engine rewrites the cron list — this file must be re-pinned either way |
| tests/live-board-only.test.ts (3) | "FIX 3" names: forced tap outside the limiter and the run cap (`manualReprice`, `MAX_RUNS_PER_DATE`) — source pins on the generate route that the any-time engine replaces |
| tests/board-refresh-full.test.ts (1) | "the flag short-circuits on the query BEFORE syncAuthed…" — same generate/props route source pins |
| tests/cfb-props-route.test.ts (1) | "THE CAESARS-MISSING RULE … EMPTIED upcoming game counts as noProps and is NOT Caesars-missing" — the rule is being removed outright |
| tests/cfb-picks-ui.test.ts (12) | Four are literally "CFB Board — the Caesars grammar"; one pins "pregame and in-game Caesars lines" blurbs; the rest read CfbPicksBoard source (PARLAY_CATS twelve keys, SHOW_CAP 50, LIVE tag in place of the stake) which is edited for selector removal |
| tests/cfb-props-ui.test.ts (2) | Reads CfbProps source, which carries the `mode === "cz"` selector and the `capped at maxEvents` footnote |
| tests/cfb-h1.test.ts (3) | "the per-event market list carries the three 1H markets after the six player markets, on both leagues" + category pins — the same per-event URL/market-list code the fetch change touches |
| tests/board-live-anchor.test.ts (23) | Board live-overlay renders; names include "names the spend against its own budget" and "states the budget out loud" — budget display goes away with daily caps; file also pins settle book (:142) and `dailyBudget` (:475-487) |
| tests/board-settled.test.ts (7), tests/live-board-reason.test.ts (5) | Board page render tests; board-settled:318 greps the `book="caesars"` OddsCell line. The Board page is edited for selector/Caesars removal |
| tests/board-scope.test.ts (1) | Red test is the Top 50 / All scope source pin (`useState<Scope>("top")`, `EVERY MARKET`, …) — UI drift. The neighbouring INSTRUCTION 41 test (currently green, :39-43) pins the Caesars-only ALL filter and WILL go red under (4) |
| tests/cfb-builder-ui.test.ts (11), tests/append-only-ui.test.ts (5) | Names pin "'/ $150' as an 11px sub-line", the paper banner and the locked-block "filling" line — daily-cap displays that (6) removes |
| tests/parlay-gen-ui.test.ts (2), tests/football-gen.test.ts (1), tests/ticketstack-markets.test.tsx (1) | Generator surfaces carrying `pricingBook` / `czOnly` / `FootballPriceMode`. The two parlay-gen-ui reds are a page-mount render and an "open flag after mount" source pin (UI drift today), but the file is re-pinned under (4)/(5) regardless |
| tests/cfb-picks.test.ts (1) | "68-game Saturday capacity" — category capacity tied to event caps (`maxEvents`) |
| tests/nav.test.ts (7) | Only if the change adds or removes a tab (e.g. removing a book-selector/Settings entry or adding an any-time page) |

Subtotal: 88 of the 128 reds sit in files the change edits anyway.

### Probably unrelated UI/doc drift (leave alone; do not let them hide new failures)

tests/mobile-density (9), desktop-density (4), theme-cerulean (2), ui-overlay (2), calc-ui (1), parlay-calc (1), props-ui (1), props-team-filter (1), nfl-pages (3), core-fun-split (3), ledger-eras (1), games (1), games-sheet-hold.test.tsx (2), board-sort (1), board-category-sync.test.tsx (4), board-window (1), sha-currency (1), sha-references (1), board-overview-toggle (1).

Correction to an easy misreading: tests/board-overview-toggle.test.ts:28 contains the words "vs the Caesars line", but that is the test's own fixture string fed to a stubbed `useBoard`, not a pin on source. The red test is the server-render check that the Engine notes toggle starts closed (`data-open="0"`), i.e. Board-page render drift, not Caesars wording. It will not be fixed or broken by removing Caesars — though it mocks `@/lib/cz-offered` (`useCzHidden`), so deleting that module makes the mock target vanish.

Practical rule for the implementer: compare failures BY NAME against `base-fails.txt` after the change (the repo memory mentions a `cmpfails.py` for this). A count comparison will mislead, because the change legitimately turns some standing reds green (e.g. vercel-cron-pokes if the NFL crons go) while adding new reds elsewhere.

---

## Appendix — things no existing test covers (new tests needed)

1. That every outbound Odds API request carries `bookmakers=draftkings,fanduel` and no `regions=` — existing tests pin the opposite.
2. That a response containing a third book is ignored (defence in depth).
3. Two-book fair = mean of the two no-vig numbers; behaviour when only ONE of DK/FD posts the line (today `minBooks: 2` drops it on football/MLB-live; legacy blocks on `booksInd === 0`).
4. Price = better of DK/FD, with the chosen book recorded on the ticket.
5. Every leg of a parlay priced at the same book.
6. Legacy engine behaviour on a DK+FD-only fixture (`booksInd`, `no_ind_consensus`, inert `SH_BOOKW`).
7. `/api/odds` proxy `shapeAllowed` keyed on `bookmakers` (odds-hardening:159-165 currently pins exactly two `regions` shapes).
