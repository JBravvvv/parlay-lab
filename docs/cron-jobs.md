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
`app/api/generate/route.ts`), leaving one spare for a manual regenerate — **and since
2026-07-27 the cap counts SPENDING runs, not requests**, so a fire that the conditional skip
turns away costs nothing and leaves the margin intact. Before that fix a Sunday with two skips
plus a manual regenerate would have refused the third real fire with a 429.

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
| **record** | **median delay AND its spread** (p10/p90, or IQR) — see below |
| **trigger** | **median delay under ~3 minutes → move Sunday to `30 17 * * 0`** |
| **if the median delay exceeds ~3 min** | **shift EVERY entry earlier by the observed median** — this is the DEFAULT response, not a fallback for Sunday. It is the correction GitHub needed and nobody made for fifteen days |
| **worth** | +2.0 lineup-ready games per Sunday (13.0 vs 11.0 of 15.1) |

**Record the SPREAD, not just the median — they call for opposite responses.**

| observed | diagnosis | response |
|---|---|---|
| median ≈ 0, tight spread | punctual | move Sunday to 17:30 |
| **median large, tight spread** | **a consistent offset** | **shift every entry earlier by the median — correctable** |
| median ≈ 0, **fat tail** | intermittent queueing | **NOT correctable by shifting.** A shift moves the median onto the wrong side and the tail still misses. Needs the self-pacing treatment `snapshot_props.py` got, or a different scheduler |

A punctual median with a fat tail and a consistent offset look identical in the median alone,
and only the second can be fixed by moving the hour. GitHub's was the second kind — which is
why it *would* have been correctable, had anyone measured it.

**This is dated so it cannot become permanent by inattention.** An unrevisited "temporary"
choice is how the 22:45 sweep spent fifteen days landing at 07:30.

#### PRE-COMMITTED: what happens if 08-02 shows a fat tail

The third row above was a diagnosis with no response attached. Scoped 2026-07-27 so the 08-02
decision is a choice, not the start of a research project.

**First, how much damage is even left.** The non-destructive board store (`fbbcbb0`) already
absorbed most of it: a late thin pass no longer overwrites the fat one, it lands beside it and
`gen=best` still returns the fat board. So a fat tail can no longer destroy an artifact. What
it can still do is make **`latest` — the board Josh actually bets from — be the late thin
one**. That is the whole remaining exposure, and it narrows the response considerably.

**Not the answer: refusing the fire.** `/api/generate` already carries the argument against it
in a comment at the `gen` stamp — *"Refusing here would trade a visible defect for an
invisible one."* A refused fire leaves no board and no label; a late one leaves a labelled
board that `best` correctly demotes. Keep recording, keep not enforcing.

**The answer is redundancy, for the same reason `snapshot_props.py` got ten crons.** Against a
fat tail, the only lever that raises P(*some* fire lands in the window) is more independent
fires. Duplicate each entry at **+20 and +40 minutes** — 3 fires per slot instead of 1.

**And redundancy is nearly free, which is the measured property that makes it the answer.** A
redundant fire that adds nothing returns from the conditional skip *before* any Odds call:
`slateStarts()` is keyless statsapi, the stored-board read is Redis, and `eng.collectSlate()`
— the ~120-credit part — is downstream of the skip. A no-op fire costs one statsapi request.

**✅ The blocker is fixed (2026-07-27), and it was a correctness bug on its own.** The run cap
used to `INCR` *before* the conditional skip, so a skipped fire spent budget it had not spent a
credit of — wrong today, with no redundancy needed to trigger it. A day with two skips (a dead
slate and a covered slate) plus one manual regenerate left **the third legitimate fire hitting
429 and no board getting built**, and with four entries live a normal Sunday already sat at 3
of 3. A cap named for spend must count spend.

The skip now runs first; the `INCR` sits immediately below it.

> **Placement note — immediately BEFORE `collectSlate()`, not after it.** "Count the spend"
> invites moving it past the work, and that is wrong in the other direction: `collectSlate()`
> fetches ~15 games × 6 markets against a 60 s `maxDuration`, so a timeout or an upstream 5xx
> **spends the credits and throws**. Incrementing afterwards would count zero for every such
> run and leave the ceiling unbounded exactly when it is needed. Counting at the point of
> commitment is pessimistic on purpose, and `K_LASTGEN` (the 45-minute limiter) is set on the
> same line for the same reason.

With that in, redundancy is a clean separate decision at 08-02.

### The 08-02 redundancy question, specified

Not "should we add fires" but: **what does a 2×-redundant fire buy against the delay
distribution we will actually have measured by then?**

By 08-02 there are ~7 days of `gen.at` stamps against four configured entries. That gives an
empirical delay CDF, `F`. For a slot at hour *h* with a usable window *W* (the interval where a
pass still prices a materially better board — from the schedule sweep, roughly the 90 minutes
before the day's bulk first pitch):

* **1 fire** lands in-window with probability `F(W)`;
* **2 fires** at *h* and *h+Δ* land at least once with `1 − (1 − F(W))(1 − F(W − Δ))` **only if
  the delays are independent**. They are almost certainly *not* — a queue backlog delays every
  job in it — so the honest estimate uses the observed **joint** behaviour of the four entries
  on the same day, not a product of marginals.

That correlation is the whole question, it is measurable from the same 7 days, and it decides
the answer: **redundancy buys nearly nothing against a common-mode queue and a great deal
against independent jitter.** Report the marginal gain in P(in-window) per added fire, and the
cost in redundant no-op fires against the 100/day cron-job.org free tier.

| if 08-02 shows | do |
|---|---|
| median ≈ 0, tight | move Sunday to `30 17 * * 0`. Nothing else changes |
| median large, tight | shift **every** entry earlier by the observed median |
| **median ≈ 0, fat tail** | run the redundancy calculation above on the observed joint delays. Add fires only if the measured marginal gain justifies them. Do **not** shift the hours — a shift moves the median onto the wrong side and the tail still misses |
| large median **and** fat tail | shift by the median first, then re-run the redundancy calculation on the residual |

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


---

# BOARD-LEVEL HISTORY DOES NOT SURVIVE 72 HOURS (2026-07-26)

**Scoped, not built.** Asked because the crossover estimate needs **≥ 20 boards**, and the
range detector, the ladder test and the 2.28 decomposition all read persisted boards.

## What each store actually retains

| store | key | retention | keeps |
|---|---|---|---|
| board | `pl:board:{date}` + `:{at}` + `:gens` | **3 days** | the whole board, all generations |
| prediction store | `pl:pred:{date}` (indexed by `pl:pred:days`) | **permanent — nothing is ever pruned** ¹ | per-row `p`, `pModel`, `pMkt`, `w`, `edge`, `ev`, `odds`, `cz`, `czEv`, `lu`, `tags`, `ln`, `hist`, `at` — and now `gens[]` |
| `line-history` branch | `data/props/*.json` | **permanent (git)** | prop **market** rows only: `fair`, `n`, `fb`, `fp`, `czf`, `bo`, `bu`, `no`, `cz` |
| ledger | `pl:ledger:v1` | permanent | locked bets only — dark all window |
| board archive | `data/boards/*.json.gz` on `line-history` | **permanent (git)** — built 2026-07-27 | the whole board, `best` and `latest`, gzipped |

¹ **CORRECTION (2026-07-27): "prunes at `SUMMARY_DAYS = 45`" was wrong.** `SUMMARY_DAYS` is
a **read window**, not a prune. `pl:pred:{date}` is written with a plain `SET` — no TTL — and
no code path issues `DEL` against it or `SREM` against `pl:pred:days`. Every prediction row
ever logged is still in the store, and `tests/calibration-window.test.ts` pins that by source
scan. The real defect the wrong wording was pointing at is one order milder and is written up
under *THE READING WINDOW SLIDES* below: nothing is lost, but the **summary** silently stops
covering the start of the collection period around **2026-09-08**.

## So what becomes unreproducible after 3 days

The prediction store keeps **rows**, not the board. Missing from it, and needed by the work
already done:

| finding | needed | in the prediction store? |
|---|---|---|
| `pitcher_outs` audit (§1–8) | the row **`case`** strings — `"18.7 IP over 4 starts … ~13.3 outs"` | **NO** — every factor was backed out of those strings |
| H+R+RBI PA audit | `case` — `"re-based to #N spot PA (~X AB vs Y AB/g)"` | **NO** |
| ladder / dispersion tests | **`propBoard`** (`pO`, `fO`, `ln`, uncapped, both sides) | **NO** |
| range-compression detector | `propBoard` | **NO** |
| 2.28 decomposition | ticket `czEv`/`bsEv`/`consCzEv` to run the +2% chain | **NO** — `ParlayPred` keeps only `{name, type, prob, czDec, czOdds, legs[{label, prop, lkey, gkey, prob}]}` |
| sim-coverage measurement | row `tags` + `gameInfo.start` | **partly** — tags are kept, sliced to 8 |
| clamp / shrink audits | nothing persisted (they run on the fixture) | **n/a — unaffected** |

> **Most of this project's board-level findings are currently unreproducible after 72
> hours.** They were all taken off a live or freshly-persisted board. The 20-board threshold
> for the crossover is not reachable at all under a 3-day TTL.

## ✅ BUILT — 2026-07-27

`tools/archive_boards.py` + `.github/workflows/board-archive.yml` → `data/boards/` on
`line-history`.

| | |
|---|---|
| **what** | `GET /api/board?date=<PT date>&gen=best` **and** `&gen=latest`, plus `&gen=list` for the index |
| **where** | `data/boards/YYYY-MM-DD.best.json.gz`, `.latest.json.gz`, `index.json` on `line-history` |
| **cost** | **zero Odds credits** — it reads what the pass already paid for. `/api/board` is deliberately ungated, so the workflow needs **no secret** |
| **size** | **1.36 MB raw → 150 KB gzipped**, measured on the real 07-26 board |
| **when** | `0 12` and `0 19` UTC daily, targeting PT **yesterday** and the two days before |
| **delay tolerance** | the 3-day TTL × 2 crons × a 3-date window = **six independent chances per date**. No individual firing has to be punctual |

### Both generations, and why that is nearly free

The original scope said `best` alone. Josh's correction: `latest` is what a bet was actually
placed from, so any bet-reconstruction question needs it, and the two differ on exactly the
days that matter — Sunday, and any day with a late fire.

Naively that is two files a day. It is not, because **git content-addresses blobs**: on a day
with one generation the two files are byte-identical and cost **one** blob plus a tree entry.
Verified on the backfill commit — `4a5e96c0…` appears twice in `git ls-tree`, 4 entries, 3
unique blobs. This only works because the archive gzips with `mtime=0` and no filename header;
default `gzip` stamps the current time into the header and would make every day two distinct
blobs *and* make re-archiving an unchanged board churn a fresh 150 KB. So:

* days with one generation → **150 KB**
* days where `best ≠ latest` (Sundays, late fires) → **300 KB**
* ≈ **55–60 MB/year**, not the 23 MB first estimated — the original 62 KB figure was **2.4×
  low**, taken from a guess rather than from a board.

Writing both filenames unconditionally is deliberate: a missing file then always means "the
archive failed", never "the two happened to agree".

### Capture is after the day, not racing it

The default target is PT **yesterday** and the two days before — never today, which is still
being generated. The last generation of PT day D is the Sunday 22:30 UTC entry (15:30 PT on
D); the `0 12` UTC run on D+1 is 05:00 PT, **13.5 hours later**. Even at GitHub's measured
+8.75 h that run lands ~20:45 UTC and still resolves PT-yesterday to D. The three-date window
is what makes the schedule non-load-bearing rather than the clock.

### Backfill

`2026-07-26` archived (`1e77c9d` on `line-history`) — the board every current finding rests
on. **`2026-07-25` and `2026-07-24` were already gone**: `/api/board` returns
`no-board-for-date` for both. The TTL had already taken them, which is the concrete version of
the claim above rather than the projected one.

That board's stamp: `at` = 2026-07-26T16:46:16Z (09:46 PT), `gen: null` — it predates the
`gen` stamp, so the series' first entry is unlabelled and every later one is not.

### What the archive unblocks, and when

The ≥20-board threshold now has a **date** instead of a hope.

| board dates | count | 20th board |
|---|---|---|
| 07-26 backfill + 07-27 → 08-14 | 20 | 2026-08-14 (archived 08-15) — **superseded, see below** |
| without the backfill, 07-27 → 08-15 | 20 | 2026-08-15 |

Both are **floors**, and they assume a board is generated and stored every day. A day where
the generation fails, or an off-day with no slate, pushes the date out one for one. The
archive prints `BOARD SERIES n = <k>` on every run, so `n` is read off the run rather than
counted forward from an assumption.

**REVISED 2026-07-27 — the threshold is 2026-08-15.** The 07-26 backfill was archived before
`clampActivity` shipped, so it carries no clamp data and cannot join the comparison series.
Counting instrumented boards only: **19 by 08-14, 20 by 08-15**. The crossover doctrine's review
date moves with it.

On **2026-08-15** these become answerable for the first time on more than one board:

| currently resting on | what n=20 changes |
|---|---|
| **crossover 3.05 pp** — one board, 218 tickets | a distribution instead of a point. The standing rule *"parlays win if per-leg overconfidence is under ~3 pp"* gets a **review date of 2026-08-14** rather than resting on 2026-07-26 indefinitely |
| the **2.28 → 2.13 decomposition** — `WITHIN 1.00 [0.90, 1.17]` at n=37 legs | the Phase 3 no-shrink default was explicitly deferred to ≥20 boards. This is that reading |
| **range-compression detector** — runs on `propBoard`, currently the fixture | re-run over the archive series and report **whether the fixture was representative**. `pitcher_outs` read 0.50 on the live board; if the fixture disagrees, the fixture is the thing that is wrong |
| **clamp / shrink activity audits** — `tests/clamp-activity.test.ts`, `tests/shrink-activity.test.ts`, both fixture-based | same question, higher stakes: **25 of 30 clamp sites execute on the fixture**, and the five cold ones were classified as harness limitations from reasoning, not from a second population. Twenty real boards is that second population |

The fixture-vs-archive comparison is the point, not a formality: every clamp and shrink number
in the frozen table came from one armed fixture. A rule this project has already paid for
twice — *the re-check must come from a different instrument* — says those numbers are
single-instrument until 08-14.

## THE READING WINDOW SLIDES — the same problem one order slower (2026-07-27)

**Nothing is pruned.** Corrected above: `pl:pred:{date}` is a plain `SET`, no TTL, no `DEL`,
no `SREM`. What moves is `allDays.slice(-SUMMARY_DAYS)` in `/api/calibrate`.

| | |
|---|---|
| collection period | `CAL_START` 2026-07-25 → freeze exit ~2026-09-22 = **60 logged dates** |
| `SUMMARY_DAYS` | **45** |
| window first caps | **2026-09-08** (`CAL_START` + 45) |
| window at freeze exit | **2026-08-09 → 2026-09-22** — the first **15** logged dates, 2026-07-25 → 2026-08-08, are outside it |

So the exit reading — reliability slopes, the disagreement panel, per-market gaps,
`globalShrink` — would have been computed over three quarters of the period the freeze exists
to collect, and nothing in the payload said which quarters. Josh's guess of "08-08" was one
day off in the safe direction: 08-08 is the last **excluded** date.

`docs/collection-period.md` already recorded the *mechanism* — "`CAL_START` goes inert around
2026-09-08" — and stopped one step short of the *consequence*. Same shape as the
coverage-denominator series, and the same lesson.

**One further caveat: `allDays` counts LOGGED dates, not calendar days.** A missed slate or a
failed cron pushes the cap date later in calendar terms while the window still holds exactly
45 entries. 2026-09-08 is the earliest it can bite, not a fixed date.

### Fix shipped — two windows, and the reading is the wider one

Widening the window that feeds `applyWeeklyAdjustment` would change the model's blend weights.
That is a frozen-parameter decision and Josh's to sign off, so the two consumers were separated
instead of merged:

| channel | window | consumer | behaviour |
|---|---|---|---|
| `summary` | last 45 logged dates | `applyWeeklyAdjustment` → blend weights | **unchanged, byte-identical** |
| `summary.full` | **every eligible date, never sliding** | the exit reading | new |

Both stamp their own bounds in `.window` — `from`, `to`, `days`, `limit`, `eligibleLogged`,
`dropped`, `droppedFrom/To`, `capped` — because a window is a denominator, and the standing
rule is that a denominator is declared, not remembered. `summary.full` is computed and attached
**always**, not only once `dropped > 0`: it is identical to `summary` until ~09-08, which is
exactly the point — the plumbing is exercised for six weeks before it first matters, rather
than appearing untested on the day it first diverges.

`tests/calibration-window.test.ts` (6 tests) pins the no-prune claim by source scan, the 60 >
45 arithmetic, the 09-08 and 08-09 dates, that only the narrow window reaches the weight
adjuster, and that the wide channel is unwindowed by `limit: null` rather than by a larger
constant that would itself expire one day.

**Still unshipped, and deliberately:** raising `SUMMARY_DAYS` itself. If it is ever raised it
must land **before 2026-09-08**, not at freeze exit — landing it at exit would move the weights
on the same day the exit reading is taken.

# WED/THU ARE GETAWAY DAYS — the cause, not just the mechanism (2026-07-27)

Keep rates of 43% (Wed) and 50% (Thu) against 93–100% Mon/Tue/Fri were labelled "start-time
selection". That is the mechanism. **The cause is the schedule**, and it dictates a different
fix from Sunday's.

First pitch by day of week, 52 days (2026-06-05 → 07-26, 664 games). **Hours are wrapped at
12:00 UTC** — a 00:40 UTC first pitch is a *late* game, and an unwrapped hour column makes
Monday look 45% early when it is 1%:

| dow | games | p10 | p25 | median | p75 | p90 | **started by 22:00 UTC** | shape |
|---|---|---|---|---|---|---|---|---|
| Mon | 67 | 22.7 | 23.1 | 23.7 | 25.6 | 25.8 | **1%** | single night block |
| Tue | 92 | 22.7 | 22.8 | 23.7 | 24.7 | 25.7 | 2% | single night block |
| **Wed** | 92 | **17.2** | 19.2 | 22.7 | 23.7 | 24.7 | **35%** | **BIMODAL**, gap 2.4 h |
| **Thu** | 54 | **17.2** | 17.7 | 22.7 | 23.2 | 24.1 | **46%** | **BIMODAL**, gap 1.1 h |
| Fri | 117 | 22.7 | 23.1 | 23.6 | 24.2 | 26.1 | 4% | single night block |
| **Sat** | 121 | 18.2 | 20.1 | 20.2 | 23.2 | 25.7 | **51%** | **BIMODAL**, gap 1.9 h |
| **Sun** | 121 | 17.6 | 17.7 | **18.2** | 19.2 | 20.2 | **93%** | **single early block** |

**Confirmed: Wed and Thu are bimodal, Sunday is shifted.** Wednesday and Thursday carry a
getaway-day matinee block at ~17:12 UTC *plus* a normal night block at ~23:00, separated by 2.4
and 1.1 hours. Sunday has one block, 93% of it inside a 2.6-hour window (p10 17.6 → p90 20.2)
and essentially no night games.

## Which means the fixes are different, and only one of them is already scheduled

| day | shape | fix |
|---|---|---|
| **Sunday** | one early block | **one earlier sweep catches everything** — the 17:00 UTC entry. Already scheduled, tested 08-02 |
| **Wed · Thu · Sat** | **two blocks** | **a single sweep cannot catch both.** Earlier catches the matinees and loses the night games; later does the reverse. Needs a **second sweep** on those days |

> **So the retime fully fixes Sunday and only half-fixes Wed/Thu/Sat**, and it half-fixes them
> in the direction that keeps the *night* block — which is the larger one on Wed/Thu (65% and
> 54%) but the smaller one on Saturday (49%).

`tools/snapshot_props.py`'s self-pacing already handles this correctly **in principle**: it
takes a close whenever the next unstarted first pitch is within 95 minutes, at most one per 40
minutes, so a bimodal day should produce *two* closes. The ten crons span 17:00–01:00 UTC, which
covers both blocks. **This has never been observed working, because no snapshot has yet carried
`kind` at all.** The first bimodal day under the new cadence — **Wednesday 2026-07-29** — is the
test, and it is a different test from Sunday 08-02:

* **Wed 07-29**: does a bimodal day produce **two** closes, one per block? If it produces one,
  `MIN_GAP_S` (40 min) or the window is wrong for split slates.
* **Sun 08-02**: does a single-block day produce a close at all, and does the keep rate go from
  6.7% to ≥90%?

Both are printed by `tools/close_capture.py`.
