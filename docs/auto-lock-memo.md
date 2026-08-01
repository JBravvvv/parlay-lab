# AUTO-LOCK — DESIGN QUESTIONS, MEASURED FIRST (memo, 2026-08-01)

**THIS IS NOT A SPEC AND NOT A DECISION.** It is what is known from disk, what is not, and the
order in which the unknowns become knowable. **Nothing ships.** Every line below is traced to a
file and a line number or is marked as unmeasured.

**THE REQUEST:** Parlay Lab locks the day's ticket on its own, at a time it determines, so there
are no late locks — and so it accumulates its own wins and losses to learn from.

**THE ONE-LINE ANSWER, AT THE TOP, BECAUSE IT CONSTRAINS EVERYTHING BELOW:**
**auto-lock can be the SELECTION record. It cannot be the PLACEMENT decision** — the two operator
rules that make a placement (the 2% per-slip cap and the stake-versus-Kelly check) are **not
encoded anywhere in the engine**, and the ledger has **no field that distinguishes what was
selected from what was bet**. Until it does, auto-locking writes engine choices into the only
instrument the bankroll exit has.

---

## 1. WHAT A LOCK DOES TODAY

### 1.1 The single writer

**`shLockCard()`** — `legacy/index.html`, entry object at **L3406**, committed by
`shLedgerSave(entry)` at **L3413**. There is **exactly one** lock writer. It refuses in five
places before it writes:

| # | line | condition | default |
|---|---|---|---|
| 1 | L3380–82 | board must be a generated quant board, not `picks` | — |
| 2 | L3383 | `SH.board.date === shToday()` | — |
| 3 | **L3389–92** | **PRICE-AGE GUARD** — board age > `lockMaxAgeMin` | **30 min** |
| 4 | L3394 | already locked → *"no retroactive edits, ever"* | — |
| 5 | L3396 | empty card | — |
| 6 | **L3399–401** | **combined CORE+FUN exposure > `dailyBankrollCap` × bankroll** | **0.10** |

### 1.2 What it writes, and where

```
{date, lockedAt, locked:true, lateLock, selMode, overrode, daily, fun, bankroll,
 cardEv, core[], funT[], games{}, grading:null, gradedAt:null, clv:{}}
```
→ `shLedgerSave` → device `localStorage` → PUT `/api/ledger` → **`pl:ledger:v1`** in Upstash.
**`ledger-merge.ts` L49 admits ONLY locked days to the cloud store** — *"unlocked entry (d) — only
locked days sync"*. An unlocked day does not exist off-device.

### 1.3 It is a SNAPSHOT, not a reference — the third pre-committed branch does NOT fire

`shTicketSnap` copies **values**: `stake, czOdds, czDec, prob, czEv, fair, bsOdds, bsDec, bsEv`,
and per leg `{label, prop, cz, game, gkey, lkey, est, bs, bsBook}`. It also copies
`d.gameInfo[gkey]` into `entry.games` — so **first-pitch times are frozen into the entry too.**
Nothing re-resolves at read time.

**Three named exceptions (M22's mutable subfields), and only one is a price:** `confirmed` (via
`shConfirmPrice`, L3418–24, **allowed only until that ticket's own first pitch**), `grading`,
`clv`. So the premise holds: **a lock is a snapshot.**

### 1.4 What depends on a lock existing

| consumer | line | what it gets |
|---|---|---|
| **`/api/clv`** | L74 | `ledger.find(e => e.date === date && e.locked)` — **no locked entry, no CLV sighting target at all** |
| **`/api/calibrate`** | L302 | the training loop's ledger side skips `!e.locked` |
| `bankroll.realizedPL` | L112 | P/L sums over locked days only |
| `bankroll.todayExposure` | L128 | today's exposure = today's locked entry |
| `clv-report` | L53 | CLV slices |
| `ledger-segments` | L102, L176 | segment stats |
| `noplay` | L133 | the honored/override accounting |
| `useLedger` | L104 | the UI's ledger view |
| **`ledger-merge`** | **L49** | **cloud-sync admission** |

### 1.5 Late locks — the field already exists, the measurement does not

**`lateLock` is ALREADY RECORDED per entry** (L3406), set by **`shCardStarted`**: true if *any*
leg's `gameInfo.start <= now` at lock time. It is rendered in the ledger
(`app/ledger/page.tsx:231`) and the builder (`app/builder/page.tsx:635`).

**🔴 SECOND PRE-COMMITTED BRANCH FIRES: NO LOCKED ENTRIES EXIST ON DISK.** The ledger lives in
`pl:ledger:v1`, phrase-gated. **The defect is real in the owner's experience and is UNMEASURED
here.** No count, no distribution, no magnitude. **Designing against a number nobody has is
exactly what this memo refuses to do.**

**WHAT THE EXPORT WILL SHOW, and it is now wired:** `lockedAt` and `games[gkey].start` are both
frozen into every entry, so **lock-time minus earliest first pitch is computable per entry**.
`tools/ledger-report.mjs` now prints that distribution as reading **(5)**, plus the `lateLock`
count and the impossible branch. **Read 4 sizes this defect on its first run.**

### 1.6 What a late lock costs, mechanism by mechanism

- **Price recorded that was never available.** The price-age guard's own comment (L3383–88) states
  the failure it was added for: *"a 9am board could be locked at 4pm and the ledger would record
  prices that were never available — CLV then compares a close against an `imp` that was never
  locked at."* **That the 30-minute guard was added on 2026-07-25 is evidence the class occurred**
  — it is not a count.
- **CLV.** Does not fail; it **mis-attributes**. It compares a close against a locked price that
  may be stale, so the CLV number is computed and wrong rather than absent.
- **Confirm-price is refused after first pitch** (L3421–23) — so a late lock cannot be repaired
  by recording the actual price.
- **Grading: unaffected.** It keys on outcomes, not on lock time.

**IMPOSSIBLE BRANCH (a locked entry with no corresponding board): NOT EVALUABLE — zero locked
entries on disk.** Added to read 4's reading rather than assumed clean.

---

## 2. AUTO-LOCK CHANGES WHAT THE LEDGER MEANS

### 2.1 Which population the exit reads

**Locked entries, undifferentiated.** `bankroll.ts` L112: `if (!e.locked || e.date < asOf)
continue` — **there is no placement test anywhere.** And the exit's test is **POOLED** —
`shLedgerStats` scopes ALL/CORE/FUN, never per-market (`collection-period.md` L4030–31) — so one
market's miss is maskable by two clean ones.

### 2.2 🔴 PLACEMENT IS NOT RECORDED SEPARATELY FROM SELECTION

| quantity | field | exists? |
|---|---|---|
| was it actually bet | *(a `placed` flag)* | **NO** |
| what was actually staked | *(an actual-stake field)* | **NO** — `stake` is `p.stake`, the **engine's computed allocation**, frozen at lock |
| what price was actually got | **`confirmed`** | **YES, but optional and pre-first-pitch only** |

**FIRST PRE-COMMITTED BRANCH FIRES.** A `placed` flag and an actual-stake field are a
**PREREQUISITE for auto-lock, not a refinement of it.** Ship them first or auto-lock merges two
populations that cannot be separated afterward — **and a field not captured during the window is
unrecoverable.** There is no backfill for "did I actually bet this".

### 2.3 🔴 SECOND BRANCH ALSO FIRES

**The exit reads locked entries regardless of placement — so it has never measured what was bet.
It has measured what was locked.** Whether those have been the same thing so far is **not
knowable from disk**: the ledger has no field that could record a divergence. It is the owner's
own knowledge, and if the answer is "the same", that fact should be written down and dated now,
while it is still recoverable — because after auto-lock ships it stops being true by
construction.

### 2.4 The operator rules do not survive as written — THIRD BRANCH FIRES

| rule | encoded? |
|---|---|
| **no slip above 2% of bankroll** ($50 at $2,500) | **NO.** The encoded cap is `dailyBankrollCap` **0.10 of bankroll on the WHOLE CARD** (L3399–401) — a different quantity at a different level |
| **stake ≤ its own displayed Kelly** | **NO** — and M24 is precisely that the ceiling is *computed in every mode and applied in only two* |
| mode is `ev_gated` before placing | partially — `selMode` is *recorded* (L3407), not *enforced* |

**If the engine locked a card whose top ticket exceeded either rule, the ledger would record it as
locked, at the engine's stake, with nothing flagged.** M24's measured distribution says this is
not hypothetical: on the armed fixture, `caesars_ev` rank-1 sat at **4.77×** its own ceiling and
**nine of eleven legacy tickets carried a computed ceiling of exactly $0** while being staked.

**→ AUTO-LOCK CANNOT BE THE PLACEMENT DECISION. ONLY THE SELECTION RECORD.** That sentence belongs
at the top of any design that follows.

---

## 3. "THE RIGHT TIME" — WHAT A LOCK CONDITION COULD READ

### 3.1 Candidate quantities, and whether a board carries them today

| quantity | on a board today? | where |
|---|---|---|
| **lineup confirmation** | **YES** | `luConfirmed`, `luPct`, `achievable` on `GenIndexEntry` (`board-store` L51–60); `liveCoverageOf` counts `lu` over **unstarted** games |
| **minutes to first pitch** | **YES** | `gameInfo[gkey].start`, frozen into `entry.games` at lock |
| **board age** | **YES, and already used** | `lockMaxAgeMin` = 30 (L3389–92) |
| **price stability** | **NO** | a board is a single snapshot — it cannot show whether a price moved |

### 3.2 🔴 FIRST BRANCH FIRES — price stability IS measurable retroactively, at zero credits

`origin/line-history:data/props/*.json` holds **18 day-files (2026-07-12 … 07-31)**, each with up
to 5–6 timestamped snapshots carrying per-event `markets`. **The same `player|line` row across
snapshots within a day is a price path.** That is exactly a stability measurement, it is already
paid for, and it needs **one git fetch and no Odds credits**.

**SO THE ORDER IS: measure the price path first, and let the design follow the measurement.**
Concretely, what the archive can answer without a single new capture: how far a price moves
between the 8am opener and the ~20:48 close; whether that movement is monotone or noisy; whether
it is smaller after lineup confirmation; and therefore whether "lock when prices stop moving" is
a real criterion or a description of noise.

### 3.3 Parameters must be measured, not chosen — this is the whole point

**T = 0.80 is the 42nd chosen-not-fitted parameter.** A lock-time rule built on another chosen
threshold inherits exactly the defect it was meant to fix. Every parameter of a lock condition
(a coverage floor, a minutes-to-pitch floor, a price-movement tolerance) must come **out of the
props archive or the board archive**, with its distribution printed and its own denominator
stated.

### 3.4 The identity trap, and how its guard gets observed red

The withdrawn early-generation guard was an **identity — `x >= x`, unfailable**. The analogue
here is a lock condition computed from the same board it gates: *"lock when this board's
`achievable` ≥ this board's `luPct`"* is true by construction whenever the denominator matches.

**A lock-condition guard must be observed red on a REAL artifact, and two now exist:** the
archived **2026-07-26** board and the **18 props day-files**. The test is: take a real board,
perturb the quantity the condition reads, and prove the condition **flips**. If no perturbation
of real data can make it false, it is an identity — the same finding as before, caught earlier.

### 3.5 IMPOSSIBLE BRANCH — no lock fires automatically, but two REFUSALS already do

**No existing lock fires on an automatic condition.** Every lock is user-initiated. **But
`shLockCard` already contains two automatic conditions that BLOCK one:** the 30-minute price-age
guard (L3389–92) and the 10%-of-bankroll exposure cap (L3399–401). **The mechanism for
"the engine decides a lock is not allowed right now" therefore already exists and is proven in
production code** — auto-lock is the inversion of a pattern already present, not a new one.

---

## 4. THE LEARNING HALF RUNS ON THE PAUSED JOB

### 4.1 What `/api/calibrate` actually does, split by what reaches the engine

| stage | line | writes | **engine input at runtime?** |
|---|---|---|---|
| **grading** — `gradePrediction` per record | L193, L212, **L226** | `pl:pred:<date>` | **NO. `pl:pred` is never read by the engine** |
| summary — `computeCalibration` + `fitReliability` + `fitGlobalShrink` | L336, L339, L344, **L444** | `pl:cal:summary` | **YES** — `/api/generate` L195–213 → `effectiveCalibration` → `calW`/`calG` at L245–46 |
| weekly adjustment — `applyWeeklyAdjustment` | L450, **L455** | `pl:cal:weights` | **YES**, same path |

**GRADING IS BOOKKEEPING. THE SUMMARY AND WEIGHTS WRITES ARE THE VINTAGE EVENT.** They are
different computations writing different keys at different lines.

### 4.2 Separable — but not as shipped

**FIRST BRANCH FIRES, with one honest caveat.** They are separable *in principle* and by a
**small change**: a `gradeOnly=1` parameter that returns after L226 and before L444. **As shipped
there is no such flag** — one handler runs both, sequentially. (`force=1` at L120 is unrelated.)

**Grading alone costs ZERO Odds credits** — statsapi box scores + Redis, no Odds API reference
anywhere in the route. So the available-immediately half of the request is real: **grading can
resume on the owner's sign-off, the ledger and the prediction store start accumulating settled
outcomes, and the engine vintage is untouched.** It needs the flag first.

### 4.3 `GRADE_DAYS = 6` on a near-empty ledger

It grades the **6 most recent LOGGED dates per run**, plus stranded retries. **On this ledger it
is not the binding constraint** — a logged date only exists where a board generated, and there
have been **five dark board-days**. The constraint is upstream: no boards, no rows, nothing to
grade. **Settled entries known on disk: ZERO** (the ledger is off-disk entirely).

### 4.4 The tension, stated plainly

**The freeze exists to hold ONE engine vintage per measurement window. Learning from outcomes
means the engine changes as outcomes arrive. These are opposed by design, not by accident.**

**The PARAMETER EXIT is the one meant to resolve it** — it is the exit that licenses changing
parameters on evidence. **Therefore self-learning is a POST-EXIT capability, not a now
capability.** The now capability is **grading**: accumulate the outcomes, change nothing.
That is not a workaround of the freeze; it is the half of the request the freeze was always going
to allow.

### 4.5 IMPOSSIBLE BRANCH — has the fit been updating since the pause?

**NOT VERIFIABLE FROM DISK.** `pl:cal:summary`, `pl:cal:weights`, `weights.log` and `lastRun` are
all server-side. **Read 3 (`GET /api/calibration`, open, zero credits) answers it** — `lastRun`
dates the last fit and `log` shows whether any adjustment ever applied. Recorded as unresolved
rather than assumed.

---

## 5. SEQUENCING — WHAT IS MEASURABLE WHEN

### 5.1 Measurable TODAY at zero credits
1. **Price stability from the props archive** — 18 day-files, one `git fetch`, no Odds credits.
   §3.2. **This is the criterion measurement, and it comes before any design.**
2. **The lock mechanism** — done, §1, traced to lines.
3. **Whether a lock snapshots or re-resolves** — done: it snapshots. §1.3.
4. **What the exit's population is** — done: locked entries, undifferentiated, pooled. §2.1.
5. **Whether grading and fitting are separable** — done: yes, by a small change. §4.2.

### 5.2 Needs THE EXPORT (read 4, zero credits, phrase)
6. **The late-lock magnitude** — count, and the `lockedAt` − earliest-first-pitch distribution.
   Now printed as reading (5) by `ledger-report.mjs`. §1.5.
7. **Whether any locked entry has no corresponding board** — the impossible branch. §1.6.
8. **Whether `confirmed` was ever used** — i.e. whether actual prices were ever recorded at all.

### 5.3 Needs BOARDS
9. Anything about auto-lock's behaviour in production. **Boards have been dark five days; the
   chain is unverified end to end; the cron edits are untested until Monday 2026-08-03 22:45Z.**
   **Created is not fires, fires is not landed, and auto-locking a board that does not generate
   is a mechanism with nothing to act on.**
10. The lock-condition guard's observed-red on live boards (the archived board covers the
    retroactive half only).

### 5.4 Needs THE EXIT
11. **The learning half.** Fitting is a vintage event; the parameter exit is what licenses it.
    §4.4.

### 5.5 The prerequisite that is not on any of those lists
12. **The `placed` flag and an actual-stake field.** They gate auto-lock outright (§2.2), they
    are cheap, and **every day they do not exist is a day of ledger data that cannot later be
    separated into selected-versus-bet.** If anything from this memo is built first, it is this —
    and it is useful even if auto-lock is never built.

---

## THE IMMEDIATE STATE — UNCHANGED BY ANY OF THE ABOVE

- **The pool reset to 19,958 / 42 used** (2026-08-01T01:35:56Z). **Credits are no longer the
  binding constraint — the residual is.**
- **The four reads are still the gate, and none has run.**
- **The Vercel function log is the single determinant of the calendar** (§8A.4 of the handoff): at
  48.3/h the residual drains 19,958 in ~17 days.
- **The fire block stands at 15:38 PT (22:38Z), Sat 2026-08-01**, byte-identical since `03c4ae4`.
- **Nothing in this memo ships. It is a memo.**

---

# MEASURED — 2026-08-01, at a pool of 19,958 (owner's items 1–4)

## §M1 THE PRICE PATH — MEASURED, AND IT DOES NOT ANSWER THE QUESTION

`node tools/price-path.mjs <props-dir>` — zero Odds credits, reads the already-paid archive.
**|Δ `fair`| in percentage points, each earlier snapshot against that event's LAST archived
snapshot, bucketed by the earlier snapshot's minutes-to-first-pitch.**

**DENOMINATORS: 17,546 observations · 7,266 distinct rows · 149 distinct games · 16 fixture-days.**
Reference-snapshot lead: median **155 min** before first pitch (min 1, max 775) — **so every figure
is a LOWER BOUND**; movement to a reference 155 minutes out cannot include what a true close adds.

| bucket (min to first pitch) | n | rows | mean | sd | p50 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|
| **>180** | 17,000 | 6,960 | **1.20** | 1.24 | 0.86 | 2.78 | 5.59 | **11.42** |
| **120–180** | 477 | 477 | **0.45** | 0.66 | 0.27 | 1.14 | 3.32 | 6.35 |
| **90–120** | 69 | 69 | **0.46** | 0.46 | 0.38 | 1.04 | 1.97 | 1.97 |
| **60–90** | **0** | — | — | — | — | — | — | — |
| **30–60** | **0** | — | — | — | — | — | — | — |
| **10–30** | **0** | — | — | — | — | — | — | — |
| **<10** | **0** | — | — | — | — | — | — | — |

### 🔴 THE ANSWER IS "NO KNEE, BECAUSE THERE IS NO DATA WHERE THE KNEE WOULD BE"

**n is not small in the four tightest buckets. It is ZERO.** The archive cannot speak at all about
the region a lock-time criterion would operate in. **The owner's "n too small" branch fires, in its
sharpest form.**

**AND THE REASON IS STRUCTURAL, NOT BAD LUCK.** An observation needs the **same row in two
snapshots** of one event. Across the whole archive there are **631 snapshot-events**, of which
**55 sit inside 120 min, 27 inside 90, 20 inside 60** — and those tight ones are almost always the
*last* snapshot for their event, which is the reference and is excluded by construction.
**Populating the tight buckets requires TWO captures inside the window, and the current cadence
takes at most one.** No amount of waiting fixes this; only a cadence change would.

**THE APPARENT KNEE AT >180 → 120–180 (0.38×, 1.20 → 0.45 pp) IS A HORIZON ARTIFACT, NOT A KNEE.**
The `>180` bucket runs out to 1,180 minutes, so its observations are measured over a much longer
gap to the same reference — more elapsed time, mechanically more movement. **It is not evidence
that prices settle at 180 minutes.** The honest reading of 120–180 vs 90–120 is **1.01× — flat**.

### THE VARIANCE IS THE FINDING THE MEAN HIDES

At >180: **mean 1.20, median 0.86, p99 5.59, max 11.42.** The tail is ~13× the median. A criterion
tuned to the mean **fires early on exactly the rows that move most** — which is the failure the
owner named in advance.

### MOVEMENT DIFFERS BY MARKET — SO A CARD-LEVEL LOCK TIME IS WRONG

| market | >180 | 120–180 | 90–120 |
|---|---|---|---|
| `pitcher_strikeouts` | 1.73 (721) | **1.19** (16) | 0.82 (3) |
| `pitcher_outs` | 1.70 (569) | **1.17** (13) | 0.49 (1) |
| `batter_total_bases` | 1.21 (5,360) | 0.41 (160) | 0.58 (22) |
| `batter_hits` | 1.18 (5,468) | 0.34 (150) | 0.43 (23) |
| `batter_hits_runs_rbis` | 1.06 (4,882) | 0.46 (138) | 0.30 (20) |

**In the 120–180 window the pitcher markets move ~3× the batter markets** (1.17–1.19 vs
0.34–0.46). **The owner's per-market branch fires: a single card-level lock time is wrong and the
criterion is per-leg.** What that does to the design: a card cannot be locked as a unit on a price
criterion — either each leg locks when *its* market settles (and a parlay's legs then lock at
different times, which the current one-entry-per-day ledger shape cannot represent), or the card
locks on the **latest-settling leg**, which makes the pitcher markets the binding constraint for
every card containing one.

### `batter_home_runs` HAS NO `fair` ANYWHERE IN THE ARCHIVE

Every HR row carries `fair: null` — only two-sided cross-book rows get a devigged fair. **Any
criterion computed on `fair` is structurally blind to HR.** Named because HR is 9,578 rows, a
third of the paired sample, and its absence is invisible unless checked.

### 🔴 MY OWN TOOL FABRICATED 9,578 OBSERVATIONS ON ITS FIRST RUN — THE SAME CLASS, AGAIN

The first version read `Number(r.fair)`. **`Number(null)` is `0` and `Number.isFinite(0)` is
`true`**, so every HR row became a **perfect zero-movement observation**: it printed
`batter_home_runs 0.00` across every bucket and dragged the pooled >180 mean from **1.20 down to
1.07**. Caught by dumping one real row. **Third tool in three days found broken on real input.**
Fixed with a strict extractor (`typeof === "number"`), and the note is in the source at the line
that caused it.

### IMPOSSIBLE BRANCH — movement near zero at every horizon: DOES NOT FIRE, but with a caveat
Movement is **not** near zero (1.20 mean, 11.42 max at >180). **However `lockMaxAgeMin` is on a
DIFFERENT AXIS: it is BOARD AGE, not minutes-to-first-pitch.** This curve does not fit it. **The
measurement that would**: |Δ `fair`| over a fixed elapsed gap, which the archive supports at ~40–90
min gaps (MIN_GAP is 40 min) but **not at exactly 30**. So `lockMaxAgeMin = 30` remains **unfitted
by this measurement**, and §M4 records what it would take.

## §M2 ITEM 1 — THE `placed` SPEC, AND IT IS ADDITIVE

**IMPOSSIBLE BRANCH — does an existing field already distinguish them? NO.** The nearest is
`confirmed` (per ticket, `number | null`), which records **the actual PRICE** and is settable only
until that ticket's first pitch. It does not record whether a bet was made, and a ticket can be
placed at the locked price with `confirmed` left null. **`confirmed` covers actualPrice; it does
not cover placement, and it does not cover stake.**

| field | shape | why |
|---|---|---|
| `placed` | `true \| false \| null`, **absent ⇒ null** | null = unanswered · false = deliberately not placed · true = bet. The exit needs all three, and absent-means-null is what makes it additive |
| `actualStake` | `number \| null`, per ticket | `stake` is and stays the ENGINE's allocation. Never overwrite it |
| `actualPrice` | **not needed — `confirmed` already covers it** | but its pre-first-pitch-only window is a real limit, recorded here |

**ADDITIVE, WITH NO ENGINE-STRING CHANGE — the first branch fires, ship on sign-off.** The path:
`shLockCard` (inside the engine string) writes **nothing new** — the fields are absent at lock,
which is exactly `null`/unanswered. They are set afterwards from the **React ledger page**
(`app/ledger/page.tsx`, outside the engine string) and PUT back through `/api/ledger`. **No engine
string, no hash move, no re-verification of the served chunk.**

**THE ONE NON-OBVIOUS REQUIREMENT, or a two-device merge eats them silently.** `mergeDay`
(`ledger-merge.ts` L85–99) deep-clones the **base** entry and then overlays only three things from
the loser: `grading`, `clv`, and per-ticket `confirmed` (L95–97). **A new field on the losing copy
is DROPPED**, and `pickBase` ranks by `[gradeScore, clvCount, confirmedCount, jsonLength]` — it
does not know about placement, so **the copy without the placement data can win.** So the change is
three parts: the UI control, an **overlay rule in `mergeDay` shaped exactly like `confirmed`'s**,
and a `pickBase` key so a placement-bearing copy outranks one without.

**DEFAULT-PLUS-CORRECTION IS THE WRONG SHAPE HERE.** A default of `placed: true` would silently
re-create the exact ambiguity the field exists to remove — an unanswered entry would be
indistinguishable from an attested one. **A UI control that starts at null and requires a tap is
more error-prone in the sense that it can be left blank, and that is the point: blank must be
visible.** Recommended: a three-state control on the ledger row, plus a count of unanswered
entries shown at the top of the ledger page so blanks are loud.

**GUARD, OBSERVED RED FIRST:** an entry created after the ship date lacking `placed` fails a new
test — with the date as the discriminator so the historical entries stay legal and are reported as
a named, counted, permanently-unanswerable population.

### DATED TODAY, WHILE IT IS STILL ANSWERABLE: was locked the same as placed?

**Nothing on disk can answer it, and nothing ever will be able to.** What the owner would have to
**attest**, in his own words and dated: *for every locked day to 2026-08-01, was every locked
ticket actually bet, at the recorded stake?* What the export can **corroborate but not prove**:
`lateLock` (a late lock is a candidate for "locked but not bet"), `confirmed` (a recorded actual
price is evidence a bet happened), and **stake against the 2% rule** — a locked ticket above 2% of
that entry's `bankroll` was either not bet, or bet against the rule, and either answer is
informative. `ledger-report.mjs` reading (1) already prints the ratios; reading (5) prints the
late-locks. **The attestation is the only source; the export is the cross-check.**

## §M3 ITEM 4 — THE REFUSALS

**HAS EITHER FIRED? NO EVIDENCE EXISTS, AND NONE CAN.** A refused lock calls `shStatus(...)` and
**returns before `shLedgerSave`** — nothing is persisted, on any path. The ledger records successes
only. **The sole possible evidence is the owner's memory of the on-screen message.** The owner's
first branch fires: **these are unexercised-in-production protections that auto-lock would depend
on**, and that belongs above the design.

**ARE THEY SILENT? NO — the third branch does NOT fire.** Every refusal calls
`shStatus(msg, true)` with the numbers in the message: *"Lock blocked — this board is Xm old and
the prices may no longer be live (limit 30m)"* and *"Lock blocked — $X staked would be Y% of the
$Z bankroll (cap 10% = $C)"*. **This is the opposite of the zero-suppresses-explanation class: the
refusal states the quantity, the threshold, and the remedy.** No M-item.

**ARE THE SIX ENCODED-GUARDED?** Partly, and better than expected — **corrected from my own first
reading, which assumed not**: `tests/lock-price-age.test.ts` covers the price-age refusal,
`tests/sizing-discipline.test.ts` references `dailyBankrollCap`, and
`tests/legacy-harness/int40lock.js` covers the re-lock refusal (*"re-lock refused, entry
unchanged"*) plus `lateLock === false` on a frozen pregame clock. **What no test covers is a
refusal firing against a REAL card** — the guard-wiring distinction this session has been about.

**`lockMaxAgeMin = 30`: CHOSEN, and I could not find it in the census's parameter table.**
`dailyBankrollCap 0.10` **is** registered (`collection-period.md` L610). `lockMaxAgeMin` appears in
prose (L2586 *"by design, daily"*, L3366) but not in that table. **Flagged as a census question,
not asserted as an omission** — if it belongs there the count moves 42 → 43. **Either way it is
chosen, not fitted, so the owner's second branch fires: item 2 is what would fit it — on the board-
age axis, which §M1 shows this curve is not.**

---

# MEASURED — 2026-08-01, second pass (owner's items 1–3, 5)

## §M5 THE CAPTURE GAP — IT IS THE CADENCE, AND MIN_GAP IS NOT THE BLOCKER

**WHAT WOULD POPULATE 60–120: two captures per game inside that window.** A 60-minute-wide window
admits a pair **40+ minutes apart** (e.g. at ~115 and ~70 minutes to first pitch), so **`MIN_GAP_S`
= 40 min DOES NOT BLOCK IT.** The owner's MIN_GAP branch does **not** fire for this bucket.

**WHERE MIN_GAP *IS* THE BINDING CONSTRAINT: the 10–30 and <10 buckets.** Two captures 30 minutes
apart are refused by `_snapshot_kind` (L163 for closes, L174 for any paid snapshot). **That floor
was fitted against duplicate suppression** — cron clusters landing together and paying twice
(L166–175, measured 07-28/29) — **and it now forecloses a different measurement it was never
evaluated against.** Cost of lowering it: the duplicate-suppression it was bought for. **Named as a
parameter conflict; not changed.**

**TARGETED IS CHEAPER THAN BROAD.** The morning sweeps captured **13–15 events**; the archived
closes captured **3–14** (median ~5). A capture restricted to events with first pitch inside the
next 120 minutes therefore costs roughly **4–9 events ≈ 24–54 credits**, so **a pair is ≈ 48–108
credits/day** — against a pool of 19,958 and a props line already at 162–185/day. **Affordable by
an order of magnitude.**

**`--wait` DOES NOT ADDRESS THIS.** `_wait_for_window` (L199–217) sleeps until the next unstarted
first pitch is within `CLOSE_WINDOW_S`, then returns — **the caller takes ONE snapshot and exits.**
It produces **one** capture, not two. It fixes *when* the single capture lands, not *how many*
land. **The owner's `--wait` branch does not fire**: shipping the redesign does not close this gap.

**IMPOSSIBLE BRANCH — does any archived day already carry two captures inside 90 minutes for one
event? NO.** Derivable from the curve itself: two such captures would produce an observation in the
60–90 bucket or tighter, and **all four of those buckets are empty**. 27 snapshot-events sit inside
90 minutes across the whole archive; **no two of them share an event on a day.**

**THE DEADLINE, PLAINLY: 52 usable fixture-days between 2026-08-01 and 2026-09-22 at one board per
day.** Every day without the second capture is a fixture-day the price path can never see, and it
is unrecoverable — the prices are gone. **The cron diff is not written here** (this is a memo); the
shape is a second targeted cron ~45 minutes after the existing close band, restricted to the
next-120-minute event set.

## §M6 `batter_home_runs` — THE ARCHIVE IS BLIND, PRODUCTION IS NOT

**TRACED, and it is a MISSING COMPLEMENTARY SIDE, not a de-vig failure or a parser gap.**
`compact()` computes a fair only inside `if "o" in pair and "u" in pair` — it needs **both sides
from the same book**. Measured across the archive:

| | HR rows |
|---|---|
| total | **21,300** |
| with a numeric `fair` | **0** |
| with **both** `bo` and `bu` | **0** |
| with only `bo` (over) | 13,099 |
| with only `bu` (under) | **0** |
| with neither | 8,201 *(a separate anomaly — unresolved, recorded)* |

**No HR row anywhere in the archive has an under side**, so `r["fairs"]` is never appended and
`fair` is `None` by construction. Fair coverage elsewhere: HRR **100%**, K's **100%**, hits
**98.1%**, outs **96.5%**, TB **92.8%**, **HR 0.0%**.

**PRODUCTION IS NOT BLIND — THE OWNER'S SECOND BRANCH FIRES, AND THE IMPOSSIBLE BRANCH FIRES TOO.**
On the archived **2026-07-26** production board: **50 HR rows of 303, all with finite `prob` AND
finite `implied`** (sample: `yordanalvarez|batter_home_runs|0.5`, prob 32.4, implied 30.9, cz 180),
and **49 HR legs in built tickets**. **Something priced it: the engine, from a one-sided over
quote.** So this is a **COLLECTION defect in the archive's schema**, not a pricing failure — and
the first branch (*"HR has never been priceable, M-number"*) **does NOT fire.**

**WHAT RESTATES: every `fair`-based measurement over the props archive silently excluded HR.**
The one produced this session is §M1's price path — **21,300 HR rows dropped**, already stated
there. **Any other market-level decomposition drawn from the archive's `fair` inherits the same
hole and must name it.** The archive's own `bo`/`cz`/`no` fields are unaffected, so
CZ-coverage-style findings stand.

## §M7 THE COERCION CLASS — FOURTH INSTANCE, TWO MORE LIVE SITES FOUND

**WHAT WOULD HAVE CAUGHT `Number(null)`: a strict parse at the boundary, which is exactly
`finite-prices`' rule applied to TOOL INPUT instead of engine output.** It is encodable as one
helper: **`tools/strict.mjs`** — `num` (a finite number or null, never a coercion), `req` (or throw,
naming the field), `numFromText` (for headers and CLI args, where `null`/`""` must still not become
0). **Shipped, with plants, observed red.**

**THE AUDIT FOUND TWO MORE LIVE SITES, both in tools scheduled to run tonight:**

| site | what it did silently | now |
|---|---|---|
| **`quota.mjs`** `Number(headers.get(...))` | `get()` returns **null** when absent → `Number(null)` is 0 → **the guard whose message reads "quota headers absent" COULD NOT FIRE.** It would have appended **`remaining: 0, used: 0`** — a fabricated "pool exhausted" row — to the append-only series | **refuses, prints both raw header values, appends nothing** |
| **`ledger-report.mjs`** `Number.isFinite(Number(e.lockedAt))` | a null `lockedAt` passed as **epoch 0**, so the entry read as locked ~30 million minutes *before* first pitch — **"not late", in the reading added to measure late locks** | **strict; the entry falls to the impossible-branch count** |
| `ledger-report.mjs` `Number(r.czEv) < 0` | an **absent** czEv scored as "not negative" rather than unknown — under-counting the census | **counted separately as `czEvUnknown`** |

**SITES WHERE null→0 IS LOAD-BEARING AND CORRECT — the impossible branch fires, and they are
documented rather than changed:** `bySrc[src] ?? 0`, `byReason[...] ?? 0`, `(m[r.market] ?? 0) + 1`
and `s.events?.length ?? 0` are **accumulator initialisers**, where "absent" genuinely means "none
counted yet". `board-report`'s `r.cfSel.stake ?? 0` is safe **only because** `missingRank` counts
those same rows separately — the null is reported, not absorbed. `ledger-report`'s
`r.ceiling ?? 0` is safe **only because** `over` already excludes null-ratio rows upstream.

**THE COUNT, RATCHETED: 6 raw `Number(` sites remain in tool code** (all in `amToDec` / `amToProb`
/ `kellyFrac`, whose callers null-guard first), pinned by `tests/strict-coercion.test.ts` so a new
one cannot appear silently. **And that ratchet itself had to be corrected**: keying on lines
starting with `*` or `//` counted the prose *explaining* the trap as instances of it — 10 reported
against 7 real — so it now strips comments before scanning. A guard that cannot tell code from a
comment about code is measuring the wrong artifact.

## §M8 `lockMaxAgeMin` AND THE CENSUS

**IT BELONGS.** It is a chosen numeric threshold that gates a write to the ledger, exactly like
`dailyBankrollCap` (registered, `collection-period.md` L610). **Recommendation: register it —
42 → 43 — with the count restated everywhere it appears.** Not done here: a census change is the
owner's, and the count appears in several docs and in the bundle.

**WHAT WOULD FIT IT: board age against price movement since generation.** The join is
**possible in principle and not available today.** It needs a board's generation time (`board.at`,
present on every archived board) matched to props snapshots of the same event bracketing it — but
**the board archive holds exactly ONE day (2026-07-26)** against 18 props days, so the join has
`n = 1` board. **It becomes measurable as the board archive fills**, and it is a different
measurement from §M1's, on the axis that actually gates the lock.

**THE FULL CENSUS SWEEP IS NOT DONE, and I am not reporting a number for it.** An automated pass
over `SH_CFG` returned 264 "keys" and 189 "missing" — it had captured JSON-schema fields, nested
game objects and prose, not tuning parameters. **That output is not a finding and is discarded.**
A valid sweep needs a curated list of `SH_CFG`'s numeric tuning parameters checked against the
census's own table. **Named as outstanding.**

## §M9 THE OWNER'S ATTESTATION — DATED 2026-08-01, RECORDED BEFORE IT BECOMES UNANSWERABLE

> **"Every ledger entry to date was placed. I locked what I bet and bet what I locked."**
> — the owner, 2026-08-01

**This is his statement and it is not corroborated by anything on disk.** The only cross-checks
that exist are indirect and are named as such: **`lateLock`** (a late lock is a candidate for
locked-but-not-bet), **`confirmed`** (a recorded actual price is evidence a bet happened), and
**stake against the 2% rule** (`ledger-report` reading (1)). **It is recorded now because after
auto-lock exists the question is meaningless** — the ledger would hold engine selections and no
field would separate them from placements. Every entry dated **on or before 2026-08-01** is covered
by this attestation; every entry after it requires the `placed` field.

---

# 2026-08-01, third pass (owner's items 1–5)

## §M10 THE QUOTA SERIES IS CLEAN — SAID AS PLAINLY AS THE OTHER BRANCH WOULD BE

**All 21 rows in `data/quota-log.jsonl` satisfy `remaining + used == 20,000`. Zero failures. Zero
rows with `remaining: 0`. Zero duplicate timestamps. Zero non-monotone rows inside a period.**

**→ THE FIRST PRE-COMMITTED BRANCH FIRES. The series is clean, the burn investigation's inputs
stand, and the coercion defect was PROSPECTIVE — nothing on disk restates.** No burn figure, no
runway band, no residual conclusion, and not the 146.

| # | at | remaining | used | sum |
|---|---|---|---|---|
| 1–5 | 07-28T23:00 → 07-31T01:25 | 2317 · 1676 · 1461 · 1238 · 1038 | 17683 · 18324 · 18539 · 18762 · 18962 | 20000 ×5 |
| 6–8 | 07-31 04:50 → 06:41 | 1038 ×3 | 18962 ×3 | 20000 ×3 |
| 9–13 | 07-31 13:57 → 16:10 | 699 ×5 | 19301 ×5 | 20000 ×5 |
| 14–20 | 07-31 19:11 → 21:04 | 553 ×7 | 19447 ×7 | 20000 ×7 |
| **21** | **08-01T01:35:56.369Z** | **19958** | **42** | **20000** |

**THE IDENTITY HOLDS ACROSS THE RESET TOO** — 553+19,447 and 19,958+42 both equal 20,000 — **so it
is NOT a reset detector. It is a FABRICATION detector**, which is the shape actually needed: the
coercion defect's output was `{remaining: 0, used: 0}`, which sums to 0 and fails. The reset needs
its own witness, and `burnSeries` already uses one (`remaining` rises **or** `used` falls) →
`spent: null`, `reset: true`.

**ENCODED AT WRITE TIME**, because the log is append-only and a bad row could only ever be
addended, never removed: `violatesIdentity()` in `quota.mjs` now throws before the append.
Guard in `tests/strict-coercion.test.ts` with the plant, observed red on the defect's exact output.

**IMPOSSIBLE BRANCH (two rows, same timestamp, different values): does not fire — zero duplicates.**

## §M11 THE 8,201 ROWS ARE SCHEMA VINTAGE, NOT A PARSER GAP

**A "neither-side" row, verbatim** (`2026-07-12.json | pitcher_outs | Robert Gasser|17.5`):
```json
{ "fair": 0.4809, "n": 4, "cz": { "o": -110, "u": -121 } }
```
**It is not empty. It carries a fair, a book count, and a two-sided Caesars price.** What it lacks
is the `bo`/`bu`/`fb`/`czf`/`no` KEYS — they are **absent from the object**, not null.

**AND THE SPLIT IS EXACT, BY DATE, NOT BY MARKET:**

| files | rows | rows carrying `bo`/`bu` |
|---|---|---|
| **2026-07-12 → 07-25** (12 files) | 21,323 | **0 — 100% "neither"** |
| **2026-07-26 → 07-31** (6 files) | 34,843 | **34,843 — 100% present** |

`compact()`'s own docstring dates the extension **2026-07-25**; it first reaches the archive on
**07-26**. The ~38% rate was uniform across all six markets because it is a **fraction of the
archive's history, not a property of any market.**

**SO: the "spans markets" TRIGGER fires but the branch's PREMISE does not.** It is not a parser
gap and it takes **no M-number**. And the "empty rows inflating a denominator" branch does not fire
either — the rows are not empty.

**🔴 IMPOSSIBLE BRANCH FIRES, IN LETTER: a neither-side row DOES carry a price under a different
key** — `cz: {o: -110, u: -121}`, both sides, in a row with no `bo`/`bu`. **Both printed above.**
The correct reading is **not** "the parser reads the wrong field": `cz` (Caesars) was always
captured, `bo`/`bu` (cross-book bests) were added later. **The parser reads the right field; the
field did not exist yet.**

**WHAT THIS CORRECTS IN §M6:** "8,201 with neither (a separate anomaly — unresolved)" is
**RESOLVED and was never an anomaly**. The HR finding is *unaffected and slightly stronger*:
**`fair` is 0 for HR in BOTH schema vintages** — 0 of 21,300 across all 18 files — so it is not a
schema artifact. Restated precisely: **of the 13,099 HR rows written by the CURRENT schema, all
carry an over price and none carries an under.**

**DENOMINATOR EXPOSURE, named rather than swept:** any figure computed over "archived rows" that
assumes `bo`/`bu`/`no`/`fb` exist silently sees **21,323 rows (38% of the archive) as missing
them**. `fair` is present in both vintages, so §M1's price path is unaffected. **I found no such
figure this turn; I did not do an exhaustive sweep and am not claiming one.**

## §M12 ITEM 3 — THE TARGETED CAPTURE, PROPOSED. NOT APPLIED.

**IT IS TWO CHANGES, NOT ONE**, and that matters: the workflow alone cannot do it, because
`snapshot_props.py` currently takes `todays[:16]` where `todays` is *anything within 20 hours*.

**(a) `tools/snapshot_props.py`** — add a `--window MIN` flag; when set, restrict `todays` to
events whose first pitch is inside MIN minutes. Additive, default off, no behaviour change to the
existing four crons.

**(b) `.github/workflows/props-history.yml` ON `main`** — two crons, and **no existing cron moves**:

| declared | measured landing | lead to a 23:05Z first pitch | bucket |
|---|---|---|---|
| `10 18 * * *` | ~21:1x | **~115 min** | **60–120** ✓ |
| `55 18 * * *` | ~21:5x | **~70 min** | **60–120** ✓ |

**Spacing ~45 min ≥ `MIN_GAP_S` 40** ✓. Gaps to the neighbours: 20:0x → 21:1x ≈ 70 min ✓;
21:5x → 23:3x ≈ 100 min ✓. **Nothing collides, so the retained four stay exactly where they are.**

**EXPECTED EVENT COUNTS AND COST:** at ~21:1x the next-120-minute set is roughly the 22:0x–23:1x
block, **~3–8 events**; at ~6 credits/event that is **~18–48 per capture, ~36–96/day for the
pair** — against a pool of 19,958 and an existing props line of 162–185/day.

**VINTAGE STAMP + SERIES SEGMENTATION:** the props series segments **pre/post first landing**, and
**the information cost here is a GAIN, not a loss** — the 60–120 bucket goes from structurally
empty to populated. Nothing already captured is degraded, and no existing figure restates.

**PRE-COMMITTED LANDING TEST:** on the first day it runs, `node tools/price-path.mjs <dir>` must
print **n > 0 in the 60–120 bucket**. **Zero means it did not land and the pair spacing is wrong**
— not that prices do not move. Print both crons' actual delivery times beside it.

**ALSO REQUIRED:** the divergence goes on `tests/workflow-branch-sync.test.ts`'s **expiring
allow-list**, dated, naming the decision that ends it.

**AWAITING THE WORD. The diff is printed in the turn, not applied.**

## §M13 ITEM 4 — BACKFILL: THE RULE SAYS ADDENDUM, NOT FIELD WRITE

**Writing `placed: true` into historical locked entries would be a FOURTH mutable subfield on a
locked row — and that is exactly the class M22 already flags.** The store's rule is *"no
retroactive edits, ever"* (L3394), with a **named, enumerated** exception list of three
(`confirmed`, `grading`, `clv`). Adding a fourth to make a field convenient is the move the rule
exists to prevent.

**THE RULE-FOLLOWING FORM IS AN ADDENDUM, and it is also the better instrument.** The attestation
is already recorded and dated (§M9). The exit's reader resolves it at READ time: *an entry dated
on or before 2026-08-01 with no `placed` field is `placed: true` BY ATTESTATION, dated
2026-08-01.* That keeps the exit's population complete from day one **and** keeps an attested true
distinguishable from a recorded true forever — which a field write destroys. If the attestation is
ever qualified, **one line changes instead of N rows.**

**Recommendation: addendum. The call is the owner's.**

## §M14 ITEM 5 — WHAT A CORRECT CENSUS SWEEP WOULD REQUIRE: JUDGMENT

**APPLIED: census v2.3 → v2.4, 42 → 43**, `lockMaxAgeMin` registered beside `dailyBankrollCap`
with its rationale and what would fit it. Count restated in all four places it appears
(`session-handoff.md` L740; `collection-period.md` L205–206, L695, L4021).

**A frozen parameter is: (1) a literal in the engine's own config or constants, (2) whose value
enters a pricing, selection, sizing, or admission decision at runtime, (3) not derived from data.**

**(1) is mechanical** — scope to the `SH_CFG` object literal, excluding nested schemas. **(3) is
mechanical** — a fitted value has a fitting procedure. **(2) IS NOT.** Deciding whether
`funTierNames` (display), `roundTo` (presentation), `seasonEnd` (calendar) or `lockMaxAgeMin`
(admission) *enters a decision* requires reading what consumes it. My automated attempt returned
264 "keys" and 189 "missing" precisely because it could not make that call — it counted JSON-schema
fields and prose numbers as parameters. **That output was discarded, not reported.**

**→ THE CENSUS STAYS HAND-MAINTAINED, WITH A GUARD ON THE COUNT RATHER THAN ON MEMBERSHIP.**
A membership guard would encode the judgment it cannot make; a count guard cannot invent a
parameter, and it fails loudly the moment the number moves without the table moving with it.
`lockMaxAgeMin` sat unregistered while its structural twin was registered from the start — **that
is the failure mode a count guard catches and a membership guard would have papered over.**

---

# HR PAIR STRUCTURE RULE — MEASURED FIRST (memo section, 2026-08-01, owner's proposal)

**NOTHING SHIPS.** The proposal: *no two players from the same team on a HR parlay*, on the stated
reason that two teammates both homering is **less** likely than two homers spread across teams or
games.

## §H1 THE CLAIM IS BACKWARDS. MEASURED, NOT ARGUED.

`node tools/hr-pair-dependence.mjs 2026-04-01 2026-07-31` — statsapi, **zero Odds credits**.
**1,605 final games · 120 dates · 610 hitters.** Pooled P(≥1 HR in a game with a PA) = **0.1067**.
Ratio = observed joints ÷ Σ p_i·p_j. **Above 1 is positive dependence.** 95% CI from a **cluster
bootstrap over games** (dates for stratum c) — pairs inside one game are not independent draws.

| stratum | pairs | joints | **rate-matched ratio [95% CI]** | raw ratio |
|---|---|---|---|---|
| **(a) same team, same game** | 151,787 | 1,877 | **1.103 [1.048, 1.168]** | 1.087 |
| **(b) opposing teams, same game** | 166,424 | 2,020 | **1.065 [1.022, 1.140]** | 1.067 |
| **(c) different games, same slate** | 120,640 | 1,346 | **0.982 [0.893, 1.071]** | 0.981 |

**🔴 THE SECOND PRE-COMMITTED BRANCH FIRES, AND IT IS NOT SOFTENED: the claim is backwards.**
Two teammates homering in the same game is **~10% MORE likely than independence, not less**, and
the interval excludes 1. **A rule banning the pair would remove positively-correlated legs.** For a
parlay — where every leg must hit — positive dependence means the true joint probability is
**higher** than an independence price implies. **Those are the pairs a parlay bettor is helped by,
and banning them removes the structure rather than pricing it.**

**THE IMPOSSIBLE BRANCH DOES NOT FIRE.** Raw 1.087 vs rate-matched 1.103 — same sign, similar
magnitude. **The result is not selection**: pairing two high-rate hitters explains almost none of it.

**THE ORDERING IS THE MECHANISM, AND IT CUTS AGAINST THE CLAIM EXACTLY AS PRE-COMMITTED.**
(a) 1.103 > (b) 1.065 > (c) 0.982. Same team shares park, weather **and** the opposing starter;
opposing teams share park and weather but face different pitchers; different games share nothing.
**Stratum (c) is the control and it behaves perfectly — no dependence, interval spanning 1.**
Shared game-level inputs are the explanation, and they push (a) up, not down.

**THE FOURTH BRANCH — is the right unit same-game rather than same-team?** Directionally yes, but
honestly: **the (a) and (b) intervals overlap substantially** ([1.048, 1.168] vs [1.022, 1.140]).
**Same-GAME is the well-supported unit; the same-TEAM increment over it is not separable at this
n.** The owner's phrasing picks the narrower unit and the data does not support that boundary.

**LINEUP ADJACENCY IS NOT THE MECHANISM.** If consecutive hitters facing one pitcher in one inning
drove it, adjacent pairs would show the largest effect. They do not:

| lineup gap | pairs | joints | ratio [95% CI] |
|---|---|---|---|
| 1 | 32,735 | 442 | 1.100 [1.046, 1.247] |
| 2 | 28,507 | 380 | 1.108 [1.021, 1.168] |
| 3 | 24,415 | 333 | 1.153 [1.116, 1.321] |
| 4 | 20,413 | 233 | 1.026 [0.889, 1.109] |
| ≥5 | 41,651 | 478 | 1.161 [1.090, 1.222] |

**Flat-to-rising with distance.** The dependence is **game-level** (park, weather, starter, ball),
not batting-order-level.

**KNOWN LIMIT, stated:** p_i is estimated from the same sample the joints are measured in, which
biases the ratio slightly **toward** 1 — so it is conservative for a dependence claim in either
direction, and the true (a) effect is if anything larger than 1.103.

## §H2 WHAT ALREADY CONSTRAINS HR PAIRS — MORE THAN EXPECTED

| constraint | line | scope |
|---|---|---|
| **`coreNoHR: true`** | cfg L1121, enforced **L2975–76** | **DAILY/CORE money NEVER touches HR — the type or any leg whose lkey contains `\|batter_home_runs\|`.** HR lives in FUN only. **NOT `dscpM`-gated: it applies in ALL FOUR MODES** |
| HR line restriction | L2241 | only the **0.5 (anytime)** line is ever ingested — never 1.5+ |
| **`simJoint`** | L2693–2706 | same-**game** groups repriced from joint sim paths, scaled by `jointAll ÷ Π marginals`, **clamped 0.25–4×**; armed only under `shV2Sim()`. **Cross-game independence stands, explicitly** |

**🔴 IMPOSSIBLE BRANCH FIRES: the suspension the owner believes is live does not exist.**
`hrrAltMax` suspends **`batter_hits_runs_rbis`** — H+R+RBI — **not `batter_home_runs`.** There has
never been an HR-anytime suspension. The two are separate markets and the memory conflates them.

**FIRST PRE-COMMITTED BRANCH FIRES: `simJoint` ALREADY PRICES SAME-TEAM PAIRS**, because it groups
by `gkey` and same-team implies same-game. **So the proposal is a request to change a dependence
treatment, not to add a rule** — and §H1 says the change would be **upward**, not a ban. One
correction to the framing though: **there is no rho constant to set.** simJoint's scale factor is
**measured per group from the sims**, not a parameter — its own comment says *"measured from the
sims, joint outcomes, not a guess."* The open question is whether the sim's implied ratio matches
**1.103**, and that is checkable only on a board that contains such a pair.

**THE EXPOSURE, MEASURED ON THE ONLY REAL BOARD WE HAVE (2026-07-26, 168 distinct tickets):**

| | count |
|---|---|
| tickets with ≥ 2 HR legs | **12** |
| HR pairs in them | **81** |
| **same-team** | **0** |
| same-game, opposing teams | **3** (Clemens MIN + Kurtz ATH · Reynolds PIT + Busch CHC · Perez KC + Dingler DET) |
| different games | 78 |

**THE PROPOSED RULE'S TARGET SET IS EMPTY ON THAT BOARD.** Zero same-team HR pairs — an expected
consequence of `coreNoHR` pushing HR into FUN, where tickets are built from a thinner pool.

**LEGACY MODES:** HR legs appear in FUN in every mode, but **`coreNoHR` bars them from CORE in all
four** — so unlike `outsSusp` and `hrrAltMax`, this one is **not** a two-tap exposure and does
**not** join M20's row.

## §H3 CAP vs CORRELATION TERM — MOOT IN ITS ORIGINAL FORM

**Item 3 was conditional on §H1 confirming the claim. It did not.** Recorded rather than designed:

- **A cap** would remove 0 pairs on the 07-26 board and, in general, remove pairs whose measured
  joint runs **10% above** independence. On a parlay that is **removing structure that helps the
  ticket**, so its E[ln] effect is expected **negative** — and the evaluator's known blindness to
  dependence means it would score the removal as roughly neutral, i.e. **the instrument cannot see
  the harm it would do.** That is the strongest argument against acting here at all.
- **A correlation term is already present** and is `simJoint`. It is representable *within* a
  ticket (22 of 25 groups, M16) and **not** across tickets — unchanged by this proposal.
- **The boundary the strata support is same-GAME, not same-TEAM** — and same-game is what
  `simJoint` already keys on. **The engine's existing unit is the one the data supports.**
- **Reversibility:** a cap is a structure constant in the frozen table; `simJoint`'s scaling is not
  a parameter at all. **Neither is the small reversible change the proposal assumed.**

## §H4 VINTAGE — IF ANYTHING WERE TO SHIP

It would be a **structure cap** (frozen table, structure section) — not a model parameter and not a
suspension, since no HR suspension exists to extend. **It moves the engine string, resets the
homogeneous window, and needs the pending-live-verification sequence.** **The vintage cost right
now is ZERO** — the window has been at zero for five dark days, exactly as with the outs flag —
and **it could ride the next hash-moving ship rather than taking its own.** None of that is a
reason to ship it; §H1 is the reason not to.

## §H5 SEQUENCING FOR THIS PROPOSAL

- **Measurable TODAY at zero credits — DONE:** §H1's three strata, the rate-matched control, the
  adjacency split, the existing-constraint trace, and the 07-26 exposure census.
- **Needs the ledger:** whether any HR pair was ever actually placed, and at what result. Read 4.
- **Needs boards:** whether a same-team HR pair ever reaches a card at all (zero on the one board
  we have), and whether `simJoint`'s implied ratio matches the measured **1.103** when one does.
- **Needs the exit:** any change to how dependence is priced — that is a model change, and the
  parameter exit is what licenses it.

**RECOMMENDATION: do not build the rule.** The measurement says it would remove the wrong thing,
the exposure it targets is empty on real data, and the engine already prices the dependence at the
unit the data supports.

## §H6 THE RULE IS DROPPED — A MEASURED REFUTATION, DATED 2026-08-01

**The owner proposed a same-team HR ban on reasoning about baseball. The measurement returned the
opposite sign — 1.103 [1.048, 1.168] against independence — the target set on the only real board
was empty (0 of 81 HR pairs), and the evaluator could not have seen the harm. THE RULE IS DROPPED.**

**IT JOINS THE REASONING-NOT-MEASUREMENT LIST, AND IT IS THE OWNER'S SECOND ENTRY.** The first was
the count-armed accrual argument for the outs ship. **The standing rule holds without exception:
nothing in this project has been found by reasoning about baseball, and that includes the owner's
own proposals.** Recorded in his words.

**AND THE CORRECTION TO HIS OWN FRAMING, kept beside it:** same-**game** is the supported unit;
same-**team** is not separable at this n for HR; the phrasing picked a boundary the data does not
support. *(But see §H7 — for TOTAL BASES the unit reverses, and same-team IS the right one.)*

### Do other structure caps rest on domain reasoning rather than measurement?

| constraint | what it rests on |
|---|---|
| **`coreNoHR: true`** | **🔴 DOMAIN REASONING. Its own comment says "(user rule)"** — *"HR volatility lives in the FUN bucket only."* **No measurement is cited anywhere.** It is a variance argument, never tested |
| `coreMaxLegs: 3` | **MEASURED** — its comment carries the graded record: 2-leg −0.7% on $464; 3+ legs 1-25 |
| `hrrAltMax: −1` | **MEASURED** — the 46.3/59.2 HRR population, with a written retirement criterion (provenance pending the export) |
| `outsSusp: true` | **MEASURED** — M2's interlocked pair, `docs/pitcher-outs-audit.md` DECIDED |
| `coreCzEvMin: 0` | definitional, not empirical — a sign constraint (never lock a negative-EV core ticket) |
| `dailyBankrollCap: 0.10` | chosen bankroll convention, registered as CHOSEN |

**→ THE FIRST BRANCH FIRES, COUNT = 1: `coreNoHR` is a structure cap resting on domain reasoning
alone.** What would settle it: the same box-score method applied to HR-containing CORE tickets'
realised variance versus the FUN bucket's — measurable at zero credits, and **not run.** Recorded,
not acted on. It is also the constraint that made the proposed rule's target set empty, so the
two are entangled and neither should move without the other being re-measured.

## §H7 THE simJoint AUDIT — BLOCKED BY STORED PRECISION, AND THAT IS THE FINDING

**The audit cannot be completed from the archived board, and the reason is not the sims.**

On 2026-07-26, **3 of 196 tickets carry `simJoint: true`** — all three are the same-game HR
tickets. Their stored values:

| ticket | `prob` | `probNaive` | implied ratio |
|---|---|---|---|
| ATH@MIN group (2 legs of 4) | **0.3** | **0.3** | 1.000 *at the stored precision* |
| CHC@PIT group (2 legs of 6) | **0** | **0** | **undefined** |
| KC@DET group (2 legs of 5) | **0** | **0** | **undefined** |

**🔴 `ticket.prob` IS STORED AS A PERCENTAGE ROUNDED TO ONE DECIMAL** (measured: 176 of 196 values
carry 1 dp, 20 carry 0; max 51.7, min 0). At 0.3% the rounding interval is [0.25, 0.35], so the
implied ratio is bounded only to roughly **[0.71, 1.40]** — **an interval that contains BOTH 1.000
(no correction applied) and 1.103 (the measured value).** Two of the three round to zero on both
sides and are unbounded.

**NEITHER PRE-COMMITTED BRANCH FIRES.** The board archive **cannot distinguish "simJoint priced no
dependence" from "simJoint priced it correctly."** That is a **capture/serialisation gap in the one
artifact that would audit the one component that prices dependence** — the same class as the props
archive's structurally-empty tight window, one layer over. **Fix, spec-only: emit the per-group
ratio `j2/pm` onto the ticket directly, or raise `prob`/`probNaive` precision. Additive, echo-only
in shape, and it makes the audit possible on the next board.**

**THE CLAMP:** 0.25–4×. A measured 1.103 sits far inside it, so **the clamp cannot be binding for
HR pairs** — and with n = 1 computable group, nothing can be said about whether it ever binds.
**Impossible branch (implied ratios below 1 where reality shows positive): NOT EVALUABLE at this
precision** — recorded as unresolved rather than absent.

**AND THE AUDIT NEEDS BOARDS ANYWAY:** 3 same-game groups, all HR, on one board. Even at full
precision that is n = 3.

### The reality side, measured for every market the sims group (2026-06-01…07-31, 781 games)

| market | (a) same team | (b) opposing, same game | (c) different games |
|---|---|---|---|
| **HR** *(4-month window: **1.103 [1.048, 1.168]**)* | 1.072 [0.987, 1.239] | 1.039 [0.954, 1.151] | 0.999 [0.867, 1.117] |
| **Hits (≥1)** | 1.013 [0.996, 1.035] | 1.000 [0.983, 1.022] | 1.009 [0.974, 1.046] |
| **Total Bases (≥2)** | **1.063 [1.024, 1.130]** | 0.992 [0.939, 1.054] | 0.990 [0.937, 1.047] |

**🔴 DEPENDENCE IS MARKET-SPECIFIC, AND FOR TOTAL BASES THE UNIT REVERSES.** TB same-team is
positive and its interval excludes 1, while TB **opposing-team is flat** — so **for TB the right
unit IS same-team**, the opposite of HR, where (a) and (b) were both elevated and indistinguishable.
**Hits pairs are effectively independent in every stratum.** A single same-game correction factor is
therefore the wrong shape for all three markets at once, and `simJoint`'s per-group empirical
approach is — in principle — the right one. Whether it delivers is what the precision gap blocks.

**Note on windows:** HR's 2-month interval spans 1 while its 4-month interval excludes it. The
4-month figure is the headline; the 2-month row exists only so the three markets are compared on
one identical sample. **Stated rather than letting the reader assume the HR result weakened.**

## §H8 CROSS-GAME INDEPENDENCE IS NOW EMPIRICALLY CONFIRMED — instrument ledger

**`simJoint` asserts cross-game independence explicitly** (*"Cross-game independence stands"*,
L2691) **and the measurement supports it**: stratum (c) = **0.982 [0.893, 1.071]**, n = 120,640
pairs over 118 date-clusters, **interval spanning 1**, confirmed independently at 0.999 (HR),
1.009 (hits) and 0.990 (TB) on the two-month window. **This is a design assumption verified against
real data, which is rare here — and it is recorded as the rarer finding, not buried.**

**WHAT IT DOES NOT COVER, and the distinction matters:** across-**ticket** dependence is priced
**nowhere** (M16). The 0.982 result speaks only to legs in **different games**. **Two legs in
different tickets on the same card can share a game — and for those, stratum (a)/(b) applies, not
(c).** On the 07-26 board the 78 different-game HR pairs are covered by this confirmation; **the 3
same-game pairs are not**, and neither is any cross-ticket pair sharing a game. **So the
confirmation licenses the cross-game half of the assumption and says nothing about M16.**

---

# 2026-08-01, fourth pass — the cron APPLIED, and `coreNoHR` measured

## §H9 THE TARGETED PAIR IS LIVE ON `main` — read back from origin

**`origin/main` = `b1f17d2`, `origin/frontend-rebuild` = `db660c6`.** Six crons on the firing copy:

```
0 17 * * *    -> 20:0x-20:5x   (unchanged)
10 18 * * *   -> ~21:1x        [--window 120]   NEW
55 18 * * *   -> ~21:5x        [--window 120]   NEW
0 20 * * *    -> ~23:3x        (unchanged, load-bearing: 4 of 8 closes)
0 21 * * *    -> ~00:1x        (unchanged, load-bearing: 3 of 8)
30 22 * * *   -> next morning  (unchanged)
```
The flag reaches **only** the two new entries, via a schedule-conditional on `github.event.schedule`
(read back at L86–87). `WINDOW_DEFAULT_S = 20*3600` on `frontend-rebuild` (L194) — **default off, so
the four pre-existing crons are byte-identical in behaviour.** Allow-list divergence **(3)** added
with `since` deliberately left at **2026-07-31** so the two older open divergences keep their
countdown.

**WHEN TO CHECK — FIRST RUN IS TODAY.** `10 18` declares 18:10Z and the measured queue delay for
this band is **+3h0m to +3h5x**, so it should deliver **~21:1xZ = ~14:1x PT**, with the second at
**~21:5xZ = ~14:5x PT**. **Check between 14:10 and 15:00 PT — roughly 40–85 minutes before the
15:38 PT board fire.**

**THE ASSUMPTION THIS RESTS ON, stated:** the placement is entirely a function of GitHub's ~3-hour
queue delay holding. **If Actions delivered promptly, the pair would land at 11:1x / 11:5x PT — far
outside the window and paying for nothing.** The landing test is what catches that.

**PRE-COMMITTED LANDING TEST, unchanged:** `node tools/price-path.mjs <props-dir>` must print
**n > 0 in the 60–120 bucket**. **Zero means the SPACING is wrong, not that prices do not move.**
**ONE cron delivering is a PARTIAL LANDING that produces no pair and therefore no observation — it
looks like a landing and is not.** Said in advance, as pre-committed.

**IMPOSSIBLE BRANCH — the pair fires but `--window` is not passed:** each capture then takes the
full slate at **13–15 events ≈ 78–90 credits**, so the pair costs **~156–180/day instead of
~36–96** — roughly double the entire existing props line. Detectable in the run log: the flag
prints `window: 120 min -> N of M events on the board`, and **its absence from the log is the
symptom.**

**One interaction, noted not feared:** the last targeted capture lands ~21:5xZ, **45 minutes before
the 22:38Z board**, and `0 20` lands ~23:3xZ **after** it — so reading 26's cost bracket, which
reads quota tightly around the curl, should be clear of both.

## §H10 `coreNoHR` MEASURED — AND IT COMES BACK TRUE, WITH A PRECISION THAT MATTERS

**Implied probability by market, 2026-07-26 board:**

| market | n | min | p25 | **median** | p75 | max | **CV = √((1−p)/p) at median** |
|---|---|---|---|---|---|---|---|
| `batter_hits` | 50 | 62.0 | 65.7 | **67.2** | 68.2 | 70.2 | **0.70** |
| `batter_total_bases` | 50 | 47.9 | 61.1 | **62.7** | 64.9 | 69.8 | **0.77** |
| `batter_hits_runs_rbis` | 50 | 54.0 | 56.7 | **58.5** | 59.6 | 61.6 | **0.84** |
| `ml`/`rl` | 30 | 49.1 | 54.2 | **59.1** | 63.0 | 76.2 | **0.83** |
| `pitcher_outs` | 38 | 37.1 | 42.9 | **49.5** | 52.8 | 62.4 | **1.01** |
| `pitcher_strikeouts` | 35 | 39.9 | 43.7 | **48.3** | 57.1 | 59.3 | **1.03** |
| **`batter_home_runs`** | **50** | **15.1** | **18.0** | **20.5** | **22.5** | **30.9** | **1.97** |

**🔴 HR OCCUPIES A DISJOINT BAND: 15.1%–30.9%, AND ZERO OF 253 NON-HR LEGS FALL INSIDE IT.** The
next-lowest market bottoms out at 37.1%.

**THE FIRST BRANCH FIRES: the rule is measured true after the fact, and its number is CV 1.97
against 0.70–1.03 — ~2.8× a hits leg and ~1.9× the highest non-HR market.** `coreNoHR` moves off
the reasoning-not-measurement list **with that figure attached.**

**BUT THE PRECISION MATTERS, AND IT IS NOT WHAT THE RULE'S COMMENT CLAIMS.** At *matched* implied
probability a single leg's variance is `p(1−p)` — **identical by construction, market irrelevant.**
So HR is not "more volatile at comparable probabilities"; **HR never trades at comparable
probabilities.** The rule is true because its boundary (a market) happens to coincide with the
property's boundary (low p) **on this board**. That is the opposite outcome to the same-team
proposal, where the boundary did *not* coincide — **and the two were tested the same way.**

**IMPOSSIBLE BRANCH — HR showing LOWER variance than a CORE market at the same implied
probability: NOT EVALUABLE. There is no CORE market at the same implied probability** (zero
overlap), and that non-evaluability is itself the finding.

**THE ENTANGLEMENT, NAMED AS PRE-COMMITTED — and it runs three ways, not two:**
1. `coreNoHR` emptied the same-team proposal's target set, so **that proposal looked harmless only
   because this rule had already removed the population.**
2. **The disjointness is partly MANUFACTURED by two other rules**: `hrrAltMax: −1` suspends every
   HRR rung and L2241 admits HR only at the 0.5 line. **The deep alternate rungs that would sit in
   HR's band are already suspended by something else.** So "no non-HR leg in HR's band" is a joint
   property of three rules, not a property of the markets.
3. **THE EXPERIMENT THAT SEPARATES THEM:** admit the suspended HRR/TB alternate rungs into the
   board's row set **without** admitting them to CORE, and re-measure the overlap. If non-HR legs
   then populate 15–31%, the market boundary is wrong and the rule should be a **probability
   floor**, not a market ban. **Zero credits on an archived board — but it needs a board carrying
   alternate rungs, and none does.** Named, not run.

**WHAT WAITS ON THE LEDGER (read 4):** CORE's realised record with and without HR — hit rate,
realised variance, and P/L — is **not computable from any artifact on disk**. There are zero locked
entries. **This half of the measurement waits on read 4 and is not estimated.**

**NO CHANGE IS PROPOSED.** The rule is measured true on the board we have; the finding is that its
*stated reason* ("volatility") is right about the quantity and wrong about the boundary, and that
its apparent cleanliness depends on two other suspensions.

## §H11 simJoint PRECISION — SPEC, NOT SHIPPED

| option | size | robustness |
|---|---|---|
| **A — emit `j2` and `pm` per group onto the ticket** | ~2 lines in the `simJoint` block (they are already computed and discarded) | **A MEASUREMENT.** The ratio is exact, no rounding, and each factor is separately inspectable — a `pm` of 0 or a clamped `j2` is visible rather than inferred |
| B — raise `prob`/`probNaive` stored precision | 1 line at serialisation | **AN INFERENCE FROM A ROUNDED NUMBER.** Better than 1 dp, but the ratio is still a quotient of two rounded quantities and the clamp's binding stays invisible |

**→ A IS BOTH SMALLER AND MORE ROBUST.** It also fits this repo's own standing pattern: `j2/pm` is
a **fourth computed-and-discarded quantity** (beside `shPenQF`, the Kelly ceiling in legacy modes,
and `kellyF` per row) — emitting it is the same fix M23/M24 asked for elsewhere.

**IS IT ADDITIVE?** **NO — both touch the engine string.** The `simJoint` block is `legacy/index.html`
L2693–2706, inside the eval'd literal, so either option **moves the hash, resets the homogeneous
window, and needs the pending-live-verification sequence.** **It rides the next hash-moving ship
rather than taking its own** — and the vintage cost is currently zero, the window having been at
zero for five dark days.

**WHAT TOMORROW'S BOARD WOULD CARRY:** under **A**, an exact ratio per same-game group — but the
07-26 board had **3 groups, all HR**, so **one board gives n ≈ 3 and the audit needs many.** Under
**B**, still nothing decidable at small probabilities. **Neither makes the audit possible on one
board; A makes each board's contribution exact instead of unbounded.**

**THE MARKET-SPECIFIC FINDING, RECORDED PROPERLY:** HR and TB show dependence on **different
units** — same-**game** for HR (1.103 [1.048, 1.168], with (a) and (b) indistinguishable),
same-**team** for TB (1.063 [1.024, 1.130] with (b) flat at 0.992) — and **hits show none in any
stratum**. **A single same-game correction factor is the wrong shape for all three at once.** That
is a positive argument for `simJoint`'s per-group empirical approach over any fixed rho — **and
whether it delivers is exactly what the precision gap prevents us from knowing.**

---

# 2026-08-01, fifth pass — the separating experiment RAN, and it refutes my own §H10 caveat

## §H12 ITEM 1 — NOT YET LANDED. NOTHING TO REPORT, AND THAT IS THE REPORT.

**The two new crons have NOT fired.** They declare **18:10Z and 18:55Z today (2026-08-01)**; at the
time of writing it is **~06:5xZ**, so they are **~11 hours out**, with expected delivery
**~21:1xZ ≈ 14:1x PT** and **~21:5xZ ≈ 14:5x PT**. **No delivery times, no run logs, no quota
deltas, and no 60–120 bucket exist yet. None are estimated.**

**THE CHECK, ready to run when they land** (all zero Odds credits except the quota read, which is
free):
```
# 1. did they deliver, and did --window print?
gh run list --workflow=props-history.yml --limit 6 --json name,createdAt,conclusion,databaseId
gh run view <id> --log | grep -E "window:|snapshot kind=|skipped:"

# 2. the archive, and the bucket
git fetch origin line-history && git show origin/line-history:data/props/2026-08-01.json > ~/props-0801.json
node tools/price-path.mjs <dir-with-that-file>     # 60-120 bucket n is the reading

# 3. the cost
node tools/quota.mjs
```
**Every pre-committed branch stands exactly as written and is not restated here.** The one worth
repeating because it is the trap: **one cron delivering is a PARTIAL LANDING that produces no pair
and therefore no observation — it looks like a landing and is not.**

## §H13 ITEM 3 — THE ARCHIVE CARRIES THE RUNGS, SO THE EXPERIMENT RAN TODAY

**FIRST BRANCH FIRES.** The archive holds alternate rungs that no board has ever carried:

| market | rungs present in the 18-day archive |
|---|---|
| `batter_home_runs` | **0.5: 10,579 · 1.5: 7,467 · 2.5: 3,254** |
| `batter_hits_runs_rbis` | 0.5: 1,708 · **1.5: 7,644 · 2.5: 466** |
| `batter_total_bases` | 0.5: 3,739 · **1.5: 7,948 · 2.5: 13** |
| `batter_hits` | 0.5: 9,496 · **1.5: 1,325** |

**So the experiment I called "blocked on a board that does not exist" was never blocked.** The
archive and the board are different populations, and I had reasoned about the board. **Recorded as
my error, not as a discovery.**

### THE RESULT: THE BANDS STAY DISJOINT. MY §H10 CAVEAT IS REFUTED.

Implied probability from the Caesars OVER price (vigged, but applied uniformly to every row so the
overlap structure is preserved), across all 18 archived days:

| market \| rung | n | p10 | median | p90 | **share inside HR's 15.1–30.9% band** |
|---|---|---|---|---|---|
| **`batter_home_runs\|0.5`** | 10,477 | 9.5 | **16.7** | 24.7 | **52.7% (5,523)** |
| `batter_home_runs\|1.5` | 6,254 | 1.2 | **2.2** | 4.2 | 0.0% |
| `batter_hits_runs_rbis\|1.5` | 5,189 | 45.7 | 52.2 | 58.5 | **0.0%** |
| `batter_hits_runs_rbis\|2.5` | 279 | 45.9 | 47.8 | 51.7 | **0.0%** |
| `batter_total_bases\|1.5` | 5,011 | 42.0 | 45.9 | 51.5 | **0.0%** |
| `batter_total_bases\|0.5` · `batter_hits_runs_rbis\|0.5` | 2,038 · 796 | 54.5 · 56.5 | 60.6 · 60.8 | 65.5 · 63.4 | 0.0% |
| `pitcher_outs` (five rungs) | 868 | 43.5–55.6 | 45.9–60.6 | 51.7–64.5 | **0.0%** |

**🔴 ZERO OF 14,181 NON-HR ROWS FALL INSIDE HR'S BAND — WITH THE SUSPENDED RUNGS ADMITTED.**

**→ THE DISJOINTNESS IS NOT MANUFACTURED BY `hrrAltMax` OR THE 0.5-LINE RULE. IT IS A GENUINE
PROPERTY OF HOW THESE MARKETS ARE PRICED, AND §H10's "partly manufactured" CAVEAT IS WITHDRAWN,
DATED 2026-08-01.** The deep rungs do not sit in HR's band — they sit **above** it (HRR 2.5 at a
47.8% median, TB 1.5 at 45.9%), because an *alternate rung on a high-probability market is still a
high-probability event*. And **HR's own alternate rungs go the other way entirely**: `HR|1.5` sits
at a **2.2% median**, far *below* the band. **Admitting rungs widens the gap; it does not close it.**

**IMPOSSIBLE BRANCH — rungs present in the archive but absent from every board: IT FIRES, and the
line is `legacy/index.html` L2241:**
```js
if(mkt==="batter_home_runs"&&row.ln!==0.5)return; /* HR: only the 0.5 (anytime) line — never 1.5+ */
```
**A bare literal, hardcoded, with NO config key anywhere** (grep returns exactly one site). **So it
is ours, it is a FOURTH constraint, and it is not in the census — not even as a named parameter.**
Recorded; registering a bare literal is the owner's call and would move the count 43 → 44.

**ONE GAP IN THIS MEASUREMENT, NAMED:** `batter_hits` rows carry no Caesars price in the archive, so
they are absent from the table above. Their board-side implied sits at **62–70%**, nowhere near the
band, so the conclusion is unaffected — but the row is missing and I am not implying it was tested.

## §H14 ITEM 2 — THE PROBABILITY FLOOR, SPEC ONLY

**THE FLOOR THAT REPRODUCES THE EXCLUSION EXACTLY: any value in `(30.9%, 37.1%]`.** On the archived
board, HR's maximum implied is **30.9%** and the lowest non-HR leg is `pitcher_outs` at **37.1%** —
so **every threshold in that 6.2-point gap partitions the 303 rows identically to `coreNoHR`.**
A stated value of **34%** sits in the middle of the gap.

**FIRST BRANCH FIRES: the floor reproduces the exclusion exactly** — 50 HR rows excluded, 253
non-HR rows admitted, **byte-identical at the row level** on the 07-26 board *and* across 14,181
archived non-HR rows. *(Row-level: CORE eligibility applies further filters — `coreMaxLegs`,
`coreEvMin`, `coreCzEvMin` — which the floor does not touch and which are unchanged either way.)*

**IMPOSSIBLE BRANCH — a current CORE leg below the floor: DOES NOT FIRE.** Zero of 253 board rows
and zero of 14,181 archived rows sit below 37.1% outside HR.

**WHAT EACH WOULD CATCH THAT THE OTHER DOES NOT:**
- **The floor catches, the ban does not:** any future leg in any market that prices below ~34% — a
  deep TB/HRR rung if the suspensions ever lift, a new market, a longshot ML. **Today: nothing.**
- **The ban catches, the floor does not:** an HR leg that ever prices **above** ~34%. Today the
  maximum observed is 30.9% on the board and HR|0.5's p90 is 24.7% across 18 archived days — **so
  this is rare but not impossible**, and under the floor such a leg would become CORE-eligible.

**IS THE FLOOR FITTED OR CHOSEN? NEITHER, AND THIS HAS TO BE SAID PLAINLY: IT IS FITTED TO A RULE.**
Setting it to reproduce `coreNoHR`'s exclusion means **it inherits `coreNoHR`'s provenance
entirely** — and `coreNoHR` was domain reasoning until this session gave it a CV number after the
fact. **A floor calibrated to an unmeasured rule is not a measured parameter; it is the same rule
in more general clothing, and shipping it would launder the provenance.** Recorded in those terms.

**WHAT WOULD FIT IT TO DATA: the CV or variance level at which CORE's realised record degrades.**
That needs realised outcomes per CORE ticket — **BLOCKED ON READ 4**, and there are zero locked
entries on disk. **Named as blocked rather than designed around.**

**RECORD, PER THE PRE-COMMITTED READING: the floor is the general form of the rule, spec-only.
Shipping it changes NOTHING today — the partition is identical — and changes EVERYTHING if the
alternate rungs ever return or a new market is added below 34%.** That is the entire argument for
preferring it, and it is an argument about the future, not about any measurement.
