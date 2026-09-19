# September 19 update plan

Baseline reviewed: Claude's 33807d1 handoff and 9c048d8 app release. Preserve DraftKings pricing, daily ballpark modeling, first-half football markets, paper budgets and quote freshness safeguards.

## Phase 1 — generator clarity and controls (in progress)
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
Phase 1: TypeScript passed; 3598/3598 tests across 234 files passed; production build passed. Logs: /private/tmp/parlay-phase1-release.log and /private/tmp/parlay-phase1-build.log. Production deployment pending.

### Phase 1 validation record
- Shared generator and ranked list now expose model/market probability; ranked list adds probability sorting.
- Generator actions sit below the ticket; lock sits above exclude on the right; legs use a bounded 2–8 stepper; games fold into details; compact advanced toggles say Allow.
- Mixed is a union rather than a required split. Same-game/team switches continue to relax constraints without requiring duplicates; preference-based diversification remains in the strategy phase.
- Hourly Pacific start windows in generator and ranked list, including adapters, saved recipes, pin enforcement and empty-market handling. Board surfaces remain Phase 2.
- MLB historical hit floor has 0–80% in five-point steps; football historical logs remain unavailable, so no invented hit rates are shown.
- Odds input mode changed from numeric to text in generator and ranked bounds so iOS can access minus/plus. Other odds-entry components require the Phase 2 surface audit.
- Browser checked 375×812 mobile layout, no horizontal overflow, 10am–11am slider, negative -230 entry, market Clear/Select all, and shared NFL rendering. Local feeds returned no picks: populated ticket behavior is tested with fixtures, not claimed as verified live-data coverage.
- No 50% page-height reduction is claimed in Phase 1. Site-wide density, live meters, Stats splits, cross-sport slips and ballpark expansion remain open.
