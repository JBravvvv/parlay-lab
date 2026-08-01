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
