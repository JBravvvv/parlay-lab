# External scheduler entries — cron-job.org (2026-07-26)

**Josh types the secret. It is never entered on his behalf, never logged, never placed in a
query string.** `/api/generate` spends ~120 Odds credits per call, so the secret travels in a
**header** only.

`/api/generate` came out of `vercel.json` in the same change that created these — with the
Vercel cron still live, the 16:00 UTC board would exist by the time these fire and the
**conditional skip** (`app/api/generate/route.ts`, "a good board for this date already
exists") would make every one of them a no-op. There must be no window with both firing.

## The three entries

| field | value |
|---|---|
| **URL** | `https://parlay-lab-six.vercel.app/api/generate` |
| **Method** | `GET` |
| **Header name** | `x-cron-key` |
| **Header value** | the value of the `CRON_SECRET` env var on Vercel — **paste it into cron-job.org's header field yourself** |
| **Timezone** | set the job timezone to **UTC** |
| **Treat as failure** | HTTP ≥ 400 (a `429` means the per-date run cap of 3 was hit) |

| # | when | cron (UTC) | why |
|---|---|---|---|
| 1 | **Mon–Fri** | `0 22 * * 1-5` | weekday first pitches cluster 23:05–23:40 UTC (7:05–7:40 ET); 22:00 is ~1–1.5 h out, after lineups post |
| 2 | **Saturday** | `0 18 * * 6` | Saturday is split early/late; 18:00 serves the afternoon bulk |
| 3 | **Sunday** | `0 17 * * 0` | Sunday bulk is 17:35 UTC (1:35 ET) — 17:00 is 35 min out |
| 4 | **Sunday** | `30 22 * * 0` | the national night game (23:20 UTC / 19:20 ET) is 5 h 45 m after the bulk, and no single Sunday hour serves both. On 2026-07-26 that one game carried **11 of the 17** closed-form H+R+RBI rows — **65% of the ladder-defect exposure** |

**Two Sunday fires stay inside the per-date cap** (`MAX_RUNS_PER_DATE = 3`,
`app/api/generate/route.ts`), leaving one spare for a manual regenerate.

**The hours are unchanged from your spec.** The GitHub delay finding does **not** move them,
because it is specific to GitHub Actions' scheduled-workflow queue and does not apply to a
dedicated HTTP scheduler.

## What the delay lesson DOES change

**Correction to the premise: the CLV job's ~96×/day record is NOT evidence that cron-job.org
fires on time.** The ledger has been dark since the NO-PLAY window opened — `/api/clv` sights
*locked legs only*, and there have been none. Its executions may have been punctual or hours
late and **nothing downstream would look different.** The record shows the job runs, not that
it runs when it says.

**cron-job.org's timing at these hours is UNVERIFIED.** Treat it as unknown until measured,
exactly as GitHub's was for fifteen days.

**Two checks, either of which settles it:**
1. **cron-job.org's own execution history** — actual fire times per job.
2. **The board's own `gen.at` stamp** (added 2026-07-26, below) against the configured hour.
   This needs nothing but `/api/board`, and it is the one that keeps working after the first
   week.

**If cron-job.org also queues, the entries move EARLIER by the observed delay** — which is
precisely the correction GitHub needed and nobody made for fifteen days. Do not assume the
configured hour is the effective hour for any scheduler until its own record says so.

## The board now says where it landed — `gen`

`/api/generate` stamps every board it writes:

| field | meaning |
|---|---|
| `gen.at` | fire time (ms) |
| **`gen.lateMs`** | how far **past the earliest first pitch** — positive means the board priced a slate already underway |
| **`gen.leadMs`** | how far **before the next** first pitch — what lineup coverage turns on |
| `gen.games` / `gen.started` / `gen.live` | slate size, started, still bettable |
| `gen.luConfirmed` / `gen.luPct` | lineup coverage **over unstarted games only** |
| `gen.achievable` | schedule-only ceiling at that moment |

It also logs a warning when the board has **no unstarted games**, or when the next first
pitch is **more than 6 h out** (lineups almost certainly unposted).

**Recorded, never enforced — the board is still written.** Refusing to build on a late fire
would trade a visible defect for an invisible one: no board at all, and no record of why.
`/api/clv` can refuse because a missed sighting is unrecoverable; a late board is merely
worse, and a labelled worse board is strictly better than none.

**And `/api/generate` has no self-pacing.** `tools/snapshot_props.py` was made delay-tolerant
(it reads the slate and decides), but `/api/generate` generates whenever it is called. A
delayed fire produces a board at the wrong distance from first pitch, **silently** — the only
trace is the board's own `at` stamp. Until the execution history is checked, read `at` on the
first few boards and confirm it lands where these entries say.

## What the retime is worth, and where it does not reach

`docs/hrr-recalibration.md`: the sim reproduces **76%** of the market's H+R+RBI ladder
dispersion, the closed form **0%**, and sim coverage is all-or-nothing per game because the
sim needs **both** lineups. On the 2026-07-26 board (generated 16:46 UTC), 33 of 50 H+R+RBI
rows were sim-priced and 17 were not.

| game | first pitch (UTC / ET) | why no pregame sim | HRR rows |
|---|---|---|---|
| `clevelandguardians@tampabayrays` | 16:15 / 12:15 | **already LIVE** at generation — the sim ran, but as a *live* sim, and the H+R+RBI pregame marginal requires `!liveInit` | 3 |
| `losangelesangels@sanfranciscogiants` | 20:05 / 16:05 | 3 h 19 m out — lineups borderline | 3 |
| `newyorkyankees@philadelphiaphillies` | **23:20 / 19:20** | **Sunday Night Baseball**, 6 h 34 m out | **11** |

**All 15 games had a valid `gamePk`** — this is not a name-matching or `gamePk` failure. It is
timing, plus one live-sim branch that does not feed the H+R+RBI marginal.

> ### The retime reaches ~100% on weekdays and ~78% on Sundays
> Weekday starts are tightly clustered (23:05–23:40 UTC), so a **22:00 UTC** board is past
> lineup posting for essentially every game.
>
> **Sunday is structurally different.** The bulk is 17:35 UTC and the national game is 23:20
> UTC — **5 h 45 m apart.** A 17:00 UTC Sunday board serves the bulk and is still 6 h 20 m
> ahead of the night game, whose lineup will not be posted. That game carried **11 of the 17**
> closed-form rows on this board — **65% of the exposure, and the retime does not reach it.**
>
> **No single Sunday hour serves both.** If the Sunday-night game matters, it needs a *second*
> Sunday entry near **22:30 UTC** — cheap on cron-job.org, and it would run into the per-date
> cap of 3 only if something else already fired twice. Listed as a decision, not added.
