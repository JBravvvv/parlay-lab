# SESSION HANDOFF — rewritten from disk 2026-07-31 ~21:1xZ, immediately before compaction

Every line below was re-read and re-derived from disk THIS TURN. Figures that could not be
sourced this turn are marked **IN-CONTEXT-ONLY-UNVERIFIED** with what resolves them. Supersedes
the ~06:1xZ rewrite in place; §0's stale-flags list what this session invalidated.

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

**THE FOUR READS, IN ORDER — all zero Odds credits. Variant B is SUSPENDED** (its 12 credits
measure a billing constant while 146 are unaccounted for).

```
# 1. propsnap store — UNGATED, no phrase needed. Is it capturing on WEEKDAYS?
for d in 2026-07-28 2026-07-29 2026-07-30 2026-07-31; do
  curl -sS "https://parlay-lab-six.vercel.app/api/propsnap?date=$d"; echo; done

# 2. reading 15(c) — src:"client" rows separate a client GENERATE from a poll
curl -sS -H "x-pl-sync: <PHRASE>" "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-30" > ~/pl-pred-0730.json
node tools/burn-report.mjs --pred ~/pl-pred-0730.json

# 3. /api/calibration — HAS the nightly fit ever moved calW/calG?
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/calibration

# 4. the ledger export — reading 15 whole
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/ledger > ~/pl-ledger.json
node tools/ledger-report.mjs ~/pl-ledger.json
```
**Then the Vercel function log and the `APP_PASSCODE` env check.**

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

## 7. INSTRUMENT LEDGER

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

## 8. FROZEN TABLE, CENSUS, AND PROVENANCE

**Census v2.3: 42 parameters / 0 fitted / 41 chosen (12 with no stated rationale) / 1
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

## 9. POSITION

- **Quota: 553 remaining / 19,447 used — 2026-07-31T21:04:11.529Z** (`data/quota-log.jsonl`, live
  read this turn). **Flat across seven reads spanning 1 h 53 m.**
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

## 10. UNRESOLVED CONTRADICTIONS (both sides on disk)

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
8. **Every doc describing scheduled behaviour from the working tree** — `credit-budget.md`'s job
   table and `cron-jobs.md` gained dated re-derivations, but `workflow-timing.test.ts`'s
   classification text still reads the ship branch **by design** (main's copies carry no TIMING
   blocks), which is a convention, not an error, and is stated as such in its header.

---

## 11. NOT ON DISK (missing input → how obtained)

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

## 12. DO-NOT-REDERIVE (read, don't recompute)

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

## 13. PROTOCOL

Josh relays paste blocks between two sessions and **is not the operator** — no side tasks, no
explanations addressed to him, no decisions on his behalf. **Standing rules live in `CLAUDE.md`
(pointer, not copy).** Writes stay under `/Users/josh/Documents/Parlay-Lab`.

**FIRST ACTION AFTER COMPACTION: re-read this file and `CLAUDE.md`, confirm the origin sha
resolves (`git ls-remote origin refs/heads/frontend-rebuild` → `0b65964`), then print —
(1) the open-readings count (**29**), (2) the quota reading with its timestamp (**553 / 19,447 at
2026-07-31T21:04:11.529Z**), (3) the fire block's time in PT (**15:38 PT, Sat 2026-08-01**), and
(4) the gate (**NO BOARD until the 146-credit burst resolves; and if the Vercel log shows an
external caller, no board until M28's passcode helper ships**). Then STOP.**
