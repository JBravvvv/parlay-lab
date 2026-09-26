# 2026-09-25 — mobile pick presentation

Implemented the eight screenshot requests in Parlay Lab: smaller Games cards, Top Edges paging, compact generator and generated-parlay controls, relocated category rail, stronger individual pick colors, tighter Ledger, restored full Card tickets, and solid safe-area header. See the September 25 session-handoff entry for scope and populated preview results. Production build and TypeScript PASS. Full serial suite: 3,559/3,666 pass, 107 pre-existing failures; same-environment upstream baseline has 112 failures and the test-name comparison found zero newly failing checks. Focused release checks: 78/78 PASS. Phone widths 375/390 and desktop 1280 passed overflow review. A 59px top inset was simulated; physical iPhone standalone behavior still needs device review. Deployment evidence is recorded in the external release-verification.json so the final deployed SHA can be verified without a self-referential commit. The handoff exporter consumes that receipt only when its SHA matches the exported HEAD and both Vercel Ready and the public version match are verified.

## September 19 — manual refresh follow-through

Follow-up to the three-book refresh request: authenticated NFL/CFB manual refresh now also retries events that previously returned zero props. They may have newly posted markets or prices at any of the three sportsbooks; a cached empty result must not hide those on a manual refresh. Passive page loads retain their empty-event cache. Integration test now asserts every selected event is fetched, including previously empty games. Application release 9a6551fb9171f5ff82dbe4b72c35e805702de870 was Vercel Ready; final follow-up receipt will identify the new HEAD. Follow-up validation: 159/159 tests across six pricing/refresh suites PASS; production build including TypeScript PASS; git diff --check PASS.

Production refresh at 9a6551f: NFL 2026-09-20 fetched 14/14 events, 4,012 rows, all ten markets; quote counts DK 3,577 / Caesars 1,547 / FD 3,100. Confirmed actual Ja'Marr Chase 6+–10+ (and wider) reception ladder prices. CFB 2026-09-19 fetched 8/8 live games and 356 rows including the four new markets; quote counts DK 317 / Caesars 2 / FD 69 (coverage differences are genuine feed availability). This exposed retained First TD quotes in already-live games: final follow-up restricts First TD to pregame and suppresses cached First TD grading after kickoff, since boxscore totals cannot establish scoring order. Other added ladders retain live support. No live First TD availability claimed.

## September 19 — football ladders, scorer markets, pick borders, and three-book refresh

Owner requested Receptions → Receptions O/U, alternate receptions (6+, 7+, etc.), alternate passing TDs (2+, 3+, etc.), First TD and 2+ scoring TDs; clearer compact pick borders; every refresh must support DraftKings, Caesars and FanDuel grading without fetching again when switching books.

Implemented shared NFL/CFB market contracts and query keys for player_receptions_alternate, player_pass_tds_alternate, player_1st_td, player_tds_over. Every available ladder threshold retains a separate row/key and all book quotes. Half-point overs render as X+; explicit X+ outcomes normalize to X-.5; literal integer Over thresholds remain literal (do not guess an undocumented milestone convention). Standard O/U markets retain existing parsing. TD-count rows below 2+ are omitted because Anytime TD already covers that request. No First TD/TD-count price is inferred from Anytime TD. New categories flow through Board, Builder, Every Pick Today and cross-sport discovery. Season/live-stat mappings cover reception/pass-TD/TD-count ladders; First TD is never inferred from ordinary boxscore TD totals. Generator forbids mutually exclusive First TD scorers from one game, even when same-game picks are allowed, including locks and payout repair.

Probabilities are market estimates, not calibrated player predictions. Paired odds use proportional de-vig. One-sided scorer/ladder rows use the existing disclosed 1.08 assumed overround and still require the configured minBooks; rows carry assumedHold and UI explains the assumption. Missing book prices or insufficient same-line consensus remain unavailable/ungraded. No fabricated odds or probabilities; do not claim every sportsbook offers every player/threshold. Provider contract verified against https://the-odds-api.com/sports-odds-data/betting-markets.html and https://the-odds-api.com/sports/nfl-odds.html; no paid direct Odds API probes were made.

Refresh uses the US-region multi-book feed (already includes DraftKings, williamhill_us/Caesars, FanDuel), storing all returned quotes. Book selection reprices locally from that refreshed snapshot. Fixed football default-book fast path that could expose median-line probability against a different DK line; always resolves that book's line-specific probability and label. Fixed MLB live-market overlay book-price projection and reinstated per-book capped quarter-Kelly display (existing 25% Kelly/2% cap) when switching away from default. Paper allocator and locked tickets unchanged. Added compact 1px stronger borders for generated/ranked/football prop rows and player table separators without added gaps.

Validation: production build including TypeScript PASS; full suite 3,635 passed / 2 failed out of 3,637 across 237 files. Both failures were obsolete six-market assertions (CFB route URL and props UI labels), updated to the new contract. Final rerun of those suites plus ladder, sportsbook, MLB live phases and handoff guards: 145/145 PASS. Earlier corrected CFB pick UI rerun: 106/106 across three suites PASS. No full-suite rerun after those test-only corrections. Regression coverage includes rung/threshold isolation, all three books and round trips, missing quotes, default-book line mismatch, First TD conflicts, live MLB switching and Kelly. Exact production receipt follows in the external handoff release-verification.json. Chrome was unavailable in previous session; no browser interaction/visual verification claimed here. Prior intermittent production hydration warning remains unresolved.

## September 19 — Every Pick Today filter/readability update

Owner request: checkboxes on the right, white bold "Select All" (capital A), close dropdowns when clicking anywhere outside, and bolder text across the page. Shared MultiSelect now puts labels left and checkboxes right, keeps multi-selection open, and closes on outside pointer/touch, focus leaving, or Escape (restoring summary focus when appropriate). Event listeners clean up on unmount. Parlay Builder / Every Pick Today uses 700-weight text and brighter muted/matchup/time text. Selection, odds, grading, and generator math are unchanged. Validation: production build (including TypeScript) PASS, 80/80 tests across ranked picks, generator UI, and discovery release suites PASS; git diff --check PASS. Existing checkbox/capitalization assertions updated to the requested design. Production deployment receipt is written to the handoff folder release-verification.json after push; no browser interaction verification claimed (Chrome unavailable in the preceding session).

## September 19 — requested desktop/mobile layout refinement

Owner requested eight visual fixes after viewing Chrome on MacBook: smaller football card boxes and prices; shorter page headers; smaller simulator cards; desktop generator settings beside ticket with actions below; minimal mobile preamble; MLB Stats portraits zoomed out 30%; other portraits zoomed in 30%; bolder readable typography.

Implemented shared compact headers with collapsed descriptions and visible supplied freshness status; 20px featured odds; 16px stat tile figures; compact locked-card status; three-column wide football simulator, 22px MLB run figures and 96px chart; generator two columns at 768px container width, full-width actions below, browsing controls after generator; stronger weights/contrast and scoped photo crops preserving logos/fallbacks. No pricing, simulation, probability, stake, generation, history, or filter calculations changed.

Chrome browser control unavailable in this session; no browser visual verification claimed. Requested optional permission for in-app browser. TypeScript and production build passed. Affected layout/portrait suites: 170/170 PASS after updating six old layout assertions. Generator/history/setup/stats suites: 67/67 PASS after updating the obsolete navigation-order assertion. Total affected suites: 237/237 PASS across 11 files. Production build passed. Application release e85649d5b5e8ff65ae9a52bc215a6afcd96199e8 deployed as parlay-jxdbgkkef, Vercel Ready/production; public /api/version matched exactly. This verification-only commit follows it. Prior intermittent production hydration warning remains unresolved.

# Progress — September 19 (daily credit ceilings removed; compact UI verified)

Owner upgraded to 100,000 monthly credits and requested no daily application credit caps. Removed CFB/NFL/MLB live caps and MLB daily generation ceiling; preserved usage accounting and authentication. Authenticated MLB manual refresh ignores quote-age reuse, covers the selected live slate beyond the measurement probe, and can retry after an earlier provider 429. UI credit labels show usage without a daily denominator.

Compact now halves vertical card padding and grid/stack gaps, joins sportsbook and density controls into one row, and hides repeated mobile labels. Built-app 375px NFL Parlay Builder heading moved from y=171 to y=111 (60px recovered); both controls remain 36px tall. Desktop Board heading moved from y=124 to y=77. No horizontal overflow at either width; built-app console was clean on the checked pages. Production sweep covered the major sport views, restored MLB split filters, ballpark controls, and NFL/CFB simulator isolation. An intermittent React hydration warning recurred once on the released site. Pages recovered; repeated local production/development and saved-sport reloads did not reproduce it. Cause remains unresolved and the sweep is not claimed error-free.

Validation: TypeScript PASS; production build PASS (/private/tmp/pl-unlimited-build.log); full serial regression run 3,623 passed with three stale UI text/layout assertions failing out of 3,626 (/private/tmp/pl-unlimited-full.log). Updated those three expectations and reran all four affected UI/manual-refresh suites: 156/156 PASS (/private/tmp/pl-unlimited-followup.log). The full 17-minute suite was not repeated after assertion-only fixes. Handoff exporter tests: 3/3 PASS. No engine pricing changes. Deployed application dfcb1fb2fb3ff054a9dd65cf318445b98013a017 at parlay-asqy7c9ck (Ready/production), with exact public /api/version match. Authenticated CFB refresh completed at 6:46 PM PT; board displayed fresh props and remaining quota 97,647. The subsequent paper refill correctly reported its existing $250 core/$25 fun allocation was already full. Corrected stale help text that described manual refresh as free; follow-up refresh/UI tests 56/56 PASS. Handoff state carries the application receipt.

# Progress — 2026-09-19 (verified handoff before compaction)

Josh requires a complete handoff after every update and especially before compaction. Added a forced-sync/wait/verify checkpoint to canonical session instructions and the generated orientation. Fixed content fingerprinting, new-file inclusion in dirty snapshots, history-bundle currency and archive failure reporting. Corrected stale orientation facts to the current DraftKings default and MLB $350 daily core. Application remains the verified September 19 release; no app or betting behavior changed in this checkpoint. Validation: shell syntax and diff checks passed; three persisted Python backup tests passed (new/deleted/ignored files, same-size/restored-time edits, tar and symlink preservation), and 21 documentation/reference checks passed.

# Progress — 2026-09-19 (remaining discovery, live context and research release)

- Completed the second-session implementation requested by Josh: shared multiselect discovery, cross-sport stored-board candidates and slip payloads, market-relative parlay strategies, live quote freshness and stat progress, restored Stats splits, ballpark grade/order/evidence/pick previews, signed mobile price fields and density choices.
- Browser validation used a clearly labeled temporary captured-fixture page, removed before release. At phone size, locks, seven-level history, forward, exclusions and slip Add passed; no horizontal overflow at phone/desktop widths. Exact vertical option halves the same content from 3,745.65625 to 1,872.828125 pixels with width unchanged. Compact preserves normal text/portrait proportions and is the default.
- No new odds purchases, automated-paper policy changes, ledger writes or simulation changes. Live suggestions require posted recent quotes; missing data is not fabricated. Park explanations use actual environmental factors, without invented pitch-zone claims. Same-game estimates remain labeled as unmodeled correlation.
- TypeScript and the full serial suite passed: 3,621 tests across 235 files. Production verified: e041774b682752c289ad4c4f3cfceeae86cf68a7, Vercel parlay-kok17lxiu Ready/production, exact public version match. Concurrent context update preserved; new umpire crossing recorded with freeze intact. Post-rebase audit/docs 23 passed; final wording/UI checks 83 passed. Implementation details and limits: `september-19-phases.md`.

## 2026-09-19 — phased generator update, Phase 1 (deployed)

Probability visibility and sort, player matchup/time, compact leg/lock/game controls, actions below picks, mixed timing as an allowed union, 0–80% MLB historical hit floor, signed-keyboard odds entry, multi-select markets and hourly Pacific start windows on generator/Every Pick Today. No auto-card pricing, paper-budget or fetch-budget changes. Remaining phase map and validation boundaries: `docs/september-19-phases.md`. TypeScript passed; full serial suite 3598/3598 across 234 files passed; production build passed. Deployed: 7ee44f2 → parlay-yzb99bcwj, Ready/production; public /api/version confirmed the exact commit. Populated NFL mobile ticket, lock/regenerate, probability sort and no horizontal overflow verified on production.

# Progress — 2026-09-19 (1H bets on NFL & CFB: first-half ML / spread / total on both football desks)

- Josh: "1H bets should be included on NFL & CFB".
- **The pull:** the three first-half markets (`h2h_h1`, `spreads_h1`, `totals_h1`) ride the per-event props call on both leagues — `CFB_PROPS_ODDS_MARKETS` and both `feeds.oddsPropMarkets` carry them after the six player markets. No new pull, no new pass, no budget or reserve change; the nominal cost is +3 credits per priced event only when the books return a first-half market (an empty market costs nothing).
- **The model (`src/lib/cfb/h1.ts`, `src/lib/cfb/markets.ts`):** `parseH1` reads an event's 1H books with the full game's own reader (`readBooksOf` under the half's σ, `H1_SIGMA_SCALE = 1/√2`, the same Pinnacle-weighted median at `minBooks 2`); `pHome` blends the 1H moneyline and the spread-implied chance at the league's own weights, with no FPI term (FPI rates the whole game). The set is stored beside the board under `<board prefix><date>:h1` (`propsStore.readH1/writeH1`, board retention), carried for games a pass does not re-pull exactly like the stored prop rows.
- **The slate:** both slate routes read the stored set and `attachH1` joins up to six rows per game (`|ml_1h|`, `|spread_1h|`, `|total_1h|` × side), built by `sideRow` — the same code that prices every full-game side (EV at the settle book, ¼-Kelly, playable while the kickoff is ahead). Labels "1H Indiana -3.5" / "1H Over 27.5"; `model.h1` holds the half's consensus; `rowProbAt` prices a 1H side off it and returns null without one.
- **Where they show:** the Board's three new categories (1H ML / 1H SPREAD / 1H TOTAL — 13 pregame parlay categories now) and three new parlay sets; the every-pick list; the ranked list's chips; the game card and the sandbox grid as two more rows under a "1H" tag (only when a book posted the half, with the half-time score once ESPN posts it); the slip and ticket wording via `marketWord`; the Sharp panel's "1H lines · N games" pill. One leg per market per game counts the half with the full game (no FG spread + 1H spread stack).
- **Grading:** a 1H leg settles on ESPN's half-time score (`linescores` periods 1 + 2, on the game as `homeH1/awayH1/h1Final`; `finalsOf` carries `h1` beside the final only when both quarters exist). It settles the moment the half is over — halftime, end of Q2, any later period, or final — even while the game is live; pending with an honest detail ("no first-half score yet", "first half in progress", "first-half score unavailable") until then. Full-game legs grade byte-identically.
- **Not changed:** the auto paper card stays full-game only (`card.ts` excludes 1H rows) — Josh's call whether the half ever enters the locked card; budgets, reserves, refresh slots, plans and spend untouched; the public splits feed carries full-game sides only, so a 1H row shows no bet%/money% chip.
- **Proof:** `tests/cfb-h1.test.ts` (new) — the market vocabulary, `parseH1` on an invented three-book event (margin exactly 3.5, EV +2.5 % at +105, −4.55 % at −110), `attachH1` (six rows, full-game rows byte-identical, idempotent, playable flips after kickoff), the half off the 2026-08-22 NFL finals fixture (Lions 7–7 Commanders at the half) plus synthesized halftime / Q2 / Q1 / Q3 statuses, `gradeCfbLeg` on every 1H state, `legFits`, the pick categories, the three 1H parlay sets, the store round-trip, the feed literal, and source pins on every surface. Pins updated in cfb-props, nfl-props-route, cfb-props-route, cfb-picks-ui (13 pregame categories), nfl-engine (finals carry `h1`), cfb-picks (1H sets empty on a slate without first-half lines).
- Deployed: commit 9c048d8 → Vercel parlay-2e1olviq3 (Ready, production), aliased to https://parlay-lab-six.vercel.app; full serial gate 233 files / 3592 tests, exit 0 (scratchpad `gate-2026-09-19-h1b.log`).

# Progress — 2026-09-19 (desktop density: nothing scrolls sideways from md, every box shrunk vertically)

- Josh: "On the web version of builder tab & every other tab, boxes need to be shrunk. the way you put the daily board on a horizontal scroll with no scroll is embarrassing & unacceptable. It all goes vertical & every box shrunk vertically"
- **Measured first** (production alias, 1280px and 1100px, DOM-only headless Chrome, no screenshots): the football Builder's ticket `.carousel` was 3,508px in a 1,003px box with the scrollbar hidden; the football Board's TOP EDGES carousel 2,324px in 1,005px and its category chip-row 1,166px; the `/props` game chips 3,058–4,154px in 504px; the Games date rail 2,350px in 1,005px; the Calc chips 839px in 531px; at 1,100px the MLB Board table itself 843px in 812px.
- **It all goes vertical from `md`:** `globals.css` min-width:768px block wraps `.chip-row` and `.carousel` into rows (phone base rules untouched); `DataTable` has no height cap / no overflow from `md` (`--dt-max-h` only below), text cells `md:whitespace-normal`, fit/numeric nowrap, rows `md:py-1`; `CfbBuilder` TicketStack is a 1/2/3-column grid (the md+ carousel is gone); `CfbPicksBoard` featured cards fill thirds, the parlay filter strip wraps, the desktop parlay grid is three-up at `xl`; `DateRail`, `GenSheet` chip rows and `RankedPicks` tabs wrap from `md`.
- **Every box shrunk (sm/md):** Panel `p-4` + `py-2` header; PageHeader `mb-4`, sub `mt-1`, `--text-display` capped at 36px; StatTile 20px figure + 8×12px padding from md; SportsbookSelector `py-1.5` + 36px select; PaperBanner `py-1.5`; Pill `sm:py-1.5`; main `md:pt-4 md:pb-8`; generator slots 44px from sm. Per tab: Board notes `mb-3`, parlays `mt-5` two-up/three-up `gap-2`; Builder `space-y-3`, seven grids three-up at xl, fun divider `mt-4/pt-3`, manual slip `mt-4`, one-line ticket cards; football Board `space-y-3`, 36px search + 32px pills from md, parlays `mt-5`; football desk 36px search; Games `gap-2`; Stats `mb-3`/`mt-4`; Ledger `space-y-4`, 22px figures, `gap-3`, shorter charts; Sharp ×3 `glass px-4 py-3`, `space-y-3`; Simulator/Settings `space-y-3`; Calc `gap-3`/`lg:gap-4`, hero `px-4 pb-4 pt-3`; Ballpark `py-2`.
- **Not changed:** budgets, refresh slots, Odds API rails, plans; the expanded MLB game boxes (`min-w-max` innings tables) and the Stats/player-sheet `min-w-[…px]` tables, which fit their desktop containers.
- Tests: `tests/desktop-density.test.ts` (new, 13); pins updated in `board-compact`, `mobile-density`, `cfb-picks-ui`, `cfb-props-ui`, `games`, `cfb-card-ui`, `cfb-builder-ui`. Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-19 (ranked list: odds range + price sort; football props routes get a duration ceiling and a visible error)

- Josh: "Need to be able to sort 'Every pick today' underneath parlay builder by odds for example I should be able to go in under the CFB Anytime TD filter and then filter between -200 to +250 for players or whatever other odds I want" and "Prop bets are not loading for CFP games that start in 6 hours 15 minutes. NFL & CFB games … should have all grades up/available on parlay lab as soon as they're available at the books. CFB prop lines are usually available tuesday and NFL prop lines usually available wednesday/thursday".
- **Ranked list** (`src/components/props/RankedPicks.tsx`, every desk): an Odds row under the market chips — min/max American-price fields (`AmField`, `parseAmerican`-gated, empty = open bound, `aria-invalid` on junk) and a sort select (`RANKED_SORTS`: Grade S → F / Shortest price first / Longest price first). `inOddsRange` compares numerically (−200 < −150 < +100 < +250); chip counts follow the range; the header names range and sort; × clears; empty-in-range text "No pick is priced … — widen the odds range."; "Still pricing this slate" note while loading with rows on screen. Own-state with optional `range/onRange`, `sort/onSort`; neither mount passes them.
- **Props not loading**: at 02:47 PDT the stored CFB board carried the six-hour-out games (pricedAt 02:42, Josh's retry). Cause: both football props routes had no `maxDuration` (platform default) while a cold pull is ≤60 events at concurrency 4; the ranked view showed sides and silently no props on a props error. Shipped: `export const maxDuration = 300;` on `app/api/cfb/props/route.ts` + `app/api/nfl/props/route.ts`; `CfbProps` ranked view shows "Player props did not load — …" with Retry (`propsQ.refetch()`) while `propsQ.isError`.
- **Reported, NOT changed** (Josh's decisions): Odds API account 843/20,000 credits left; the 60-event CFB cap cut 8 late Saturday games (68 would cost ≈+248/day); a scheduled Tuesday/Wednesday warm-up ≈1,860 CFB + 496 NFL credits/day — on-demand next-date pricing already exists via `useDeskOf` + `slateDates`; ASU @ Kansas and WVU @ Virginia had no odds event at pull time.
- Tests: `tests/ranked-picks.test.ts` (+9), `tests/football-props-duration.test.ts` (new, 4), `tests/nfl-props-route.test.ts` + `tests/cfb-props.test.ts` export-count pins (two exports). Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-19 (board refresh: football full re-pull + "updated" stamp, MLB full refresh on every tap, installed-app self-update)

- Josh: "The CFB & NFL boards should function the same way as the MLB one does. It should show the time of last board refresh. MLB should also do a FULL refresh every single time i refresh." And after the phone-density release: "it doesn't seem like you resized ANYTHING on the iOS add to home screen version i have on my phone" — prod served the new build; the installed app was still on the page it loaded before the deploy.
- **Football** (`/api/cfb`, `/api/nfl`, `src/lib/server/football-props.ts`): `?refresh=1` WITH the sync phrase (header `x-pl-sync`, never the URL) is a FULL re-pull — odds cache bypassed on the slate, fresh-board rail skipped, every selected game with rows re-priced now with the per-event cache bypassed, answer stored, `refreshed: true`. Budget rails untouched; the EMPTY-EVENT RULE is the one carry kept; the flag is ignored without the phrase. `CfbRefreshPill` re-pulls every ACTIVE slate + props query (`forceRefreshLeagueBoard`) then the refill pass; note "board re-pulled h:mm". `CfbBoardStamp`/`NflBoardStamp` print "updated h:mm" from the newest ACTIVE board (props `generatedAt`, else slate) — desktop appended, phone the whole sub in the MLB shape.
- **MLB** (`src/lib/mlb/live-board-client.ts`, `app/api/generate/route.ts`, `app/board/page.tsx`): every tap fetches `/api/generate?live=1&force=1`; `manualReprice = force && boardOnly` is outside the 45-min limiter and the run cap, tallied under `pl:gen:manual:<date>`, never counted against the card ladder, `K_LASTGEN` untouched, card untouched by construction. The stored board is adopted on the device (`adoptServerBoard`) BEFORE the invalidation so `bestBoard()` cannot keep the older cached board. `refillRepricedBoard` is the one early return; the browser re-price is the forced pass's fallback. "ran recently" branch gone.
- **Self-update**: `NEXT_PUBLIC_BUILD_SHA` (next.config env) vs `/api/version` in `SwRegister`, on open and on every foreground; reload once per new build. This one time the phone app needs a force-quit + reopen.
- **Cost**: MLB 114–150 credits per tap, unlimited taps; CFB up to 1,860 credits per full refresh under the 2,500 rail (372 live reserve); NFL 16 events under the 1,000 rail (248 reserve). No spend without the phrase.
- Tests: `tests/board-refresh-full.test.ts` (new, 17 — behavioural props-route refresh on fixtures, stamp over a seeded QueryClient, SSR renders, version route, source pins); live-board-only, board-refresh, board-settled, cfb-picks-ui, cfb-props, calibration-window, refill-helper re-pinned. Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-19 (phone density pass for the home-screen app)

- Josh, with eight iPhone screenshots: "The mobile version that is added to home screen is not optimized for iPhone whatsoever … The top header fades away; the 4 icons other than settings … need to be a dropdown … only 7 players show on main view because filters box is so unbelievably big … Selection for picks is a horizontal scroll bar when it could be a dropdown … the pick boxes are so unbelievably big. They can be shrunk by 70% vertically … & the info can become expandable … It should be stuck in portrait mode at all times."
- **Rule**: mobile-first Tailwind — the phone shape is the default, `sm:` (640px) restores yesterday's desktop shape; desktop unchanged. Phone-only copy/folds use `sm:hidden` / `hidden sm:inline` spans and `${open ? … : "hidden"} sm:contents` wrappers (server render has no duplicate content).
- **Header**: four non-tab icons → one ⋯ More `role="menu"` popover (`MORE` derives from `NAV` minus tabs and `/settings`); Settings keeps its gear; ground `bg-bg/92`; popover is absolute so the measured header height is unchanged.
- **Portrait**: manifest `"orientation": "portrait"` + guarded `screen.orientation.lock("portrait")` in standalone + CSS-only `.rotate-lock` sheet under `(display-mode: standalone) and (orientation: landscape) and (max-height: 500px)`. iOS ignores the manifest and the API — the sheet is the iPhone behaviour; Android locks for real.
- **Stats**: chips in one strip; selects + Min slider behind a Filters ▾ button. **Board**: market pills → native `<select>` on the phone (shared `marketKeys`/`marketLabel`/`marketCount`); `#` column `hideBelowSm` (new `DataTable` flag). **Builder**: one-line tickets with a ▾ drawer (`ticket-detail-toggle`), refused list folds (`blocked-toggle`), grids `gap-2`. **Generator**: slot 52 → 36px, hero hidden, buttons 40/32px. **Shared**: Panel, Pill, PageHeader (`subMobile`), PaperBanner, SportsbookSelector a size down.
- Tests: `tests/mobile-density.test.ts` (new, 30); `tests/nav.test.ts` rewritten for the More menu (press count 4). Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-18 (late evening: one leg per team in the parlay generator)

- Josh: "Add filter on parlay generator alongside 'Two legs from one game' that says 'Two legs from one team' so i can prevent a 3 teamer from having 2 players from same team".
- **Rule** (`GenSpec.onePerTeam`, src/lib/parlay-gen.ts): at most one leg per folded team tag; untagged legs never blocked; undefined = off (recipes and pinned fixtures keep their exact tickets and seeds), both desks default ON, the user relaxes it from the sheet. Enforced in seating, the price lookahead, the mixed/spread checks, payout repair, pinned conflicts (`same-team`), and an exact `capacity` (club = the seat-owning node under R2b; doubleheader lookahead arms on a club spanning two games).
- **Relax hint**: `same-game` first when the game switch (alone or with the team switch) would fit; `same-team` when it is the one binding. Ticket carries `sameTeam`; the sheet says so.
- **Sheet**: "Two legs from one team" Toggle under "Two legs from one game" (Advanced); "Allow two legs from one team" one-tap fix; pin-conflict copy for the team.
- Tests: `tests/parlay-gen-team.test.ts` (new, 17), football-gen +4 (untagged legs never blocked; two tagged clubs), parlay-gen-setup +1. Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-18 (evening: live HR parlays, HR line rule, rail-driven ranked list, compact generator)

- Josh: "Why won't it generate parlays right now for HRs? There are a ton of HR live props on the board and just starting… I refreshed the board as well from 5:00pm last refresh to 7:03pm"; the ranked list "not sorting by filter type"; "no HR bets shown EVER should be over 1.5 HR unless its a live bet in which the player already has 1 HR live OR it is a manual filter"; "compact the UI on the parlay generator. If we have to do dropdowns etc … so be it".
- **Why**: only the authenticated live-props overlay ever produced a live leg; the board's own `live:true` rows (9 games, 81 HR rows at 7:02pm) were dropped by `marketPhaseBoard` + the pool builder's `quoteAt` gate. Mixed saw one upcoming game and zero live legs → `phase-empty`.
- **Live fallback** (`src/lib/mlb/market-board.ts`): a `live:true` row with a settle-book `bookQuotes[*].at` inside the 30-minute gate is a live leg (`quoteAt` stamped, `pO` nulled, `fO` kept); overlay wins when present; `live:false` started games stay out. `phase-empty` carries `{pregame, live}` and the sheet names the missing side + last refresh time.
- **Ranked list**: chips verified working on prod (DOM-only CDP: NFL Spread 28 rows, MLB RL 33); the rail and the generator's category taps now drive the list (`RankedPicks` controlled `filter`/`onFilter`, `rankedKeyOf`); ranked pool over "mixed" so a started slate is not "HR 0".
- **HR line rule**: `hrLineAllowed` / `pruneHrLines` — O1.5+ only live with the homer in the book (statsapi tally) or under the browse-only "Show O1.5 HR" chip (`hr-alt-filter`); Board ALL scope filtered too.
- **Generator compaction**: one-line hero, Legs/Sides/Timing selects, hit floor + window selects, tooltips instead of paragraphs, Save/Load under Advanced.
- Tests: `tests/hr-line-rule.test.ts` (new); `mlb-market-phases`, `parlay-gen-ui`, `ranked-picks` extended/re-pinned. Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-18 (cerulean on graphite, compact Board grade column, prop market lean)

- Josh's three items: bet % / money % on player props "somehow"; the Board grade column must not force a horizontal scroll, explanations individually expandable; theme to Cerulean Blue on a greyer-than-black background ("less like a cosmic bowling screen").
- **Prop lean** (`src/lib/prop-lean.ts`, `LeanChip`): no book publishes ticket/handle splits on props, so every priced prop shows the price-implied market lean (de-vigged two-way price at DK) — "56% O · 44% U lean" on browse rows, "56% lean" on a sided pick — labelled as price-implied, never as a bet count. On MLB Props/Board, football Props/Board, and the ranked prop picks on every desk (`RankedPick.splits`); `GenLeg.lean` stamped by both pools.
- **Board width**: `DataTable` `Column.fit` + `headerTitle`, px-2 cells, fit grade/fair/book/best/EV/Kelly columns, capped Pick cell; `SettledGrade` explanation behind a per-row "why ▾" toggle (the nowrap sentence was the >400px column); `LiveGrade` market branch compact with the explanation in `title`.
- **Theme**: `globals.css` retinted end to end (token names kept): graphite `hsl(216 9% 13%)` base, cerulean `#3ab0e8` pos/brand, blues `#1565a8/#1f8fd4/#5cc4f2`, lavender live, gold + NFL/CFB accents unchanged, all pink rgba/glass/aurora/glow/gen-studio retinted; manifest + theme-color `#1e2126`; llama footage hue-rotated to blue under a 62% scrim; Board tab periwinkle.
- Tests: `tests/prop-lean.test.ts`, `tests/board-compact.test.ts`, `tests/theme-cerulean.test.ts` (new); `nav`, `prop-hit-rate` re-pinned. Full serial gate before push (see `tools/handoff-state.env`).

# Progress — 2026-09-18 (eight-item UI pass: NFL first, splits, ranked S→F, generator reorder)

- Josh's eight items with 15 desktop/Caesars screenshots: sport order NFL/CFB/MLB; the logo must never open the landing; bet % / money % on every pick; logos visible (no black disc), headshots on Stats; grades on every Games pick; Board/Builder pick boxes half the height; generator stacked (filters above, ticket below) with numbered, drag-reorderable, lock-in slots; a ranked S→F list of every pick for the day under the generator with category filters.
- **Order + logo**: `SPORTS = ["nfl","cfb","mlb"]`; `Brand` links `/games` (replace).
- **Splits** (`src/lib/splits.ts`, `/api/splits`, `useSplits`, `SplitsChip`): public scoresandodds consensus page per league (nfl / mlb / ncaaf), 10-min server cache, always 200; chip on football Games/Board/Builder/ledger tickets and MLB Games/Board/Props/Builder ML-RL rows. No public source carries player-prop splits, so prop rows have none; a side with no match shows nothing.
- **Marks**: `TeamMark`/`PlayerMark` draw the logo raw (no dark disc/ring); Stats rows carry 24px headshots (MLB statsapi image host, ESPN combiner for NFL/CFB, initials fallback).
- **Grades**: every `OddsGrid` cell (football Games) shows its tier badge; MLB Games ML rows show a GradeChip (RL/total absent from the games payload).
- **Compaction**: `DataTable` px-2.5 py-1.5; `TicketCard`, `CfbTicketCard`, `FeaturedPick` legs single-line.
- **Generator**: `GenSheet` settings stacked over the ticket; numbered slots, "Lock in" buttons, HTML5 drag + ▲▼ reorder via `useParlayGen.reorder` (`applyOrder` keyed to the ticket; pins move with their leg; nothing re-rolls on a drag).
- **Ranked list**: `RankedPicks` + `RankedViewTabs` — the default view on `/props` on all three desks; S→F then EV; "All" + category chips with counts; 60 rows a page.
- Tests: `tests/splits.test.ts`, `tests/parlay-gen-reorder.test.ts`, `tests/ranked-picks.test.ts` (new); `nav`, `parlay-gen-ui`, `cfb-props-ui` re-pinned. Headless-Chrome DevTools smoke over every page × desk: no console errors.

Validation: TypeScript passes; full serial vitest gate recorded in `tools/handoff-state.env` (GATE_TESTS).

# Progress — 2026-09-18 (UI overhaul: generator customization, hit-rate analytics, Caesars-tight chips)

- Josh's five items: more generator customization without the mix presets, a smaller exclude control, DK always (no option), stats/hit-rate analytics on the generator and picks over the last 7/15/30/60/120 games, and a tighter, game-like layout after the Caesars/William Hill app (no screenshots came through; the known chip layout was followed).
- **Parlay generator** (`GenSheet` rewritten): Safer/Balanced mixes, Favorites/Even/Longshots presets, "Your mix" and the DraftKings-only toggle are gone. Chip rows: Legs · Categories (multi-select — one ticket can mix H+R+RBI, Hits, TB, HR, K's…) · Odds per leg (Min/Max + two-thumb slider over the board's real prices) · Hit-rate floor (Any/50/60/70/80%) with the window (L7…L120) · Sides · Games · Positions · Timing. Advanced: two legs from one game, started games, "Every category on the ticket at least once" (default on), Model-priced legs only. Saved setups are v2 (markets/spread/floor kept; games never saved; v1 recipes still load). Exclude is a 24px ghost ✕.
- **Generator core**: `GenSpec.markets/spread/minHit/games`; union pool across categories with `market/line/gameLabel` on each leg; spread rule seats every selected category; relax hints `hit`/`games`; seeds name the set. MLB adapter stamps each leg's hit rate from an optional `MlbHitSource`; football adapter filters on the set (no hit data there).
- **Hit rates** (free MLB statsapi, no Odds credit, no key): `src/lib/prop-hit-rate.ts` pure counting (AB for hitters, starts for pitchers; over strictly more, under strictly less), `POST /api/mlb/hit-rates` (2026 game logs by player name, 10-min cache), `useHitRates` + `useHitWindow` (localStorage `pl:props:hit-window`), `HitChip`/`HitDots` on Props rows, generator slots and Board picks; the search box carries a tap-to-cycle L7→L120 window button.
- **Readability**: muted/faint text lifted (72%/55%), glass surfaces 88%, backdrop scrim 55%, rail chips 28px, generator studio retinted pink.
- Tests: `tests/prop-hit-rate.test.ts`, `tests/parlay-gen-multi.test.ts` (new); `parlay-gen-ui`, `parlay-gen-setup`, `football-gen` re-pinned.

Validation: TypeScript passes; full serial vitest gate recorded in `tools/handoff-state.env` (GATE_TESTS).

# Progress — 2026-09-18 (brand goes pink to match the llama)

- Josh: "I was saying the whole website should match the new color of the background. it was green with the green llama." The whole theme is retinted from electric green to hot pink: surfaces hue 160 → 330 (`--color-bg` … `--color-line-2`), `--color-pos` #b6ff3d → #ff5fb8, the brand gradient teal→green→lime → violet→magenta→hot pink (`--color-acc-*` token NAMES kept — classes and tests key on them), every lime rgba glow/glint/ev-glow/stat-tile shadow in globals.css, `Glow` pos halo, MarketNav ring, landing MLB ring, the Board tab tone (#FF5FB8) and Ballpark Factor tone (#F9A8D4), PWA theme/background colour #040b09 → #0b0408 (manifest + layout), and the three app icons recoloured (hue-shifted in place via ffmpeg; green originals kept in the session scratchpad). Red-orange −EV, gold, ice-blue live, CFB amber and NFL blue are untouched.

# Progress — 2026-09-18 (backdrop back to the footage's original pink)

- Josh: "Bring parlay lab background back to the original colors in this mp4. Pink instead of green for the most part." The `hue-rotate(120deg)` that recoloured `backdrop-llama.mp4` lime is removed from `VideoBackdrop` (no filter at all now); the CSS `.aurora` fallback under the video is retinted from green/teal to pink/rose so the loop gap and the no-autoplay still match the footage. No data or engine change.

# Progress — 2026-09-17 (MLB variety card + $350/day, INSTRUCTION 72)

- **Why**: since 2026-09-13 the MLB card was shape P (3×$50 two-leg, probability fill, ceiling 2.6) → hits parlays every day; rule 5 dropped every H+R+RBI-over leg; ML/RL only existed as 2-leg SAFER tickets; one single per pool.
- **$350/day from 2026-09-18**: `PAPER.daily` 350, `dailyBefore` 150, `paperDaily(date)` read by the lock card, refill, `/api/generate`, the ledger merge kernel (`deskPaperOf`, MLB by date) and the banner. 08-15..09-17 remain $150 records.
- **Shape V** (`VARIETY_SHAPE`, nine slots): $40 H+R+RBI 2-leg (only slot that admits an H+R+RBI-over ticket), $40 ML/RL 2-leg, 2×$50 2-leg, 2×$40 straight, $40 3-leg, $30 4–5 leg, $20 5–6 leg. Typed slots fill first; untyped slots prefer an unseated market type.
- **Straight bets**: `buildStraightPool` composes a 1-leg ticket from every priced pregame board row (ML/RL/Hits/TB/H+R+RBI/K's/Outs) so the allocator can seat them.
- `paperPolicy` `variety-action-v1`; pre-variety days re-fire unchanged (P / $150). No engine change.
- Tests: `tests/variety-core.test.ts` (new); `core-shapes`, `paper-epoch`, `paper-deficit`, `ledger-merge` re-pinned to `PAPER.dailyBefore` for historic days.

Validation: TypeScript passes; full serial vitest gate recorded in `tools/handoff-state.env` (GATE_TESTS).

# Progress — 2026-09-17 (Ballpark Factor, sort fix, marks on every pick, parlay variety)

INSTRUCTIONS 68–71, shipped together.

- **Ballpark Factor (68)**: `src/lib/mlb/ballpark.ts` (30 parks; temperature × wind mph × direction × elevation, roof-aware, clamped 0.8–1.25, split HR/H/TB). The legacy engine's `windNote` reads the `shParkDaily` hook when `SH_CFG.parkDaily` is armed (hits/TB paths read `wind.h`/`wind.tb`); all three generators arm it; unarmed = byte-identical blob. New MLB-only tab `/ballpark` (`app/api/mlb/ballpark/route.ts`) lists every park on the slate with the day's read. Engine string changed: `SERVED_ENGINE_SHA_VERIFIED` refreshed, `tests/served-verification.json` pending until the post-deploy re-grep.
- **Column sorting (69)**: `gradeSortKey` (letter band × 1000 + clamped EV, settled rows sink) on the Board's two Grade columns and the CFB board; `DataTable` `defaultSort` + `resetKey` (Board opens on Grade ▼ and resets on every scope/prop/live/book change); NaN sorts last.
- **Marks on every pick (70)**: `clubFromLabel` + `BoardLabel` draw a headshot + team badge for a player label and the club logo for a team label — Board stamped/ALL table, generated parlays, parlay generator sheet, ledger.
- **Parlay variety (71)**: `SH_CFG.parlayGameCap / parlayMore / parlayCap` in `buildParlaySet`, armed as 2 / 2 / 5 by `applyParlayVariety` (max two legs per game on a ticket, three times the ticket plan, five tickets per player); generated-parlays paging (24, +48, all); the Board's **My parlay** bar prices tapped legs with the engine's ticket arithmetic (odds × , true % ×, EV = true × dec − 1, fair) and names what it cannot model (same-game correlation) and what it left out (no price / no model %).
- Tests: `tests/ballpark.test.ts`, `tests/ballpark-engine.test.ts`, `tests/board-sort.test.ts`, `tests/pick-marks.test.ts`, `tests/parlay-variety.test.ts`, `tests/my-parlay.test.ts`; `tests/nav.test.ts` updated for the new tab.

Validation: TypeScript passes; full serial vitest gate recorded in `tools/handoff-state.env` (GATE_TESTS).

# Progress — 2026-09-17 (DraftKings settlement book)

INSTRUCTION 67: Josh asked for every grade, edge %, EV and Kelly stake to be computed at DraftKings instead of Caesars, with nothing else on the site changed.

- `SETTLE_BOOK = "draftkings"` (`src/lib/sportsbook/books.ts`) is now the one settlement constant. The legacy MLB engine's `CAESARS_KEY` variable is rebound to it by the facade on every `createEngine` call (engine-client, /api/generate, the scheduler), so the engine's `cz*` numbers, the Builder, the Board, the lock card and the paper ledger are DraftKings-priced. `shBasisPick` (selection) is untouched.
- Boards, rows, lock-card tickets and CLV pending legs carry a `settlementBook` stamp; anything without the stamp (pre-2026-09-17 caches and ledger entries) is treated as Caesars-priced. The client repricers (`priceMlbBoard`, `priceFootballRow/Prop`, `priceLiveBoard`) short-circuit on that stamp rather than on the default book, so a stale Caesars board is repriced at DraftKings from its quote index until the next refresh slot rebuilds it.
- CFB and NFL `settleBook` constants (model, props, live props), MLB live props, the sharp board, the UFC helper, the season lab default book and the offered-book scoping all flipped to DraftKings. The parlay generator's book-only toggle now reads "DraftKings-priced legs only" and follows the selected sportsbook. The selector's storage key changed (`pl_display_sportsbook_dk_v1`), so every device opens on DraftKings.
- Labels, notes and refusal strings that named Caesars as the settle book now name DraftKings (Board, Builder, Settings, Ledger, CLV panel, CFB/NFL lock notes, football props). Verbatim quotes of earlier instructions and the Caesars-app paste feature (All-Star) are unchanged.
- Tests: `tests/helpers/settle-book.ts` loads the hand-checked fixtures with the Caesars and DraftKings keys exchanged; the parlay-generator fixtures pass `pricingBook: "CZ"` because the captured pool predates this change; `docs/harness-substitutions.md` documents the `CAESARS_KEY` binding.
- Astra's uncommitted DraftKings pass was archived (never committed) in the handoff's `review-2026-09-17-draftkings/`.

Validation: TypeScript passes; full serial vitest gate recorded in `tools/handoff-state.env` (GATE_TESTS).

# Progress — 2026-09-16 (MLB live browsing and player exclusions)

Josh approved updating the superseded regression expectations, running validation and deploying, then requested a per-player exclusion checkbox for the generator.

- Board exposes all eight MLB prop categories, with a stored-board fallback for empty device props. RBI and Runs are requested in existing event pulls and added as browse quotes with exact-line book prices and market estimates. Model probability stays null for these new rows; automatic selection and locked paper records are unchanged.
- In-play opportunities use active-game status, individual quote timestamps, cleared-line suppression and selected-book prices. The MLB generator offers Pregame, Live and Mixed; Mixed requires both phases. Adding a timed ticket rechecks the current quote identity, price, probability, book and timestamp.
- MLB/NFL/CFB share an Exclude player checkbox. Checking it immediately regenerates without that player across lines/sides, clears their pins and keeps the exclusion through later spins. A visible checked list supports individual restore and Clear all. Changing generator filters or board/sport clears exclusions; saved setups do not persist them. Recalled tickets display exclusions and cannot be added until excluded players are restored or the ticket regenerated. Regeneration clears excluded pins restored by history.
- Existing live cadence and 600-credit daily budget remain. RBI/Runs add two estimated credits per event to sizing and fallback accounting; the board generation estimate is now 172. Updated six existing regression files only for the expanded market shape, estimates and relocated code, preserving budget and corruption guards.

Validation: TypeScript passes; all **3,278 tests across 211 files** pass in 266.12s. The full run was serial with no dev server or background edits. Production build result and deployment proof are recorded in the dated handoff review. Mobile synthetic QA at 375px verified exclusion of a kept player, continued exclusion across spins, individual restore, filter reset, history Add protection and regeneration after recall; 44px checkbox targets, no horizontal overflow or browser errors. The temporary QA route was removed. Upstream automated data refreshes were fast-forwarded before the gate. See handoff review-2026-09-16-mlb for logs and served-bundle proof.

## 2026-09-14 — Shared sportsbook pricing

Instruction 64 adds a persistent seven-book selector, default Caesars, across odds pages. NFL/CFB retain bookmaker-specific quotes and model probabilities at each line; MLB enriches board output with exact event/market/side/line quotes without altering the legacy model. Selected quotes drive EV, implied edge, grades and displayed parlay prices. Missing quotes stay unavailable. Locked paper tickets retain their original prices and selection policy. Live MLB quotes and UFC views follow the selection. Old cached football props with a different line remain ungraded until refreshed. Validation: TypeScript clean; all 3,267 tests in 209 files pass (the 16 corruption-wiring tests run separately to avoid document mutation races). Mobile selector is 44px tall and fits a 390px viewport; choice persists across navigation. Preserved the newer automated umpire update and recorded crossing 82 without changing its freeze. Final follow-up: 84 focused checks also pass after preserving the original all-books comparison quote; MLB Games uses only the selected moneyline, including Caesars by default. Production verified Emmett Johnson anytime TD: Caesars +650 / F / -7.4% EV to DraftKings +750 / A / +4.9% EV, same fair probability. Deployment proof is recorded in review-2026-09-14.

## 2026-09-13 — Broader paper action, sport routing and readable NFL text

Instructions 61–63 extend the active release. MLB from September 13 fills new paper slots by estimated hit probability at the existing 2.6 decimal ceiling; Kelly no longer under-sizes this experimental primary cohort. New days use a separate P shape: three $50 two-leg slots. Existing carried shapes/tickets remain immutable, and the historical rotating menu and disciplined alternate selection stay intact. A real engine fixture fills $150 and a second pass retains it exactly. Missing disjoint pairs still disclose an unfilled slot; prices, probabilities and results are not fabricated. CFB from September 14 uses the shared full-core policy for its $250 budget, with forced labels and distinct games. NFL prospective policy still starts September 20, with Week 1 isolated as replay.

Simulator previously mounted the MLB engine on every sport. NFL/CFB now mount a clearly identified football margin-model explorer and refresh only their own feed; no football Monte Carlo claim is made. Home now shows the selected football ledger/bank instead of MLB. Ledger mounts sport-specific views before MLB grading/import hooks. Season Lab refuses other sports with an explicit switch-to-CFB action. Board, Builder and Sharp also route before mounting their MLB hooks. Shared MLB board reads and regeneration are sport-gated, including a hydration guard; cached MLB data is masked on football, and Games waits for sport hydration. NFL text and hero/odds prices are bright neutral (#edf4ff); blue accents remain. Calculator is sport-independent by design; Games/Board/Props/Stats/Sharp already select the appropriate visible desk. Settings intentionally labels and separates each bank. Final validation: TypeScript clean; 3,249/3,249 tests across 208 files in 280.74s. Deployment proof follows in the dated review. Earlier, the earlier NFL-only full run had one public-schedule network failure (3,242 tests passed).

## 2026-09-13 — NFL Sunday full-allocation paper cohort and Week 1 replay

Instruction 60: Josh explicitly requires $350 core every Sunday even below the normal EV gate, plus a retrospective Week 1 card. Starting September 20, the NFL-only Sunday policy selects up to ten distinct-game singles by estimated EV, equal-weights the full budget, and marks tickets `sunday-full-v1`, forced, with their original edge-gate verdict. Thin slates may exceed the usual $50 per-ticket cap; absent prices and started games remain ineligible. Other dates and CFB retain existing rules. The automatic football core still evaluates game sides/totals, not generator props. Prospective cohort P/L and Brier accuracy appear on the NFL Ledger; no automatic NFL parameter fitting is claimed.

Week 1 replay: historical Odds API snapshot 2026-09-13T15:55:36Z, retrieved for 16:00Z, plus genuine ESPN scoreboard/FPI fixtures committed September 8 (10b6a63). No synthetic odds fixture is used in the replay. Fixed at ten $35 singles before reading outcomes; original fun card untouched. Stored once in an isolated replay key, actual recording timestamp, excluded from live bankroll/record. API derives grades from official scores on view; UI refreshes once a minute. Raw historical payload and its SHA-256 are retained in the dated review; the bundled replay carries provenance. Focused 94 tests passed; TypeScript clean. Final expanded release gate: 3,249/3,249 tests, TypeScript clean.

## 2026-09-13 — Roster Lab portraits and Parlay Studio presentation

Instructions 58–59: use Roster Lab's player portraits throughout prop picks, preserving the top-left team badge; make the generator more exciting and easier to use. Shared football/MLB player marks now resolve verified public ESPN roster identities through a small cached catalog. NFL adds Roster Lab's Sleeper fallback, joined by unique name/team/position rather than trusting cross-provider IDs. Scoped college rosters remain separate. Board labels, MLB prop rows and ledger legs now carry marks; football Board, prop rows, slips and tickets share resolution. No fantasy account, league credentials or Roster Lab private data is copied.

Generator presentation: opaque studio surface, compact hero, dice emblem/action, player cards, clear combined odds and a 280ms ticket reveal that respects reduced motion. Safer/Balanced controls, positions, pins, previous/next and filter recovery preserved. Shorter football-page subtitle reduces setup text. Local browser verification: correct headshots and team badges loaded on all four preview picks; 390px and 1280px layouts did not overflow; style selection, pin retention and history restoration worked. Real catalog checks: MLB 843 players (Aaron Judge ESPN portrait), scoped Alabama 100 players, NFL preview portraits resolved. Final release gate: TypeScript clean; 3,234/3,234 tests in 204 files, 204.11s. Deployment proof goes in the dated review artifact after publishing.

## 2026-09-13 — Generated ticket history, Board diversity and image recovery

Instruction 57: Previous/Next preserves exact generated tickets and settings through the current mounted session without a fixed depth limit. Regenerate after going back starts a new branch. Slip undo remains separate; recalled tickets disclose saved quotes. Board football sets now penalize repeated player exposure and cap a player at one third of requested slots (rounded up); category longshot subsets are checked separately. Rotated fill orders supply alternatives and thin pools return fewer tickets. The Board displays the most repeated player in the current filter. Roster metadata loads when the football generator opens and supplies verified headshot/team identity; marks fall back from headshot to team logo, then initials if imagery is unavailable. Failed image state follows the URL so later players recover.

Validation: browser fixture at 390×844 restored eight generations backward and forward exactly; new branch disabled Next; all four logo fallbacks loaded; document width equaled viewport. Pure regression covers 20-step snapshot recovery, repeated Zonovan Knight exposure, thin pools and scoped image identity. Final release gate: TypeScript clean; 3,227/3,227 tests in 203 files, 291.90s. The 68-game composer benchmark passed after incremental exposure updates replaced repeated scoring allocations. Deployment facts are recorded after verification in the dated review artifact.

## Mobile generator and position filters — 2026-09-12

**INSTRUCTION 56 — Josh: "the parlay generator needs to be smaller on iOS mobile 'app'" and "if i want a 4 team parlay with WR & RB I can check those 2 and only have those two positions in the generated picks".**

The shared generator now starts compact on narrow cards: full controls and saved
setups sit behind Customize, explanatory copy is collapsed, and style, positions,
Regenerate and ticket slots remain visible. Wide cards keep the two-column layout.
Phone-width browser check: 341px clientWidth and scrollWidth, 671px panel height
with four fictional legs and no status notice. This is a width-constrained browser
check, not a test on physical iOS hardware. Touch targets remain at least 44px high.

NFL/CFB now offer QB, RB, WR, TE and FB checkboxes. WR + RB allows any combination
of those positions; it does not require a quota of each. Filters bind the core,
counts, tier population and payout repair. Unknown positions are excluded when a
filter is active. Incompatible pins fail visibly until unpinned or the filter is
changed. Save/Load validates and restores positions along with the other settings.

The live NFL feed had 1,235 rows with null positions in the September 13 board
captured for this check. A separate keyless ESPN roster endpoint supplies identity
metadata without changing or re-fetching Odds API prices. It accepts only NFL/CFB,
numeric team IDs (up to 32), a fixed ESPN host, four concurrent requests, five-second
per-request timeouts and an hour cache. Missing teams remain explicit. Browser
queries start only after a position filter is selected and are league/team scoped.
Large CFB slates are split into 32-team batches (at most two batches in flight),
without truncating the candidate teams. Finished/postponed games need no roster
lookup. Partial failures retain successful batches and get a shorter retry window.
Names are matched only against the game's two rosters, and ambiguous matches stay
unknown. Verified local endpoint: 47 position records for two NFL teams, no missing
teams. QB/RB/WR/TE/FB values came from ESPN, not prop-category guesses.

Synthetic browser checks: WR/RB-only tickets, kept WR survived regeneration,
Save/Load restored position selections, Add to slip added four legs. The test-only
preview route was removed before the release gate. A counterfactual removes the
position constraint and requires the behavioral tests to fail before restoring it.
The earlier full-suite run was stopped when these new owner requirements arrived;
only the fresh final run is release evidence. Prospective profit-policy research
and learned football prediction weights remain separate unfinished work.

# Progress — 2026-09-12: category-relative parlay mixes

**INSTRUCTION 55 — Josh: "i dont want it to just select a bunch of -200, -170, -150 every time".**

Added Safer mix and Balanced mix to the shared MLB/CFB/NFL sandbox generator.
Candidates stay inside the selected category, side, book, per-leg odds band and
player/game constraints. Relative Anchor/Middle/Upside bands use hit estimates;
model estimates are capped at the quote-implied chance for ranking only. Equal
probabilities share a tier. Players' alternate-line counts do not dominate the
relative ranking. Safer mix favors anchors while cycling other bands; the result
shows the actual mix because pins and payout/game constraints can change it.
Football remains market-consensus guided, not an independent player forecast.
No automatic paper-portfolio or production model weights changed in this release.

New spins downweight players from the previous four tickets, without excluding
any eligible player or overriding pins. Seeded weighted band queues cost O(n log n).
Pool creation now depends only on market/start filters and board inputs; editing
odds, style or pins no longer rebuilds every prop leg. Spins and saved setups make
no network requests. Opening the football builder now activates its existing
budgeted props query immediately because it starts on Anytime TD; daily caps stay
unchanged. The historical sampler remains available to existing callers that omit
a style; both real app desks explicitly default to Safer mix.

Anytime TD opens at the owner's -230 to +200 range, with a one-tap reset. Builder
opens on props and the generator opens for a first-time reader. Saved setups are
per-device and per-sport; they carry preferences only, discard pins, validate
stored inputs, and use the current board. The ticket sits beside controls on wide
cards and shows the observed band counts and each player's band. A more opaque
panel improves contrast against the mascot. Estimated probability/EV wording
replaces the generator's misleading "true" wording and market-EV-is-zero claim.

Local browser verification (synthetic, clearly labeled preview; removed before
shipping): Save/Load restored Safer mix after changing style; pin survived spin;
Add to slip added four legs. Narrow generator width 341px, scrollWidth 341px.
A later review found and reproduced two pre-existing doubleheader defects: an
impossible three-leg request was reported as having capacity three (actual two),
and a greedy early pick could block a valid two-leg combination. Exact bipartite
matching now computes capacity; matching lookahead protects completion when a
player appears in multiple games. Ordinary slates keep the fast path. A third reproduced defect rejected a feasible
payout because greedy price examples were treated as bounds; rejection now uses
optimistic outer bounds, with a remaining-price check during filling. The first
full run was stopped to fix these defects; a fresh run follows the focused tests.
Final release gate (2026-09-12, 20:37 PDT; working tree based on `7d64984`): TypeScript clean, 202 files / 3,223 tests passed, full run 262.86s. Earlier stopped/red runs are not release evidence. The old Games/ML default assertion was updated to the intended Batter/H+R+RBI default; no assertion was weakened. A duplicate progress file was preserved outside the code tree.


## Generator repair and workflow reconciliation — 2026-09-12

Josh reported that Generate parlay was not working. Reproduced on the production MLB
Batter Props / HR panel: default -152 to +110 excluded all 66 eligible HR legs and
Generate was disabled. Shared MLB/football sheet now keeps Generate active after a
failed search, reports attempts, and offers an explicit available-odds adjustment
computed from eligible posted quotes. Existing side/book/model filters and kept slots
remain binding. Short pools can offer fewer legs; bounded payout searches can retry.
No odds requests or ledger writes are added by these controls.

Under Josh's instruction to do the optimization work, workflow copies are reconciled:
retain main's six props-history crons and current arguments, two context crons and
ump-only writes, paused model and line-history jobs. UFC refresh is manual-only.
Only timing comments and the manual UFC workflow are added to main. No app merge to
main. Remove expired divergence waivers; compare working workflow files to origin/main
so the pre-commit test now inspects the files actually being shipped. Timing inventory
now correctly expects four scheduled workflows. Existing cadence and paid usage unchanged.

The broader prospective paper-research portfolio and football calibration remain
planned, not implemented; this repair takes priority over that work. Validation and
production verification are recorded when complete. The first full run passed 3188/3196;
seven failures exposed file-URL comparisons that skipped report execution in paths with
spaces (fixed using pathToFileURL), and one historical-data check required network access.
Final validation: TypeScript clean; 199 files / 3196 tests passed in 285 seconds with
network access for the historical-data check. Production verification follows deployment.

# Progress — 2026-09-12 (initial Codex optimization review; NOT deployed)

**INSTRUCTION 54 — INITIAL OPTIMIZATION REVIEW (2026-09-12).** Josh requested analysis and optimization of Parlay Lab's engine, paper-profit evaluation and investor-quality user experience. No credential values are recorded here.

Reviewed local source and live public calibration/board outputs. Daily grading is ACTIVE: 2026-09-12 15:00:16 Pacific, 16,322 graded board rows, zero reported contradictions. Weekly fit: 2026-09-06 03:45:48 Pacific, 13,816 rows / 43 dates through September 5; the older fit is NOT evidence of outage. Five of eight market-level model Brier point estimates are worse than consensus; no independent-sample significance claimed. Today's public card: one $15 core experiment, czEv -12.5, forced:true, gatedSum:0. Grading football tickets is not learned football weights; current reviewed game weights are configured constants.

Initial UNCOMMITTED, UNDEPLOYED patch: app/page.tsx and src/components/stats/CalibrationPanel.tsx. Clear paper-first homepage / direct parlay-builder CTA / mobile video contrast / unconfirmed sync record instead of implied zero / local board absence wording / estimated-probability language. Calibration UI gets fit time + window, NO FLAG instead of OK, accurate weekly-vs-slope adjustment copy, no claims that slope 1 or one better Brier score proves calibration.

Validation: typecheck passed. Full suite 3,191/3,193, failures nav-flat (new link missing replace; FIXED) and existing expired workflow waivers. Final focused nav/calibration/window run 52/52. No claim of a fresh 3,192-pass full run. Desktop + 375px homepage inspected; no horizontal overflow. Local populated calibration view unavailable; compiled/type-checked, not visually verified with live summary. No production build or deploy. No odds refresh, model change, real wager or account change. Local preview stopped.

Durable review, public evidence, final patch and preview PNGs: `/Users/josh/Documents/Parlay Lab Handoff/review-2026-09-12/`. Main report `Parlay-Lab-Review.md`; detailed limits `validation.md`. Next: separate learning health clocks, football forecast datasets, profit-policy shadow portfolio and controlled MLB challengers; the larger redesign remains proposed.

# Progress — 2026-09-12 (INSTRUCTION 53: the handoff folder becomes a generated mirror)

Josh, verbatim: *"Make sure every single thing for parlay lab to be edited/analyzed/optimized/carried
over into another chat is added to the folder 'Parlay Lab Handoff' so at any point I need to move this
project to a new chat, I can do so. Also make sure that every time something is added, it is immediately
added to the disk/files in that folder so it can be accurately handed off AT ANY POINT IN TIME NO MATTER
WHAT WITHOUT HAVING TO ASK FIRST BECAUSE ITS AUTOMATIC"*

## What was wrong

`/Users/josh/Documents/Parlay Lab Handoff` held nine files, all stamped **2026-07-24** — 49 days stale.
Its orientation file called Parlay Lab an MLB terminal on a $2,500 bankroll. It is three desks on
$10,000. No CFB, no NFL, no credit rail, no live in-play pull, nothing from instructions 17-52. A new
chat handed that folder would have rebuilt July and believed it was current.

## What shipped

`tools/sync-handoff.sh` — 898 lines, generates the entire package from the repo:

| file | what it is |
|---|---|
| `00-START-HERE.md` | the orientation brief: three desks, allocations, bankroll, where everything lives, who Josh is, read order |
| `01-STATE.md` | **live** — branch, HEAD, subject, origin, dirty/clean, tracked + test counts, last 15 commits, and the dated deploy/gate block |
| `02-ENVIRONMENT.md` | the shell prelude, the gate, the deploy path, and every trap: BSD `find` has no `-newermt`, never grep the 291 KB generated engine blob, `next-env.d.ts` drift, the `route.ts` export rule, no jsdom, subagents never run git |
| `03-SECURITY.md` | the credential and money rules, verbatim, plus the prompt-injection posture |
| `04-OPEN-DECISIONS.md` | twelve items, each with its trade priced — **new, never existed before** |
| `05-INSTRUCTION-LOG.md` | every `**INSTRUCTION N**` header extracted with its line number in the handoff doc |
| `06-ARCHITECTURE.md` | desks, routes, client traps, and every tuned constant with the arithmetic behind it |
| `MANIFEST.md` | inventory, sizes, checksums, restore commands, automation status |
| `repo/` | verbatim `CLAUDE.md`, `ENGINE2.md`, `PARLAY_LAB_QUANT_ENGINE.md`, all 23 `docs/`, every config, the workflows |
| `code/` | `git archive HEAD` tarball (788 entries, 9.5 MB) + full-history `git bundle` (99 MB) |

## What makes it fire

1. **Four git hooks** — `post-commit`, `post-merge`, `post-checkout`, `post-rewrite`. Each hook
   backgrounds the call and ends `exit 0`: a sync must never slow or fail a git operation. Verified
   live — the INSTRUCTION 53 commit republished `01-STATE.md` to its own sha with no further action.
   A fifth hook on `post-index-change` was tried and **removed**: git refreshes the index on a plain
   `git status`, so it spawned a sync per status check and raced the run in flight. That race is also
   why the script now serialises on a `mkdir` lock in `$TMPDIR` (600 s stale-breaker) — verified by
   running two `--force` syncs at once: one published, one skipped, tarball valid at 695 entries, no
   `.tmp` left behind.
2. **A standing rule in `CLAUDE.md`** that any session changing the project runs the script. This is
   what covers unstaged edits.
3. `tools/sync-handoff.sh --force` on demand, which also rebuilds the bundle.

## The timer was built, tested, and removed — and the removal is a finding

A LaunchAgent on a 15-minute interval was installed and fired. It logged
`Operation not permitted`. Rather than assume the cause was the script's location, a probe agent
placed outside `~/Documents` was run: `ls ~/Documents` **DENIED**, `ls ~/Documents/Parlay-Lab`
**DENIED**, `cat .../package.json` **DENIED**, `ls "~/Documents/Parlay Lab Handoff"` **DENIED**. macOS
TCC denies a launchd-spawned shell the whole Documents tree, wherever the script lives. (An earlier,
looser probe line read `write handoff dir: OK` — a **false positive**; the sharper probe is the one to
believe.) The only cure is Full Disk Access for `/bin/bash` — a security setting, not worth a file
copy, and Josh's to grant if he ever wants it. **The agent was deleted rather than left failing every
15 minutes: a broken automation is worse than a missing one.**

Change-gated on a fingerprint of HEAD + the dirty-tree listing + every doc and config mtime, so the
no-change path is one `shasum`. A full run measured **3.6 s** with the 99 MB bundle, **1.4 s** without
it — cheap enough to run on every hook and at the end of every session.

## The security posture, because this is a copy machine

- Snapshots come from `git archive` / `git ls-files`; `.env*.local` is gitignored, so no env file is
  tracked and none can ride along. **Verified:** `tar -tzf` for `(^|/)\.env` and `.vercel/` over all
  788 entries returned nothing.
- The script dies rather than publish if an env-shaped path is ever tracked, and deletes any
  env-shaped file it finds already in the folder.
- A sweep of the published folder for the sync phrase and key-shaped assignments returned one hit:
  `docs/session-handoff.md:2019`, `process.env.CRON_SECRET = "s3cret"` — the handoff's own quotation of
  a unit-test dummy. No real secret is in the mirror.
- **No mutating git command.** `rev-parse`, `status`, `log`, `ls-files`, `archive`, `bundle create`
  only — it runs unattended on a timer, so it must not be able to damage the repo it reads.

## What was kept

The nine July files and the 7 MB July repo zip moved to `archive/superseded-2026-09-12/`, keyed on a
sentinel so it happens exactly once. Nothing was deleted.

## PASTE-THIS.md — the answer to "can I paste this folder into any chat?"

No, not the folder: `code/` alone is 108 MB and the repo copies are **216,000 tokens**
(`session-handoff.md` 159k, `CLAUDE.md` 36k). The eight briefs, though, are 55 KB / **~13,000 tokens**,
so the sync now emits `PASTE-THIS.md` — one self-contained file concatenated from those briefs, with
the sentinel and duplicate footers stripped. 763 lines.

Its first section tells the receiving chat what it can actually do, because the answer depends on where
it lands: **(A)** Claude Code on Josh's Mac does not need it — the repo and the full package are on
disk; **(B)** Claude Code elsewhere should clone `github.com/JBravvvv/parlay-lab` and check out
`frontend-rebuild`, which is authoritative and current; **(C)** a plain chat can explain, price, design
and review, but cannot edit, gate or deploy, and **must never say something is done, fixed, or live** —
and is told its own 13k-of-216k ceiling so it asks for the deep doc instead of guessing.

## A guard fired, and the fix was structural rather than a re-date

`sha-currency` went red on `docs/session-handoff.md:16` at exactly **11 behind (K=10)**. The stale sha
was not the claim — it was `46f68df9`, the INSTRUCTION 50 tip, riding along as a parenthetical on the
same marked line. The guard scans every sha on a marked line, so inline history turned each superseded
sha into its own ticking clock, and refreshing the claim alone would not have cleared it. Line 16 now
carries exactly one sha, the current one; the superseded three moved to an adjacent unmarked line that
`sha-references` still forces to resolve and `sha-currency` ignores by design.

## The mirror fell one commit behind, and the lock was the reason

The first thing done after pushing `8705291` was to read the published `01-STATE.md` rather than assume
the hook had worked. It said `8dc38de`. Four minutes stale, on the day the whole point was "AUTOMATIC".

Two plausible explanations were tested and both failed. `git checkout -- <path>` firing `post-checkout`:
ruled out by recording `.sync-fingerprint`'s mtime, running the checkout, waiting 8s, and seeing no
change. `post-index-change` having come back: ruled out by `ls -l .git/hooks`, which shows four. The
answer was in the script's own ordering — HEAD is read in the first 100 lines, the 99M
`git bundle create --all` runs ~80 lines later, and the briefs are not written for another 200. A run
that starts before a commit and spends a minute on the bundle publishes the HEAD it read at the start,
and the `post-commit` hook for the new commit hit the held lock and **exited**. The lock was protecting
the files and losing the update.

So the lock now coalesces. A run that cannot take it leaves a request marker (carrying whether `--force`
was wanted); the holder routes every normal exit through a `finish()` that re-execs once a request is
pending, so the last writer is always the one with the newest state. Ten triggers during one long run
become one extra pass, `PL_SYNC_DEPTH` caps the chain at three, and a request that lands after the cap
stays on disk for the next hook. Proven with two simultaneous `--force` runs: loser left a request,
holder published, re-synced, published again 4s later, no lock or marker residue, tarball valid at 790
entries.

Two stale sentences went with it: `CLAUDE.md` claimed the hooks "cover every commit and every `git add`"
(the `git add` half *was* the removed fifth hook) and `tools/handoff-state.env` still said five hooks.

## The limit, stated

The prose blocks (00, 02, 03, 04, 06) are hand-written and decay like any doc. What changed is where
they live: in `tools/sync-handoff.sh` under version control, reviewed in a diff, instead of in a folder
nobody diffs. Deploy and gate facts live in `tools/handoff-state.env`. **Editing a published file
directly is pointless — the next sync overwrites it.** Deriving the prose from `docs/` by extraction was
considered and rejected: 28,647 lines of append-only narrative with struck-through sections would
publish retracted claims as current.

# Progress — 2026-09-12 (INSTRUCTION 52, documentarian pass: the credit arithmetic, the generator's own fix pass, and what is still Josh's to decide)

Markdown only — no code changed. Josh, verbatim: (1) "I've always had in game live lines. It has live
lines; they just went away this week"; (2) "Parlay Generator should be on CFB & NFL just like it is on
MLB". The two blocks below this one are the first cut (`67a7d3c`) and the seven-edge review round
(`f6e996b`). This block carries what was not yet written down, re-read from the committed diff.

## The numbers, after the review round

| | held back | pre-kick rail | pre-kick event-pulls | board |
|---|---|---|---|---|
| CFB | 372 of 2,500 | 2,128 | 68 | 60 games — the whole board, plus 8 re-price pulls |
| NFL | 248 of 1,000 | 752 | 24 | 16 games — the whole board, plus 8 re-price pulls |

`dailyBudget` is untouched (2,500 / 1,000) and a live pass is still sized against the whole rail; only
the pre-kick pass is restricted, and that restriction got SMALLER. Two things the review round added
that are easy to miss: the reserve is now capped at what today's live-or-upcoming games could actually
spend, so a 2-game Thursday card or an all-final slate holds back nothing; and the "credits are being
held" note is printed only when re-sizing the pre-kick half against the full budget would have bought
more, so the reserve is never blamed for games an empty rail refused.

MLB's evening ticker is six Pacific times (15:00, 16:45, 17:15, 17:45, 18:15, 18:45). Because the
credit probe is still unrun, every pass is capped at 3 events: **19 credits a pass, 114 a day** at the
assumed rate, 209 on a heavy day with five manual taps, and **564 at the unmeasured worst case of 31 an
event** — inside the 600 rail either way. No cron row was added; the five stake slots are the same
array object they always were.

## Item 2's fix pass — two parts that were not recorded

Beyond "Add to slip" now adding instead of overwriting the slip (which on football had been deleting
the Sides legs Josh tapped before he spun): the Anytime TD market no longer offers an Unders button it
cannot fill — it hides the over/under control, says why, and a one-sided failure gets a one-tap
"Switch to overs" escape instead of a dead Generate button under a banner calling a full board empty.
And a board whose games have all finished now says exactly that, rather than "no lines on this board".

## Still Josh's to decide

- **Football credits.** A Saturday that wants all 60 games priced pre-kick *and* re-priced in play
  wants more than 2,500. Either upgrade (20,000 → 100,000 credits, $30 → $59/mo), or slow the live
  cadence (`liveRevalidateSec` 600 → 1800, in-play lines every 30 min instead of 10), or shrink the
  live pool (`liveMaxEvents` 24 → 8-10). The reserve helps under all three and invents credits under
  none.
- **Automatic evening board-only re-prices**, 114-150 credits each. Nothing schedules them today; it
  is his Refresh tap. The pass also shares the day's four server runs with the locked card, so after
  four runs the tap falls back to a device-only re-price — widening that is a spend decision.
- **His cron-job.org ticker** stops at 18:45 PT (PST) / 19:45 PT (PDT) while baseball ran to 22:01 PT
  on 09-11; extending the row is his own account.
- **The sync phrase must be on the phone**, or every MLB live price stays invisible.
- **The 3-event credit probe is still unrun**, so one manual tap on a worst-case day can still end
  near 658 against the 600 rail. Running it is the cure; lowering a cap is not.
- **Two fast Refresh taps** can still race the 45-minute limiter (flagged, not forced).
- **Seven expired GitHub workflow waivers** — `since: "2026-08-29"` in
  `tests/workflow-branch-sync.test.ts`, against a 14-day limit, so they expired 2026-09-12 — await his
  decisions. NOT 2026-09-11, which an earlier draft of this line said: that is the day INSTRUCTION 51
  shipped, not the day the waivers were dated, and the distinction matters because re-dating them is
  exactly what must not happen. They are the one red in the
  gate.

# Progress — 2026-09-12 (INSTRUCTION 52 review round: the reserve stops costing pre-kick games)

Shipped `f6e996b` on top of INSTRUCTION 52 and live on prod. Seven edges of my own port, found by
reviewing it: the football reserve was double what it needed (744 → 372 CFB, 496 → 248 NFL), so all
60 Saturday games are priced pre-kick again instead of 56, with a live pass still able to draw the
whole budget; the MLB live calendar went 7 slots → 6 because a pass is sized once against the ASSUMED
rate and seven at the unmeasured 31-an-event rate is 658 against a 600 rail (12:00 PT dropped, the
thinnest); the board-only tap now checks the day's run cap with a free read-only GET first, so a
refused tap can no longer spend a run the evening's locked card needs; the 45-minute limiter no
longer cancels the device re-price, because a Refresh that buys nothing and re-prices nothing is the
exact defect INSTRUCTION 50 exists to kill; the server's half of the credit bill is now on the Board
next to the browser half; the server-first gate reads `liveGap.live` rather than `pregameLive`, which
this pass itself destroys; and "your sync phrase isn't saved here" is no longer shown to a phone that
has one, because the read is three-valued now. "Add to slip" on the football generator adds instead
of overwriting. tsc 0, 3,192 of 3,193 tests pass — the red is the expired-waiver guard awaiting
Josh's decisions.

# Progress — 2026-09-12 (INSTRUCTION 52: the in-game live lines come back, and the Parlay Generator lands on CFB & NFL)

Josh, verbatim: (1) "I've always had in game live lines. It has live lines; they just went away this
week"; (2) "Parlay Generator should be on CFB & NFL just like it is on MLB".

## Item 1 was a regression, and he was right about it

I had told him after INSTRUCTION 51 that "the Odds API may not sell in-play MLB props at all". That
was wrong about his experience and it is corrected here. **The desk that has always had real in-game
market lines is CFB.** On MLB, in-game market prices were first wired yesterday (`f2e9bf7`); what MLB
always had is the LIVE pill and LIVE parlay set, which read live game *state* over the last pregame
prices. Both had broken, for unrelated reasons, and both are fixed.

### CFB/NFL: the pre-kick pass was eating the whole day's credit rail

60 games × 31 credits = 1,860 of CFB's 2,500, leaving 640 — and a 24-game live pull wants 744. So the
moment a Saturday slate finished pricing pre-kick, every in-play re-price was **refused by the budget**
and the board served carried rows marked `playable:false`, `stale:true`. Lines that "went away".

Fixed with a two-rail split, not a bigger budget: a game **under way** is sized against the whole
`dailyBudget`; a **pre-kick** game against `dailyBudget − liveReserveCredits`, where the reserve is
one full live pass (744 CFB, 496 NFL). **No budget, cap, slot or allotment was lowered.** CFB now
prices 56 of 60 pre-kick rather than 60, and keeps its 24 in-play re-prices. NFL does 16 + 16 = 992 of
1,000, and an unspent Sunday morning still buys all 13 games — that is pinned.

This does **not** manufacture credits. A Saturday that wants all 60 priced pre-kick *and* re-priced in
play still wants more than 2,500, so Josh's three options stand: upgrade to 100,000 credits ($30 →
$59/mo), widen `liveRevalidateSec` 600 → 1800 (~8,900 → ~3,000), or trim `liveMaxEvents` 24 → 8-10.

### MLB: the live pull was riding the stake calendar

INSTRUCTION 51 shipped the in-play pull on `REFILL_SLOTS_PT` (08:00 / 09:30 / 12:00 / 15:00 / 16:45
PT). **Four of those five see no live baseball.** It now has its own calendar — 12:00, 15:00, 16:45,
17:15, 17:45, 18:15, 18:45 PT — and `tickMode` flipped to `"ticker"` so the new calendar is actually
read. Seven passes × 19 credits = **133 of the 600 rail**. Zero new cron rows; `vercel.json` untouched;
the stake calendar is the same array object it always was.

### MLB: the LIVE pill needs a board built while games are live

Every automatic route to an in-play engine run is refused (dead-slate, low-ceiling, "every game
started"), so `categoriesLive` stayed frozen at its pregame state — empty. There is now a board-only
`?live=1` pass that re-prices and stores the board **without ever entering the stake path**: no claim,
no allocation, no append. The locked card cannot move. It runs on Josh's tap only, never on a timer,
because a pass costs 114-150 credits — whether to authorise automatic evening re-prices is his call.

## Item 2: one mount, two desks

`parlay-gen.ts` was generalised instead of forked — a generic `GenLeg<T>` carrying its own `side`
replaces the id-suffix trick that made the engine MLB-shaped. Football gets its own pool builder that
injects the CFB desk's real `propQuote`/`propLegOf`, so football legs are priced by football rules. The
panel's state machine and `GenSheet` are now shared and sport-neutral. The generator is mounted in
**one** place, `CfbProps.tsx` — and since `NflProps.tsx` is 18 lines wrapping `CfbProps` in the NFL
league context, **NFL gets it with no second copy to drift**.

## Still Josh's to decide

The football credit shortfall (the three options above); whether automatic evening board-only
re-prices are authorised at 114-150 credits each; that his cron-job.org ticker covers 08:00-19:00 PT
while baseball runs past 22:00, which is his account to extend; that the sync phrase must be saved on
the phone or every MLB live price stays invisible; and the seven expired GitHub workflow waivers.

# Progress — 2026-09-11 (INSTRUCTION 51: the live in-play line and price are really pulled, for MLB)

## Board — "over 3.5 at −145" instead of a dash
- Josh: "Authorize the live in-play odds pull for MLB"
- This is the second half of the last fix. His complaint was: "It's not updating with live odds; it
  will show the player is top 4th w/ 3 H+R+RBI, but show them as an 'S' grade for over .5 H+R+RBI
  when their live over/under is 3.5 H+R+RBI". The last ship fixed the half that was free — a leg the
  live tally has already carried past its line stops being graded and says so. It could not do the
  other half, because the other half costs money: knowing what the book is charging RIGHT NOW needs a
  paid per-event pull, and that had not been authorised. Now it has.
- What changed: the live line and the live price come from a real, budgeted, per-event in-play pull
  of the six MLB prop markets — the same six the app already prices — asked one game at a time, only
  for games that are actually under way, and only for the games worth paying for. Which games those
  are is decided FREE before a single credit is spent: the app already knows every player's live
  tally from the free MLB feed and can already run the rest of the game through its own simulator, so
  it buys the games where the line has provably been cleared first, the games the sim says have
  genuinely moved second, and the quiet ones last or not at all.
- What a re-priced row looks like: the line the book is posting now, the price beside it with the
  book's name and the minute it was pulled, a pulsing LIVE pill so it can never be mistaken for the
  pregame lock, a real grade computed on THAT price at THAT line, and the live probability. The
  probability is the engine's own live-resume sim where the sim can price the rest of the game; where
  it cannot, it is derived from the book's own two-sided price and is labelled "market fair" rather
  than shown as a model number; where neither exists, the row shows the price and no grade at all.
  The pregame number is never run against the new price — that would produce a confident, wrong edge,
  which is worse than the dash it replaces.
- No ¼-Kelly stake on a live row, deliberately, and this is the one that matters for the bankroll: a
  fair price worked out FROM the market has, by construction, zero edge over that market, so a stake
  sized off it is sizing a bet with no edge in it. And the pregame Kelly on the row was sizing a
  different bet at a different line. A stake chip on an in-play line would be an instruction to bet a
  phantom, so there is no stake chip. The football desks already work this way; MLB now matches them.
- When no live line comes back — the book has taken the market down, the game just ended, the budget
  is spent, the pull errored, or the quote on file is too old to trust — the row falls back to
  EXACTLY what it showed yesterday: the dash, the SETTLED tag, and a plain sentence saying the price
  on that row is the pregame lock. The only thing added on those rows is one clause saying WHY no
  live line was obtained. The protection did not get weaker in any failure case; it is the default in
  all of them.
- Nothing is invented anywhere. Every number on screen came from the book, the free live game feed,
  or the engine's own simulator, and the one that came from the market is labelled as such. Every new
  test fixture is synthesized from the real response shape with invented numbers and marked as
  synthetic in the file — the paid feed is never called to build one.
- What is NOT claimed: that this refreshes itself all evening. It fires automatically on the same
  five Pacific slots as everything else, and four of those five see zero live baseball — the 16:45
  one catches about nine games, and the busiest stretch of the night is after it. The rest is Josh's
  own Refresh, which runs the identical pass, exactly as he asked for on 09-09. An opt-in that would
  cover the evening peak is built and shipped switched OFF, one constant away, and turning it on is
  his call, not ours. No budget, cap or slot was lowered to pay for any of this, and the new spend has
  its own counter so it can never eat the football desks' allowance.
- Also NOT claimed, and it is the gate on the whole thing: nobody has yet proved the feed even posts
  MLB prop markets on a game in progress. One small three-game probe against a live game settles it.
  If it comes back empty, the honest answer is that the authorisation bought a measurement rather
  than a board, and what stays on screen is the protection that already shipped.

# Progress — 2026-09-11 (INSTRUCTION 50: the Board's Refresh acts, a settled leg stops being graded, the Builder gets a generator)

## Board — the Refresh button always does something (item 1)
- Josh: "Refresh button not working on 'Board' tab; works if I refresh on 'The Sharp' tab"
- Four causes, all four fixed. The pill only fell back to a browser re-price on two of the nine
  refusal reasons the server can give; a 401/502/503 from the refill route came back as SUCCESS and
  the tap died in silence; the "Scanning slate…" label watched only the browser regenerate, so a
  refill in flight looked like a dead button; and the Board's pick rows came from a MOUNT-ONLY
  fetch — which is the real reason refreshing on The Sharp "worked". Leaving the tab and coming
  back remounts the page and refetches. Navigation was doing it, never the button.
- Now a tap always re-prices something: the server refill when the sync phrase is stored, otherwise
  the browser generate, and the browser generate as a fallback on ANY refusal, any non-2xx and any
  error. The picks list became a query that both paths refresh. Every tap prints its one-line reason
  plus what it spent (~114–150 Odds credits, estimate 140) — counted to keep the spend visible,
  never to block it. No budget, cap or slot lowered, and no cooldown added: nothing should stop a bet.

## Board — an 'S' grade on a leg that has already won (item 2)
- Josh: "It's not updating with live odds; it will show the player is top 4th w/ 3 H+R+RBI, but show
  them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5 H+R+RBI"
- Both halves were already on the same row and nothing compared them: the live-tally reader computed
  the number and returned only the text to print, and the grade is a pure threshold on one EV number
  with no line, no clock and no game state. The tally reader now returns the number as well, and a leg
  whose live tally has passed its line shows a dash and a SETTLED tag instead of a grade, saying in
  plain words that the price on that row is the PREGAME lock, not a live market. The row stays on
  screen and sinks to the bottom — nothing is hidden or deleted.
- Deliberately NOT claimed: a leg still under its line is never called settled (proving that needs a
  live re-pull), and no live line and no live price is invented anywhere. A real in-play price would
  cost a paid per-event pull that Josh has not authorised.
- AMENDED 2026-09-11 (INSTRUCTION 51, and the sentence above is kept as the dated record): Josh
  authorised that spend the same day — "Authorize the live in-play odds pull for MLB". What it bought
  is a budgeted per-event in-play re-pull for MLB only, so a row whose line has moved now shows the
  line the book is posting NOW and the price beside it, instead of a dash. The first half of the
  sentence above did not change and was not weakened: a leg still under its line is still never
  called settled, and when the paid pull brings nothing back the dash and the SETTLED tag are exactly
  what they were. One thing is claimed at model tier and only under one condition — the live
  probability is the engine's own live-resume sim when that sim can price the rest of the game, and
  in that case only. When it cannot, the number shown is derived from the book's own two-sided price
  and is labelled "market fair" on screen, never dressed up as a model edge, and if neither is
  available the row shows the price with no grade at all.
- Sequencing: this suppression ships WITH the refresh fix, never after it. A working refresh with no
  suppression would mint a real 'S' on every settled leg priced softer than about −1640.

## Parlay Builder — a generator you can pin and respin (items 3 and 4)
- Josh: "Parlay builder should have a generator that I can select # of legs, prop category, min & max
  odds then it will generate a parlay for me within those parameters; if I hit regenerate then it
  regenerates a new parlay; each slot is clickable to keep that player(s) in any round and spin the
  other slots"
- Josh's own example settles what the odds range means: his four legs (−145, −124, −137, −130)
  multiply out to +834, while the range he wrote is −152 → +110 and every one of the four sits inside
  it individually. So the range is PER LEG by default, with a combined-payout target as an optional
  extra. One question goes back to Josh to confirm that reading.
- Pin any slot and spin the rest; the same settings and the same spin give the same ticket on any
  phone; one leg per player always, one per game unless you turn it off; when it cannot fill the
  request it says so in one honest line instead of quietly loosening the rules. No price is ever
  invented — only sides the book actually posted. Sandbox only: nothing is tracked, nothing enters
  the ledger, no credits are spent.
- Josh: "Need player headshots for Parlay Builder etc or need team logo next to name" — every
  generated leg and every parlay leg now carries the player's headshot with his own team's logo
  badged on the corner, and his initials when there is no photo.

## Picks list — collapse a game by pressing its matchup box (item 5)
- Josh: "Need to be able to collapse list of picks for each individual game/prop by clicking/pressing
  in the top box that shows the team matchup"
- It already worked — the matchup bar was already the toggle. What was actually wrong: the bar was
  36px tall against this project's own 44px minimum, it gave no press feedback so a tap that DID work
  felt like nothing happened, and it forgot what you had collapsed the moment the list re-rendered.
  Now 44px, it presses, a collapsed market card still shows how many lines are inside it, and a
  collapse survives a reload.
- Not built, flagged for Josh: the Board tab has no per-game grouping to collapse at all, and games
  still default to open the first time you see them.
- Status: built on the shared tree, NOT committed, NOT deployed. The handoff's origin-sha claim was
  refreshed in the same work — it sat exactly at the currency guard's limit, so the next commit on
  this branch would have turned it red.

# Progress — 2026-09-09 (INSTRUCTION 49: refill on the five slots, or on Josh's own click)

## Every desk — the card refills five times a day, or when Josh presses Refresh
- Josh: "It shouldn't be refreshing every 15 minutes. It should be 8am, 9:30am, 12pm, 3pm & 4:45pm.
  Other than that I can manually do it." Top-ups now fire only on the first scheduler tick after
  08:00 / 09:30 / 12:00 / 15:00 / 16:45 PT — the same five slots grading already uses
  (`REFILL_SLOTS_PT` = `GRADE_SLOTS_PT`) — or when Josh presses Refresh with his sync phrase stored
  (`POST /api/refill?desk=mlb|cfb|nfl`, the identical server pass with slot `manual`).
- First locks are unchanged (MLB lineup/first-pitch blocks, football 60-min lead). Nothing changes
  on cron-job.org or in `vercel.json`; the 21:45Z / 00:00Z vercel crons never refill.
- `TOPUP_MAX` 4 → 6 (five slots + one manual); the 45-min / 90-min cooldowns are unwired — the slot
  calendar is the only pacing; a slot that already ran today is refused free (the slot is stamped
  on the top-up row). Football `retryMs` → 0.
- Budgets: none lowered, per Josh ("Don't lower any budgets") — the INSTRUCTION 48 props-budget
  lever is countermanded; Josh buys credits instead. MLB hard ceiling 9 runs / 1,026–1,350
  without a click, 10 runs / 1,140–1,500 with one, realistic 342–600; football slot-only
  ≤ 5 attempts = 30 lines credits, 6 with one manual = 36, 42 including the lock's own pull.
- Status: built on the shared tree, NOT committed, NOT deployed.

# Earlier — 2026-09-09 (INSTRUCTION 48: the card only grows)

## Every desk — LOCKED is the first lock, not the end of the day
- "Locked" now means the first lock happened, not that the day is closed: the desk keeps adding
  tickets across the day's refreshes until the daily allotment is placed (the Builder and the
  CFB/NFL card say "Still filling — $x of $y" while pregame games remain).
- MLB sweeps up to 4 times a day (was 2), 45 min apart, an empty sweep waiting 90 min; a sweep
  that could not own an open slot is refused for free. Football: 6 attempts per arm (was 2).
  (Cadence superseded the same day by INSTRUCTION 49 above: five PT slots + manual, TOPUP_MAX 6.)
- A locked ticket is never removed or resized — enforced by `src/lib/append-only.ts` at every
  server write (MLB build + write, football top-up + write) and tested.
- Credits: MLB worst case 6 → 8 full runs a date (912–1,200 at 114–150 each), football ≤42
  lines credits a date (lock + at most 6 top-up boards); with the fixed rails (~231/day) September
  reads ≈ 29,300 realistic against a 20,000/month plan whose last reading (16,480 on 09-05) is
  stale — the month is already short on paper, so the props rails
  are the lever, not the caps. Not committed.

# Progress — 2026-09-08 (INSTRUCTION 47: CFB $250, the NFL desk, NFL $350)

## Football — one engine now runs two desks
- NFL is the third pill on the sport switch. Board, Builder, Parlay Builder, Ledger, The Sharp,
  Games, Stats and Settings bank all have an NFL surface; the server locks an NFL card once
  per slate date ($350 core + $25 fun, tickets $5–$50, 3–10 of them, one side per game) and
  grades it from ESPN finals at the Caesars line. Own ledger, bank and keys — nothing shared
  with CFB or MLB money.
- CFB core widened to $250 a day; ticket max $50 and up to 10 tickets so the money can
  actually deploy (7 × $25 could never hold $250).
- Not built: an NFL Season Lab (the CFB one stays). Not covered: London 13:30Z kickoffs —
  the scheduler ticker's hours would need widening on cron-job.org (Josh's account).
- First live NFL slate: Thursday 2026-09-10 (49ers at Rams). Nothing has been read from prod
  for the NFL yet; the props credit cost per game is the CFB figure until measured.

# Progress — 2026-09-08 (INSTRUCTION 46: shaped core, CFB headshots, Season Lab, ten UI fixes)

## Baseball — the core runs Josh's six $150 shapes and tilts on its own record
- `src/lib/core-shapes.ts`: his six examples verbatim, one per day in rotation; `lock-card.ts`
  seats one ticket per slot CAPPED at the slot's stake — Josh's same-day call: "Cap at Kelly,
  don't ride the full slot". What Kelly declines is retired (`slotUnderSum`), never re-bought.
- Self-calibration: trailing-30-day 2-leg vs 3+-leg ROI (≥ 20 graded each, ≥ 10-point gap)
  tilts the rotation toward the winning bucket; thinner records keep the full rotation.
- Grading passes now fire at Josh's five Pacific times — 8:00, 9:30, 12:00, 3:00, 4:45 —
  on the first ticker tick after each (INSTRUCTION 46b). No cron-job.org change: the existing
  window already covers them in PDT and PST. The fix round earlier caught a stranded-money
  double count that would have frozen legacy days at $0.
- Kelly sized off the legacy $750 default on the server (max $60/ticket, so $75/$90 slots
  could never fill). Paper bankroll is now $10,000 (Josh: "Bump the bankroll to $10,000"),
  seeded into the server engine; per-ticket ceiling $800, cap-at-Kelly rule unchanged.
- Games tab compact/collapsible, "Game Preview" with AVG/OPS + batter-vs-pitcher,
  Parlay Builder All/Away/Home filter, ledger tap-anywhere + player deep links.

## Football — headshot over own-team logo everywhere, phone Builder rebuilt, Season Lab
- ESPN byathlete headshot + teamId joined onto every prop row (gated to the game's two
  teams); `PlayerMark` replaces the two-logo `PairMark` on player picks.
- CFB Builder at 375px: money strip, stacked tickets, collapsed notes, sticky lock pill.
- `/season` Season Lab: typed season lines (no Odds API market exists), ESPN-projected
  fair numbers, ¼-Kelly on a $250 season bank, season parlays, own store.
- Parlay Calc left-aligned two-column from `lg`; Board overview collapsible.
GATE: tsc clean, 165 files / 2358 tests green after two pin fixes.
