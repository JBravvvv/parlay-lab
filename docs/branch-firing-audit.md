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

---

# PART TWO — 2026-07-31, owner's items 1–4

## 5. THE THIRD SCHEDULER: VERCEL. IT EXISTS, IT IS IN NO INVENTORY, AND IT COSTS ZERO.

`vercel.json`, verbatim and entire:

```json
{
  "git": { "deploymentEnabled": { "main": false, "line-history": false } },
  "crons": [ { "path": "/api/calibrate", "schedule": "30 9 * * *" } ]
}
```

**The owner's third pre-committed branch FIRES: a Vercel cron exists that is in no inventory, and
the job inventory was incomplete for the third time** (after the GitHub ten-cron count and the
firing-branch split). One entry, `/api/calibrate`, daily at **09:30 UTC**.

**It authenticates and it runs.** `app/api/calibrate/route.ts` L74–82: `authed()` accepts
`Authorization: Bearer $CRON_SECRET`, which is exactly the header Vercel Cron sends; failing that
`syncAuthed`; and **L81 `return !cron` — with `CRON_SECRET` unset the route is OPEN**, documented
as deliberate ("the run is idempotent, writes only derived aggregates").

**It costs 0 Odds credits, verified by construction**: the route's only outbound host is
`statsapi.mlb.com` (L101 schedule, L181 boxscore) — keyless and free — plus Redis. No
`the-odds-api.com` reference exists in the file. Its declared schedule `30 9 * * *` also happens
to be the exact cron the M18 pause commented out of `model.yml`, which is a coincidence of hour,
not a relationship.

### `/api/propsnap` — traced end to end

| question | answer, from `app/api/propsnap/route.ts` |
|---|---|
| **write trigger** | `cronHeaderAuthed` only (L76) — header `x-cron-key` = `CRON_SECRET`. **No UA fallback, no client path, no Vercel cron entry.** So only cron-job.org (or anything holding the secret) can make it capture |
| **read trigger** | **UNGATED** (L64–72), `GET /api/propsnap?date=YYYY-MM-DD` — no phrase, no passcode |
| **where it writes** | Redis, `pl:propsnap:{date}` (L35), **TTL 4 days** (L36), **last 6 snapshots only** (L114 `.slice(-6)`) |
| **cost per invocation** | one `/events` call (measured at **0**) + **6 credits per event** (`regions=us`, six markets, L33/L98), capped at `MAX_EVENTS = 16` (L37) → **up to 96 credits per fire**, ~78 on a 13-game slate |
| **is it scheduled?** | **NOT from this repo.** `CLAUDE.md` L150 records cron-job.org entries 5–6 as `0 17 * * 0,6` and `30 18 * * 0,6` — **weekend-only** — and marks them "being created". Whether they exist is the owner's dashboard |
| **who reads it** | `tools/snapshot_props.py` L224 (the `--fold` path) — **which has never run in production**, because main invokes the script with no arguments |

**Cadence arithmetic if entries 5–6 exist as specified**: 2 fires × 2 weekend days = 4 fires/week
at up to 96 = **≤384/week ≈ 55/day averaged, and ZERO on weekdays.** The measured residual is
95 / 91 / 128 credits on **Wednesday and Thursday windows**, so weekend-only entries **cannot**
explain it. If the store shows weekday rows, the entries are not what `CLAUDE.md` describes and
that is the finding.

**THE STORE READ — ungated, zero Odds credits, no sync phrase needed.** This is the read that
settles it; it is the owner's to run:

```bash
for d in 2026-07-25 2026-07-26 2026-07-27 2026-07-28 2026-07-29 2026-07-30 2026-07-31; do
  curl -sS "https://parlay-lab-six.vercel.app/api/propsnap?date=$d" \
  | python3 -c "import json,sys; b=json.load(sys.stdin); s=b.get('snapshots') or []; \
print(f\"{b['date']}: {len(s)} snapshots\" + ''.join(f\"  [{x['t']} {x['kind']} {len(x['events'])}ev src={x.get('src')}]\" for x in s))"
done
```

(The 4-day TTL means only the last four dates can still hold rows; earlier dates returning `0`
is expected and is not evidence of anything.)

**Pre-committed readings, item 1** — the two data-dependent branches cannot be answered from disk
and are held for that output:
- **rows on WEEKDAY dates** → propsnap has been capturing off a cadence nobody inventoried, and
  captures/day goes beside residual/day for reconciliation.
- **rows only on 07-25/26 (Sat/Sun) or none at all** → propsnap is cleared **on evidence** rather
  than on the absence of folded rows, and the residual's candidate list is down to client-side
  plus the ungated surface.
- **IMPOSSIBLE BRANCH: rows on a date whose residual is ~0** — 07-31 is now exactly such a date
  (12 h 32 m of zero residual) → the timing does not fit and the candidate needs a different
  mechanism. Print both.

### Every route that reaches the Odds API, and what can schedule it

| route | reaches Odds API | auth | schedulable by |
|---|---|---|---|
| `/api/odds` | **YES** (proxy) | **UNGATED**; `APP_PASSCODE` gates `fresh=1` only | anything at all — no allow-list, no referer check |
| `/api/generate` | **YES** | `cronHeaderAuthed` / `syncAuthed` | cron-job.org entries 1–4 |
| `/api/propsnap` | **YES** | write `cronHeaderAuthed`; **read ungated** | cron-job.org entries 5–6, if they exist |
| `/api/clv` | **YES** | `syncAuthed` | cron-job.org (the 96×/day entry) |
| `/api/board`, `/api/sharp` | no | `APP_PASSCODE` / ungated | — |
| `/api/calibrate` | **no** | Bearer `CRON_SECRET` / `syncAuthed` / open if unset | **Vercel cron, `30 9 * * *`** |
| `/api/calibration`, `/api/ledger`, `/api/predictions`, `/api/digest` | no | `syncAuthed` | — |
| `/api/stats`, `/api/ufcprops` | no | **NONE** | — |

**Three schedulers total, now all inventoried**: GitHub Actions (from `main`), cron-job.org (the
owner's dashboard), and Vercel Cron (`vercel.json`). Nothing else in the repo declares a schedule.

## 6. `--wait` NEVER RAN — BUT THE CLOSES ARE GOOD ANYWAY (owner's item 3)

**A correction to my own claim of this morning first.** I wrote that "every archived close is
whatever landed rather than a window-targeted capture." **That was wrong.** `_snapshot_kind`
(`tools/snapshot_props.py` **L152**) labels a snapshot `close` **only when the next unstarted
first pitch is within `CLOSE_WINDOW_S = 95 * 60`** (L133). The label is computed from the slate on
**every** path, argument or not. A mislabelled close is structurally impossible; `--wait` does not
touch the labelling.

**What `close` has meant in practice — every close snapshot in the archive, 17 archived days:**

| captured (UTC) | events | minutes to next unstarted first pitch |
|---|---|---|
| 2026-07-27T23:41 | 6 | 18.2 |
| 2026-07-28T00:13 | 4 | 32.6 |
| 2026-07-28T23:32 | 9 | 8.1 |
| 2026-07-29T00:10 | 5 | 88.0 |
| 2026-07-29T23:38 | 6 | 2.8 |
| 2026-07-30T00:14 | 3 | 84.6 |
| 2026-07-30T23:35 | 4 | 35.1 |

**n = 7. min 2.8 · p25 18.2 · median 32.6 · p75 35.1 · max 88.0 · mean 38.5 minutes. 7/7 inside
the 95-minute window; 5/7 inside 60; 3/7 inside 30.**

**The owner's SECOND branch fires: the distribution is close to first pitch anyway.** The finding
is stated in his terms — **a mechanism nobody ran was credited with an outcome that occurred
without it** — with one sharpening: the outcome credited to `--wait` (correctly-timed closes) is
produced by `_snapshot_kind`, which always runs. What `--wait` would actually buy is **coverage**,
and the coverage gap is now measured: **7 closes over 17 archived days = 41%**, and every one of
the seven landed in the 23:3x–00:1x UTC band. **Zero weekend or matinee closes exist.**

**IMPOSSIBLE BRANCH — a close snapshot postdating first pitch: DOES NOT FIRE. Zero of seven.**
Nothing in the archive is mislabelled.

**Every consumer of `close`, and whether its conclusion depends on nearness to first pitch:**

| consumer | reads | depends on nearness? |
|---|---|---|
| `tools/close_fair.py` | `kind == "close"` snapshots (L42) | **yes — and it stamps it**: every row carries `mins` (L51, L59) and it flags negatives (L66). Downstream cannot lose the timing |
| `tools/close_capture.py` | close/pre census per day (L60, L75, L129, L147) | it **is** the coverage instrument; the 41% above is its quantity |
| `phase2_series_b` (model-vs-close slope) | close-side fair prices | **yes** — a far-from-pitch close attenuates the slope toward zero. Measured median 32.6 min: **not attenuated** |
| `/api/clv` | its own near-pitch sighting from Vercel | **no** — does not read the props archive |
| multibook close-side figures | `data/props/` | `multibook-memo.md` L201 already records the 07:55Z/20:32Z pair and that no backfill was possible |

**`phase2-memo.md` against the measurement**: L298 states that `_snapshot_kind()` returns `close`
when the next unstarted first pitch is within 95 min — **verified**. L595 records close capture as
built, decided from the slate, "10 crons so some firing lands in the window" — **that describes the
FIRING copy correctly**, because the memo predates the 07-27 three-cron redesign that never
shipped. L311's *"close" is a T−2.5h reading at best* and L290's *nine hours late* describe the
**pre-07-26 two-cron era** and are already superseded in place. **No dated marker is owed to the
close-quality argument: it was measured true today.** L659's *close CAPTURE RATE* is the live
question, and its number is 41%.

## 7. THE REDESIGN, AND THE MINIMAL ALTERNATIVE — PRICED, NOT DECIDED

**Has the redesign ever executed, anywhere? NO. 0 of 66 props-history runs over 17 days were
`workflow_dispatch`; every one was `schedule`.** The owner's first branch fires: **it does not
ship on the strength of being written.** Shipping it to the firing branch would be deploying
never-executed collection code into a window with barely a day of runway.

**What it changes**: ten cron entries → four, of which three can pay (`0 17` with `--wait`,
`0 13`, `0 23`) and one is free (`0 3 --fold-only`, which only reads `/api/propsnap`), plus
`timeout-minutes: 330`. `--wait` would begin holding the `0 17` runner (up to `MAX_WAIT_S` = 300
min) until the close window opens, converting a 41% close rate into a deterministic one.
`--fold-only` would begin folding Vercel captures into the archive at zero Odds cost — nothing has
ever folded.

**The two options, priced at 699 remaining. Props ceilings assume a 15-event slate at the measured
5.84 credits/event ≈ 88 per paid snapshot; residual held at its 201/day observed rate.**

| option | paying ticks/day | props ceiling | + residual | **runway at 699** | risk |
|---|---|---|---|---|---|
| **do nothing** (ten crons) | 7 (MIN_GAP-admitted) | **~615** | ~816 | **0.86 d** | none |
| **cut to five** (yml only, reversible) | 5 | **~440** | ~641 | **1.09 d** | none — schedules only |
| **cut to four** | 4 | **~352** | ~553 | **1.26 d** | none |
| **cut to three** | 3 | **~264** | ~465 | **1.50 d** | fewer chances to land a close |
| **ship the redesign** | 3 paying + 1 free | **~264** | ~465 | **1.50 d** | **never executed anywhere** |

Two things stated plainly, as asked:

1. **THE CEILING MATTERS MORE THAN THE OBSERVED RATE.** 615/day against 699 remaining is **a bad
   night, not a bad week** — a single fully-delivered day inside the current declaration ends the
   cycle. Today already ran at 348 props credits before noon.
2. **The minimal cut buys the same ceiling reduction as the redesign with none of its risk.**
   Cutting to three costs one commit on `main`, touches schedules only, is reversible in one
   revert, and reaches the identical ~264 ceiling. What it does NOT buy is `--wait`'s deterministic
   close or `--fold-only`'s free weekend fold. **If the redesign is wanted, the branch the owner
   already pre-committed applies: run it once by `workflow_dispatch` on an affordable day first.**

---

# PART THREE — 2026-07-31, owner's items 1, 3, 4, 5

## 8. THE CRON CUT — chosen from the archive, applied to `main` (item 1)

**The declared hour does not control WHEN a run arrives, only HOW MANY arrive.** 70 props-history
runs over 20 days land in four stable bands, and joining them to the 17-day archive gives this:

| delivery band | producing cron | paid snaps | ev/snap | median lead | **closes** | share of all props spend |
|---|---|---|---|---|---|---|
| 20–21Z | `0 17` (+3.1–3.9 h) | 17 | 7.9 | **112 min** | **0** — 17 min outside the 95-min window | 135/617 ev = 22% |
| 23Z | `0 20` (+3.5 h) | 4 | 6.2 | **18 min** | **4** | 25/617 = 4% |
| 00Z | `0 21` (+3.2 h) | 3 | 4.0 | **85 min** | **3** | 12/617 = 2% |
| 06–11Z | the **seven queued crons** (+7.5–10 h) | 33 | 13.5 | **508 min** | **0** | **445/617 ev = 72%** |

**All seven archived closes came from exactly two crons. The seven that produced none of them
produced three quarters of the cost.**

**Impossible branch — closes produced by hours the schedule does not declare: DOES NOT FIRE.**
Every archived capture maps to one of the four bands, and every band maps to a declared cron under
the measured delay.

**The owner's SECOND branch fires: no three-cron set covers both.** Dropping the queued tick
collapses the model-vs-close span from **508 min to ~94 min** (112 → 18), which is the pre spread
Series B regresses over. He pre-committed to spending one cron rather than losing the close, so
**FOUR, not three.**

**Applied on `main` only** (`7bfb6b3`, read back from origin):

```
    - cron: "0 17 * * *"   # -> 20:0x-20:5x, 19/20 days. The same-day `pre`, median lead 112 min.
    - cron: "0 20 * * *"   # -> ~23:3x. LOAD-BEARING: 4 of the 7 archived closes.
    - cron: "0 21 * * *"   # -> ~00:1x. LOAD-BEARING: the other 3.
    - cron: "30 22 * * *"  # -> queues to the next morning batch = the 8.5h-out opener
```

Six commented out (`0 22`, `0 23`, `30 23`, `0 0`, `30 0`, `0 1`). **MIN_GAP untouched;
`snapshot_props.py` untouched; no step argument added; the never-executed redesign not shipped.**
One queued tick is enough: in the two-cron era a single queued cron delivered on **15 of 15 days**.

**Ceiling restated at the measured 5.84 credits/event**: 7.9 + 6.2 + 4.0 + 13.5 = **31.6 ev/day →
~185 credits/day**, down from ~339 measured on 07-31.

| | props/day | + residual | **runway at 699** |
|---|---|---|---|
| before the cut | ~339–615 | ~540–816 | 0.86–1.29 d |
| **after the cut, app in use** | **~185** | ~386 | **1.81 d** |
| **after the cut, relay day** | **~185** | ~185 | **3.78 d** |

## 9. THE RESIDUAL BY WINDOW, WITH DEVICE USE FLAGGED (item 3)

Attribution: props from the archive at the measured **5.84 credits/event**; line-history at 6/run
from the Actions log.

| window (UTC) | h | spent | props ev → cr | lh | known | **residual** | /h | device use |
|---|---|---|---|---|---|---|---|---|
| 07-28 23:00 → 07-29 12:00 | 13.00 | 641 | 123 → 718 | 2 | 730 | **−89** | −6.9 | app in use |
| 07-29 12:00 → 07-30 03:55 | 15.92 | 215 | 18 → 105 | 2 | 117 | **+98** | +6.1 | app in use |
| 07-30 03:55 → 16:45 | 12.83 | 223 | 20 → 117 | 2 | 129 | **+94** | +7.3 | app in use |
| 07-30 16:45 → 07-31 01:25 | 8.67 | 200 | 10 → 58 | 2 | 70 | **+130** | +15.0 | app in use |
| 07-31 01:25 → 04:50 | 3.42 | 0 | 0 | 0 | 0 | **0** | 0 | **RELAY** |
| 07-31 04:50 → 05:55 | 1.10 | 0 | 0 | 0 | 0 | **0** | 0 | **RELAY** |
| 07-31 05:55 → 06:41 | 0.76 | 0 | 0 | 0 | 0 | **0** | 0 | **RELAY** |
| 07-31 06:41 → 13:57 | 7.27 | 339 | 58 → 339 | 0 | 339 | **0** | 0 | **RELAY** |

**RELAY: 4 windows, 12.54 h, residual +0 → +0.02/h.
NON-RELAY: 4 windows, 50.42 h, residual +232 → +4.61/h.**

**The owner's FIRST branch fires: every zero-residual window is a relay window and every
high-residual window is not. No counterexample exists on disk.** What the client-side hypothesis
predicts for each window is exactly what each window shows, including the graded rise 6.1 → 7.3 →
15.0/h across 07-29→07-31 as the app was used more heavily before the relay began.

**IMPOSSIBLE BRANCH — residual negative after attribution: IT FIRES, at −89.** The reading is that
**the per-event cost model is not a constant**: measured 641/123 = **5.21** in that window against
**5.84** in the clean 07-31 window. The Odds API bills per market per region actually returned, so
an event quoting fewer than six markets costs fewer than six credits. **6.0 is a ceiling, 5.21–5.84
is the observed range, and the residuals above are therefore conservative** — at 5.21 the
non-relay residual rises by ~30. The qualitative split is unaffected.

**This is observational, not controlled.** `docs/board-open-experiment.md` Variant B is unchanged
and confirmed at **12 credits**; it is what makes it controlled, and it runs after the propsnap read.

## 10. THE ARMING RATE, MEASURED (item 4)

**The ~08-04 projection was an ESTIMATE, not a measurement** — `collection-period.md` L1333 records
`shUmpKf` as *"INERT — will self-activate ~2026-08-04"* with no derivation, and L466/L869 repeat
the date. **It joins the reasoning-not-measurement list.** It was wrong in the same direction
twice: the first crossing came 5 days early, the second 4.

**The g distribution, `data/ump_k.json` at `200e402` (85 umpires, 223 games, 20 days):**

| g | umpires | |
|---|---|---|
| **5** | **2** | **ARMED — `kFactor` emitted (`build_context.py` L232)** |
| 4 | **11** | one plate game from arming |
| 3 | 34 | |
| 2 | 23 | |
| 1 | 15 | |

**Rate from real games rather than from the projection**: 223 games / 20 days = **11.2 plate
assignments/day** over 85 umpires ≈ 0.13 games/umpire/day. With **11 sitting at g = 4**, expected
crossings ≈ **1.44/day** — against **2 observed in 2 days**. Consistent.

**Projected ARMED: ~24 of 85 by 2026-08-15. ~78 of 85 by 2026-09-22 (freeze exit).**

**IMPOSSIBLE BRANCH — an umpire's g decreased: DOES NOT FIRE.** Zero decreases, zero removals,
zero additions; 10 umpires advanced by exactly +10 games, matching the league delta 213 → 223.
The counter is monotone.

**→ THE OWNER'S SECOND BRANCH FIRES, and it changes a decision.** The replay magnitude on record
for `umpKFrozen` — *8 of 18 K/outs rows move, max 16 pp, the emitted card CHANGES* — **was measured
with ONE umpire armed.** At ~78 of 85 armed, essentially every game's HP umpire carries a
`kFactor`, so the factor applies to nearly every K/outs row rather than to the subset whose umpire
happened to have five games. **That magnitude does not transfer, and unpinning `umpKFrozen` at
freeze exit is a materially different decision than it was at one umpire.** The frozen table's row
must carry the count and the date, and the replay must be re-run at the count that will actually
be live — not at n = 1.

## 11. WHAT THE GATE IS WAITING ON, AND WHETHER A BOARD IS AFFORDABLE (item 5)

**After tonight's reads, is the residual NAMED or only NARROWED?** If propsnap returns empty on
weekdays and Variant B confirms 6, the residual is **narrowed to a mechanism and not closed to a
caller.** 201 ÷ 6 = 33.5 cache-missing renders/day, and the 4-minute window is server-side and
shared, so those renders need not be the owner's. **What would close it is the caller census —
the Vercel function log, dashboard-only.** Everything else is elimination.

**What a board costs and buys.** At tonight's slate size (13–15 unstarted events in the 07-31
archive) and the measured 5.84 credits/event: **~76–88 credits**, ~95 with the game-lines call.
The docs' older ~150 figure is the conservative bound. It buys, in one fire: **board 1 of the
homogeneous window** (currently COUNT ZERO after four dark days) · **the outs flag's first
production exercise** (live since 02:50Z, never yet on a real board) · **`mktN` observed** rather
than projected (reading 29, the reopen crossing) · **cfSel with `rank` and `stake`** (reading 24)
· **`clampActivity`** · the replay + ParlayPred membership diff.

**Runway after one board, at the post-cut ceiling**: (699 − 95) / 386 = **1.56 days** with the app
in use; (699 − 95) / 185 = **3.26 days** on relay days.

**Plainly: a board tomorrow IS affordable, conditional on two things being true.**
1. **The residual is client-side and therefore under the owner's control.** If it is, a relay day
   burns ~185 and one board is 0.25 days out of 3.26 — comfortable. If it is an unnamed spender
   that runs regardless, the burn stays ~386 and one board is 0.25 out of 1.81 — a bad trade
   against a key that dies in under two days.
2. **The propsnap store comes back without weekday rows.** Weekday rows would mean an
   uninventoried ≤96-credit-per-fire spender is live, and that changes the board's price.

The gate therefore holds on exactly two cheap reads, both the owner's, neither costing an Odds
credit: **the propsnap store curl** and **`GET /api/calibration`** (which item 2 added), followed
by the ledger export, `burn-report --pred`, and Variant B.

---

# PART FOUR — 2026-07-31, owner's items 1–5

## 12. THE COST MODEL IS NOT A CONSTANT, AND LAST TURN'S FIGURE IS REFUTED (item 3)

Billing is **per market per region actually returned** (`snapshot_props.py` requests six markets
× the `us` region only, so **6.0/event is the structural maximum**). Since `residual ≥ 0` always,
each window gives an **upper bound** on a constant per-event cost `c`:

| window (UTC) | endpoints | spent | ev | lh | **implied `c` if residual were 0** |
|---|---|---|---|---|---|
| 07-28 23:00 → 07-29 12:00 | **SEEDED** (minute unknown) | 641 | 123 | 2 | **5.114** ← binding |
| 07-29 12:00 → 07-30 03:55 | SEEDED | 215 | 18 | 2 | 11.278 |
| 07-30 03:55 → 16:45 | SEEDED | 223 | 20 | 2 | 10.550 |
| 07-30 16:45 → 07-31 01:25 | SEEDED | 200 | 10 | 2 | 18.800 |
| 07-31 06:41 → 13:57 | **EXACT** (both tool reads) | 339 | 58 | 0 | **5.845** |

**→ `c = 6.0` IS REFUTED BY DATA, AND SO IS THE 5.845 I PUBLISHED LAST TURN**: either makes the
first window's residual negative. **The tightest constant the data admits is `c ≤ 5.114`.**
The rows above 6.0 are not violations — they are upper bounds on residual-dominated windows.
**Impossible branch — an implied cost outside anything the billing model can produce: DOES NOT
FIRE** in the binding direction; every *lower* bound sits inside [0, 6].

**The residual as a band**, at the two ends of the admissible range:

| window | h | spent | ev | resid @5.114 | resid @5.845 | /h @5.114 | /h @5.845 | device |
|---|---|---|---|---|---|---|---|---|
| 07-28 23:00 → 07-29 12:00 | 13.00 | 641 | 123 | **0** | −90 | 0.0 | −6.9 | in use |
| 07-29 12:00 → 07-30 03:55 | 15.92 | 215 | 18 | +111 | +98 | 7.0 | 6.1 | in use |
| 07-30 03:55 → 16:45 | 12.83 | 223 | 20 | +109 | +94 | 8.5 | 7.3 | in use |
| 07-30 16:45 → 07-31 01:25 | 8.67 | 200 | 10 | +137 | +130 | 15.8 | 14.9 | in use |
| 07-31 01:25 → 14:36 (5 reads) | 13.19 | 339 | 58 | **+42** | **0** | **3.2** | **0.0** | **RELAY** |

**RELAY: +3.21/h → +0.02/h. IN USE: +7.07/h → +4.61/h.**

**The owner's FIRST branch fires: the residual survives across the whole admissible cost range.**
It cannot vanish — lowering `c` only raises it, and raising `c` past 5.114 is refuted. **Total
residual ≥ 399 credits over 63.6 h. It is real.** Every runway figure is a band from here.

**But the evidence for the client-side hypothesis is materially weaker than I reported.** At the
data-consistent end the relay windows are **not zero**: +42 credits over 13.19 h. The contrast
falls from *(0 vs 4.6)* to *(3.2 vs 7.1)* — **a factor of 2.2, not infinity.**

**The honest tension, stated rather than resolved**: a *constant* `c` cannot make both the first
window and the relay window zero. If the per-event mean genuinely differs by slate — which it must,
since it is a count of markets quoted — then 5.845 can be right for 07-31 and ≤5.114 right for
07-28/29, and the relay residual really is ~0. **Nothing on disk distinguishes these.** What
distinguishes them: **Variant B step 1 is a request of KNOWN product (3 markets × 2 regions = 6),
so its delta calibrates the billing model exactly.** That is a second reason to run it, independent
of SharpDesk. Spec, not shipped: log the `x-requests-used` delta per upstream call in
`/api/odds` (the headers already pass through at L51–54) — that turns the model into a measurement.

### Every figure restated as a band

| | at `c` = 5.114 | at `c` = 5.845 |
|---|---|---|
| props ceiling, post-cut (31.6 ev/day) | **162/day** | **185/day** |
| residual, relay day | **77/day** | **~0/day** |
| residual, app-in-use day | **170/day** | **111/day** |
| **burn, relay day** | **239** | **185** |
| **burn, in-use day** | **332** | **296** |
| **runway at 699, relay** | **2.9 d** | **3.8 d** |
| **runway at 699, in use** | **2.1 d** | **2.4 d** |
| board cost, 10–11 unstarted | **57–62** | **64–70** |

## 13. THE UMP REPLAY: THE CURVE REQUIRES SYNTHETIC INPUTS, AND SO DID THE NUMBER ALREADY ON THE TABLE (item 2)

**The owner's third branch fires, and harder than the question assumed.**

**Both inputs are synthetic, and always were.** `build_context.py` L232 emits `kFactor` only at
`g ≥ 5`. **No umpire reached g = 5 until 2026-07-30**, and `context.json` has been frozen since
2026-07-29T20:32Z. **Production `context.json` has therefore NEVER contained a single `kFactor`.**
Anything that shows the factor moving a row must have supplied both the arming flag `g` **and** the
`kFactor` value by hand.

**And the existing figure is one of those.** `tests/armed-baseline.test.ts`'s own header, L26–36:

> the fix45 context **deliberately carries `hpUmp.kFactor` … values that clear both guards**,
> making `shUmpKf` **fixture-ACTIVE while … production-inert** … `hpUmp.g` spans **(3/5/9/40)** …
> **chosen to exercise both sides of each guard**, which is right for catching movement and
> **wrong for anything else** … **Do not cite a figure from this baseline as a production
> measurement.**

**The frozen table cites it as exactly that.** And it is not an n = 1 figure either: the replay
block records **13 ump-tagged rows** with the factor live — a fixture-wide arming, not one umpire.
**So the row's number is not "measured at n = 1"; it is a synthetic-fixture sensitivity reading at
an arming level that corresponds to no real state, past or projected.**

**→ NO CURVE IS PRODUCED HERE.** Building one at counts 1/5/10/25/50/78 would mean inventing 78
`kFactor` values and their game assignments and presenting the result beside real numbers. The
owner pre-committed against it and it is the right call.

**What IS measurable, and is measured, from `data/ump_k.json` (85 umpires, real):**

- `kFactor = round((u.k/u.g) / leagueKpg, 4)`, clamped to **[0.92, 1.08]** in the engine.
- League mean **16.565 K/game**. Raw ratio across all 85: min **0.745** · p25 **0.966** ·
  median **1.041** · p75 **1.127** · max **1.388**.
- **60% (51 of 85) would land ON a clamp bound.** The factor is bounded at ±8% by construction, so
  **the per-row magnitude cannot grow with the armed count — only the number of affected rows can.**
- The two actually armed **clamp in OPPOSITE directions**: Barrett 1.087 → **1.080**,
  Traynor 0.833 → **0.920**. The next eleven (g = 4) are 1.080 ×3, 1.041 ×2, 0.981, 0.966, 0.951,
  0.921, 0.920 ×2 — **also split.** The armed population is not directionally biased.

**What that implies for the unpin decision, without a synthetic curve**: per-row movement is capped
at ±8% at every count; what scales is coverage, from ~0.35 of a 15-game board's HP umpires today to
~13.8 of 15 at the projected freeze-exit count. **The decision is about breadth, not depth**, and
the frozen table's row must say that instead of carrying a fixture number.

**Impossible branch — the card stops changing at higher counts**: unevaluable without the curve;
recorded as unevaluated rather than answered.

**A real measurement is available, and its precondition is now dated**: once the pause lifts (or a
`context.json` is built from the REAL `ump_k.json` rather than from hand-picked g values), replay
the archived board with actual arming. Until then the frozen table's row carries the clamp bound,
the coverage projection, and an explicit "no production measurement exists".

### The same test across the bundle — measurements whose regime has changed

| measurement | regime when taken | regime now | status |
|---|---|---|---|
| **`umpKFrozen` replay** (8/18, 16 pp, card changes) | synthetic fixture arming, 13 tagged rows | production has never had one armed umpire; 2 armed, ~78 projected | **MISLABELLED — fixture figure cited as production** |
| **`penQFrozen` replay** (M23: 16/173, 15.1 pp) | same fix45 fixture (`pen_quality.ip` alternation 9.0/40.0, chosen to straddle the guard) | `pen_quality.json` **never materialises in a commit** | **same class — fixture-active, production-inert** |
| **props ~198/day** | ten crons, MIN_GAP live | **four crons since 2026-07-31** | superseded; ceiling restated |
| **line-history ~45/day** | inferred from a scheduled rate | measured 3–4 runs/day | corrected on both branches |
| **burn/runway before 07-31** | 6.0 credits/event, ten crons, line-history live | `c ≤ 5.114`, four crons, line-history off | **all superseded; bands above** |
| **the 46.3/59.2 HRR pair** | pre-07-24, before `selMode` existed | modes recorded since 07-24 | provenance UNVERIFIED pending the export |
| **M15 n=511 → 362** | pre-dedup | post-dedup | recorded, both figures kept |
| **the 20-board fixture bar** | a calendar span that no longer exists | struck as unreachable 07-30 | re-scoped to hot-site fidelity |

**Seven besides the ump row.** The two fixture-derived replays are the same defect; the rest are
superseded-with-a-marker, which is the convention working.

## 14. THE BOARD'S THREE PRECONDITIONS, AND TOMORROW'S NUMBERS (item 4)

**Preconditions, on disk, each with its reading:**

| # | condition | settled by | reading |
|---|---|---|---|
| 1 | the residual is client-side and therefore the owner's to control | **Variant B** (`board-open-experiment.md`) | step 1 costs 6 and step 3 costs 0 → mechanism named. Step 1 costs 0 after a 10-min quiet gap → cleared, and the residual is neither Actions nor SharpDesk |
| 2 | the propsnap store shows **no weekday rows** | the ungated curl (§5) | weekday rows → an uninventoried ≤96-per-fire spender is live and the board's price changes |
| 3 | **the calibrate pause is landed**, so board 1 is not read against a calibration that moves overnight | `vercel.json` on origin + `GET /api/calibration` | pause landed AND the store's last write is dated → board 1 and every board after it read ONE calibration vintage |

**Tomorrow, Saturday 2026-08-01 — 15 games (statsapi, zero Odds credits):**

| UTC | PT | unstarted | ready | achievable | ≥ T = 0.80 | board cost band |
|---|---|---|---|---|---|---|
| 21:45Z | 14:45 | 11 | 8 | 0.727 | no | 62–70 |
| 22:00Z | 15:00 | 11 | 8 | 0.727 | no | 62–70 |
| **22:15Z** | **15:15** | **11** | **9** | **0.818** | **YES — the crossing** | **62–70** |
| 22:30Z | 15:30 | 11 | 9 | 0.818 | YES | 62–70 |
| **22:45Z** | **15:45** | **10** | **10** | **1.000** | **YES** | **57–64** |
| 23:00Z | 16:00 | 10 | 10 | 1.000 | YES | 57–64 |
| 23:15Z | 16:15 | 5 | 5 | 1.000 | YES | 32–35 |

**THE WINDOW IS 22:15Z–23:00Z (15:15–16:00 PT).** Before it, T fails; after 23:15Z ten of fifteen
games are gone and the board is a five-game board.

**⚠️ THE CRON CANNOT DO IT TOMORROW.** Entry 1 is `45 22 * * 1-5` — **weekdays only; Saturday is
not in its range.** The Saturday entry is `0 18 * * 6`, and **at 18:00Z achievable is 0.267 with
15 unstarted** — far below T, i.e. **engine-half only**. So if the board fires tomorrow it fires
**on the owner's curl, inside 22:15Z–23:00Z**, and the cron question is moot for this date.

**Runway after a board at ~60 credits**: (699 − 60) = 639 → **1.9 d** at the in-use band,
**2.7 d** at the relay band.

## 15. THE ARMING RATE PREDICTS SOMETHING TESTABLE TOMORROW — PRE-COMMITTED (item 5)

Written before the fact, 2026-07-31, and settled free by the next `context.yml` run
(`0 17`/`30 22`, zero Odds credits) plus `tests/self-arm-stamp.test.ts`.

**Going in**: 2 armed · **11 at g = 4** · 34 at g = 3 · 85 umpires · 11.2 plate assignments/day.
**Expected crossings tomorrow: 11 × (11.2/85) = 1.45.** Poisson(1.45): P(0) = 23%, P(1) = 34%,
P(2) = 25%, P(≥3) = 18%.

- **ZERO cross** → inside the 23% tail on one draw; the rate is not rejected. Two consecutive
  zeros would be P ≈ 5% and WOULD put the 1.45 estimate in question — record it and wait for the
  second day rather than restating on one.
- **ONE crosses** → the modal outcome; the rate stands and the 09-22 projection of ~78 stands with it.
- **TWO cross** → also within the body (25%); consistent, and the running mean over four days
  becomes the estimate rather than the 2-in-2 that produced 1.44.
- **MORE THAN TWO** → 18% on one draw, but a second such day makes the g = 4 pool empty faster
  than 11.2 games/day can refill it from g = 3, which the rate model does not represent.
  **That would mean assignments are not uniform across the 85** — a real defect in the projection,
  and the fix is to model per-umpire assignment frequency instead of a league mean.
- **IMPOSSIBLE BRANCH**: any umpire's `g` decreases, or the league `g` moves by more than the
  number of games played → the counter is not monotone and the whole accrual model is wrong.
  Checked today: zero decreases, 10 umpires advanced by exactly +10 against a league delta of +10.
