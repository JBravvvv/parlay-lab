# THE BOARD-OPEN EXPERIMENT — protocol, written 2026-07-31 BEFORE any read (owner's item 2)

Turning a correlation into a measurement: quota has been flat while the owner relays and has moved
only when a known job ran. One deliberate client action, priced in advance, names or clears the
residual's leading candidate.

---

## ⛔ STOP — THE PROTOCOL AS SPECIFIED IS NOT 12 CREDITS TODAY. DO NOT RUN IT AS WRITTEN.

The owner asked me to confirm the arithmetic before starting. **It does not hold on a dark
board-day, and today is the fourth consecutive one.**

Opening `/board` mounts `SharpDesk` (`app/board/page.tsx` L377) **and** runs
`useBoard → bestBoard()` (`src/lib/useBoard.ts` L14). Traced:

| step | file | what it does |
|---|---|---|
| `cachedBoard()` | `src/lib/engine-client.ts` **L190** | `if (b.date !== today) return null` — **a board from any previous day is discarded** |
| `serverBoard()` | `src/lib/engine-client.ts` **L245** | returns null unless `b.date === todayStr()` |
| `bestBoard()` | `src/lib/engine-client.ts` **L297** | `return generateBoard();` — **unconditional fallthrough when both are null** |
| `generateBoard()` | `src/lib/engine-client.ts` **L363–379** | `eng.collectSlate()` — the full per-event props sweep — then `logBoardPredictions(...)` |

**So on a day with no board, one Board open costs the SharpDesk 6 PLUS a full client generate:
~6 credits × unstarted events ≈ 90 on a 15-game slate — roughly 96, not 6.** `credit-budget.md`
L178 prices client generates at 120–240 per device per day.

Three further reasons not to run the literal version today:

1. **It contaminates reading 15(c).** `logBoardPredictions` writes `src: "client"` rows into
   `pl:pred` — the exact census that is supposed to settle whether the `bestBoard` fallthrough is
   the residual. Firing it by hand puts our own row in the evidence.
2. **It consumes an auto-generate slot** (`pl_autogen`, `AUTO_KEY`).
3. **At 699 remaining, ~96 credits is 13.7% of what is left.**

---

## THE SAFE PROTOCOL — VARIANT B (recommended). Measures the same thing, no fallthrough risk.

`SharpDesk`'s only upstream call is `loadSharpBoard()` (`src/engine2/sharpBoard.ts` L135), which
fetches **exactly** this, and nothing else:

```
https://parlay-lab-six.vercel.app/api/odds?u=https%3A%2F%2Fapi.the-odds-api.com%2Fv4%2Fsports%2Fbaseball_mlb%2Fodds%3Fregions%3Dus%2Ceu%26markets%3Dh2h%2Ctotals%2Cspreads%26oddsFormat%3Damerican
```

`regions=us,eu × markets=h2h,totals,spreads` = **3 × 2 = 6 credits** on a cache miss.
`/api/odds` L43 serves it through the Next data cache at `TTL_SECONDS = 240` — **four minutes,
SERVER-side, therefore shared across every client**. `SharpDesk`'s `staleTime: 240_000`
(`src/components/mlb/SharpDesk.tsx` L54) is the client half of the same window.

Hitting that URL directly issues the identical request against the identical cache key, runs no
engine, calls no `bestBoard`, writes no prediction rows, and cannot generate.

**Steps** — the owner runs all of them; each `node tools/quota.mjs` is free (`/v4/sports` through
the proxy, a different cache key, so it neither warms nor consumes the SharpDesk entry):

| # | action | expected cost |
|---|---|---|
| 0 | `node tools/quota.mjs` — the baseline, printed with its timestamp | 0 |
| 1 | open the URL above once | **6** |
| 2 | `node tools/quota.mjs` | 0 |
| 3 | open it again **within 4 minutes** | **0** (server cache hit) |
| 4 | `node tools/quota.mjs` | 0 |
| 5 | wait past 4 minutes, open a third time | **6** |
| 6 | `node tools/quota.mjs` | 0 |

**Total expected exposure: 12 credits** — 1.7% of the 699 remaining, against a ~201/day unknown.
No generating, no mode switching, no placing, no other client action required. Confirmed.

## VARIANT C — the literal Board open, gated

Run the owner's original protocol **only on a day when a board exists for the PT date**, checked
first with the ungated, zero-credit `GET /api/board?date=<PT today>`: a non-null `board` means
`serverBoard()` will return it and `bestBoard()` cannot fall through. Then the deltas are
SharpDesk's alone and the readings below apply unchanged.

---

## PRE-COMMITTED READINGS — written before the first read

- **Step 1 costs 6 and step 3 costs 0** → **SharpDesk is confirmed at 6 per cache-missing render
  and the residual's mechanism is named.** Then the arithmetic, which must be printed beside it:
  **201 ÷ 6 = 33.5 cache-missing renders per day.** Because the 4-minute window is SERVER-side,
  those 33.5 need not be the owner's — any device, any preview deployment, any crawler or warmup
  reaching `/board` or `/api/odds` counts, and none of those surfaces is gated. **33.5 opens by
  one person is implausible; 33.5 cache misses across every unauthenticated caller is not.** So a
  confirmed 6 names the MECHANISM and does not by itself close the arithmetic — the caller census
  (the Vercel function log) is what closes it, and that is a dashboard read.
- **Step 1 costs more than 6** → something else fires on that path too. Print the excess and the
  candidates: `useAllStar.ts` L77, `ufc.ts` L84–86, `fetcher.ts`, and any `fresh=1` call (which
  bypasses the cache entirely).
- **Step 1 costs 0** → the entry was already warm, i.e. **something else had fetched it within the
  previous 4 minutes** — which is itself the impossible branch below, not a clearance. Re-run
  after a 10-minute quiet gap. If it is still 0, SharpDesk is cleared, and what remains is: the
  `bestBoard` fallthrough (reading 15(c)), `/api/propsnap`'s weekend cron entries, and the
  ungated `/api/odds` surface reached by callers we cannot see from here.
- **Step 3 costs 6** → the cache is not doing what `TTL_SECONDS = 240` says, and every
  per-render cost estimate in the docs is a floor rather than an estimate.
- **IMPOSSIBLE BRANCH — quota moves between two reads with no open and no Actions run** → there is
  a spender that needs neither the owner nor a scheduler. That outranks everything: print the
  window, the delta, and the run log for it before any other conclusion.

## WHAT THE EVIDENCE ALREADY SAYS, BEFORE THE EXPERIMENT

Two natural experiments have now run themselves, both while the owner was relaying and not using
the app:

| window | duration | Actions runs | spend | attributed | **residual** |
|---|---|---|---|---|---|
| 07-31 01:25Z → 06:41Z | 5 h 16 m | **none** | **0** | 0 | **0** |
| 07-31 06:41Z → 13:57Z | 7 h 16 m | 9 (8 props-history, 1 context) | **339** | 4 paid snapshots × 58 event-fetches ≈ **348** | **≈ 0** (−9, i.e. zero within error) |

**12 h 32 m of no device use, and the residual is zero in both.** The second window is the stronger
of the two because it contains known spend to calibrate against: measured **339 ÷ 58 event-fetches
= 5.84 credits per event**, ~~which confirms the 6-per-event model used in every attribution
here~~.

> **STRUCK 2026-07-31 (owner's item 3). The struck clause is REFUTED.** A per-event constant of
> 5.845 — and of 6.0 — is ruled out by `residual >= 0`: the binding window (641 spent, 123 event-
> fetches, 2 line-history runs) bounds **c ≤ 5.114**, and both larger values make that window's
> residual negative. The **measurement** above (339 ÷ 58 = 5.845 on THIS window) stands as a
> measurement; what falls is the inference that it **confirms a constant**. The honest statement
> is a band, **c ∈ [5.114, 5.845]**, with the per-event cost NOT a constant across windows —
> `docs/branch-firing-audit.md` L557 carries the refutation and the arithmetic.

Against 8.4/h of residual on days the app was used, that is a real asymmetry — but it is still an
observational contrast, not a controlled one. **The experiment above is what makes it controlled**,
and it is the reason to run it rather than to conclude from the table.
