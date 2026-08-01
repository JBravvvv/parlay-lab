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

## 5A. THE THIRD SCHEDULER: VERCEL. IT EXISTS, IT IS IN NO INVENTORY, AND IT COSTS ZERO.
*(Relabelled 2026-08-01 from a SECOND `5.` — found by `tests/doc-structure.test.ts` rule G
while fixing the handoff's duplicate `4A`, not reported. Nothing cited `§5` of this file, and
§6–§38 keep their numbers, so no reference moves.)*

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
for `umpKFrozen` — *8 of 18 K/outs rows move, max 16 pp, the emitted card CHANGES*, a FIXTURE
figure — **was measured
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

---

# PART FIVE — 2026-07-31, owner's items 1–5

## 16. THE CITATION AUDIT (item 1)

**Method, stated because it bounds the result**: a keyword classifier over each row's own text —
`production` / `archive` / `fixture` / `synthetic` / `spec-unmeasured`. It classifies **what the
row claims about its source**, not what actually produced the number. A row with no token is
**UNLABELLED**, which is itself the finding.

**`freeze-exit-bundle.md`, M/A rows — 28 tags exist (M5 refuted, M9 folded into M7+M9), 27 rows
parsed:**

| source class | rows |
|---|---|
| **UNLABELLED — names no source at all** | **11** (M1, M2, M3, M11, M17, M25, M21, A1, A2, A3, A4) |
| ARCHIVE | 10 |
| **FIXTURE** | **7** |
| SPEC / UNMEASURED | 7 |
| PRODUCTION | 2 |
| SYNTHETIC | 1 |

**Of the 7 fixture-sourced rows, exactly ONE (M20) reproduces the caveat. Six do not** — M4, M8,
M12, M16, M23, M24.

**→ THE OWNER'S FIRST BRANCH FIRES. This is a class with a count, and it goes in the instrument
ledger beside the five instrument defects as DEFECT #7: PROVENANCE LOST IN TRANSIT.** The
producing block says "armed fixture"; the citing block does not. Every instance the registry
guard found, all corrected in place this turn:

| file:line | figure | was |
|---|---|---|
| `session-handoff.md:510` | 8 of 18, 16 pp | **the primary defect — no fixture word anywhere near** |
| `session-handoff.md:511` | 16 of 173, 15.1 pp | same |
| `branch-firing-audit.md:499` | 8 of 18 | my own citation, earlier this session |
| `collection-period.md:6805, 6814` | 8 of 18 | inside a block headed "armed fixture", but 4+ lines away |
| `collection-period.md:7012, 7017` | 15.1 pp, 16 of 173 | same |
| `harness-substitutions.md:970` | 25 of 30 | table row, qualifier in the prose above |

**Nine citations, five documents.** `docs/cron-jobs.md` L421 had already written the rule for one
family — *"every clamp and shrink number in the frozen table came from one armed fixture … those
numbers are single-instrument until 08-14"* — and it was never generalised.

**IMPOSSIBLE BRANCH — a measured effect tracing to a fixture built to straddle a guard: IT FIRES,
TWICE, and both are retracted with dated markers**: the `umpKFrozen` replay and the `penQFrozen`
replay. `tests/helpers/fixture-env.ts` L72–78 says `fix45/context.json` is *"a SYNTHETIC
COMPOSITION of real values … with `hpUmp.g` spanning 3/5/9/40 and `pen_quality.ip` alternating
9.0/40.0 **so both sides of the guards are covered**"*. **A fixture built to straddle a guard
cannot measure the effect of that guard.** Both are now stated as fixture sensitivity readings,
not magnitudes.

### The two corrected rows

**`umpKFrozen`** — production `context.json` has **never carried a `kFactor`** (`build_context.py`
L232 gates at g ≥ 5; first crossing 07-30; carrier frozen 07-29T20:32Z). **No production
measurement of the effect exists at any n.** What IS measurable, from the real `data/ump_k.json`:
the factor is clamped to **[0.92, 1.08]**; **60% (51 of 85) of umpires would land ON a bound**;
therefore **per-row magnitude cannot grow with the armed count — only coverage can**, from ~0.35
of a 15-game board today to ~13.8 of 15 at freeze exit; and the two armed clamp in opposite
directions, so the armed population is not directionally biased. **The unpin decision is about
BREADTH, NOT DEPTH.**

**`penQFrozen`** — **what exists**: the factor is computed and discarded (M23); `shPenQFShadow`
returns 30 finite values over 30 teams in [0.9500, 1.0600]; the live guard refuses anything under
15 IP. **What does NOT exist**: any production measurement at all — **`data/pen_quality.json` has
never materialised in a commit**, so the factor's INPUT is absent from production, not merely
pinned. A replay of an absent input measures the fixture and nothing else.

### The encoding, and its stated limit

`tests/fixture-citation.test.ts`. **The obvious guard cannot work**: "a doc line naming a fixture
must carry a caveat" is blind exactly where the qualifier went missing, which is the failure mode.
**The nearest enforceable version is a REGISTRY OF THE FIGURES THEMSELVES** — a literal string per
fixture-derived quantity; any docs line containing it (word-boundaried) must have a provenance
token within ±3 lines. Observed red on nine instances across five docs, green after all nine were
corrected; the mechanism is proven both ways plus a "provenance too far away" case on synthetics.

**ITS LIMIT, STATED RATHER THAN ASSUMED HANDLED — this is the known-weak case the owner asked
for**: it covers only figures someone has entered in the registry. A new fixture figure is
unguarded until registered. **So the rule remains WRITTEN — a fixture is not production, a
projection is not a measurement — and the test holds only the part a machine can hold.**

**RECORDED AS THE STANDARD (owner's words, 2026-07-31)**: *declining to produce a synthetic number
and setting it beside real ones is the correct call.* A projection is not a measurement and a
fixture is not production.

## 17. TOMORROW'S BOARD — the sequence, decided in advance (item 2)

### The curl

```
curl -sS -H "x-cron-key: <CRON_SECRET>" "https://parlay-lab-six.vercel.app/api/generate"
```

**Use `x-cron-key`, NOT the sync phrase, and here is why it matters**: `app/api/generate/route.ts`
L101/L105 sets `manual = syncAuthed(req)` and `scheduled = !manual && cronHeaderAuthed(req)`, and
L289 stamps `trigger` from that. **A phrase curl stamps `trigger: "manual"`; a cron-key curl
stamps `"header"`.** Reading 5 pre-commits `gen.trigger === "header"` **or it did not land** — so a
phrase curl would make reading 5 read as a failure when nothing failed. **This clash is recorded
now rather than discovered at the board.** `?force=1` is available only on the phrase path and is
**not needed**: the 45-minute limiter (L126) has nothing to collide with after four dark days.

**If it returns any of the four 200-without-a-board bodies — `{"ok":true,"skipped":"ran recently"}`
· `{"ok":true,"skipped":"dead-slate",…}` · the good-board skip's `low-ceiling`/`no-games-left`/
`covered`/`thin` · `{"ok":true,"date":…,"logged":0,"note":"no pregame picks…"}` — DO NOT RETRY AND
DO NOT FORCE. Report the body verbatim and stop.** A 401 body is `{"error":"unauthorized"}` and
means the header did not match; that is also a stop, not a retry.

### The window, to the minute — and the crossing is at 22:10Z, not 22:15Z

| from | PT | unstarted | ready | achievable | |
|---|---|---|---|---|---|
| **22:10Z** | 15:10 | **11** | 9 | **0.818** | **T crossed** |
| **22:38Z** | 15:38 | **11** | 10 | **0.909** | **← FIRE HERE** |
| 22:40Z | 15:40 | 10 | 10 | 1.000 | costs one game |
| 23:05Z | 16:05 | 9 | 9 | 1.000 | |
| 23:10Z | 16:10 | 8 | 8 | 1.000 | |
| 23:15Z | 16:15 | **5** | 5 | 1.000 | ten of fifteen gone |

**Waiting from 22:10 to 22:38 costs NOTHING — still 11 unstarted — and buys 0.818 → 0.909.**
Waiting to 22:40 costs one game for 1.000. After 23:05 the slate empties fast. **Fire at 22:38Z
(15:38 PT); anywhere in 22:38–22:45Z is equivalent within one game.** Cost at 11 unstarted:
**62–70** on the band.

### Preconditions at the fire

| # | condition | status |
|---|---|---|
| 1 | residual is client-side | **PENDING — Variant B** |
| 2 | propsnap store has no weekday rows | **PENDING — the ungated curl** |
| 3 | calibrate pause landed | ✅ **SATISFIED** — `vercel.json`'s `crons` array removed, read back from origin, deploy verified alive |

**If either pending read comes back wrong, the board does not fire, and the day is recorded with
the FAILING CONDITION NAMED — not as "dark".** Four days have been recorded as dark; the fifth
gets a reason.

### The seeds block — what board 1 must carry, field by field

| reading | must-carry field | absent ⇒ |
|---|---|---|
| homogeneous window | the board exists at all | window stays COUNT ZERO, fifth dark day |
| echo landing (r3) | `echo` present in the response body | the push did not land |
| trigger mark (r5) | `gen.trigger === "header"` | did not land — **use the cron-key curl** |
| echo fields (r25) | `outsSusp === true`, `selMode === "ev_gated"`, priors/ctx hash = the pause pair | something shipped early, or the statics are not the pause vintage |
| **outs flag, first production exercise** | outs rows present AND `susp` — **and ZERO outs legs in built tickets** | vacuity branch first: zero outs rows proves nothing |
| cfSel (r4, r24) | `cfSel` on EVERY susp row, with `rank` AND `stake` | did not land |
| clamp census (r24) | `clampActivity` present, per-site counts | arming is not reaching production analyze |
| hot-site fidelity | per-site call counts ≥ 30 on the pooled archive | cold sites print counts |
| **mktN / reopen crossing (r29)** | `echo.mktN` per market vs `consMinN = 100`, beside per-market blocked-reason counts | the mktN echo did not land; the blocked-reason proxy is the only reading |
| HRR | rows present AND greyed | display half vs server half |
| replay + join | ParlayPred membership diff | four branches, unchanged |

**THE CALIBRATION VINTAGE STAMP ON THAT BOARD**: the pause froze `pl:cal:summary`/`weights` at
whatever the store last held, and **`GET /api/calibration` is what dates it.** Board 1 must be
recorded with that stamp beside it — it is the first board of the homogeneous window and the
first board whose calibration input is provably immobile.

**PRE-COMMITTED, fixed now**: achievable ≥ 0.80 at the fire → composition readings VALID, full
fifteen steps · below 0.80 → engine-half only · any 200-without-a-board body → report and stop ·
**IMPOSSIBLE BRANCH: tickets containing `pitcher_outs` legs → the outs flag is not reaching the
server path and is cosmetic. M-item the same day, and it outranks the card.**

## 18. VARIANT B RESTATED — `c` IS NOW THE PRIMARY TARGET (item 3)

**Step 1 is a request of KNOWN product**: `regions=us,eu × markets=h2h,totals,spreads` = **3 × 2 =
6 market-region pairs**. Its quota delta measures the billing model directly.

**What it pins down**: whether a fully-quoted market-region pair costs exactly 1 credit, on THAT
request shape. **What it does NOT pin down**: whether `c` generalises across slates. The props
sweep requests **six markets × one region** per event, and its per-event cost is the number of
those six actually quoted — which varies by game. **So step 1 calibrates the BILLING RULE, not the
props sweep's per-event MEAN.** A delta of exactly 6 says "1 credit per quoted pair" and leaves
the props mean still bounded by [5.114, 5.845]; it does not collapse the band by itself. Stated
plainly so the read is not over-claimed when it lands.

**With the rule pinned, the series is recomputed and printed again** (§12's table), and that is
what survives or collapses.

**Pre-committed:**
- **`c` at or near 6.0 for the known request** → the billing rule is 1/pair. The binding window's
  props attribution at 6.0/event would go negative, so **a constant per-event cost across slates
  is dead** — replaced by *cost = Σ over events of (markets quoted, ≤ 6)*, i.e. the archive's
  event count is a UPPER bound on billable units and the residual must be recomputed per day from
  per-event market counts, which the archive does carry.
- **`c` near 5.1 for the known request** → a fully-quoted pair sometimes costs less than 1, the
  constant model is consistent, the residual sits at its floor, and the relay contrast stands at
  **2.2×**.
- **`c` outside [0, 6]** → something else is being charged on that request. Print it; that
  outranks the SharpDesk question.

**The cache test is now secondary**: steps 3 and 5 tell us whether SharpDesk is a repeat spender,
not what `c` is. Both still run; the order is unchanged.

## 19. THE ARMING RATE'S PROVENANCE — AND A BETTER PROJECTION (item 4)

**1.45 came from the DISTRIBUTION, not from the two observed days.** The closed form was
`(umpires at g = 4) × (league games/day ÷ roster)` = `11 × (11.2 ÷ 85)` = **1.449**. Its three
inputs are the g-distribution, the league game count and the roster. **The two crossings were a
comparison, never an input. The owner's first branch fires: the test is valid and tomorrow is a
real test.**

**But the closed form was an UNDERESTIMATE**, because it counts only the g = 4 pool and ignores
umpires at g = 3 who draw two assignments. A simulation over the same distribution — uniform
assignment, 11.2 games/day, seeded, 4,000 runs — gives **mean 1.61**, and its full distribution
replaces the Poisson approximation:

| crossings tomorrow | 0 | 1 | 2 | 3 | ≥4 |
|---|---|---|---|---|---|
| **simulated** | **14.7%** | **34.4%** | **31.5%** | **14.7%** | **4.7%** |

**Projection, by simulation rather than by extrapolation** (2,000 runs, 90% band):

| date | armed, median | 90% band |
|---|---|---|
| 2026-08-01 | 4 | [2, 6] |
| 2026-08-15 | **40** | [36, 45] |
| **2026-09-22 (freeze exit)** | **83 of 85** | **[80, 85]** |

**The earlier ~78 was a linear extrapolation of the closed-form rate. The simulation says 83 of
85 — effectively the entire roster — and it uses the distribution, not the observations.** Both
the test and the projection are therefore non-circular; the assumption they DO rest on is
**uniform assignment across the 85**, which is the thing the ">2 twice" branch would falsify.

**Revised branch for tomorrow, replacing the Poisson figures**: 0 → 14.7%, not a rejection;
**two consecutive zeros ≈ 2.2%** and WOULD question the model · 1 or 2 → the body, 66% combined ·
3 → 14.7%, unremarkable · **≥4 → 4.7%, and twice would mean assignments are not uniform.**

## 20. THE `/api/calibration` PRE-COMMITMENT, COMPLETE (item 5)

Already on disk at the top of `collection-period.md`; restated here whole, with the two framings
the owner named:

1. **per-market `n` against `SLOPE_MIN_N = 100` and `GLOBAL_MIN_N = 150`, and whether ANY market
   has ever cleared them.**
2. **the current `mults` and `globalShrink`** — that pair IS the frozen vintage from today.
3. **`lastRun`** — which dates the vintage. Written at calibrate route L47, **read by nothing**.
4. **`weights.log`** — `{at, market, before, after, bucket}` per adjustment; any entry is dated
   proof the engine's inputs moved.
5. **IF THE STORE HOLDS AN IDENTITY** (no market ever cleared a threshold): **the calibrate pause
   froze nothing that was moving. The finding is EXPOSURE WITHOUT EFFECT, and the third freeze
   point is PRECAUTIONARY RATHER THAN CORRECTIVE.** Said that way, in those words.
6. **IF THE STORE HOLDS A LIVE FIT**: every board before today read a different calibration than
   tomorrow's will, and **cross-day comparability of anything already measured restates** — the
   homogeneous window's start date becomes 2026-07-31, not 2026-07-29.
7. **IMPOSSIBLE BRANCH**: `mults` non-empty while every market sits under `SLOPE_MIN_N` → the
   weekly state machine moved without the nightly fit and `applyWeeklyAdjustment`'s own n ≥ 150
   gate did not hold. Print both.

---

# PART SIX — 2026-07-31, owner's items 1–4

## 21. THE ELEVEN TRACED (item 1)

| row | what actually produced its number | class |
|---|---|---|
| **M1** | per-row park error + mean `parkH` 1.0013 / `parkHR` 0.9720 "across the 07-26 venues" | **ARCHIVE** — ⚠️ **working not on disk**: those two means appear in **no producing block**, only in the row |
| **M2** | gap −23.3 → −11.5 pp, 0/38 → 11/38, λ 13.7 → 15.3 (collection-period L4736) | **ARCHIVE** — 2026-07-26 board, 38 outs rows |
| **M3** | market rung-drift **+0.479**, n=5 closed-form pairs; +0.356 vs +0.468, n=15 sim (hrr-recalibration L8/L47) | **ARCHIVE** — 2026-07-26 board |
| **M11** | +0.79 pp per 10 pts, SE 0.09, t≈9; `tools/recency_weights.py` | **ARCHIVE (statsapi, NO board)** — n=3,061 leak-free player-dates, 07-11→07-26, 481 batters |
| **M17** | 15 bot commits since 07-24, three-path census | **REPO/GIT** — a census, not a measurement |
| **M25** | **$500 vs $13 ceiling = 38.5× across 11 legacy tickets** | **🔴 FIXTURE** — collection-period **L7323–24**, *"THE DOLLAR TOTALS (armed fixture, DAILY $250, bankroll $750)"*. The 13-sites/11-protections count is a **CODE READ** and stands |
| **M21** | 1 armed, 8 at g=4 — `data/ump_k.json` | **ARCHIVE** — ⚠️ **STALE**: 2 armed and 11 at g=4 as of 07-31; the ~08-04 date was an ESTIMATE |
| **A1** | log-growth 126.6 → 187.2 bp, crossover 3.05 → 1.40 pp | **ARCHIVE** — 2026-07-26 board via `tests/a1-shade.test.ts` + `PL_BOARD` |
| **A2** | 4 of 18 tickets (22%), crossover 3.05 → 3.50 pp | **ARCHIVE** — same board (collection-period L4757, singles-vs-parlays L686) |
| **A3** | −1.000 / −0.501 / −0.334% at 1/2/3 legs | **CLOSED-FORM ARITHMETIC** on the measured 1.071 overround (collection-period L1182, n=1,336). **No run produced the triple** |
| **A4** | 1/8 vs 1/4 Kelly +6.4 / +5.1 bp, $250 every cell | **ARCHIVE** — same board (singles-vs-parlays L465–531) |

**Plus M6**, which the strict classifier surfaced after the eleven were done: **169 K rows** is an
ARCHIVE row census, and the finding itself — *no sim path exists for the quantity* — is a **CODE
READ that needs no magnitude**.

### The pre-committed readings

- **"any A-item is fixture-derived": DOES NOT FIRE.** All four trace to the archived 2026-07-26
  board (A3 to closed-form arithmetic on an archive-measured overround). **The allocation
  amendments the exit sign-off reads are NOT fixture-derived.** Stated plainly because the
  opposite would have restated the sign-off's inputs.
- **"any row's number cannot be traced to any run": FIRES ONCE, in a weaker form than 'reasoning'.**
  **M1** names its population (the 07-26 venues) but **its working is nowhere on disk** — 1.0013
  and 0.9720 exist only in the bundle row. That is a computed-once figure with no recorded
  derivation. **Dated marker applied in the row.** It is not reasoning-in-place-of-measurement; it
  is a measurement whose arithmetic was never written down, and it cannot be re-derived without
  re-running the venue means.
- **"all eleven trace to archive or production": NO.** **M25 is fixture-derived**, and it was
  sitting unmarked in the row that carries the single largest live-money claim in the bundle
  (*legacy modes place negative-EV bets by construction*). **The class restates: fixture-sourced
  M/A rows go from 7 to 8**, and of those **7 of 8 do not reproduce the caveat** — M20 alone does.
  M25's row now carries the split explicitly: the dollar ratio is fixture, the site count is code.
- **How many carry no number at all**: **zero of the eleven.** Every one has a magnitude. What
  three of them have is a magnitude of a *different kind* — M17 a git census, A3 arithmetic, M6 a
  code read — and those are now labelled as such rather than reading like measurements.
- **IMPOSSIBLE BRANCH — two rows citing the same number from different sources: DOES NOT FIRE.**
  `crossover 3.05 pp` appears in A1 and A2 and traces to the same board and the same run in both.

**ENCODED**: `tests/fixture-citation.test.ts` now also fails when an M/A row carries **no source at
all**, with a plant. Twelve rows carry the strong `[src: …]` form and the count is ratcheted so it
cannot fall. **The residual, stated**: fifteen rows are accepted on the WEAK form — a source word
in their own prose rather than an explicit token. Converting them is the standing to-do, and until
then the guard's floor is "no row is silent", not "every row is explicit".

## 22. TOMORROW'S CRON QUESTION — AND WHAT SATURDAY'S ENTRY ACTUALLY DOES (item 2)

**TOMORROW'S BOARD TELLS US NOTHING ABOUT THE CRON EDITS. Say it plainly and do not let a
successful curl read as evidence the cron works.** The board fires on the owner's header curl;
entry 1 is `45 22 * * 1-5` and **Saturday is not in its range**. **The first weekday test is
MONDAY 2026-08-03 at 22:45Z**, and what confirms the edits is the **cron-job.org execution log**
(the owner's screen) plus, if a board appears, `gen.trigger === "header"` on a fire nobody curled.
The repo cannot distinguish a 401 from a non-execution — that has been true since 07-30 and is
still true.

**Will the Saturday entry fire? YES — `0 18 * * 6` is due.** Per the run sheet's record, entries
2–4 are **UNHEADERED**, so it hits `/api/generate` without `x-cron-key` and gets
`{"error":"unauthorized"}` at **zero Odds credits and zero run-slot consumption** — the 401 is
returned before any spend and before `INCR`. **It stays unheadered.**

**If it somehow authenticates, here is exactly what happens — and the trap does NOT fire, for a
reason worth having in advance:**

1. At 18:00Z, `liveCoverage` runs first. `MIN_ACHIEVABLE = 0.15` and Saturday's 18:00Z achievable
   is **0.267** — **above the floor, so `low-ceiling` does NOT skip.** The board builds, spending
   ~15 events ≈ **77–88 credits** and consuming **1 of `MAX_RUNS_PER_DATE = 3`**.
2. At **22:38Z** the owner's curl reads that stored board. `liveCoverageOf` counts `lu === true`
   **over UNSTARTED games only** (`board-coverage.ts` L28–33). The 18:00Z board's lineup-confirmed
   games were the 19:07 and 20:10 starts — **all of them have started by 22:38** — so
   `confirmed = 0` over 11 upcoming, **pct = 0.000**, far under `SKIP_COVERAGE = 0.7`.
3. `cov.skip` is therefore **false**, reason `thin`, and **the curl REBUILDS.**

**→ The Sunday trap does not arrive on Saturday. What a successful Saturday entry costs is ~80
credits of nothing and one of three run slots — not the board.** Recorded before the fact.

**Pre-committed:** entry 401s → no interaction, fire at 22:38Z · entry succeeds and builds a
sub-T board → **the curl still rebuilds** (mechanism above), so the day is NOT engine-half by that
route; what to check instead is the run counter and the ~80-credit hole · **IMPOSSIBLE BRANCH: a
board already exists for 08-01 when the curl returns a skip body → report the body verbatim and
stop.**

## 23. WHAT ESCAPES THE PROVENANCE GUARD — THE SIZE OF THE LIMIT (item 3)

| | count |
|---|---|
| distinct numeric figures across `docs/` | **1,880** (16,019 occurrences) |
| registry entries | **4** |
| **coverage** | **4 / 1,880 = 0.213%** |
| distinct figures on **load-bearing** lines (frozen table · pre-committed reading · decision · amendment · magnitude) | **262** |
| **load-bearing coverage** | **4 / 262 ≈ 1.5%** |

**THE OWNER'S FIRST BRANCH FIRES: the guard is a SPOT-CHECK, NOT AN INVARIANT**, and the
instrument ledger now says so with the ratio.

**Can registration be defaulted? Not at figure granularity.** A guard that fails on any
unregistered figure would fire on 1,876 of 1,880 — unusable, and the reflex it trains is to
suppress it. **The threshold that makes it workable is to change the UNIT from the figure to the
LINE, over a scoped set**: require a source token on **every frozen-table row and every M/A row**
— 262 load-bearing lines instead of 1,880 figures, and §21's row guard is already half of it.
**SPEC'D, NOT SHIPPED**, per the owner's instruction; the decision waits until tomorrow's board is
read.

## 24. THE `umpKFrozen` ROW, VERBATIM, AND THE CIRCULARITY (item 4)

**The frozen-table row, as it now reads on disk** (`collection-period.md`):

> | **`umpKFrozen`** | **`true`** | `shUmpKf` pinned off. Unlike `penQ` this factor would have
> **armed itself** across ~2026-08-04 → 08-13; pinning **preserves** current behaviour. |

**That row still describes DEPTH by implication and carries a superseded date.** The correction
this turn landed in the *consequence list* (`session-handoff.md` §7) and in §13 above; **the
frozen-table row itself has not been rewritten**, and it should be, because it is what a sign-off
reads. Flagged rather than silently edited: it is the frozen table, and a row there moves with the
owner's word. **What it should say**: the factor is clamped to **[0.92, 1.08]**, **60% (51 of 85)
of umpires land ON a bound**, so **magnitude per row cannot grow**; what grows is **coverage**,
from ~0.35 of a 15-game board today to **83 of 85 umpires armed by freeze exit** — i.e. essentially
every game. **The decision is breadth, and it arrives fully formed at exit rather than gradually.**

**Does the unpin have a date or a condition? NEITHER.** There is no dated review and no stated
condition anywhere on disk. **It sits at exit alongside every other amendment and competes for the
same sign-off** — which is exactly the wrong place for a decision whose input space changes by
40× between now and then.

**THE CIRCULARITY IS REAL.** To justify unpinning you want a production measurement of the
factor's effect. The factor cannot affect anything until it ships, and it cannot ship without the
justification. **Under the current design this decision cannot be informed by measurement.**

**What breaks it — and one of the three already exists:**

1. **THE SHADOW PATH, WHICH IS ALREADY BUILT AND ALREADY RUNNING.** `build_context.py` L217–223
   emits **`kRaw`** — *the same ratio computed at ANY g*, "recorded, never applied" — and the
   engine carries `shUmpKfShadow`, which returns the ungated raw ratio, its clamped view and `g`
   **without ever multiplying** (`tests/pinned-factors.test.ts` L60–71). **Cost: ZERO Odds
   credits.** Its blocker is not money: `context.json` is frozen by the M18 pause, so no NEW
   `kRaw` reaches a board while the freeze holds. **The smallest experiment that breaks the
   circularity: one board generated against an UNFROZEN context, with the factor still pinned,
   diffed against `shUmpKfShadow`'s recorded counterfactual.** That measures the effect without
   applying it — and it costs one board's credits, not a policy change.
2. A single board with the factor live and diffed — spends the same credits and *does* apply it.
3. Nothing — accept that the row is a judgement call and label it as one.

**PRE-COMMITTED: the circularity is real, so it is recorded as a decision that cannot be informed
by measurement under the current design — and option 1 is the named experiment that changes that,
at zero Odds credits plus one board, blocked only by the vintage pause it would have to interrupt.**

## 25. HOUSEKEEPING FOUND WHILE TRACING

**Three orphaned test files that no runner executes**: `tests/bot-path-whitelist.test 2.ts`,
`tests/min-gap.test 2.ts`, `tests/sha-references.test 2.ts` — macOS duplicate artefacts dated
2026-07-29. `vitest.config` includes `tests/**/*.test.ts`; these end in `test 2.ts` and **do not
match**. 84 `.ts` files in `tests/`, **81 run**. They may hold divergent copies of three guards.
**NOT deleted** — reported for the owner's word.

---

# PART SEVEN — 2026-07-31, owner's items 1–4

## 26. THE THREE ORPHANS — TWO ARE COPIES, ONE IS EVIDENCE (item 1)

**None is tracked by git.** All three are UNTRACKED local files; no commit introduced them. Sizes
and mtimes say what produced them: `2691 B / 07-29 12:32`, `1871 B / 07-29 13:51`,
`3557 B / 07-29 12:32` — a filesystem duplication (the macOS `" 2"` suffix), not a repo action.

| orphan | vs its live twin | verdict |
|---|---|---|
| `bot-path-whitelist.test 2.ts` | **byte-identical** | copy artefact |
| `min-gap.test 2.ts` | **byte-identical** | copy artefact |
| **`sha-references.test 2.ts`** | **DIFFERS** | **evidence** |

**The difference, and it goes the direction that matters.** The orphan's `originRefs()` returns
**only** `refs/remotes/origin`. The LIVE file appends `"HEAD"`:

```diff
-    return execSync('git for-each-ref --format="%(refname)" refs/remotes/origin', …)
+    const refs = execSync('git for-each-ref --format="%(refname)" refs/remotes/origin', …)
+    // HEAD is included so docs may cite the HELD stack (real commits, ancestors of the
+    // local branch, deliberately unpushed under the hold rhythm …)
+    return [...refs, "HEAD"];
```

**→ THE OWNER'S FIRST BRANCH FIRES: the orphan asserts something the live file no longer does.
The live guard is WEAKER — it accepts a sha reachable only from a local, unpushed commit.**

Three things make this less bad than the branch's worst case, and one that makes it worth an
M-number anyway:

- **The weakening is documented in place**, with a stated reason (the hold rhythm), not silent.
- **It changes nothing today**: the tree is clean and everything is pushed, so `HEAD` is an
  ancestor of `origin/frontend-rebuild` and adds no reachability.
- **But it landed inside `ea7445a` (2026-07-29T14:10:29-07:00)**, whose subject is *"Session
  handoff before compaction"* — **a guard change riding inside a docs commit**, five lines in a
  120-file window. It was never reviewed as a guard change.
- **The residual risk is real and small**: a doc may cite a sha that exists only on a local commit;
  if that commit is later discarded by a reset or rebase, the citation dangles and the guard has
  already passed. The strict version could not do that.

**Recorded as M27 — a guard weakened in place, with its original preserved beside it, unrun.**
NOT restored unilaterally: the widening has a stated justification and reverting it would break
the hold rhythm the owner actually uses. **The decision is his**; the choice is (a) keep the
widening and accept the reset/rebase hole, or (b) restrict it to shas that are ancestors of the
current branch AND recorded in the handoff's held-stack list, which is the narrow version.

**THE FULL SWEEP, reconciled.** `vitest.config` includes `tests/**/*.test.ts`.

| | count |
|---|---|
| `.ts` files under `tests/` (recursive) | **86** |
| match the glob and run | **81** |
| do not match | **5** |

The five: the three orphans **plus two legitimate non-tests** — `tests/helpers/fixture-env.ts` and
`tests/helpers/modes.ts`, which are imported by test files rather than run as ones. **So the sweep
finds exactly three orphans and nothing else** — the owner's "more than three" branch does not
fire. (My earlier "84" was a top-level `ls`; the recursive count is 86.)

**IMPOSSIBLE BRANCH — an orphan referencing a function or path that no longer exists: DOES NOT
FIRE.** All three reference live symbols; the sha-references orphan differs only in the ref list.

**Not deleted, per instruction.** The two identical copies are safe to remove in one commit; the
third should be kept until M27 is decided, because it is the only surviving record of the strict
assertion. A runner-glob check that forces file-count and run-count to agree is the natural guard
and is **spec'd, not shipped**.

## 27. THE FROZEN-TABLE DATE SWEEP (item 2)

The `umpKFrozen` row is replaced on the owner's word — verbatim text in §5 of this file's summary
and in `collection-period.md`. The sweep across the rest:

| row / line | what is wrong | action |
|---|---|---|
| `umpKFrozen` (frozen table) | *"would have armed itself across ~2026-08-04 → 08-13"* — an **estimate presented as a schedule**, wrong in the same direction twice | **REPLACED**, date struck |
| `shUmpKf` inertness row (L1452) | *"INERT — will self-activate ~2026-08-04"* — same estimate | **CORRECTED**, dated |
| self-arming table (L6719) | *"1 umpire at g≥5 … 8 more at g=4"* | **CORRECTED** to 2 armed / 11 at g=4, dated |
| M21 (bundle) | same stale counts | corrected in the `[src:]` token |
| Phase-2 threshold rows (L2577–78) | *"~2026-07-31"* for the game- and player-cluster thresholds — **that is TODAY, and neither is confirmed reached** | **FLAGGED, not corrected**: they are projections whose due date has arrived and nothing has read them. A dated marker is owed once someone checks |
| `Hits` review row (L3071) | 2026-08-23 / 2026-08-09 | future, no action |

**Magnitudes whose regime has changed** — the ump defect repeating — were swept in PART FIVE §16
and PART SIX §21 and are all now labelled: **M25 (fixture → archive, re-measured below)**,
**`penQFrozen`** (fixture, and its input has never existed in production), and the seven
regime-change entries in §13's table. **Count of rows carrying a superseded date: four, all
corrected; one pair flagged as due-today-unread.**

## 28. `kRaw` IS IN THE FROZEN CONTEXT — AND IT STILL CANNOT RUN TOMORROW (item 3)

**`kRaw` IS already in the frozen production `public/model/context.json`.** Read from disk:
`date: 2026-07-29`, 16 games, **11 carry an `hpUmp` block**, fields
`{name, g, kFactor, kRaw, lgKpg}`, **`kRaw` non-null on all 11**, `kFactor` null on all 11
(correct — nobody had g ≥ 5 on 07-29). Values 0.8652–1.2677 against `lgKpg` 16.566.

**So the first branch looked like it fired — and then the impossible branch fired instead, in the
owner's own words: the pause froze the input out of existence FOR THIS PURPOSE.**

`shUmpCtx(g)` (`legacy/index.html` **L1600–01**) resolves the ump block by **iterating
`SH_CTX.games` and matching the GAME**. The frozen context holds **2026-07-29's fifteen team
pairings**. Tomorrow's slate is fifteen pairings. **The overlap is ZERO.**

**→ On tomorrow's board every game returns `null` from `shUmpCtx`, so `shUmpKfShadow` records
NOTHING. The experiment cannot run for free on tomorrow's board.**

**AND THE CONSEQUENCE IS LARGER THAN THE UMP FACTOR.** Every context block resolved **per game**
— the ump block, and `weather` (which `shTempF` reads off `g.weather`, populated from the same
per-game merge) — **has matched nothing on any board since 2026-07-29.** Team-keyed blocks
(`bullpen_last3`, `pen_quality`) still resolve, because they are looked up by team name
(`shPenF` L1663, `shPenQFShadow` L1611). **So the M18 pause did not merely hold the per-game
context's VALUES; after one day it stopped them resolving at all.** That is a property of the
freeze nobody had written down, and it means the homogeneous window is homogeneous in a stronger
and emptier sense than intended for those factors.

**What would have to change**: a context regeneration. It **can** be scoped — `build_context.py`
writes the whole file, so the scoped version is *regenerate, then diff, then accept only if the
diff is confined to `games[]` and `ump_db_games`*. **That diff is verifiable**: `pen_quality`,
`bullpen_last3` and `league_k_per_game` are all separately addressable in the JSON, so a
field-scoped comparison is mechanical. **But it is a vintage event** — a new `games[]` is new
data reaching the engine — and it waits for the owner's decision with the diff in front of him.

**What the experiment would yield, when it can run**: one board, factor still pinned, `kRaw`
recorded per game by `shUmpKfShadow`, diffed against the live card. **That measures the factor's
effect on prices without applying it.** What it does NOT measure: anything realized, any
interaction with the allocator's ceilings, or the effect at the freeze-exit armed count — it is
one board at one arming level.

**Does the shadow reach the archive?** `board-archive.yml` captures `/api/board` whole, and
`gameInfo.shadow` is an archived board field (`29400d0` added it), **so the diff can be run after
the fact rather than live** — which means the experiment does not need to be watched, only fired.

## 29. M25 RE-MEASURED ON THE ARCHIVE — AND THE CLAIM REFINES (item 4)

**What the claim rests on after the split**: a **CODE READ** — `disciplined`/`evGated`/`dscpM`/
`selMP` are four spellings of one predicate, and **13 sites implement 11 protections behind it**
(`shAllocate` L2998–3001 · `finalizeCats` L2513 · `buildParlaySet`'s dscp gate, with the full
site list in the row). That establishes, with no dollar figure at all, that **eleven protections
switch off together on a two-tap mode change.** That half never needed a magnitude.

**And the archive DOES produce a real magnitude.** `tests/m25-archive.test.ts`, on
`data/boards/2026-07-26.best.json.gz` from the line-history branch — a real captured production
board, 67-ticket pool, bankroll $750, daily $250, the same parameters the fixture used:

| mode | tickets | staked | own computed ceiling | **ratio** | over ceiling | $0 ceiling | negative czEv |
|---|---|---|---|---|---|---|---|
| **`probability`** | 6 | **$250** | **$10** | **25.0×** | **6 of 6** | **5** | **5** |
| **`caesars_ev`** | 6 | $250 | $265 | **0.9×** | 2 | **0** | **0** |
| `ev_gated` | 6 | $225 | $225 | **1.00×** | **0** | 0 | 0 |

**THE OWNER'S FIRST BRANCH FIRES: the row now carries a measured number and the fixture's pooled
38.5× is retired with a dated marker.**

**And the claim refines in a way the fixture's single pooled number concealed.** *"Legacy modes
place negative-EV bets by construction"* is **MEASURED TRUE for `probability`** — 5 of 6 tickets
carry negative `czEv`, 5 sit on a $0 ceiling, and every one of the six exceeds its own ceiling —
and **NOT DEMONSTRATED for `caesars_ev`**, which on this board took zero negative-czEv tickets,
zero $0-ceilings, and landed at 0.9×. **The fixture pooled "11 legacy tickets" across both modes
into one 38.5×; the archive separates them and only one of the two behaves as the sentence says.**

`ev_gated` reproducing **exactly 1.00× with zero over-ceiling tickets**, on a different board from
the earlier disciplined measurement, corroborates it independently.

**Harness provenance, stated**: the BOARD is archived production; the ALLOCATOR is production
code; the ENGINE is `fixtureEngine()` with the v2 kernel dormant, which `shAllocate` does not use.
So this is an archive measurement of the allocation path, not a fixture reading — and it is not a
full-board reproduction either.

**Reading 15's overstake query is UNCHANGED and still first after the propsnap read.** This
measures what the allocator WOULD emit; the ledger export measures what was actually staked. They
are different questions and both stand.

## 30. 🔴 146 CREDITS IN THREE HOURS, IN A RELAY WINDOW, UNATTRIBUTED (2026-07-31 19:11Z)

**Read live at the end of this turn: quota 699 → 553 between 16:10:13Z and 19:11:31Z — 146
credits in 3.02 h = 48.3/h, the highest rate ever recorded here.**

**What ran in that window: ONE Actions run — `board-archive` at 17:12:01Z, which its own header
certifies costs ZERO Odds credits (it reads `/api/board` only).** No new props snapshot: the
07-31 archive still holds exactly the four morning snapshots (58 event-fetches) it held at 13:57Z.
line-history is disabled on the firing copy. **So 146 of 146 credits are unattributed.**

**It was not me.** My only outbound calls this turn were the deploy check (root + `/api/board`) at
~14:5xZ and one `/api/board` read at 19:12Z, and the quota is unchanged across both pairs of reads
— 699 before and after the first, 553 before and after the second.

**`/api/board?date=2026-07-31` returns `board: null` — no SERVER board was built.** That does not
clear a client generate: `generateBoard()` writes `localStorage` and calls `logBoardPredictions`,
and **never writes the server board key**, so a client generate leaves exactly this signature.

**Candidates, in order, and none is resolvable from disk:**

1. **A client generate via the `bestBoard` fallthrough** — ~6 × 15 unstarted events ≈ **90**, plus
   SharpDesk 6 per cache-missing render. Two renders plus a generate reaches ~146 comfortably.
   **It would write `src: "client"` rows into `pl:pred`. READING 15(c) SETTLES IT AND IS NOW
   URGENT, not merely first in the queue.**
2. **`/api/propsnap` firing** — ≤96 per fire. `CLAUDE.md` L150 records its cron-job.org entries as
   **weekend-only** (`* * 0,6`) and today is Friday, so a hit here would ALSO mean the entries are
   not what that line describes. **The ungated propsnap curl settles it at zero cost.**
3. **The owner's own reads** — but every read on tonight's list is zero-credit except Variant B,
   which is 12. **146 ≫ 12**, so the list alone cannot explain it.
4. An unnamed spender.

**WHAT THIS DOES TO THE EVIDENCE.** The relay-window residual is no longer ~0/h (at c = 5.845) or
+3.21/h (at c = 5.114). **This window alone is 48.3/h with no device use claimed and no scheduler
running.** It is the first observation that points AWAY from the client-side hypothesis rather
than toward it — or, if it was a client generate, it is the hypothesis firing at a magnitude
nobody had priced. **Both readings are live and the two queued reads separate them.**

**POSITION RESTATED.** Today's spend: **1,038 → 553 = 485 credits**, of which **339 attributed to
props and 146 unattributed**. At 553 remaining, props ceiling 162–185/day post-cut, and a residual
now bounded below by today's 146: **burn 308–386/day → RUNWAY 1.4–1.8 DAYS.**

**THE BOARD DECISION IS AFFECTED.** Precondition 1 was *"the residual is client-side and therefore
the owner's to control."* This window is either the strongest evidence for it (a generate he
triggered) or the clearest evidence against it (48.3/h with nobody there). **It is not a reason to
cancel tomorrow's board by itself — but it must be resolved BEFORE the fire, and the two reads
that resolve it are already first in the queue.**

---

# PART EIGHT — 2026-07-31, owner's items 1–4

## 31. THE BURST: WHAT IT WAS NOT (item 1)

**Quota is flat again — 553 at 19:11:31Z, 553 at 19:12:16Z, 553 at 19:19:55Z.** The burst started
and stopped inside one three-hour window. **Resolution limit, stated: `data/quota-log.jsonl` holds
only the two endpoints of that window. Nothing on disk can subdivide it retroactively.**

**`board-archive` — TRACED, not asserted.** `tools/archive_boards.py` makes exactly two outbound
call shapes: `{BASE}/api/board?date=…&gen=list` (L99) and `…&gen=<which>` (L103). `/api/board` has
**no Odds-API reference of any kind** — `gen` only selects which stored generation to return
(route L26–33). **Its zero-credit header is a traced fact.** The job inventory's cost column stands.

**THE DEPLOY HYPOTHESIS IS DEAD, MEASURED AND STRUCTURAL.**
- **Measured**: between 14:06Z and 16:10Z I pushed `frontend-rebuild` **seven times** (`ceb63a7`,
  `49a9d83`, `2ecffd2`, `9324517`, `591caf2`, `ebec94e`, `a045944`). Quota across that span:
  **699 → 699 → 699 → 699.** Seven Vercel builds, **zero credits.**
- **Structural**: every page under `app/` is `"use client"` except `layout.tsx`; there is **no
  `revalidate`, no `generateStaticParams`, no `force-static`** anywhere; `sharpBoard.ts` is
  `"use client"` and is imported by exactly one file, `SharpDesk.tsx`. **No build-time or ISR
  fetch of the Odds API exists in this codebase.** The owner's first branch does not fire.

**THE UNGATED SURFACE, WITH COSTS PER CALL:**

| route | gate | what an unauthenticated caller triggers | cost per call |
|---|---|---|---|
| **`/api/odds`** | **UNGATED** except `fresh=1` (`APP_PASSCODE`) | any upstream the caller names, served through the Next data cache (`TTL_SECONDS = 240`) | **1 credit per market×region pair returned**, or **0 on a cache hit**. SharpDesk's shape = **6** |
| `/api/board` | deliberately ungated | a Redis read | **0** |
| `/api/propsnap` READ | ungated | a Redis read | **0** |
| `/api/propsnap` WRITE | `x-cron-key` | — | ≤96 |
| `/api/generate` | `x-cron-key` / phrase | — | ~6 × unstarted events |
| `/api/clv` | phrase | — | ~6 per sighting |

**So the only ungated path that can spend is `/api/odds`, and 146 credits is ≈ 24 cache-missing
calls of SharpDesk's shape (24 × 6 = 144) — one miss every ~7.5 minutes for three hours.** That is
the shape of *something polling the site*, or of a browser session with the Board page open. **It
is not distinguishable from disk.**

**THE SINGLE READ THAT WOULD DISTINGUISH THEM: the Vercel function log** — per-invocation URLs for
`/api/odds`, dashboard-only. **The owner opens it.** Second-best, and free: `pl:pred` `src:"client"`
rows (reading 15(c)) separate "a client generate" from "a proxy poll", because a generate writes
rows and a poll does not.

**TODAY ON ONE AXIS** (full timeline on disk; the load-bearing rows):

| UTC | PT | event |
|---|---|---|
| 01:25 | 18:25 | QUOTA 1,038 |
| 06:41 | 23:41 | QUOTA 1,038 — after **8** frontend-rebuild pushes, zero spend |
| 08:10–11:04 | 01:10–04:04 | **8 props-history runs → 4 paid snapshots, 58 event-fetches** |
| 13:57 | 06:57 | **QUOTA 699 — 339 spent, fully attributed to props** |
| 14:02, 14:28 | | pages-build-deployment ×2 (my two **main** pushes) |
| 14:36 / 14:53 / 15:45 / 16:10 | | QUOTA **699, 699, 699, 699** — **seven frontend-rebuild pushes, ZERO spend** |
| **17:12** | **10:12** | **board-archive (schedule) — the ONLY run in the window, zero credits traced** |
| **19:11** | **12:11** | **QUOTA 553 — 146 SPENT, NOTHING ACCOUNTS FOR IT** |
| 19:12, 19:19 | | QUOTA 553, 553 — flat again |

**485 spent today: 339 attributed, 146 not.**

**IMPOSSIBLE BRANCH — the quota moves again with no push, no Actions run and no device use: NOT
FIRED YET.** Flat across three reads since. If it recurs it is an external caller and it outranks
the freeze; `tools/quota.mjs` appends on every call, so the standing instruction is to call it
often enough to bracket the next one.

## 32. THE PER-GAME CONTEXT — I OVERSTATED IT, AND THE UNRESOLVED PATH IS NEUTRAL (item 2)

**CORRECTION TO MY OWN CLAIM.** I wrote that weather had matched nothing since 07-29. **That is
wrong. Weather does not come from `context.json` at all** — the slate fetch hydrates it live from
statsapi (`legacy/index.html` **L1218**, `hydrate=probablePitcher,weather,lineups,venue,linescore`;
stored at **L1244** as `weather: g.weather||null`). `shTempF` (L1616) and `windNote` (L2024) read
that live field. **They are unaffected.**

**`SH_CTX.games` is read by exactly ONE function**: `shUmpCtx` (L1600–01), verified by grep. So the
frozen context's per-game array feeds **the umpire block and nothing else**. Team-keyed blocks
(`pen_quality` L1611, `bullpen_last3` L1663) resolve by name and are unaffected.

**The unresolved path, cited:**
- `shUmpCtx` L1603: no pairing match → **`return null`**.
- `shUmpKf` L1605: `if(SH_CFG.umpKFrozen)return 1` — identity before it even looks. Unfrozen:
  `u=null` → `f=null` → **`return 1`**. **A NEUTRAL DEFAULT. The price does not move.**
- `shUmpKfShadow` L1608: `if(!u)return null` — **records nothing**, and is never multiplied.

**→ THE OWNER'S FIRST BRANCH FIRES: the unresolved path is a neutral default, a stated engine
configuration, not a defect. No M-number.**

**Is it prospective only? YES.** No board has been generated since 2026-07-26, and the context
froze 07-29. **No board on disk has ever run with an unresolved block** — the impossible branch
does not fire. **Tomorrow's board is the first**, and what it loses is **not pricing** (the factor
is pinned to 1 regardless) but **the shadow record**: `gameInfo.shadow` will carry no `kRaw` for
any game, so the seeds block's ump line yields nothing and the kRaw experiment stays blocked.

**Scoped regeneration, field list for the diff**: `context.json`'s top-level keys are
`generated_at · date · league_k_per_game · ump_db_games · games · bullpen_last3 · pen_quality`.
A regeneration that must be accepted only if the diff is confined to **`games`, `date`,
`generated_at`, `ump_db_games`** — with **`bullpen_last3`, `pen_quality` and `league_k_per_game`
byte-identical** — is mechanically checkable key by key. **It is still a vintage event and it
competes with the board for the same day.** Printed; not taken.

## 33. M27 NARROWED, AND THE HYGIENE SWEEP (item 3)

**Narrowed on the owner's word.** `originRefs()` now consults `HEAD` **only when the handoff
actually records a held stack** — `heldStack()` reads the git-state section for shas the doc calls
held or unpushed, skipping the "nothing held" line. **Today it returns empty, so the guard is
strict — exactly the assertion the orphan preserved.** The hold rhythm still works the moment the
doc records one. Green.

**THE SWEEP — and the subject-line rule does not survive contact.** 87 commits since 2026-07-24
touch `tests/`. A keyword rule on subjects flags **45 of 87**, and almost every one is a NEW guard
shipped alongside a finding — this repo's healthy pattern, and subjects here run to hundreds of
words so the keyword is nearly always present. **A subject rule would train suppression. It is not
the workable version.**

**The workable version is the DIFF.** Shipped as `tools/guard-diff-audit.mjs`:

| | count |
|---|---|
| commits touching `tests/` since 07-24 | **87** |
| deleting lines from a `*.test.ts` | **31** |
| removing lines carrying `expect(` / `it(` / `describe(` | **17** (91 lines) |
| **NET-NEGATIVE in a test file — coverage actually shrank** | **1** |

**The one net-negative commit is `371bdd8`** (`calibration.test.ts` +65/−73), whose subject says
*"Re-scope the calibration buckets to EV"* — **the deletion is explained by its own subject.** The
other 30 are rewrites in place: reformulations, not removals.

**THE OWNER'S SECOND BRANCH — any other weakened assertion: NO.** M27 is the only weakening found.

**AND THE TOOL'S OWN LIMIT, which is the finding worth keeping**: `ea7445a` deleted **one line and
zero assertion lines**. It was a behaviour change inside a helper, not an assertion removal —
**an assertion-count rule would MISS M27.** What found M27 was an untracked orphan preserving the
pre-change file. **So the sweep narrows the review set from 87 to 31; it does not close the class,
and no encoding here does.**

## 34. THE BOARD UNDER THREE HYPOTHESES (item 4 — printed, not decided)

Quota **553**. Props ceiling post-cut **162–185/day**. Board **62–70**.

| hypothesis | residual/day | burn/day | **runway at 553** | after a 66-credit board |
|---|---|---|---|---|
| **A — one-off deploy/session artifact** | ~0–100 | 162–285 | **1.9–3.4 d** | **1.7–3.0 d** |
| **B — recurring at 48.3/h** | **1,159** | **1,321–1,344** | **0.41 d — under ten hours** | **0.36 d** |
| **C — external and unbounded** | unbounded | unbounded | **not computable** | irrelevant |

**Hypothesis A is the only one where tomorrow's board is a normal decision.** Under B the key dies
before Sunday and a board is 12% of what is left. Under C nothing we ration matters.

**What the board still buys, under each**: unchanged in content — board 1 of the homogeneous
window, the outs flag's first production exercise, `mktN` observed, cfSel `rank`/`stake`,
`clampActivity`, the replay diff. Under A that is worth 66 credits of a ~2–3 day runway. Under B
it is worth 66 credits of a **ten-hour** runway, and the same 66 credits buy roughly ninety minutes
of the unknown instead — **which is the argument for firing it FIRST rather than not at all**,
because a board is the only artifact that survives the key dying. Under C the board is unaffected
by the reasoning entirely; the spend is not ours to ration.

**BOTH WAYS, PLAINLY. FOR**: the burst does not change what the board measures, four dark days have
already cost the window its first four boards, and if the key is about to die the board is the last
chance to exercise the outs flag and read `mktN` at all. **AGAINST**: precondition 1 was *"the
residual is client-side and therefore mine to control"* and this window is evidence against it, so
firing now spends 66 credits into a system whose largest spender is unidentified — and a board read
against an unexplained burn is the same bet-on-an-unknown the gate was written to refuse.
**NOT DECIDED. The owner decides at 15:38 PT with the four reads in hand.**

---

# PART NINE — 2026-07-31, owner's items 1–3

## 35. THE VERCEL FUNCTION LOG — READING WRITTEN BEFORE THE LOG IS OPENED (item 1)

**Window: 2026-07-31 16:10:13Z → 19:11:31Z. Known spend: 146 credits. Known cause: none.**

### What to look for

| # | look for | why it discriminates |
|---|---|---|
| 1 | **count and timestamps of `/api/odds` invocations** in the window | 146 ÷ 6 = **24.3**. ~24 calls at **regular ~7.5-min spacing → POLL**. Irregular clustering → session. **Fewer than ~24 → the market×region product differed and the arithmetic must be redone, not assumed** |
| 2 | **user-agent, referer, IP shape** | a browser session carries a referer from `parlay-lab-six.vercel.app` and a real UA; a poller usually carries neither, or a library UA (`curl`, `python-requests`, `Go-http-client`, an uptime service) |
| 3 | **`fresh=1` on the query string** | **THIS IS THE ONE THAT MATTERS — see below. `fresh=1` bypasses the 240 s cache, so EVERY call pays.** Without it a caller pays at most once per 4 minutes globally |
| 4 | **direct hits vs page renders** | `/api/odds` is called from the browser by `SharpDesk`, `useAllStar`, `ufc` and `fetcher` — a page render shows `/board` (or `/`) alongside it. `/api/odds` alone with no page request is a direct caller |
| 5 | **`/api/generate`, `/api/propsnap`, `/api/clv` in the same window** | a `generate` hit explains ~90 at once; a `propsnap` hit explains ≤96 and also means its cron entries are not the weekend-only ones `CLAUDE.md` L150 describes |
| 6 | **the same cadence BEFORE 16:10Z** | if the pattern predates the window it is not new — it is the first time two quota reads happened to bracket it |

### Pre-committed reading — fixed now, before the log is open

- **Regular ~7.5-min intervals, non-browser agent** → **EXTERNAL POLLER on an ungated route.**
  **Not ours to ration; the response is to GATE THE ROUTE, not to cut collection.** That becomes
  the highest-priority ship and it outranks the props cadence entirely.
- **Irregular, browser UA, our referer** → a session had the Board page open. **Operator-side**,
  precondition 1 holds in the sense that matters, and the lever is device use.
- **`fresh=1` present on any of them** → **that is the mechanism regardless of who called**, and
  the fix below is a ZERO-CODE change.
- **The cadence predates 16:10Z** → **the residual has been this all along. Every relay-versus-use
  contrast in §9 and §12 is CONFOUNDED and the client-side hypothesis is DEAD, not weakened.**
  Every window's residual restates as "poller + whatever else", and the 2.2× contrast becomes an
  artifact of when the poller happened to be running.
- **Nothing in the log accounts for 146 credits** → **the spend did not come through our routes at
  all**, and the next candidate is **the Odds API key in use somewhere outside this deployment**
  (a second project, a leaked key, a stale local `.env`). **That outranks the freeze**, and the
  read that follows is the Odds API dashboard's own usage-by-key view.
- **IMPOSSIBLE BRANCH: the log shows requests but the arithmetic does not fit** — e.g. 6 requests
  for 146 credits, or 60 requests for 146 — **print both numbers.** A request count that implies a
  per-call cost outside [1, 6] means the calls were not the shape we think, or something else was
  billed in the same window.

### 🔴 AND THE FINDING THAT MAKES `fresh=1` THE LEADING CANDIDATE

`app/api/odds/route.ts` **L36–40**:

```ts
const fresh = req.nextUrl.searchParams.get("fresh") === "1";
const pass = process.env.APP_PASSCODE;
if (fresh && pass && req.headers.get("x-pl-pass") !== pass) { … 401 }
```

**The gate is conditional on `APP_PASSCODE` being SET. `tools/snapshot_props.py` L22 and
`tools/snapshot_odds.py` L21 both request `&fresh=1` and send NO `x-pl-pass` header — and the
props sweep landed 58 event-fetches this morning. Therefore `APP_PASSCODE` IS UNSET IN
PRODUCTION, and `fresh=1` IS CURRENTLY UNGATED.**

**Anyone who finds `/api/odds?u=<upstream>&fresh=1` can force a cache-bypassing upstream fetch and
spend on EVERY call, with no 4-minute floor at all.** That is the unbounded version of the ungated
surface, it is the most plausible mechanism for a 146-credit burst, and it was inferred here from
the sweep's own behaviour rather than read from the dashboard — **confirm `APP_PASSCODE`'s state in
Vercel → Settings → Environment Variables when you are there.**

## 36. GATING `/api/odds` — THE SPEC, AND IT IS A ZERO-CODE CHANGE

**Every legitimate caller, and whether it can carry a header:**

| caller | where it runs | uses `fresh=1`? | can carry a secret? |
|---|---|---|---|
| `src/engine2/sharpBoard.ts` L135 (SharpDesk) | browser | **no** | only via the device passcode the Settings page already stores |
| `src/lib/useAllStar.ts` L65 | browser | no | same |
| `src/lib/ufc.ts` L86 | browser | **yes, conditionally** | same |
| `src/lib/fetcher.ts` L25 | browser | no | same |
| `app/api/clv/route.ts` L49 | **server** | no (`cache: "no-store"` on its own fetch) | yes trivially |
| `tools/snapshot_props.py` L22 | GitHub runner | **YES** | **yes — one header line** |
| `tools/snapshot_odds.py` L21 | GitHub runner | **YES** (job disabled) | yes |
| `tools/quota.mjs` | local | no | yes |

**THE MINIMAL FIX, in order of cost:**

1. **SET `APP_PASSCODE` in Vercel. Zero code.** It immediately 401s every unauthenticated
   `fresh=1`, closing the unbounded path. **Cost: two follow-ups** — add
   `"x-pl-pass": os.environ["APP_PASSCODE"]` to the `Request(...)` headers in `snapshot_props.py`
   (and `snapshot_odds.py`, currently disabled), with the value passed as a GitHub secret; and
   enter the passcode once in Settings on the device so `ufc`'s fresh path and `/api/sharp` keep
   working. **`/api/sharp` L69–70 already 401s when `APP_PASSCODE` is set**, so that is the second
   thing to check after flipping it.
2. **Leave the cached path open.** Gating non-`fresh` `/api/odds` would break SharpDesk, useAllStar
   and fetcher for any device without the passcode, and the cached path is already bounded at
   **one spend per 4 minutes globally** — a ~2,160/day worst case, but only if something polls
   continuously, which item 1's log settles.
3. **If the log names a poller on the CACHED path**, the narrow fix is an origin/referer check on
   `/api/odds` for browser-shaped requests plus the passcode for tool-shaped ones — a real code
   change, spec'd only if that branch fires.

**Not shipped. The diff for step 1 is an environment variable and two header lines; it waits on
the log.**

## 37. THE PLANT AUDIT — 6 OF 7 PRESERVED, AND WHAT PLANTS ACTUALLY PROVE (item 2)

**The seven guards signed off in the encoding sessions:**

| guard | in-repo plant case? |
|---|---|
| `served-extractor.test.ts` | ✅ |
| `site-id-integrity.test.ts` | ✅ |
| `line-history-consumers.test.ts` | ✅ |
| `read-first-index.test.ts` | ✅ |
| `finite-prices.test.ts` | ✅ |
| `self-arm-stamp.test.ts` | ✅ |
| **`chain-tools.test.ts`** | **❌ NONE** |

**`chain-tools.test.ts`'s observed-red was *"every import above threw MODULE_NOT_FOUND"* — a
one-time historical act that cannot be re-run now that the modules exist.** Its thirteen
assertions are real; its red is a memory. **Also plant-less: `doc-structure.test.ts`**, which is
the guard that caught two errors in this session's own commits.

**23 of 82 test files carry a re-runnable plant.** So the honest state is mixed, and the owner's
first branch fires **for one of the seven and for the majority of the suite**: most observed-reds
in this project are historical claims, not standing properties. **Recorded in the instrument
ledger.**

**AND THE SHARPER POINT, which is the answer to "what would actually catch a behaviour change
inside a test helper".** Every preserved plant here proves the **COMPARATOR** — the pure function
rejects synthetic invalid input. **None proves the WIRING** — that the live assertion fails when
the REAL artifact is corrupted. **A guard whose comparator is perfect but whose reader points at
the wrong input passes every plant it has.** That is exactly instrument defect #6
(`workflow-timing` reading the non-firing branch) and exactly M27 (a helper's return value
widened, zero assertions touched). **Plants as written could not have caught either.**

**What would**: run each guard against a **deliberately corrupted copy of its own input** and
assert it fails — an observed-red that re-runs every build.

**COST, and the owner's second branch fires — it is cheap.** Most of these guards read a hardcoded
path. The change is: **give each reader an optional path parameter defaulting to the real one**
(one line per guard), then **one meta-test** that, for each guard, copies its input to a temp file,
corrupts it in the specific way the guard exists to catch, and asserts the guard throws. Roughly
**one line per guard plus a ~60-line meta-test and one corrupted-fixture recipe per guard**.
**SPEC'D, NOT SHIPPED.**

**IMPOSSIBLE BRANCH — any guard passes on its own plant today: DOES NOT FIRE.** The suite is green
at 82 files / 605 tests, and every in-repo plant is an assertion inside that run, so a passing
suite is a passing plant. What it does not establish — and this is the whole finding — is that the
guard would fail on a real corruption.

## 38. THE FOUR BOARD BRANCHES, RECORDED BEFORE THE READS (item 3)

**The owner's decision, conditional, written before tonight's reads:**

| the log shows | decision |
|---|---|
| **an external poller** | **FIRE at 22:38Z.** The burn is not ours to control by abstaining, and a board is the artifact that survives whatever happens to the key. Gating `/api/odds` (§36 step 1) ships before or after depending on the log |
| **a session of the owner's** | **FIRE.** Precondition 1 holds in the sense that matters — the spend is operator-controllable |
| **nothing that accounts for 146** | **NO BOARD. Fifth dark day**, and the missing input is named: **the Odds API key in use outside our routes** |
| **the burst recurs before 15:38 PT** | **NO BOARD**, and **the recurrence is the finding** |

---

# PART TEN — 2026-07-31, owner's items 1–3

## 39. SEQUENCING `APP_PASSCODE` — DO NOT FLIP IT TONIGHT WITHOUT THE HEADER (item 1)

**THE OWNER'S SECOND BRANCH FIRES: rejection 401s. It does NOT fall through to cache.**
`app/api/odds/route.ts` **L38–40** returns `NextResponse.json({error:"passcode required for a fresh
pull"}, {status:401})` **before** the upstream fetch. There is no fallback path.

**And the sweep DIES, it does not degrade.** `tools/snapshot_props.py`'s `fetch()` retries three
times (15/30/45 s sleeps), returns `None`, and `main()` L278–280 prints
`"skipped: proxy unreachable"` and **returns. The morning batch would collect nothing.**

| caller of `fresh=1` | what it gets when gated | verdict |
|---|---|---|
| `tools/snapshot_props.py` L22 | 401 → `None` → `skipped: proxy unreachable` | **DEAD — the collection that pays for the window stops** |
| `tools/snapshot_odds.py` L21 | same | dead, but the job is disabled anyway |
| `src/lib/ufc.ts` L86 (`fresh` path only) | 401 | **degraded, and it has never fired** — not a consideration |
| everything else (`sharpBoard`, `useAllStar`, `fetcher`, `/api/clv`) | unaffected — none sends `fresh=1` | fine |

**⚠️ IMPOSSIBLE BRANCH — something gated with NO header path at all: IT FIRES.**
`app/api/sharp/route.ts` **L69–70** 401s whenever `APP_PASSCODE` is set, **unconditionally, not
just on `fresh`**. The device passcode is written to `localStorage.pl_pass` by
`app/settings/page.tsx` L348 — **and a repo-wide grep finds NO client code that ever sends
`x-pl-pass`.** So the passcode is stored and never used. **Setting `APP_PASSCODE` breaks the Sharp
page on every device until a client change ships.** Print this before flipping — it is the second
casualty and it has no header path today.

### THE ORDER OF OPERATIONS THAT LEAVES NO GAP

**Staged, and they need NOT be one visit — each step is inert until the last one.**

1. **SHIPPED THIS TURN**: both sweep scripts now send `x-pl-pass` **only if `APP_PASSCODE` is
   present in their environment**. While it is unset everywhere, nothing changes. Value from
   `os.environ`, never hardcoded:
   ```diff
   +PASS = os.environ.get("APP_PASSCODE", "")
   -    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
   +    _h = {"User-Agent": UA, "Accept": "application/json"}
   +    if PASS: _h["x-pl-pass"] = PASS
   +    req = urllib.request.Request(url, headers=_h)
   ```
   Live immediately — the workflows pull `tools/` from `origin/frontend-rebuild` at run time, so
   **there is only ONE copy of each script**, no main/ship split.
2. **GitHub → Settings → Secrets → Actions → new secret `APP_PASSCODE`.** Inert alone.
3. **`props-history.yml` ON `main`** (the firing copy) — add to the snapshot step:
   `env:\n  APP_PASSCODE: ${{ secrets.APP_PASSCODE }}`. Still inert: the script sends a header the
   route ignores while Vercel's var is unset. **This is a yml change on main and it is the one
   step that touches the firing branch.**
4. **LAST: Vercel → Settings → Environment Variables → `APP_PASSCODE`.** The gate activates at
   this instant, and the sweep is already sending the header.
5. **Then, same visit:** enter the passcode once in Settings on the device (persisted to
   `localStorage.pl_pass`) — **and know that this does NOT fix `/api/sharp`**, which needs the
   client change from the impossible branch above. Check the Sharp page immediately after.

**There is no ordering in which collection is gated but unauthenticated, provided step 4 is last.**

### DOES GATING `fresh=1` CLOSE THE EXPOSURE? NO — IT NARROWS IT.

`/api/odds` validates `u` (L26: `https:` only, `hostname === "api.the-odds-api.com"`), so a caller
can only proxy to that host. **But the Next data cache keys on the FULL URL**, and the caller
controls markets, regions, sport and event id inside `u`.

| adversarial pattern | ceiling |
|---|---|
| **one URL, cached path** | 1 spend per `TTL_SECONDS = 240` → **360/day × 6 = 2,160/day** — already more than the 553 remaining |
| **varied `u`, cached path** | **every call is a cache MISS. Bounded only by request rate — effectively unbounded**, i.e. it drains the pool as fast as it can be called |
| `fresh=1`, ungated (today) | same as varied-`u`, with no cache to vary around |

**So: setting `APP_PASSCODE` removes the trivial bypass and nothing more. THE EXPOSURE IS NOT
CLOSED — it is narrowed, and it remains unbounded against a caller that varies `u`.** The only
thing that closes it is authenticating `/api/odds` itself, which is feasible (the device passcode
already exists in `localStorage`) but requires the four browser call sites to send `x-pl-pass` —
a real change, spec'd only if item 1's log names an external caller.

## 40. THE `fresh=1` DISAMBIGUATION FOR THE LOG (item 3)

**Our own sweep sends `fresh=1`, so the log will show both.** How to tell them apart:

| signal | OUR sweep | not ours |
|---|---|---|
| **user-agent** | `snapshot_props.py`'s `UA` constant — a fixed, non-browser string | a browser UA, a library UA, or absent |
| **the `u` parameter's shape** | `…/v4/sports/baseball_mlb/events` first, then `…/events/<id>/odds?regions=us&…&markets=batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs` — **six markets, `regions=us` ONLY** | anything else. **SharpDesk's shape is `regions=us,eu` + `markets=h2h,totals,spreads` — three markets, two regions.** The two are unmistakable |
| **timestamps** | cluster tightly around a props-history run start (08:10, 09:34, 10:19, 11:04 today) | **the burst window 16:10–19:11Z contains NO props-history run at all** |
| **IP** | a GitHub Actions runner range | anything else |

**PRE-COMMITTED:**
- **All `fresh=1` traffic in the window matches our sweep's shape** → **the burst was our own
  collection and the attribution arithmetic is wrong somewhere.** Best outcome available; it takes
  a **correction**, not a fix — and the first place to look is whether a sweep run paid without
  committing a snapshot, since the archive is what attribution is computed from.
- **`fresh=1` traffic that does not match** → external, and the passcode (§39) is the answer.
- **No `fresh=1` and 146 spent anyway** → **the cached path missed repeatedly, which requires many
  DISTINCT upstream URLs** — one URL cannot miss more than 15 times an hour. That implies a caller
  enumerating events or markets, i.e. something walking the API surface rather than polling one
  endpoint. **That is a scraper, not a monitor**, and it makes the varied-`u` ceiling above the
  operative one.

## 41. THE WIRING META-TEST — SHIPPED, AND THE COUNT (item 2)

`tests/guard-wiring.test.ts`. For each covered guard: back up its real input, corrupt it in the
specific way that guard exists to catch, **run that guard alone in a subprocess, assert non-zero
exit**, restore, and assert the restore was byte-exact. The guard reads its own real path
throughout — nothing is injected, so nothing about its wiring is assumed.

**OBSERVED RED FIRST, as required.** The first run included a **NO-OP control** — a "corruption"
that appends a newline and changes nothing the guard reads. **It failed to fail**, exactly as it
should:

```
× tests/self-arm-stamp.test.ts fails when ump_k.json is corrupted: NO-OP CONTROL …
  tests/self-arm-stamp.test.ts STAYED GREEN on a corrupted data/ump_k.json.
Tests  1 failed | 6 passed (7)
```

That is the demonstration that a green result here means the corruption was real. The control is
not kept — it would be permanently red — and its removal is why coverage is stated as a count.

**RESULTS: 5 of 5 covered guards FAIL on a real corruption. ZERO dead guards found.**

| guard | corruption | result |
|---|---|---|
| `self-arm-stamp` | a third umpire promoted to g ≥ 5 | ✅ fails |
| `read-first-index` | a doc row deleted from the index | ✅ fails |
| `doc-structure` | an amendment id referenced with no bundle entry | ✅ fails |
| `fixture-citation` | a fixture figure cited with no provenance | ✅ fails |
| `sha-references` | a dangling sha inserted in a doc | ✅ fails |

**THE COUNT, PLAINLY. Of the seven encoded invariants the owner signed off, TWO are proven wired**
— `self-arm-stamp` and `read-first-index`. **Five are not corruptible by this harness** and are
listed in `UNCOVERED` with the reason, which the test asserts is non-empty:
`site-id-integrity` and `served-extractor` read `legacy/index.html` (**corrupting the engine string
risks leaving it mutated if the run dies — not worth the coverage**); `finite-prices` asserts on
computed values with no file input; `chain-tools` and `line-history-consumers` would require
editing source, which is the change under test rather than its input.
**Three further guards outside the seven are now proven wired, for five total.**

**IMPOSSIBLE BRANCH — a guard whose real input cannot be corrupted in the way it exists to catch:
IT FIRES, for `finite-prices`.** Its assertion is about computed board values, so there is no
artifact to corrupt; its plant proves the comparator and nothing can prove its wiring without a
board. Recorded rather than papered over.

**AND `chain-tools` NOW HAS A STANDING PLANT** (five invalid-by-value cases: a non-positive edge
cannot produce a positive Kelly fraction; the residual cannot be folded into a known line; an
empty board cannot report a pass; a client row cannot census to zero; a flat quota cannot report
spend). Its original red — *"every import threw MODULE_NOT_FOUND"* — was a memory; these re-run
every build. **`doc-structure` needed no plant: it is now proven WIRED, which is strictly
stronger.**

---

# PART ELEVEN — 2026-07-31, owner's items 1–3

## 42. THE PASSCODE REGRESSED ON THE DAY IT SHIPPED — M28 (item 1)

**THE OWNER'S SECOND BRANCH FIRES: it did not "never work". It worked, and a named commit removed
it — on the same day.**

- **`6a28eef` (2026-07-11)** shipped the working path: `app/sharp/page.tsx` read
  `localStorage.pl_pass`, sent `x-pl-pass` on the `/api/sharp` POST, and handled the 401.
- **`e9f4bc7` (2026-07-11T12:16:10-07:00)**, subject *"The Sharp = the built-in quant engine's
  daily read (no key needed)"*, **deleted all three lines**:
  ```diff
  -      setPass(localStorage.getItem("pl_pass") ?? "");
  -        headers: { "content-type": "application/json", ...(pass ? { "x-pl-pass": pass } : {}) },
  -        if (pass) localStorage.setItem("pl_pass", pass);
  ```
- **`app/settings/page.tsx` kept the collection UI.** Since `e9f4bc7` — **twenty days** — the
  passcode has been written to `localStorage.pl_pass` and **read by nothing**.

**THE DISPLAY HALF IS WORSE THAN THE DISCARDED VALUE.** The Settings panel says, verbatim:

> **Passcode for spend-money actions (The Sharp, forced odds refresh)** … *"Must match the
> `APP_PASSCODE` environment variable on Vercel. The public URL is reachable by anyone; **this
> stops strangers from burning your API credits.** Entered once per device."*

**A UI that collects a credential, stores it, sends it nowhere, and tells the operator it is
stopping strangers from burning credits.** That is the sixth instance of the computed-and-
discarded class (after `shPenQF`, `shUmpKf`, the Kelly ceiling in legacy modes, `cfSel`'s
counterfactual, and the `kellyDaily>0` warning gate) — **and the only one that asserts a
protection exists.** Recorded as **M28**.

**IMPOSSIBLE BRANCH — some caller already sends it: DOES NOT FIRE.** A repo-wide grep over
`src/` and `app/` finds `x-pl-pass` in **zero** current files; the only history is the two
2026-07-11 commits above.

### Every call site that 401s once `APP_PASSCODE` is set, and the fix

| call site | route | currently sends `x-pl-pass`? |
|---|---|---|
| `src/engine2/sharpBoard.ts` L135 | `/api/odds` | no — only affected if the route is fully gated |
| `src/lib/useAllStar.ts` L65 | `/api/odds` | no — same |
| `src/lib/ufc.ts` L86 | `/api/odds` (`fresh=1` path) | **no — 401s immediately** |
| `src/lib/fetcher.ts` L25 | `/api/odds` | no — only if fully gated |
| `app/sharp/page.tsx` L425 | `/api/sharp` | **no — 401s immediately** |
| `app/settings/page.tsx` L322 | `/api/sharp` | **no — 401s immediately** |
| `tools/snapshot_props.py`, `tools/snapshot_odds.py` | `/api/odds?fresh=1` | ✅ **shipped this turn** |

**IT IS ONE CHANGE, NOT SIX.** All six client sites already funnel through `fetch()`; the fix is a
single helper plus a one-line spread at each:

```ts
// src/lib/pass.ts  (NEW — the whole change)
export function passHeader(): Record<string, string> {
  try { const p = localStorage.getItem("pl_pass"); return p ? { "x-pl-pass": p } : {}; }
  catch { return {}; }
}
```
```diff
- const r = await fetch(`/api/odds?u=${encodeURIComponent(UPSTREAM)}`);
+ const r = await fetch(`/api/odds?u=${encodeURIComponent(UPSTREAM)}`, { headers: passHeader() });
```
Six one-line edits, no engine string, no hash move, **no vintage event**. **SPEC ONLY — not
shipped, per the owner's instruction.** It is what makes step 4 of §39 safe.

## 43. PRICING THE REAL FIX — AND ONLY AUTHENTICATION CLOSES IT (item 2)

| option | client change | what it closes | cost |
|---|---|---|---|
| **A — authenticate `/api/odds` itself** | **§42's helper + 6 one-line edits** (the SAME helper) | **everything.** No unauthenticated caller reaches the upstream at all | 1 new file, 6 lines, 1 route line moving the check out of the `fresh` branch |
| **B — allow-list `u`'s market/region shapes** | **none** | the SHAPES only — **and that is not the exposure** (below) | ~15 route lines |
| **C — per-IP rate limit** (Redis is already wired) | none | the RATE, not the principal; defeated by multiple IPs | ~15 route lines + a Redis counter |

**⚠️ IMPOSSIBLE BRANCH FIRES, and it kills option B.** *"`u` can be varied in ways an allow-list
cannot bound while still reaching a legitimate upstream"* — **the EVENT ID.** Example, every part
of it on any allow-list we would write:

```
/api/odds?u=https://api.the-odds-api.com/v4/sports/baseball_mlb/events/<any real event id>/odds
          ?regions=us&markets=batter_hits,batter_total_bases,batter_home_runs,
                              batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs
```

That is **exactly the props sweep's own shape**. There are ~15 live event ids on a slate, so an
allow-list still admits **~16 distinct cache keys** (15 events + the `/events` list), each
independently refreshable **every 240 s → 360 spends/day each**. **~16 × 360 × 6 ≈ 34,000
credits/day of admissible spend.** The allow-list bounds the shape and leaves the ceiling two
orders of magnitude above the pool.

**→ THE OWNER'S SECOND BRANCH FIRES: only full authentication closes it. The staged sequence plus
§42's helper is the path, and STEP 4 WAITS FOR THE HELPER.**

**`/api/board` and `/api/propsnap`'s read paths**: both are **Redis reads costing zero Odds
credits** — traced, not asserted (§31 for `/api/board`; propsnap's read path is L68–72, a
`redisGetJson` and nothing else). **Gating them buys nothing and costs the board-archive job its
access.** Leave them open; that reasoning is already in their headers.

## 44. THE WIRING COUNT GOES TO FOUR OF SEVEN (item 3)

**THE OWNER'S FIRST BRANCH FIRES: the copy approach works.** Both guards took a one-line
env-overridable path (`PL_ENGINE_PATH`, `PL_GEN_PATH`) defaulting to the real file, and the harness
now writes the corrupted content to a **temp copy** and points the guard at it — **`legacy/index.html`
is never written at all**, which is strictly safer than the in-place mode the doc cases use.

**7 guards proven wired, up from 5.** New: `site-id-integrity` (a clamp site id renamed `1605`→
`9999`) and `served-extractor` (the generated engine string truncated to 90%).

**OF THE SEVEN INVARIANTS THE OWNER SIGNED OFF: FOUR ARE PROVEN WIRED** — `served-extractor`,
`site-id-integrity`, `read-first-index`, `self-arm-stamp`. **Three are not, and permanently so
unless their design changes:**

| guard | why it cannot be corrupted here |
|---|---|
| `chain-tools` | asserts pure functions imported from `tools/`; corrupting them means editing source, which is the change under test rather than its input. **Now carries a standing plant instead** |
| `line-history-consumers` | its corruption is *"a consumer appears"*, i.e. adding a real import to source — same objection |
| **`finite-prices`** | **asserts on computed board values. There is no artifact to corrupt** — its wiring is unprovable without a board |

**`finite-prices` GETS ITS WIRING PROOF FROM TOMORROW'S BOARD**, added to the seeds block: after
the board lands, take the saved `~/board-0801.json`, **set one row's price to `NaN` in a COPY, and
confirm the guard fires on real board data.** That is the only artifact that can prove it, and it
exists for one day.

**Also proven wired, outside the seven**: `doc-structure`, `fixture-citation`, `sha-references`.
