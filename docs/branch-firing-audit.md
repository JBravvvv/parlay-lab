# BRANCH-FIRING AUDIT — what actually runs, and on which branch (2026-07-31, owner's items 1–3)

**The class**: GitHub Actions runs a scheduled workflow only from the **default branch's** copy
of the file. `git symbolic-ref refs/remotes/origin/HEAD` → **`refs/remotes/origin/main`**. Every
operational change this window was committed to `frontend-rebuild`, which is **326 commits ahead
of main** and fires nothing. Until tonight, every "shipped" claim about anything on a clock was
unverified.

**This was known once and lost.** `hr-overround.yml`'s own header, on main, says: *"like every
other workflow here, this is only SCHEDULED if it exists on the default branch (main)."* The pause
commit `a46c1f8` says it too. The knowledge existed in two files and in no instrument.

## 1. THE TWO BUCKETS — and why only one of them is stale

Every workflow on main pulls its **script** from `origin/frontend-rebuild` at run time, either by
checking that branch out (`ref: frontend-rebuild`) or by `git checkout origin/frontend-rebuild --
tools/<script>`. **`tools/` does not exist on `main` at all** (38 files, all added in the
frontend-rebuild direction).

| workflow (on main) | checks out | pulls its script from | script path |
|---|---|---|---|
| `props-history.yml` | `line-history` | `origin/frontend-rebuild` | `tools/snapshot_props.py` |
| `line-history.yml` | `line-history` | `origin/frontend-rebuild` | `tools/snapshot_odds.py` |
| `board-archive.yml` | `line-history` | `origin/frontend-rebuild` | `tools/archive_boards.py` |
| `hr-overround.yml` | `line-history` | `origin/frontend-rebuild` | `tools/hr_overround.py` |
| `context.yml` | `frontend-rebuild` | (same checkout) | `tools/build_context.py` |
| `model.yml` | `frontend-rebuild` | (same checkout) | `tools/build_priors.py` |

**→ SCRIPT-LEVEL CHANGES ARE LIVE THE MOMENT THEY REACH `frontend-rebuild`.** Proven, not
assumed: MIN_GAP lives in `tools/snapshot_props.py`, and on 07-30 ten props-history runs produced
ten deliveries and **five paid snapshots**, the five surviving gaps all ≥ 40 min. `MIN_GAP_S =
40 * 60`. The dedupe executed in production.

**→ ONLY YML-LEVEL THINGS CAN BE STALE**: schedules, concurrency, checkout targets, **step
arguments**, timeouts. That is exactly the set this audit covers, and exactly what
`tests/workflow-branch-sync.test.ts` now compares.

**Impossible branch — a workflow on main referencing a path absent from the branch it checks out:
DOES NOT FIRE.** All six scripts exist on `frontend-rebuild`. But the *argument* case does fire,
and it is worse; see `--wait` below.

## 2. EVERY OPERATIONAL CHANGE THIS WINDOW, WITH ITS BRANCH

| change | lives in | landed on | LIVE? |
|---|---|---|---|
| **MIN_GAP pre-dedupe** (07-29) | `tools/snapshot_props.py` | frontend-rebuild | **LIVE** — 10 runs → 5 paid on 07-30 |
| **props-history concurrency group + pull-rebase retry** (07-29) | `props-history.yml` | **main** `53d0076` | **LIVE** |
| **The bot pause** — model.yml schedule commented, context.yml drops `context.json` from `git add` (07-29) | workflows | **main** `a46c1f8` | **LIVE** — priors last written `671aed9` 07-29T15:58:41Z, context last `64c42ad` 07-29T20:32:00Z, **nothing since** |
| **line-history disable** ("effective now", 07-30) | `line-history.yml` | frontend-rebuild `70d64f0` | **WAS NOT LIVE** → **LIVE 2026-07-31** (`3356c54`, cherry-picked) |
| **props-history 07-27 redesign** — ten crons → three + `--wait` + `--fold-only`, `timeout-minutes: 330` | `props-history.yml` | frontend-rebuild only | **NOT LIVE** |
| **context.yml weekend `0 12` cron** (07-27) | `context.yml` | frontend-rebuild only | **NOT LIVE** |
| **TIMING classification comments** (07-27+) on five workflows | workflows | frontend-rebuild only | not live; comments only, no behavioural effect |
| **`ufc.yml`** (whole workflow) | `.github/workflows/ufc.yml` | frontend-rebuild only | **HAS NEVER FIRED** — the file is absent from main |
| The outs flag (4 engine edits) | `legacy/index.html` → served bundle | frontend-rebuild → Vercel | **LIVE** (verified in the served bytes) |
| Trigger mark, cfSel stamp, `mktN` on the echo | route/engine | frontend-rebuild → Vercel | **LIVE** — Vercel deploys frontend-rebuild (`vercel.json` `main: false`) |
| The four chain tools + `verify-served-engine.mjs` | `tools/` | frontend-rebuild | **LIVE for our own use**; not scheduled |

### What the not-live ones were supposed to have changed

- **line-history disable** — was to stop the job "effective now". It did not. The job kept
  delivering: **3 runs 07-28, 4 on 07-29, 4 on 07-30**, last `2026-07-30T21:53:41Z`, which is
  **7 h 28 m BEFORE** the disable commit (`70d64f0`, `2026-07-31T05:21:01Z`). So no run has
  occurred *since* the commit — but only because none was delivered, not because the commit did
  anything. Now genuinely stopped.
- **props-history 07-27 redesign** — was to replace ten lottery firings with ONE deterministic
  tick that holds the runner until the close window opens (`_wait_for_window`, `MAX_WAIT_S` =
  300 min), plus two cheap `pre` fallbacks and one `--fold-only` tick. **None of it ran.**
  Production has been running the 2026-07-26 ten-cron file and invoking
  `python3 tools/snapshot_props.py` **with no arguments** for four days. Two consequences:
  1. **`--wait` has never executed in production.** Every archived "close" is whatever happened
     to land, not a window-targeted capture. Any argument resting on close quality rests on a
     mechanism that never ran.
  2. **`--fold-only` has never run**, so a Vercel `/api/propsnap` capture has **never folded to
     git**. This is the MECHANISM behind the handoff §2 line *"no snapshot on 07-29 or 07-30
     carries `src: "vercel"`"*. That reading must restate: **absence of folded evidence is not
     absence of capture.** `/api/propsnap` returns to the candidate list for the residual.
- **context.yml weekend `0 12`** — was to resolve weekend umpires before first pitch (both other
  crons land after weekend games start). Never fired; weekend umpire resolution has never happened.
- **`ufc.yml`** — never scheduled at all.

### Is anything keeping the two branches in sync?

**No.** A repo-wide grep for a workflow, hook or test that pushes or compares against main returns
nothing. `main` has been updated **by hand, seven times since 2026-07-11** (`721d9ed`, `33b3868`,
`26fba50`, `ea520c6`, `1a19a26`, `ea5ce60`, `c2459c4`, `a46c1f8`, `53d0076`), each time as a
"scheduler copy" commit. The drift is the default state.

**Instrument defect #6**: `tests/workflow-timing.test.ts` enumerates `.github/workflows` from the
**working tree** (`fs.readdirSync(DIR)`, L32–33) — i.e. from the branch that does not fire. The
one guard over scheduled workflows has been reading the wrong branch since it was written.
NOT edited here; flagged for the owner.

### Was `ufc.yml` ever counted in a burn figure?

**No.** It appears in two job inventories (`session-handoff.md` §6, `collection-period.md` L8219),
both at **cost 0**, with the note "the client path spends" — which is correct for the wrong
reason: it costs 0 not only because the workflow makes no Odds call but because **it cannot fire
at all**. `credit-budget.md` never prices it. **No burn figure is wrong because of ufc.yml.**

## 3. THE ACTIONS RUN LOG AGAINST THE BURN SERIES (2026-07-28 → 07-31, 56 runs)

Runs by workflow, `event: schedule` unless noted: props-history 30 · line-history 11 ·
board-archive 5 · context 5 · priors 2 (07-28, 07-29 — both **before** the pause took hold) ·
`pages-build-deployment` 1 (`event: dynamic`).

| window | spent | props paid (events → credits) | line-history runs | known | **residual** | rate |
|---|---|---|---|---|---|---|
| 07-29 12:00Z → 07-30 03:55Z | 215 | 3 snaps, 18 ev → 108 | 2 → 12 | 120 | **95** | 6.0/h |
| 07-30 03:55Z → 16:45Z | 223 | 2 snaps, 20 ev → 120 | 2 → 12 | 132 | **91** | 7.1/h |
| 07-30 16:45Z → 07-31 01:25Z | 200 | 2 snaps, 10 ev → 60 | 2 → 12 | 72 | **128** | **14.8/h** |
| **07-31 01:25Z → 05:55:44Z** | **0** | **none** | **none** | **0** | **0** | **0/h** |

Total across the three spend windows: **638 spent, 324 attributed, 314 residual over 37.4 h =
8.4/h ≈ 201/day.**

### THE PRE-COMMITTED BRANCHES

- **"runs occurred inside the 0/h stretch → confirms event-driven": DOES NOT FIRE.** There were
  **zero Actions runs** between `2026-07-30T23:35:48Z` and now. The 4 h 26 m flat contains no
  scheduled delivery of any kind.
  **→ RETRACTION, 2026-07-31: the handoff §2 claim "A scheduled job cannot produce that … → THE
  CLASS IS EVENT-DRIVEN, NOT SCHEDULED" is UNSUPPORTED and withdrawn.** The flat is explained by
  *nothing ran*. It discriminates nothing. The reasoning error was inferring the absence of
  scheduled spend from cron *declarations* instead of from the run log — the same
  declarations-vs-delivery error as the ten-cron count, in the opposite direction.
  (Also withdrawn: "the flat stretch is the night." 01:25Z–05:55Z is **18:25–22:55 PT**.)
- **"no runs inside the spend windows → the ~224 is entirely non-Actions": DOES NOT FIRE.** Runs
  occurred in all three spend windows.
- **"line-history fired and spent → the disable is not live, it is in the burn, and item 4 becomes
  urgent": FIRES.** Item 4 executed the same turn.
- **"a workflow fires that is in no inventory → that outranks everything else": FIRES, on a
  technicality that must be printed rather than swallowed.** `pages-build-deployment`, `event:
  dynamic`, branch `main`, 5 runs (07-12, 07-26, 07-27 ×2, 07-30T03:03:28Z), all success. It is
  GitHub's built-in Pages builder, added implicitly by `f47d573` ("this branch deploys via GitHub
  Pages only"). It runs no repo script and cannot reach the Odds API, so it spends **0 credits** —
  but it is a scheduled-adjacent job in no inventory, and **the 07-30T03:03:28Z run has no
  matching push to main** (main's previous commit is `53d0076`, 07-29). Its trigger is unexplained.
  Tonight's push to main will have produced a sixth.
- **Impossible branch — "spend inside a window with no runs and no plausible client activity":
  CANNOT BE EVALUATED AT THIS RESOLUTION.** Five quota points across 42 hours; the shortest
  window is 4.5 h. Sub-window isolation needs reads bracketing a quiet stretch. **Not claimed
  either way.**

### What the residual's shape now says

Highest in **07-30 16:45Z → 01:25Z = 09:45–18:25 PT** at 14.8/h; ~6–7/h overnight; **zero**
18:25–22:55 PT. Concentrated in the PT working day. Consistent with device/browser use —
SharpDesk's 6-per-Board-open, the ungated routes, `bestBoard` fallthrough — and **not** consistent
with any clock. But the 0/h stretch also had no *scheduled* activity, so this is a correlation
across three coarse windows, **not** a demonstration. **Reading 15(c) remains the settling read.**

## 4. CEILING vs OBSERVED — the ten declared crons (owner's item 3)

Firing copy, ten crons: `0 17`, `0 20`, `0 21`, `0 22`, `30 22`, `0 23`, `30 23`, `0 0`, `30 0`,
`0 1`. **Span 17:00 → 01:00 = 480 minutes.** `MIN_GAP_S = 40 min`, so 480 > 400 and the span alone
cannot collapse ten firings.

**Greedy MIN_GAP over on-time delivery**: 17:00 ✓ · 20:00 ✓ · 21:00 ✓ · 22:00 ✓ · 22:30 ✗(30) ·
23:00 ✓ · 23:30 ✗(30) · 00:00 ✓ · 00:30 ✗(30) · 01:00 ✓ → **7 paid, not 10.** MIN_GAP binds, but
removes only the three half-hour steps. **The ceiling is 7 paid snapshots/day**, ≈ 7 × 15.5
events × 6 = **~651 credits/day** at a full slate. Observed 07-30: 5 paid / 33 ev / **198**.

**Delivery is NOT under-running.** All ten crons delivered on 07-28, 07-29 and 07-30. The archive
shows fewer snapshots than runs because MIN_GAP dedupes the **payment**, not the delivery — which
is the mechanism working exactly as documented.
**→ The handoff §6 "impossible branch FIRES — GitHub delivers each cron more than once per batch"
is WITHDRAWN. Ten declared, ten delivered, one-for-one.**

**Impossible branch — "observed delivery ever exceeded the MIN_GAP ceiling": FIRES, dated.**
07-29 paid **10** snapshots against the 7-paid ceiling, with gaps as short as **2 m 53 s**
(08:08:56 → 08:11:49). Explanation on the record: MIN_GAP's pre-dedupe landed 2026-07-29 and those
snapshots predate its effect. 07-30, with it live, shows no gap under 40 min.

### Every other multi-cron workflow on the firing copy

| workflow | crons | span | gap guard | ceiling |
|---|---|---|---|---|
| `props-history` | 10 | 480 min | MIN_GAP 40 min | **7 paid ≈ 651/day** |
| `line-history` | was `12 * * * *` (24) | 1380 min | **NONE in `snapshot_odds.py`** | **24 × 6 = 144/day** vs ~22 observed — **6.5× spike risk**; now **0**, disabled on the firing copy |
| `board-archive` | 2 | 420 min | n/a | **0** (its own header: reads `/api/board` only) |
| `context` | 2 | 330 min | n/a | **0** (no Odds call) |
| `hr-overround` | 1 (weekly) | — | n/a | **0** (archive + statsapi) |

### Runway, two numbers

| | props | line-history | residual | total | **runway at 1,038** |
|---|---|---|---|---|---|
| **observed** | ~198 | ~22 | ~201 | **~421/day** | **2.5 days** |
| **at ceiling** (pre-tonight) | ~651 | 144 | ~201 | **~996/day** | **1.04 days** |
| **at ceiling** (post-disable) | ~651 | 0 | ~201 | **~852/day** | **1.2 days** |

**The declaration is not harmless and the ceiling goes on the record beside the observation**, so
a delivery improvement is never read as a new spender. Also on the record: `credit-budget.md` L175
prices props-history as "2×/day … ≤192" — that is **3.4× below** the 7-paid ceiling, because it
was written against a two-cron file that has not been the firing copy since 2026-07-26.

## 5. WHAT CHANGED ON DISK THIS TURN

- **`origin/main` `53d0076` → `3356c54`** — the line-history schedule block, cherry-picked, one
  file, one hunk, added lines byte-identical to `70d64f0`'s. **NOT a merge.** Firing copy now:
  props-history 10 crons · board-archive 2 · context 2 · hr-overround 1 · **line-history 0** ·
  **model 0**.
- **`tests/workflow-branch-sync.test.ts`** — compares every workflow in the working tree against
  `origin/main`, with an **empty** `ALLOWED_DIVERGENCE`. **RED right now**, deliberately, on
  seven files: `board-archive.yml`, `context.yml`, `hr-overround.yml`, `line-history.yml`,
  `model.yml`, `props-history.yml` (all `differs`) and `ufc.yml` (`missing-on-firing`). Its own
  comparator is proven green/red/allow-listed on synthetics. It goes green when main is
  reconciled file-by-file or a difference is entered with a date and a reason.
