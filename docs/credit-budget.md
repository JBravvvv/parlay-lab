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

### THE BUDGET ASSUMES A BEHAVIOUR — stated out loud (Josh, 2026-07-25)

**Every total below assumes client generates are ~0 on weekdays**, i.e. that the cron
board is good enough to lock as-is. If a stale board cannot be locked honestly and the
owner regenerates before locking, that is a second ~141–150 credit run on those days.
Behaviour assumptions have already been wrong twice in this project — the 9:30am/pm
ambiguity, and "pressing Generate writes a server board" — so this one is written down
rather than left implicit.

Archive costs below are **measured from the archives themselves**, not from the cron
schedules. `line-history.yml` is scheduled hourly but GitHub Actions actually delivers
**~4.1 snapshots/day** (14-day count), so it costs **~25 credits/day, not 144**.
`props-history` delivers its 2 snapshots/day reliably: ~161/day.

| scenario | /day | /month | 20K | 100K |
|---|---|---|---|---|
| never regenerate | 372 | 11,300 | 57% | 11% |
| regenerate half the weekdays | 422 | 12,800 | 64% | 13% |
| **regenerate every day before locking** | **513** | **15,600** | **78%** | **16%** |
| worst case the per-date cap allows (4 runs) | 831 | 25,300 | **126%** | 25% |

**All three realistic scenarios fit 20K. The per-date cap of 4 does NOT protect a 20K
plan** — it bounds a leak at ~25,300/month, which is over. The cap bounds *abuse*, not
*use*; the thing that keeps the bill down is that only one entry fires per day.

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
