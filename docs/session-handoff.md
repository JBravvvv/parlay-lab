# SESSION HANDOFF — brought current 2026-07-30 (~04:3xZ), immediately before compaction

Purpose: tomorrow's entire chain, on disk. Every line re-sourced from the docs this
turn; figures not sourceable are marked IN-CONTEXT-ONLY-UNVERIFIED with what resolves
them. Supersedes the 2026-07-29 handoff in place; §1 flags what that version got stale.

## 1. STALE-ON-ARRIVAL (lines of the 07-29 handoff this session corrected/superseded)

- ~~"Pushed head at handoff: 1617d1b; HELD: 465b85a, 7ac2a4a, 2469ad0 + this file"~~ —
  STALE: everything through `4c036ba` is PUSHED (two ship pushes: `1617d1b..9753fb9`
  stack+cfSel+echo; `9753fb9..4c036ba` docs+trigger mark); held = `e4e7bd1` + this
  file's commit. §4 below.
- ~~the chain table (step 0 MIN_GAP landing / 0b cfSel sign-off / Wednesday order)~~ —
  STALE: cfSel + the sha/config echo SHIPPED and pushed; MIN_GAP's landing test was
  CONSUMED by the concurrency fix (its landing test is now the 08:02–08:07Z window);
  the Wednesday order was overtaken by the 07-29 NO-BOARD DAY (0 of 16 unstarted at
  02:14Z; slot not spent) — the chain moved to the 07-30 run sheet, §2.
- ~~spec-only queue rows: MIN_GAP (landing pending) / cfSel (sign-off) / sha+config
  echo (own sign-off) / outs flag (go/no-go)~~ — STALE: first three shipped; outs
  DECIDED (flag deploys Thursday evening; `docs/pitcher-outs-audit.md` DECIDED).
- The alleged M17/M18 corrections (owner's 07-30 items 2–3): **NO correction was
  needed** — the gitignored/unversioned premise died on three printed queries
  (`check-ignore` exit 1; `ls-files` both tracked; bot commits ON the JSON) —
  `docs/collection-period.md`, THE UNVERSIONED-INPUTS PREMISE block.
- ~~"abstention is the boundary" (in-loop tolerance)~~ — RETRACTED 2026-07-29 late:
  the in-loop shade fed the SHADED est to the admission gate (omniscient gate); the
  EVAL-ONLY run is the tolerance instrument — bundle, tolerance table + its dated
  markers.
- ~~the in-loop ≈−5.4 crossings and the 2.4× exceedance ratio~~ — STRUCK (the grid
  extension first, then the retraction above); the standing crossings are eval-only
  **prob −3.2 / EV −4.3 pp, interpolated** — bundle.
- ~~the lineup guard `luPct ≥ achievable − ε`~~ — WITHDRAWN as the lineup guard
  (detects feed-lag, not early generation; not an identity — the inputs differ);
  replaced by the spec'd `gen.achievable ≥ T` with **T = 0.80 set by the owner** —
  collection-period.
- The pause's justification RESTATED: the bot IS the committed data-vintage writer
  (premise-death queries above); the pause stands as governance with that recorded —
  collection-period, pause block.
- ~~"A1's operative argument = the +60.6 level"~~ — the level and floor are
  **λ=0-conditional** after the shrink test (edge-fragile, crossing λ≈0.74); A1's
  case = restored monotonicity + penalty removal — bundle SHRINK block, memo lead.
- ~~handoff §5 items 1 (MIN_GAP landing wording) and 10 (outs ICOU)~~ — 1 superseded
  (fix's landing test), 10 DISCHARGED (owner re-issued on the record, marker dated).

## 2. TOMORROW'S RUN SHEET (2026-07-30 PT — execute from here)

**Deadlines (both Thursday 07-30 PT, different gates):**
1. **3:30 PM PT — the owner's ONE cron-job.org visit**: header `x-cron-key` on
   entries 1–4 AND entry 1 → `45 22 * * 1-5`. Gates the verification board (fires
   22:45Z = 3:45 PM PT, achievable 0.833, cost PROJECTED ~55–60 at 6 events).
   (2:45 PM PT was the cutoff for an unmoved 22:00Z entry — superseded by the move.)
2. **Thursday EVENING, after the board's readings — the outs flag deploys**
   (regardless of any board reading; both branches pre-committed;
   `docs/pitcher-outs-audit.md` DECIDED). Gates Friday's K's/outs reopen (07-31
   expiry). Deploying before the cron would put a second engine change on the first
   verified board — evening, not earlier.

**Cron failure branches (collection-period, the owner's item 5)**: (a) fires 22:45Z
with header → the chain runs on its board — no curl, no force; (b) 401 → **curl
3:40–4:05 PM PT** on the owner's go/no-go, slate count printed first, NO force
(a 401'd cron sets no lastRun; protections pass naturally); (c) board empty/malformed
→ report the response and STOP — no second slot; (d) no fire → cron-job.org fact,
owner's check; (e) impossible: two boards → old entry didn't clear — print both; the
chain reads the 22:45Z board (`latest` wins), ONE board-day. Slate <6 by 22:45Z →
board covers the unstarted remainder, count printed; zero → THIRD no-board day.
**force ruling**: bypasses THREE protections (rate cap, good-board skip, DEAD-SLATE
refusal); OFF tomorrow; a second board after a T-fail requires it and is OFF absent
the owner's explicit in-the-moment authorization. Curl-after-cron-success returns
`{skipped}` — free, safe.

**The fourteen steps, in order (collection-period, TOMORROW'S ORDER)**: slate count
printed → the owner's go/no-go → quota READ (free: `/v4/sports` via the odds proxy,
headers passed) → board (cron preferred, curl fallback) → quota READ → `gen=list` →
**echo present in the response body** (absent → the push did not land) → **cfSel
stamp on every suspended row** (absent → did not land) → `self_consistency`: zero
TB≥1==H≥1 violations, zero HRR legs in built tickets, BOTH population sizes printed
(zero-over-empty is not a pass) → app-switcher double reopen → HRR rows present AND
greyed → replay dump + ParlayPred membership diff → Control C's production
predictions vs the pre-commitments → ticket count vs both pre-commits.
**T = 0.80**: 22:45Z board achievable ≥ 0.80 → composition readings VALID; below →
**engine-half only** (echo, cfSel, self_consistency, greyed rows, replay+join — no
composition or cap-binding reading). **Trigger-mark landing**: the board carries
`gen.trigger === "header"` or the mark did not land.
**Control C's numbers (CLAUDE.md STEP-8 pre-commit)**: IF the cap binds, the
prob-ranked 6 forgoes **≥ 30 bp** E[ln] vs the same pool's EV-ranked 6, and displaced
rank-7+ tickets carry HIGHER czEv than entrants (07-26 signature: entrants ~**2–4%
czEv / ≥63% prob** vs displaced ~**7%**). Cap binds + displaced-higher-EV → M14
confirmed in production; cap does not bind → M14 unobserved, sweep stays archival.
**Clear-count readings**: 0 clear → `coreEvMin=2` is the binding gate (print
blocked-reason counts); card at 6 → cap binding, M14 live, record ranks 7+;
**1–5 → the blocked-reason HISTOGRAM over all pool tickets IS the reading, modal
reason named** — and a non-binding cap is NOT evidence against M14.
**HRR four counts, separate readings**: (1) rows PRESENT (absent → THIRD vacuity,
reopen did not happen, 08-15 population restarts); (2) rows GREYED; (3) shadow rows
`susp:true` AND cfSel-stamped; (4) HRR legs in tickets = ZERO (any >0 → hrrAltMax not
reaching the server path — M-item same day). All four → the suspension verified
end-to-end for the first time.
**08:02–08:07Z landing test (the concurrency fix's)**: ONE paid + N−1 skips + no
rejected push → landed; two+ paid OR any rejected push → NOT landed, MIN_GAP and the
fix revert to spec TOGETHER; ZERO paid → the queue starved the window — its own line.
**predictions×fp join (tomorrow evening, owner's sync phrase, zero credits)**:
contents required (rows, per-market split, both-price count, fixture-days = 1);
per-market game-clustered gain, ONE fixture-day + PRE-vintage; **vs the
archive-derived +1.07 [+0.88, +1.33] — diff, never average**; zero both-price rows →
failing field + fifth "unrecoverable" restatement; negative market → decomposition
restates (multibook-memo, EXTENDED block).

## 3. OPEN PRE-COMMITTED READINGS (verbatim-or-cited; COUNT: 23)

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
20. `sweep-covers-engine.test.ts` (M13) flips only in the alt-keys fix commit (guard
    header; alt keys spec-only behind the burn plan).
21. Fixture-representativeness reading at 08-17: ≤2/≥5-of-25 branches, the five cold
    sites, the range-detector thresholds (harness-substitutions, PRE-COMMITTED
    section).
22. Second-board-after-T-fail: requires force, OFF absent explicit in-the-moment
    authorization with the disabled protections stated (collection-period).
23. The 22:00Z board's own coverage impossible branch: luPct > 50 → the projection
    was wrong, the window wider — print both (collection-period, item-1 resolution).

## 4. GIT AND ARTIFACT STATE

- Branch `frontend-rebuild`: **pushed head `4c036ba`** (trigger mark; the push carried
  the seven prior doc/test-only commits — runtime-touchers this session: `0914eeb`
  cfSel, `9753fb9` echo, `4c036ba` mark). **HELD: `e4e7bd1`** (+ this file's commit).
- **main: pushed `53d0076`** (pause `a46c1f` + props-history concurrency fix; main
  deploys nowhere — `vercel.json` `main: false`).
- Served artifact: chunk `256-171aff5d10da160d.js`; engine string 280,466 chars,
  sha256 `f6cf15130a8beddf87aa761db68aea9ca3b4ac8a0dd65b138cf11994e4d98e5b` — last
  re-extracted and matched **2026-07-30 post-4c036ba-push** (edge cache had not yet
  cycled at the last probe; the mark is server-route code — its landing evidence is
  reading #5, not the chunk).
- The two model files are **NOT gitignored and never were**: tracked, bot-committed
  (priors nightly, context 2×/day; latest at pause time priors `00994434be42196b67233ed1663ded2f0651b863434f537cd611da108ca0374e` / context `2a8bcba934c402106302f6d52077b0d56cfff7c768e718ac343b3a533787bd80`, local ≡ origin); production reads its own deployment's
  committed statics; tests read fix45 static snapshots.
- **The bot pause (`a46c1f`, on main)**: froze the priors.json + context.json
  WRITERS; `ump_k.json` keeps accruing; ONE pre-pause-queued context run may still
  commit (~06–08:30Z) — the window-start stamp is conditional on it
  (collection-period, pause block). The pause did NOT need to freeze anything for
  the fixture bar (orthogonality block); it buys one data vintage for the parameter
  exit's cross-day paths.
- props-history: main's copy (the firing one) = OLD TEN-CRON + the concurrency fix;
  the 07-27 three-cron+wait redesign never fired (frontend-rebuild only);
  convergence = owner's call, spec-only. Executing script = frontend-rebuild's pull,
  both copies sha256
  `01b8231b9fc43e3f05a14cb31203eb1c68dd9c243fee84b4fc095b381103b828`, MIN_GAP inside.

## 5. FROZEN TABLE AND CENSUS (v2.3, collection-period)

**42 parameters / 0 fitted / 41 chosen (12 with no stated rationale) / 1
stated-arithmetic; 9 since-measured.** Additions this session: the simJoint clamp
0.25–4× (v2.1, never binds on n=1 board), the 1/n cap relax (v2.2, ladder measured),
T = 0.80 (v2.3, owner-chosen pre-data). **Named
unmeasured-with-measured-consequence: `coreEvMin` (self-graded sweep), damping 0.5
(40 bp range), `SH_W` (sweep self-graded by construction), the 1/n relax (the
10%/5%/3.33%/2.5% ladder — narrowed same day: Kelly ceilings bound n=1 at ≤ ~8% and
under-deploy thin cards, $49-of-$250 measured; 10% reachable only legacy/override).**
Operator rule (NOT an engine parameter, distinct by design): **no single slip above
2% of bankroll ($50)** — binding on 7 of 10 measured cards; 3 of 10 sat under $50.

## 6. INSTRUMENT LEDGER (what each sees, is blind to, and carries)

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

## 7. POSITION

- **Quota: READ 1,461 remaining / 18,539 used** — 2026-07-30 (the doc stamps the
  read "~03:5xZ"; the exact minute of the earlier 07-29 morning read remains
  IN-CONTEXT-ONLY-UNVERIFIED, inherited — the next reads stamp their own times).
  Delta from 1,676/18,324: 215, attribution closed within 1 credit.
- **Board-days: 1,461 / 150 = 9.74 < 10 — the ≥10 threshold is NOT reachable under
  any cadence**; the 08-15 HRR suspension review is UNREACHABLE without a reset
  (written 07-30, in advance). Tomorrow's board cost ~55–60 (projected).
- **Homogeneous window: COUNT ZERO** (opened at the pause; 07-29 produced no board;
  the first member is the 07-30 board under either definition; conditional on the
  one queued straggler context commit).
- **Both exits: TWO EXITS, BOTH UNREACHABLE THIS CYCLE WITHOUT A RESET** — the
  parameter exit for credits (~13.5k needed to 09-22 vs 1,461), the bankroll exit
  for settled-leg volume (per-market N at the ledger rate: 12-pp ≈ 35–40
  board-days; 3-pp ≈ 100+; the exit's test is POOLED — masking possible). The reset
  date remains unread; every downstream date ASPIRATIONAL-PENDING-RESET.

## 8. UNRESOLVED CONTRADICTIONS (both sides on disk)

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

## 9. NOT ON DISK (missing input → how obtained)

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

## 10. DO-NOT-REDERIVE (read, don't recompute)

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

## 11. PROTOCOL

Josh relays paste blocks between two sessions and is not the operator — no side
tasks, no explanations addressed to him, no decisions on his behalf. Standing rules
live in `CLAUDE.md` (pointer, not copy). **First action after compaction: re-read
this file and `CLAUDE.md`, confirm the held sha resolves (`git log --oneline -3`),
print the current chain step AND tomorrow's next deadline in PT (the 3:30 PM PT
cron-job.org visit, unless the clock has passed it — then the 3:40–4:05 PM PT curl
window), and STOP.**
