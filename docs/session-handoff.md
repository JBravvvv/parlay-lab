# SESSION HANDOFF — rewritten from disk 2026-08-01, immediately before compaction

Every line below was re-read and re-derived from disk THIS TURN. Sections 1–5 are carried
**byte-verbatim** from the prior revision by extraction rather than retyping, so no transcription
error is possible in the fire block or the readings. Figures that could not be sourced this turn
are marked **IN-CONTEXT-ONLY-UNVERIFIED** with what resolves them. Supersedes the 2026-07-31
~21:1xZ rewrite in place; every line this session made stale is flagged where it sits.

**Origin at the moment of writing: `frontend-rebuild` = `50d0f7a`, `main` = `b1f17d2`.**

---

## 1. 🎯 THE FIRE BLOCK — FIRST IN THE FILE, NOTHING ELSE TO READ (Sat 2026-08-01)

**FIRE AT 22:38Z = 15:38 PT.** Window 22:10Z–23:00Z (T = 0.80 crosses at **22:10Z**, 0.818 over
11 unstarted; **22:38Z reads 0.909 over 11** and is the fire point — waiting from 22:10 costs no
games and buys the margin; 22:40Z reads 1.000 but costs one game; by 23:15Z only 5 of 15 remain).
Cost **62–70**. **The cron cannot do it** — entry 1 is `45 22 * * 1-5`, weekdays only.

```
# 1. quota BEFORE
node tools/quota.mjs

# 2. the board — x-cron-key, NOT the phrase. route.ts L101/L105/L289 stamp `trigger` from the
#    auth path: a phrase curl stamps "manual", and reading 5 pre-commits === "header" OR IT DID
#    NOT LAND. A phrase curl would read as a failure when nothing failed.
curl -sS -H "x-cron-key: <CRON_SECRET>" "https://parlay-lab-six.vercel.app/api/generate"

# 3. quota AFTER   (reading 26: delta / unstarted-events must land in [5, 8])
node tools/quota.mjs
```

**STOP RULE — if the response is any of these four, DO NOT RETRY AND DO NOT FORCE. Report the
body verbatim and stop:**
```
{"ok":true,"skipped":"ran recently"}                                    (45-min limiter, L127)
{"ok":true,"skipped":"dead-slate",…}                                    (board-store L161)
{"ok":true,"skipped":"low-ceiling"|"no-games-left"|"covered"|"thin",…}  (L169–180)
{"ok":true,"date":…,"logged":0,"note":"no pregame picks (off day or slate underway)"}  (L387)
```
A 401 body is `{"error":"unauthorized"}` — also a stop; the header did not match.

**THEN THE FIRST THREE CHAIN STEPS:**
```
curl -sS "https://parlay-lab-six.vercel.app/api/board?date=2026-08-01" > ~/board-0801.json
node tools/board-report.mjs ~/board-0801.json     # steps 6-8 + readings 24/25/26/29
python3 tools/self_consistency.py                 # BOTH populations must print
```
`board-report.mjs` prints, in order: the **outs VACUITY branch FIRST**, the echo fields
(`outsSusp` must be `true`, `selMode` `ev_gated`), the trigger mark, cfSel coverage with
`rank`/`stake`, `clampActivity`, and `mktN` vs `consMinN = 100` beside the blocked-reason
histogram.

**+ `finite-prices`' WIRING PROOF (the only guard whose wiring needs a board):** copy
`~/board-0801.json`, set **one row's price to `NaN` in the COPY**, confirm
`tests/finite-prices.test.ts` fires on real board data. The artifact exists for one day.

**KNOWN LIMIT, not a defect:** `gameInfo.shadow` will carry **no `kRaw`** — the frozen
`context.json` is 07-29's slate and shares **zero** team pairings with 08-01, so `shUmpCtx`
returns null for every game (§6). `shUmpKf` returns 1 either way.

### ⚠️ DO NOT SET `APP_PASSCODE` BEFORE STEPS 1–4 OF §3

`/api/odds` **401s** a `fresh=1` with no `x-pl-pass` and **does NOT fall through to cache**
(route L38–40); `snapshot_props.py` retries 3× then prints `skipped: proxy unreachable` and
returns. **The morning batch would collect NOTHING.** And **M28 blocks step 4**: the device
passcode is written to `localStorage.pl_pass` and **no client code sends it**, so setting the var
401s `/api/sharp` on every device until the helper ships.

### THE OWNER'S RECORDED ADDITION (2026-07-31)

**If the Vercel function log shows an EXTERNAL CALLER, no board is fired into an open route.**
The board waits for **M28's passcode helper** — §3 establishes that the allow-list alternative
does not bound the ceiling, so the helper is the only thing that closes it — **and that is a
same-day ship rather than a spec.**

### THE FOUR BOARD BRANCHES, decided before the reads (`branch-firing-audit.md` §38)

| the log shows | decision |
|---|---|
| an external poller | **NO BOARD until the helper ships** (the addition above supersedes the earlier "fire" branch) |
| a session of the owner's | **FIRE** — precondition 1 holds in the sense that matters |
| nothing accounting for 146 | **NO BOARD.** Fifth dark day; missing input named as the Odds key used outside our routes |
| the burst recurs before 15:38 PT | **NO BOARD**, and the recurrence is the finding |

---


## 0. READ-FIRST INDEX — every doc, no exceptions (guarded by `tests/read-first-index.test.ts`)

**Why it exists**: three turns of ration tables and a "70% of the burn" claim were produced while
`credit-budget.md` — which had already measured the same job — sat unread and unnamed here. The
guard fails if any doc is missing or listed without a description.

| doc | what it holds |
|---|---|
| `collection-period.md` | the freeze's operating record: reachability, census, every M-item's working, the run-sheet blocks, the burn investigation |
| `freeze-exit-bundle.md` | the M/A amendment table (M1–M26, A1–A4) with magnitudes, dependencies, the vintage table |
| `auto-lock-memo.md` | **MEMO, NOT A SPEC (2026-08-01)**: the lock mechanism traced to lines (one writer, six refusals, it snapshots), the late-lock defect named **UNMEASURED on disk** with the export as its instrument, why placement-vs-selection is auto-lock's **prerequisite**, why price stability is measurable from the props archive at zero credits, and why grading may resume while **fitting waits for the parameter exit** |
| `credit-budget.md` | **measured** per-job credit consumption and a proposed budget — priced line-history at ~25/day and named it non-load-bearing |
| `cron-jobs.md` | the four cron-job.org entries, their schedules, and the measured GitHub-Actions delivery delays |
| `branch-firing-audit.md` | **which branch actually fires**: the main-vs-frontend-rebuild split, every operational change marked live/not-live, the Actions run log against the burn series, the declared-cron ceilings, **the third scheduler (Vercel), the `/api/propsnap` trace, the measured close distribution, and the redesign-vs-cron-cut pricing** |
| `board-open-experiment.md` | the controlled client-spend protocol with its pre-committed readings — **and the STOP that makes the literal version unsafe on a dark board-day** |
| `session-handoff.md` | this file: the gate, the chain, the readings, the protocol |
| `hrr-recalibration.md` | the H+R+RBI suspension's evidence, its provenance markers, the λ* reading |
| `pitcher-outs-audit.md` | the outs model defect (M2/M2′), the flag's spec, the DECIDED record, the coverage gap |
| `harness-substitutions.md` | what the test sandbox replaces; the clamp-fixture spec and the fixture-representativeness criteria |
| `multibook-memo.md` | two-book execution scoping, the M15 dedup, the join pre-commitments |
| `singles-vs-parlays.md` | the structural counterfactual behind A1/A2 and the M14 refinements |
| `phase2-memo.md` | Series A/B design, the model-vs-close regression, Series A's credit floor |
| `board-timing.md` | when the engine should generate: the FP−3h lineup rule that T = 0.80 is priced against |
| `generate-timing.md` | the free-win timing argument for the generate slot |
| `clv.md` | the CLV instrument: per-leg sighting, the cents scale, the no-backfill guarantee |
| `settlement-audit.md` | the historical grading record and the ML/RL settlement corrections |
| `rebaseline-2026-07-25.md` | the 07-25 rebaseline: a bug fix, not a silenced test |
| `progress.md` | the 07-24 session-end snapshot |

**STALE-FLAGGED THIS SESSION** (each corrected in place, listed so nothing reads as current that
is not): props ~198/day → the cron cut makes the ceiling ~162–185 · line-history "~45/day" →
measured 3–4 runs/day ≈ 22 · "the class is EVENT-DRIVEN" → **retracted**, the flat had zero Actions
runs · "GitHub delivers each cron more than once" → **withdrawn**, ten declared ten delivered ·
the per-event cost 6.0 and 5.845 → **both refuted**, `c ≤ 5.114` · "weather has matched nothing
since 07-29" → **wrong**, weather is hydrated live from statsapi · the `umpKFrozen` and M25
magnitudes → **fixture-derived**, corrected · the props-history/context/model cron counts → all
read from the non-firing branch, replaced.

---


## 2. THE OPEN QUESTION — 146 CREDITS IN THREE HOURS, UNATTRIBUTED

**Both endpoints, from `data/quota-log.jsonl`:**

| at (UTC) | remaining | used |
|---|---|---|
| **2026-07-31T16:10:13Z** | **699** | 19,301 |
| **2026-07-31T19:11:31Z** | **553** | 19,447 |

**146 credits in 3.02 h = 48.3/h — the highest rate ever recorded here.** **FLAT SINCE: SEVEN
consecutive reads at 553** (19:11:31 · 19:12:16 · 19:19:55 · 19:27:29 · 19:31:25 · 20:21:56 ·
**21:04:11.529Z**), spanning **1 h 53 m**. The burst started and stopped inside one window and
**the log holds only that window's two endpoints — nothing on disk can subdivide it.**

**RULED OUT, each traced rather than asserted:**

| candidate | how it was ruled out |
|---|---|
| **Vercel deploys** | **MEASURED**: seven `frontend-rebuild` pushes 14:06→16:10Z against quota **699/699/699/699**. **STRUCTURAL**: every page under `app/` is `"use client"` except `layout.tsx`; no `revalidate`, no `generateStaticParams`, no `force-static`; `sharpBoard.ts` is client-only. **No build-time or ISR odds fetch exists in this codebase** |
| **`board-archive`** (the one run in the window, 17:12:01Z) | `tools/archive_boards.py` makes exactly two call shapes, both `/api/board` (L99, L103), and `/api/board` has **no Odds-API reference of any kind** — `gen` only selects a stored generation. **Zero, traced** |
| **line-history** | disabled on the firing copy since `3356c54`; zero runs |
| **`/api/calibrate`** | paused this session (`vercel.json`'s `crons` array removed); and it never reached the Odds API — statsapi + Redis only |
| **props-history** | **no run in the window at all**; the 07-31 archive still holds exactly its four morning snapshots (58 event-fetches) |

**THE ARITHMETIC**: 146 ÷ 6 = **24.3**. **24 cache-missing calls of SharpDesk's shape (24 × 6 =
144) — one every ~7.5 minutes for three hours.** The only ungated path that can spend is
**`/api/odds`** (§3).

**🔴 IN-CONTEXT-ONLY-UNVERIFIED: THE CAUSE.** Nothing on disk distinguishes a poll from a session
from a caller outside our routes. **RESOLVED BY: the Vercel function log** (dashboard-only), and
partially by **reading 15(c)** — a client *generate* writes `src:"client"` rows to `pl:pred`, a
poll does not.

### THE VERCEL LOG READING — VERBATIM, WRITTEN BEFORE THE LOG IS OPENED

**Window 16:10:13Z → 19:11:31Z. Known spend 146. Known cause: none.**

| # | look for | why it discriminates |
|---|---|---|
| 1 | count + timestamps of `/api/odds` invocations | ~24 at **regular ~7.5-min spacing → POLL**; irregular clustering → session. **Fewer than ~24 → the market×region product differed and the arithmetic is redone, not assumed** |
| 2 | user-agent, referer, IP shape | a browser session carries a referer from our origin and a real UA; a poller usually carries neither, or a library UA |
| 3 | **`fresh=1` on the query string** | bypasses the 240 s cache, so **every** call pays |
| 4 | direct hits vs page renders | a page render shows `/board` alongside; `/api/odds` alone is a direct caller |
| 5 | `/api/generate`, `/api/propsnap`, `/api/clv` in the same window | a `generate` hit explains ~90 at once; a `propsnap` hit explains ≤96 **and** means its entries are not the weekend-only ones `CLAUDE.md` L150 describes |
| 6 | the same cadence **before** 16:10Z | if the pattern predates the window it is not new |

**PRE-COMMITTED BRANCHES:**
- **Regular ~7.5-min, non-browser agent** → **EXTERNAL POLLER on an ungated route. Not ours to
  ration; the response is to GATE THE ROUTE, not cut collection.** Highest-priority ship, and per
  §1's addition **no board fires until the helper lands.**
- **Irregular, browser UA, our referer** → a session had the Board page open. **Operator-side**;
  the lever is device use.
- **`fresh=1` present on any of them** → **that is the mechanism regardless of who called.**
- **The cadence predates 16:10Z** → **the residual has been this all along. Every relay-versus-use
  contrast is CONFOUNDED and the client-side hypothesis is DEAD, not weakened.**
- **Nothing accounts for 146** → **the spend did not come through our routes at all**; next
  candidate is **the Odds API key in use outside this deployment**. **That outranks the freeze**,
  and the follow-on read is the Odds API dashboard's usage-by-key view.
- **IMPOSSIBLE BRANCH: requests present but the arithmetic does not fit** (6 requests for 146, or
  60 for 146) → **print both numbers.** An implied per-call cost outside [1, 6] means the calls
  were not the shape we think, or something else was billed in the same window.

**`fresh=1` DISAMBIGUATION — our own sweep sends it, so the log shows both:**

| signal | OUR sweep | not ours |
|---|---|---|
| **`u`'s shape** | **six markets, `regions=us` ONLY** (`batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs`) | **SharpDesk's is three markets, `regions=us,eu`** (`h2h,totals,spreads`). Unmistakable |
| user-agent | `snapshot_props.py`'s fixed `UA` constant | browser or library UA |
| timestamps | cluster on a props-history run start | **the burst window contains NO props-history run** |
| IP | a GitHub Actions runner range | anything else |

- **All `fresh=1` matches our shape** → **the burst was our own collection and the attribution
  arithmetic is wrong somewhere.** Best outcome available; it takes a **CORRECTION, not a fix**,
  and the first place to look is a run that paid without committing a snapshot.
- **Non-matching `fresh=1`** → external; the passcode is the answer.
- **No `fresh=1` and 146 spent anyway** → the cached path missed repeatedly, which **requires many
  DISTINCT upstream URLs** (one URL cannot miss more than 15×/hour). **That is a scraper walking
  the API surface, not a monitor**, and it makes the varied-`u` ceiling the operative one.

### RUNWAY UNDER EACH HYPOTHESIS (quota 553; props ceiling post-cut 162–185/day)

| hypothesis | residual/day | burn/day | **runway at 553** |
|---|---|---|---|
| **A — one-off artifact** | ~0–100 | 162–285 | **1.9–3.4 d** |
| **B — recurring at 48.3/h** | **1,159** | ~1,330 | **0.41 d — under ten hours** |
| **C — external, unbounded** | — | — | **not computable** |

---


## 3. THE EXPOSURE — `fresh=1` IS UNGATED AND ONLY FULL AUTH CLOSES IT

**`app/api/odds/route.ts` L36–40** gates `fresh=1` **only if `APP_PASSCODE` is set**:
```ts
const fresh = req.nextUrl.searchParams.get("fresh") === "1";
const pass = process.env.APP_PASSCODE;
if (fresh && pass && req.headers.get("x-pl-pass") !== pass) { … 401 }
```
`tools/snapshot_props.py` L22 and `tools/snapshot_odds.py` L21 both request `&fresh=1`, and until
this session neither sent `x-pl-pass` — **yet the sweep landed 58 event-fetches this morning.**

**🔴 IN-CONTEXT-ONLY-UNVERIFIED: `APP_PASSCODE` IS UNSET IN PRODUCTION.** Inferred from the
sweep's own behaviour, **not read**. **RESOLVED BY: Vercel → Settings → Environment Variables.**
If it is unset, **anyone who finds `/api/odds?u=<upstream>&fresh=1` spends on every call with no
4-minute floor at all.**

### THE STAGED SEQUENCE — what is shipped, what is not, and what breaks at each step

| step | what | state | what breaks |
|---|---|---|---|
| **1** | both sweep scripts send `x-pl-pass` **only if `APP_PASSCODE` is in their env** (`os.environ`, never hardcoded) | ✅ **SHIPPED this session.** Live immediately — workflows pull `tools/` from `origin/frontend-rebuild` at run time, so there is **one copy** of each script | nothing; inert while the var is unset |
| **2** | GitHub → Secrets → Actions → `APP_PASSCODE` | not done | nothing; inert alone |
| **3** | `props-history.yml` **on `main`** — `env: APP_PASSCODE: ${{ secrets.APP_PASSCODE }}` on the snapshot step | not done. **The one step that touches the firing branch** | nothing; the route ignores the header while Vercel's var is unset |
| **4** | **LAST** — Vercel env var. The gate activates here | **BLOCKED BY M28** | **`/api/sharp` 401s on every device** — the helper must land first |
| **M28 helper** | one new `src/lib/pass.ts` exporting `passHeader()` + six one-line spreads | **SPEC'D, NOT SHIPPED** | nothing; it only adds a header |

**There is no ordering in which collection is gated but unauthenticated, provided step 4 is last.**

### WHY THE ALLOW-LIST DOES NOT WORK — the event-id ceiling

`/api/odds` validates `u` (L26: `https:` and `hostname === "api.the-odds-api.com"`). **But the
Next data cache keys on the FULL URL, and the caller controls the EVENT ID:**

```
/api/odds?u=https://api.the-odds-api.com/v4/sports/baseball_mlb/events/<any real id>/odds
          ?regions=us&markets=<the props sweep's own six>
```

That is **exactly our own shape** — no allow-list can exclude it. ~15 live event ids per slate →
**~16 distinct cache keys**, each refreshable **every 240 s → 360 spends/day each →
~16 × 360 × 6 ≈ 34,000 credits/day admissible.** **The allow-list bounds the SHAPE and leaves the
ceiling two orders of magnitude above the pool.**

| option | client change | closes |
|---|---|---|
| **A — authenticate `/api/odds` itself** | **M28's helper + 6 one-line edits** | **everything** |
| B — allow-list `u`'s shapes | none | the shape only — **not the exposure** |
| C — per-IP rate limit (Redis wired) | none | the RATE, not the principal; defeated by multiple IPs |

**→ ONLY FULL AUTHENTICATION CLOSES IT.** `/api/board` and `/api/propsnap`'s reads are Redis-only
and cost **zero** — gating them buys nothing and costs `board-archive` its access. They stay open.

---


## 4. RUN SHEET

### 4A. THE FOUR READS — ONE EXECUTABLE BLOCK, NOTHING ELSE TO READ FIRST

**CREDIT CONFIRMATION, EACH ONE TRACED TO WHAT IT CALLS (2026-07-31, not to the label above it).**
Every route file was read this turn. `curl` with no `-X` sends **GET**; every write path below is
`PUT`/`POST` and is unreachable from these commands.

| read | endpoint | Odds API reference in the file? | verdict |
|---|---|---|---|
| 1 | `/api/propsnap?date=…` | **YES — the file has one** (`oddsFetch` L46–58, `/events` L79, per-event L97). **BUT** the `?date=` READ PATH returns at **L71**, before the auth check (L76) and before any fetch. **Reads Redis only** | **0 credits** |
| 2 | `/api/predictions?date=…` | **none** — no `fetch`, no `ODDS_API_KEY`, no upstream host anywhere in the file | **0 credits** |
| 3 | `/api/calibration` | **none** — Redis + `effectiveCalibration()` on stored objects | **0 credits** |
| 4 | `/api/ledger` | **none** — Redis only (`readStore`/`readBank`/`readNoPlay`) | **0 credits** |

**THE ONE SHARP EDGE, stated because it is the same URL:** `/api/propsnap` is **two paths in one
GET handler**. Drop the `?date=` and it becomes the **capture** path — `/events` plus up to
`MAX_EVENTS = 16` per-event fetches, **~6 credits each, ≈96 worst case**. It is *safe by
construction anyway*: `cronHeaderAuthed` at **L76 precedes the first `oddsFetch` at L79**, so a
date-less call without the cron key **401s at zero cost**. A malformed date is a **400** at L69.
**There is no way to spend from this block.**

**TWO CORRECTIONS TO THE LABELS THIS BLOCK REPLACES:**
1. **Read 3 needs NO phrase.** `/api/calibration`'s **GET is open** (route L18 — no `syncAuthed`;
   its own header says so: *"GET is open: it serves only aggregate statistics"*). Only **POST**
   (the auto-toggle) is gated. Sending the header anyway is harmless and the block keeps it.
2. **`burn-report.mjs --pred` WAS BROKEN and is fixed in this working tree.** `DayBlob.records` is
   a **keyed map**, not an array (`pred-serialize` L135; route L39 serves the blob unwrapped), and
   `predCensus` iterated it as an array — **`TypeError: recs is not iterable` on every real
   export**, while its test passed on a hand-built array production never produces. Instrument
   defect #6's shape, in a tool, one command before it ran. Fixed, plus an error-body STOP, plus
   the `gens` witness; regression case pinned on the **map** shape (`tests/chain-tools.test.ts`,
   20 tests green).

```
# ── 1 ── propsnap store. UNGATED read, NO phrase. Precondition 2: are there WEEKDAY rows?
for d in 2026-07-28 2026-07-29 2026-07-30 2026-07-31; do
  echo -n "$d "; curl -sS "https://parlay-lab-six.vercel.app/api/propsnap?date=$d"; echo; done

# ── 2 ── reading 15(c). PHRASE HERE ────────────────────────────────── <PHRASE>
curl -sS -H "x-pl-sync: <PHRASE>" \
  "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-30" > ~/pl-pred-0730.json
node tools/burn-report.mjs --pred ~/pl-pred-0730.json

# ── 3 ── calibration. GET is OPEN — the header is optional, kept for uniformity.
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/calibration

# ── 4 ── the ledger export. PHRASE HERE ─────────────────────────────── <PHRASE>
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/ledger > ~/pl-ledger.json
node tools/ledger-report.mjs ~/pl-ledger.json
```

**WHAT EACH ONE SETTLES — condensed to what CHANGES on the output, and what STOPS the run.**

| # | output | what it changes |
|---|---|---|
| **1** | `snapshots` **non-empty on any of 07-28…07-31** | **Precondition 2 HOLDS.** Weekday capture is real; the weekend-only reading of `CLAUDE.md` L150 is wrong and the props ceiling restates on measured weekday volume |
| | `{"date":…,"snapshots":[]}` **on all four** | capture is weekend-only as documented; the four morning GitHub snapshots are the entire weekday record and the 162–185/day ceiling stands |
| | **mixed** | print which dates carried rows — the cadence is the finding, not the count |
| | **STOP** | any body that is **not** `{date, snapshots}` — a `503 sync-not-configured` means the store env is missing and reads 2–4 will also fail. **Fix that before running anything else** |
| **2** | **`clientRows > 0`** | **the `bestBoard` fallthrough FIRED.** That date was not dark for the store, and the credits it spent are part of the 146. The cheapest discriminator resolves toward operator-side |
| | **`clientRows == 0`** | the fallthrough is **CLEARED for that date**; the residual needs another candidate and the Vercel log becomes the only instrument |
| | **`GENERATIONS` list** | server passes only (the client path stamps none). A `trigger` of `header`/`cron-ua` vs `manual` dates each server board; **zero gens + non-zero rows = client-only, positively** |
| | **STOP** | `{"error":"bad-sync-key"}` → the phrase did not match; **do not retry read 4 with the same phrase.** `{"error":"sync-not-configured"}` → env, not phrase. The tool now exits **65** on either rather than censusing an error body as zero rows |
| **3** | **`mults` empty `{}` / `global: null` / `log: []`** | the fit **never moved**. The pause froze nothing that was moving — **EXPOSURE WITHOUT EFFECT**, third freeze point is PRECAUTIONARY not corrective |
| | **`mults` populated** | a **live fit**: every board before today read a different calibration than tomorrow's would, and **the homogeneous window starts 07-31, not 07-29** |
| | `summary.n` per market vs `SLOPE_MIN_N = 100` / `GLOBAL_MIN_N = 150`; `lastRun` | **dates the vintage** — and `lastRun` is also the direct read of whether the paused nightly job has run since |
| | `auto: "off"` | mults are empty **by the switch**, not by absence of data — a different fact from the first row and must not be read as it |
| | **STOP** | a `502` — the store is unreachable; reads 2 and 4 are then also unreliable |
| **4** | **`ledger.length`** | **the 38 settles first — it is the GATE, not a sibling** (§5 reading 15). Every sub-reading below is denominated in this number |
| | `(1) OVERSTAKE … above their own ceiling: N` | M24 realized-vs-prospective on the real population |
| | `(3) HRR 07-17..07-22 … expect 46.3 / 59.2` | reproduces or fails to reproduce the pair the HRR suspension rests on |
| | `(4) FIELD CENSUS BY DATE` | the mode split, and which dates predate `selMode` (07-24) / `overrode` (07-19) |
| | **STOP — hard** | `>>> AND N carry selMode "ev_gated"` — **the ceiling failed inside the disciplined branch.** Stop the run and report it; that outranks the board |
| | **STOP** | `{"ledger":[]}` with a **200** → the store is EMPTY, which is not the same as the export failing. Print it and stop: an empty ledger makes every sub-reading vacuous and **the bankroll exit has no population at all** |

**Then the Vercel function log and the `APP_PASSCODE` env check.**

**ORDER IS NOT ARBITRARY:** read 1 is ungated and proves the deployment answers at all; read 2
proves the phrase before read 4 spends a round trip on the only copy of the bankroll population;
read 3 is free and dates the vintage; read 4 is the one whose output gates two sub-readings.

### 4B. THE REST OF THE SHEET

**Variant B is SUSPENDED** (its 12 credits measure a billing constant while 146 are unaccounted
for).

**THE TOOLS, by path:**
| tool | replaces |
|---|---|
| `tools/quota.mjs` | the hand-run quota curl; free read + APPEND-ONLY `data/quota-log.jsonl`; `--series` prints the burn series |
| `tools/ledger-report.mjs <export.json>` | reading 15 whole — overstake vs each ticket's own `shKellyFrac` ceiling (zero floor included), the $0-ceiling census, the HRR 46.3/59.2 join, the per-field census. **Prints a STOP if any overstaked row carries `selMode: "ev_gated"`** |
| `tools/board-report.mjs <board.json>` | chain steps 6–8 and readings 24/25/26/29. **Outs VACUITY branch FIRST** |
| `tools/burn-report.mjs --props <dir> \| --pred <file>` | burn attribution (props cost from the ARCHIVE, residual as a NAMED UNKNOWN) and reading 15(c) |
| `tools/verify-served-engine.mjs --chunk <chunk.js>` | the STEP-0 re-grep; double anchor; reports a proper substring as an EXTRACTION DEFECT, never a divergence |
| `tools/guard-diff-audit.mjs` | the test-deletion sweep — 87 commits touch `tests/`, 31 delete lines, 17 remove assertion lines, **1 net-negative** |
| `tools/m25-archive.test.ts` (PL_BOARD) | M25's dollar ratio on an ARCHIVED board rather than the fixture |

**THE FIFTEEN CHAIN STEPS, in order**: slate count printed → the owner's go/no-go → quota READ →
board (curl; the cron cannot reach Saturday) → quota READ → `gen=list` → **echo present in the
response body** (absent → the push did not land) → **cfSel stamp on every suspended row** (absent
→ did not land) → `python3 tools/self_consistency.py` (zero TB≥1==H≥1 violations, zero HRR legs in
built tickets, **BOTH population sizes printed — zero-over-empty is not a pass**) → app-switcher
double reopen → HRR rows present AND greyed → replay dump + ParlayPred membership diff → Control
C's production predictions vs the pre-commitments → ticket count vs both pre-commits → **step 15:
the legacy-mode diagnostic read, ONCE, gated on the board being confirmed present, with the mode
returned to `ev_gated` as the immediately following action.**

**READINGS 24–29 + 15 and 15(c)** are in §5 verbatim; `board-report.mjs` executes 24/25/26/29,
`burn-report.mjs --pred` executes 15(c), `ledger-report.mjs` executes 15.

**T = 0.80 AND ITS BRANCHES**: achievable ≥ 0.80 at the fire → composition readings VALID, full
fifteen steps; below → **engine-half only** (echo, cfSel, self_consistency, greyed rows,
replay+join — no composition or cap-binding reading). T is the 42nd parameter, owner-chosen before
any board's number was known.

**THE PLACEMENT CHECKLIST** — in order; any single failure is a STOP for that ticket, items 1 and
5 stop the whole card:
1. **`pl_selmode` reads `ev_gated`**, verified as the LAST action before placing.
2. **No single slip above 2% of bankroll = $50 at $2,500.**
3. **Stake vs its own displayed Kelly — stake > kelly ⇒ NOT placed**, regardless of the card.
4. **A missing Kelly badge + a stake at the structural cap** → back to item 1.
5. **The card's mode provenance** — the board is built server-side in `ev_gated`; the card is
   computed on the device in the DEVICE's mode.

**CRON STATE.** Four cron-job.org entries call `GET /api/generate`. Header `x-cron-key` on
**ENTRY 1 ONLY**; entries 2–4 stay UNHEADERED and 401 at zero cost (Sat `0 18 * * 6`, Sun
`0 17 * * 0`, Sun `30 22 * * 0`). Entry 1 → `45 22 * * 1-5`. **NEITHER EDIT IS CONFIRMED LANDED,
and tomorrow's board CANNOT confirm them** — it fires on the owner's curl and entry 1 is
weekday-only. **MONDAY 2026-08-03 at 22:45Z IS THE FIRST REAL TEST**, confirmed by the
cron-job.org execution log plus `gen.trigger === "header"` on a fire nobody curled.
Saturday's `0 18 * * 6` **is due, is unheadered, and 401s at zero credits and zero run-slot cost**
— and if it ever authenticated it would build at achievable 0.267 (`MIN_ACHIEVABLE = 0.15`, so
`low-ceiling` does NOT protect), but the 22:38Z curl would still **REBUILD**, because
`liveCoverageOf` counts `lu` over UNSTARTED games and every game that board confirmed has started
by then (pct 0.000 < `SKIP_COVERAGE` 0.7 → `thin`). Cost of that scenario: **~80 credits of
nothing and 1 of `MAX_RUNS_PER_DATE` = 3.**

---


### 4C. CRON STATE — UPDATED 2026-08-01
*(Relabelled 2026-08-01 from a SECOND `4A.` — the file shipped with two sections at that
address and every doc guard passed on it. `4A` keeps its original meaning, THE FOUR READS;
`4B` is unchanged. Guarded from here by `tests/doc-structure.test.ts` rule G.)*

**`main` now declares SIX props crons** (read back from `origin/main` = `b1f17d2`):

```
0 17 * * *    -> 20:0x-20:5x   (unchanged)
10 18 * * *   -> ~21:1x        [--window 120]   NEW 2026-08-01
55 18 * * *   -> ~21:5x        [--window 120]   NEW 2026-08-01
0 20 * * *    -> ~23:3x        (unchanged — 4 of 8 archived closes)
0 21 * * *    -> ~00:1x        (unchanged — the other 3)
30 22 * * *   -> next morning  (unchanged)
```

**The `--window` flag reaches ONLY the two new entries**, via a schedule-conditional on
`github.event.schedule`. **`WINDOW_DEFAULT_S = 20*3600` on `frontend-rebuild` — default OFF, so the
four pre-existing crons are byte-identical in behaviour.** Divergence recorded on
`tests/workflow-branch-sync.test.ts`'s **expiring allow-list as item (3)**, with `since` left at
**2026-07-31** so the two older open divergences keep their 14-day countdown.

**🔴 NOT YET LANDED AT THE TIME OF WRITING.** They declare 18:10Z / 18:55Z; expected delivery
**~21:1xZ ≈ 14:1x PT** and **~21:5xZ ≈ 14:5x PT**, i.e. **40–85 minutes before the 15:38 PT fire.**
**The whole placement rests on GitHub's measured ~3-hour queue delay holding** — if Actions
delivered promptly they would land at 11:1x / 11:5x PT, outside the window, paying for nothing.

**LANDING TEST, PRE-COMMITTED:** `node tools/price-path.mjs <props-dir>` must print **n > 0 in the
60–120 bucket**. **Zero means the SPACING is wrong, not that prices do not move. ONE cron
delivering is a PARTIAL LANDING that produces no pair and therefore no observation — it looks like
a landing and is not.** If `--window` is absent from the run log, each capture took the full slate
at 13–15 events ≈ 78–90 credits (**~156–180/day instead of ~36–96**); the flag prints
`window: 120 min -> N of M events`, so **its absence from the log is the symptom.**

**cron-job.org, UNCHANGED:** header `x-cron-key` on **ENTRY 1 ONLY**; entries 2–4 unheadered and
401 at zero cost. Entry 1 → `45 22 * * 1-5`. **NEITHER EDIT IS CONFIRMED LANDED, and tomorrow's
board CANNOT confirm them** — it fires on the owner's curl and entry 1 is weekday-only.
**MONDAY 2026-08-03 AT 22:45Z IS THE FIRST REAL TEST**, confirmed by the execution log plus
`gen.trigger === "header"` on a fire nobody curled.

---

## 5. OPEN PRE-COMMITTED READINGS (verbatim; COUNT: 29)

1. Concurrency-fix landing, three outcomes incl. starved window (§2; collection-period).
2. `props-concurrency.test.ts` main-half warn → ENFORCING flip in the landing commit
   (test header).
3. Echo landing: present in the response body or the push did not land (CLAUDE.md
   ITEM-1 block).
4. cfSel: stamp on EVERY susp record or DID NOT LAND (collection-period, cfSel
   SHIPPED block).
5. Trigger mark: `gen.trigger === "header"` or did not land (collection-period).
6. T = 0.80 branches: ≥0.80 at 22:45Z → composition valid; below → engine-half only;
   impossible: 22:00Z ≥ 0.80 (projected 0.50) → re-derive (collection-period).
7. luPct/achievable falsifiable predictions: cron 0.50/0.50, curl-window 0.833/0.833
   — the measured pair CAN untie and prints either way (collection-period).
8. Cron failure branches (a)–(e) incl. the two-boards impossible (§2).
9. self_consistency reading + its four sub-branches (zero-HRR-rows = reopen failure;
   ungreyed = display half; HRR ticket legs = server half M-item; zero-over-empty
   not a pass) (CLAUDE.md chain step 5).
10. Behavioral-vintage ticket counts: zero-clear → coreEvMin binding with counts;
    card-at-6 → cap binding, ranks 7+ recorded (CLAUDE.md step-5 block).
11. Clear-count MIDDLE branch: 1–5 → the histogram is the reading (collection-period).
12. Step-8 M14 production reading with the ≥30 bp / 2–4%-vs-7% numbers (CLAUDE.md
    STEP-8).
13. ParlayPred replay diff, four branches: identical → validated-on-one-day; differ →
    two allocators, stop; empty → hypothesis label; impossible membership-not-stakes
    → allocator not a function of its inputs (carried from the 07-29 handoff §5.7,
    transcribed to disk there).
14. predictions×fp join: the four 07-28 branches + the 07-30 extension (§2;
    multibook-memo).
15. Ledger export reading: reconstructible → "cannot re-examine" withdraws dated;
    not → absent fields NAMED; count vs the owner's "38" → both printed (the "38"
    remains IN-CONTEXT-ONLY-UNVERIFIED — no on-disk record; resolved by the export).
    **▶ GATE (ADDED 2026-07-31, owner's item 3 — ORDERING IS PART OF THE READING).**
    **THE HEADLINE COUNT PRINTS FIRST AND GATES THE TWO SUB-READINGS BELOW IT. It is not
    their sibling.** `ledger-report.mjs` prints `ledger: N entries, M locked` on line 1,
    before anything else, and **N is the denominator of both the MODE SPLIT and the
    REALIZED-OVERSTAKE query**. Those two are written against "the 38 tickets"; the 38 is
    the OWNER'S recollection with no on-disk record (the only 38 on disk is "4 of 38
    core-eligible outs rows", `multibook-memo.md` L430 — a different quantity, and it must
    not be read as corroboration). **So: read N. If N ≠ 38, the sub-readings are computed
    over N and every "38" in their wording is corrected in the same pass — a CORRECTION,
    dated, not a discrepancy to reconcile away.** Neither sub-reading may be interpreted
    before N is on screen. **N is also the first thing that can invalidate the whole read:
    `{"ledger":[]}` at 200 means the population does not exist.**
    **▶ THE EXPORT'S EXPECTED SCHEMA (ADDED 2026-07-31, read from `app/api/ledger/route.ts`
    this turn), so a malformed response is distinguishable from a legitimate one.** GET
    returns **exactly four top-level keys** (L73):
    `{ ledger: SyncEntry[], bank: BankStore|null, noplay: NoPlayLog|null, at: number|null }`.
    `ledger` is **always an array** (`readStore` L62 returns null unless `Array.isArray`),
    **never absent** — `s?.ledger ?? []`. Per entry, the fields the report reads:
    `date`, `locked`, `core[]`, `funT[]` (tickets: `id`, `stake`, `prob`, `czDec`, `czEv`,
    `legs[]` with `lkey`/`label`/`prop`/`cz`), `bankroll`, `grading.legs{}` keyed
    `label|prop` → `{result}`, `grading.v`, plus `selMode` (present only from 07-24) and
    `overrode` (only from 07-19). **ANY OTHER TOP-LEVEL SHAPE IS MALFORMED**, including a
    bare array, and `ledger-report.mjs` accepts `blob.ledger ?? blob` (L103) so a bare array
    would be silently accepted — **check the top-level keys yourself before trusting it.**
    **▶ STOP RULE FOR THE EXPORT (ADDED 2026-07-31).** Do not re-run, do not vary the
    command, report the body:
    · `{"error":"bad-sync-key"}` **401** → the phrase did not match (L51). Nothing was read
      and nothing was written.
    · `{"error":"sync-not-configured","missing":[…]}` **503** → env, not phrase (L49); the
      array names what is missing.
    · `{"error":"store unreachable: …"}` **502** → Upstash is down (L75). **Read 2 and read 3
      are equally unreliable at that moment**; stop the whole block, not just this read.
    · `{"ledger":[],"bank":null,"noplay":null,"at":null}` **200** → **a VALID response over an
      EMPTY store.** This is the dangerous one: it is not an error and every sub-reading
      returns a clean zero. **The bankroll exit would have no population.** Print it verbatim,
      stop, and do not let `0 of 0` be recorded as a pass.
    · anything non-JSON (an HTML error page, an empty body) → the request did not reach the
      route; do not diagnose it as a ledger fact.
    **▶ THE EXPORT CANNOT MUTATE THE LEDGER — cited, because this is the only copy of the
    bankroll exit's population.** `GET` is `app/api/ledger/route.ts` **L68–77**: it calls
    `gate()`, then `readStore()` / `readBank()` / `readNoPlay()`, then returns. **Those three
    helpers issue only `GET` (L58) and `redisGetJson` (L28, L40).** Every write in the file —
    `redisSetJson` at **L113** and **L118**, and `redis(["SET", STORE_KEY, …])` at **L120** —
    is inside **`PUT` (L79–125)**, a different exported handler. `curl` without `-X` sends
    GET, so **the read 4 command cannot reach any of them.** The merge that could rewrite
    history (`mergeLedgers`, L105) is likewise PUT-only, and by design it merges INTO the
    stored copy rather than replacing it (route header L10–11).
    (ADDED 2026-07-30, fields confirmed on disk — LEDGER PER-MARKET RECOVERABILITY
    block: the export additionally prints per-market legs/wins/implied-vs-hit and
    per-entry `selMode` + `overrode`; per-leg results exist in `grading.legs`, so
    the reconstructible branch is the expected one.)
    (ADDED 2026-07-30 late, owner's provenance ruling — "consistent with" is not
    "sourced to": the export MUST REPRODUCE **46.3 and 59.2** from THE
    PRE-REGISTERED JOIN, or the pair's provenance stands unestablished and the
    HRR suspension rests on a number we cannot re-derive
    (`docs/hrr-recalibration.md`, PROVENANCE-UNVERIFIED-PENDING-EXPORT). The
    join: entries `e` with 2026-07-17 ≤ e.date ≤ 2026-07-22 AND e.locked; legs
    `l` of every ticket in `e.core ∪ e.funT` with
    `(l.lkey||"").split("|")[1] === "batter_hits_runs_rbis"`; grade
    `r = e.grading.legs[l.label+"|"+l.prop]`, keep r.result ∈ {won, lost};
    hit = won/(won+lost) → 46.3 ±0.05 pp; implied = mean of am→prob(`l.cz`) over
    the same legs → 59.2 ±0.05 pp; subsets printed: rung 0.5 (12/19 = 63%
    expected), rung ≥1.5 (32% expected). If the headline pair misses, try the
    two written variants IN ORDER — core-only tickets; then won/lost/push
    denominators — and print WHICH variant matched (a provenance RECOVERY,
    labeled); no variant → provenance UNESTABLISHED, printed.)
    (ADDED 2026-07-30, owner's item 2 — THE MODE SPLIT: print `selMode` and
    `overrode` PER ENTRY, count entries where the field is ABSENT, and split the
    38 tickets by mode {ev_gated, dk_fd, probability, caesars_ev, ABSENT}. Any
    legacy-mode entry → HRR/outs legs may already be in the ledger from a mode
    with no bar and the bankroll exit's population is not what it appears — that
    outranks the board. KNOWN IN ADVANCE: `selMode` was added to the ledger entry
    2026-07-24 (`70dfa8e`) and `overrode` 2026-07-19 (`2aedbd7`), so every entry
    before 07-24 carries NO mode — the 46.3/59.2 window (07-17→07-22) sits
    entirely in that blind span, and for those days the question is
    UNANSWERABLE RETROACTIVELY. Recorded before the export runs.)
    (ADDED 2026-07-30 late, owner's items 1 and 4 — TWO MORE REQUIREMENTS:
    (a) THE 08-15 REVIEW'S QUERY EXCLUDES non-`ev_gated` rows by the `selMode`
    field on prediction records, and PRINTS the count it drops — client generates
    stamp the device's mode, so a legacy-mode row is separable but must be
    excluded, not silently pooled; (b) PER-FIELD PRESENCE COUNTS BY DATE, not
    just the mode split: for every ledger field, how many rows carry it, bucketed
    by lock date — the schema changed during the store's own life (`overrode`
    2026-07-19, `selMode` 2026-07-24, the basis fields `bs`/`bsBook`/`bsOdds`/
    `bsDec`/`bsEv` 2026-07-19), so append-only holds for ROWS and not for COLUMNS.
    Expect `grading.v: 2` to appear on rows predating it — that is
    `shGradeOrientFix` rewriting old grading blocks in place, the one legitimate
    backfill, not a mystery.)
    (ADDED 2026-07-30 evening, owner's items 2–3: (c) COUNT CLIENT-GENERATED ROWS
    — `src: "client"` records in `pl:pred`, by date and by `selMode`. Any such row
    is a `bestBoard` FALLTHROUGH firing — an UNBUDGETED spender that hits the same
    odds proxy and key, so it is INSIDE the quota accounting and leaves NO git
    trail: a live candidate for the ~97-credit residual alongside the CLV path.
    Zero client rows → the sequencing rule covers it prospectively and that is the
    whole finding; any client row with a non-`ev_gated` mode → reading 15's
    exclusion is a REPAIR, not a precaution, and the 08-15 population restates
    after the filter; client rows with no matching credit spend → print both.
    (d) the `v`-FIELD CENSUS: how many entries carry `grading.v: 2`, and whether
    any sits in 07-17→07-22 — expected NONE by market (M22 touches only
    `ml_home`/`rl_home` legs), so a hit there contradicts the scoping.)
    (ADDED 2026-07-30 late, owner's item 1 — THE REALIZED-OVERSTAKE QUERY, which
    needs NO `selMode` and so is NOT blocked by the pre-07-24 blind span: for each of
    the 38 placed tickets recompute its own ceiling as `round(kellyStakeMult ×
    entry.bankroll × max(0, min(0.25 × kelly(prob/100, czDec), 0.02)))` — `prob` and
    `czDec` present since 2026-07-11, `kellyStakeMult` = 4 frozen — and print: how
    many tickets exceeded their ceiling, the ratio distribution and max, and how many
    carried a $0 ceiling yet were staked. **A ratio > 1 is only reachable in a legacy
    mode or under `force`, so a realized overstake DATES the discipline of the row
    that carries it** — the indirect answer to the mode question. Any realized
    overstake → a realized defect inside the bankroll exit's own population, and it
    outranks the board.)
    (RESTATED 2026-07-30 evening as ONE QUERY — collection-period, THE EXPORT CURL
    AND READING 15 block: (1) overstake ratio per ticket + count above 1 + max +
    total dollars staked above ceiling + per-market split; (2) count of $0-ceiling
    tickets and what was staked on them; (3) count with negative `czEv` at
    placement; (4) alongside, the 46.3/59.2 reproduction and the per-field presence
    census by date. The curl is written out there; **Josh types the phrase**.
    Impossible branch: a ratio > 1 on a row whose `selMode` reads `ev_gated` → the
    ceiling failed INSIDE the disciplined branch — STOP.)
16. Triplicate-membership check inside the export read: leg-set match → M19 reached
    the ledger by hand (collection-period, export block).
17. HRR suspension review: at the READ quota (1,461) board-only = 9.74 board-days —
    **UNREACHABLE without a reset, written in advance**; retirement half restates to
    repair+10 (collection-period, reachability + supersession).
18. Reset branches: reset → restate runway, reprice calendar; no reset → ordered
    shutdown executes and the parameter exit does not fit this cycle
    (collection-period).
19. Outs flag ship Thursday evening; `outs-suspension-coupling.test.ts` `it.fails`
    flips → `it` in THAT commit (guard header; pitcher-outs-audit DECIDED).
    (ADDED 2026-07-30 late, owner's item 1 — SCOPE BY DIFF encoded in the same
    guard: BOTH `it.fails` halves (pool-zero + tag-every-outs-row) flip in the
    ship commit; the byte-identity invariant (on/off identical outside
    {susp, watch, bsBadge, czBadge, edgeBadge} on pitcher_outs rows, non-empty
    population required) must stay green THROUGH the ship — red there = the
    boundary is wider than the flag's doc claims → the flag resets the row-level
    window too and the vintage consequence restates; a do-nothing flag cannot
    flip the it.fails halves → does not deploy. Tonight's baseline printed:
    on/off byte-identical everywhere, 5/5, flag not yet in the engine.)
20. `sweep-covers-engine.test.ts` (M13) flips only in the alt-keys fix commit (guard
    header; alt keys spec-only behind the burn plan).
21. Fixture-representativeness reading at 08-17: ≤2/≥5-of-25 branches, the five cold
    sites, the range-detector thresholds (harness-substitutions, PRE-COMMITTED
    section).
    (SUPERSEDED IN DATE, 2026-07-30 — the owner's decision, neither priced
    option: the 20-board check is STRUCK AS UNREACHABLE this cycle (quota binds
    before shipping; dated before any fixture output), NOT weakened — criteria
    and branches above intact. RE-SCOPED to HOT-SITE FIDELITY: same criteria,
    same instrument (`clamp-activity`, now armed on production boards — route
    L244), over the sites whose pooled archive calls reach ≥30 (the spec's own
    L994 floor), cold sites print counts; per-site MDE computed from accrued
    K_s, never assumed; runs opportunistically, no calendar date. THE
    FIXTURE-REPRESENTATIVENESS CHECK — STRUCK block, collection-period.)
22. Second-board-after-T-fail: requires force, OFF absent explicit in-the-moment
    authorization with the disabled protections stated (collection-period).
23. The 22:00Z board's own coverage impossible branch: luPct > 50 → the projection
    was wrong, the window wider — print both (collection-period, item-1 resolution).
24. **Board-1 clampActivity (added 07-30; CALLS A TOOL as of 07-31 —
    `node tools/board-report.mjs <board.json>` prints presence and per-site counts, and
    `tests/clamp-activity.test.ts` implements the same computation on the fixture)**: today's board data carries
    `clampActivity` (per-site {bounds,n,lo,hi,mid}; the route arms `clampLog`
    L244) → the clamp census and hot-site fidelity START — 13 sites projected to
    clear ≥30 calls at board 1 on a 6-game slate (probe table,
    collection-period), real rates checked against the projection. ABSENT → the
    arming is not reaching production analyze (SH_V2/clampLog wiring, route
    L244) — a NAMED defect, the census count stays ZERO, never silent.
25. **Board-1 echo field check (added 07-30)**: `outsSusp === null` (pre-ship
    TODAY; === true on Friday's post-flag board — both states pre-committed);
    `selMode === "ev_gated"`; priors/ctx hash pair === the pause pair (§4
    carries both full hashes; the straggler did not commit, verified 16:4xZ).
    Any other value → print expected-vs-observed and STOP that half: a non-null
    outsSusp today means something shipped early; a foreign hash pair means the
    deploy's statics are not the pause vintage — trace before composition
    readings.
26. **Board cost bracket (added 07-30)**: quota READ immediately before and
    after the board → delta; model: ~6 credits × unstarted events fetched
    (events printed from the slate count). PASS: delta/events ∈ [5, 8].
    Outside → per-spender attribution printed BEFORE the chain's composition
    steps proceed (the concurrent CLV capture path can contaminate the bracket
    — the ~97-credit ambiguous residual this morning is the precedent; tight
    reads around the fire minimize it).
27. **CLV fold reconciliation (added 07-30, owner's item 4)**: after tonight's
    fold (~20:20Z props sweep), re-run the reconciliation against the
    PRE-COMMITTED CLV figure — **~10 captures × ~6 = ~60 credits today** (one
    capture per game, 10-game slate). Fold closes the ~97 → mechanism CONFIRMED,
    the projection formula restates to include CLV capture and the band rebuilds
    on it; residual SURVIVES → an unattributed spender exists and **that outranks
    the board**; capture spend turns out unbounded in advance → every band in the
    docs restates as LOWER-BOUND-ONLY (collection-period, UNTRACEABLE SPENDER).
28. **M20 live check (added 07-30, owner's item 1)**: chain step 15 — the
    probability-mode device read; HRR legs present → M20 confirmed in production;
    zero → print the row population beside it (absence of a qualifying ticket is
    not evidence the bar applies).
29. **Consensus-gate crossing, observed not projected (added 2026-07-30, owner's
    item 5)**: the blocked-reason histogram is the proxy — ANY ticket blocked with
    reason `consensus` proves that market is still under `consMinN = 100`, i.e. the
    "expiry" has NOT happened for it. Zero `consensus` blocks → consistent with the
    batter crossing having occurred but NOT proof (a market with no eligible tickets
    produces no blocks either) — print the per-market pool counts beside it. **The
    07-29 batter crossing is RECORDED-BY-PROJECTION, NOT BY READING** (`mktN` has not
    been read since; it is off-disk and NOT in the echo), so only the authed
    calibration read settles it. **Friday's K's/outs "reopen" IS this same crossing**
    — if the gate still blocks K's/outs tickets Friday, the reopen is PARTIAL, the
    engine is running the stricter regime, and every Friday reading says so.
    (EXTENDED 2026-07-30: print **per-market blocked-reason counts** so the
    `consensus` count is visible whether or not it is zero — a zero beside a non-zero
    pool count is evidence, a zero alone is not. **AND `mktN` NOW RIDES THE ECHO**
    (shipped this afternoon: additive, echo-only, zero credits, no engine-string
    change), so tonight's board reports the reopen clock DIRECTLY — read `echo.mktN`
    per market against `consMinN = 100`. Absent → the mktN echo did not land and the
    blocked-reason proxy is the only reading.)

---


## 6. GIT AND ARTIFACT STATE

- **`frontend-rebuild`: origin head `0b65964`** (`0b659648691bd9ba2c934de1e466efb7c8f4f8e4`,
  verified by `git ls-remote` this turn). Working tree **clean, nothing held**.
- **`main`: `7bfb6b3`** (`7bfb6b394117276c13cd8eafc0e1a5a3310acd3a`) — the props-history cron cut.
  **main deploys nowhere on Vercel** (`vercel.json` `main: false`) **but it is the branch every
  scheduled workflow fires from** (`origin/HEAD → main`). 326+ commits behind; hand-updated only;
  guarded by `tests/workflow-branch-sync.test.ts` with an **expiring** allow-list (7 waivers,
  `MAX_AGE_DAYS = 14`).
- **Served artifact: chunk `256-7cc559a830020345.js`** (renamed from `256-171aff5d10da160d.js`,
  itself evidence the deploy landed). Engine string **281,096 chars**, sha256
  **`b862b2b2c59532a4df598f93959512c073bc04d93cb76a8c436f38b582ea3867`** — **byte-identical to the
  repo, verified 2026-07-31 ~04:5xZ** (`tests/served-verification.json`: `pending: false`,
  `since: 2026-07-31T04:55:00Z`).
- **THE OUTS FLAG IS LIVE IN PRODUCTION** (four functional edits verified in the served bytes)
  **AND UNEXERCISED ON A REAL BOARD** — no board has fired since it deployed at ~02:50Z.

**THE THREE FREEZE POINTS, and what each froze:**

| input | writer | frozen | when |
|---|---|---|---|
| `public/model/priors.json` | `model.yml` (GitHub, `30 9`) | **YES** — last write `671aed9`, 2026-07-29T15:58:41Z | 07-29 `a46c1f8` |
| `public/model/context.json` | `context.yml` | **YES** — last write `64c42ad`, 2026-07-29T20:32:00Z | 07-29 `a46c1f8` |
| **`pl:cal:summary` / `pl:cal:weights`** | **`/api/calibrate`, VERCEL cron `30 9`** | **YES, 2026-07-31** — `vercel.json`'s `crons` array removed; route + on-demand auth kept | **this session** |

**The M18 pause froze two of three.** The third ran two extra days because its scheduler was in no
inventory. It is a freeze, not a change: `effectiveCalibration` (`calibration.ts` L592–599) has
**no staleness check**, and `pl:cal:lastRun` is written at calibrate L47 and **read by nothing**.

**⚠️ THE PER-GAME CONTEXT HAS RESOLVED NOTHING SINCE 07-29.** `SH_CTX.games` is read by **exactly
one function** — `shUmpCtx` (`legacy/index.html` L1600–01), which matches by team pairing. The
frozen context holds **07-29's fifteen pairings**; 08-01's fifteen share **ZERO** with them. So
`shUmpCtx` → `null` (L1603), `shUmpKf` → **1** (L1605, pinned or not), `shUmpKfShadow` → **null**
(L1608, never multiplied). **A NEUTRAL DEFAULT — a stated engine configuration, not a defect.**
**Weather is UNAFFECTED**: it is hydrated live from statsapi (L1218 `hydrate=…weather…`, stored
L1244). Team-keyed blocks (`pen_quality` L1611, `bullpen_last3` L1663) still resolve.
**PROSPECTIVE ONLY** — no board has been generated since 2026-07-26, so no board on disk has ever
run with an unresolved block. **`data/ump_k.json`**: 2 armed at g ≥ 5 (Lance Barrett 07-30, Willie
Traynor 07-31), 11 at g = 4; simulation projects **83 of 85 [80, 85] armed by freeze exit**.

---


### 6A. UPDATED 2026-08-01 — what this session changed in git and artifact state

- **`origin/frontend-rebuild` = `50d0f7a`** · **`origin/main` = `b1f17d2`** (main moved for the
  first time since the cron cut, to carry the targeted pair — §4 CRON STATE).
- **The bot pushed `b68b1e3`** (2026-08-01T07:37:59Z, `context: refresh`, `data/ump_k.json` only),
  which **rejected a push mid-turn** and, on rebase, **turned `self-arm-stamp` red as designed** —
  two more crossings (§7.8). `ARMED.umpKf` updated **2 → 4** in the same commit as the dated record.
- **Served chunk `256-7cc559a830020345.js`, engine 281,096 chars, sha256
  `b862b2b2c59532a4df598f93959512c073bc04d93cb76a8c436f38b582ea3867`**, byte-identical to the repo.
  `tests/served-verification.json`: **`pending: false`, `since: 2026-07-31T04:55:00Z`.**
  **UNCHANGED THIS SESSION — no engine-string ship occurred.**
- **The outs flag is LIVE but still UNEXERCISED** — no board has generated since it shipped.
- **THE THREE FREEZE POINTS, unchanged:** priors `671aed9` (07-29T15:58:41Z) · context `64c42ad`
  (07-29T20:32:00Z) · calibration (paused this session — `vercel.json` carries **no `crons` array
  at all**).
- **The per-game context still resolves NOTHING since 07-29** — `context.json` is 07-29's slate and
  shares zero team pairings with 08-01, so `shUmpCtx` returns null for every game and `shUmpKf`
  returns 1 either way. **Weather is UNAFFECTED** — it is hydrated live from statsapi (L1218 slate,
  L1244 store); only the umpire block is game-keyed off the frozen `SH_CTX.games`.
- **New tools on disk this session:** `tools/price-path.mjs` · `tools/hr-pair-dependence.mjs` ·
  `tools/strict.mjs`. **New guards:** `tests/strict-coercion.test.ts` · `tests/retracted-claims.test.ts`.
  **New docs:** `docs/auto-lock-memo.md` (1,557 lines, 42 sections) ·
  `docs/props-window-cron.diff` (the applied diff, kept as the record).

### 6B. POST-COMPACTION TURN — 2026-08-01, `614ad4e` → `4a29597`

> **THE DEMOTION IS `4a29597d2adbcd21483495f429b139a9b7d8fa40`** (2026-08-01T10:05:17-07:00),
> followed by one commit recording this sha. **BOTH ARE LOCAL — `origin/frontend-rebuild` IS STILL
> `614ad4e`.** The instruction authorized the commit ("hold from `614ad4e` until the demotion
> commits") and did not mention the push. One command closes it:
> `git push origin frontend-rebuild`.

**COMPACTION HELD.** `614ad4e` resolves; `origin/frontend-rebuild` was equal to it at the start of
this turn; §§1–5 intact; **the fire block re-hashes
`5b86b0e0b5171dc939c541d470170453455294710d5590736727ba13dad867aa`, byte-identical to `03c4ae4`.**
Open readings **29**, contiguous 1–29, **five with impossible branches (6, 8, 13, 15, 23)**.

| shipped this turn | what |
|---|---|
| `tests/self-arm-stamp.test.ts` | **REWRITTEN** — the demotion. 3 tests → **6**. §12F |
| `tests/mirrored-constants.test.ts` | **NEW**, 6 tests — the mirror sweep's encoded invariant. §12G |
| `tests/helpers/source.ts` | **NEW** — one comment-stripper, after the same defect twice |
| `src/lib/engine-echo.ts` | `MODELLED_MARKETS` + `NAMED_CATS`, the `DAMPING` pattern generalized. **Exports only — the echo PAYLOAD is unchanged**, so no board shape moves |
| `tools/board-report.mjs` | the `?? 100` echo fallback → `null` + `>>> UNREADABLE` |
| `tests/doc-structure.test.ts` | **rule G** — unique section addresses. 8 tests → **10** |
| `docs/session-handoff.md` | duplicate `4A` → **`4C`**; new §6B, §8.1, §12F, §12G |
| `docs/branch-firing-audit.md` | duplicate `5` → **`5A`** (found by rule G, not reported) |
| `docs/freeze-exit-bundle.md` | **M29** bundle row + vintage row |

- **SUITE: 85 files / 644 tests → 86 files / 655 tests, all green.** `npx tsc --noEmit` exit **0**.
- **NO ENGINE STRING MOVED.** `legacy/index.html` was flipped and reverted for observed red (b) and
  re-hashes `49734a15c5af9bbd6e3f8bef91d4f40308a691813a6a7abece830ca2ffe58495`, with `git status`
  clean on it. Served chunk, `ENGINE_SHA` and `served-verification.json` all **untouched**.
- **NOTHING WAS MEASURED AND NO BOARD FIRED.** Quota reading unchanged: **19,958 remaining / 42 used
  at 2026-08-01T01:35:56.369Z** — no Odds credit was spent this turn.

## 7. THIS SESSION'S MEASUREMENTS — ALL AT ZERO ODDS CREDITS, EACH WITH ITS POPULATION STAMP

**Every figure below cost nothing.** statsapi is free and keyless; the props archive and the board
archive live on `origin/line-history` and are reachable by `git` alone. **Nothing here consumed a
single Odds credit, and the pool moved only by the reset.**

### 7.1 HR PAIR DEPENDENCE — the owner's proposed rule, refuted
**POPULATION: PRE-FILTER — statsapi box scores. No engine filter exists on this path.**
`tools/hr-pair-dependence.mjs`. 1,605 final games · 120 dates · 610 hitters · 2026-04-01…07-31.
Pooled P(≥1 HR per game with a PA) = **0.1067**. Ratio = observed joints ÷ Σ p_i·p_j; **> 1 is
positive dependence.** 95% CI from a **cluster bootstrap over games** (dates for stratum c).

| stratum | pairs | joints | **rate-matched [95% CI]** | raw |
|---|---|---|---|---|
| **(a) same team, same game** | 151,787 | 1,877 | **1.103 [1.048, 1.168]** | 1.087 |
| **(b) opposing teams, same game** | 166,424 | 2,020 | **1.065 [1.022, 1.140]** | 1.067 |
| **(c) different games, same slate** | 120,640 | 1,346 | **0.982 [0.893, 1.071]** | 0.981 |

**Lineup adjacency is NOT the mechanism** — gaps 1/2/3/4/≥5 give 1.100 / 1.108 / 1.153 / 1.026 /
1.161, flat-to-rising with distance. The dependence is **game-level** (park, weather, starter).

### 7.2 THE SAME MEASUREMENT FOR EVERY MARKET THE SIMS GROUP
**POPULATION: PRE-FILTER — box scores.** One identical sample, 2026-06-01…07-31, 781 games.

| market | (a) same team | (b) opposing | (c) different games |
|---|---|---|---|
| HR | 1.072 [0.987, 1.239] | 1.039 [0.954, 1.151] | 0.999 [0.867, 1.117] |
| **Hits (≥1)** | 1.013 [0.996, 1.035] | 1.000 [0.983, 1.022] | 1.009 [0.974, 1.046] |
| **Total Bases (≥2)** | **1.063 [1.024, 1.130]** | 0.992 [0.939, 1.054] | 0.990 [0.937, 1.047] |

**🔴 DEPENDENCE IS MARKET-SPECIFIC AND THE UNIT REVERSES.** TB same-team is positive with an
interval excluding 1 while TB **opposing-team is flat** — **for TB the right unit IS same-team**,
the opposite of HR. **Hits pairs are effectively independent everywhere.** A single same-game
correction factor is the wrong shape for all three at once — an argument **for** `simJoint`'s
per-group empirical approach. **HR's 2-month interval spans 1 while its 4-month one does not; the
4-month figure is the headline and the 2-month row exists only so the markets share one sample.**

### 7.3 CROSS-GAME INDEPENDENCE — CONFIRMED, and this is the rare one
**POPULATION: PRE-FILTER — box scores.** `simJoint` asserts cross-game independence explicitly
(L2691). **Stratum (c) = 0.982 [0.893, 1.071], n = 120,640 pairs over 118 date-clusters, interval
spanning 1**, corroborated at 0.999 (HR) · 1.009 (hits) · 0.990 (TB) on the two-month window.
**A design assumption verified against real data.**
**WHAT IT DOES NOT COVER:** across-**ticket** dependence is priced **nowhere** (M16). The result
speaks only to legs in **different games** — two legs in different tickets on one card **can share
a game**, and for those, strata (a)/(b) apply. **It licenses the cross-game half and says nothing
about M16.**

### 7.4 THE PRICE PATH — and four buckets that are structurally empty
**POPULATION: PRE-FILTER — props archive, 18 day-files.** `tools/price-path.mjs`. |Δ `fair`| in
percentage points to each event's LAST archived snapshot. **17,546 observations · 7,266 distinct
rows · 149 games · 16 fixture-days.** Reference lead median **155 min**, so **every figure is a
LOWER BOUND.**

| bucket (min to first pitch) | n | mean | sd | p50 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|
| **>180** | 17,000 | 1.20 | 1.24 | 0.86 | 2.78 | 5.59 | **11.42** |
| **120–180** | 477 | 0.45 | 0.66 | 0.27 | 1.14 | 3.32 | 6.35 |
| **90–120** | 69 | 0.46 | 0.46 | 0.38 | 1.04 | 1.97 | 1.97 |
| **60–90 · 30–60 · 10–30 · <10** | **0** | — | — | — | — | — | — |

**NO KNEE, BECAUSE THERE IS NO DATA WHERE THE KNEE WOULD BE.** n is not small in the four tightest
buckets — **it is zero** — and the cause is structural: an observation needs the **same row in two
snapshots**, and of 631 snapshot-events only 55 sit inside 120 min, 27 inside 90, 20 inside 60,
almost all being the event's LAST snapshot, which is the reference and excluded by construction.
**The apparent >180 → 120–180 drop (0.38×) is a HORIZON ARTIFACT** — the >180 bucket runs to 1,180
minutes. **The honest adjacent comparison is 120–180 → 90–120 at 1.01×, flat.** Variance is the
finding the mean hides: median 0.86 against p99 5.59 and max 11.42.

### 7.5 THE CV TABLE — what `coreNoHR` never had
**🔴 POPULATION: POST-FILTER — BOARD ROWS. Survivors of the fourteen-stage chain (§8), including
`ab30 ≥ 25` and HR-0.5-only.** Archived 2026-07-26 board.

| market | median implied | **CV = √((1−p)/p)** |
|---|---|---|
| `batter_hits` | 67.2% | 0.70 |
| `batter_total_bases` | 62.7% | 0.77 |
| `ml`/`rl` · `batter_hits_runs_rbis` | 59.1% · 58.5% | 0.83 · 0.84 |
| `pitcher_outs` · `pitcher_strikeouts` | 49.5% · 48.3% | 1.01 · 1.03 |
| **`batter_home_runs`** | **20.5%** | **1.97** |

**HR carries ~2.8× a hits leg's coefficient of variation.** But at *matched* implied probability a
leg's variance is `p(1−p)`, **identical by construction** — so HR is not more volatile at
comparable probabilities; **HR never trades at comparable probabilities.**

### 7.6 THE 25-AB FLOOR — sized, and price-neutral
**POPULATION: PRE-FILTER — props archive joined to statsapi `playerPool=ALL`.**
**A CORRECTION CAUGHT BEFORE REPORTING:** the same call **without** `playerPool=ALL` returns 157
splits with a **minimum of 65 AB** — a qualified-batters leaderboard, on which the answer would
have been "0% dropped". **That is a population error, caught in flight.** With `ALL`: 483 hitters,
minimum 0 AB.

| market | rows | dropped | share | median implied kept / dropped |
|---|---|---|---|---|
| `batter_hits` | 247 | 12 | 4.9% | — *(no `cz` on hits rows)* |
| `batter_home_runs` | 271 | 12 | 4.4% | **14.8 / 14.8** |
| `batter_hits_runs_rbis` | 135 | 6 | 4.4% | 53.5 / 55.9 |
| `batter_total_bases` | 230 | 10 | 4.3% | 46.5 / 48.8 |
| **TOTAL** | **883** | **40** | **4.5%** | unmatched 1 (0.1%) |

`ab30` of dropped rows: **min 5 · median 16 · max 24.** **The drop is small and PRICE-NEUTRAL**, so
the load-bearing pre-filter results are unaffected; only the four POST entries move, by ≤4.5% of
rows with no price shift.

### 7.7 THE HR BAND — measured on ONE population, which corrects the earlier claim
**POPULATION: PRE-FILTER on BOTH sides — props archive, implied from the Caesars OVER price,
uniform treatment.**

| | n | min | p1 | median | p99 | max |
|---|---|---|---|---|---|---|
| **`HR\|0.5`** | 10,477 | **2.4** | — | 16.7 | **32.8** | **40.2** |
| **all non-HR** | 14,191 | **38.5** | 40.8 | 51.0 | — | — |

**THE BANDS OVERLAP: 82 of 14,191 non-HR rows (0.58%)** sit inside HR's full range — 79 `TB|1.5`,
2 `outs|15.5`, 1 `outs|18.5` — and **4 of 10,477 HR rows sit above the non-HR minimum.**
**The separation is still strong** (HR p99 32.8 vs non-HR p1 40.8; 99.42% of non-HR rows above
HR's entire range) **but it is not zero.** See §10 for the dated correction this replaces.

### 7.8 THE CROSSING RATE — the simulation validated against data for the first time
**POPULATION: `data/ump_k.json`, the full umpire roster. Not board-filtered.**
Simulation (2,000 runs, 90% band, `branch-firing-audit.md` L940–946): **2026-08-01 → median 4,
band [2, 6]. OBSERVED: EXACTLY 4.** On the median. Observed **4 crossings in 3 days = 1.33/day**
against the simulated mean **1.61/day** — inside.

| # | umpire | date | g / k | k/g |
|---|---|---|---|---|
| 1 | Lance Barrett | 2026-07-30 | 5 / 90 | 18.0 |
| 2 | Willie Traynor | 2026-07-31 | 5 / 69 | 13.8 |
| **3** | **Malachi Moore** | **2026-08-01** | **5 / 74** | **14.8** |
| **4** | **Derek Thomas** | **2026-08-01** | **5 / 99** | **19.8** |

League k/g **16.48** — k/g at arming still straddles it, so the armed subpopulation is **not** a
high-K selection at n = 4. **FOURTEEN umpires now sit at g = 4.** **The double brake held on all
four** (`context.json` frozen at
`2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80` + `SH_CFG.umpKFrozen`), both
re-asserted green in the same run that went red on the count. **No board affected, no series
restates.** **83 of 85 [80, 85] armed by freeze exit is the operative figure.**

### 7.9 CLOSE COVERAGE — the cron cut cost nothing
**POPULATION: PRE-FILTER — props archive.** 8 archived closes over 58 snapshots and 18 day-files:
4 at UTC 23 (`0 20`), 3 at UTC 00 (`0 21`), 1 at UTC 20 (`0 17`). **All 8 of 8 land in a band a
retained cron covers.** The six cut crons queued into the morning batch — hours 06–11 hold 33 of
58 snapshots and **zero closes**. **The cut removed duplicates, not closes.**

---

## 8. THE FOURTEEN-STAGE CHAIN AND THE BOARD-ROW POPULATION STAMP

**Between the feed and a board row, in order** (`legacy/index.html`; the first block is quote
ingestion, the second the prop-row builder):

| # | line | drops |
|---|---|---|
| 1 | L2611 | markets this app does not label/model (`SH_MKT_LABEL` membership) |
| 2 | L2614 | rows with no line |
| 3 | L2615 | rows with no over, no under **and** no Caesars price |
| 4 | L2622 · L2624 | malformed keys / non-finite line |
| 5 | L2625 | **duplicate `player\|line`** — first wins |
| 6 | L2626 | rows with neither side quoted |
| 7 | L2239 | markets outside the modelled category set |
| 8 | L2240 | rows with no line (builder side) |
| 9 | **L2241** | **every HR rung except 0.5** — BARE LITERAL |
| 10 | L2244 | players with no stats record |
| 11 | L2252 · L2273 · L2372 | pitchers with no innings / K / λ projection |
| 12 | **L2287** | **hitters with `ab30 < 25`** — BARE LITERAL |
| 13 | L2297 | players scratched from a posted lineup |
| 14 | L2482 | rows whose selected side has no odds |

**THE STANDARD STAMP — use this rather than naming filters individually:**

> **BOARD-ROW POPULATION** = survivors of the fourteen-stage feed→board chain, of which **two are
> bare literals** (`HR 0.5-only`, `ab30 ≥ 25`) and **one is data-dependent** (posted-lineup scratch).

**PRE / POST CLASSIFICATION — PRE 7 · POST 4 · infrastructure 3.**

| population | measurements |
|---|---|
| **PRE — box scores** (2) | HR-pair dependence · hits/TB dependence |
| **PRE — props archive** (5) | price path · close coverage · rung inventory · band overlap · the 25-AB drop |
| **POST — board rows / tickets** (4) | **the CV table and per-market medians · the 07-26 HR-pair exposure census · the simJoint implied-ratio audit · the clamp census** |
| infrastructure (3) | quota series · cron and schedule figures · guard wiring |

**IMPOSSIBLE BRANCH — a board row no filter in the chain admits: NOT FOUND.** All 303 rows on the
archived 07-26 board carry a line, a modelled market, and a priced side.

**PER-STAGE DROP COUNTS ARE NOT MEASURED** — only stage 12's (4.5%) and stage 9's (7,467 rows at
1.5 plus 3,254 at 2.5 in the archive). **The other twelve stages have no count.** Spec'd in §11.

### 8.1 WHY THE COUNTS CANNOT BE ADDED CHEAPLY, AND WHAT A RECONSTRUCTION WOULD MISS (2026-08-01)
*(numbered `8.1` on §7's convention, deliberately NOT `8A` — `8A.1`–`8A.4` are already taken, by
legacy addresses carried inside §13)*

**THE REAL COUNTERS ARE NOT ADDITIVE.** Every one of the fourteen stages is a `continue`/`return`
**inside the engine string**, so incrementing a counter at each one **moves the engine hash** and
costs a served-artifact re-verification and a vintage event. **They ride the next hash-moving ship,
alongside `simJoint`'s j2/pm emission (§11 item 2)** — one verification for both, rather than two.

**THE OUT-OF-ENGINE RECONSTRUCTION — spec-only, and its limit is the point.** A tool differencing
the archived feed against the archived board can re-derive a stage's drop **only if every input that
stage tests is on disk.** Nine of fourteen qualify; **five do not**, because they test state the
engine held at build time and never emitted:

| # | stage | why it is opaque to a reconstruction |
|---|---|---|
| 10 | L2244 no stats record | needs the stats map as of build time |
| 11 | L2252·L2273·L2372 pitcher with no projection | needs the projection map as of build time |
| 12 | **L2287 `ab30 < 25`** | needs `ab30`, which lives in the stats record, not the feed |
| 13 | **L2297 posted-lineup scratch** | needs the lineup snapshot at build time — time-varying within the day |
| 14 | L2482 selected side unpriced | happens **after** model pricing; needs the model's chosen side |

> **THE ARGUMENT AGAINST SHIPPING THE RECONSTRUCTION AS A SUBSTITUTE: the five it cannot see are the
> five worth seeing.** The nine it can are mechanical and structural — unmodelled market, missing
> line, malformed key, duplicate, unquoted side. **The five opaque ones are the data-dependent
> ones**, and they include **both bare literals whose thresholds nothing justifies** (`ab30 ≥ 25`,
> and the HR-rung literal's sibling) and **the only stage that varies with when the board was
> built** (lineup scratch). A reconstruction would report the boring nine precisely and stay silent
> on the interesting five, **which reads as coverage.** It stays spec-only for that reason, and if
> it is ever built the limit ships printed, per stage, in its own output.

---

## 9. THE BARE-LITERAL CLASS — AND WHAT THE CENSUS ACTUALLY COVERS

> **THE CENSUS COUNTS CONFIG LITERALS. A CONSTRAINT THAT NEVER BECAME A CONFIG KEY IS INVISIBLE TO
> IT BY CONSTRUCTION.** Coverage therefore restates as **CONFIG-KEYS-ONLY, with the bare-literal
> count printed beside it. The freeze has been holding the parameters it can see.**

**CENSUS: 44 config-keyed parameters (v2.5, 2026-08-01).** **BARE-LITERAL CONSTRAINTS FOUND: 5.**

| line | the literal | what it drops | in any doc before today? |
|---|---|---|---|
| **L2241** | `row.ln!==0.5` on HR | every HR rung but anytime — **7,467 archive rows at 1.5, 3,254 at 2.5** | now, registered in the census |
| **L2287** | **`ab30 < 25`** | hitters under 25 at-bats in 30 days. Comment: *"sample-size discipline"*. **Measured this session at 4.5% of quoted rows, price-neutral** | **NO** |
| **L2785** | `if(k==="batter_home_runs")return` in `mixPool` | **HR from the MIXED pool entirely** — verified: **49 HR legs in `parlays`, 0 in `parlaysMixed`** | **NO** |
| **L2787** | `[[2,8],[3,10],[4,8],[5,6],[6,4],[7,3],[8,2],[9,1],[10,1]]` | the mixed-ticket count plan | **NO** |
| **L2777** | `plan[k]\|\|[3,4,5]` | default leg-counts per category | **NO** |

**FIVE IN ONE 1,000-LINE SPAN, AND THAT SPAN IS ~0.4% OF A 281,096-CHARACTER ENGINE STRING. FIVE
IS A FLOOR, NOT A TOTAL.** No engine-wide number is reported: the last automated sweep of this kind
returned 264 "keys" after capturing JSON-schema fields and prose, and **it was discarded rather
than published.**

**WHY THE GUARD CANNOT BE MECHANICAL:** deciding whether a filter-position literal is a
**constraint** or a **structural necessity** requires knowing whether the quantity it gates is
tunable — and `grp.length<2` (a group needs two legs) and `ab30<25` (a chosen sample floor) are
**syntactically identical and semantically opposite.** **NEAREST ENFORCEABLE VERSION: a registry**
(§11), the same shape that worked for fixture citations and retracted claims.

**🔴 SCOPE MISMATCH, PRINTED BECAUSE IT MATTERS:** `coreNoHR` (config) and L2785 (bare) both keep
HR out of ticket construction and do **not** contradict — **but setting `coreNoHR: false` would NOT
restore HR to mixed tickets.** The config key does **less than its name and its census entry
imply**, and the difference is **invisible from the config**. Corrected in the census (§9A).
**No dead configuration found** — `coreNoHR` has live, distinct effect on CORE.


### 9A. FROZEN TABLE, CENSUS, AND PROVENANCE

**Census v2.5 (2026-08-01): 44 parameters / 0 fitted / 43 chosen (12 with no stated rationale) / 1
stated-arithmetic; 9 since-measured.** The BORN-provenance table was repaired 2026-07-31 — it had
never gained the rows for the `simJoint` clamp, the 1/n relax and T = 0.80 — and **its sum now
reads 0 + 1 + 29 + 12 + 0 = 42, agreeing with the prose for the first time.**

**PROVENANCE COUNT across the 29 M/A rows** (`freeze-exit-bundle.md`; the classifier reads what
each row CLAIMS): after this session's tracing, **zero rows are silent** — 12 carry the strong
`[src: …]` token (ratcheted so the count cannot fall) and the rest carry an inline source claim.
**Fixture-sourced rows: 8 of 29, of which 7 do NOT reproduce the caveat (M20 alone does).**

**THE TWO CORRECTED ROWS:**
- **`umpKFrozen`** — **no production measurement of the effect exists at any n**; production
  `context.json` has never carried a `kFactor`. What is measurable: the factor is clamped to
  **[0.92, 1.08]**, **60% (51 of 85) of umpires land ON a bound**, so **magnitude cannot grow with
  the armed count — only COVERAGE can**, ~0.35 of a board today → 83 of 85 at exit. The two armed
  clamp in opposite directions. **BREADTH, NOT DEPTH.** The ~08-04 date is struck.
- **M25** — the fixture's pooled 38.5× is **retired**. Re-measured on the **archived 2026-07-26
  production board** (`tests/m25-archive.test.ts`, 67-ticket pool, $750/$250): **`probability`
  $250 vs a $10 ceiling = 25.0×, 6 of 6 over, 5 $0-ceilings, 5 negative-czEv**; **`caesars_ev`
  $250 vs $265 = 0.9×, 2 over, ZERO negative-czEv**; `ev_gated` $225 vs $225 = **1.00×, zero
  over**. **The claim refines: "legacy modes place negative-EV bets by construction" is measured
  TRUE for `probability` and NOT DEMONSTRATED for `caesars_ev`.**

**UNMEASURED-WITH-MEASURED-CONSEQUENCE**: `coreEvMin` (self-graded sweep) · damping 0.5 (40 bp
range) · `SH_W` (self-graded by construction) · the 1/n cap relax (Kelly ceilings bound n=1 at
≤ ~8%) · **`umpKFrozen`** (magnitude clamped; consequence is coverage) · **`penQFrozen`** (its
INPUT `data/pen_quality.json` **has never materialised in a commit** — the factor is absent from
production, not merely pinned).

**OPERATOR RULES** (not engine parameters): **#1** no slip above 2% ($50 at $2,500) · **#2** step
15 is diagnostic only, mode returns to `ev_gated` as the last action before placing · **#3** no
legacy mode opened at all until M24 resolves.

---

## 10. DROPPED AND CORRECTED — every dated marker from this session

### 10.1 🔴 THE SAME-TEAM HR RULE IS DROPPED — a MEASURED REFUTATION, not a declined feature
**The owner proposed a same-team HR ban on reasoning about baseball. The measurement returned the
opposite sign — 1.103 [1.048, 1.168] against independence — the target set on the only real board
was empty (0 of 81 HR pairs), and the evaluator could not have seen the harm.** For a parlay,
positive dependence means the true joint is **higher** than an independence price implies: **those
are the pairs the bettor is helped by, and banning them removes structure rather than pricing it.**
**Correction to the framing, kept beside it:** same-**game** is the supported unit for HR;
same-**team** is not separable at that n. *(For TB the unit reverses — §7.2.)*

### 10.2 THE REASONING-NOT-MEASUREMENT LIST — three entries, two of them the owner's
| # | claim | whose | status |
|---|---|---|---|
| 1 | the count-armed accrual argument for the outs ship | **owner's** | on the list |
| 2 | the same-team HR ban | **owner's** | **refuted by measurement 2026-08-01** |
| 3 | **`coreNoHR`** — *"HR volatility lives in the FUN bucket only (user rule)"*, no measurement cited anywhere | owner's, in code | **measured true after the fact 2026-08-01: CV 1.97 vs 0.70–1.03** — moves off the list **with its number** |

**THE STANDING RULE HOLDS WITHOUT EXCEPTION: nothing in this project has been found by reasoning
about baseball, and that includes the owner's own proposals.**

### 10.3 CORRECTIONS DATED 2026-08-01
- **`coreNoHR`'s SCOPE** — governs **CORE ticket eligibility only** (L2975–76). L2785 independently
  governs mixed-pool membership. **Census entry rewritten to say what the key does rather than what
  its name implies.** One decision rested on the overstated scope and is corrected: the entanglement
  argument credited `coreNoHR` alone with emptying the same-team target set; **L2785 is why no HR
  pair could reach `parlaysMixed` either.** Conclusion unchanged; attribution now names both.
- **🔴 THE ZERO-OVERLAP CLAIM — WITHDRAWN.** "0 of 14,181 non-HR rows inside HR's 15.1–30.9% band"
  used a band taken from the **board** and applied to the **archive** — a post-filter range on a
  pre-filter population, **the exact 4:1-dominant error class.** Re-measured on one population:
  **82 of 14,191 (0.58%) overlap.** The qualitative separation survives; **the "byte-identical
  partition" claim was BOARD-ONLY and does not hold pre-filter.**
- **THE "PARTLY MANUFACTURED" CAVEAT — WITHDRAWN.** The separating experiment ran (the archive
  carries the rungs no board does) and **the bands stay disjoint with suspended rungs admitted**:
  deep rungs sit **above** HR's band because an alternate rung on a high-probability market is
  still a high-probability event, and **HR's own rungs go the other way at a 2.2% median.**
  **Admitting rungs widens the gap.**
- **"THE PROJECTION WAS WRONG ABOUT THE RATE" — WITHDRAWN.** **The rate is right**; the simulation
  predicted today's count exactly. **The ~2026-08-04 figure came from an earlier derivation** —
  the closed form `11 × (11.2 ÷ 85) = 1.449`, **an acknowledged underestimate** ignoring g = 3
  umpires who draw two assignments. **The error was in the derivation, not the rate.**
- **"THE ARCHIVE EXPERIMENT IS BLOCKED" — WITHDRAWN.** It was never blocked; the archive and the
  board are different populations and I had reasoned about the board.
- **THE `qualified` PLAYER POOL** — a statsapi call without `playerPool=ALL` returns a
  **qualified-batters leaderboard** (157 splits, min 65 AB). **Caught before publication.**

---

## 11. SPEC-ONLY QUEUE — WITH PREREQUISITES. NOTHING HERE IS SHIPPED.

| # | item | prerequisite | additive? |
|---|---|---|---|
| **1** | **`placed` flag + `actualStake`** — `true\|false\|null`, **absent ⇒ null**; three-state control on the ledger page, an **overlay rule in `mergeDay` shaped exactly like `confirmed`'s**, and a `pickBase` key. **Blank must be visible: an unanswered count above the fold, no default of `true`** | none — **it is itself the prerequisite for auto-lock.** Every day it does not exist is ledger data that cannot later be split into selected-vs-bet | **YES — no engine-string change.** `shLockCard` writes nothing new; the fields are set afterwards from the React ledger page |
| 1a | **the attestation ADDENDUM, not a backfill** — an entry dated ≤ 2026-08-01 with no `placed` field resolves to `placed: true BY ATTESTATION` **at read time** | the owner's attestation, **recorded 2026-08-01** | n/a — deliberately **not** a field write; a fourth mutable subfield on a locked row is the class M22 flags |
| **2** | **`simJoint` j2/pm emission** — emit both factors per group; **a measurement, not an inference from a rounded number** | — | **NO — inside the engine string.** Rides the next hash-moving ship; vintage cost currently zero |
| **3** | **the probability floor** — any value in `(30.9%, 37.1%]` reproduces the board exclusion; 34% mid-gap | **BLOCKED ON READ 4** for a data fit. **As specified it is FITTED TO A RULE, not to data, and shipping it would launder `coreNoHR`'s provenance** | n/a — recorded as the general form, spec-only |
| ~~**4**~~ | ~~**the self-arm demotion**~~ — **✅ SHIPPED 2026-08-01** (owner's item 1). Count → informational, brakes asserted, crossing record append-only with a monotone floor, guard checks **completeness** and names the umpire. Both reds observed; the original proven green on the same edit. **§12F**, and the residual is named there | — | test-only |
| **5** | **per-stage drop counts** for the fourteen-stage chain — twelve stages have no count | none; archive + board are on disk | **NO — NOT ADDITIVE.** Every stage is a `continue`/`return` **inside the engine string**, so a counter at each one moves the hash. **RIDES THE NEXT HASH-MOVING SHIP, alongside item 2's `simJoint` j2/pm.** The out-of-engine **reconstruction** tool stays **spec-only** and can see **9 of 14** — see §8 |
| **5a** | **convert the seven TS/TSX market-set mirrors to `MODELLED_MARKETS`**, and `tests/strict-coercion.test.ts`'s inline comment-stripper to `tests/helpers/source.ts` | none. The six **Python** mirrors cannot import it and stay guard-covered. strict-coercion is **signed off — replace, do not edit in place** (M27) | **YES** — `src/` and test-only, no engine string |
| **6** | **the bare-literal registry** — each literal with its line, the guard asserting it is **still present at that line**, plus registry count == the census's bare-literal count. **It cannot find new ones; that needs judgment** | none | test-only |
| 7 | full `/api/odds` authentication (**the only thing that closes the route**) · `APP_PASSCODE` steps 2–4 · M28's `src/lib/pass.ts` | **step 4 is LAST** — see §3 | — |
| 8 | the targeted-capture **landing test** — first day the pair runs, `price-path` must print **n > 0 in 60–120** | the crons delivering | — |
| 9 | the props-history redesign (**never executed: 0 of 66 runs were `workflow_dispatch`**) · the three orphan test files · `umpKFrozen`'s unpin decision (no date, no condition) · `coreEvMin` · the 1/n cap · A1 · damping · `SH_W` · alt keys · the ungraded-group fix · the ratio surface + both positivity gates (M26) · a proxy per-request `console.log` | various | — |

---

## 12. INSTRUMENT LEDGER

**SEVEN INSTRUMENT DEFECTS, every one found by an instrument doing its job badly rather than by a
model error**: (1) the cfSel spec's vacuity · (2) the lineup guard's wrong direction · (3) the
scope-by-diff comparator's header/code disagreement · (4) the line-number-keyed site ids · (5) the
served extractor's false mismatch (278,267 vs 281,096 — the first PLAUSIBLE one) · **(6)
`workflow-timing.test.ts` enumerating `.github/workflows` from the WORKING TREE, i.e. the branch
that fires nothing — closed 2026-07-31 with a firing-set-is-a-subset assertion** · **(7)
PROVENANCE LOST IN TRANSIT — fixture figures cited as production magnitudes; 9 citations across 5
docs, corrected, and encoded in `tests/fixture-citation.test.ts`.**
**The pattern is explicit: in this project instruments fail more often than analyses, and they
fail by returning plausible numbers.**

**THE WIRING AUDIT (`tests/guard-wiring.test.ts`).** Every plant in this repo proves a
**COMPARATOR**; none proved the **WIRING**. Defect #6 and M27 both slipped through for exactly
that reason. The harness backs up a guard's real input, corrupts it in the specific way that guard
exists to catch, runs that guard alone in a subprocess, asserts non-zero exit, restores, and
asserts the restore was byte-exact. Two guards use a **temp COPY** via `PL_ENGINE_PATH` /
`PL_GEN_PATH`, so `legacy/index.html` is never written.

**OBSERVED RED FIRST**: the first run carried a NO-OP control (append a newline) and it **failed
to fail** (1 failed | 6 passed) — the demonstration that a green result means the corruption was
real. The control is not kept; that is why coverage is a count.

**7 guards proven wired. OF THE SEVEN INVARIANTS THE OWNER SIGNED OFF, FOUR ARE PROVEN WIRED** —
`served-extractor`, `site-id-integrity`, `read-first-index`, `self-arm-stamp`. Also proven wired
outside the seven: `doc-structure`, `fixture-citation`, `sha-references`.

**THREE CANNOT BE, and why:**
| guard | why |
|---|---|
| `chain-tools` | asserts pure functions from `tools/`; corrupting them means editing source, which is the change under test rather than its input. **Now carries a standing plant** (five invalid-by-value cases) replacing its one-time MODULE_NOT_FOUND memory |
| `line-history-consumers` | its corruption is "a consumer appears" — same objection |
| **`finite-prices`** | **asserts on computed board values; there is no artifact to corrupt.** Its wiring is unprovable without a board — **scheduled on tomorrow's board (§1)** |

**M27** — `sha-references`'s helper was widened to accept `HEAD` inside a docs commit
(`ea7445a`), zero assertion lines touched. **NARROWED this session**: `HEAD` counts only when the
handoff records a held stack; it records none today, so the guard is strict. **M28** — the device
passcode has been collected and never sent since `e9f4bc7` (2026-07-11), while the Settings panel
claims it "stops strangers from burning your API credits". **Sixth computed-and-discarded
instance, and the only one that claims a protection.**

---


### 12A. THE TOOLS ON REAL INPUT (2026-07-31, owner's item 1)

**THE CLASS: a tool whose tests feed it a synthetic shape has never been tested.** Two were found
broken on production data; a third was found the moment it was pointed at a real artifact.

| tool | what its tests feed it | real artifact ever passed through? | obtainable at zero credits? |
|---|---|---|---|
| `quota.mjs` | hand-built JSONL lines | **YES** — it WROTE `data/quota-log.jsonl` (20 real rows); `--series` parses its own output | already on disk |
| `burn-report --props` | hand-built `{snapshots:[…]}` | **YES** — run 07-31 against 18 real day-files | `origin/line-history:data/props/*.json` |
| `board-report` | hand-built `{categories:{…}}` | **YES, first time 2026-07-31** — the archived 07-26 board. **Three defects** | `origin/line-history:data/boards/2026-07-26.best.json.gz` |
| `verify-served-engine` | a synthetic chunk | **YES** — and it **FAILED** there (the false 278,267 mismatch), then corrected | the served chunk |
| **`burn-report --pred`** | a hand-built **ARRAY** | **NO.** Threw `TypeError` on the only shape production emits | **none exists — read 2 is its first** |
| **`ledger-report`** | hand-built entry objects | **NO** — and it receives the **only copy of the bankroll population** | **none exists — read 4 is its first** |

**THE HONEST COUNT: 4 proven on production input, 2 UNPROVEN**, reported by
`tests/guard-wiring.test.ts` on every run rather than implied.

**`board-report`'s THREE DEFECTS, all found by one run against the real 07-26 board:**
1. **The failure envelope was read as a board.** `/api/board` returns **`{board: null, reason, gens}`
   at 200** on four paths (route L23/L47/L54/L58). `blob.board ?? blob` treated `null` as absent
   and fell through to the envelope — printing a complete, plausible, **fabricated** reading,
   VACUOUS branch and all. **Now STOPs at exit 65.**
2. **A false M-item on every pre-flag board.** It printed *">>> M-ITEM: the flag is not reaching the
   server path"* for 76 outs legs on a board that **predates `outsSusp` entirely**. **Now gated on
   `echo.outsSusp === true`**, with the no-echo case named as undecidable rather than as failure.
3. **🔴 READING 5 WAS UNANSWERABLE AND WOULD HAVE READ AS A FAILURE.** `/api/board` returns
   `gens: GenIndexEntry[] = {at, priced, live, luPct, bytes}` (`board-store` L51–60) — **there is
   no `trigger` field in it and no `gen` key at all.** The tool looked for `blob.gen.trigger`, so
   it would have printed `ABSENT` **tomorrow no matter what happened**, and reading 5 pre-commits
   *`trigger === "header"` OR IT DID NOT LAND*. **`trigger` is stamped by `/api/generate` (route
   L289) into its own RESPONSE BODY and into the prediction store's `GenStamp`** — read it there.
   The tool now says so instead of guessing.

**M19 MEASURED ON A REAL BOARD FOR THE FIRST TIME:** 110 `parlays` + 86 `parlaysMixed` = **196
emitted, 168 distinct leg-sets — 28 duplicates** (4 inside `parlays`, 24 shared across). Count (1)
is now reported over **distinct** leg-sets with the raw union beside it.

**`ledger-report`'s SHAPE ASSUMPTIONS — every one found by walking its input handling, all now
explicit checks that exit 65 rather than degrade:**
| assumption | what it did silently | now |
|---|---|---|
| `blob.ledger ?? blob` | accepted a **bare array** — a shape the endpoint cannot emit | **refused** |
| an error body is an object | `{error:…}` → `entries.length` undefined → then a `TypeError` mid-print | **refused with the body** |
| **`e.bankroll ?? 0`** | **a locked entry with no bankroll ⇒ every ceiling 0 ⇒ ratio Infinity ⇒ 100% overstake**, printed with a dollar total | **refused, naming the entry** |
| `e.date` string-compared | a non-ISO date silently excludes the whole 07-17→07-22 window → `0W/0L`, `hit undefined%` | **refused** |
| `kellyFrac` → null | tickets with no computable ceiling counted in the denominator, invisible | **counted and printed as `(0) EXCLUDED`** |
| `l.cz` is American | a decimal price (e.g. `2.5`) yields **97.6% implied** — plausible and wrong | **warns with the count and examples** |
| `fieldCensus` keys by date | duplicate dates **overwrite**, so the census describes only the last | **warns** |
| `mkt(t)` = leg 0's market | a mixed-market parlay is attributed entirely to its first leg | documented, unchanged |
| `{ledger:[]}` at 200 | a clean zero from an **empty store** — the bankroll exit with no population | **refused** |

**IMPOSSIBLE BRANCH — did a fixture derived from a real artifact still diverge from production?**
**Not found.** No tool fixture in this repo was derived from a real artifact; all six were
hand-built. That is the finding — the branch could not fire because the condition it tests for
has never existed here.

**THE META-TEST NOW COVERS TOOLS**, not just guards (`tests/guard-wiring.test.ts`): six cases feed
each tool a shape **the routes actually emit** — copied from the route files, not invented — and
assert a **non-zero exit**; plus a real-artifact case that reads the archived 07-26 board and then
refuses the same file replaced by the route's null envelope. It **skips with a printed reason**
when `origin/line-history` is not fetched, so the count stays honest.

---


### 12B. 7A.1 THE QUOTA INSTRUMENT — TRACED, PARTLY IMPEACHED, FIXED (2026-08-01, owner's item 1)

**THE PATH THE VALUE TAKES, line by line.** `quota.mjs` L23–24 →
`GET /api/odds?u=<https://api.the-odds-api.com/v4/sports/>` **with no `fresh=1`** → route L42–44
`fetch(url, { next: { revalidate: 240 } })` — **the Next data cache** → route **L51–54** lifts
`x-requests-remaining` / `x-requests-used` **off the `upstream` Response object** and re-sets them
→ `quota.mjs` L44–45 parses those headers.

**SO THE MECHANISM IS REAL: on a cache HIT the `upstream` object is reconstructed from the cache
entry, and its headers carry the values captured WHEN THE ENTRY WAS WRITTEN.** The tool was
reading a header that can be up to 240 s stale. **Yes, the Odds API returns the quota headers on
every call** — that is why the proxy can forward them, and why a cached response carries a stale
pair rather than none.

**THE SEVEN FLAT READS AGAINST THE 240 s WINDOW — the spacing decides it:**

| read | gap from last *fetch* | verdict |
|---|---|---|
| 19:11:31.883Z | — | **FRESH** |
| 19:12:16.165Z | 44.3 s | **CACHE HIT — could not have shown movement** |
| 19:19:55.586Z | 503.7 s | **FRESH** |
| 19:27:29.559Z | 454.0 s | **FRESH** |
| 19:31:25.848Z | 236.3 s | **CACHE HIT — by 3.7 seconds** |
| 20:21:56.770Z | 3,267.2 s | **FRESH** |
| 21:04:11.529Z | 2,534.8 s | **FRESH** |

**FIVE OF SEVEN ARE FRESH FETCHES, ALL READING 553 — AND THE TWO THAT BRACKET THE 20:48Z SWEEP
(20:21:56 AND 21:04:11) ARE BOTH FRESH.** So the first pre-committed branch does **not** fire in
full: the tool did read through cache and two flat reads were structurally unable to move, **but
not the load-bearing pair. THE SECOND BRANCH FIRES — the flatness is real, and the 20:48Z sweep's
cost is the false fact.**

**KNOWN-FRESH READS THAT VALIDATE THE TOOL:** every read whose value *moved* proves a live fetch.
There are **six** — 07-29T12:00 (−641), 07-30T03:55 (−215), 07-30T16:45 (−223), 07-31T01:25
(−200), 07-31T13:57:11 (−339), 07-31T19:11:31 (−146). The 13:57 read follows a spend we can
account for exactly (58 event-fetches). **The instrument tracks real movement; what it could not
do was distinguish "no movement" from "not asked".**

**THE DIRECT TEST — RUN, AND IT COST NOTHING.** There *is* a cache-free path that needs no
secret: `&fresh=1` sets `cache: "no-store"` (route L43), and `/v4/sports` is not billed —
**measured by four consecutive fresh reads (07-31 01:25 → 04:50 → 05:55 → 06:41, every gap far
beyond 240 s) all returning 1,038.** Three calls back to back:

```
CACHED (what quota.mjs did)  remaining=19958  used=42
FRESH  (&fresh=1)            remaining=19958  used=42
CACHED again                 remaining=19958  used=42
```

**IMPOSSIBLE BRANCH — DID NOT FIRE. They agree.** Stated precisely: this compared the **cached
proxy path against the fresh proxy path**. A bare upstream call needs the Odds API key, **which
is the owner's to type** — that comparison has not been made and is not made here.

**THE FIX, SHIPPED:** `quota.mjs` now requests **`fresh=1`** and sends `x-pl-pass` **only if
`APP_PASSCODE` is in its env** (the same pattern as the python sweeps), with an explicit 401
message naming the coupling — once §3 step 4 lands, a fresh read without the header 401s and
**this tool goes blind**. And **`burnSeries` now NAMES A RESET** instead of subtracting through
it: either witness (`remaining` rises or `used` falls) yields `spent: null`, `reset: true`.

**HOW A 14-EVENT CAPTURE COULD LAND AT ZERO — the candidate the owner named is RULED OUT.**
`snapshot_props.py` has **one** fetch entry point (L29–30) and it **always** appends `&fresh=1`,
so every props call is `no-store` and pays. Cached upstream responses cannot explain it, and the
props cost model does **not** change on that account. What remains: the upstream counter posts
with a lag, or the spend went against a different key. **Unresolved, and now unresolvable for
this instance** — the period closed.

---

### 12C. THE TOOL-FABRICATION CLASS — FOUR INSTANCES IN THREE DAYS

**Every one returned a number that looked right, on real data, while its tests passed.**

| # | tool | the fabrication |
|---|---|---|
| 1 | `verify-served-engine` | returned a plausible **SUFFIX** of a real chunk — the false 278,267 mismatch |
| 2 | `burn-report --pred` | `DayBlob.records` is a **keyed map**; the test hand-built an **array**. Threw `TypeError` on **every** real export |
| 3 | `board-report` | `/api/board`'s **`{board:null, reason}` at 200** was read as a board — printed a complete, plausible, **fabricated** reading, VACUOUS branch and all. Plus a **false M-item** on a pre-flag board and a **`trigger` read that could never succeed** (no such field in `gens[]`) |
| 4 | **`price-path`** | **`Number(null) === 0` and `Number.isFinite(0) === true`** — **9,578 HR rows became perfect zero-movement observations** and the pooled mean moved **1.20 → 1.07** |

**THE AUDIT THAT FOLLOWED FOUND TWO MORE LIVE SITES, both in tools scheduled to run that night:**
`quota.mjs`'s `Number(headers.get(...))` — **the guard whose message reads "quota headers absent"
COULD NOT FIRE**, and would have appended `{remaining: 0, used: 0}` to the append-only series; and
`ledger-report`'s `Number.isFinite(Number(e.lockedAt))`, where a null `lockedAt` became **epoch 0**
and read as "not late" **inside the reading added to measure late locks.**

**ENCODED:** `tools/strict.mjs` (`num` / `req` / `numFromText`) + `tests/strict-coercion.test.ts`
with plants, **plus the write-time quota identity `remaining + used == 20,000`** — which is a
**fabrication detector, not a reset detector** (it holds on both sides of the reset).
**RATCHET: 6 raw `Number(` sites remain in tool code.** **The ratchet itself had to be corrected** —
it counted the prose *explaining* the trap as instances of it (10 reported against 7 real), so it
now strips comments before scanning. **A guard that cannot tell code from a comment about code is
measuring the wrong artifact.**

**THE META-TEST NOW COVERS TOOLS**, not just guards: six cases feed each tool a shape **the routes
actually emit**, copied from the route files, and assert a **non-zero exit**; plus a real-artifact
case reading the archived 07-26 board and then refusing the same file replaced by the null
envelope. **TOOL/REAL-INPUT LEDGER: 4 proven on production input, 2 UNPROVEN** — `burn-report
--pred` and `ledger-report`, whose first real inputs are reads 2 and 4.

### 12D. THE ERROR DISTRIBUTION — POPULATION ERRORS DOMINATE

> **STANDING RULE: check which population a claim is about before checking whether it is true.**

| class | count |
|---|---|
| **POPULATION — the claim was about the wrong set** | **9** |
| **COERCION / SHAPE — the value or its container was misread** | **7** |
| **GENUINE LOGIC — the inference was wrong from correct data** | **2** |

**Population errors outnumber logic errors ~4:1; coercion errors outnumber them ~3:1.** Two of the
population errors are the owner's; seven are mine or the tools'. **Where to look next is not the
reasoning — it is the denominator, the branch, the date range, and the schema vintage.** Every one
of the nine was caught by asking *which set is this about?*; **none by re-checking the logic.**

### 12E. SELF-ARM GUARDS — THE STANDING RULE

> **A self-arm guard must not auto-record. An auto-updating stamp is a counter, not a control —
> the manual step exists so a human decides whether a vintage boundary moved before the number
> changes. If the noise becomes untenable, assert the BRAKES and demote the count to
> informational. Never automate the stamp.**

**The threshold has arrived:** `14 × (11.2 ÷ 85) = 1.84/day`, ×1.11 for g = 3 doubles ≈ **2.05/day**,
so **P(no crossing) ≈ 13% — the count already changes on ~87% of refreshes.** **Only
`self-arm-stamp` fires on data alone.** `sha-references` fires on a rebase orphaning a citation
(always a real defect); `workflow-branch-sync` fires on **divergence and on 14-day waiver expiry** —
a calendar, designed to demand one decision per waiver, working as intended.

**THE DEMOTION IS APPLIED (2026-08-01, owner's item 1).** The standing rule above is unchanged and
was followed: the count is demoted to informational, **the brakes are asserted**, and the stamp is
still written by hand. See **§12F** for the defect that forced it and both observed reds.

### 12F. INSTRUMENT DEFECT #7 — THE GUARD PROVED A NUMBER, NOT THE RECORD

**The count was the assertion; the crossing record was PROSE in `ARMED.note` that nothing read.**
So the guard was **GREEN on a record with a crossing deleted from it** — the live count comes from
`data/ump_k.json` and does not move when the prose does.

**MEASURED 2026-08-01, on the original guard, before it was replaced:** Willie Traynor's dated
crossing deleted from `ARMED.note`, while `data/ump_k.json` still carries him at `{"g":5,"k":69}` →
**`3 passed`, 0 failed.** The record lost a crossing and the instrument said nothing. **That is the
capture the demotion buys, and it is why this is a defect and not a preference.**

**WHAT REPLACED IT** (`tests/self-arm-stamp.test.ts`, 6 tests):
| check | strength |
|---|---|
| the arm COUNT | **INFORMATIONAL — printed, never asserted.** A count that only rises is not news |
| **COMPLETENESS** | every umpire at `g >= 5` must carry a dated entry, and the failure **NAMES** them |
| **APPEND-ONLY** | `CROSSINGS.length >= FLOOR`, floor **4**, monotone — raise it in the commit that appends |
| the DOUBLE BRAKE | **unchanged in strength**, plus every entry must record `braked: true` |

**BOTH REDS OBSERVED AND PRINTED BEFORE ACCEPTANCE:**
- **(a) Traynor entry deleted → TWO failures, one edit.** COMPLETENESS: *"…NOTHING RECORDED IT:
  Willie Traynor"*. APPEND-ONLY: *"the crossing record LOST entries (3 < floor 4)"*. Restored.
- **(b) `umpKFrozen:true` → `false` in `legacy/index.html` → brake test red** (*"umpKFrozen is no
  longer true — brake 1 released"*). Reverted; `legacy/index.html` re-hashes
  **`49734a15c5af9bbd6e3f8bef91d4f40308a691813a6a7abece830ca2ffe58495`**, byte-identical, and
  `git status` is clean on it. **No engine string moved.**

**THE FOUR CROSSINGS ARE BACKFILLED WITH THEIR DATES** — Barrett 2026-07-30 (**`commit: null`, NOT
GUESSED** — the crossing predates the record and the sha was never captured), Traynor 2026-07-31
(`200e4028…`), Moore + Thomas 2026-08-01 (both `b68b1e36…`).

> ### 🔴 THE RESIDUAL — NAMED, NOT CLOSED
> **A crossing that is RECORDED BUT WRONG is caught by nothing.** `date` is checked for SHAPE only
> (a regex), never against the commit that carried it; `commit` is never resolved; `braked: true`
> asserts only that **the record claims** a brake, not that a brake held. Wrong date → **green**.
> Wrong sha → **green**. `braked: true` on a crossing that actually reached a board → **green**.
> Only `braked: false` is caught, and only because it contradicts the record's own claim.
> **Closing it needs a git join** — resolve `commit`, assert it touches `data/ump_k.json`, assert
> its author date equals `date`. **SPEC, NOT SHIPPED.**

### 12G. THE MIRRORED-CONSTANT SWEEP — THE CENSUS NEVER COVERED THIS OBJECT

**The `DAMPING` pattern (engine-echo L39) is confirmed and generalizes.** It extracts by matching
the LIVE allocator expression and taking the capture group —
`LEGACY_SRC.match(/\(gUse\[l\.game\]\|\|0\)\*([0-9.]+)/)` → `Number(m[1])`, **null if the expression
ever moves**, never a default. Shipped this turn on the same pattern:
`MODELLED_MARKETS` (from `var SH_MKT_LABEL={…}`, **6 keys**) and `NAMED_CATS` (from
`var SH_NAMED_CATS=[…]`, **8**) in `src/lib/engine-echo.ts`.

**WHY THE CENSUS MISSED IT:** the census (44 params, v2.5) enumerates **config KEYS**. A mirror is a
different object — a second copy of a key **SET**, or a config **VALUE** re-typed inside a tool that
never reads `SH_CFG`. Neither is a parameter, so neither was ever counted.

**THE SWEEP — THIRTEEN tracked mirrors of the market set. TWELVE AGREE WITH THE ENGINE TODAY.**
Six tools (`gate_activity.py`, `ladder_drift.py`, `range_compression.py`, `selection_effect.py`,
`self_consistency.py`, `snapshot_props.py`) and seven `src/` files. **Plus FOUR config VALUES
re-typed in `tools/gate_activity.py` — `czEv >= 2` (`coreEvMin`), `legs > 3` (`coreMaxLegs`),
`czDec > 15` (`coreMaxDec`), `ro.get('need', 100)` (`consMinN`) — all four agree, and the first
three drive fires-COUNTS, not just labels.**

**THE ONE THAT DIFFERS — and it is real but inert. Registered as M29.** `src/lib/engine-client.ts`'s
`DIR_MARKETS` names **five of six**, omitting `batter_home_runs`. The omission is defensible (HR is
a 0.5-only market — engine L2241 drops every other rung — so it has no under side) and is **waived
with that reason**. The finding is the other half: **`DIR_MARKETS` has ZERO importers and
`setDirPref` has ZERO callers**, while the engine half is **LIVE** — L2465
`var pref=(SH_CFG.dirPref&&SH_CFG.dirPref[mkt])||"both"` sits inside `dscp5`
(`selMode==="dk_fd"||selMode==="ev_gated"` — **the server default**) and **overrides the
model-chosen side**, and `engine-client` L117 pushes `cfg.dirPref = getDirPref()` from
`localStorage.pl_dirpref` at boot. **`BoardEcho` carries no `dirPref` field**, so it would not say
so. Server boards are unaffected (no localStorage; `dirPref:{}` at L1098) — **the exposure is
device-side only and needs a hand-edited localStorage key.** M28's shape with the halves reversed.

**ENCODED:** `tests/mirrored-constants.test.ts` (6 tests) re-parses the engine and diffs **every**
mirror on every run — the Python tools cannot import the TS export, so the guard is what covers
them. **Converting the seven TS/TSX mirrors to `MODELLED_MARKETS` is QUEUED, not done.**

**OBSERVED RED, on real code, before the file was accepted:** `tools/board-report.mjs` L107 read
`const consMinN = echo?.consMinN ?? 100`. **The value agreed with the engine — the defect was the
CONDITION.** The fallback fires when **the echo is absent**, and an absent echo is **reading 3's
stop condition** ("present in the response body or the push did not land"). The tool would have
printed a `crossed` verdict computed from a copied literal **on exactly the boards where the push
did not land.** Fixed to `null` + `>>> UNREADABLE`; pinned.

**AND THE SAME LESSON RECURRED INSIDE THE FIX.** The new guard's first version flagged
`echo?.consMinN ?? 100` **inside the comment recording that the fallback had been removed** — it
fired on the tombstone. Identical to the ratchet's comment-vs-code correction, **in a guard whose
own header cites it.** Twice is a class: the stripper now lives once, in `tests/helpers/source.ts`.
`tests/strict-coercion.test.ts` keeps its inline copy — **it is signed off and is NOT edited in
place** (the M27 failure mode); converting it is queued.

---

## 13. POSITION

> # 🔴 THE POOL RESET. 2026-08-01T01:35:56Z: **19,958 remaining / 42 used.**
>
> **Measured, not inferred** — `data/quota-log.jsonl`, live read this turn through the corrected
> tool. The pool went **553/19,447 → 19,958/42** across the interval 2026-07-31T21:04:11.529Z →
> 2026-08-01T01:35:56.369Z, which **contains 2026-08-01T00:00Z**. Both witnesses agree
> (`remaining` rose, `used` fell) and both period totals sum to **20,000**.
> **READING 18's RESET BRANCH FIRES: restate the runway, reprice the calendar.** Every figure
> below marked *(pre-reset)* is a closed-period fact and is kept as one.
> **THE BURN ACROSS THAT INTERVAL IS UNMEASURABLE**, not zero — the counter it was measured
> against no longer exists — and `burnSeries` now emits `spent: null` there rather than −19,405.
> **AND THE 20:48Z SWEEP'S COST IS NOW PERMANENTLY UNMEASURABLE**: it could only have posted
> inside the period that just closed, and that period's last observation is the 21:04 read.

- **Quota: 19,958 remaining / 42 used — 2026-08-01T01:35:56.369Z.**
- *(pre-reset)* 553 remaining / 19,447 used at 2026-07-31T21:04:11.529Z, **flat across seven reads
  spanning 1 h 53 m — of which FIVE were fresh fetches and TWO were cache hits** (§7A.1). The two
  that bracket the 20:48Z sweep, 20:21:56Z and 21:04:11Z, are **both fresh**, so that flatness is
  real.
- **Today: 1,038 → 553 = 485 spent. 339 attributed** (props-history's morning batch, 8 delivered
  runs → 4 paid snapshots, 58 event-fetches; modelled 348 against 339 measured). **146 NOT.**
- **The per-event cost is NOT a constant.** Since `residual ≥ 0`, each window bounds it from
  above; the binding window gives **`c ≤ 5.114`**. **Both 6.0 and 5.845 are refuted by data.**
- **BURN AND RUNWAY AS BANDS**: props ceiling post-cut **162–185/day**. **A: 162–285/day →
  1.9–3.4 d · B: ~1,330/day → 0.41 d · C: not computable.**
- **FIVE CONSECUTIVE DARK BOARD-DAYS** (07-27 … 07-31). **Homogeneous window: COUNT ZERO.**
- **Both exits UNREACHABLE THIS CYCLE WITHOUT A RESET.** The parameter exit needs ~13.5k credits
  to 09-22 against 553; the bankroll exit needs per-market settled-leg volume (12-pp ≈ 35–40
  board-days) and its test is POOLED, so one market's miss is maskable. **The reset date remains
  unread — owner's Odds-API dashboard only.**

---


### 13A. 7A.0 THE RATION DECISIONS RESTATE AT 19,958 (2026-08-01, owner's item 3)

### The props cron cut did NOT cost close capture — measured, not argued

**8 closes in the archive** (`kind === "close"`, 58 snapshots over 18 day-files), by UTC hour:

| UTC hour | closes | which retained cron lands there |
|---|---|---|
| 23 | **4** | `0 20` → ~23:3x |
| 00 | **3** | `0 21` → ~00:1x |
| 20 | **1** | `0 17` → ~20:0x–20:5x |

**ALL 8 OF 8 LAND IN A BAND A RETAINED CRON COVERS.** The six cut crons (`0 22`, `0 23`, `30 23`,
`0 0`, `30 0`, `0 1`) queued into the **morning** batch — hours 06–11 hold 33 of the 58 snapshots,
and **not one close.** **The cut removed duplicates, not closes.**

**→ THE OWNER'S FIRST BRANCH DOES NOT FIRE.** Close capture is not materially degraded, so
restoring a cron is **not indicated by this measurement** and nothing needs to be spent on it.
**IMPOSSIBLE BRANCH (the four would have caught MORE than the ten): does not fire either — equal
at 8 of 8, not more.**

**THE ONE THING THE CUT DOES COST, and it is item 2's blocker, not close capture:** the archive
takes **at most one snapshot inside 120 minutes per event**, and a price-path observation needs
**two**. That is why the 60–90/30–60/10–30/<10 buckets are **empty** (memo §M1). **If a lock-time
criterion is ever to be fitted, the capture that would fit it is a SECOND snapshot inside the
window** — a different change from restoring a cut cron, aimed at a different band, and priced
separately when it is wanted.

### Variant B is UN-SUSPENDED

Suspended at 553 because 12 credits mattered. **At 19,958 the premise is gone, and its purpose is
now load-bearing**: it calibrates **`c`**, the per-event cost — which is the residual's attribution
instrument, and **the residual is the calendar's binding constraint**. Protocol and readings stand
as written in `docs/board-open-experiment.md`, **including the `bestBoard`-fallthrough STOP**
(`engine-client` L297 → `generateBoard()` → `logBoardPredictions`: opening the board with no cached
and no server board GENERATES one, spends, and writes `src:"client"` rows). **Run it after the four
reads, before the board.**

### Does one board per day to 2026-09-22 fit? YES, with room — the ration framing goes away

52 days from 2026-08-01. Boards at ~66: **3,432**. Props at ~170/day: **8,840**. **Total ≈ 12,272
against 19,958 — it fits with ~7,686 to spare**, and the calendar's binding line (K's/Outs at 38
boards ≈ 8,968) sits inside it.

**→ THE OWNER'S SECOND BRANCH FIRES. THE CONSTRAINT IS NO LONGER CREDITS.** It is **the residual
plus the chain**: at 48.3/h the residual alone is 1,159/day = **60,268 over those 52 days, three
times the pool**, draining it by **~2026-08-18**; and boards have been dark five days with the
chain unverified end to end and the cron edits untested until Monday. **That sentence replaces the
collection doc's top line.**

---


### 13B. THE CALENDAR — STOPPED, NOT LATE (2026-07-31, owner's item 2)

> **EVERY DATE BELOW IS A COUNT-ARMED CROSSING PROJECTED FROM AN ACCRUAL RATE, AND THE RATE HAS
> BEEN ZERO SINCE 2026-07-26. THEY ARE NOT LATE — THE CLOCK IS STOPPED. `reopenDays` RETURNS
> `null` — "NEVER, AT THIS RATE" — WHENEVER THE RATE IS ZERO (`src/lib/gate-rebuild.ts` L83–86).**
> **A DARK DAY DOES NOT DELAY THESE DATES; IT SUSPENDS THEM.**

**THE DATE-ARMED CLASS IS EMPTY.** It was struck on 2026-07-30 (`collection-period.md` L7029 ff.,
"THE REOPEN CALENDAR IS COUNT-ARMED"): there is **no date anywhere in the consensus gate**; the
engine blocks on `small && consEv < consMinEv` where `small` is a **count** test against `mktN`
(L3037–3048), and the 07-29 / 07-31 / 08-01 "expiries" were **projections misfiled as dates**.
Nothing on this calendar arrives by the calendar.

**TWO GATES, AND BOTH ARE CURRENTLY SHUT.** A graded row needs (1) a **generate** to write the
row and (2) the **grader** to grade it.

| gate | mechanism | state |
|---|---|---|
| **rows** | `/api/generate` L380 writes `src:"cron"`; the client fallthrough (`engine-client` L297 → L379) writes `src:"client"`. **Accrual is GENERATE-only, not board-only** | **zero known since 07-26** — but the client path is exactly what **read 2** measures |
| **grading** | `/api/calibrate` (`GRADE_DAYS = 6` most-recent logged dates per run) | **UNSCHEDULED — `vercel.json` now carries no `crons` array at all** (paused this session). `lastRun` from **read 3** is the direct measurement |

**THE RESTATED CALENDAR.** "Assumed" is the rate the date was computed at; "actual" is what has
happened since 07-26.

| date | what it gates | assumed rate | actual | restated |
|---|---|---|---|---|
| **~2026-07-31** | Phase-2 **game**-cluster ICC (≥20 clusters + ≥300 rows) | 70 graded rows/day, 15 clusters/day | **0/day** | **STOPPED.** Clusters likely met (~30 from 07-25/26); **the 300-row floor is the binding one and stands near ~70** |
| **~2026-07-31** | Phase-2 **player**-cluster ICC (same floors) | same | **0/day** | **STOPPED**, same binding floor |
| **2026-08-08** | ML · RL consensus reopen | 7.5 graded legs/day | **0/day** | **STOPPED** — `reopenDays` → `null` |
| **2026-08-15** | Phase-2 **day**-cluster ICC — the unit that decides whether **2.7σ becomes 1.1σ**; **the HRR amendment stays unsigned until it lands** | ≥20 day-clusters **at 1 logged day/day** | **0/day** | **STOPPED.** A day-cluster requires a *logged* day; five dark days added **zero** |
| **2026-08-17** | Total Bases consensus reopen | 4.5/day | **0/day** | **STOPPED** |
| **2026-08-20** | the 20-board crossover review | 1 board/day | **0/day** | **STOPPED** |
| **2026-08-23** | Hits · HR · H+R+RBI consensus reopen | 3.5/day | **0/day** | **STOPPED** |
| **2026-09-03** | K's · Outs consensus reopen (the positive control) | 2.5/day | **0/day** | **STOPPED** |
| **2026-09-08** | `SUMMARY_DAYS = 45` first caps; window start 2026-08-09 | 1 **logged date**/day | **0/day** | **STOPPED** — and the doc already says so in its own terms: *"`allDays` counts logged dates, not calendar days"* (L880–882) |
| **~2026-09-15** (09-10 → 09-26) | the HRR retirement trigger | 2.9 legs/day central | **0/day** | **STOPPED** |
| **2026-09-22** | the parameter exit | ~13.5k credits | **553 in the pool** | **UNREACHABLE THIS CYCLE** — already recorded in §9, and unaffected by cadence |
| ~~2026-08-17~~ | fixture representativeness | 20 boards | — | **already STRUCK** as unreachable this cycle and re-scoped with **no calendar date** (reading 21) |

**⚠️ IMPOSSIBLE BRANCH — IT FIRED. One calendared date has ALREADY BEEN MARKED REACHED, and
EARLY.** `shUmpKf`'s `g >= 5` arming was projected **~2026-08-04**. It crossed **twice**:
**2026-07-30 (Lance Barrett, g 4→5, FIRST EVER, ~5 days ahead)** and **2026-07-31 (Willie
Traynor, SECOND, one day later)**. **What marked it:** `tests/self-arm-stamp.test.ts`'s
`ARMED.umpKf = 2` with both crossings dated in the constant's own note, backed by `data/ump_k.json`
and written at fire time by the person who must then decide whether a vintage boundary moved —
which is the whole reason M21 exists.

**AND IT IS THE EXCEPTION THAT PROVES THE RULE.** `shUmpKf` counts **real MLB games**, not our
graded rows — it is **cadence-independent**, so it kept running while every board-clocked date
stopped. That is the sharpest available statement of the coupling: **the only clock that moved is
the only one we do not drive.** It reached no board (double brake: frozen `context.json` carrier +
`umpKFrozen: true`), so nothing restates from it — but it arrived, and the rest did not.

**WHAT COULD FLIP THIS — read 2.** If the prediction store carries `src:"client"` rows for any
date after 07-26, then rows accrued without a board, **the rate is not zero**, and every row above
restates on **measured** accrual for the first time rather than on a stopped clock. That is the
second branch of item 2's pre-committed reading, and it is the same read that discriminates the
burst. **Until it returns, "STOPPED" is the honest label and "projected" is not.**

### 8A.1 WHICH RATE IS THE MEASUREMENT — RESOLVED 2026-07-31 (owner's item 2)

**35/day. Not 70.** Both derivations, printed:

- **"70 graded rows/day" (L2573)** — asserted, with **no derivation shown anywhere in the file**.
- **35/day (L3064)** — *"Recomputed from actual accrual on 2026-07-27 (`graded = 70` over the two
  complete dates 2026-07-25 and 2026-07-26)"*. **70 ÷ 2 dates = 35/date.**

**TWO INDEPENDENT INTERNAL CROSS-CHECKS SETTLE IT, both inside the same file.** (1) The per-market
`measured /day` column at L3069–73 is **exactly `n` ÷ 2** in every row — ML·RL 15→7.5, TB 9→4.5,
Hits 7→3.5, K's/Outs 5→2.5. A two-date denominator, stated by the arithmetic. (2) The per-market
`n` values **sum to 70** over those two dates (15+15+9+7+7+7+5+5). **So 70 is the TWO-DAY TOTAL and
L2573 mislabelled it as a daily rate.**

**THE ERROR'S SCOPE IS NARROWER THAN IT FIRST LOOKED, AND SAYING SO IS THE POINT.** The
consensus-reopen tables were **already derived at 35/day and are correct**. **Only the Phase-2 ICC
block used 70/day**, and only its two rows were ~2× optimistic. At 35/day from `CAL_START`
2026-07-25 the 300-row floor lands **~2026-08-03, not ~07-31** — so those two dates *were* wrong
**before the cadence failed**, and then the cadence failed on top of it. The rest were merely
stopped.

### 8A.2 THE OPTIMISTIC CASE AS A NUMBER — boards resume 2026-08-01 at one per day

Banked: **70 graded rows over 2 complete dates**; five dark days added nothing. Rate **35/day**,
per-market as measured. Board cost **62–70 credits** (midpoint 66); props **162–185/day** (~170).

| item | arithmetic | **restated date** | boards | credits (boards only) |
|---|---|---|---|---|
| **Phase-2 game ICC** | (300−70)/35 = 6.6 → **7 boards** | **2026-08-07** | 7 | **~462** |
| **Phase-2 player ICC** | same floors | **2026-08-07** | 7 | ~462 |
| ML · RL reopen | (100−15)/7.5 = 11.3 → 12 | **2026-08-12** | 12 | ~792 |
| **Phase-2 day ICC** | 20 day-clusters, 2 banked → 18 | **2026-08-18** | 18 | ~1,188 |
| 20-board crossover | 18 more boards¹ | **2026-08-18** | 18 | ~1,188 |
| Total Bases reopen | (100−9)/4.5 = 20.2 → 21 | **2026-08-21** | 21 | ~1,386 |
| Hits · HR · HRR reopen | (100−7)/3.5 = 26.6 → 27 | **2026-08-27** | 27 | ~1,782 |
| K's · Outs reopen | (100−5)/2.5 = 38 | **2026-09-07** | 38 | ~2,508 |
| `SUMMARY_DAYS` caps | 45 logged dates, 2 banked¹ | **2026-09-12** | 43 | ~2,838 |
| HRR retirement | ~09-15 + the 5 dark days | **~2026-09-20** | — | — |
| parameter exit | credit-bound, not cadence-bound | 2026-09-22 | — | **~13,500** |

¹ banked board/logged-date counts are **off-disk**; read 2 and read 3 supply them, and these two
rows restate on the real count.

### 8A.4 SUPERSEDED BY THE RESET — 2026-08-01T01:35Z, hours after 8A.3 was written

**8A.3 BELOW IS A CLOSED-PERIOD FACT AND IS KEPT AS ONE. IT IS NO LONGER THE POSITION.** The pool
is **19,958**, not 553 (§9). Repriced at ~66 credits/board and ~170/day of props:

| item | boards | credits (boards + props) | at 19,958 |
|---|---|---|---|
| Phase-2 game/player ICC (08-07) | 7 | ~1,652 | **REACHABLE** |
| ML · RL reopen (08-12) | 12 | ~2,832 | **REACHABLE** |
| Phase-2 day ICC (08-18) — the HRR amendment's gate | 18 | ~4,248 | **REACHABLE** |
| Total Bases reopen (08-21) | 21 | ~4,956 | **REACHABLE** |
| Hits · HR · HRR reopen (08-27) | 27 | ~6,372 | **REACHABLE** |
| K's · Outs reopen (09-07) | 38 | ~8,968 | **REACHABLE** |
| parameter exit (09-22) | — | ~13,500 | **REACHABLE**, ~6,458 to spare |

**THE COSTS ARE NOT ADDITIVE — the same boards serve every row — so the binding line is K's/Outs
at 38 boards ≈ 8,968, and the whole calendar fits inside 19,958. On credits alone, EVERYTHING IS
NOW REACHABLE, and props collection no longer has to stop.**

**ONE THING DECIDES WHETHER THAT HOLDS, AND IT IS §2's OPEN QUESTION.** At the observed **48.3/h**
the unattributed residual is **1,159/day**, which drains 19,958 in **~17 days — ~2026-08-18**.
Under that hypothesis only the items dated **on or before ~08-12** land: the game/player ICC and
the ML·RL reopen. The day-level ICC sits exactly on the boundary, and K's/Outs and the parameter
exit are lost. **So what spent the 146 credits is no longer a budgeting question — it is the
single determinant of the entire calendar.** That is a sharper reason to read the Vercel log than
any that existed before the reset.

**AND THE RESET DATE IS NO LONGER OFF-DISK.** §11 carried it as *"unread — owner's Odds-API
dashboard only"*. It is now **measured**: the boundary fell inside 21:04:11Z → 01:35:56Z, which
contains **2026-08-01T00:00Z**, and both period totals sum to 20,000. Treat the next reset as
**~2026-09-01T00:00Z, pending one more observation** — one boundary is a measurement, not yet a
period.

### 8A.3 ⚠️ IMPOSSIBLE BRANCH — IT FIRED AT 553 *(pre-reset; superseded by 8A.4)*

**The Phase-2 game- and player-cluster ICC needs 7 boards ≈ 462 credits. The pool is 553.**
It clears with **~91 credits of margin — but ONLY if props collection stops entirely**, because
props alone burns 162–185/day and would consume the pool in ~3 days on its own. Four things must
hold and each is nameable: **(1)** props collection off; **(2)** the 146-credit burst does not
recur (at 48.3/h it is 1,159/day and ends this inside ten hours); **(3)** the grader actually runs
— `/api/calibrate` is **unscheduled** since `vercel.json`'s `crons` array was removed, though it
costs **zero Odds credits** (statsapi + Redis), so it is a trigger, not a budget item; **(4)**
35/day holds.

**Everything else is out of reach**: the day-level ICC — the unit that decides whether 2.7σ becomes
1.1σ, and the one the HRR amendment waits on — needs **~1,188 credits of boards**, more than twice
the pool. Every consensus reopen is further still.

**WHAT THE PARAMETER EXIT WOULD NEED TO BE REACHABLE.** ~13,500 credits against 553. A reset is the
only path, and it is not sufficient by itself: **(a)** a reset must restore ≥ ~13,500 of headroom
**before 2026-09-22**, and **(b)** the unattributed residual must be closed first — at the observed
48.3/h it is **1,159/day**, which exhausts even a full 20,000-credit pool in **~17 days**, well
short of 09-22. **The reset date is unread (owner's Odds-API dashboard only).** So the exit is
reachable only on a reset *plus* a closed residual, and the residual is §2's open question.

**THE SENTENCE THAT NOW BELONGS AT THE TOP OF THE COLLECTION DOC:** *exactly one calendared item is
reachable with the credits on hand — the Phase-2 game/player ICC, at 7 boards, and only with props
collection stopped. Every other date in this document is out of reach this cycle.*

**WHAT A SHORTER OR SMALLER WINDOW WOULD HAVE TO BE — named, not designed.** To be worth running
inside ~8 boards it would have to: **(i)** answer a question whose floor is a **row** count, not a
day count — the day-clustered ICC and every 20-board bar are structurally excluded; **(ii)** accept
a **pooled** estimate, since no single market reaches 100 in eight boards; **(iii)** state its power
against the accrued `K_s` rather than assuming it; and **(iv)** carry a pre-committed reading that
survives a **stopped** clock, i.e. one whose negative branch is informative. That is the shape.
**Designing it is not authorized and is not done here.**

---

## 14. UNRESOLVED CONTRADICTIONS (both sides on disk)

1. `docs/singles-vs-parlays.md` Correction-4 tail ("the A1+A2 pair addresses M14's two halves") vs
   the same file's REFINEMENTS + bundle M14 row ("A2 innocent of M14").
2. Bundle M14 row ("A1 is THE M14 fix on this evidence") vs the narrowing ("sufficient at ≤ +1.5,
   one board") vs the shrink restatement (levels λ=0-conditional) — three altitudes, none retracted.
3. `docs/multibook-memo.md` §2 header "n=511" (kept) vs §2b's unique 362.
4. `docs/collection-period.md` "Nothing is unrecoverable" heading vs the appended EXCEPT + M18's
   data-vintage line.
5. The golden-rules "exact-sum allocator" vs the disciplined path's hard-ceilings/unallocated-
   remainder text (L3105–06) and the measured $49-of-$250 under-deployment.
6. `docs/freeze-exit-bundle.md` **L451** still reads "v2.1 restates 40 parameters / 39 chosen" —
   correctly labelled v2.1, so a dated snapshot, but a reader taking it as current gets 40 not 42.
7. **Phase-2 threshold rows** (`collection-period.md` L2577–78) read **"~2026-07-31"** for the
   game- and player-cluster thresholds — **that is today, and neither is confirmed reached.**
   Flagged, not corrected: a dated marker is owed once someone checks.
   **(ADDENDUM 2026-07-31, owner's item 2 — the marker is now owed as STOPPED, not as late.**
   Both are count-armed on graded rows at an assumed 1 board/day; the actual rate has been
   **zero since 07-26**, and `reopenDays` returns `null` — "never, at this rate" — at rate 0
   (`gate-rebuild.ts` L83–86). **§8A restates the whole calendar on the actual cadence.** The
   check itself is phrase-gated and off-disk, so **the date arrived and nothing on disk can say
   whether the threshold did** — which makes these the first calendared items whose own arrival
   is unverifiable from here. Read 2 is what flips them to measured accrual.**)**
10. **🔴 A FIFTH PROPS SNAPSHOT LANDED INSIDE A WINDOW MEASURED AS SPENDING ZERO** (found
    2026-07-31 by running `burn-report --props` against the real archive for the first time).
    `origin/line-history:data/props/2026-07-31.json` holds **FIVE** snapshots, not four:
    08:10:13Z (13 ev) · 09:34:42Z (15) · 10:19:51Z (15) · 11:04:30Z (15) — **58 event-fetches, the
    morning batch, matching §9** — **plus 20:48:14Z, `kind=close`, 14 events**, committed at
    20:48:17Z. **14 × 6 ≈ 84 credits.** But **quota reads 553 at 20:21:56Z AND 553 at 21:04:11Z**,
    a window that *contains* 20:48. **Both instruments are on disk and they disagree.** Exactly one
    of these is false: (a) that snapshot cost ~6/event; (b) the 20:21/21:04 quota reads are fresh;
    (c) it cost anything at all. Note the snapshot carries **no `src` field**, and the Vercel route
    stamps `src:"vercel"` (propsnap L44/L113) — so it was **not** the Vercel capture path.
    **CONSEQUENCES IF (b) IS THE FALSE ONE:** `tools/quota.mjs` reads through `/api/odds` **without
    `fresh=1`** (L23–24), i.e. through the 240 s Next data cache — and the whole burn series,
    including the 146, would inherit whatever staleness that introduces. **CONSEQUENCE FOR
    TOMORROW EITHER WAY: reading 26's cost bracket (delta ÷ unstarted-events ∈ [5,8]) is not
    measurable if a 14-event sweep can land without moving the quota.** Recorded, not resolved.
    Today's props total also restates from 58 to **72 event-fetches**, which the residual
    arithmetic in §2 has **not** been re-derived against.
    **(RESOLVED IN PART 2026-08-01, owner's item 1 — two of the three are now settled and the
    third is beyond reach.** (b) is **TRUE**: 20:21:56Z and 21:04:11Z are **both fresh fetches**
    by spacing (3,267 s and 2,535 s since the previous fetch, far beyond the 240 s window), so the
    flatness across 20:48 is real — §7A.1. (c) is **FALSE**: `snapshot_props.py` has one fetch
    entry point and it **always** appends `&fresh=1` (L29–30) → `cache: "no-store"` → **it paid**;
    and the snapshot carries no `src`, while the fold path stamps `"src": sn.get("src","vercel")`
    (L263), so it was a **direct python capture, not a fold**. **The write is OURS**: commit
    `77eef5d`, author **`engine-v2-bot`**, and the firing copy's `0 17 * * *` cron is documented
    in the workflow's own measured comment as landing **20:0x–20:5x on 19 of 20 days** —
    **20:48:14Z is inside that band, so item 2's FIRST branch fires and the props cost model
    absorbs it.** That leaves **(a)**: the counter did not reflect ~82 credits within 16 minutes.
    **Upstream counter lag is the surviving hypothesis, and it would make every window boundary in
    the burn series soft by the lag interval — including the 146's.** **IT CANNOT NOW BE TESTED
    FOR THIS INSTANCE: the pool reset at ~00:00Z, so the spend could only have posted inside a
    period whose last observation is the 21:04 read.** The props total stands at 72 event-fetches
    as a closed-period fact.**)**
11. **The retraction convention is enforced for FORMAT but not for REACH.**
    `tests/retraction-markers.test.ts` requires a paragraph *bearing* a marker to carry a date —
    it is keyed on the marker, so it is structurally blind to a doc asserting the withdrawn claim
    with **no marker at all**. Same blindness `fixture-citation` names in its own header. **THE
    GAP IS NOW CLOSED by `tests/retracted-claims.test.ts`** (a registry of the claims themselves,
    marker required within ±4 lines), which found two on encoding day; the gap is recorded here
    because the convention's written form still says nothing about reach.
9. **The Phase-2 accrual rate is stated two ways in one file**: L2573 reads **"at the measured 70
   graded rows/day"**, while L3064 reads **`graded = 70` over the TWO complete dates 2026-07-25
   and 2026-07-26** — i.e. **35/day**. Both are labelled "measured". At 35/day the 300-row floor
   lands **~2026-08-03**, not ~07-31. Found 2026-07-31 while restating the calendar; **recorded,
   not corrected** — resolving it needs the graded-row count, which is off-disk.
8. **Every doc describing scheduled behaviour from the working tree** — `credit-budget.md`'s job
   table and `cron-jobs.md` gained dated re-derivations, but `workflow-timing.test.ts`'s
   classification text still reads the ship branch **by design** (main's copies carry no TIMING
   blocks), which is a convention, not an error, and is stated as such in its header.

---


## 15. NOT ON DISK (missing input → how obtained)

- **WHAT SPENT 146 CREDITS** → the **Vercel function log** (dashboard-only), partially
  reading 15(c).
- **`APP_PASSCODE`'s actual state** → Vercel → Settings → Environment Variables. **Inferred, not
  read.**
- Ledger contents (the "38", HRR populations, any triplicate member) → `pl:ledger:v1` + phrase.
- Prediction-store contents → `pl:pred:*` + phrase (reading 15(c)).
- **Whether the nightly calibration fit ever MOVED** → `GET /api/calibration` (phrase, zero
  credits): per-market `n` vs `SLOPE_MIN_N = 100` / `GLOBAL_MIN_N = 150`, the current `mults` and
  `globalShrink` (the frozen vintage), `lastRun` (its date), and `weights.log`.
  **If it holds an identity, the pause froze nothing that was moving — EXPOSURE WITHOUT EFFECT,
  and the third freeze point is PRECAUTIONARY rather than corrective.** If it holds a live fit,
  **every board before today read a different calibration than tomorrow's will** and the
  homogeneous window starts 07-31, not 07-29.
- Whether `/api/propsnap` has captured on weekdays → the ungated curl (§4 read 1).
- Whether the owner's two cron-job.org edits landed → the execution log; **first real test Monday
  2026-08-03 22:45Z.**
- The reset date; the Vercel deploy list; real card stakes ever placed; `calW`/`calG` effective
  blend shares; Upstash retention → all dashboard or export only.

---


## 16. DO-NOT-REDERIVE (read, don't recompute)

- Burn series and per-day attribution → `data/quota-log.jsonl` + `tools/burn-report.mjs`. **Do not
  re-derive by hand — that is what produced the ~4× error.**
- The served-engine verification → `tools/verify-served-engine.mjs`. **Do not re-type an extractor
  — that is what produced the false mismatch.**
- The branch/firing audit, the Actions run log against the burn series, the close distribution,
  the cron-cut pricing, the citation audit, the wiring audit → `docs/branch-firing-audit.md`
  (PARTS ONE–ELEVEN).
- Shade/shrink/blend sweeps + composition → bundle + `tests/a1-shade.test.ts` /
  `a1-shrink.test.ts` / `blend-sweep.test.ts` (PL_BOARD harnesses; the 07-26 board is at
  `origin/line-history:data/boards/2026-07-26.best.json.gz`).
- Tolerance table + retraction chain; λ*-mapping (2.55–2.94); ρ-stress + pair census; clamp census
  (0.564–1.192, 19-of-22); cap ladder + Kelly-ceiling bound + stake distribution; achievable curves
  → bundle + collection-period, unchanged locations.
- M25's archive re-measurement → `tests/m25-archive.test.ts` with `PL_BOARD`.
- The test-deletion sweep → `tools/guard-diff-audit.mjs`.

---

## 17. PROTOCOL

**Josh relays paste blocks between two sessions and is NOT the operator.** No side tasks, no
explanations addressed to him, no decisions on his behalf. **Standing rules live in `CLAUDE.md` —
a POINTER to this file, never a copy.** One copy of the memory: this file. Never re-summarized
elsewhere.

**Writes stay under `/Users/josh/Documents/Parlay-Lab`.** Do not read or write Roster-Lab or
Edge-Desk, and do not let their `CLAUDE.md` files into the session.

**Josh types his own secrets.** Never enter his sync phrase, Odds API key, Claude key or
`CRON_SECRET` for him. `/api/generate` and `/api/calibrate` stay gated. **Do not upgrade any paid
plan, buy anything, or enter any secret on his behalf.**

**Work is committed and pushed only on explicit authorization.**

### FIRST ACTION AFTER COMPACTION — do this, then STOP

1. **Re-read this file and `CLAUDE.md`.**
2. **Confirm the origin sha resolves:** `frontend-rebuild` = **`50d0f7a`**, `main` = **`b1f17d2`**.
3. **Print, in this order:**
   - the **open-readings count** (§5 header states it; count it from the body, not the header),
   - the **quota reading with its timestamp**,
   - the **fire block's time in PT**,
   - **the gate.**
4. **Then stop and await the relay.** Do not measure, do not ship, do not fire a board.

**THE GATE, so it is not restated wrongly: the four reads are the gate on the board — and none has
run.** Order: **the four reads → the Vercel function log → the `APP_PASSCODE` env check → Variant B
→ the crons' landing test when they deliver → the board at 15:38 PT if the four branches allow.**
