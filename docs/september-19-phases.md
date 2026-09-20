# September 19 update plan

Baseline reviewed: Claude's 33807d1 handoff and 9c048d8 app release. Preserve DraftKings pricing, daily ballpark modeling, first-half football markets, paper budgets and quote freshness safeguards.

## Phase 1 — generator clarity and controls (deployed)
- Requests 1, 4–8, 12, 14, 16: show source-labeled probability, probability sort, compact controls, player-first ticket, flexible mixed timing, signed odds entry, 0–80% historical hit-rate floors and matchup details.
- Begin requests 3 and 10 with reusable hourly Pacific game-start sliders and multi-select market dropdown.
- Verify minimum one-hour window, midnight/end-of-day, pins, history, same-game constraints and unchanged DraftKings math.

## Phase 2 — consistent discovery across all sports and pages
- Complete requests 3, 10, 13: shared timing, market, strategy and sport multi-select filters on Board picks/generated tickets, Builder and Every Pick Today.
- Cross-sport ticket payloads and slip integration; only selected sports; reuse stored feeds.
- Strategy selection must affect the ticket construction, not merely change labels. Stacks favor distributed pairs. Hedge-friendly means staggered starts, not guaranteed hedge profit.

## Phase 3 — live-game context
- Requests 9, 17 and remaining 16: verified live quotes, scores, opponent, kickoff and actual stat progress across pick surfaces.
- Goal marker at 75% of track, graded color progression; green only on a confirmed winning leg. Handle unders, pushes, final/void and missing feed data explicitly.
- Do not expose stale pregame football quotes as live prices just by removing the started-game filter.

## Phase 4 — research tools and density
- Requests 2, 15: restore verified statistical splits; All-handedness ballparks, advantage sorting/grades, evidence explanations and expandable game picks.
- Preserve existing daily park probability adjustment, without counting it twice. Do not invent pitcher-location or matchup data.
- Request 11: measure representative page height before/after, target 50% vertical footprint without changing width. Review rendering/readability; no second 33% reduction unless requested.

## Release evidence
Phase 1: TypeScript passed; 3598/3598 tests across 234 files passed; production build passed. Logs: /private/tmp/parlay-phase1-release.log and /private/tmp/parlay-phase1-build.log. Deployed as commit 7ee44f2, Vercel parlay-yzb99bcwj (Ready, production). The public /api/version returned 7ee44f244b31ab55761ad92118691610720a652d.

### Phase 1 validation record
- Shared generator and ranked list now expose model/market probability; ranked list adds probability sorting.
- Generator actions sit below the ticket; lock sits above exclude on the right; legs use a bounded 2–8 stepper; games fold into details; compact advanced toggles say Allow.
- Mixed is a union rather than a required split. Same-game/team switches continue to relax constraints without requiring duplicates; preference-based diversification remains in the strategy phase.
- Hourly Pacific start windows in generator and ranked list, including adapters, saved recipes, pin enforcement and empty-market handling. Board surfaces remain Phase 2.
- MLB historical hit floor has 0–80% in five-point steps; football historical logs remain unavailable, so no invented hit rates are shown.
- Odds input mode changed from numeric to text in generator and ranked bounds so iOS can access minus/plus. Other odds-entry components require the Phase 2 surface audit.
- Browser checked 375×812 mobile layout, no horizontal overflow, 10am–11am slider, negative -230 entry, market Clear/Select all, and shared NFL rendering. Local feeds returned no picks: populated ticket behavior is tested with fixtures, not claimed as verified live-data coverage.
- No 50% page-height reduction is claimed in Phase 1. Site-wide density, live meters, Stats splits, cross-sport slips and ballpark expansion remain open.

### Production verification
On the production alias, NFL Sunday 9/20 returned 461 ATD lines across 14 games and 1171 ranked picks. At 375×812, a four-leg generated ticket showed matchup/start, source-labeled probability, odds, right-side lock/exclude and actions below players, with no horizontal overflow. Locking slot 1 and regenerating retained that player. Probability sorting put the 86.2% model estimate first, ahead of lower-probability S-grade picks; grade and probability remain distinct. No ticket was placed or written to the ledger. Browser viewport restored and test tab closed.


## Follow-up session — remaining implementation (September 19)
The owner asked to finish the rest in this second session. Phases 2–4 are implemented together for this release.

- Shared timing, market, style and sport multiselects now drive discovery on Board picks, generated Board tickets, Parlay Builder and Every Pick Today. Each has Select all/Clear. Choosing another sport while Markets is All includes the newly available markets. Hourly Pacific windows also filter paper Builder ticket displays without changing their locked wagers.
- Cross-sport candidates reuse stored boards through `/api/discovery`; the endpoint does not call an odds feed. Keys are namespaced, and native slips retain the exact selected-book price and probability. MLB gets stored live rows only after official game-state, quote-age and settled-line checks. Football live props need a recent per-game pull after kickoff. Missing quotes stay missing.
- Safe ranks probability against the same market's eligible peers, with each player receiving one total vote across alternate lines. It does not impose a universal 50% threshold. Strategy search adds value gates, diversification and exposure penalties; Stacks favors distributed pairs, Anchor + Kicker limits the kicker's probability drop, Longshot requires at least 75/1, and Hedge-Friendly requires starts at least three hours apart. Multiple selected styles rotate as alternatives. These are construction heuristics: same-game joint probability and a profitable hedge are not claimed.
- Slots, ranked picks and ticket cards gain opponent/start/live context. One shared free clock and deduplicated queries read official score/stat feeds. The target sits at 75% of the meter; reaching an over while the game is running stays provisional. Final wins, losses, pushes, voids, unders and unavailable stats are distinct. Existing NFL/CFB pregame side models are not promoted into live forecasts.
- Restored MLB team/player splits for handedness, home/road, before/after All-Star, day/night, grass/turf and games won/lost. Both team and player `statSplits` endpoints were checked against the official MLB API.
- Ballparks: All/LHB/RHB, HR or overall-hitting ordering, S–F environmental grades, collapsed condition explanations and game-pick previews. Existing daily park/weather probability adjustments remain in the engine; the display never applies them twice. Pitch-zone tendencies and individual matchup claims are not invented when those inputs are unavailable.
- Density has Compact (default, half vertical whitespace without distorted text), exact 50% height, and 100% height choices, persisted on the device. Literal 50% compresses text and portraits too, so it is an explicit comparison option rather than the readability default. Width is unchanged. This is not a claim that Compact makes every page exactly half as tall.
- Signed odds inputs cover generator, ranked bounds, calculator and football season price entry. Locking retains the visible ticket; history, exclusions and stale-ticket Add checks remain enforced. The paid fetch policy, automated paper allocation, ledger and simulation math are unchanged.

### Follow-up validation
- Populated browser check used the repository's captured generator fixture in a temporary local page, with starts explicitly shifted for interaction testing. That page was removed before release; no fixture was published as current odds.
- At 375px: locks preserve other names; seven Regenerate / Previous cycles restore the original ticket; Forward and Add to sandbox slip work; excluded players disappear. Sports dropdown remained within the viewport. Ranked list renders 60 rows after sport hydration.
- Exact height comparison on the same populated content: 3,745.65625px at 100% versus 1,872.828125px at 50%, width 332px in both modes. Compact retains normal glyph/portrait proportions. No horizontal overflow at 375px or 1280px.
- Targeted follow-up suite: 194 tests passed. The first full review found seven obsolete UI assertions and no pricing/ledger failures; those assertions were updated for multiselect/cross-sport behavior. Final full gate: TypeScript passed; 3,621/3,621 tests across 235 files passed (serial run, exit 0, /private/tmp/pl-release-final.log). Production build and deployment verification follow below.

- Final mixed-market review normalized club identities across props and side bets, recomputed cross-sport side probabilities at the selected quote line, and included push refunds in independent sandbox EV. Full-win probability remains the probability every leg wins; no same-game joint model was introduced.

- Production build passed (`npm run build:local`, exit 0, /private/tmp/pl-release-build.log). Temporary browser fixture routes were removed and the diff passed whitespace checks before the release commit.

### Follow-up production release
- Application commit `7cfd1b79095e223aea9d5667a656fa94b12cf3ef`, with audit record `e041774b682752c289ad4c4f3cfceeae86cf68a7`, deployed as `parlay-kok17lxiu` (Ready, production). The public `/api/version` returned the exact audit commit and Vercel listed the production alias.
- A concurrent automated context refresh was preserved by rebase. The targeted check caught Jeremie Rehak reaching five games; CROSSING 83 records it and the engine freeze remained active. The environmental/pricing tests passed (22 tests); the corrected audit/document suite passed (23 tests).
- Production NFL mobile: 1,171 ranked picks, generated props plus game sides, source-labeled probabilities, all eight strategy options and Select all/Clear, four shared dropdowns, density options, and no horizontal overflow (375px viewport, 364px scroll width). The stored-only discovery route returned 1,323 NFL prop rows and 14 games for September 20; other sports had no stored snapshot for that date, correctly returning no invented rows.
- Live verification found two stale football help sentences. The follow-up corrects them to explain mixed markets and per-pick probability sources; its generator/UI regression run passed 83 tests. This wording/document follow-up does not change calculation behavior.
