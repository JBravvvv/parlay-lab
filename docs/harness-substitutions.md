# Harness substitutions — what the test sandbox replaces (2026-07-25)

## Why this file exists

339 tests passed, the parity digest was byte-identical, and a **24% hole in every
server board survived for a week**. Not because a test was missing — because
`createEngine` **replaced the function that had the bug**. Whenever `today` is pinned
the harness swaps `obSameDay` for a UTC-string comparison, so the suite exercised
neither production behaviour nor the browser's. It simulated the bug and called it
green.

A substitution is not a mock detail. It is a **region of production behaviour the suite
structurally cannot see**. This file names every one of them, and
`tests/harness-manifest.test.ts` fails the build if a substitution is added without an
entry here.

## The rule

1. **Every substitution is listed below**, with what it diverges from and what could
   hide behind it. Enforced by test.
2. **Time- and timezone-dependent behaviour is tested at BOTH `TZ=UTC` and
   `TZ=America/Los_Angeles`, never patched out.** This now covers **any date-deriving
   function**, not just the engine's: three server-local date defects have shipped or
   nearly shipped in this codebase — `obSameDay` (~24% of every server board),
   `CAL_START` (caught pre-ship), and `/api/generate` (wrote the board and its
   prediction rows under *tomorrow's* date after 00:00 UTC). All three were the same
   mistake, and `/api/clv` had the correct pattern in the repo the whole time. Server
   routes derive dates only from `ptToday()` (`src/lib/server/pt-date.ts`), and
   `tests/server-date-basis.test.ts` asserts it at both timezones. The server runs UTC and the phone
   runs Pacific; any function whose output depends on the host calendar day must be
   proven identical in both. Pattern: `tests/timezone-parity.test.ts`.
3. A substitution that exists only to pin determinism (a frozen clock, a seeded RNG)
   is fine. A substitution that **changes a decision rule** — what gets filtered, what
   counts as today — is a defect generator and needs a paired both-TZ test.

## Behavioural substitutions — these change engine decisions

| substitution | when | diverges from production by | what can hide behind it |
|---|---|---|---|
| `obFetchJson` → `deps.fetchJson` | always | no real HTTP: no headers, quota, retries, redirects, or error shapes | wrong URL construction (the fixture router matches on substrings, so a malformed query can still route); quota/429 handling; partial-response handling |
| `shToday` → `() => today` | only when `today` is pinned | production derives the date from the **host local clock** | every TZ-dependent date decision — the server's day and the phone's day are not the same day for ~7 hours of every 24 |
| `obSameDay` → `iso.slice(0,10) === today` | only when `today` is pinned | production compares **host-local calendar dates** | **PROVEN: the 24% slate hole.** Fixed 2026-07-25 by removing `obSameDay` from the engine path entirely; the substitution remains for other pinned-date tests |

## Environment shims — these change what the engine can observe

| shim | production | what can hide behind it |
|---|---|---|
| `console.{log,warn,error,info}` → no-ops | real console | **every diagnostic the engine emits.** A warning that should be loud is silent in tests and in the sandbox generally |
| `setTimeout` / `setInterval` → return 0, never fire | real timers | any retry, debounce, backoff or polling path — callbacks are never invoked, so timer-driven code is untested by construction |
| `clearTimeout` / `clearInterval` → no-ops | real | mismatched clear logic |
| `requestAnimationFrame` → returns 0, never fires | real rAF | animation/measurement paths (not used by the engine) |
| `fetch` → always `{ok:false, status:0}` | real fetch | any code that bypasses `obFetchJson` and calls `fetch` directly — it always sees failure, so its success branch is never exercised |
| `XMLHttpRequest` → inert stub | real XHR | legacy XHR paths |
| `localStorage` → in-memory (or the caller's) | real storage | quota exhaustion, cross-tab writes, persistence across reloads |
| `document`, `window`, `head`, `body` → element stubs | real DOM | all rendering. Low risk: the engine is compute-only, which is what builds 39–44 proved |
| `navigator.onLine` → always `true` | real | offline branches |
| `matchMedia` → `{matches:false}` | real | media-query branches |
| `location.reload`, `history.replaceState` → no-ops | real | reload/navigation side effects |
| `addEventListener` / `removeEventListener` → no-ops | real listeners | every event-driven path: visibility changes, online/offline, storage events, pageshow. Nothing the engine registers is ever fired |
| `scrollTo` → no-op | real | scroll side effects (UI only) |

## The inventory has now caught two measurement errors in one day

1. **The 24% slate hole** — `obSameDay` replaced by a UTC-string comparison, so the
   suite tested neither production nor the browser.
2. **The blob size** — quoted at 517KB (measured with `today` pinned), then 198KB
   (unpinned, where the stat-range fixtures stop matching and prop rows silently
   vanish), against a real 539KB. Same root cause: a harness substitution changing
   what the measurement was actually measuring.

Both were *measurements taken through the harness and reported as facts about
production*. That is the argument for the manifest rule — not that mocks are bad, but
that a number measured behind a substitution is a number about the substitution.

## OPEN ITEMS — ranked by risk

### 1. `setTimeout` / `setInterval` never fire — HIGHEST RISK (owner-flagged, 2026-07-25)
The sandbox returns `0` and never invokes the callback, so **every retry, backoff and
pacing path in the engine is untested by construction**. The one that matters is
`/api/clv`'s self-pacing: `RATE_MS` (25 min) and `WINDOW_MS` (45 min) decide whether a
leg gets its pre-pitch sighting, and a missed sighting is the single unrecoverable loss
in the whole system — no backfill, the close is gone. A pacing bug there would be silent
in tests, silent in production, and only visible weeks later as thin CLV coverage.

**A minimal test would not need timers at all.** The pacing decisions are pure functions
of `(now, lastRun, game start)`; what makes them untestable today is that they read the
clock inline. Extract them — e.g. `shouldRun(now, lastRun)` and
`legsInWindow(entry, now, windowMs)` — into pure predicates the route calls, then assert
a table: a run 24 min after the last one is refused and 26 min is allowed; a leg 44 min
from first pitch is in the window and 46 min is not; a game already started is never
sighted. Perhaps 30 lines of test against ~10 lines of extraction, and it needs no fake
timers, which is precisely why it is worth doing before Phase 2 leans harder on CLV.

### 2. `console.*` silenced
Every diagnostic the engine emits is invisible — in tests *and* in the sandbox at
runtime. A `data_gaps` line is the only channel that survives, which is why the
timezone fix routes its disclosure there rather than to `console.warn`.

### 3. `fetch` always fails
Any path that bypasses `obFetchJson` sees a permanent failure, so its success branch has
never run. Low risk today (the engine routes I/O through the injected fetcher), but it
would hide a newly added direct call completely.

## NOT substituted (and must stay that way)

- **`Date`** — the host clock and host timezone are real. This is what makes
  `tests/timezone-parity.test.ts` possible at all. Pinning it globally would recreate
  exactly the blindness that hid the 24% hole.
- **`Math.random`** — the engine seeds its own RNG (`shMulberry`), so determinism
  comes from the algorithm rather than from a patch.

## `obSameDay` after the fix

The engine no longer calls it. Its two remaining callers are **legacy-UI only** and are
never reached through the `collectSlate` / `analyze` facade the Next app uses:

- `gTime` (L912) — display helper: shows a time for today, a date otherwise.
- `obLoadGames` (L924) — the legacy odds-board tab.

Both are dead code in the Next app and retire with `legacy/` at cutover. They are named
here so a future reader doesn't find a timezone-sensitive function still in the file and
assume the defect is still live.

## THE SILENT NO-OP IS A CLASS, NOT A COINCIDENCE (2026-07-25)

Three instances now, each found by accident while looking for something else:

| # | instance | what was silently doing nothing | how it surfaced |
|---|---|---|---|
| 1 | **`obSameDay` substituted in tests** | the harness replaced the real date gate, so the suite could not see that the server board was dropping ~24% of every slate | a timezone probe for an unrelated question |
| 2 | **`calW` missing the merge** | per-market calibration multipliers were computed and never applied on one of the two arming surfaces | a config diff between the cron and the client |
| 3 | **`data/pen_quality.json` never committed** | `shPenQF` returned identity for every team, every day, from the day it shipped | a workflow divergence audit for an unrelated push to `main` |

None of the three was a crash, a wrong number, or a failing test. **In all three cases the
system reported success while a component contributed nothing.** Three is a class.

### The general rule

> **Anything that can return an identity value on missing, stale, or insufficient data must
> be observable somewhere — so that "contributing nothing" is never indistinguishable from
> "working."**

Identity fallbacks are the correct *behaviour* (a factor that guesses on thin data is worse
than one that abstains — the `ip >= 15` guard in `shPenQF` was right). The defect is that
abstention is **unobservable**. A guard that refuses to act should say so.

### What this obliges, concretely

1. **Every identity-returning factor is counted, not just implemented.**
   `tools/factor_activity.py` reports the live share of all seven on a real slate, and
   `docs/collection-period.md` carries a dated baseline. A material change in a share is a
   finding with the same standing as a frozen-parameter drift.
2. **A test that a factor CAN act is not a test that it DOES act.** All seven have unit
   tests proving the formula. All seven passed while two of them were returning identity on
   every real row. Unit coverage of the calculation and coverage of its *activation* are
   different things, and only the second would have caught any of these.
3. **A guard threshold is a scheduled event, not a constant.** `shPenQF` fails a 15-IP guard
   forever because its data never accumulates; `shUmpKf` fails a 5-game guard **today** and
   will pass it around 2026-08-04 with no code change. Both are invisible to a value-based
   drift check. Any new guard threshold should be recorded with the date it is expected to
   clear, or with an explicit note that it never will.
4. **Deriving a value and committing it are different steps.** The `pen_quality` *aggregate*
   was present and plausible in `context.json` the whole time; only the accumulating source
   DB was missing. Inspecting the artifact showed nothing wrong. When a workflow writes both
   a derived artifact and a state file, the state file is the one that silently rots.

### The pattern in all three

Each was caught by comparing **two things that should have been identical** — test harness
vs production, cron config vs client config, `main`'s workflow vs `frontend-rebuild`'s.
None was caught by reading one of them carefully. That is the reusable technique: when a
component exists in two places, diff them; the diff finds what inspection does not.

## THE UNDIFFED PAIRS — the worklist (2026-07-25)

If every silent no-op so far was caught by diffing two things that should have been
identical, then the productive move is to **name the pairs that have never been diffed**
and work the list. Ranked by what a disagreement would invalidate.

| # | pair | what a mismatch would mean | status |
|---|---|---|---|
| 1 | `boardToPredictions` output **vs** `shTicketSnap` output, for the SAME leg | the calibration channel and the CLV/ledger channel are measuring **different numbers for the same bet** — every cross-channel comparison (model-vs-close, reliability slopes joined to P/L, the NV-tax accounting) is invalid | **owner's #1, not yet run** |
| 2 | `shGradeLeg` (engine) **vs** `gradePrediction` (calibration cron) | two graders disagreeing anywhere means **P/L and reliability disagree** about what happened. The settlement audit fixed orientation in both, but no systematic full-slate diff has been reported | **owner's #2, not yet run** |
| 3 | client `armV2()` **vs** `/api/generate`'s arming block | the original `selMode` defect. Now covered by `arming-parity.test.ts` at the call site | **diffed, covered** |
| 4 | `main` **vs** `frontend-rebuild` workflow copies | found the `context.yml` split | **diffed 2026-07-25; re-run whenever either is touched** |
| 5 | fixture harness **vs** production engine environment | found `obSameDay`; and again on 2026-07-25 — the harness has **no `context.json` route**, so `SH_CTX` is absent in every board test and all seven identity factors are unexercised there | **partially diffed; the `SH_CTX` gap is open** |
| 6 | `shDevigPair`/`shDevig2` in the engine **vs** the Python `imp`/de-vig in `snapshot_props.py` and `snapshot_odds.py` | the archives are the measurement instrument for the freeze. If their de-vig differs from the engine's, every archive-derived number this phase produced (the 1.071 overround, the independence table, the movement percentiles) is measuring a slightly different quantity than the engine acts on | **added here; not yet run** |
| 7 | `/api/clv`'s consensus fair **vs** the board's `fair` for the same leg | CLV is scored as `closing fair − locked implied`. If the two fairs are built differently, CLV has a constant offset — and CLV is the freeze's primary scoreboard | **added here; not yet run** |
| 8 | `SIM_PATHS` in `engine-client` **vs** the value the server actually arms | already a known unequal pair (50,000 / 10,000–20,000), documented as deliberate. Worth a standing assertion that it stays deliberate | **known, undocumented as a test** |
| 9 | `lkey` construction in `shLegKey` **vs** the `lkey` parsing in the gate, grader and `lineOf()` | a key built one way and split another is how a market or line silently drops out of a filter — the HR three-lines bug was this shape, caught only by validation | **added here; not yet run** |

**Run order is the owner's:** 1, then 2, then the rest. Items 6, 7 and 9 are proposed
additions from the same reasoning, not requests.

**The general form:** any value that is computed in two places, or crosses a process
boundary (engine ↔ cron, engine ↔ archive tool, JS ↔ Python), is a candidate. The
question is never "is this code correct" but "do these two agree, and has anyone checked."

## THE 8ed8dd2 RETRO DIFF — every mover identified, not just "nothing else moved"

Run 2026-07-26 against the armed harness held constant while only the engine varied:
`8ed8dd2` (the phase handoff) checked out in an isolated worktree, `tests/fixtures/fix45`
and `tests/helpers/fixture-env.ts` copied in from HEAD, same `armedDigest`, same frozen
clock, same pinned `SIM_PATHS_FIXTURE`.

### The control lands exactly

| section | 8ed8dd2 → HEAD |
|---|---|
| `categories.ml` | 9 → 15 rows (**+6**) |
| `categories.rl` | 9 → 15 rows (**+6**) |
| `batter_hits`, `batter_total_bases`, `batter_home_runs`, `pitcher_outs` | **+0, byte-identical** |
| `categoriesLive`, `parlaysLive`, `alloc` | **byte-identical**, including the blocked list and its reason |

**The six recovered games, and only the six.** The timezone fix behaved exactly as
`docs/rebaseline-2026-07-25.md` says it should.

### Two sections moved that the control does not explain — and they are the PINS

`categories.pitcher_strikeouts` (8 rows) and `categories.batter_hits_runs_rbis` (14 rows)
differed. The tell was in the tags: K rows carried **`ump-zone`** at `8ed8dd2` and did not
at HEAD.

- **K rows** — `SH_CFG.umpKFrozen` (commit `29400d0`). The fix45 context carries
  `hpUmp.g` spanning 3/5/9/40 with `kFactor` set at g ≥ 5, precisely so the guard is
  exercised, so `shUmpKf` fires at `8ed8dd2` and returns 1 at HEAD.
- **H+R+RBI / ml / rl probabilities** — `SH_CFG.penQFrozen` (commit `2ee13c5`). fix45's
  `pen_quality.ip` alternates 9.0/40.0, so half the teams clear the 15-IP guard;
  `shPenQF` feeds `penH`/`penA` into the sim's late-game run scoring.

**Proved constructively rather than asserted.** Re-running HEAD with
`armedFixtureEngine({ pinned: false })` reproduces `8ed8dd2` **byte-for-byte** on
`categories` (every market, including both movers), `categoriesLive`, `parlaysMixed`,
`parlaysLive`, `alloc` and `fun`. Only `parlays` and `pool` still differ — and those are
where the six recovered ml/rl games land (89 → 94 tickets, 42 → 48 pool).

### Verdict

| commit | change | verified effect on the board |
|---|---|---|
| `c5d0594` timezone fix | slate membership | **+6 ml, +6 rl** — the control |
| `68c5743` price-age lock guard | `shLockCard` | **none** |
| `1d64f53` propBoard | additive board key | **none** |
| `0870d53` booksInd | fields + `shAllocate` gate | **none** (no affected ticket reaches the gate on this fixture) |
| `2ee13c5` penQFrozen | pinned factor | **exactly the pin**, HRR/ml/rl probabilities |
| `29400d0` umpKFrozen | pinned factor | **exactly the pin**, K probabilities |

**Four commits verified as producing zero board change; two produce exactly their pin
effects and nothing else.** The parity story is closed.

### A correction this surfaced about my own claim

I said the pins "change nothing today", citing the production measurement (`kFactor` null
on all 15 real games, `pen_quality.ip` 3.0–12.3 against a 15-IP guard). **That is true in
production and false on the armed fixture** — where they move 8 K rows and 14 H+R+RBI rows,
because the fixture was deliberately built to exercise both guards. Production-inert,
fixture-active. I should have predicted that in the diff rather than discovered it.

## PAIR #2 — engine de-vig vs the Python archives. A real divergence; no measurement affected

| | de-vig |
|---|---|
| engine (`shDevigPair`) | **Shin** (`shShin2`) whenever `SH_V2.shin` is armed — always, in production |
| `tools/snapshot_props.py` | **proportional**, `io / (io + iu)` |
| `tools/snapshot_odds.py` | **none — it stores RAW PRICES** (`compact()` keeps `{team: price}` per book) |

Divergence measured across the realistic price range:

| fav/dog | overround | proportional | Shin | diff |
|---|---|---|---|---|
| −110 / −110 | 1.048 | 50.00% | 50.00% | **0.00 pp** |
| −200 / +170 | 1.037 | 64.29% | 64.81% | 0.53 |
| −500 / +400 | 1.033 | 80.65% | 81.67% | 1.02 |
| +400 / −520 | 1.039 | 19.25% | 18.06% | **1.19 pp** |

Zero at even money, growing with imbalance — the known Shin property of attributing more
of the vig to the longshot. Note `snapshot_props.py`'s docstring already says
"proportional-devig … the classic CLV convention", so this is a **deliberate choice, not a
bug**.

### Which of this phase's retrospective measurements are affected? NONE.

| measurement | de-vig dependent? | why |
|---|---|---|
| the **1.071 overround** | **no** | computed as `imp(o) + imp(u)` — the raw sum *before* any de-vig |
| the **independence table** (`n`, books, Caesars-only) | **no** | counts whether a two-sided pair exists; the de-vig method cannot change that |
| the **movement percentiles** | **no** | `line-history` stores raw prices and the percentiles were computed on raw implied points |

The owner's prior was that overround and set membership were independent but that
consensus-fair movement was not. The first two are right; the third is **also** independent,
for a reason that had to be checked rather than assumed — the game-line archive never
de-vigs anything.

**Where the exposure actually is, for the future:** `props-history`'s stored `fair` field
*is* proportional and is **not** the engine's fair — up to ~1.2 pp apart at long odds.
Anything that later treats `props-history.fair` as the engine's consensus (a prop-CLV
reader is the obvious candidate) inherits that bias. The HR overround test dodges it by
construction: it consumes `bo`, the raw best price, not `fair`.
