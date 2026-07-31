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

## 2. RUN SHEET

> ## ⛔ STATUS 2026-07-31 ~02:0xZ — NO BOARD, AND THE OUTS SHIP IS STOPPED ON ITS OWN GUARD
> **The outs flag did NOT ship.** It was built (6 edits, engine 280,466 → 282,186 chars,
> `f6cf1513…` → `3e06cac82d3bb90b5cd3d009c147bb6cc21bc21cab9a0b1067bbefcb8295942a`), the **scope-by-diff invariant went RED**, and the
> pre-committed branch fired: STOP. Engine edits REVERTED, tree back at `f6cf1513…`, no
> pending marker written, both `it.fails` halves still unflipped, nothing deployed, no
> credits spent. **Outs reopens UNFLAGGED Friday** unless the owner rules otherwise.
> The red is a GUARD-DESIGN defect, diagnosed not waved: the comparator checks the FULL
> analyze output, and the only differing keys are `parlays`, `parlaysMixed` (the flag's
> intended effect) and `overview` (ticket-derived by inference, NOT verified) — every
> row-level key is byte-identical. **The comparator was not rewritten to pass the ship it
> gates.** Owner's call, two options, in collection-period (THE OUTS SHIP … STOPPED).
>
> ## ⚠️ STATUS 2026-07-31 ~01:3xZ — THE 07-30 BOARD DOES NOT EXIST
> `/api/board?date=2026-07-30` → `{board: null, gens: [], reason: "no-board-for-date"}`,
> READ not inferred. The 22:45Z fire and the 22:40–23:05Z curl fallback are BOTH past.
> Cron branch **(b) 401 or (d) no fire — indistinguishable from this repo**; the
> cron-job.org execution log is the owner's distinguisher. Zero credits spent on it
> either way. Quota READ 01:2xZ: **1,038 / 18,962** (200 spent since 16:4xZ with no
> board — props sweep + CLV ticks only). Runway **6.9 board-days**. Slate at 01:26Z:
> 4 Final / 3 In Progress / 2 Warmup / 1 Pre-Game — **3 unstarted**. Homogeneous window
> still COUNT ZERO (two consecutive board-days spent without a board). **Everything
> below is unchanged and re-arms for the next fire; the readings simply have no board
> yet.** The outs flag's ship gate ("after tonight's board is read") now collides with
> its own Thursday-evening deadline — the owner's call. Full record:
> collection-period, 07-30 CLOSE-OUT.

> **FRIDAY'S SEEDS — nothing started earlier, so this is the full list.** The next board
> that fires is board 1 of: the **homogeneous window** (still COUNT ZERO after two dark
> days); the **clamp census** and **hot-site fidelity** (`clampActivity` has never ridden
> a board — reading 24); the **config echo** (reading 25); **`mktN` on a board** (shipped
> 07-30, never yet observed — reading 29); **cfSel with `rank` and `stake`** (shipped
> 07-30, so no board has ever carried a sizeable counterfactual); the **trigger mark**
> (reading 5); and the **same-day fp × predictions** join. It is NOT board 1 of a new
> engine vintage — the outs ship stopped, so `f6cf1513…` still serves.
> **HIGHEST-VALUE READ AVAILABLE, ZERO CREDITS, UNRUN: the ledger export.** The curl and
> reading 15's one query sit in collection-period (THE EXPORT CURL AND READING 15). Run
> it BEFORE the next fire — it is the only thing that turns M24/M25 from prospective into
> realized, and it needs nothing but the sync phrase.
> **Quota 1,038 / 18,962 · runway 6.9 board-days at ~150, ~17 at an evening board's ~60 ·
> sweeps-only burn ~204/day → ~5.0 days dark.**

## 2a. THE RUN SHEET AS WRITTEN (2026-07-30 PT — re-arms for the next fire)

**Deadlines (both Thursday 07-30 PT, different gates):**
1. **3:30 PM PT — the owner's ONE cron-job.org visit**: **header `x-cron-key` on
   ENTRY 1 ONLY** (REVISED 2026-07-30, owner's decision — entries 2–4 stay
   UNHEADERED and keep 401'ing at zero cost: board-days are credit-limited, not
   calendar-limited, so arming the weekend hours spends the same 1,238-credit
   pool at hours chosen before T existed; Saturday 18:00Z projects sub-T and
   Sunday 17:00Z would block the 22:30Z fire through the good-board skip, which
   does NOT check T. Reversible at zero cost; a spent board-day is not —
   collection-period, WEEKEND ENTRIES block) **AND entry 1 → `45 22 * * 1-5`.**
   Gates the verification board (fires 22:45Z = 3:45 PM PT, achievable 0.833,
   cost PROJECTED ~55–60 at 6 events).
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

**OVERNIGHT — THE COLD-READ BLOCK (written 2026-07-30 ~05:1xZ, owner's item 5;
read this after waking, nothing needs interpretation):**

The two cron-job.org edits + the deadline, restated first: ONE visit by
**3:30 PM PT** — (1) header `x-cron-key` onto entries 1–4; (2) entry 1
`0 22 * * 1-5` → `45 22 * * 1-5`. If the visit happens after 3:00 PM PT (22:00Z),
the unmoved entry 1 fires headerless at 22:00Z → 401, ZERO credits, no lastRun —
harmless, already priced. Entries 2–4 are weekend-only (Sat/Sun,
`docs/cron-jobs.md` table) — no weekday fire.

**The 08:02–08:07Z landing test (fires ~06:30–09:30Z) — what to run and what each
result looks like:**
- `git fetch origin line-history`, then
  `git log origin/line-history --format='%h %ad %s' --date=iso-strict
  --since=2026-07-30T06:30:00Z --until=2026-07-30T09:30:00Z --
  data/props/2026-07-30.json`
- **LANDED** = exactly ONE commit in the window (the one paid snapshot; the other
  cluster runs skip — their Actions logs print `skipped: pre within MIN_GAP (...)`
  and they commit nothing). Ground truth inside the file:
  `git show origin/line-history:data/props/2026-07-30.json` — exactly one
  snapshot `t` in the window.
- **NOT LANDED** = two-or-more commits inside any 40-min span (two+ paid), OR any
  `engine-v2-props-history` Actions run whose Commit step shows a rejected push
  after the ×3 rebase retry → MIN_GAP and the concurrency fix revert to spec
  TOGETHER (the pre-committed pair).
- **STARVED** = ZERO commits in the window → check
  `gh run list --workflow=engine-v2-props-history --limit 10` for
  queued/cancelled runs — "the queue starved the window" is its own line, not a
  pass and not a fail of the fix.

**Everything scheduled between this write and 22:30Z (3:30 PM PT), with credit
cost** (props sweeps ≈ 6 credits × unstarted events; model/context jobs are
KEYLESS — zero Odds credits):
| nominal (UTC) | job | lands (measured delay) | Odds credits |
|---|---|---|---|
| queued from 07-29 22:30Z | context.yml straggler (pre-pause trigger) | ~06–08:30Z | 0 — keyless; may commit ONE context.json → the window-start stamp shifts to its hash (pre-committed) |
| 07-29 23:00/23:30 + 07-30 00:00/00:30/01:00, queue-delayed +8–9h | props-history cluster | ~07:30–09:00Z — THE LANDING TEST | ~60 if landed (ONE paid pre at 10 events) |
| 17:00 | context.yml | ~17–19Z | 0 — ump_k.json only (context.json dropped by the pause) |
| 17:00 | props-history | 20:08–20:55Z (measured +3.1–3.9h) | ~36–60 (one paid; ~6 unstarted evening events by then) |
| 20:00 | props-history | ~21:30Z–after-window | 0–36 (pays only if it lands before 22:30Z AND ≥40 min after the last paid) |
| 21:00 / 22:00 | props-history | after 22:30Z on measured delays | 0 in-window |
| 96×/day | cron-job.org CLV ticks | continuous | ~5–15 before 22:30Z (day-game closes from 16:10Z; full-day measured ~24) |
| 22:00 (if entry 1 unmoved) | cron-job.org board entry 1, headerless | 22:00Z | 0 (401 precedes everything) |
| — | model.yml | PAUSED (schedule commented) | 0 |

**Expected quota at 3:30 PM PT (22:30Z), PROJECTED — one number: ≈ 1,325**
remaining (band 1,290–1,360), from READ 1,461 − [~60 (08Z paid) + ~36–60
(20:20Z paid) + 0–36 (a possible third paid) + ~5–15 (CLV)]. A read below ~1,290
= un-designed spend (grep line-history commits + Actions); above ~1,360 = the
sweeps starved (also a finding, not a relief). The 3:30 PM read stamps its own
time.

**THE MORNING COLD READ, IN ORDER (added 2026-07-30 ~06Z, owner's item 5 —
each step maps to a labeled outcome, no interpretation)**:
1. The landing test: run the `git fetch` + `git log` pair above → exactly one of
   **LANDED / NOT LANDED / STARVED** as defined above.
2. The straggler: **CORRECTED 2026-07-30 ~18Z — the bot commits to
   `frontend-rebuild`, NOT `main`** (main holds the workflow files; the job
   checks out the app branch). The command must be
   `git fetch origin frontend-rebuild && git log origin/frontend-rebuild
   --format='%h %an %ad %s' --date=iso --since=2026-07-30T05:00:00Z` — read the
   FILES, not just the presence of a commit: `public/model/context.json`
   touched → the window-start stamp SHIFTS to its hash; `data/ump_k.json` only
   → the pause's git-add drop worked, the stamp STANDS.
3. Nothing else fires a reading before the 3:30 PM PT visit — stop there; the
   quota read happens at the visit and stamps its own time.

**[MORNING READ EXECUTED 16:4xZ — LANDED / stamp STANDS / quota 1,238 with a
~97-credit AMBIGUOUS residual; full record: collection-period, 07-30 MORNING
COLD READ block.]**

**BOARD 1 — WHAT TODAY'S 22:45Z BOARD SEEDS (added 2026-07-30 ~17Z, owner's
item 5; every series that begins today, what the board must carry, and the
absent-reading — a series that silently starts empty is worse than one that
does not start):**
| series (board 1 of…) | must carry | if absent |
|---|---|---|
| homogeneous window | the echo's priors/ctx hash pair = the PAUSE pair (the straggler did NOT commit — verified 16:4xZ) | echo absent → reading 3 (push didn't land); pair ≠ pause pair → reading 25 (print both, trace) |
| clamp census + hot-site fidelity | `clampActivity` on the board data (route arms `clampLog` L244) | reading 24 — census stays ZERO, named defect, not silent |
| config-echo series | the echo object; `selMode:"ev_gated"`; `outsSusp === null` (pre-ship) | readings 3 + 25 |
| trigger-mark series | `gen.trigger === "header"` | reading 5 (mark did not land) |
| cfSel series | cfSel stamp on every susp row — today's susp population = HRR rows ONLY (pre-outs-flag) | reading 4; empty susp population → the HRR-counts third-vacuity branch (reading 9) |
| same-day fp × predictions | pred rows for 07-30 + the day-file's pre/close rows (3 already) | reading 14's branches |
| behavioral vintage (4 markets live) | self_consistency + clear-count + Control C | readings 9–12 |
| luPct/achievable pair | both printed | reading 7 |
**Chain re-check against this list**: the fourteen steps produce three numbers
nobody had pre-committed — now written as readings 24–26 below, before
3:30 PM PT. Everything else lands on readings 3–14.

**STEP 15 — ADDED 2026-07-30 (owner's item 1, the mode-coverage finding)**: after
the ev_gated device checks, **switch Settings → `probability` and re-read the
board's HRR rows and the card**. Expected from the fixture measurement:
suspension bars do NOT apply there — HRR (and, post-Thursday, outs) legs are
POOL-ELIGIBLE and can enter the card. Reading: HRR legs present in the
probability-mode card → M20 confirmed on live production data (the fixture said
11 pool / 4 FUN); ZERO → the live slate simply carries no qualifying HRR ticket
that day (NOT evidence the bar applies — print the row population beside it).
**SEQUENCING (added 2026-07-30, owner's item 1): run step 15 ONLY AFTER the board is
confirmed present.** `bestBoard()` falls through to a CLIENT GENERATE when neither a
cached nor a server board exists (`engine-client.ts` L297), and that path writes
PredRecords to `pl:pred` stamped with the DEVICE's mode — the one write path a
legacy-mode read could contaminate (it also spends credits). With the 22:45Z board
present the fallthrough cannot fire. Client rows DO carry `selMode`, so any such row
is separable after the fact (reading 15's exclusion).
**OPERATOR RULE #3 (owner's, dated 2026-07-30, beside #1 and #2): the app is NOT
opened in `probability` or `caesars_ev` at all, for any purpose, until M24 is
resolved — step 15's diagnostic is the SOLE exception, it runs ONCE, and the return
to `ev_gated` is the immediately following action.** M24: the belief-sized Kelly
ceiling is computed in every mode and applied in only two — 11 of 11 legacy tickets
exceed their own ceiling, 9 of them against a computed ceiling of $0. **And M25: that
same boolean gates ELEVEN protections — the EV gate, the settlement floor, both
consensus gates, NO-PLAY, the Kelly ceiling and both halves of the HRR bar — so a
legacy mode is not "a different ranking", it is the discipline set switched off.**
**OPERATOR RULE #2 (owner's, dated 2026-07-30, beside the 2% rule): step 15 is a
DIAGNOSTIC ONLY — the mode returns to `ev_gated` before any slip is placed, and
`pl_selmode` is VERIFIED to read `ev_gated` as the LAST action before placing.**
Nothing is staked from a legacy mode; a persisted diagnostic state is exactly how
this becomes a real-money defect (the Builder's one-tap override sits on the same
card the slip is placed from).

**TONIGHT'S BOARD — WHAT IT IS AND WHAT IT CANNOT SUPPORT (2026-07-30 final)**:
it IS **board 1 of the homogeneous window** — `data/ump_k.json` moved this morning
(`8f8e8c8`, 07:43Z) but is NOT an engine input (four-step trace + the pinned-off
`umpKFrozen` factor; collection-period, ump_k block), and `context.json` stayed
frozen at the pause pair. **One line on what it cannot support regardless of
outcome: it cannot certify the suspension in any mode but `ev_gated`, and it cannot
certify the outs flag at all because the flag does not exist yet — and it cannot observe `mktN` (not in the echo), so the
consensus-gate crossing is readable only as the blocked-reason proxy (reading 29),
nor can it see any legacy-mode exposure, since the server builds in `ev_gated` and
legacy modes stamp zero susp rows, and it cannot SIZE the counterfactual — cfSel
records whether a suspended row would have been selected AND — as of this afternoon's
ship — its counterfactual `rank` and `stake`, but that counterfactual runs the SHIPPED
allocator, so it inherits M14 (non-monotone, cap-bound, prob-ranked)** — the
board's tickets are built under the server's pinned mode, so the zero-HRR-legs
half covers one mode only (the TB≥1==H≥1 identity is board-level and covers all
modes); step 15's diagnostic read is the only cover for the other three, and it
is a device read, not a server certification.

**TONIGHT'S SHIP SEQUENCE (owner-authorized 2026-07-30; strict order)**:
1. the board fires 22:45Z → the fifteen steps → **all readings on disk**;
2. THEN the outs build — and `docs/pitcher-outs-audit.md`'s coverage-gap record is
   written FIRST (it is: "THE FLAG'S OWN COVERAGE GAP", with the measured 10
   legacy-mode outs legs beside it — the owner's non-optional first condition);
3. the build commit flips BOTH `it.fails` halves and keeps the scope-by-diff
   invariant GREEN — red there STOPS the ship and outs reopens unflagged Friday
   (pre-committed, and fine);
4. it regenerates `legacy-src.gen.ts` (the engine string MOVES), sets
   `tests/served-verification.json` `pending: true` with today's timestamp, and
   updates `SERVED_ENGINE_SHA_VERIFIED` to the new runtime hash;
5. post-deploy: re-grep the served chunk, confirm runtime === served, clear the
   marker — **inside 24h, now enforced by the resolution guard**.
**Friday is a TWO-VINTAGE board** (the engine ship + the K's/outs `consMinEv`
reopen): outs-, K's- and allocation-level series restart at board 1; the row-level
clamp census and the `self_consistency` identities CARRY ACROSS (collection-period,
WHAT FRIDAY'S DOUBLE VINTAGE EVENT COSTS SERIES A).

**Pre-fire quota read + cost bracket (reading 26)**: read immediately before the
22:45Z fire and again after; expected board cost **~55–60 at 6 events**
(delta/events ∈ [5,8] = PASS). **Re-projected 22:30Z quota: ≤ ~1,180**
(16:4xZ read 1,238 − the 17Z sweep ~36–60 − the CLV path's pre-committed ~60/day
share still to fall). **Runway at that figure: ~7.9 board-days** (1,180/150).

## 3. OPEN PRE-COMMITTED READINGS (verbatim-or-cited; COUNT: 28 — 23 at the
## 07-30 compaction handoff + 24–26 added ~17Z (owner's item 5) + 27–28 added
## ~18Z (owner's items 4 and 1))

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
    denominators — and print WHICH variant matched (a provenance RECOVERY,
    labeled); no variant → provenance UNESTABLISHED, printed.)
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
24. **Board-1 clampActivity (added 07-30)**: today's board data carries
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

## 4. GIT AND ARTIFACT STATE

- Branch `frontend-rebuild`: **pushed head `315e0d4`** (2026-07-30 ~05:5xZ,
  owner-authorized after its own file audit: docs-only — collection-period +
  this file; engine-echo guard green immediately pre-push; origin verified
  carrying `315e0d4a56c0d287d79890a4ad34b8477a0390e2`. The earlier push the same
  night carried `e4e7bd1`+`8ca4d1b`, same standard.) Runtime-touchers this
  session remain: `0914eeb` cfSel, `9753fb9` echo, `4c036ba` mark. **HELD:
  nothing — the held stack was REBASED onto the bot's `8f8e8c8` and pushed
  2026-07-30 ~18Z (the rebase renamed it; the sha-reference guard exists for
  exactly this, so no doc cites the pre-rebase ids).**
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

- **Quota: READ 1,238 remaining / 18,762 used — 2026-07-30 16:4xZ** (updated;
  the ~03:5xZ read was 1,461/18,539, its delta 215 attribution-closed within 1).
  The 16:4xZ delta of 223 splits: ~126 attributed (two MIN_GAP-spaced pre
  sweeps ~120 + two line ticks ~6) + **~97 AMBIGUOUS residual** — no git trail;
  likely the Vercel-side CLV capture path (spends at capture, commits at the
  fold); disambiguators pre-committed (tonight's fold / Vercel logs / Odds
  dashboard) — collection-period, MORNING COLD READ block. The exact minute of
  the 07-29 morning read remains IN-CONTEXT-ONLY-UNVERIFIED, inherited.
- **Board-days: 1,238 / 150 = 8.25** (restated from 9.74 at the 03:5xZ read);
  the ≥10 threshold stays NOT reachable under any cadence; the 08-15 HRR
  suspension review stays UNREACHABLE without a reset (written in advance).
  Today's board cost ~55–60 (projected; settled by reading 26's bracket).
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
