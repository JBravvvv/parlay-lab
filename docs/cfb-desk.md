# CFB desk — pricing, storage, and separation reference (written 2026-09-05)

Companion to INSTRUCTION 38 in `session-handoff.md`. Every constant below is the value in `src/lib/cfb/rules.ts` on the day this was written; every prod figure was read from `https://parlay-lab-six.vercel.app/api/cfb` that day; figures that come from the test fixtures say so in the same line.

## Shape — one shell, two desks
- `src/lib/sport.ts` holds the switch: `Sport = "mlb" | "cfb"`, localStorage key `pl_sport`, window event `pl:sport`, `useSport()` through `useSyncExternalStore` with a server snapshot of `mlb` (SSR always renders MLB; the client flips on mount). The `SportSwitch` pill sits under the brand in the rail and in the phone header.
- Every page (`app/{games,stats,board,builder,props,ledger,sharp,settings}/page.tsx`) calls `useSport()` after its own hooks and early-returns its College Football surface with `PageHeader eyebrow="College Football"`. The MLB hooks still mount behind the CFB desk (accepted: cached and cheap); the Games page disables the MLB schedule query while CFB is showing.
- `CFB_ENABLED` in `src/lib/features.ts` is `true`; flipping it hides the switch and the desk.
- The Stats page keeps its own pill under `pl_stats_sport` (it used to share `pl_sport`; a legacy JSON-quoted value under `pl_sport` fails `isSport` and reads as `mlb`). The NCAAF pill on that page opens the CFB desk's FPI panel.

## Feeds and the route
| feed | constant | cache | on failure |
|---|---|---|---|
| ESPN scoreboard for one calendar date — the route fetches the slate date AND the next date so a Friday/Saturday hand-off never shows an empty board | `CFB_ESPN_SCOREBOARD` | `revalidate: 60` | `/api/cfb` answers 502 |
| ESPN FPI power index (`limit=400`) | `CFB_ESPN_FPI` | `revalidate: 21600` | FPI part dropped from the blend, `fpiUpdated: null` |
| The Odds API `americanfootball_ncaaf`, regions `us,eu`, markets `h2h,spreads,totals`, american odds | `CFB_ODDS_URL` | `revalidate: 240` | `oddsMissing: true`, scores-only board, no tickets |

- One fresh odds pull costs 6 credits (3 markets × 2 regions): the prod read on 2026-09-05 moved the quota from 17578 to 17572 remaining. The key is `ODDS_API_KEY`, server only. Local dev has no key, so `/api/cfb` returns `oddsMissing: true` locally — that is the environment, not a defect; price checks happen on prod.
- `/api/cfb` (`app/api/cfb/route.ts`, `force-dynamic`, `Cache-Control: no-store`): `?date=YYYY-MM-DD` (default PT today), `&bankroll=` (Kelly base), `&mode=board|finals`. Body = `CfbSlate` (`src/lib/cfb/types.ts`): the board plus `finals`, `quota {remaining, used}` and `oddsMissing`; the quota also rides in response headers.
- Client: `src/lib/cfb/client.ts` — `loadCfbSlate(date, {bankroll})`, `loadCfbFinals(date)`, query key `["cfb","slate",date,bankroll]`, stale 240 s. Board, Builder and Parlay Builder share `useCfbDesk()` (exported from `CfbBoard.tsx`): the query is keyed on a concrete date, waits for the bankroll, and auto-advances to the next slate date when the chosen day has no games.

## Model constants (`CFB_MODEL`)
| constant | value | meaning |
|---|---|---|
| `sigma` | 16.5 | standard deviation of the final margin, points |
| `sigmaTotal` | 18 | standard deviation of the total |
| `hfa` | 2.6 | home-field points added to the FPI margin; 0 at neutral sites |
| `blend` | mkt 0.6 · spread 0.25 · fpi 0.15 | win-probability blend, renormalised over the parts that exist |
| `spreadBlend` | mkt 0.75 · fpi 0.25 | margin blend |
| `pinnacleWeight` | 2 | Pinnacle counts twice in the weighted median |
| `minBooks` | 2 | a market with fewer books is null |
| `settleBook` | `williamhill_us` | Caesars — the only book tickets are written at |
| `matchWindowMs` | 3 h | ESPN kickoff vs odds `commence_time` tolerance |

## Pricing pipeline (`src/lib/cfb/model.ts`, `buildCfbBoard`)
1. Per book, devig the two sides proportionally (`devigProportional`).
2. Per book, turn the spread into an implied margin, μ_b = −s_b + σ·Φ⁻¹(pCover), and the total into an implied mean, T_b + σ_T·Φ⁻¹(pOver). Φ⁻¹ is Acklam with one Halley step, Φ is Hart/West (`src/lib/cfb/normal.ts`).
3. Consensus per market = weighted median across books (Pinnacle ×2); null under `minBooks`.
4. `pHome` = blend of {devigged moneyline, spread-implied, FPI-implied} over the parts that exist. `muMargin` = `spreadBlend` of {market margin, FPI margin}, or σ·Φ⁻¹(pHome) when only a moneyline exists. FPI margin = fpiHome − fpiAway + hfa.
5. Each `CfbRow` prices its side at the consensus line (`fair`, `push`, `fairAm`), then quotes every book at the book's OWN line with EV re-evaluated there — that is why a Games card can show `-115@54.5` against a consensus 55. `cz` = Caesars, `best` = highest decimal at the consensus line, `dk` / `fd` / `pin` for reference.
6. `evCz` / `evBest` are percentages; the grade (S…F) comes from `evCz` through the shared `gradeFromEv` in `src/lib/grade.ts` — the same letter scale as the MLB board; `playable` = Caesars posts it ∧ status upcoming ∧ kickoff after `now`; `kelly` = quarter-Kelly of the bankroll, capped at 2 %, only when playable.
7. Games survive only when `ptDateOf(start) === date` (`src/lib/cfb/dates.ts`); `slateDates` = PT dates of every odds event still to kick off, plus the requested date.

## Team matching (`src/lib/cfb/names.ts`)
- `normTeam`: strip accents (NFD), lowercase, drop apostrophes, "&" → " and ", the token "st" → "state".
- `ALIASES` (Odds API name → ESPN display name), 10 entries:

| Odds API | ESPN |
|---|---|
| Sam Houston Bearkats | Sam Houston State Bearkats |
| Southern Miss Golden Eagles | Southern Mississippi Golden Eagles |
| Houston Christian Huskies | Houston Baptist Huskies |
| App State Mountaineers | Appalachian State Mountaineers |
| SE Louisiana Lions | Southeastern Louisiana Lions |
| The Citadel Bulldogs | Citadel Bulldogs |
| Youngstown State Penguins | Youngstown St Penguins |
| Nicholls Colonels | Nicholls State Colonels |
| Louisiana Ragin' Cajuns | Louisiana Ragin Cajuns |
| Hawai'i Rainbow Warriors | Hawaii Rainbow Warriors |

- `GENERIC` tokens ignored in the overlap test: university, state, the, of, and, at, college, a, u.
- `matchOddsEvent` tiers: exact on both teams → alias on both → one team exact plus token overlap on the other, same PT date, kickoff inside `matchWindowMs`. Ties go to the nearest `commence_time`; a matched odds id is consumed so two ESPN games cannot claim one event.
- Read on prod 2026-09-05: 68 ESPN games, 68 matched, 0 unmatched.

## Card rules (`CFB_RULES`, `CFB_PAPER`) and `buildCfbCard` (`src/lib/cfb/card.ts`)
- Paper: $150 core + $25 fun per slate day, since 2026-09-05 (`CFB_PAPER`).
- Core: candidates need `evCz ≥ 2 %` and a Caesars decimal ≤ 2.60; one side per game (`bestPerGame`); singles and cross-game doubles (product ≤ 2.60) ranked by EV; greedy admit with Kelly stakes clamped to $5–$25; never two core tickets on one game; 3 to 7 tickets; leftover raised likeliest-first; if still short, a forced pool (decimal ≤ 1.75, EV ≥ 0) by probability with a "Top-up:" note; undeployed money is written into `notes`, never silently spent. The first fixture card (fixture data, 12 games) deployed only $75 in three $25 singles and said so in its note; the prod card of 2026-09-05 deployed all $150 in six singles.
- Fun: $25 on one parlay of 3–5 legs across distinct games; legs are the likeliest sides by no-push probability at Caesars' line among playable rows with `evCz ≥ −3 %` (grade D or better, never an F), moneylines and spreads before totals, adding legs until the decimal is ≥ 4 (cap 40). Named "FAVORITES PARLAY" when at least half the legs are ≥ 50 % to hit, else "FUN PARLAY". Decision record: the first fixture card's fun ticket, ranked by EV, was the same three underdogs as its core singles at +631 (fixture data) — the opposite of fun money on favourites — so the leg picker went probability-first. When Caesars posts no moneyline on the biggest favourites (it did not on six games of the fixture slate; the same happened on prod), the likeliest priced sides are big underdog spreads and the parlay leans on those.
- Games whose kickoff is at or before `opts.now` are excluded from every ticket.
- Ticket ids `cfb-<date>-core-<n>` and `cfb-<date>-fun-1`; names "SINGLE · …" / "DOUBLE · … + …".

## Separation — every CFB key, route, and store
- localStorage: `pl_cfb_ledger`, `pl_cfb_bank2` (`CFB_KEYS`).
- Redis: `pl:cfb:ledger:v1`, `pl:cfb:bank:v1` (`CFB_REDIS`).
- Routes: `/api/cfb`; `/api/cfb/ledger` (`app/api/cfb/ledger/route.ts`) — GET `{ledger, bank, at}`, PUT `{ledger, bank?}` behind the same `x-pl-sync` gate as MLB sync, `validateLedger` plus every entry `sport === "cfb"`, merged by date, 413 over the byte cap, no epoch.
- Query keys start with `"cfb"`.
- Bank: `CFB_BANK_BASE` 2500, `asOf` = `CFB_PAPER.since`; Settings shows "COLLEGE FOOTBALL BANK" beside the MLB bank with its own append-only adjustment log (`src/components/cfb/CfbBankPanel.tsx`).
- Ledger entries (`CfbLedgerEntry`): `sport: "cfb"`, `locked: true`, `daily` 150, `fun` 25, `core[]`, `funT`, a `games{}` snapshot, `grading?`. `upsertCfbEntry` refuses to re-lock a date (`src/lib/cfb/store.ts`).
- Sync: `syncCfbNow` / `useCfbSyncBeacon` / `CfbSyncChip` (`src/lib/cfb/sync.ts`); the phrase is the one sync phrase from Settings, sent only as the `x-pl-sync` header; the two stores never cross.
- Exposure: `cfbExposure` / `cfbExposureOn` count only CFB entries.
- `tests/cfb-separation.test.ts` pins all of it: no CFB module references an MLB key or route, `/api/cfb/ledger` never names the MLB Redis keys, every page imports `useSport`, `AppShell` mounts the CFB beacon.

## Grading (`src/lib/cfb/grade.ts`)
- `gradeCfbEntry(entry, finals, now)`: each leg against the ESPN final for its game at the Caesars line and price on the ticket; pushes void the leg; a game with no final after `CFB_UNGRADABLE_MS` (48 h) is void; auto-grade skips NO-PLAY entries.
- Stats and bankroll go through the shared helpers (`ledgerStats`, `computeBankroll`, `todayExposure`) fed only CFB entries (`src/lib/cfb/ledger.ts`).

## UI
- `src/components/cfb/`: `TeamMark`, `CfbGameCard`, `CfbPicksBoard` (the Board since 2026-09-05: StatTiles PICKS / +EV AT CAESARS / BEST EDGE / PARLAYS, TOP 50 / ALL scope, category strip ALL · ML · SPREAD · TOTAL · one tab per prop market, pick search, the ranked read-only table, and `CfbParlaysSection` — PARLAYS / MIXED / LIVE views with SAFER / LONGSHOT / MIX tiers from `buildCfbPicks` in `src/lib/cfb/picks.ts` under `CFB_PARLAYS`; no games list — that is Games), `CfbBoard` (now only the desk-hook re-exports from `src/lib/cfb/useCfbDesk.ts` plus an alias of the picks board), `CfbGames` (day rail with ‹ › pills, finals poll while live), `CfbBuilder` (CORE / FUN / CFB BANKROLL / EXPOSURE tiles, TODAY'S CARD, NO-PLAY state), `CfbSlip`, `CfbProps` (sandbox, Caesars / Best toggle), `CfbLedger` plus `CfbLedgerActions` (Grade now / Export / Copy for phone / Import / Wipe device), `CfbSyncChip`, `CfbBankPanel`, `CfbSharp` (the constants panel), `CfbFpiPanel`.
- Shell (`src/components/shell/`): `SportSwitch` (motion `layoutId` thumb), rail active pill, `useCfbSyncBeacon()` beside the MLB beacon, footer "MLB & CFB · informational only, not betting advice". `app/template.tsx` is the page-enter transition (fade + rise over 0.7 s; reduced motion → appears).
- Primitives added in `src/components/ui/`: `Segmented`, `StatTile`, `EdgeMeter`, `Sparkline`; `PageHeader` gained `eyebrow` and `chip`. Tokens in `app/globals.css`: `--color-cfb` (amber), `.press`, `.card-lift`, `.segmented`, `.ticket` (mask-clipped, so glows go on a wrapper), `.shine`, `.stat-tile`, `.rail-glow` / `.is-cfb`.

## Props, picks and parlays (INSTRUCTION 39, 2026-09-05)
- Six player markets, contract in `src/lib/cfb/props-types.ts`: anytime TD (`player_anytime_td`, yes-only), pass TDs, pass yds, receptions, rush yds, rec yds (over / under). A row key is `gameId|market|playerSlug|side|line`.
- Pricing in `src/lib/cfb/props.ts` (`parseEventProps`): O/U pairs devigged per book at the same point; the consensus line is the weighted median of posted lines (always a posted line); fair = the true median of the devigged probabilities at that line, `null` under `CFB_PROPS.minBooks` (2); anytime-TD yes-only quotes are priced against a 1.08 overround; every book is quoted at its own line with EV re-evaluated there; Caesars (`settleBook`) is the settle book and the grade / Kelly source, as on sides.
- ESPN season context (`src/lib/cfb/props-context.ts`, `loadCfbPropsContext`, revalidate 3600 s) attaches per-game and season passing / rushing / receiving lines to a row (`ctx`) when the athlete resolves.
- Route `app/api/cfb/props/route.ts` (`?date&bankroll`): builds the slate through the shared helpers in `src/lib/cfb/slate-server.ts`, picks the games that have an odds event and a Caesars side price and are either upcoming (kickoff still ahead) or LIVE — never final / postponed (`selectPropEvents`: two pools since the 2026-09-05 same-day follow-up — the in-play games, at most `liveMaxEvents` = 6, then the pre-kick games, at most `maxEvents` = 12, each pool by kickoff then rank; changed under INSTRUCTION 40 so in-game prop lines keep populating like the MLB side. Read on prod after the first deploy: one sorted list capped at 12 let nine in-play afternoon games take every slot, so the twenty-plus evening kickoffs had no props — hence the two pools), then pulls each event's props with the server key. Prod's `/api/odds?u=` proxy refuses player-prop market shapes (403 "market shape not allowed"), which is why this route fetches itself.
- INSTRUCTION 42 (2026-09-05, "grade every possible pick"): every eligible game on the slate is priced (60 / 24 pools), and the carry decision is PER GAME — `CfbPropsBoard.pricedAt` stamps each priced game; a game inside its own 2 h window is carried, a LIVE game inside its window is re-priced every 10 min UNLESS its last pull returned zero rows (the empty-event rule: small games have no player props at the API, so they are held, carried, and never flag the board stale). The stored board is written in gzip + base64 chunks of `CFB_PROPS_CHUNK_ROWS` (400) rows under an index at the board key (Upstash REST caps a request at 1 MB; a 60-game board would have failed the SET silently and disabled every credit saver — review fix). Cost math (estimate 31 credits per event with props): pre-kick pool ≤ 60 × 31 per 2 h; live pool ≤ 24 × 31 = 744 per 10-min pull, so on a busy Saturday the 2,500-credit day is spent after roughly three live pulls and the board then serves its last priced lines flagged stale — the daily budget and the Odds API plan (16,480 credits left in the month when read 2026-09-05) are Josh's to raise.
- Live window (INSTRUCTION 40, 2026-09-05): `CFB_PROPS.liveRevalidateSec` (600) is the cache window whenever any event actually being priced is in play — it drives the per-event data-cache `revalidate`, the Redis `SET EX`, and the stored-board staleness check (`boardWindowSec` in `props-store.ts`, falling back to `revalidateSec` when the value is missing or malformed); otherwise the window stays `revalidateSec` (7200). The board (`CfbPropsBoard`) carries `live` (in-play events priced) and `ttlSec` (the window it was written under); the Builder and the Board read `ttlSec` for their query `staleTime` and the Builder footnote prints "cached 10 min · N in play" off it. Live rows keep status `live` (the LIVE / MIXED parlay views read that) but `playable` and Kelly stay pre-kick only. The budget gate is unchanged — a live slate re-prices at most every 10 min until the day's credits are spent.
- Review fixes (2026-09-05, after INSTRUCTION 40): (1) the stored board is fresh only inside min(its own `ttlSec`, the CURRENT slate's window) — `boardFresh` in `props-store.ts` — so a pre-kick board (7200) stops being honoured 600 s after a game inside it kicks off; the first request after kickoff re-prices. (2) A live pull re-prices ONLY what moved: the in-play events (at most `CFB_PROPS.liveMaxEvents` = 6, live first) plus any upcoming game the stored board has no rows for; every other upcoming game's rows are carried over from the stored board while it is inside `revalidateSec` (the board names its games in `priced`). Carried rows adopt the CURRENT slate's status (same-day follow-up): a game that kicked off since its rows were priced is reported `status: "live"`, `playable: false`, so the Board never runs a pre-kick Kelly on an in-play line. A full 12-event re-price every 10 min would have spent the 1200-credit day in four pulls. (3) The board is written with `EX CFB_PROPS.boardRetainSec` (36 h) — retained past its window — and when the daily budget refuses a pull the route serves the carried rows flagged `stale: true` with the original `generatedAt` (source `redis`, note "showing the last priced lines") instead of `rows: []`; the Builder and Board footnotes print "N in-play games show lines as priced at H:MM", adding "— today's props budget is used up" only when `budgeted` is true (same-day follow-up: the first deploy blamed the budget for every stale board; prod had spent 92 credits). (4) The client `staleTime` is what is LEFT of the window (`cfbPropsStaleMs` in `client.ts`: `ttlSec` less the board's age), not the whole window from the fetch; `cfbCacheLabel` is shared so the Builder and the Board footnotes can never disagree.
- Picks (`src/lib/cfb/picks.ts`, `buildCfbPicks`): categories all / ml / spread / total / the six prop markets, ranked grade S → F, then EV at Caesars descending (null EV sorts last), then probability. Parlay leg pool = Caesars-priced rows with EV ≥ `CFB_PARLAYS.minLegEvPct` (−3). Tiers under `CFB_PARLAYS`: SAFER 2–3 legs, each ≥ 58 % to hit, decimal ≤ 3.5, ranked by combined probability, drawn from sides AND props (decision 2026-09-05: Caesars posts no moneyline on the big favourites, so a sides-only SAFER was empty on the opening slate; the 66–79 % anytime-TD favourites now qualify); LONGSHOT 4–6 legs, decimal 8–60, seeded from the likeliest legs and filled by EV; MIX 3–5 legs with at least one side and one prop, decimal 3–20. Views: PARLAYS (upcoming legs), MIXED (upcoming + live legs), LIVE (in-play legs only); at most 2 legs per game, never two legs on one player, never both sides of a market, 6 tickets per tier per view. A ticket's American price is derived from the rounded decimal the card shows, so the two never disagree on a half-cent edge. INSTRUCTION 42 (2026-09-05): categories admit LIVE rows too (sides from in-play games, props whose slate game is live), graded the same way, Kelly null, `playable` false, tagged LIVE in the table; `CfbPicks.liveRows` counts them. Twelve parlay sets (`CfbPicks.sets`, keys `CFB_PARLAY_CATEGORIES`: ml, spread, total, the six prop markets, combo, mixed, live), each up to `CFB_PARLAYS.perCategory` (50) distinct tickets: single-market sets are pregame legs all from that market, 2–6 legs, one leg per game, decimal 1.5–60; combo = pregame side + prop, 3–6 legs, decimal 2–60; mixed = at least one live and one pregame leg; live = in-play legs only. The 50 are chosen round-robin across leg counts (2..6, each bucket in EV order) so a set is not fifty six-leg tickets, then sorted by EV. `legFits` rejects a second leg on the same market of one game for props as well as sides (review fix). Benchmark pinned in `tests/cfb-picks.test.ts`: 68 games / 2,992 prop rows built in ~45 ms.
- Builder: `CfbProps` has a market nav (SIDES · ANYTIME TD · PASS TDS · PASS YDS · RECEPTIONS · RUSH YDS · REC YDS); a prop leg reaches the slip only when the row has a fair price and Caesars' line equals the consensus line (`propLegOf`), so the slip never prices one line while showing another.

## Freeze fix (INSTRUCTION 39)
- Root cause, the same as Scramble Lab's: a history-push navigation arms iOS Safari's edge-swipe-back recognizer, which wedges taps until the user swipes back; per-item `backdrop-filter` over the motion video freezes the page.
- Every internal `<Link>` is `replace` (shell brand, rail, phone icons, tab bar, landing chooser, game cards, the UFC builder); nothing pushes history, so there is nothing to swipe back to. `html, body { touch-action: manipulation }`. Backdrop blur stays only on shell chrome (rail, phone header, tab bar, the sticky market bars, the slips, the player-sheet body); per-item surfaces (`.glass`, `.liquid-glass`, `.ticket`, `.stat-tile`, table headers, tooltips, the player-sheet overlay) tint themselves instead. `app/template.tsx` is opacity-only, 0.45 s.
- Guard: `tests/nav-flat.test.ts` (no `href` push, no `router.push`, the touch-action rule, no blur on the per-item classes). Observed red first.

## Quota (INSTRUCTION 39)
- Measured 2026-09-05 from the Odds API headers on the first prod props pull: 24 events cost 753 credits (`x-requests-used` 2428 → 3187), about 31 credits per event — a slate pull costs 6.
- `CFB_PROPS` (`src/lib/cfb/rules.ts`, INSTRUCTION 42 values since 2026-09-05 — `maxEvents` 60 (was 12), `liveMaxEvents` 24 (was 6), `dailyBudget` 2500 (was 1200); the rest of this bullet describes the earlier shape): `maxEvents` 12, `revalidateSec` 7200, `liveRevalidateSec` 600 (2026-09-05, the window while any priced game is live), `dailyBudget` 1200, `measuredCreditsPerEvent` 31. `src/lib/cfb/props-store.ts` wraps the shared Redis client: the priced board is stored at `pl:cfb:props:v1:<date>` for `boardRetainSec` (36 h — retained past its window so the budget-out answer can serve it stale; freshness is `boardFresh`, capped by the current slate's window), the day's spend at `pl:cfb:props:spend:v1:<ptDate>` (36 h). Order in the route: Redis read (fresh → answer) → what needs pricing (every selected live event — the selector already holds them to `liveMaxEvents` — + upcoming games not carried) → budget gate (`allowed = floor((dailyBudget − spent) / 31)`) → fetch the allowed events → merge with the carried rows → tally the real `x-requests-used` delta → write back; nothing affordable → the stored rows, `stale: true`. The body reports `source` (`redis` / `fetch` / `none`), `budgeted`, `stale`, `priced` and `spentToday`; without the store env the route runs on the Next data cache alone and `spentToday` is `null`. Worst case without the budget: 12 × 31 × 12 pulls a day = 4,464 credits pre-kick, plus ≤ 6 × 31 per 10-min live pull; with it, 1,200. The footnotes ("cached 2 h", "today's props budget is used up") derive the hours from the constant.
- Tests: `tests/cfb-props-route.test.ts` (in-memory fake Redis, fetch served from the synthetic fixture, clock pinned), `tests/cfb-props.test.ts`.

## Tests and fixtures
- `tests/cfb-*.test.ts` `it(` blocks, grep-counted 2026-09-05: normal 7, names 12, model 22, card 12, grade 13, store 16, route 20, separation 20, props 24, picks 20, props-ui 24, props-route 17; plus `tests/nav-flat.test.ts` (freeze guard). Synthetic props fixture `tests/fixtures/cfb/odds-ncaaf-event-props.synthetic.json` (ECU@ALA, 4 books, 6 markets, 6 players — synthetic, not a capture).
- Fixtures in `tests/fixtures/cfb/`: `espn-scoreboard-2026-09-05.json` (12 games), `odds-ncaaf-2026-09-05.json` (14 events), `espn-fpi.json` (138 teams) — fixture captures cut from the raw feeds on 2026-09-04 and 2026-09-05. Fixture board: 0 unmatched; Caesars posts no moneyline on ALA / IU / OSU / ARMY / SYR / NEB in the fixture, so those ML rows are unplayable by design (prod shows the same "no CZ" rows).

## Known behaviours (not defects)
- Local dev has no `ODDS_API_KEY`: `/api/cfb` returns `oddsMissing: true` and the desk shows the scores-only fallback. Verify prices on prod.
- Local dev `/games` (both desks) can sit on the Suspense placeholder in the in-app browser while the SSR stream is complete; prod hydrates (walked 2026-09-05). Recorded in `progress.md`.
- "no CZ" moneyline rows show the fair price but no grade and no Kelly.
- A fresh slate odds pull costs 6 credits and `/api/cfb` caches for 240 s; a props pull costs about 31 credits per event and is capped, cached in Redis for 2 h pre-kick / 10 min while any priced game is live, and budgeted (see Quota).
