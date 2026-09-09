# Odds API credit budget (2026-07-25)

> ## ⚠️ RE-DERIVED FROM THE FIRING BRANCH — 2026-07-31 (owner's item 5)
>
> **Every job figure below was derived from workflow files on `frontend-rebuild`, which fires
> NOTHING.** GitHub schedules run only from the default branch (`origin/HEAD` -> `origin/main`).
> Re-derived from `origin/main` this date; full audit in `docs/branch-firing-audit.md`.
>
> | line below | as written | **firing copy, measured 2026-07-31** |
> |---|---|---|
> | `props-history.yml` "2x/day ... <=192" (L175) | 2 crons | **TEN crons.** MIN_GAP (40 min) over a 480-min span admits **7 paid/day**; at the measured **5.84 credits/event** and a 15-event slate that is a **~615/day CEILING** — 3.2x the figure below. Observed 07-30: 198. Observed 07-31 morning batch alone: **339** |
> | `line-history` 144/day (L140) | scheduled rate | **144 was the CEILING, not the observation** (24 crons x 6, no gap guard in `snapshot_odds.py`). Delivery measured from the Actions run log: **3-4 runs/day = ~22/day**. **DISABLED on the firing copy 2026-07-31** (`3356c54`) -> now **0** |
> | `/api/clv` ~45/day (L139) | — | unchanged; not re-derived this date |
> | client generates 120-240/device/day (L178) | — | unchanged, and **still the leading unattributed candidate** (reading 15(c)) |
> | — | **absent** | **`SharpDesk` is mounted unconditionally on `/board` and fetches `h2h,totals,spreads x us,eu` = 6 credits per CACHE-MISSING render** (`app/board/page.tsx` L377, `sharpBoard.ts` L135). The 4-minute window is the SERVER-side Next data cache (`/api/odds` `TTL_SECONDS = 240`), so it is shared across every caller. In no table here |
> | — | **absent** | **`useAllStar.ts` L77 and `ufc.ts` L84-86** — client-triggered proxy fetches, `ufc` with a cache-bypassing `fresh=1` path |
> | — | **absent** | **A THIRD SCHEDULER: Vercel Cron.** `vercel.json` declares `/api/calibrate` at `30 9 * * *`. **0 Odds credits** (statsapi + Redis only), but it was in no inventory until 2026-07-31 |
> | — | **absent** | **`/api/propsnap`** costs **6 credits/event, up to 16 events = <=96 per fire**, triggered by cron-job.org entries 5-6 if they exist. Nothing it captured has ever folded, because `--fold-only` lives on the non-firing copy |
>
> **The unattributed residual — ~201/day, measured against the Actions run log — appears in no
> line of this document.** It is larger than every job priced here except props-history.


**Measured 2026-07-25: 15,872 used, 4,128 remaining on a 20,000/month plan, ~24 days
into the cycle → ~661 credits/day → ~20,500/month.** The architecture is structurally
over-subscribed *before* adding anything. At this rate the key exhausts in ~6 days,
which would take `/api/clv` down with it — and CLV is the scoreboard the entire
collection period is built on.

## RE-MEASURED after the timezone fix (2026-07-25)

The fix put ~24% more events into the per-event prop loop, which is upstream of
`slice(0,16)`. Measured by instrumenting the fetcher and billing 1 credit per market
per region (game odds = 3 markets x us,eu = 6; each event = 9 markets x us = 9):

| slate | pre-fix events / credits | post-fix events / credits | delta |
|---|---|---|---|
| 12 games | 9 → 87 | 12 → **114** | +27 |
| 15 games | 11 → 105 | 15 → **141** | +36 |
| 16 games | 12 → 114 | 16 → **150** | +36 |
| 18 games | 14 → 132 | 16 → **150** | +18 |
| 20 games | 15 → 141 | 16 → **150** | +9 |

**Saturates at 150 credits** — `slice(0,16)` caps the prop loop, so a 16-, 18- or
20-game slate all cost the same. A generate is therefore **114–150 credits**, not the
~120 the earlier tier math assumed; call it **141/day** on a typical 15-game slate.

Note for anyone reading the rebaseline diff: the fixture has prop files for only the
nine early events, so the six recovered games added **no prop rows** to the +6/+6/+5.
**In production they will.** The fixture diff understates the real change.

### THE BUDGET IS ONE SCENARIO, NOT THREE (corrected 2026-07-25)

The three-scenario table was wrong, and the price-age lock guard is why. The weekday
cron fires at 22:00 UTC = 3 PM PT; the owner locks at 5 PM PT; the board is then 2h old
against a 30-minute limit, so **the guard blocks the lock and a regenerate is mandatory
by design on every day he bets.** "Never regenerate" and "half the days" were fictional.

Archive costs are measured from the archives themselves, not from the cron schedules:
`line-history.yml` is scheduled hourly but GitHub Actions delivers **~4.1 snapshots/day**
(14-day count) → ~25 credits/day, not 144. `props-history` delivers its 2/day reliably.

| line | /day | note |
|---|---|---|
| cron generate | 141 | 22:00 UTC backstop; saturates at 150 on a 16+ game slate |
| lock-guard regenerate | 141 | mandatory, not discretionary — the guard requires it |
| `/api/clv` | 45 | |
| line-history | 25 | measured, not scheduled |
| props-history | 161 | scales with slate size |
| **total** | **~513/day → ~15,600/month** | **78% of a 20K plan** |

**September:** slates run 15–16 games consistently (pennant races, fewer off days), and
doubleheaders add more. Generate saturates at 150 each, and props-history scales to
~192/day at 16 games → **~562/day ≈ 17,100/month ≈ 85% of 20K.**

### CORRECTION (2026-07-25): the normal day is TWO regenerates, and 20K does NOT clear

The line above assumed one regenerate per day. The owner's stated lock window is **5–7 PM
PT**, and a day where he looks at 5:00 and locks at 6:30 is **two** blocked locks by the
guard's own rule (the 30-minute limit is exceeded before each one), not one. Both cost a
full board.

| | 15-game day (now) | 16-game day (September) |
|---|---|---|
| fixed: cron + `/api/clv` + line-history + props-history | 141+45+25+161 = **372** | 150+45+25+192 = **412** |
| + 1 regenerate | 513 → 15,900/mo → **80%** | 562 → 16,900/mo → **84%** |
| + 2 regenerates (look, then lock) | 654 → 20,300/mo → **101%** | **712 → 21,400/mo → 107%** |
| + 3 regenerates (changed his mind once) | 795 → 24,600/mo → **123%** | 862 → 25,900/mo → **129%** |

**On the workflow actually described, a 20K plan fails — 101% this month, 107% in
September.** The break-even is the number of *betting* days: with fixed cost 412/day in
September, 20,000 − 12,360 = 7,640 credits buy 50 regenerates, i.e. **25 two-regenerate
days out of 30**. Bet on 26 days and the key runs dry before the month does.

The one lever that fixes this without buying anything: retime the cron so the **first**
look is already fresh (a board < 30 min old at 5 PM PT), which removes one of the two
regenerates and returns September to ~562/day / 84%. It cannot remove both — with a
30-minute guard and a two-hour lock window, at most one look-point can be free. And it
costs lineup coverage, which is exactly why 22:00 UTC was chosen over an earlier hour.
So the honest trade is **~$29/month vs. confirmed lineups**, and the tier decision below
already answers it.

**This supersedes "it clears with ~15% margin."** That sentence was written against a
one-regenerate day, and the guard the owner approved makes two the normal case.

### Archive ranking, recorded 2026-07-25 while nothing is at stake

Written down *before* a squeeze so a future cut is decided on evidence rather than urgency.
Neither archive is being cut today.

| archive | /day | share | what it has actually been read for | verdict |
|---|---|---|---|---|
| `line-history` (game lines) | 25 | ~5% | **every measurement that changed a decision this phase**: the 3/4/5/6-hour price-movement percentiles that set `lockMaxAgeMin`, the p90 offshore-book artifact, the 31-book ML consensus depth | cheapest line in the budget, highest realised yield — never cut first |
| `props-history` (player props) | 161 (→192 Sept) | **31%** | **read for the first time on 2026-07-25**: the 12-day, 11,072-row independence measurement that corrected the eligibility rule's cost from a wrong 38% to a measured 16.8% — see `collection-period.md` | keep; it now has a named use |

### THE ARGUMENT AGAINST CUTTING AN ARCHIVE BECAUSE IT LOOKS IDLE

Put plainly, because it is the strongest form of the case and it should not have to be
re-derived: **`props-history` had never been read once in the ~13 days it had been running,
and on its first read it prevented shipping a selection rule scoped to the wrong market off
a number that was wrong by a factor of twenty.** The rule would have been written against
"38% of total-bases rows"; the archive said 0.7%, and said the real hole was somewhere else
entirely (`n = 0`, and `batter_home_runs` at 100%).

An archive's value is not its read frequency. It is bought before the question exists, and
the question that needed it here was not foreseeable when the workflow was written. Anything
proposing a cut on "nothing reads it" has to answer this case first.

**What `props-history` needed to be read FOR — answered, not deferred.** It is the only
multi-day record of `n`, the fair's book count, per prop row. The single-fixture version of
that measurement was wrong by a factor of ~20 and would have shipped a rule scoped to the
wrong market. No other artifact in the repo can answer "is this slate's book depth typical
or an artifact of one day," and `/api/clv` cannot substitute — it stores a per-leg sighting
for legs that were *bet*, not the shape of the whole board.

**Built 2026-07-25, zero extra credits:** `tools/snapshot_props.py` now records `fb` (the
book keys behind the fair), `czf` (was the settlement book among them), `bo`/`bu` (best
prices — already computed and previously discarded) and `no` (how many books posted an over
at all). `n` is unchanged so the 12 archived days stay comparable. These are the fields that
decide the `booksInd` threshold (1 vs 2) and that make the `1.06` haircut auditable where it
is actually applied — see `collection-period.md`. Effective from the next sweep; ~2 weeks to
a usable series.

Ordering if the budget is ever genuinely squeezed, most-cuttable first: **props-history →
line-history → client regenerates → never `/api/clv`, never `/api/generate`.** Note this
inverts the earlier ranking: props-history is 6× the cost of line-history for a question
that is now answered, whereas line-history is 5% of burn and has repeatedly produced the
numbers that set live thresholds.

### Superseded: the three-scenario table
Kept for the record because the reasoning matters. It assumed regeneration was
discretionary; the lock guard makes it structural. Any future budget that models
"never regenerate" is modelling a workflow the guard forbids.

### Rebuilt totals — day-of-week split, one generate/day

| line | /day | /month |
|---|---|---|
| generate (one entry fires per day) | 141 | 4,290 |
| `/api/clv` | ~45 | ~1,370 |
| line-history | 144 | 4,380 |
| props-history | 192 | 5,840 |
| client generates (weekdays) | ~0 — the cron board is loadable now | — |
| **total** | **~522** | **~15,900** |

**20K plan: 79% used. 100K plan: 16%.** The fix cost ~1,100 credits/month and the tier
answer does not change: 20K still fits, and the case for 100K remains the asymmetry
argument below, not throughput.

## Checking the balance for free (and what it does NOT tell you)

`/v4/sports` is a **free** endpoint — it returns the quota headers without billing a credit:

```
curl -sS -o /dev/null -D - "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY" | grep -i x-requests
```

Returns `x-requests-remaining`, `x-requests-used`, `x-requests-last`.

**There is no reset-date header.** The Odds API does not expose the cycle boundary through
the API at all; the reset is the subscription's monthly billing anniversary and lives on the
account page. What the curl *does* answer, and what actually decides the question:
run it two days running and the difference **is** the measured daily burn — which converts
"do I have 7 days or 25" into arithmetic without needing the reset date at all. Baseline for
that subtraction: **4,128 remaining, measured 2026-07-25.**

**Still live and still spending: the Vercel `/api/generate` cron at `0 16 * * *` UTC
(9 AM PT).** It has not been removed from `vercel.json` — removal was deliberately held
until the cron-job.org entries exist, so there is no gap in coverage. Any "no cron is
scheduled yet" reasoning is wrong: ~141 credits/day are already going out at 9 AM PT.

## Consumer audit

| consumer | credits/day | /month | what it feeds | what breaks if it stops |
|---|---|---|---|---|
| `props-history.yml` (2×/day × ≤16 games × 6 mkts) | ≤192 | ≤5,950 | the **Pro Scoreboard** panel on /ledger | that panel only — and it computes CLV, which `/api/clv` + the Stats CLV panel now do better |
| `line-history.yml` (hourly × 6) | 144 | 4,460 | **nothing live** | nothing today; loses a game-line close archive for a reader that was never built |
| `/api/generate` cron | ~120 | ~3,720 | the prediction store → the whole calibration channel | calibration stops accruing |
| client generates (~120 per device per day) | 120–240 | 3,720–7,440 | the board actually bet | you cannot bet |
| `/api/clv` | ~30–60 | ~900–1,860 | CLV report, receipts, NV-tax accounting | the scoreboard |
| **total** | **~610–760** | **~19k–23k** | | |

The two archive jobs are **46% of the burn** and neither is load-bearing today.

### `/api/clv` is already adaptive — the prior that it polls uniformly is wrong
`WINDOW_MS = 45 min`: it selects only legs whose game starts inside the next 45 minutes,
and returns `"no legs inside the pre-pitch window"` **before any odds call**
(`app/api/clv/route.ts`, the `byGame.size` guard precedes every fetch). A 14:00 UTC tick
for a 23:05 game already costs **zero**. Each game effectively gets one sighting, right
before its own first pitch, which is also the *best* close the feed can give. Nothing to
optimise here; it is ~7% of burn, not a major consumer.

### `line-history.yml` — nothing reads it
Grep confirms exactly one consumer of the `line-history` branch: `ProScoreboard.tsx`,
and it reads `data/props` (the **props**-history output), not `data/` (the line-history
output). The game-line archive feeds the Pinnacle-close CLV reader that `ENGINE2.md`
records as never built. Killing it loses future optionality and nothing present.

### `props-history.yml` — one panel, superseded
It feeds `ProScoreboard`, which computes CLV against "the last prop snapshot before first
pitch" — two snapshots a day. `/api/clv` now captures a per-leg sighting inside 45 minutes
of each game's own first pitch, with the de-vigged consensus fair, the seam-free cents
scale, and the no-backfill guarantee (`docs/clv.md`). The newer instrument is strictly
better; the archive is paying ~5,950/month to keep an older, coarser one alive.

## Proposed budget (fits with headroom)

| action | saves/month | what is lost |
|---|---|---|
| 1. Stop `line-history.yml` | −4,460 | nothing today |
| 2. Stop `props-history.yml` | −5,950 | the Pro Scoreboard panel (retire it, or repoint it at the ledger's own `clv` fields) |
| keep everything else | — | — |

**Result: ~8,800–12,600/month, i.e. 7,400–11,200 credits of headroom.** That is enough
to fund the 22:00 UTC second pass (+3,720) and still land at ~12,600–16,300.

Ranked by what is lost, cut in this order: line-history (nothing) → props-history (one
superseded panel) → client generates (the real lever after that: ~120 per device per
day) → never `/api/clv` or `/api/generate`.

## The tier decision (2026-07-25): 100K — read this before "optimising" it

### The first reason is arithmetic: **20K does not fit.**

On the workflow actually in use — a two-regenerate day, because the price-age lock guard
blocks both the 5 PM look and the 6:30 PM lock — the burn is **~654/day now (101% of a 20K
plan) and ~712/day in September (107%)**. The break-even is 25 betting days out of 30. This
is not a margin-of-safety argument; the smaller plan runs out.

**The alternative that avoids the purchase — considered and rejected.** Retiming the cron so
the *first* look is already inside the 30-minute window removes one of the two regenerates
and returns September to ~562/day (84%). It cannot remove both: with a 30-minute guard and a
two-hour lock window, at most one look-point can ever be free. And it only works by
generating earlier, which is the opposite of the change that was just made — 22:00 UTC was
chosen precisely to sit after lineups post. **So the trade is confirmed lineups for $29/month,
and confirmed lineups are worth more than that.** Rejected 2026-07-25.

### The second reason is asymmetry — it was the original argument, and it still stands

Even had 20K fitted, the purchase was correct:

> Every other failure mode here is recoverable or bounded. A missed `/api/clv` sighting
> is **permanently gone** from the dataset this entire freeze exists to build. $29 to
> remove tail risk on an unrecoverable loss is a different purchase from $29 for
> throughput. I'd take it at 50% utilisation.

So the margin is **insurance on an unrecoverable loss**, not headroom for growth. A
future reader who sees 15% utilisation and downgrades to "save $29" is trading a
permanent hole in the CLV series against a month of coffee. Don't.

The same asymmetry decides the emergency ordering in `emergency/minimal-credits`:
`/api/clv` is the last thing to stop, not the first.

## Minimal-credit mode — prepared, not applied
Branch **`emergency/minimal-credits`** (commit `874b8f2`) pauses everything that spends
Odds credits except `/api/clv`: both archive schedules commented out, the
`/api/generate` cron removed from `vercel.json`, `/api/calibrate` kept (it spends
nothing and still grades). Burn drops **~501/day → ~45/day**, turning 4,128 remaining
credits from ~8 days of everything into **~90 days of CLV**. Every workflow keeps
`workflow_dispatch`, so any archive can still be run by hand for a day that matters.
Merge it only if the key is about to run dry; revert is a single `git revert`.

## If the archives are worth keeping
The next tier is **100,000 credits/month at $59** (current: 20,000 at $30). At the
present ~20,500/month, upgrading buys ~5× headroom for $29/month more and requires no
instrument to be gutted — including keeping both archives *and* running the second pass.
Given that the archives' only cost is money and their only alternative is deletion, this
is a reasonable thing to buy rather than engineer around.

## 2026-09-09 INSTRUCTION 48 — top-ups all day
Josh: the locked card keeps growing to the daily allotment; nothing is ever removed. Cadence
constants moved (`TOPUP_MAX` 2 → 4 with a 90-min empty-sweep cooldown, `CFB_TOPUP_MAX` 2 → 6,
`NFL_TOPUP.max` 2 → 6); a block fire is a full-slate generate at 114–150 credits (the old
"~50-91" figure is retired), a football lines pull is 6. Worst-case arithmetic:

| desk | per date BEFORE (worst) | per date AFTER (worst) | delta | realistic |
|---|---|---|---|---|
| MLB | 4 + 2 = 6 runs → 684–900 | 4 + 4 = 8 runs → 912–1,200 | +228–300 | 1 block fire + 2–3 sweeps ≈ 342–600 (empty sweep holds 90 min, slot-fit refuses free) |
| CFB | lock 6 + CFB_TOPUP_MAX (2) × 6 = 18 | 6 + 6 × 6 = 42 | +24 | Saturday ≈ 2,500 props + 42 (arms only close, so the two per-arm counters share CFB_TOPUP_MAX priced boards — not 2 × 6; a fix-round draft said 78) |
| NFL | 18 | 42 | +24 | Sunday ≈ 1,000 props + 42; Thu/Mon dates lines-only ≤ 42 |
| fixed rails (unchanged by this order) | ~231/day | ~231/day | 0 | `/api/clv` 45 + line-history 25 + props-history 161, this file's RE-MEASURED table |

Remaining September (09-09..09-30: 22 MLB days, 3 Saturdays, 3 Sundays): MLB 22 × ~600 realistic = 13,200 (hard worst 26,400); fixed rails 22 × ~231 ≈ 5,080; CFB 3 × 2,542 = 7,626; NFL 3 × 1,042 + ~6 × 42 ≈ 3,380 — **≈ 29,300 realistic**. Against it: the plan is 20,000/month and the cycle resets ~10-01 (`docs/credit-budget.md`: "~24 days into the cycle" on 07-25); the last quota reading in the tree is **16,480 remaining on 2026-09-05** (`src/lib/cfb/rules.ts`, the `CFB_PROPS` docblock — its own line above records `x-requests-used` 2428 → 3187 in that Saturday's single props pull), read BEFORE that Saturday's spend and four further days, so the real 09-09 figure is materially lower and must be re-read off `/api/cfb`'s `quota.remaining` (a normal board read; this fix round made no Odds call) and dated. **On this arithmetic the month is ALREADY short by roughly 13,000 credits before the CFB Saturdays are counted** — MLB ~600/day + fixed ~231/day alone exceeds the ~630/day the 09-05 reading allowed — and exhausting the key takes `/api/clv` (the scoreboard) down with it. The month was over-subscribed by the PROPS rails before this order; this order adds ≤ +300/day on MLB and ≤ +24/date per football desk. ~~The first lever is due NOW, pending Josh's word, in this order: `CFB_PROPS.dailyBudget` 2500 → 1500 (`src/lib/cfb/rules.ts`, the `CFB_PROPS` literal) → `NFL_PROPS.dailyBudget` 1000 (`src/lib/nfl/rules.ts`, the `NFL_PROPS` literal) → `TOPUP_MAX` 4 → 3 on Josh's word only.~~ **COUNTERMANDED 2026-09-09 by INSTRUCTION 49** (Josh, verbatim: "I can purchase more credits. Don't lower any budgets.") — no props budget, top-up cap or any other budget is lowered; the shortfall is met by buying credits. See the section below.

## 2026-09-09 INSTRUCTION 49 — refill on the five slots or Josh's click; budgets NOT lowered
Josh, verbatim: "I can purchase more credits. Don't lower any budgets. I need high stakes days to
really test the engine over time. It shouldn't be refreshing every 15 minutes. It should be 8am,
9:30am, 12pm, 3pm & 4:45pm. Other than that I can manually do it and it can function the same way
whether I manually refresh it or it refreshes itself automatically."

What it does to spend: the top-up/refill pass now fires only on the first scheduler tick inside
[slot, slot + 15 min) for 08:00 / 09:30 / 12:00 / 15:00 / 16:45 PT (`REFILL_SLOTS_PT` =
`GRADE_SLOTS_PT`), or on Josh's own Refresh (`POST /api/refill` behind the sync phrase, slot
`manual`). `TOPUP_MAX` 4 → **6** (five slots + one manual). The INSTRUCTION 48 cooldowns (MLB 45-min
generate limiter for top-ups, 90-min empty-sweep hold, football 45-min retry) are unwired — the slot
calendar is the only pacing. A refill refused BEFORE the pull (capped, same slot already ran, no
paper lock, every game started, manual headroom) costs zero credits; an attempt that prices a board
and seats nothing still costs that board — 6 credits on football, 114–150 on MLB — and, with the
cooldowns unwired, may recur on the next slot. A manual click is refused free when it would spend
an attempt an automatic slot still ahead today needs (`used + unstamped slots ahead >= TOPUP_MAX`).
**No budget is lowered**: `CFB_PROPS.dailyBudget` stays 2500, `NFL_PROPS.dailyBudget` stays 1000,
every allotment stays.

| desk | hard ceiling per date | realistic |
|---|---|---|
| MLB | `MAX_RUNS_PER_DATE` 4 + `TOPUP_MAX` 6: **9 runs / 1,026–1,350 without a click, 10 runs / 1,140–1,500 with one** | 3–4 runs ≈ **342–600**; structurally the AUTOMATIC refills are 0–1 a date (the 16:45 slot, sometimes 15:00) because blocks fire through the afternoon and the last slot is 16:45 PT — the rest are Josh's clicks |
| CFB | slot-only ≤ 5 attempts = **30** lines credits; 6 with one manual = **36**; **42** including the lock's own 6-credit pull | Saturday ≈ 2,500 props + lock 6 + whichever slots re-price |
| NFL | same: **30 slot-only / 36 with one manual / 42 incl. the lock** | Sunday ≈ 1,000 props + lock 6 + slots; Thu/Mon lines-only |
| fixed rails | ~231/day, unchanged | — |

Versus INSTRUCTION 48: MLB's worst case rises from 8 to 10 runs a date (+228–300), but its realistic
figure does not move (the slot calendar caps the day at five automatic passes where the 15-min
ticker could have bought four back-to-back); football's ceiling is unchanged at 42 lines credits.
The last quota reading in the tree is still **16,480 remaining on 2026-09-05** (`src/lib/cfb/rules.ts`,
the `CFB_PROPS` docblock) — stale, no new reading was taken in this build; re-read it off
`/api/cfb`'s `quota.remaining` on prod and date it. With the levers countermanded, the month's
shortfall on the INSTRUCTION 48 arithmetic (≈ 29,300 realistic against a 20,000 plan) is met by
purchasing credits, per Josh — the next tier above is documented earlier in this file.
