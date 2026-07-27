# Harness substitutions — what the test sandbox replaces (2026-07-25)

> # THE FAILURE MODE ESCALATES AS THE TOOL IMPROVES
>
> The range-compression detector was wrong three times. v1 and v2 were caught within
> minutes, because a **known-bad market** sat in the output and read the wrong way. v3 got
> that market *right* — and was confidently wrong about a different market, one with no
> control behind it. It survived review, went into three documents, and was only killed by
> asking whether the statistic was stable under a change that should not have mattered.
>
> **A tool's early errors announce themselves. Its late errors are indistinguishable from
> results.** So the checks have to get *stronger* as a tool starts working, not weaker:
>
> - **When a detector agrees with your control, that validates the control's row — not the
>   table.** Every other row is still unverified.
> - **Before believing an uncontrolled row, perturb something that should not matter** (the
>   sample, the ordering, a nuisance cut) and require the number to hold.
> - **Confidence in a tool is not transitive across its outputs.**
>
> This sits at the top of this file because it generalises past the harness: it is the reason
> to distrust the moment a measurement starts confirming things.

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
| **a COMMENT describing a branch production never takes** | `legacy/index.html` L2934 | the comment says *"stake weight = ¼-Kelly-proportional fraction: edge ÷ odds"*; L2999 sets `base = prob` in every disciplined mode, and the `edge ÷ odds` branch runs only in legacy `caesars_ev` | **PROVEN: three consecutive wrong characterisations of the allocator.** Not a code substitution but the same failure shape — the documented behaviour and the executed behaviour are different, and the doc is what gets read. Deliberate per `2292b85`; the comment was simply never updated |
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

### Fifth obligation: a persisted summary must carry its own provenance

The gate-activity check's first run reported `significant: FIRED` while every market sat at
n = 5–15, far below `SIG_MIN_N = 50`. Not a bug in the fix — **the stored summary predated
it**, written 2026-07-26T10:23Z while the constant was committed after.

> **A stale artifact and a live gate look identical unless the timestamp is checked.**

This cuts both ways, which is what makes it dangerous: after a fix, a panel still showing
the old behaviour is **not** failure; and a panel that looks right may be reporting a run
from before the change. Both readings are wrong, and neither is visible.

It applies to every persisted summary in the system — `pl:cal:summary`, the CLV report, the
Discipline log, `summary.disagreement`, and the gate-activity output itself.

**Rule: every persisted summary carries its computation timestamp AND the commit that
produced it; every reader displays both.** `gate_activity.py` now prints the summary's
timestamp with exactly that warning. The commit stamp is not yet written by anything —
recorded here as the obligation, not as done.

## THIRD METHODOLOGY RULE: a filter chain must be RUN, not reconstructed

Beside *"diff two things that should be identical"* and *"anything that can return an
identity value must be observable"*.

Both of us made this mistake on the same number. I reported that 2 non-HR tickets carrying
a `booksInd = 0` leg "reach the gate and are blocked", having applied `coreNoHR` and a
`czEv ≥ 2` test **directly to `d.parlays`**. The owner then specced a UI change on that
figure. The real chain — `shCardPool` → `shCoreEligible` → basis → `coreEvMin` → `nv_tax` →
consensus → `booksInd` — drops 20 of 67 tickets at `shCoreEligible` alone, on leg count and
odds ceiling, and neither of the 2 survives that far. **The true answer is zero.**

A reconstruction reproduces the filters you remember, in the order you remember them. The
ones you forget are exactly the ones that would have changed the answer, and the result is
always plausible — which is why nothing looks wrong.

**Rule: any claim of the form "N items pass/fail gate X" must come from executing the
production path, never from re-implementing its conditions.** Where the path needs inputs
that are not to hand, say the number is unmeasured rather than estimate it — the estimate
will be believed, and it will be believed most confidently when it is wrong.

### A fourth example of the class: `tsc` passing on a build that could not build

`npx tsc --noEmit` passed cleanly on a `app/builder/page.tsx` that then **OOM'd webpack at
4 GB**. The panel used nested ternaries inside a `.map` inside a conditional inside JSX;
types were perfectly valid and the bundler still could not finish.

**Type-correct and buildable are independent properties**, and the passing type check was
not merely unhelpful — it was **actively misleading about where to look**, because the
natural next move after a green `tsc` is to suspect anything except the file it just
approved.

**And the isolation was the diff-two-things technique applied to a build:** revert the page
alone, keep the engine change, rebuild. The engine built; therefore the page was the cause.
Naming it as the same technique, because it did not look like one at the time — the "two
things" were *the same tree with and without one file*, not two parallel implementations.

**Practical rule:** when a build fails for a reason the type checker cannot see, bisect by
reverting files rather than reading them. And never treat a green `tsc` as evidence about a
build failure.

---

## FOURTH METHODOLOGY RULE: a directional claim needs a population that could have gone the other way

Beside *"diff two things that should be identical"*, *"anything that can return an identity
value must be observable"*, and *"a filter chain must be RUN, not reconstructed"*.

I reported that every prop market was systematically model-high — 100% of K's, H+R+RBI, TB
and hits rows above the market. **It was an artifact of the population.** `categories` is,
by the engine's own comment, *"top 50 per market ranked by win probability, **ONE side per
line (the side the model favors)**"*. Selecting the favoured side manufactures the sign. The
measurement could not have produced any other answer.

What makes this its own rule rather than an instance of the reconstruction one: **the
magnitudes on that same population were fine.** `|pModel − implied|` is *side-invariant* —
choosing the over or the under leaves it unchanged — so the 23.1 pp figure survived
untouched while the sign next to it, from the same rows in the same table, was meaningless.
A population can be valid for one statistic and invalid for the neighbouring one.

**Rule: before reporting a direction, a rate, or a share, name the mechanism by which the
population could have produced the opposite answer.** If none exists, the number measures
the selection, not the subject. Corollary: when a table mixes signed and unsigned statistics,
check them separately — validity does not propagate across columns.

The re-measurement (`propBoard`, both sides oriented to the over, uncapped) reversed the
headline: the board is 48% high overall, and `pitcher_outs` is the *only* one-sided market —
0 of 38 — which is what made it a finding instead of one entry in a uniform column. **The
artifact was hiding the real result**, not merely inflating it. See
`docs/pitcher-outs-audit.md`.

### A fifth example of the class: a finding filed against the wrong subject

`docs/hrr-recalibration.md` recorded, while auditing H+R+RBI, that *"Expected innings: not
explicitly in the closed form — there is no hook-timing term."* **Pitcher outs IS expected
innings.** The audit found the defect and filed it under the market where it was a secondary
effect, never checking the market it most directly governs — where it is the primary one,
and where it is now measured at −2.6 outs per start on deep-start pitchers.

**Rule: when an audit records a structural hole, enumerate every market or code path that
hole most directly governs, and check them in the same pass.** A hole recorded against one
subject reads, on later re-reading, as a fact *about that subject* — which is exactly how it
stays unchecked everywhere else.

---

## FIFTH METHODOLOGY RULE: a test count comes from that run, and red is reported first

I reported **"418 tests passing"** on two consecutive commits (`dfe5352`, `2f478c4`) while
`tests/autopsy-floors.test.ts` was **red**. It had been red since `dfe5352` itself, which
added `type` to the `nv_tax` blocked entry and broke an exact `toEqual`. The count was right
(418 tests exist); the *claim attached to it* was not checked. The owner accepted it twice,
which is what makes it a process failure rather than a slip — a success claim nobody can
audit is worse than no claim.

**Rule, two parts:**
1. **The test count in a report comes from that run's own output.** Not from the last run,
   not from the expected total, not from memory. If the suite was not run, say it was not run.
2. **A red suite is reported as red BEFORE anything else in the message** — above the
   findings, above the headline, before any result that depends on the build being sound.

**Corollary, and the argument against loosening assertions:** the exact `toEqual` is what
caught the shape change. `objectContaining` would have passed silently and the extra field
would have entered the blocked-entry contract unrecorded. The assertion was updated to
include `type` and **deliberately kept exact**. When a strict assertion fails on an intended
change, the fix is to update the expectation, never to weaken the comparison.

---

## THE CLAMP DEGENERACY AUDIT — the third drift check (2026-07-26)

`tools/factor_activity.py` catches an **input** that has gone missing. `tools/gate_activity.py`
catches a **threshold** that can never be reached. Neither could see
`shClamp(0.140/oo, 0.86, 1.12)` sitting on its floor for 100% of rows — because a pinned
clamp emits a perfectly plausible number, and no value moved.

`tests/clamp-activity.test.ts` closes that gap. It replaces `shClamp` with a recorder,
attributes each call to a source line via the stack trace (the engine is `eval`'d verbatim,
so frame line numbers map to `legacy/index.html` by the `<script>` offset), and reports per
site: input samples, fraction at the low bound, fraction at the high bound, fraction in
range. The snapshot is committed, so **a clamp that starts or stops binding fails the test** —
a behaviour change with no parameter movement behind it, which is exactly what no frozen
parameter table can show.

**Result on the armed fixture slate — 25 of 30 static call sites executed:**

| | |
|---|---|
| **L2258** `[0.86, 1.12]` | **100% low, 0% in range** — the `pitcher_outs` defect. The only site ≥80% at one bound. |
| L1615 `[0.95, 1.06]` | 37% low / 37% high, **27% in range** |
| L2055 `[0.85, 1.18]` | 36% / 27%, 36% in range |
| L2319 `[0.85, 1.18]` | 40% / 20%, 40% in range |
| 21 others | ≤ 46% pinned; 9 sites never bind at all |

**Two pathologies, and they need different fixes:**
- **OFFSET** — pinned at *one* bound (L2258). The neutral point is wrong; the factor conveys
  nothing and is really a flag. **This is the flagged class.**
- **SATURATED** — pinned at *both* bounds (L1615: 37/37, only 27% in range). The clamp is
  narrower than its input, discretising a continuous signal into three states. It still
  carries information, just far less than its presence in the code implies.

**The audit rediscovered both pins independently.** Of the 5 cold sites, **L1605 is
`shUmpKf`'s live path and L1696 is `shPenQF`'s** — dead behind `umpKFrozen`/`penQFrozen`,
matching `gate_activity.py` category B exactly. That agreement between two instruments built
for different purposes is the evidence that this one measures what it claims to.

**Cold sites are listed, never omitted** — same rule as `gate_activity.py`'s UNREADABLE
section. **L1617 (`shTempF`) is a harness limitation, not a finding**: the fixture slate
carries no `g.weather.temp`, so the guard returns 1 early. It is production-active and
**unmeasured here**, which is not the same as in range. L2175 is the ML closed-form fallback,
dead code whenever the sim is armed; L2402 is the live-sim marginal, and the fixture is
entirely pregame.

**Denominator:** this runs on the **armed fixture slate** (real captured MLB data,
2026-07-09), not the live board — a regression instrument, per the same rule stated in
`tests/armed-baseline.test.ts`. The cross-check that it is not merely internally consistent:
**L2258 reads 100% low-pinned here and was independently measured at 35 of 35 low-pinned on
the real 2026-07-26 board** by `tools/outs_audit.py`.

### The two saturated sites, classified explicitly

**L2055 (sim) and L2319 (closed form) are the SAME expression twice** — the `power` factor:

```js
power = shClamp((eraQ/4.20 + (whip!=null ? whip/1.30 : 1))/2, .85, 1.18)
```

L2055 lives in `batVec`, feeding the **sim's** batter-vs-starter rates; L2319 is the
**closed-form** batter branch, feeding `hrF`, `tbF`, `hF` and — directly — H+R+RBI's λ
(`lam = rate * (coors?1.08:1) * power`, L2359). The v2 version blends FIP into `eraQ`; the
sim version uses raw ERA.

| site | low | high | in range | **pinned** |
|---|---|---|---|---|
| L2055 `power` (sim) | 36% | 27% | 36% | **64%** |
| L2319 `power` (closed form) | 40% | 20% | 40% | **60%** |
| L2054 `contact` (sim) | 14% | 23% | 64% | 36% |
| L2318 `contact` (closed form) | 0% | 9% | 91% | 9% |

**Verdict: SATURATED, not OFFSET, and it is not benign.** The input is a pitcher-quality
index centred at 1.0 by construction (4.20 ERA and 1.30 WHIP are the league values), and it
*straddles* both bounds — so the neutral point is right and this is not the L2258 pathology.
But the input's real range is roughly **0.68–1.33** (a 2.50 ERA / 1.00 WHIP ace prices at
0.68; a 6.00 / 1.60 starter at 1.33) against a clamp admitting **0.85–1.18**. The clamp
compresses a ±33% real spread into ±17%, and binds on ~60% of calls — so for most matchups
the model sees the opposing starter as one of two values with no gradation.

**`contact` is fine** (9–36% pinned); only `power` saturates. The asymmetry is itself the
tell: `contact` is `whip/1.30`, a single ratio, while `power` averages two ratios and so
inherits the wider of the two spreads without a wider clamp.

**Accounted for, and NOT downstream-confirmed.** An earlier version of this section claimed
`power`'s saturation was the mechanism behind an H+R+RBI range compression of 0.50. **That
compression was an artifact and is retracted** (see below and `docs/pitcher-outs-audit.md`);
on the uncapped population H+R+RBI reads 1.78, *wider* than the market. So `power`'s 60%
saturation is a real measurement with **no demonstrated downstream consequence**. It stays in
the frozen-table notes because a factor delivering a near-constant to two thirds of the board
is worth knowing regardless — not because it has been shown to cost anything.

**Both `power` sites are recorded as accounted for.** Frozen; owner signs off.

---

## THE RANGE-COMPRESSION DETECTOR — the fourth check, and it failed twice before it worked

`tools/range_compression.py`. A model can be **centred correctly and still unable to reach
the tails**; a bias check reports that as a small mean error, and nothing named it.

**All THREE failures are recorded because each produced a confident, plausible, ranked table.**

1. **Probability space is the wrong space.** The first version compared the spread of
   `pModel` against the spread of `implied` and reported `pitcher_outs` as **1.20× WIDER**
   than the market — the exact opposite of the defect it was written to find. Probability is
   a transform of *(λ, LINE)*, and the lines differ across rows, so a model whose λ range is
   too narrow can still read wide simply by sitting at varying distances from varying lines.
   Fixed by inverting both sides through the engine's own Poisson into **λ space**.
2. **Then the side orientation was wrong.** `categories` carries one side per line and it is
   the UNDER for 35 of 38 outs rows; inverting P(under) through an OVER cdf prices a
   different event. It read **2.32× wider**. This is the fourth methodology rule biting a
   second time inside one tool, on a statistic I had already declared side-invariant — and it
   *is* side-invariant for `|gap|`, which is why the earlier claim stands and this one still
   broke. **Side-invariance is a property of a statistic, not of a population.**

3. **Then the POPULATION was wrong — the failure that actually mattered, because by this
   point the tool looked right.** v3 was oriented, in λ space, and reported `pitcher_outs`
   0.51 (real) alongside **H+R+RBI 0.50 (not real)**. `categories` is *"top 50 per market
   ranked by win **probability**"*, and probability is a function of `pModel` — **the sample
   was selected on the model side of the ratio.** `--truncation-check` proves it: restricting
   to the top 30/20/12 swings H+R+RBI 0.50 → 2.10 → **4.88** → 1.83 and hits 2.96 → 10.24 →
   13.05 → **15.66**. **A statistic that moves 10× under truncation is measuring the
   truncation.** Fixed by moving to `propBoard` (uncapped, over-oriented, not ranked on
   anything the model produces), recovering the raw `pModel` from the stored blend and
   **checking that recovery rather than assuming it** — median error −0.01 pp, max 0.26 pp
   over 223 rows, printed every run.

Only after all three fixes does the tool report a stable result: **`pitcher_outs` 0.50 and
nothing else**. H+R+RBI is 1.78 — *wider* — and its earlier 0.50 is withdrawn.

**Three lessons, and why they belong in this file:**

**(a) A detector that returns a confident number is not thereby working.** All three broken
versions produced ranked tables with plausible verdicts. The only reason any was caught is
that a **known-bad market** sat in the output and read the wrong way. **Build a detector
against a case whose answer you already know, and treat disagreement with that case as a bug
in the detector until proven otherwise.** `pitcher_outs` was the positive control for this
instrument before it became one for Phase 2.

**(b) The failure mode escalated as the tool improved.** v1 and v2 were wrong in ways the
control immediately exposed. v3 got the control *right* and was wrong about a market with no
control — which is far more dangerous, and was caught only by asking whether the statistic
was stable under a change that should not have mattered. **When a detector agrees with your
control, that validates the control's row, not the table.** Add a stability check against a
nuisance parameter before believing an uncontrolled row.

**(c) SIXTH METHODOLOGY RULE — a statistic computed on a SELECTED population measures the
selection, unless the selection is on a variable independent of the statistic.**

This is the third time selection has produced a false reading, and the three look nothing
alike from the inside:

| # | selected population | selected on | false reading it produced |
|---|---|---|---|
| 1 | `categories` rows | one side per line (the side the model favours) | "100% of prop markets are model-high" |
| 2 | the parity fixture | `coreNoHR` and the leg/odds caps upstream of the gate | "2 non-HR tickets reach the `booksInd` gate" (real answer: 0) |
| 3 | `categories` rows | top 50 by win **probability** — a function of `pModel` | "H+R+RBI λ range is half the market's" (real answer: 1.78× wider) |

The test is mechanical and takes one line of thought: **name the variable the population was
selected on, and ask whether the statistic is a function of it.** Side selection is a
function of `sign(pModel − implied)` → signs invalid, magnitudes fine. Probability-rank
selection is a function of `pModel` → anything comparing `pModel`'s distribution to
something else is invalid. Chain-position selection is a function of the upstream filters →
any "N reach gate X" claim is invalid without running the chain.

**(d) SEVENTH RULE — check that a ratio's numerator and denominator describe the same
population, BEFORE inferring anything from the ratio's sign.**

Proposed after I claimed `shClamp(expAB/abG, 0.85, 1.15)` was a units bug because the factor
ran upward on 86% of rows. **It is not.** `bn.r` is H+R+RBI per game *played* and `abG` is AB
per game *played*; they cancel exactly:

```
(HRR/G) x expAB/(AB/G) = HRR x expAB / AB = (HRR/AB) x expAB
```

— a per-game rate converted to per-AB and rescaled to tonight's ABs, which is the same shape
hits/TB/HR already use explicitly. The owner approved a fix on my premise; the fix was not
applied and the premise is retracted.

**The rule is right even though this instance passes it**, and that is the point: running the
check is what caught the error. State the population of the numerator, state the population
of the denominator, and only then read the sign. A mismatch produces a *systematically signed*
error — which looks exactly like a real directional finding — and a clamp then hides its
magnitude, so the sign is all you ever see.

**And the failure that actually occurred is the fourth rule turned on its author:** I read a
direction (86% upward) off a real measurement and supplied a mechanism for it without
checking the mechanism. The population could not have gone the other way — `expAB > abG` is
the normal case for an everyday starter — so the 86% was never evidence of anything.

**(e) EIGHTH RULE — a mechanism is a hypothesis until it is traced to a line. A measurement
that survives a wrong mechanism is still a measurement.**

The record for this phase, both sides:

| measurement | first mechanism offered | verdict on the mechanism | did the measurement survive? |
|---|---|---|---|
| outs factor 100% low-pinned | `0.140` is the wrong TB/AB constant | **held** | yes |
| outs tail −2.57 outs | "no hook-timing term" | **wrong** — it is the `k=4` shrinkage | **yes** |
| H+R+RBI λ IQR 0.50 | `power` clamp saturation | **wrong** — it was the top-50 cap; finding retracted | **no — the measurement itself was the artifact** |
| PA factor upward on 86% | denominator mismatch | **wrong** — the algebra cancels | **yes** |
| 1/8 Kelly +6.4 bp | over-concentration | **wrong** — it is edge-blind base weighting | **yes** |
| `base = prob` | production diverging from intent | **wrong** — deliberate, spec'd in `2292b85` | **yes** |
| H+R+RBI +11.5/−1.4 split | `expAB` full-start assumption | **wrong** — no part-timer concentration | **yes** |

**Seven mechanisms offered, five wrong, and the measurement survived every time except the
one where the measurement was itself the artifact.** That asymmetry is the rule: numbers
computed from a defensible population outlive the stories told about them, and the stories
are where both of us have been wrong at roughly the same rate.

**Practically:** state the measurement first and separately; label the mechanism as a
hypothesis until a file and line number are attached; and when a mechanism dies, re-check
whether the *measurement* dies with it — sometimes it does, and that is the case that
matters most (row 3 above).

### RUN THE AUDIT AFTER EVERY CONFIRMED INSTANCE, NOT AFTER EVERY CONSEQUENCE

The coverage-denominator series has four instances, and **how each was found is the argument**:

| # | site | found by | would a consequence have surfaced it? |
|---|---|---|---|
| 1 | `bestBoard` whole-day comparison | **a consequence** — a 9am board winning against the evening board | yes, and it did |
| 2 | the staleness gate | **a consequence** — same wrong number, next reader | yes |
| 3 | `achievableCoverage` | **testing a recommendation before making it** — the Sunday 22:30 entry would have been a silent no-op | **no.** It would have looked like the entry simply never helping |
| 4 | `luCoverage.pct` (engine) | **an audit that existed only because #3 did** | **never.** It is display-only, so no consequence exists to surface it |

**Instances 1 and 2 cost something before they were found. Instances 3 and 4 cost nothing,
because the audit ran first — and #4 could not have been found any other way**, since a
mislabelled number nobody reads produces no symptom, until the day someone reads it.

**The rule: a confirmed instance is the trigger for a full audit of its class, immediately,
across every call site — not a note to check the others when they misbehave.** The audit is
cheap (one grep and one afternoon); the class is not. And it must enumerate sites that
*cannot* misbehave today, because those are precisely the ones no consequence will ever
report.

Corollary to the eighth rule: **the value of an audit is highest exactly where nothing is
going wrong yet.** That is the opposite of how attention naturally allocates.

**And the re-check has to come from a DIFFERENT instrument than the one that produced the
artifact.** Row 3 was not caught by re-reading the range detector or by re-running it; it was
caught by the **truncation check**, a separate probe asking whether the statistic was stable
under a change that should not have mattered. An instrument cannot audit itself — its
artifacts live in its own assumptions, which it applies identically on every re-run. The same
pattern held elsewhere in this phase: the H+R+RBI ladder claim was scoped by the **sim/closed-
form split**, not by re-running the ladder test; the `booksInd` count was corrected by
**executing the chain**, not by re-reading the reconstruction. **Independence of the checking
instrument is the load-bearing property, not the number of checks.**

**(f) Side-invariance is a property of a STATISTIC, not of a population.** `|pModel − implied|`
is genuinely side-invariant, which is why the magnitudes measured on `categories` stand. The
spread ratio is not, and neither is anything conditioned on probability rank. Establishing
that a population is safe for one statistic says nothing about the next one computed on it.

### The convergence, stated plainly (2026-07-26)

**Four instruments built for four different purposes — the `case`-string arithmetic, the
`shShrink` k audit, the clamp audit and the range detector — independently converge on
`pitcher_outs`, and only on `pitcher_outs`.** That is the strongest validation this toolchain
has produced, and it is worth naming as the standard: a finding supported by one instrument
is a hypothesis; one that survives instruments with different failure modes is a result.

The same convergence is what killed the H+R+RBI claim: it had **one** instrument behind it,
and the moment a second (the fixture stage-decomposition, `tests/hrr-compression.test.ts`,
1.62× *wider*) and a third (the uncapped population, 1.78× wider) were applied, it did not
survive. **Convergence is only evidence when the instruments could have disagreed** — which
is exactly why the retraction matters as much as the confirmation.
