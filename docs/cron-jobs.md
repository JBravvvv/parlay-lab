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

## The hours, checked against a 50-day schedule sample (2026-06-05 → 07-26, 664 games)

`ready` = games both **unstarted** and past their 3 h lineup window at that moment — what a
pass can actually price pregame with a real lineup.

| day type | hour | started | unstarted | **ready/day** | % of day |
|---|---|---|---|---|---|
| **Mon–Fri** | 21:00 | 1.9 | 10.5 | 6.4 | 52% |
| **Mon–Fri** | 21:30 | 1.9 | 10.5 | 7.8 | 63% |
| **Mon–Fri** | **22:00** | 1.9 | 10.5 | **8.2** | **66%** ← best |
| Mon–Fri | 23:00 | 4.3 | 8.1 | 7.4 | 60% |
| **Saturday** | 17:00 | 0.2 | 14.9 | 2.8 | 18% |
| **Saturday** | **18:00** | 1.2 | 13.9 | **6.5** | **43%** ← best |
| Saturday | 20:00 | 3.0 | 12.1 | 5.4 | 36% |
| **Sunday** | **17:00** | 0.9 | 14.2 | 11.0 | 73% |
| **Sunday** | **17:30** | 1.0 | 14.1 | **13.0** | **86%** ← best on paper |
| Sunday | 18:00 | 6.5 | 8.6 | 7.6 | 50% |

**Mon–Fri 22:00 and Saturday 18:00 are already optimal** — both are the peak of their sweep,
and Saturday is structurally hard because its games spread across the whole day.

> ### Sunday 17:30 beats 17:00 by ~2 games/day — and I still recommend 17:00 for now
> 13.0 vs 11.0 lineup-ready games. But the Sunday bulk starts at **17:35**, so a 17:30 fire
> has **five minutes** of delay tolerance on the largest block of the slate, against 35
> minutes at 17:00. **cron-job.org's punctuality at these hours is unverified**, and GitHub
> just demonstrated what an unverified scheduler can do (+8.75 h for fifteen days).
>
> **Take 17:00 now; move to 17:30 once the `gen.at` stamps show the scheduler is punctual.**
> That is the delay lesson applied rather than restated.

### ⏳ DATED OPEN ITEM — revisit Sunday 17:00 → 17:30

**Opened 2026-07-26. Decide on or after 2026-08-02.**

| | |
|---|---|
| **measurement** | observed `gen.at` against the configured hour, on all three entries, over 7 days |
| **source** | `/api/board?date=<d>&gen=list` returns the generation index; `gen.at` is also on every prediction-store day blob as `gens[]` |
| **trigger** | **median delay under ~3 minutes → move Sunday to `30 17 * * 0`** |
| **if the median delay exceeds ~3 min** | leave Sunday at 17:00 **and shift every entry earlier by the observed median**, the correction GitHub needed and nobody made for fifteen days |
| **worth** | +2.0 lineup-ready games per Sunday (13.0 vs 11.0 of 15.1) |

**This is dated so it cannot become permanent by inattention.** An unrevisited "temporary"
choice is how the 22:45 sweep spent fifteen days landing at 07:30.

## What the Sunday 22:30 entry actually buys — and what it costs

At 22:30 on a Sunday, **14.1 of 15.1 games are already started** and **1.0 is unstarted and
lineup-ready**. So the pass reaches **one game**.

**It cannot damage the other fourteen.** `mergeDayBlob` filters incoming rows by
`!started(r.gkey)` and freezes any stored row whose game has begun
(`if (prev && started(prev.gkey)) continue`). The 17:00 pass's rows for the afternoon slate
are **frozen before the 22:30 pass runs**, so the second entry is purely additive to the
prediction store. **The "trades one ladder-defect source for another" worry does not
materialise** — the live-game exposure is in games whose rows were already captured pregame.

**The real cost is elsewhere: it overwrites the stored BOARD.** `/api/generate` does an
unconditional `SET BOARD_KEY(date)`, so after 22:30 the persisted board for that Sunday is
the thin one — `categories` carrying essentially the night game alone. Consequences:

| surface | effect |
|---|---|
| prediction store / calibration / Phase 2 | **none** — records merge and freeze correctly |
| `/api/board` for that date, and any later analysis of it | **the fat 15-game Sunday board is gone**, replaced by a ~1-game board |
| the client | fine — `bestBoard` prefers the board that prices more still-bettable games, and at 22:30 both price one |

Every board-level measurement in this project was taken from a persisted board. **On Sundays
that artifact would become the 22:30 one.** Not a reason to skip the entry — the ladder
exposure it removes is worth more — but it is the trade, and a non-destructive board store
(keep the better board rather than the latest) is the obvious follow-up.

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
