# Odds API credit budget (2026-07-25)

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

**What `props-history` needed to be read FOR — answered, not deferred.** It is the only
multi-day record of `n`, the fair's book count, per prop row. The single-fixture version of
that measurement was wrong by a factor of ~20 and would have shipped a rule scoped to the
wrong market. No other artifact in the repo can answer "is this slate's book depth typical
or an artifact of one day," and `/api/clv` cannot substitute — it stores a per-leg sighting
for legs that were *bet*, not the shape of the whole board.

**One free improvement worth making:** `tools/snapshot_props.py` records `n` and `cz` but
not whether Caesars was among the `n` fairs. `n = 1 ∧ cz two-sided` recovers the sole-source
case exactly, but the *partial* case (Caesars as 1 of 2) is only inferable. Adding a
`cz_in_fair` boolean in `compact()` costs **zero extra credits** and starts the series
accruing now. Not built yet.

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

## The tier decision (2026-07-25): 100K, and WHY — read this before "optimising" it

**Josh took the 100K tier at ~15–20% utilisation, knowing 20K fits.** That is not an
oversight to be tidied up later, and the reasoning is the point:

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
