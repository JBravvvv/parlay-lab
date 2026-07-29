# SESSION HANDOFF — written 2026-07-29, immediately before context compaction

Purpose: everything this session established that a fresh context must know, on disk.
Every factual claim carries a file path (or file:line), or is marked
IN-CONTEXT-ONLY-UNVERIFIED. Nothing here is a new measurement.

## 1. READ-FIRST LIST

Docs (load before acting):
- `CLAUDE.md` — state block, the verification chain + Wednesday order + step-0/1
  clearances + capture commands + step-8 pre-commit, M-index M1–M18, calendar (with the
  aspirational stamp), guard inventory, standing rules (rule 23, L2402 rule, hold rhythm).
- `docs/freeze-exit-bundle.md` — every M/A finding with measured effect; the vintage
  table; M14 audit + addenda (200-seed adoption, reconciliation, A1 robustness/retirement);
  M16/M17/M18 rows; level-vs-derivative census.
- `docs/collection-period.md` — freeze scope + frozen table (provenance census v2);
  M18 first line; credit budget/burn/runway; MIN_GAP ship record + landing instrument;
  no-reset contingency; 08-15 decision page + reviews/power table; suspension shadow
  accrual + cfSel flag spec; ledger section + export pre-commit; vintage events census;
  dark-gap series table.
- `docs/multibook-memo.md` — the adoption headline (net −26.1, A1 sequencing), M13 §2c,
  M15 dedup corrections, the CLV kernel run, the predictions×fp join pre-commit,
  placeability census, Over-only counts.
- `docs/singles-vs-parlays.md` — the doctrine + four dated corrections (frame, sign,
  allocator-in-loop, M14 isolation), the crossover-undetermined ruling, few-cluster marks.
- `docs/harness-substitutions.md` — teeth-test standards; the fixture-representativeness
  pre-committed reading (its 08-14 date moved — see collection-period 08-15 decision).
- `docs/hrr-recalibration.md` — HRR audit; the suspension basis (L83–86) and reversal.
- `docs/pitcher-outs-audit.md` — outs defects; the suspension-flag spec + go/no-go page.
- `docs/board-timing.md`, `docs/phase2-memo.md` — board cadence; Series A design
  (L40–42 = the floor requirement; L41 = timing-vintage segmentation).
- `docs/session-handoff.md` — this file.

Guard tests (all green at handoff unless marked):
`tests/parity.test.ts` · `tests/doc-structure.test.ts` · `tests/retraction-markers.test.ts`
· `tests/m2-interlock.test.ts` · `tests/hrr-suspension-coupling.test.ts` ·
`tests/workflow-timing.test.ts` · `tests/factor-classification.test.ts` ·
`tests/calibration-window.test.ts` · `tests/sweep-covers-engine.test.ts` (**it.fails —
documents open M13**) · `tests/outs-suspension-coupling.test.ts` (**it.fails — flag not
applied, awaiting go/no-go**) · `tests/bot-path-whitelist.test.ts` (M17) ·
`tests/sha-references.test.ts` (dangling-citation guard; accepts origin- or
HEAD-reachable) · `tests/min-gap.test.ts` (MIN_GAP shipped) ·
`tests/singles-counterfactual.test.ts` (analysis harness, `PL_BOARD=`).
Created this session: the last five listed plus this file.

## 2. GIT STATE

- Branch `frontend-rebuild`. **Pushed head at handoff: `1617d1b` (MIN_GAP ship)**, landed
  `64c42ad..1617d1b` (git log / origin).
- **HELD (unpushed, ancestors of local HEAD): `465b85a`, `7ac2a4a`, `2469ad0`, plus the
  commit adding this file.** The hold rhythm is CLAUDE.md's standing rule.
- Sha renames this session (rebases over bot commits; old names are gc-able loose
  objects, deliberately truncated to 6 hex here so the citation guard ignores them):
  59f6ee→`b9ba57c` · 0d96d3→`f544358` · 91cf2a→`3235dd5` · b17ae3→`ec1842c` ·
  e11bbb→`1d723d9` · 21b8bd→`2a469f6` · 2b8124→`28e901e` · ce57af→`dcf26a2` ·
  711aa8→`33dd31b` · b207dd→`465b85a` · 079440→`7ac2a4a` · 440031→`1617d1b`.
  Docs cite only resolving shas (enforced: `tests/sha-references.test.ts`).
- Served artifact (CLAUDE.md STEP-0 CLEARANCE): chunk `256-171aff5d10da160d.js`; engine
  string sha256 `f6cf15130a8beddf87aa761db68aea9ca3b4ac8a0dd65b138cf11994e4d98e5b`;
  last verified 2026-07-29 post-push. Chunk names are content-hashed — grep by STRING
  hash.
- Bot: `engine-v2-bot`, workflows `.github/workflows/context.yml` + `model.yml`;
  whitelisted write paths = `data/ump_k.json`, `public/model/context.json`,
  `public/model/priors.json` (`tests/bot-path-whitelist.test.ts`). It commits daily —
  expect origin to move; rebase before push (CLAUDE.md).

## 3. VERIFICATION CHAIN (CLAUDE.md, "WEDNESDAY'S ORDER" + the numbered chain)

| step | what | status at handoff | closing instrument | cost | owner |
|---|---|---|---|---|---|
| 0 | MIN_GAP ships | **SHIPPED `1617d1b`; LANDING UNCONFIRMED** | next cluster: one paid snapshot per 40-min window + N−1 skip lines (collection-period, MIN_GAP bullet) | 0 | session confirms |
| 0b | cfSel flag | **spec'd, awaiting sign-off** (collection-period, flag spec) | owner's sign-off, then the diff | 0 | **Josh** |
| 1 | push stack + re-grep | **CLEARED** (STEP-0/STEP-1 blocks, CLAUDE.md) | done | 0 | done |
| 2 | header fix (x-cron-key on entries 1–4) | **not started** | cron-job.org edit | 0 | **Josh** |
| 3 | manual generate curl + captures + quota before/after | not started | the curl (CLAUDE.md capture block) | **~150** protected | **Josh** (types nothing secret beyond his own) |
| 4 | gen=list non-empty | not started | response field | 0 | session |
| 5 | self_consistency: 0 TB≥1==H≥1 violations, 0 HRR ticket legs, both population sizes printed | not started — **closes step 1's server half** | `tools/self_consistency.py` | 0 | session |
| 6 | app-switcher double reopen | not started | device | 0 | **Josh** |
| 7 | HRR rows present AND greyed | not started | device | 0 | **Josh** |
| 8 | replay dump + ParlayPred membership diff | not started; replay deterministic (see §10); diff needs sync phrase | harness replay + authed pred read | 0 | session + **Josh** (phrase) |

Nothing locks Wednesday until the chain completes (CLAUDE.md, owner's rule).

## 4. SPEC-ONLY QUEUE

| item | changes | files | guard (red observed?) | prerequisites | additive? |
|---|---|---|---|---|---|
| **MIN_GAP** | **SHIPPED `1617d1b`** — pre-sweep payment dedupe | `tools/snapshot_props.py` | `tests/min-gap.test.ts` (RED→GREEN same commit) | **landing confirmation pending** (instrument in §5) | yes |
| cfSel flag | counterfactual selection on suspended rows | `app/api/generate/route.ts` (+`pred-serialize` stamp) | none yet — spec'd | **owner sign-off before the curl** (collection-period) | yes — branches nothing live |
| sha+config echo | engineSha + config echo in generate/board | route + archive | required red-at-implementation (CLAUDE.md spec) | own sign-off | yes |
| outs suspension flag | 3 same-line engine edits | `legacy/index.html` + re-extract + guard flip | `tests/outs-suspension-coupling.test.ts` (**RED observed: 10 outs legs**) | **Wednesday go/no-go — Josh** | config+display only |
| alt keys (M13 fix) | sweep requests +3 alt markets | `tools/snapshot_props.py` | `tests/sweep-covers-engine.test.ts` (**RED observed: 3 keys**) | burn plan → owner | yes; vintage-stamped |
| ledger export | read-only backup curls | none (owner runs) | n/a | owner runs with phrase | yes |
| ledger append-only invariant | monotone-superset guard | new test | spec'd; encodes at 2 snapshots | export first | yes |
| A1 / damping / coreEvMin / cap | allocator changes | engine | n/a | **exit sign-off; freeze holds** | no — frozen |

## 5. OPEN PRE-COMMITTED READINGS (verbatim; unresolved at handoff)

1. **MIN_GAP landing** (`docs/collection-period.md`, MIN_GAP SHIPPED bullet): "the next
   morning cluster's day-file must append **one paid snapshot per 40-minute window with
   the N−1 skips visible as 'skipped: pre within MIN_GAP' lines in the other runs'
   Actions logs — two paid sweeps inside one 40-minute window means it did NOT land.**"
2. **Predictions×fp join** (`docs/multibook-memo.md`, PRE-COMMITTED block): "(1) rows
   join carrying both `cz` and `fp` → the hits two-book gain gets its first measured
   magnitude, **stamped one fixture-day + pre-vintage**, and 'unrecoverable' withdraws
   with a dated marker — fourth claim, fourth outcome. (2) rows join but `cz` is null
   throughout hits/K's → **the field is written and never populated — an M-item, not a
   join failure**. (3) zero rows → the query and the keys actually present under
   `pl:pred:*` get printed (the same curl without `date` returns the day list). (4)
   impossible branch: pred rows exist for 2026-07-26 → the boards={07-26} /
   fp={07-27,28} partition was wrong and the same-day join was available two turns ago —
   print both."
3. **Ledger export reading** (`docs/collection-period.md`, THE EXPORT'S READING):
   "reconstructible → 'cannot re-examine' WITHDRAWS with a dated marker and the
   suspension's basis becomes auditable; not → the absent fields get NAMED, not
   adjectival; export ticket-count vs the owner's 38 → both printed if they disagree."
   (The "38" is the owner's stated figure; no on-disk record — IN-CONTEXT-ONLY-UNVERIFIED.)
4. **Wednesday step-5 reading** (`CLAUDE.md`, chain step 5): "A pass = zero TB≥1==H≥1
   violations AND zero HRR legs in built tickets AND both population sizes printed on
   the run's own output… A zero over an empty population is NOT a pass and the run says
   so itself. Zero HRR rows on the board → the greyed-row check is VACUOUS and the
   reopen did not happen — a reopen failure, not a suspension success. HRR rows present
   but UNGREYED on device → the display half fails. HRR legs present in built tickets →
   `hrrAltMax` is not reaching the server path — the server half closes in the WORST
   direction and that is an M-item the same day."
5. **Behavioral-vintage ticket counts** (`CLAUDE.md`, chain step 5 block): "(a) zero
   tickets clear with `consMinEv` gone → `coreEvMin = 2` is the binding gate — a FINDING
   with a number (print the blocked-reason counts)… (b) the card fills to
   `maxCoreTickets = 6` on day one → the cap is binding on the first live board and
   Control C's displacement mechanism (M14) is live in production — record which tickets
   sat at ranks 7+."
6. **Step-8 M14 production reading** (`CLAUDE.md`, STEP-8 PRE-COMMIT): "IF the cap
   binds, the prob-ranked 6 forgoes **≥ 30 bp** E[ln] vs the same pool's EV-ranked 6,
   and rank-7+ displaced tickets carry HIGHER czEv than same-rank entrants… cap binds +
   displaced-higher-EV → **M14 confirmed in production**; cap does not bind → **M14
   unobserved in production, the sweep stays archival — said plainly, not treated as
   confirmation.**"
7. **ParlayPred replay diff** (owner's branches, issued in-session; transcribed here to
   disk — previously IN-CONTEXT-ONLY-UNVERIFIED): sets identical → replay is a
   validated instrument for composition on this board — say validated-on-one-day, not
   validated; sets differ → two allocators or a nondeterminism — stop the chain and
   diff; ParlayPred empty for today → replay unvalidated and the M14 production reading
   is a hypothesis — label in advance; impossible: replay reproduces membership but not
   stakes with stakes derivable → the allocator is not a function of its inputs.
8. **HRR review thresholds** (`docs/collection-period.md`, THE NUMBERS AND THE
   THRESHOLDS): suspension half "**vacuous if fewer than 10 board-days exist by
   08-15**"; retirement half "**WILL be vacuous; it restates to first-repair-ship + 10
   board-days**."
9. **Reset branches** (`docs/collection-period.md`, runway bullet): "reset → restate
   runway, reprice the calendar; no reset → the ordered shutdown list executes in its
   stated order and the parameter exit does not fit this cycle."
10. **Outs go/no-go** (`docs/pitcher-outs-audit.md`, flag spec + go/no-go page): flip
    `it.fails` → `it` in the flag's commit on "go"; DELETE the guard in the fix's commit
    on "no". Owner also ruled (this session): "if quota forces it, outs takes the flag
    and the fix waits for a cycle with headroom" — IN-CONTEXT-ONLY-UNVERIFIED (owner
    message; now on disk here).
11. **Guard flips** (`tests/sweep-covers-engine.test.ts`, `tests/outs-suspension-coupling.test.ts`
    headers): each `it.fails` flips to `it` only in the commit that ships its fix/flag.

## 6. UNRESOLVED CONTRADICTIONS (both sides on disk, neither retracted)

1. `docs/singles-vs-parlays.md` CORRECTION 4 tail: "A1 (edge-aware base) … and A2
   (leg-equivalent floor) … the existing amendment pair addresses M14's two halves" vs
   the same file's REFINEMENTS item 2 + `docs/freeze-exit-bundle.md` M14 row: "ranking
   sufficient, cap innocent, **A2 is innocent of M14**."
2. `CLAUDE.md` M14 row: "A1 is THE fix on this evidence" vs `docs/freeze-exit-bundle.md`
   M14 ADDENDUM: "A1 is NOT sufficient everywhere; narrowed to 'sufficient at ≤ +1.5 on
   one board'." (Also the retirement of A1's adoption effect sits beside the sequencing
   sentence naming A1 the unblocker — memo lead.)
3. `docs/multibook-memo.md` §2 table header "n=511 both-priced rows" (kept for the
   record) vs §2b M15 correction "the unique population is 362 rows" — append-only kept
   both; a fresh reader meets 511 first.
4. `docs/collection-period.md` heading "Nothing is unrecoverable — the whole window is
   in git" vs the appended "EXCEPT: one captured-field gap" + M18's data-vintage line.

## 7. FREEZE AND EXITS

- Freeze scope: `docs/collection-period.md` top — no model weights, gate thresholds,
  market suspensions, structure caps, or selection-mode defaults change; sign-off
  required for ANY change including collection instruments (MIN_GAP shipped only on the
  owner's explicit sole-exception authorization — this session's precedent).
- The two exits: `docs/collection-period.md` "the two exits" — the PARAMETER exit
  (~09-22, Phase 2 slope + identification diagnostic; what it can and cannot license is
  written in the same doc, LICENSING paragraph: 9 of 39 frozen parameters sit in its
  measurement path) and the BANKROLL exit (unscheduled; sole instrument = CLV/ledger —
  which is one unbacked Upstash key, ledger section).
- Append-only: the ledger of record is the docs; corrections are dated addenda, never
  rewrites (CLAUDE.md standing rules; enforced in part by
  `tests/retraction-markers.test.ts`).
- M18 caveat on everything cross-day: data vintage floats by design; state the axis
  (`docs/collection-period.md` first line; bundle M18).

## 8. POSITION AND CALENDAR

- Quota: **1,676 remaining / 18,324 used — as-of 2026-07-29, read after the 08:04–10:49Z
  sweep cluster** (`docs/collection-period.md`, 07-29 morning reading bullet; exact
  clock time of the read: IN-CONTEXT-ONLY-UNVERIFIED). 641 spent since the prior
  reading, attributed to 7 morning sweeps (~670 computed) — same bullet.
- Runway derivation (`docs/collection-period.md`, "Runway with MIN_GAP live"): sweeps
  ≈ ~420/day post-MIN_GAP → sweeps+board 2.9 days · board-only 11.2 · sweeps-only 4.0;
  ≥10 board-days reachable ONLY board-only (11, barely) without a reset.
- Calendar: ASPIRATIONAL-PENDING-RESET stamp atop `CLAUDE.md` Dated open items and in
  `docs/collection-period.md`.
- Reviews vs reachability (`docs/collection-period.md`, EVERY CALENDARED REVIEW table):
  fixture-representativeness → 08-17 (row-level argument recorded; bar HELD at 20 by the
  owner, decision dated 2026-07-29); crossover doctrine → 08-20 (MDE ~15–17 bp);
  HRR retirement → repair+10 (only written target, ±3 pp ≈ 1 SE at n=300); HRR
  suspension review → needs ≥10 board-days; 08-10 six regressions → board-independent.

## 9. NOT ON DISK (named missing input → how obtained)

- **Ledger contents** (rows behind 46.3%/59.2%, ticket count, any CZ Under-settlement):
  `pl:ledger:v1`, sync phrase → the export curls (`docs/collection-period.md`, ledger
  section). Owner runs; Josh types his own secrets (CLAUDE.md standing rule).
- **Prediction-store contents** (07-27/28 blobs, client accrual counts, 07-26 existence):
  `pl:pred:<date>`, sync phrase → the join curl (`docs/multibook-memo.md`).
- **The reset date**: owner's Odds-API dashboard only (headers carry no reset field —
  `docs/collection-period.md`, dark-window bullet).
- **Vercel deploy list** (timestamps × commit): dashboard/token only; the served
  artifact is the outside evidence (CLAUDE.md STEP-0).
- **Server-runtime engine hash + board config echo**: needs the spec'd sha+config-echo
  instrument (CLAUDE.md; own sign-off). Until then boards support behavioral vintage
  claims only.
- **Raw feed payloads beyond two 07-28 events**: capture + credits
  (`docs/collection-period.md`, EXCEPT section; `docs/multibook-memo.md` §2c).
- **Today's (07-29) board and everything downstream** (chain 3–8, cfSel capture, M14
  production check, behavioral-vintage readings): the header fix / protected curl.
- **Upstash retention/eviction policy**: dashboard; not written in the repo
  (`docs/collection-period.md`, ledger section).

## 10. DO-NOT-REDERIVE (read, don't recompute)

- 200-seed adoption runs, clustered variant, paired A1 result, percentiles,
  reconciliation, A1 retirement: `docs/freeze-exit-bundle.md` (M14 ADDENDUM + ADDENDUM 2
  + A1 ROBUSTNESS + RECONCILIATION blocks) and `docs/multibook-memo.md` lead.
- M14 controls (identity/negative-bump/census), cap sweep, EV-ranking sweep (+2.0
  break), damping sweep (± shading), ρ-stress, pair counts: bundle M14/M16 rows +
  `docs/singles-vs-parlays.md` corrections 1–4 and REFINEMENTS.
- coreEvMin extended sweep + shade collapse (self-graded withdrawal): frozen-table row,
  `docs/collection-period.md`.
- Two-book population numbers incl. M15 dedup (+1.07 pre-vintage etc.): memo §2b.
- 14-day CZ census, M13 chain, alternates raw evidence: memo §2c.
- CLV kernel run (38/319, 14/14, 47 signatures), paired pre/close (149 pairs, p=0.875):
  memo.
- Cluster-pair info content, burn attribution (738/day; 641; 4-of-10 replay), provenance
  census v2 (39/0/38/11), prior-drift table (7,240–10,041/day), vintage census, dark-gap
  series table: `docs/collection-period.md`.
- Placeability census (0/64 misses; Over-only leg counts), simJoint coverage (the
  triplicated live K's parlay): memo + bundle M16 row.
- Allocator replay determinism (byte-identical across sessions): recorded in the held
  commit message `465b85a` (git show) and CLAUDE.md STEP-8 block ("reconstructible by
  deterministic replay").
- Scratchpad artifacts (SESSION-SCOPED, not durable): `ctrl*.json`, `cards26*.json`,
  `pop362g.json`, `props27.json`, `board26_*.json` under this session's scratchpad —
  regenerate from `origin/line-history` archives + the harness if a new session needs
  them; every number they produced is already in the docs above.

## 11. PROTOCOL

Josh relays paste blocks between two sessions and is not the operator — no side tasks,
no explanations addressed to him, no decisions on his behalf. Standing rules live in
`CLAUDE.md` (pointer, not copy). **First action after compaction: re-read this file and
`CLAUDE.md`, confirm the held sha resolves (`git log --oneline -4`), print the chain's
current step, and stop.**
