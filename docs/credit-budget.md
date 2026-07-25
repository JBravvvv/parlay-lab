# Odds API credit budget (2026-07-25)

**Measured 2026-07-25: 15,872 used, 4,128 remaining on a 20,000/month plan, ~24 days
into the cycle → ~661 credits/day → ~20,500/month.** The architecture is structurally
over-subscribed *before* adding anything. At this rate the key exhausts in ~6 days,
which would take `/api/clv` down with it — and CLV is the scoreboard the entire
collection period is built on.

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

## If the archives are worth keeping
The next tier is **100,000 credits/month at $59** (current: 20,000 at $30). At the
present ~20,500/month, upgrading buys ~5× headroom for $29/month more and requires no
instrument to be gutted — including keeping both archives *and* running the second pass.
Given that the archives' only cost is money and their only alternative is deletion, this
is a reasonable thing to buy rather than engineer around.
