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
- `src/components/cfb/`: `TeamMark`, `CfbGameCard`, `CfbBoard` (StatTiles GAMES / +EV AT CAESARS / BEST EDGE / ESPN FPI, Segmented All / ML / Spread / Total, team search), `CfbGames` (day rail with ‹ › pills, finals poll while live), `CfbBuilder` (CORE / FUN / CFB BANKROLL / EXPOSURE tiles, TODAY'S CARD, NO-PLAY state), `CfbSlip`, `CfbProps` (sandbox, Caesars / Best toggle), `CfbLedger` plus `CfbLedgerActions` (Grade now / Export / Copy for phone / Import / Wipe device), `CfbSyncChip`, `CfbBankPanel`, `CfbSharp` (the constants panel), `CfbFpiPanel`.
- Shell (`src/components/shell/`): `SportSwitch` (motion `layoutId` thumb), rail active pill, `useCfbSyncBeacon()` beside the MLB beacon, footer "MLB & CFB · informational only, not betting advice". `app/template.tsx` is the page-enter transition (fade + rise over 0.7 s; reduced motion → appears).
- Primitives added in `src/components/ui/`: `Segmented`, `StatTile`, `EdgeMeter`, `Sparkline`; `PageHeader` gained `eyebrow` and `chip`. Tokens in `app/globals.css`: `--color-cfb` (amber), `.press`, `.card-lift`, `.segmented`, `.ticket` (mask-clipped, so glows go on a wrapper), `.shine`, `.stat-tile`, `.rail-glow` / `.is-cfb`.

## Tests and fixtures
- `tests/cfb-*.test.ts` `it(` blocks, grep-counted 2026-09-05: normal 7, names 12, model 22, card 12, grade 13, store 16, route 18, separation 13.
- Fixtures in `tests/fixtures/cfb/`: `espn-scoreboard-2026-09-05.json` (12 games), `odds-ncaaf-2026-09-05.json` (14 events), `espn-fpi.json` (138 teams) — fixture captures cut from the raw feeds on 2026-09-04 and 2026-09-05. Fixture board: 0 unmatched; Caesars posts no moneyline on ALA / IU / OSU / ARMY / SYR / NEB in the fixture, so those ML rows are unplayable by design (prod shows the same "no CZ" rows).

## Known behaviours (not defects)
- Local dev has no `ODDS_API_KEY`: `/api/cfb` returns `oddsMissing: true` and the desk shows the scores-only fallback. Verify prices on prod.
- Local dev `/games` (both desks) can sit on the Suspense placeholder in the in-app browser while the SSR stream is complete; prod hydrates (walked 2026-09-05). Recorded in `progress.md`.
- "no CZ" moneyline rows show the fair price but no grade and no Kelly.
- A fresh odds pull costs 6 credits and the route caches for 240 s, so repeated loads inside that window cost nothing.
