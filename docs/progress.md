# Progress — 2026-09-03 (integration: player sheet on Games + Parlay Builder)

## Click-any-player wired into the Games surfaces and the rebuilt Parlay Builder
- Games list (app/games/page.tsx): probable pitchers and the W / L / S decisions are tappable
  surnames that open the profile sheet by MLB id. src/lib/games.ts `Decisions` now carries
  `id` (the schedule feed's person.id) so the list never has to resolve a name; the
  tests/games.test.ts decisions pin was updated with a dated note. The card is a `<Link>`,
  so PlayerName now calls `preventDefault()` as well as `stopPropagation()` — a name tap
  opens the sheet and does not navigate (verified live: tapping "Williamson" on 9/2's
  SD @ CIN card opened Brandon Williamson · CIN · P · 5.94 ERA with the URL unchanged).
- Box score (src/components/games/BoxHeader.tsx, BattingBox.tsx, PitchingBox.tsx): every
  batter and pitcher line, the W / L / S line and the pregame probables render PlayerName
  with the boxscore's person.id; the printed text is still the feed's boxscoreName.
- Parlay Builder (src/components/props/PlayerRow.tsx, Slip.tsx): the player row's name is
  PlayerName with name + team (propBoard rows carry no MLB id; the sheet resolves through
  /api/player/resolve — "Gunnar Henderson" + BAL → 683002 via exact). Slip legs print their
  "Name (TEAM)" label through BoardLabel; ML / RL club labels stay plain text.
- tests/player-wiring.test.ts (new, 4 pins): each surface imports and renders the tappable
  name, box score names pass the id, list decisions are id-keyed, PlayerName prevents the
  Link default. Full gate re-run after integration (see the session handoff for the line).
- Dev-server caveat seen while verifying: with the full vitest run pegging the CPU
  (load ~13), client hydration of /games and /games/[gamePk] stalled at the Suspense
  fallback for tens of seconds; the SSR stream itself was complete (S:1 / S:2 chunks
  present) and the pages hydrated once the load dropped.

# Progress — 2026-09-03 (nav reorder)

## Nav reorder — Josh's verbatim tab order, Dashboard removed
- src/components/shell/AppShell.tsx: NAV is now a typed table with `group` (top | bottom) and
  `mobile`. Desktop rail: Games, Stats, Board, Builder, Parlay Builder, Parlay Calculator under
  the brand; flex spacer; Ledger, The Sharp, Simulator, Settings pinned above the footer
  disclaimer. Dashboard entry deleted (brand logo still links "/"; "/" is never highlighted).
- Mobile (375px): bottom bar = Games, Stats, Board, Builder, Parlays, Ledger (6 columns, grid
  still derived from the mobile entry count). Parlay Calculator, The Sharp, Simulator, Settings
  render as icons in the mobile top bar, derived from the same table (`!n.mobile`), so every
  route stays reachable on a phone.
- src/components/shell/icons.tsx: +IconGames (calendar), +IconParlay (ticket with checked
  legs) so Games / Board / Parlay Builder no longer share one glyph; IconDash removed.
- tests/nav.test.ts (new, 11 pins): rail order per group, no Dashboard, "Parlay Calculator"
  label, bottom-group contents, mobile tab set + ≤9-char labels, top-bar derivation.
  tests/parlay-calc.test.ts AppShell pin updated to the new label / top-bar placement.

# Progress — 2026-07-24 (session end)

## Status: parlay-lab-hardening-instructions.md — ALL 4 PHASES DONE, deployed
Live at parlay-lab-six.vercel.app (branch frontend-rebuild = Vercel prod).
Commits 9793d2c → 18ec6ad. 242/242 tests, baseline43 parity digest intact.
Phases 1–3 approved by Josh individually; Phase 4 run on his "run the rest".

## What shipped this session
- P1: bankroll adjustment log (pl_bank2) cloud-syncs — mergeBankStores append-only
  union in src/lib/bankroll.ts, server blob pl:bank:v1 on /api/ledger, pull-merge-push
  in ledgerSync.ts. One converged bankroll feeds Kelly + the 10% cap everywhere.
- P2: CLV report — entries stamp selMode at lock; src/lib/clv-report.ts (fairPts =
  closing consensus fair − locked imp; czCents seam-free); Stats → CALIBRATION ClvPanel
  (mean+n+SE, by-market, 30d trend, filters); docs/clv.md. No backfill, starts clean.
- P3: override accountability — synced pl_noplay verdict log (pl:noplay:v1; Builder
  marks the NO-PLAY banner, write-once/day); discipline() in src/lib/noplay.ts; Stats
  DisciplinePanel, Dashboard month-override one-liner, red OVERRIDE tags on Ledger.
- P4: docs/collection-period.md — FREEZE through late Aug 2026; exits = ~150 graded
  HRR O0.5 legs (→ deferred HRR sim recal project) or 60 days (≈2026-09-22); every
  frozen parameter's deployed value tabled there for drift detection.

## Post-freeze addition (Josh's explicit request, display-only — no frozen param touched)
- "Parlay Builder" nav tab (/props): Caesars-style sandbox prop board from the cached
  engine board (games/batter/pitcher tabs, market pills, per-game cards, True Win %
  beside each CZ price) + bottom ticket slip (combined odds, naive true %, EV, payout).
  Never locks, never enters the ledger. src/lib/ticket-math.ts + app/props/page.tsx.

## Parlay Builder coverage fix (2026-07-24, Josh: "only showing certain players odds")
The sandbox was reading the engine's ranked `categories`, which are the SELECTION pool:
top 50 rows per market by win probability, ONE side per line, and only players past the
model's filters (25+ AB in 30 days; scratched-from-a-posted-lineup returns early). On
the 6-game fixture that showed 50 of 133 posted anytime-HR prices and 50 of 81 hits rows
— on a 15-game slate it is far worse. Right pool for picking plays, wrong one for
browsing a book.
- Engine (`legacy/index.html` → `node tools/extract-engine.mjs`): new `data.propBoard`,
  built from the RAW slate after finalizeCats — every game, every market, every player,
  every line, BOTH sides, uncapped. Rows carry best-price + book, the Caesars quote,
  `pO` (the engine's own model % for that line when it priced it) and `fO` (de-vigged
  market fair). Caesars milestone ladders now ride along on the slate (`slate.props[].alt`)
  and appear as ALT rows, de-duped against standard rows (integer rung n → n−0.5).
  Additive + display-only: `categories`, parlays, allocator, ledger and the parity digest
  are untouched (parity green), and NO frozen parameter moved.
- UI (`app/props/page.tsx`): player props render from propBoard — two price buttons per
  row (Over/Under with per-side %), player search, per-game counts, book tags (DK/FD/CZ…),
  ALT + PROJ + "market price only" tags, and market-fair legs shown italic with a slip
  note that their EV is ~0 by construction. Boards cached before this deploy lack
  `propBoard` → honest "regenerate" panel instead of silently showing the old 50.
- `tests/prop-board.test.ts` (10) pins full coverage, no dupes, the model-% match against
  categories, the ladder normalisation/de-dupe, and that categories stay ≤50 with their
  EV layers. 255 tests total.

## THE EXACT NEXT STEP: NOTHING. The freeze is on.
Only sanctioned work: bug fixes with Josh's sign-off; the HRR sim recalibration when
an exit condition fires. Do not tune weights/gates/caps — check collection-period.md.

## Gotchas for the next session
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest.
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; `npm run build:local`;
  `git pull --rebase origin frontend-rebuild` before push; purge iCloud dupes with
  `find . -name "* [0-9].*" -not -path "./node_modules/*" -delete`.
- Browser pane: unfocused clicks/form_input may not fire React handlers — DOM .click().

## 2026-09-04 — INSTRUCTION 37: player card windows follow the Stats tab (games / starts, not days)
Josh's word, verbatim: "Yes change everything that shows those stats to the new way". The player sheet's Last 7/15/30 DAY rows and 30-day chart become game windows cut from the game log (`src/lib/player-card.ts` via `aggregateHitting` / `aggregatePitching` in `src/lib/stats-window.ts`); `app/api/player/route.ts` drops its three `byDateRange` calls. Pins: `tests/player-card.test.ts`. Full write-up under INSTRUCTION 37 in `docs/session-handoff.md`.

## 2026-09-04 — INSTRUCTIONS 35–36: Stats tab timeframes become per-player GAME windows
Josh's word, verbatim: "change Hitting filters from Last 7 Days, Last 15 Days, Last 30 Days, 2026 Season to Last 7 Games, Last 15 Games, Last 30 Games … this should only reflect games they played in" / "change Pitching filters … to Last 3 Games, Last 5 Games, Last 10 Games … for SP … his last 5 Games Started. For a player like Aroldis Chapman … his last 5 RP … only games he pitched in". New `app/api/stats/window/route.ts` batches every player id through MLB's people hydrate `lastXGames(limit=N)` (the league-wide endpoint pins X=10) and, for starters whose window holds a relief outing, sums their last N starts from the game log (`src/lib/stats-window.ts`). `app/stats/page.tsx`: game-window menu per group, position kept across groups, explanatory note. Pins: `tests/stats-window.test.ts` + fixture `tests/fixtures/stats-window-2026-09-05.json`. Full write-up under INSTRUCTIONS 35–36 in `docs/session-handoff.md`.

## 2026-09-04 — INSTRUCTIONS 31–34: Top 50 / All scopes, S grade, Board search, Parlay Builder props 403
Josh's word, verbatim: "On 'Board' there should be two tabs next to each other 'Top 50' & 'ALL' …" / "'S' grade will now be the highest possible grade right above 'A' grade" / "There should be a search bar on right side of live tab on board …" / "Prop bets still aren't pulling up on 'Parlay Builder'. Daily odds should generate along with the 'Board' generating". Board scope control + All view from `propBoard` graded S → F + name search (`app/board/page.tsx`); `GRADE_CUTS.S = 6` (`src/lib/grade.ts`, `GradeChip.tsx`); the Builder bug was the odds proxy 403-ing the engine's `_alternate` ladder markets since 08-02 so every device Refresh lost its props (`src/lib/server/odds-shape.ts` now admits them; `app/props/page.tsx` falls back to the server prop board). Pins: `tests/board-scope.test.ts`, `tests/grade.test.ts`, `tests/odds-hardening.test.ts`. Full write-up under INSTRUCTIONS 31–34 in `docs/session-handoff.md`.

## 2026-09-04 — INSTRUCTIONS 28–30: scratched batters off the Board; sortable prop tabs; Tier → Grade
Josh's word, verbatim: "It keeps showing Jose Caballero on the board even with a refresh yet he's not in the yankees starting lineup so there's no bets available for him at any book" / "I should be able to sort each tab on the 'Board' like H+R+RBI, Hits, etc by clicking on the title of the column ie: 'Tier' or 'Edge Status'" / "Rename 'Tier' to 'Grade'". Render-time posted-lineup cross-check (`src/lib/lineup-check.ts`, `src/lib/useLineups.ts`) hides OUT batters on both Board tables with a show/hide toggle; the stamped-picks table is now a sortable `DataTable` (`pickColumns`); headers read "Grade". Pins: `tests/lineup-check.test.ts` + fixture `tests/fixtures/lineups-2026-09-04.json`. Full write-up under INSTRUCTIONS 28–30 in `docs/session-handoff.md`.

## 2026-09-04 — INSTRUCTION 27: sims 50K → 25K
Josh's word, verbatim: "Make everything like the Board refresh only 25K sims instead of 50K". `SIM_PATHS` (`src/lib/engine-client.ts`) is now 25000; UI copy derives from it. `tests/sim-paths.test.ts`.

## 2026-09-04 — INSTRUCTIONS 25 + 26: Ledger back under "Parlay Calc"; ledger eras (9/4 → default, 8/15–9/3 tab)
Josh's word, verbatim: "Move the Ledger tab back up right below Parlay Calc (Rename it from Parlay Calculator)" / "Create a new net P/L for Core & Fun money from today forward … Don't remove the old data … a tab that shows pre new ledger data which was 8/15-9/3". Nav: `src/components/shell/AppShell.tsx`. Eras: `src/lib/ledger-stats.ts` (pure port of `shLedgerStats` over an era's entries), `app/ledger/page.tsx` era pills; `tests/ledger-eras.test.ts`. Full write-up under INSTRUCTIONS 25/26 in `docs/session-handoff.md`.

## 2026-09-03 — PARLAY BUILDER UI REBUILD (density pass on /props)
Josh's word, verbatim: "We need a massive UI rebuild on the 'parlay builder' tab. It looks EXTREMELY visually unappealing and I would hate to spend an hour looking at that building parlays. The tabs could be on two scrolls where you press on it still but can scroll the furthest ones like 1st 3 innings & 1st 5 innings from right to left. Actual pick choices on batter props tabs like 'Pete Alonso', 'Gunnar Henderson' when looking at their total bases, HRs etc are WAY TOO BIG." Display-only: `app/props/page.tsx` rewritten on top of a new `src/components/props/` (props-model.ts = the MARKETS/TABS tables and sidePrice/sideProb/sideLabel/oppRow/bothSides/groupByGame/legId moved verbatim; MarketNav = sticky segmented control + horizontally scrolling snap pill rail with a right-edge fade + 36px search; PlayerRow = 28px headshot, one-line name/team, two 32px O/U buttons with the win % and its model/mkt tag; GameCard = 36px collapsible header with 20px logos; Slip = collapsed bottom-sheet handle, ≤45vh when open, same combineTicket math plus Fair = the true % as an american price via decToAm). Measured from class sizes, not a screenshot: a batter row went from ≈102px to 41px, so a 375×812 phone shows ≈11 rows in Safari (≈10 in the installed PWA once the 34px home-indicator inset and the taller standalone top bar are counted) where it showed 4. Review pass the same day: O/U buttons narrowed 86→80px and the team tag moved under the name so the name column is ≈127px ("Gunnar Henderson" ≈106px renders whole; truncation is the last resort); Clear is a sibling button, not nested in the handle; Fair relabelled "Fair (true)" with a footnote that it is the break-even price, not a quote; insets read in a layout effect (no first-frame jump); slip aligned to the content column on md+; `tests/props-model.test.ts` runs the helpers on synthetic rows (CZ-first pricing, 100−% under flip, leg id/sub format, away-first order). No engine, ticket-math, board or feed code touched; every price still renders through amFmt from the board's posted quotes. Pins: `tests/props-ui.test.ts` (24 source-scan tests: same imports/helpers, snap rail, h-7 headshots, no fixed bottom-[64px] wall, copy preserved).

## 2026-09-03 — CLICK-ANY-PLAYER PROFILE SHEET (Roster Lab-style card on every name)
Josh, verbatim: "On the Stats tab and any other tab that lists a players name, you should be
able to click on that players name & pull up a page that is identical to their Roster Lab
profile." Roster Lab's card is fed by an ESPN fantasy league (FPTS, rank, % rostered, draft
line, Rotowire news); Parlay Lab has none of that, so every figure is the MLB Stats API
equivalent, labelled as such — nothing is invented and no fantasy fact is imitated.
- `src/lib/player-card.ts` (pure): name normalisation (accents / punctuation / Jr.), the
  "Name (TEAM)" label parser (club rows stay plain), the season-index resolver (exact →
  team-disambiguated → last-name + initial; ambiguity returns null, a 404 beats a wrong
  player), PT-date windows, and `shapeCard` — tiles OPS/HR/AVG (hitters) or ERA/K/WHIP
  (pitchers), split table season + last 7/15/30 days via `stats=byDateRange`, per-game
  bar chart (TB or K, last 30 days) and the newest-first game log from `stats=gameLog`
  (hitters' per-game OBP/SLG computed from the game's own counts; the feed's rate fields
  on a gameLog split are season-to-date). Roster status from the person's active
  `rosterEntries` entry (Active / Injured 15-Day / Injured 60-Day …), or "not posted".
- `app/api/player?id=` (card, 300 s cache) and `app/api/player/resolve?name=&team=`
  (in-memory season index, 24 h) — statsapi only, no secrets.
- `src/components/player/PlayerSheet.tsx` (provider + sheet: swipe-down, Escape, backdrop,
  sticky identity header, tiles, split table, chart, game log, footer) and
  `PlayerName.tsx` / `BoardLabel` (one-line swap at any name). Mounted in `app/providers.tsx`.
- Wired: Stats table player cell (id passed straight through), Board pick labels + the
  day's stamped picks, Builder ticket legs + manual slip, The Sharp plays + not-offered,
  Parlays legs, Pitcher vs Team rows + picker chip. No number, sort or business logic
  touched on any of them. Props / Games are wired by the integration step (other lanes).
- OMITTED, honestly: the "Recent news" section. No free MLB-id-keyed news feed exists;
  ESPN's athlete news needs an ESPN id mapping Parlay Lab does not have. Nothing fabricated.
- `tests/player-card.test.ts` (fixtures `tests/fixtures/player-*.json` = trimmed real
  statsapi responses captured 2026-09-03: Acuña 660670 hitting, Skenes 694973 pitching,
  a 10-player index slice).
- Review fixes (same day): `pickSplit` prefers the COMBINED byDateRange split (numTeams 2,
  no team) — statsapi lists per-team partials first for a player traded inside the window
  (real pin: Luis Arraez 650333, 2026-06-01..09-03, PHI 27 G / 107 AB vs combined
  76 G / 309 AB, `tests/fixtures/player-650333-window.json`); an MLB 404 on `/people/{id}`
  is now an honest 404 from `/api/player` (was 502); the day's stamped picks pass the
  team parsed off their "Name (TEAM)" label (duplicate names like Max Muncy resolve);
  the sheet pins the Split / Date column (`sticky left-0`) like Pitcher vs Team, always
  renders the chart section (single bar OK, "No games in the last 30 days." when empty)
  and fills bars from `var(--color-pos)`.

## 2026-09-03 — INSTRUCTION 21 (Games lane): season-long date rail + clickable box scores
Josh's word, verbatim: "On the Games tab, the list should keep going through the last regular season game of the year which is Sunday Sept 27. You should also be able to click on any game to see the box score. Only games from Sept 1 on need to be included in this tab." `SEASON_WINDOW` = 2026-09-01..2026-09-27 inclusive (`src/lib/games.ts`: `seasonDates`, `clampToWindow`, `inSeasonWindow`, `railLabel`); `/api/games` returns 400 outside it and the page clamps a URL date into it. Date rail: `src/components/games/DateRail.tsx` (27 pills, "Today" on the PT date, selected day auto-centred). Every card on `app/games/page.tsx` is now a Link to `/games/[gamePk]?date=`; the inline `<details>` linescore moved to the box page. Box score: `app/games/[gamePk]/page.tsx` (TanStack, 30 s refetch while live) over `app/api/games/[gamePk]/route.ts` (statsapi boxscore + linescore + schedule?gamePk, in parallel) shaped by pure `src/lib/boxscore.ts` — header with logos/records/score/status, linescore (1..max(9, scheduled) with R H E, "x" for an unbatted bottom on a final), W/L/S with W-L + ERA from the box's own seasonStats, team toggle over the batting box (AB R H RBI BB K AVG OPS, subs indented with the feed's a- note, Totals), the feed's BATTING/BASERUNNING/FIELDING strings verbatim, pitchers (IP H R ER BB K HR ERA with (W, 2-0)/(L, 2-2)/(S, n) tags — the feed's `stats.pitching.note` first, decisions as the fallback), and the game info block. Pregame: posted lineups with 0-0 lines + probables, else "Lineups not posted yet". Components in `src/components/games/`. Doubleheader fix: `gkeyMatches` strips the engine's trailing `gm1`/`gm2` and pins it to the schedule `gameNumber`. Tests: `tests/boxscore.test.ts` on three trimmed REAL payloads (`tests/fixtures/boxscore-{final-822686,live-824796,pregame-823907}.json`, fetched 2026-09-03) and the window/DH block in `tests/games.test.ts`. Live check on the dev server: `/api/games?date=2026-09-02` → 15 finals; `/api/games/822686` → ATL 9 @ WSH 0, W Hernández (2-0, 1.00), L Cornelio (2-2, 5.96), Acuña 3-for-5 3 RBI, WSH E Chaparro; `/api/games?date=2026-08-31` → 400.

## 2026-09-03 — INSTRUCTIONS 19 + 20: Pitcher vs Team (Stats) and the Games tab
Josh's word, verbatim: "there should be a button called pitcher vs team where you can select a pitcher as well as a separate MLB team and it shows every active hitter on the roster with their career stats against that pitcher" / "There should be a tab called "Games" that has every game for the day listed kind of like the mlb app". Pitcher vs Team: `src/components/stats/PitcherVsTeam.tsx`, `app/api/pvt/route.ts`, `src/lib/pvt.ts`, `tests/pvt.test.ts`. Games: `app/games/page.tsx`, `app/api/games/route.ts`, `src/lib/games.ts`, `tests/games.test.ts`, NAV entry in AppShell. Both public, statsapi-only (Games also reads the stored board for ML prices). Reviewer minors listed under INSTRUCTIONS 19/20 in `docs/session-handoff.md`.

## 2026-09-03 — INSTRUCTION 18: core rules for the paper record (engine optimization lane)
Josh's word, verbatim: "change everything that you think is necessary to optimize this engine/website and get it on track to start making theoretical money" / "8-15 leg H+R+RBI etc as one or more of the fun tickets daily" / "I dont want to change that $25 fun money hypothetical per day". Dated rule set `CORE_RULES` (`src/lib/paper-mode.ts`, since 2026-09-03; the diagnosis figures live in its comment block): market shrink w=0.5 (`src/lib/shrink.ts`, raw numbers kept as probRaw/czEvRaw/bsEvRaw), ≤2 legs, dec ≤2.6, $25 per-ticket ceiling (cap-respecting residue top-up, `capResidue` stamped), forced pass by true probability at ≤1.75, H+R+RBI overs out of core (`blockedReasons.hrr_over_suspended`), and a $10 8–12 leg H+R+RBI/Hits ladder inside the unchanged $25 fun (`buildFunLadderTicket`, `fun_ladder`). Tests: `tests/shrink.test.ts`, `tests/fun-ladder.test.ts`, `tests/lock-card.test.ts` (INSTRUCTION 18 block; two pins updated with dated notes), `tests/paper-epoch.test.ts` (source-scan pins updated). Full write-up in `docs/session-handoff.md` under INSTRUCTION 18. Paper-era change: split the record at 2026-09-03.
