# SESSION HANDOFF — rewritten from disk 2026-07-31 ~06:1xZ, immediately before compaction

Every line below was re-read and re-derived from disk THIS TURN. Figures that could not
be sourced this turn are marked IN-CONTEXT-ONLY-UNVERIFIED with what resolves them.
Supersedes the 2026-07-30 handoff in place; §1 flags what the last two sessions made
stale.

## ⛔ THE GATE: NO BOARD FIRES UNTIL THE RESIDUAL RESOLVES (owner's ruling, 2026-07-31)

**A board against an unexplained burn is a bet on an unknown, not a measurement.** The
cron-job.org entry stays exactly as it is; **no curl, no force, nothing fires.**
Consequences, stated rather than discovered later: **the homogeneous window stays at COUNT
ZERO (a FOURTH consecutive dark board-day), and the outs flag — live in production since
2026-07-31 02:50Z — remains UNEXERCISED on a real board.** Every pre-committed reading
re-arms for the next fire.

**STATE, 2026-07-31 14:36:08Z — quota 699 / 19,301, five consecutive zero-spend relay reads.**
The residual is REAL and robust (it survives the whole admissible cost range and cannot
vanish), but **the per-event cost is not a constant and last turn's 5.845 is REFUTED** —
the tightest value the data admits is **c ≤ 5.114**, and at that end the relay windows are
**not zero**: +3.21/h against +7.07/h in use, a factor of 2.2 rather than infinity
(`branch-firing-audit.md` §12). **Every figure is a band from here:**
| | c = 5.114 | c = 5.845 |
|---|---|---|
| burn, relay day | 239 | 185 |
| burn, in use | 332 | 296 |
| **runway at 699** | **2.1–2.9 d** | **2.4–3.8 d** |
| board cost (10–11 unstarted) | 57–62 | 64–70 |

**THREE PRECONDITIONS FOR A BOARD, all on disk** (`branch-firing-audit.md` §14): (1) the
residual is client-side — **Variant B**; (2) the propsnap store shows no weekday rows;
(3) **the calibrate pause is landed** so board 1 is not read against a calibration that
moves overnight — DONE this turn, `vercel.json`'s `crons` array removed.

**TOMORROW, Sat 2026-08-01, 15 games**: T = 0.80 is crossed at **22:15Z (0.818, 11
unstarted)**; 22:45–23:00Z reads 1.000 over 10. **THE WINDOW IS 22:15Z–23:00Z = 15:15–16:00
PT.** ⚠️ **The cron cannot do it**: entry 1 is `45 22 * * 1-5`, weekdays only, and the
Saturday entry `0 18 * * 6` lands at achievable **0.267** — engine-half only. A
composition-valid board tomorrow fires on the owner's curl inside that window.

**RUN THESE FIRST — all zero Odds credits. Order: propsnap → calibration → ledger → pred →
Variant B.** The first needs NO phrase (`/api/propsnap`'s read is ungated); the rest are yours.
```
for d in 2026-07-28 2026-07-29 2026-07-30 2026-07-31; do curl -sS "https://parlay-lab-six.vercel.app/api/propsnap?date=$d"; done   # is propsnap capturing on weekdays?
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/calibration        # HAS the nightly fit moved calW/calG? (docs/collection-period.md, top block)
```
**Then, and reading 15(c) settles the largest open question in the project:**
```
curl -sS -H "x-pl-sync: <PHRASE>" https://parlay-lab-six.vercel.app/api/ledger > ~/pl-ledger.json
curl -sS -H "x-pl-sync: <PHRASE>" "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-30" > ~/pl-pred-0730.json
curl -sS -H "x-pl-sync: <PHRASE>" "https://parlay-lab-six.vercel.app/api/predictions?date=2026-07-29" > ~/pl-pred-0729.json
```
```
node tools/ledger-report.mjs ~/pl-ledger.json            # reading 15, whole
node tools/burn-report.mjs --pred ~/pl-pred-0730.json    # reading 15(c)
```

## 0. READ-FIRST INDEX — every doc, no exceptions (guarded by `tests/read-first-index.test.ts`)

**Why it exists**: on 2026-07-31 three turns of ration tables and a "70% of the burn"
claim were produced while `credit-budget.md` — which had already measured the same job —
sat unread and unnamed here. The list was a partial index presented as complete (11 of
17 docs absent). The guard fails if any doc is missing or listed without a description.

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

## 1. SUPERSEDED — every figure the last two sessions invalidated

| ~~superseded~~ | correction | dated | doc holding the corrected figure |
|---|---|---|---|
| ~~"props sweeps ~60/day"~~ | **~198/day** — 33 event-fetches × 6 on 07-30, measured from the archive; the 60 was ONE evening window generalised to a day | 07-31 | collection-period, MIN_GAP CLEARED block |
| ~~"line-history spends 144/day"~~ | **~45/day measured** (7.5 delivered runs × 6); 144 is the SCHEDULED rate. `credit-budget.md` L39 had it at ~25/day | 07-31 | collection-period, TWO CORRECTIONS block |
| ~~"line-history has never appeared in a ration table"~~ | **FALSE** — `credit-budget.md` L176 prices it, calls what it feeds "nothing live", and L209 lists "Stop line-history.yml" as line 1 of a proposed budget | 07-31 | collection-period, TWO CORRECTIONS block |
| ~~"burn ~105/day → 9.9 sweep-days"~~ and ~~"~60/day → 17.3 days"~~ | **~476/day before the line-history disable, ~422 after → RUNWAY ~2.5 DAYS** | 07-31 | collection-period, MIN_GAP CLEARED block |
| ~~"runway 9.74 / 8.25 / 6.9 board-days"~~ (all pre-07-31) | board-days at a full slate still ~6.9 by division, but the RUNWAY IN DAYS was wrong by ~7×; every date derived from it restates | 07-31 | §9 below |
| ~~the four-cadence table for line-history (hourly/3h/6h/daily/off at ~105 base)~~ | re-priced on measured delivery; then moot — the job was DISABLED 07-31 | 07-31 | collection-period, line-history DISABLED block |
| ~~"the ~97 residual is likely the /api/clv capture path"~~ | **CLV spent ~0** — it sights only legs of today's LOCKED CARD and no card was locked; the residual restated to ~128, then to **~224/day** | 07-30 / 07-31 | collection-period, THE 200 CREDITS SPLIT |
| ~~"close_fair.py / close_capture.py consume line-history"~~ | **FALSE** — all three close tools read `data/props/`; I conflated the BRANCH with the WORKFLOW. **Nothing reads the line-history day-file** | 07-31 | collection-period, TWO CORRECTIONS block |
| ~~"the served engine is 278,267 chars / mismatched"~~ | **FALSE MISMATCH** from a defective extractor; served ≡ repo, 281,096 chars | 07-31 | collection-period, RE-GREP CONFIRMED block |
| ~~"props-history is a ten-cron (or three-cron+wait) workflow"~~ | **FOUR active crons**: `0 13`, `0 17`, `0 23`, `0 3` | 07-31 | §6 below |
| ~~"the pause disabled model.yml"~~ | **model.yml's cron reads ACTIVE** (`30 9 * * *`) in the file today | 07-31 | §6 below |
| ~~"context.yml has two crons"~~ | **THREE**: `0 17`, `30 22`, `0 12` | 07-31 | §6 below |
| ~~"the 08-15 review's shadow population = susp counts"~~ | the population is the **cfSel-stamped subset**; susp counts are ADMISSION, not selection | 07-30 | collection-period, cfSel review block |
| ~~"a no-play screen will be silent about why"~~ | **FALSE** — `BlockedPanel` (L818) and the no-play rebuild render (L800) are both UNGATED | 07-31 | collection-period, M26 block |
| ~~"shPenQFShadow returns NaN"~~ | **my probe's error** (it returns an object; `Math.min` over objects is NaN). 30 teams, 30 finite values | 07-31 | collection-period, THE NaN FINDING WAS MINE |
| ~~"props-history has FOUR crons / context has THREE / model.yml is ACTIVE"~~ (the 06:1x §6 table) | **ALL THREE WRONG — read from the non-firing branch.** Firing copy: props-history **TEN**, context **TWO**, model **PAUSED** | 07-31 | branch-firing-audit §1–2 |
| ~~"the class is EVENT-DRIVEN, not scheduled" (the 4 h 26 m flat)~~ | **UNSUPPORTED** — the run log shows ZERO Actions runs in the flat, so it discriminates nothing | 07-31 | branch-firing-audit §3 |
| ~~"GitHub delivers each cron more than once per batch"~~ | **WITHDRAWN** — ten declared, ten delivered, one-for-one on 07-28/29/30 | 07-31 | branch-firing-audit §4 |
| ~~"line-history disabled, saving ~45/day"~~ | **the disable never reached the firing copy** and the job ran through 07-30T21:53:41Z; measured delivery is **3–4 runs/day ≈ 22/day**, not 7.5 × 6. Disabled for real 07-31 (`3356c54`) | 07-31 | branch-firing-audit §2 |
| ~~"`/api/propsnap`: NO EVIDENCE, nothing it captured has ever folded"~~ | **mechanical, not evidential** — `--fold-only` only exists on the non-firing copy, so no capture *could* fold. Back on the candidate list | 07-31 | branch-firing-audit §2 |

## 2. THE OPEN QUESTION — ~224/DAY WITH NO NAMED MECHANISM

**It is larger than props, larger than anything rationed, and it ends the cycle in ~2.5
days. Both exits die on it before they die on anything measured.**

**THE SHAPE — STEPPED, NOT CONTINUOUS** (`tools/quota.mjs --series`, from
`data/quota-log.jsonl`):
| span | spent | rate |
|---|---|---|
| 07-29 12:00Z → 07-30 03:55Z | 215 | 13.5/h |
| 07-30 03:55Z → 16:45Z | 223 | 17.4/h |
| 07-30 16:45Z → 07-31 01:25Z | 200 | 23.1/h |
| **07-31 01:25Z → 04:50Z** | **0** | **0/h** |
| **07-31 04:50Z → 05:55Z** | **0** | **0/h** |
~~**4 h 26 m of exactly zero.** A scheduled job cannot produce that … **→ THE CLASS IS
EVENT-DRIVEN, NOT SCHEDULED** … the flat stretch is the night.~~
**[RETRACTED 2026-07-31, owner's item 2 — the Actions run log settles it and kills the
inference: there were ZERO Actions runs between 2026-07-30T23:35:48Z and 06:26Z. The flat
contains no scheduled delivery of any kind, so it discriminates nothing. The error was
inferring absence-of-scheduled-spend from cron DECLARATIONS instead of from the run log.
Also wrong: 01:25Z–05:55Z is 18:25–22:55 PT — evening, not night.
`docs/branch-firing-audit.md` §3.]**
**WHAT THE RUN LOG DOES SAY** (56 runs, 07-28→07-31; full table in the audit): residual
**95** / **91** / **128** credits across the three spend windows and **0** across the
flat — 314 unattributed over 37.4 h = **8.4/h ≈ 201/day**, highest at **14.8/h** during
09:45–18:25 PT. Concentrated in the PT working day, consistent with device/browser use,
**not demonstrated** — three coarse windows, and the flat had no client activity either.

**CANDIDATES AND STATUS:**
| candidate | status |
|---|---|
| **`bestBoard` fallthrough** (client generate; `credit-budget.md` L176 prices client generates at 120–240/device/day) | **LIVE, and it fits ~224/day almost exactly.** Settled at zero cost by **reading 15(c)** |
| **`SharpDesk` on the Board page** — `app/board/page.tsx` L377 mounts it unconditionally; `SharpDesk.tsx` L51–55 `useQuery(loadSharpBoard, staleTime 240_000)`; `sharpBoard.ts` L10/L135 fetches `h2h,totals,spreads × us,eu` | **UNCOUNTED SPENDER, NEW 07-31: 6 credits per Board-page open** outside a 4-minute window. In no ration table |
| **`useAllStar.ts` L77 / `ufc.ts` L84–86** | **UNCOUNTED**, client-triggered odds fetches through the proxy; `ufc` has a `fresh=1` path that bypasses the cache |
| props sweeps fetching before the gap decision | **CLEARED 07-31** — decide precedes fetch; the `/events` call at L277 costs ZERO (measured: 1,038 before and after) |
| `/api/clv` | **CLEARED** — sights only legs of today's locked card; none was locked |
| `/api/propsnap` | ~~**NO EVIDENCE**~~ → **BACK ON THE LIST, 2026-07-31.** The reason nothing carries `src: "vercel"` is MECHANICAL: the `--fold-only` tick lives only in `props-history.yml` on frontend-rebuild, the firing copy on main invokes `snapshot_props.py` **with no arguments**, so **a Vercel capture has never folded to git.** Absence of folded evidence ≠ absence of capture (`branch-firing-audit.md` §2) |
**THE UNGATED SURFACE**: `/api/odds` is ungated except `fresh=1`; `/api/propsnap`'s READ
is ungated; `/api/board` is deliberately ungated. **A warmup, health check, preview
deploy or crawler can reach the proxy, and any Board render by anything pays the
SharpDesk 6.** No allow-list, no referer check.
**WHAT WOULD SETTLE IT, in order**: (1) **reading 15(c)** — `src:"client"` rows in
`pl:pred` for 07-29/07-30, zero credits, curl above; (2) a **Vercel function-log read**
(dashboard-only, owner's screen) — per-invocation URLs are the one-read attribution;
(3) spec'd, not shipped: a one-line `console.log` per upstream call in the proxy, turning
that log into a per-request ledger.
**Impossible branch CHECKED, does not fire**: known jobs at measured rates sum to
~252/day against ~476 observed — nothing double-counted; the 2.5-day figure is not wrong
in the owner's favour.

## 3. RUN SHEET

**THE GO/NO-GO GATE (above, verbatim): no board fires until §2 resolves.**

**THE TWO PHRASE-CURLS**: `/api/ledger` and `/api/predictions?date=` — the owner types
the phrase; it never enters a script.

**THE FOUR TOOLS, by path, with what each replaces:**
| tool | replaces |
|---|---|
| `tools/quota.mjs` | the hand-run quota curl. Free read + APPEND-ONLY `data/quota-log.jsonl`; `--series` prints the burn series. **The series is now the artifact — one window can never again be generalised to a day** |
| `tools/ledger-report.mjs <saved-export.json>` | reading 15 whole: overstake vs each ticket's own `shKellyFrac` ceiling (zero floor included), the $0-ceiling census, the HRR 46.3/59.2 join, the per-field census by date. **Prints a STOP if any overstaked row carries `selMode: "ev_gated"`** |
| `tools/board-report.mjs <board.json>` | chain steps 6–8 and readings 24/25/26/29. **Prints the outs VACUITY BRANCH FIRST** |
| `tools/burn-report.mjs --props <dir> \| --pred <file>` | the burn attribution (props cost from the ARCHIVE, residual as a NAMED UNKNOWN) and reading 15(c)'s `src`×`selMode` census |
| `tools/verify-served-engine.mjs --chunk <chunk.js>` | the STEP-0 re-grep. Double anchor; reports a proper substring as an EXTRACTION DEFECT, never as a divergence |

**THE FIFTEEN CHAIN STEPS, in order** (steps 1–14 verbatim from the 07-30 run sheet;
step 15 added with operator rules #2/#3): slate count printed → the owner's go/no-go →
quota READ (`node tools/quota.mjs`) → board (cron preferred, curl fallback) → quota READ
→ `gen=list` → **echo present in the response body** (absent → the push did not land) →
**cfSel stamp on every suspended row** (absent → did not land) → `self_consistency`
(**`python3 tools/self_consistency.py`**): zero TB≥1==H≥1 violations, zero HRR legs in
built tickets, BOTH population sizes printed (zero-over-empty is not a pass) →
app-switcher double reopen → HRR rows present AND greyed → replay dump + ParlayPred
membership diff → Control C's production predictions vs the pre-commitments → ticket
count vs both pre-commits → **step 15: the legacy-mode diagnostic read, ONCE, gated on
the board being confirmed present, with the mode returned to `ev_gated` as the
immediately following action.**

**T = 0.80 AND ITS BRANCHES**: board achievable ≥ 0.80 → composition readings VALID;
below → **engine-half only** (echo, cfSel, self_consistency, greyed rows, replay+join —
no composition or cap-binding reading). Impossible: 22:00Z ≥ 0.80 (projected 0.50) →
re-derive. T is the 42nd parameter, owner-chosen before any board's number was known.

**CRON STATE AND THE OWNER'S TWO EDITS**: **header `x-cron-key` on ENTRY 1 ONLY**
(entries 2–4 stay UNHEADERED and keep 401'ing at zero cost — they are weekend-only:
Sat `0 18 * * 6`, Sun `0 17 * * 0`, Sun `30 22 * * 0`) **AND entry 1 →
`45 22 * * 1-5`.** All four call `GET /api/generate`. **Neither edit is confirmed
landed** — the 07-30 fire produced no board and branches (b) 401 and (d) no-execution are
indistinguishable from this repo; the cron-job.org execution log is the owner's
distinguisher. **The four 200-without-a-board bodies to match it against**:
`{"ok":true,"skipped":"ran recently"}` (45-min limiter, L127) · `{"ok":true,"skipped":
"dead-slate",…}` (board-store L161) · the good-board skip's `low-ceiling` /
`no-games-left` / `covered` / `thin` (L169–180) · and the only post-spend one,
`{"ok":true,"date":…,"logged":0,"note":"no pregame picks (off day or slate underway)"}`
(L387). A 401 body is `{"error":"unauthorized"}`. **No run slot was consumed for 07-30**
(`INCR` sits past every free exit).

**THE PLACEMENT CHECKLIST — what the owner checks before placing a slip** (full text:
collection-period, THE PLACEMENT CHECKLIST). In order; any single failure is a STOP for
that ticket, items 1 and 5 are stops for the whole card:
1. **`pl_selmode` reads `ev_gated`**, verified as the LAST action before placing.
2. **No single slip above 2% of bankroll = $50 at $2,500.**
3. **Stake vs its own displayed Kelly — if stake > kelly, the ticket is NOT placed**,
   regardless of what the card says.
4. **A missing Kelly badge combined with a stake at the structural cap** → back to item 1
   (that combination is the signature of a ceiling-free mode).
5. **The card's mode provenance** — the board is built server-side in `ev_gated`; the
   card is computed on the device in the DEVICE's mode.
**Pre-committed**: any ticket exceeding its own displayed Kelly → **not placed**, and
recorded as a DISCIPLINED-MODE overstake, which would **contradict the measured 1.00× on
all six disciplined tickets** and become an M-item that outranks the card. Empty card →
**NO-PLAY with a printed cause** (BlockedPanel and the rebuild note are both ungated).

## 4. OPEN PRE-COMMITTED READINGS (verbatim; COUNT: 29)

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

## 5. GIT AND ARTIFACT STATE

- **Branch `frontend-rebuild`: origin head `17a68ee`**
  (`17a68ee357ab9b0eeb6708423b4df61d40cabb79`, verified by `git ls-remote` this turn).
  **Working tree clean, nothing held** — `git status -sb` reads
  `## frontend-rebuild...origin/frontend-rebuild` with no ahead/behind.
- **main: `3356c54`** (`3356c547b77dc51d5474dc51982f9f1f14829b0d`, 2026-07-31 — the
  line-history schedule disable, cherry-picked; was `53d0076`). **main deploys nowhere on
  Vercel** (`vercel.json` `main: false`) **but it is the branch every scheduled workflow
  fires from** (`origin/HEAD → main`) — see §6 and `branch-firing-audit.md`. It is 326
  commits behind `frontend-rebuild` and has only ever been updated by hand.
- **Served artifact: chunk `256-7cc559a830020345.js`** (renamed from
  `256-171aff5d10da160d.js`, which is itself the evidence the deploy landed). Engine
  string **281,096 chars**, sha256
  **`b862b2b2c59532a4df598f93959512c073bc04d93cb76a8c436f38b582ea3867`** —
  **byte-identical to the repo, verified 2026-07-31 ~04:5xZ** with
  `tools/verify-served-engine.mjs` (exit 0, MATCH).
- **THE OUTS FLAG IS SHIPPED AND LIVE IN PRODUCTION** (four functional edits verified
  present in the served bytes) **AND UNEXERCISED ON A REAL BOARD** — no board has fired
  since it deployed.
- **PENDING-LIVE-VERIFICATION: RESOLVED** — `tests/served-verification.json` reads
  `pending: false`, `since: 2026-07-31T04:55:00Z`, with the confirmation in its note.
  The guard goes green ON RESOLUTION, not on removal (with `pending:false` it also
  requires committed === served; deleting the file makes it throw).
- **The two model files are NOT gitignored and never were**: tracked, bot-committed;
  the pause-time pair is priors
  `00994434be42196b67233ed1663ded2f0651b863434f537cd611da108ca0374e` / context
  `2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80`.
- **THE BOT PAUSE — WHAT IT ACTUALLY FROZE**: it dropped `public/model/context.json`
  from `context.yml`'s `git add` (so the context artifact is frozen at `64c42ad`,
  2026-07-29 20:32Z) and **`data/ump_k.json` keeps accruing by design**.
  ~~**⚠️ `model.yml`'s cron reads ACTIVE in the file today (`30 9 * * *`)** … resolved by
  `git log origin/main -- public/model/priors.json`.~~ **[CORRECTED 2026-07-31 — I read
  the NON-FIRING copy. On `origin/main`, model.yml's schedule is COMMENTED OUT: the pause
  is IN FORCE. The query named was also wrong — the bot commits to `frontend-rebuild`, so
  main would show no priors.json history either way. The right query,
  `git log origin/frontend-rebuild -- public/model/priors.json`, gives the answer:
  **priors last written `671aed9` 2026-07-29T15:58:41Z, context last `64c42ad`
  2026-07-29T20:32:00Z, NOTHING SINCE.** Both writers stopped; the homogeneous data
  vintage is intact.]**
- `data/ump_k.json` crossed its self-arm threshold on 2026-07-30 (**Lance Barrett, g 4→5
  — the first umpire ever**), double-braked by the frozen carrier and
  `SH_CFG.umpKFrozen: true`; pinned by `tests/self-arm-stamp.test.ts`.

## 6. JOB INVENTORY — **REPLACED 2026-07-31: THE FIRING COPIES ON `origin/main`**

> ⚠️ **THE 2026-07-31 06:1x TABLE WAS DERIVED FROM THE WORKING TREE — i.e. from
> `frontend-rebuild`, WHICH FIRES NOTHING. Every row of it was wrong about what runs, and
> in both directions: it called "ten-cron" wrong (it is right), called "two crons" wrong
> (it is right), and called the pause contradicted (it is in force).** Schedules fire only
> from the default branch (`origin/HEAD → main`). Full audit: `branch-firing-audit.md`.

| workflow (**on `origin/main`**) | active crons (UTC) | reaches Odds API | observed | ceiling |
|---|---|---|---|---|
| `props-history.yml` | **FOUR since 2026-07-31 (`7bfb6b3`)**: `0 17`, `0 20`, `0 21`, `30 22` — cut from ten, chosen from the archive (all 7 closes came from the `0 20`/`0 21` bands; the seven queued crons produced 0 closes and 72% of the spend) | YES | ~339 (07-31) / ~198 (07-30) | **~185/day** at 31.6 ev × 5.84 |
| `board-archive.yml` | `0 12`, `0 19` | reads `/api/board` only | **0** | 0 |
| `context.yml` | **TWO**: `0 17`, `30 22` (the `0 12` weekend cron is frontend-rebuild-only → **NEVER FIRED**) | no | 0 | 0 |
| `model.yml` | **NONE — PAUSED and IN FORCE** (`a46c1f8`) | no | 0 | 0 |
| `hr-overround.yml` | `0 15 * * 0` | no | 0 | 0 |
| `line-history.yml` | **NONE — disabled on the FIRING copy 2026-07-31 (`3356c54`)**; was `12 * * * *` and delivering 3–4 runs/day through 07-30 | (was YES) | ~22/day until tonight | was **144/day** (no gap guard in `snapshot_odds.py`) |
| `ufc.yml` | **ABSENT FROM main — HAS NEVER FIRED** | no | 0 | 0 |
| `pages-build-deployment` | GitHub built-in, `event: dynamic`, 5 runs | no (runs no repo code) | **0** | 0 — but **in no inventory until now**, and its 07-30T03:03:28Z trigger is unexplained |
**Routes reaching the Odds API**: `/api/odds` (proxy; `APP_PASSCODE` gates `fresh=1`
only) · `/api/generate` (`cronHeaderAuthed`/`syncAuthed`) · `/api/clv` (`syncAuthed`) ·
`/api/propsnap` (write gated, **READ UNGATED**).
**Client-side proxy callers (none in any ration table)**: `src/engine2/sharpBoard.ts`,
`src/lib/useAllStar.ts`, `src/lib/ufc.ts`, `src/lib/fetcher.ts`.
~~**Archive-vs-schedule discrepancy (impossible branch, FIRES)**: the workflow declares 4
crons … GitHub delivers each cron more than once per batch~~ **[WITHDRAWN 2026-07-31 —
the firing copy declares TEN, and the run log shows TEN delivered on 07-28, 07-29 and
07-30. One-for-one. Nothing is delivered twice; MIN_GAP dedupes the PAYMENT, which is the
mechanism working as documented.]**
**⚠️ SCRIPT vs YML**: every workflow on main pulls its script from
`origin/frontend-rebuild` at run time and `tools/` does not exist on main at all — so
**script-level changes are LIVE on push** (MIN_GAP proved it: 10 runs → 5 paid) and **only
yml-level things can be stale** (schedules, concurrency, checkout targets, **step
arguments**, timeouts). Guarded by `tests/workflow-branch-sync.test.ts`, **RED right now**
on seven files with an empty allow-list.

## 7. FROZEN TABLE, CENSUS, AND THE FOUR JUSTIFICATIONS

**Census v2.3: 42 parameters / 0 fitted / 41 chosen (12 with no stated rationale) / 1
stated-arithmetic; 9 since-measured.** (Sourced from collection-period; note the same doc
carries an earlier v1 line reading "38 CHOSEN (11 …)" at L16 — the v2.3 block supersedes
it and says so.)
**Unmeasured-with-measured-consequence**: `coreEvMin` (self-graded sweep) · damping 0.5
(40 bp range) · `SH_W` (sweep self-graded by construction) · the 1/n cap relax
(10%/5%/3.33%/2.5% ladder; Kelly ceilings bound n=1 at ≤ ~8%) · **`umpKFrozen`** (replay
07-30: 8 of 18 K/outs rows move, max 16 pp, and the emitted card CHANGES) ·
**`penQFrozen`** (M23: 16 of 173 rows move, max 15.1 pp, card identical).
**Operator rules** (NOT engine parameters): **#1** no slip above 2% ($50 at $2,500) ·
**#2** step 15 is diagnostic only, mode returns to `ev_gated` as the last action before
placing · **#3** no legacy mode opened at all until M24 resolves.
**THE FOUR JUSTIFICATIONS RESTING ON MECHANISM:**
| # | claim | status |
|---|---|---|
| 1 | the reopen deadline's premise "weakened because accrual was zero" | **UNRUN** — a `mktN` read settles it (reading 29, now on the board via the echo). Zero credits. Nothing ships on it |
| 2 | M6's consequence for ticket quality | **UNREACHABLE this cycle** — needs a board and a ship. Demoted to reasoning, dated 07-31 |
| 3 | M16's "damping 0.5 doesn't compensate" | **UNREACHABLE STRUCTURALLY** — needs an evaluator that prices across-ticket dependence, **which does not exist**; the ρ-stress harness prices dependence at a STATED ρ and cannot tell us what ρ is. **The damping row carries the marker until such an instrument is built.** Gates the frozen table |
| 4 | the 08-15 review's premise (46.3/59.2) | **UNRUN, NOT UNRESOLVABLE** — the ledger export settles it and costs only the phrase |

## 8. INSTRUMENT LEDGER

- **Exact E[ln] evaluator** (`growth`, 2^n at chosen stakes): sees chosen-stake
  outcomes under a stated belief; BLIND to across-ticket dependence (product measure
  over tickets — M16) and to its own belief's error (self-grading). Carries: M14
  sweeps/controls, A1 levels+floor (now λ=0-conditional), damping, coreEvMin
  withdrawal.
- **Eval-only vs in-loop**: eval-only = selection-on-belief, evaluation-on-truth →
  THE tolerance instrument (crossings prob −3.2 / EV −4.3, interpolated; perParlayCap
  bound the EV card's $62 top). In-loop = the SHADED belief reaches the gate —
  an omniscient gate; design results only (the abstention finding retracted).
- **Shrink-to-market (λ)**: sees edge-proportional overconfidence (selection-on-edge
  — killed the +60.6 as operative); BLIND to truth beyond the market (λ ≤ 1 cannot
  represent below-market truth — HRR's −12.9 needs λ = 2.55–2.94, outside the axis).
- **Uniform shade**: location shifts only; structurally blind to selection-on-edge.
- **Blend sweep**: self-graded BY CONSTRUCTION (the evaluation prob amplifies with
  the parameter under test) — can neither withdraw nor vindicate `SH_W`; its
  by-products stand (s=0.15 convergence; the exit reads `pModel`, unnarrowed).
- **ρ-stress (game-factor copula, 40k seeded, validated at ρ=0 ≤10 bp)**: sees
  across-ticket same-game dependence at stated ρ. Carries: M16's magnitude, A1's
  ρ-robustness, the blend peak's ρ-robustness (pairs don't grow with the peak).
- **simJoint**: within-ticket same-game only; 22/25 groups on 07-26; BLIND to K's
  groups (M6 — the M19 triplicate's cause) and everything across tickets; clamp
  0.25–4× never bound (19 observable ratios, 3 undefined ≠ unbinding).
- **The replay** (shAllocate determinism, byte-identical): reconstructs allocation
  from the persisted pool; blind to anything never persisted (real card stakes).
- **The sha re-grep**: the client engine string only; the server bundle is
  unreadable from outside — the ECHO closes that half (engineSha + config +
  priors/ctx hashes in every response/board).
- **The withdrawn guard** (`luPct ≥ achievable − ε`): a feed-lag detector — luPct is
  data (lu flags), achievable is schedule (FP−3h): not an identity, but blind to
  early generation (both go to 0 together); replaced by `achievable ≥ T`, T = 0.80.
- **The free quota read** (`/v4/sports` through the odds proxy): exact, zero
  credits, headers passed (route L51–55).
- **`tools/verify-served-engine.mjs`** (NEW 07-31): sees the served engine string via a
  DOUBLE ANCHOR (the facade call `)(r,'` + the engine's escaped opening bytes, both
  unique); blind to the server bundle (only the echo closes that). Reports a proper
  substring as an EXTRACTION DEFECT, never as a divergence.
- **The four chain tools** (`quota` / `ledger-report` / `board-report` / `burn-report`,
  NEW 07-31): see what the prose steps saw, but leave an artifact. `quota.mjs`'s
  append-only log makes the burn a SERIES rather than two point reads.

**⚠️ THE CHAIN IS A CHECKLIST, NOT AN INSTRUMENT SUITE: 3 of 15 steps are versioned
tools, 12 are prose.** Prose steps whose output OTHER numbers depend on — the class that
matters — are the quota read, readings 15, 15(c), 29 and 26, and the three landing
verdicts (steps 7, 8, 25). Steps 1, 2, 4, 10, 11, 15 are tasks, not instruments.
**FIVE INSTRUMENT DEFECTS, all found by an instrument doing its job badly rather than by
a model error**: (1) the cfSel spec's vacuity; (2) the lineup guard's wrong direction;
(3) the scope-by-diff comparator's header/code disagreement; (4) the line-number-keyed
site ids; (5) the served extractor's false mismatch (278,267 vs 281,096 — a 1% miss, the
first PLAUSIBLE one). **The pattern is explicit: in this project instruments fail more
often than analyses, and they fail by returning plausible numbers.**

## 9. POSITION

- **Quota: READ 699 remaining / 19,301 used — 2026-07-31 13:57:11Z** (`data/quota-log.jsonl`,
  live read this turn). ~~1,038 at 05:55:44Z~~ — **339 credits spent between 06:41:11Z and
  13:57:11Z (7 h 16 m, 46.6/h), and it is FULLY ATTRIBUTED**: props-history's morning batch,
  8 delivered runs → **4 PAID snapshots / 58 event-fetches** on `data/props/2026-07-31.json`.
  Modelled 348 against 339 measured → **5.84 credits per event, the 6-per-event model confirmed**,
  and the **residual in that window is ≈ 0 (−9)**.
- **TWO NATURAL EXPERIMENTS, 12 h 32 m of no device use, residual ZERO in both** (01:25Z→06:41Z:
  no runs, no spend; 06:41Z→13:57Z: 9 runs, spend fully attributed). Against 8.4/h of residual on
  days the app was used. Observational, not controlled — `board-open-experiment.md` is what makes
  it controlled.
- **Burn**: props ~198 (07-30) but **339 on 07-31 BEFORE NOON** · line-history now 0 ·
  residual ~201/day on use-days, **~0 on relay-days**. ⚠️ Every runway/burn figure written
  before 2026-07-31 is superseded (§1).
- **RUNWAY AT 699 — TWO NUMBERS, and the ceiling is the one that binds**: at the observed
  ~421/day, **1.66 days**; at the props CEILING (7 MIN_GAP-admitted paid snapshots × 15
  events × 5.84 ≈ **615/day**, + residual) **~816/day → 0.86 DAYS**. **615/day against 699
  remaining is a bad night, not a bad week** — one fully-delivered day inside the current
  ten-cron declaration ends the cycle, and today already spent 339 by 11:04Z.
- **The reversible lever, priced, not taken** (`branch-firing-audit.md` §7): cutting main's
  ten crons to five/four/three gives ceilings ~440/~352/~264 → runway **1.09 / 1.26 / 1.50
  days**. Same ceiling as the never-executed redesign, none of its risk.
  `credit-budget.md` L175's ≤192 is **3.2× below** the real ceiling — corrected in place.
- **Board-days: 1,038 / 150 = 6.9** at a full slate, ~17 at an evening 6-event board's
  ~60 — but the RUNWAY IN DAYS, not the board count, is what binds.
- **Homogeneous window: COUNT ZERO.** 07-29, 07-30 and 07-31 all produced no board —
  **three consecutive dark board-days.**
- **Both exits: UNREACHABLE THIS CYCLE WITHOUT A RESET.** The parameter exit needs
  ~13.5k credits to 09-22 against 1,038; the bankroll exit needs per-market settled-leg
  volume (12-pp ≈ 35–40 board-days, 3-pp ≈ 100+) and its test is POOLED, so one market's
  miss is maskable. **The reset date remains unread — owner's Odds-API dashboard only.**

## 10. UNRESOLVED CONTRADICTIONS (both sides on disk)

1. `docs/singles-vs-parlays.md` Correction-4 tail ("the A1+A2 pair addresses M14's
   two halves") vs the same file's REFINEMENTS + bundle M14 row ("A2 innocent of
   M14").
2. Bundle M14 row L142 ("A1 is THE M14 fix on this evidence") vs the narrowing
   ("sufficient at ≤ +1.5, one board") vs the shrink restatement (levels
   λ=0-conditional) — three altitudes of the same claim, none retracted.
3. `docs/multibook-memo.md` §2 header "n=511" (kept) vs §2b's unique 362.
4. `docs/collection-period.md` "Nothing is unrecoverable" heading vs the appended
   EXCEPT + M18's data-vintage line.
5. The golden-rules "exact-sum allocator" (locked product rule) vs the disciplined
   path's hard-ceilings/unallocated-remainder text (L3105–06) and the measured
   $49-of-$250 under-deployment — design supersession never reconciled in the
   golden-rules text.
6. ~~`docs/collection-period.md` L16 ("38 CHOSEN (11 …)") vs the v2.3 census block~~
   **RESOLVED 2026-07-31, owner's item 5** — headline struck with a SUPERSEDED marker; the
   BORN-provenance table gained its three missing rows (`simJoint` clamp → no-rationale
   12; the 1/n relax and T = 0.80 → rationale-in-comments 29); **table sum now 0+1+29+12+0
   = 42**, agreeing with the prose. The table had the worse defect — it never gained the
   rows at all, which is an omission, not an amendment. Still open, PRINTED NOT EDITED:
   `docs/freeze-exit-bundle.md` **L451** carries "v2.1 restates 40 parameters / 39 chosen
   (12 …)" — correctly labelled v2.1, so a dated snapshot rather than a stale assertion,
   but any reader taking it as current gets 40 instead of 42.
7. ~~This doc's pause description vs `model.yml`'s ACTIVE `schedule:` block~~
   **RESOLVED 2026-07-31 — the DOC was wrong, not the pause.** I read the copy on
   `frontend-rebuild`, which fires nothing. On `origin/main` the schedule is commented
   out and both writers stopped on 07-29 (§5). **The generalisation is contradiction 8.**
8. **NEW 2026-07-31 — every claim in this doc about anything on a clock was derived from
   the non-firing branch.** §6 is replaced; `credit-budget.md`'s job table, `cron-jobs.md`
   and `tests/workflow-timing.test.ts` (which reads `.github/workflows` from the working
   tree, L32–33 — **instrument defect #6**) all still describe frontend-rebuild's copies.
   Resolving instrument: `tests/workflow-branch-sync.test.ts`, **RED right now** on seven
   files.

## 11. NOT ON DISK (missing input → how obtained)

- Ledger contents (the "38", HRR populations, any triplicate member): `pl:ledger:v1`
  + sync phrase → the export curls (collection-period).
- Prediction-store contents pre-07-30: `pl:pred:*` + sync phrase → the join curl.
- The reset date: owner's Odds-API dashboard only.
- Vercel deploy list: dashboard only; the served artifact + the echo are the outside
  evidence.
- Real card stakes ever placed: the ledger export only (allocation never persisted;
  archived `stake` fields are display tiers).
- calW/calG effective blend shares per market: `pl:cal:weights` (server) — the echo
  does not yet carry them (noted in the bundle).
- Whether Josh's two cron-job.org edits landed: the 22:45Z fire itself (branch (d)).
- Upstash retention policy: dashboard.
- **Which spender accounts for ~224/day**: `pl:pred` `src:"client"` census (reading
  15(c), phrase) and the Vercel function log (dashboard).
- **Whether the owner's two cron-job.org edits landed**: the cron-job.org execution log
  (owner's screen) — the repo cannot distinguish a 401 from a non-execution.

## 12. DO-NOT-REDERIVE (read, don't recompute)

- Shade/shrink/blend sweeps, the full grids + composition: bundle (FULL GRID,
  SHRINK, BLEND blocks) + `tests/a1-shade.test.ts` / `a1-shrink.test.ts` /
  `blend-sweep.test.ts` (PL_BOARD harnesses; the 07-26 fixture regenerates from
  `origin/line-history` `data/boards/`).
- Tolerance table + retraction chain: bundle (one table, dated markers).
- λ*-mapping (2.55–2.94, mean gaps +6.66/+8.30): bundle + hrr-recalibration.
- ρ-stress + pair census + truth-proxy table (per share): bundle.
- Clamp census (0.564–1.192, 19-of-22): bundle.
- Cap ladder (10/5/3.33/2.5), Kelly-ceiling bound ($200/8%), stake distribution
  (max $62 = 2.48%), binding census (3/6/51), under-deployment ($49/$250):
  collection-period item-1/2 blocks (07-30 late).
- Achievable curves (07-26 hourly; 07-30 15-min) + the retro guard pass
  (0.857/0.857): collection-period T block.
- The 200-seed adoption family, reconciliation, A1 percentiles, M14 controls,
  coreEvMin/damping sweeps, M15/M13 populations, provenance census history, M16
  per-pair, M19 census, placeability: bundle + memo + collection-period (as in the
  07-29 handoff — unchanged locations).
- force-flag audit (three bypasses), trigger-mark rationale: collection-period +
  `tests/trigger-mark.test.ts` header.
- Burn series and per-day attribution: `data/quota-log.jsonl` + `tools/burn-report.mjs`
  (do not re-derive by hand — that is what produced the ~4× error).
- The served-engine verification: `tools/verify-served-engine.mjs` (do not re-type an
  extractor — that is what produced the false mismatch).

## 13. PROTOCOL

Josh relays paste blocks between two sessions and is not the operator — no side tasks, no
explanations addressed to him, no decisions on his behalf. Standing rules live in
`CLAUDE.md` (pointer, not copy).

**First action after compaction: re-read this file and `CLAUDE.md`, confirm the origin
sha resolves (`git ls-remote origin refs/heads/frontend-rebuild` → `17a68ee`), then
print — (1) the open-readings count (29), (2) the quota reading with its timestamp
(1,038 / 18,962 at 2026-07-31 05:55:44Z), and (3) the go/no-go gate (NO BOARD FIRES until
the ~224/day resolves; reading 15(c) first). Then STOP.**
