import type { LeagueConfig } from "@/lib/football/league";
import { ALIASES } from "./aliases";

/**
 * THE CFB DESK'S CONSTANTS — one copy, imported everywhere (INSTRUCTION 38, 2026-09-05).
 *
 * Allotment: "Ledger & Allotted $ for College Football should be separate (But still $150
 * Core & $25 Fun money)" — originally the same daily paper allotment as MLB's PAPER set, on its
 * own ledger, its own bank and its own storage keys (widened to $250 on 2026-09-08, Josh:
 * "Widen the CFB allocation to $250" — core $250 / day, $50 max per ticket, 3–10 tickets; the
 * $25 fun allotment is unchanged). A CFB slate day is a Pacific date with at least one
 * kickoff; the allotment is per locked slate day.
 *
 * Model constants are MODEL CONSTANTS, stated here so The Sharp can print them:
 *   sigma 16.5     — the standard deviation of FBS final margins about the closing spread
 *                    (college margins are wider than the NFL's ~13.5); used by the normal
 *                    margin model that turns a spread (or an FPI gap) into a win probability
 *                    and a cover probability at any line.
 *   sigmaTotal 18  — the same for game totals.
 *   hfa 2.6        — home-field advantage in points, applied to the FPI margin only when
 *                    the site is not neutral (the market's own spread already prices it).
 *   blend          — the home win probability is a weighted average of what exists for the
 *                    game: the de-vigged moneyline consensus, the consensus spread through
 *                    the margin model, and the FPI gap through the margin model. Weights
 *                    renormalize over the inputs that exist (a game with no moneyline — the
 *                    -40.5 blowouts post "OFF" — blends spread + FPI only).
 *   spreadBlend    — the expected margin the cover probabilities price off: mostly the
 *                    market's consensus margin, nudged by FPI.
 *   pinnacleWeight — Pinnacle counts twice in the consensus median (the sharp anchor).
 *   minBooks 2     — a consensus needs two books at the line, else the market is null.
 *   settleBook     — Caesars (The Odds API key `williamhill_us`): the price every ticket
 *                    settles at, exactly as the MLB card does.
 */
export const CFB_PAPER = {
  since: "2026-09-05",
  /** widened 150 → 250 on 2026-09-08 (Josh: "Widen the CFB allocation to $250"); a day locked before that keeps its own recorded `daily` */
  daily: 250,
  fun: 25,
} as const;

export const CFB_RULES = {
  /** a core leg needs this % EV at Caesars */
  minEvPct: 2,
  maxLegs: 2,
  /** no core ticket settles above this decimal price */
  maxDec: 2.6,
  /** no core ticket carries more than this, top-up included — 25 → 50 on 2026-09-08 with the $250
      allotment: kellyCap 0.02 × CFB_BANK_BASE 2500 = $50, so the Kelly ceiling at the base bankroll
      IS the per-ticket max (assertLeagueConfig pins the equality) */
  maxStake: 50,
  minStake: 5,
  /** 3–7 → 3–10 on 2026-09-08: 10 × $50 = $500 ≥ the $250 allotment, so the day can always deploy in full */
  tickets: { min: 3, max: 10 },
  /** the forced top-up (the $250 must deploy) only adds short-priced tickets, by probability */
  forcedMaxDec: 1.75,
  /** the forced top-up admits legs down to this EV% at Caesars (never negative EV) */
  forcedMinEvPct: 0,
  /** one leg per game per ticket, and no two core tickets share a game */
  oneLegPerGame: true,
  /** fun money rides the likeliest sides — grade D or better at Caesars (never an F), by probability */
  fun: { legs: { min: 3, max: 5 }, minDec: 4, maxDec: 40, minEvPct: -3 },
  kellyFrac: 0.25,
  kellyCap: 0.02,
} as const;

export const CFB_MODEL = {
  sigma: 16.5,
  sigmaTotal: 18,
  hfa: 2.6,
  blend: { mkt: 0.6, spread: 0.25, fpi: 0.15 },
  spreadBlend: { mkt: 0.75, fpi: 0.25 },
  pinnacleWeight: 2,
  minBooks: 2,
  settleBook: "williamhill_us",
  /** how far apart (ms) an ESPN kickoff and an odds-feed commence_time may sit and still match */
  matchWindowMs: 3 * 3600_000,
} as const;

/** Correction 4's figure, mirrored: the CFB paper bankroll initializes at the same base. */
export const CFB_BANK_BASE = 2500;

/**
 * THE SERVER LOCK (INSTRUCTION 45, 2026-09-05, Josh, verbatim: "Parlay Lab CFB should've been
 * running the same $150 per day theoretical Core money and $25 Fun money per day"). Until this
 * ship the CFB card locked ONLY when a person tapped LOCK in the Builder, so the prod CFB ledger
 * held zero entries while the MLB desk's scheduler wrote a 'server-lock' entry every day. Now
 * `/api/cfb/lock` (poked by `/api/scheduler` on the same ~15-min pulse, same cron header) locks
 * the day's card server-side, once per slate date, into `CFB_REDIS.ledger` by MERGE.
 *
 *   leadMs            the lock window opens this long before the date's FIRST kickoff — one
 *                     hour, so Caesars' final pregame lines are on the board and every game on
 *                     the slate is still ahead (buildCfbCard only prices games that have not
 *                     kicked off). Before the window the poke answers `waiting`; a poke that
 *                     lands after the first kickoff still locks, from the games still ahead, and
 *                     the entry's note says so; a poke after the LAST kickoff locks a NO-PLAY
 *                     entry whose note says the window was missed — never a card on lines that
 *                     are gone.
 *   forwardTimeoutMs  the scheduler's self-forward to /api/cfb/lock aborts after this long, so a
 *                     slow ESPN / odds / Redis round trip can never hold the MLB poke open
 *                     indefinitely. WHAT THAT DOES AND DOES NOT GUARANTEE (corrected 2026-09-06,
 *                     verification pass, DEFECT 6 — the old wording claimed the 25 s cap meant
 *                     the forward "can never cost the MLB poke its 90 s function budget (the
 *                     generate forward alone can take ~60 s)", and the arithmetic does not
 *                     support that): the generate forward in app/api/scheduler/route.ts is sent
 *                     with NO signal and NO timeout at either call site, so a ~60 s generate plus
 *                     this 25 s abort is 85 s of a 90 s maxDuration — FIVE seconds of headroom
 *                     for the whole rest of the tick, and a generate slower than 65 s kills the
 *                     invocation before this abort can ever bind. What IS guaranteed: this cap
 *                     bounds the CFB forward's OWN share of the tick to 25 s, and the forward is
 *                     the tick's LAST step — it runs after mlbTick has produced its answer and
 *                     after /api/generate has already committed its own writes under its own
 *                     300 s budget — so a platform kill here costs the poke its HTTP answer and
 *                     that pulse's CFB lock, never an MLB write, and the next poke (~15 min)
 *                     retries. Closing the 5 s gap for real means putting a timeout on the
 *                     generate fetch, which lives in a file this change does not own; lowering
 *                     this number instead would only shrink the CFB desk's own budget while
 *                     leaving the untimed forward ahead of it exactly as it is.
 *   The route's own maxDuration (app/api/cfb/lock/route.ts, 60 s) sits ABOVE this cap on purpose,
 *   so the CALLER's abort is always the binding one and a poke the caller gave up on can still
 *   finish writing the day.
 */
export const CFB_LOCK = {
  leadMs: 60 * 60_000,
  forwardTimeoutMs: 25_000,
} as const;

/**
 * HOW MANY PREVIOUS PT DATES ONE POKE MAY SWEEP (2026-09-06, verification pass, DEFECT 3).
 *
 * The first cut swept `prevPtDates(date, 2)[1]` — exactly one PT date back. On CFB the week's
 * entire meaningful slate IS Saturday, so a two-day ticker outage left the one day that carries
 * the money silent forever: precisely the silence the sweep exists to abolish. The sweep now
 * walks this many previous PT dates, newest first.
 *
 * WHY THREE: from any poke through Tuesday it still reaches back to Saturday (Tue − 3 = Sat), so
 * the day that carries the money survives a full weekend outage. It is also the cost bound: at
 * most three `espnEvents` reads per poke (six keyless ESPN scoreboard fetches) and ZERO Odds API
 * credits, and only on a genuinely unrecorded history — the FREE ledger check runs first and the
 * walk stops at the first date that already carries an entry, so a swept-clean desk (every normal
 * day) spends nothing at all. Dates before CFB_PAPER.since are skipped without a fetch (DEFECT 2).
 */
export const CFB_SWEEP_DAYS = 3;

/**
 * HOW MANY TIMES ONE DATE MAY BE TOPPED UP (INSTRUCTION 45, THE OTHER HALF, 2026-09-06).
 *
 * Josh, verbatim: "Parlay Lab CFB should've been running the same $150 per day theoretical Core
 * money and $25 Fun money per day" (the core allotment is CFB_PAPER.daily — widened to $250 on
 * 2026-09-08, Josh: "Widen the CFB allocation to $250"; the rule is unchanged, the number moved).
 * "The same" is what the MLB desk does, and the CFB lock was doing only half of it. The lock fires
 * CFB_LOCK.leadMs before the FIRST kickoff — the moment the pool of posted Caesars prices is
 * thinnest — and buildCfbCard says out loud when it cannot spend the whole allotment ("$75 of the
 * $150 stayed undeployed", the note on the 2026-09-05 fixture, recorded in docs/cfb-desk.md — under
 * the $250 allotment the same note reads "$175 of the $250 stayed undeployed"). Every later poke hit the already-locked exit and returned, so the
 * day ended permanently short while the ledger recorded it as a full paper day and cfbBankroll
 * sized every later day off it.
 *
 * MLB settled this on Josh's own word — src/lib/paper-mode.ts TOPUP_MAX, quoting him: "I said $150
 * every day no matter what so we could track and calibrate off of it" — with exactly this number.
 * It is mirrored here rather than imported so the two desks can never silently drift into sharing
 * a knob: CFB tops up at most twice per date, and each attempt is recorded on the entry itself
 * (`topUps`), so the bound survives a cold start, a redeploy and an overlapping poke.
 *
 * WHY A BOUND AT ALL: every attempt that gets as far as pricing costs one game-lines pull (6 Odds
 * credits, measured on prod 2026-09-05: the quota moved 17578 → 17572). Two is enough to catch the
 * evening lines that post after a morning lock without letting a ~15-min ticker grind the quota all
 * Saturday: the FREE checks in decideCfbTopUp (device lock, BOTH allotments closed, this cap, the
 * CFB_TOPUP_RETRY_MS cooldown, no time passed since the lock) refuse before any fetch at all.
 * The one refusal that is NOT free — every game on the date has kicked off — is not in that
 * function: it needs the ESPN board and lives in `topUpDate` (app/api/cfb/lock/route.ts), past
 * one KEYLESS scoreboard read and still above the priced board this number bounds.
 *
 * TWO ALLOTMENTS, AND EACH ARM COUNTS ITS OWN (2026-09-06, DEFECT M then L1). Josh's sentence
 * names two pots of money — the core allotment (CFB_PAPER.daily, $250 since 2026-09-08) and $25
 * fun — and decideCfbTopUp gates them INDEPENDENTLY:
 * a day may fire because the core has room, or because the fun bucket is still empty, or both.
 *
 * THE PARAGRAPH THAT STOOD HERE IS WITHDRAWN, not merely superseded (D1, this round; two critics
 * flagged it). It said the two "do NOT get an attempt budget each" and that this number "is
 * counted per DATE, over the `topUps` rows, whichever bucket the attempt was serving". That was
 * true of DEFECT M(a) and L1 changed it: counting both arms in one undifferentiated total meant a
 * fun attempt SPENT a core attempt, so an entry carrying two completed fun-only rows and $75 of
 * core still owed answered "the top-up cap is spent (2 of 2)" and the core's own two chances were
 * gone without ever having been offered. Each attempt now records which arms were OPEN when it
 * fired (`arms` on CfbTopUpRecord), and `decideCfbTopUp` counts each arm against its own allowance
 * of this number — `used` over the rows that could have served the core, `funUsed` over the rows
 * that could have served the fun bucket. A row written before that change carries no `arms` and is
 * counted against BOTH, the direction that refuses more spending rather than less.
 *
 * THE TOTAL SPEND IS BOUNDED AT CFB_TOPUP_MAX PRICED TOP-UP BOARDS PER DATE (the sentence read
 * "2 priced boards" when the constant was 2; INSTRUCTION 48, 2026-09-09, raised the constant, not
 * the shape — a fix-round draft withdrew this invariant as "2 × CFB_TOPUP_MAX", which double-counts,
 * and it is reinstated here). Why the per-arm counters cannot be played off against each other: both arms only ever
 * CLOSE — core room and ticket slots only shrink, and a fun bucket that has been seated is never
 * empty again — so every attempt with the core arm open comes before every attempt without it, an
 * attempt with both arms open charges BOTH counters, and no interleaving can exceed the per-arm
 * allowance. One pull answers both questions at once, which is why the thing being bounded is the
 * PRICED BOARD rather than the bucket. What widened on 2026-09-06 is the set of dates that can
 * reach the bound, since a day at full core with an empty fun bucket used to refuse for free.
 * See `decideCfbTopUp` and `CfbTopUpRecord` in src/lib/cfb/lock-server.ts.
 *
 * INSTRUCTION 48 (2026-09-09), Josh verbatim: "The Card for today is 'locked' which is fine, but it
 * only played $25 today. I understand thats all it had meeting the criteria at this time which is
 * completely fine. Throughout the rest of the day refresh, if it analyzes more picks/parlays that
 * meet the betting criteria, it can continue to add to the card up to the daily allotted amount.
 * It can lock multiple times per day, but it can never remove a pick it can only add to it".
 * 2 → 6 per arm on 2026-09-09. Each attempt that reaches pricing costs one 6-credit lines pull
 * (measured above; docs/cfb-desk.md), so the day's top-up lines spend is bounded at
 * 6 × 6 = 36 credits (42 with the lock's own pull) — arms only close, so the per-arm counters
 * share those attempts rather than each getting their own — noise beside CFB_PROPS.dailyBudget
 * (2500). The card only grows: `applyTopUp`
 * appends and `assertAppendOnly` (src/lib/append-only.ts) throws before any write that would
 * drop or resize a seated ticket.
 *
 * INSTRUCTION 49 (2026-09-09), Josh verbatim: "It shouldn't be refreshing every 15 minutes. It
 * should be 8am, 9:30am, 12pm, 3pm & 4:45pm. Other than that I can manually do it and it can
 * function the same way whether I manually refresh it or it refreshes itself automatically".
 * THE SLOT GATE: the already-locked branch of app/api/cfb/lock/route.ts asks `decideRefillTick`
 * (src/lib/server/grading-progress.ts, REFILL_SLOTS_PT — the grading calendar) from its OWN clock
 * and calls `topUpDate` only on the first ticker pulse inside [slot, slot + 15 min) for
 * 08:00/09:30/12:00/15:00/16:45 PT, or on `?manual=1` (Josh's Refresh via POST /api/refill),
 * which runs the identical pass with slot "manual". Every other pulse answers
 * `skipped` before any feed is touched — zero ESPN reads, zero Odds credits. THE SAME-SLOT
 * REFUSAL: each claim row is stamped with the `slot` it fired on, and `decideTopUp` refuses a
 * second attempt whose slot a filled row already carries ("refill slot HH:MM PT already ran
 * today"), free; a manual slot is never refused on that ground. Six is therefore the five slots
 * plus one manual attempt after a full slot day, and CFB_TOPUP_RETRY_MS is 0 — the calendar is the
 * only pacing.
 */
export const CFB_TOPUP_MAX = 6;

/**
 * HOW LONG AN EMPTY ATTEMPT HOLDS THE NEXT ONE OFF — 0 since INSTRUCTION 49 (2026-09-09) — the refill slot calendar
 * (REFILL_SLOTS_PT, src/lib/server/grading-progress.ts: 08:00/09:30/12:00/15:00/16:45 PT) is the
 * only pacing. The retry constant is kept so cfg.topUp.retryMs and the lock-server cooldown
 * literal (`last && isClaimRow(last) && now - last.at < CFB_TOPUP_RETRY_MS`, pinned by
 * tests/cfb-lock-route.test.ts) still type-check and a future tune is one line.
 *
 * WHY 0 AND NOT A RE-TUNE: with the slot gate in front of it a cooldown can only ever EAT a slot.
 * The 08:00 → 09:30 gap is 90 minutes, and an empty 08:00 attempt under the old 45-minute
 * value (INSTRUCTION 45, 2026-09-06, the MLB desk's `45 * 60_000` "ran recently" precedent) would
 * have been harmless — but any value of 90 minutes or more, measured from the 08:00 attempt, could
 * swallow the 09:30 slot whenever the 09:30 tick landed earlier in its 15-minute window than the
 * 08:00 tick did, and the value had no reason left to exist once a slot tick is already
 * gated to one attempt per slot (the same-slot refusal in `decideTopUp`).
 *
 * WHAT THE GATE TESTED while it was live (corrected 2026-09-06, INSTRUCTION 45, D1): the cooldown
 * asked `isClaimRow(last)` — is the LAST recorded attempt a row that is still UNFILLED — never
 * `core === 0`, because a top-up may complete having seated only the day's FUN parlay and such a
 * row records `core: 0` as a FINISHED attempt. An attempt that seats nothing leaves an unfilled
 * row instead (`topUpDate` returns `skipped` on an empty probe without calling `applyCfbTopUp`,
 * so the row `claimCfbTopUp` wrote stays `filled: false`). That reading is unchanged; the window it measured is simply zero now.
 */
export const CFB_TOPUP_RETRY_MS = 0;

/**
 * THE SETTLE PASS (INSTRUCTION 45, THE OTHER HALF, 2026-09-06) — its cost bound and its
 * "is this day actually over" rule.
 *
 * Nothing settled a server-locked CFB day: the whole grading chain is browser-only (gradeCfbEntry
 * ← gradeCfb ← gradeCfbPending ← the Ledger tab's button), and the scheduler's grading tick
 * forwards to /api/calibrate?grade=only, which has no CFB code at all. So cfbLedgerStats reported
 * 0-0 forever and cfbBankroll stayed pinned at CFB_BANK_BASE — every later day Kelly-sized off a
 * bankroll that could never move, which is the calibration Josh asked for and did not get.
 *
 * maxDatesPerPoke  the whole cost of settling. A settle costs ONE keyless ESPN scoreboard read per
 *                  date (finalsFromEspn builds its board with `oddsEvents: []`, the same trick the
 *                  sweep uses) and ZERO Odds API credits — but a long backlog must not turn one
 *                  poke into a dozen upstream reads. Two dates per poke drains any realistic
 *                  backlog within a few pokes of the ~15-min ticker while adding at most two ESPN
 *                  reads (four fetches — espnEvents reads the date AND the next date) to a poke.
 *                  A date whose every ticket is won / lost / push is skipped on the FREE ledger
 *                  check (`cfbSettleCandidate`) and never read again, so the steady state is zero.
 *                  The one exception, added later the same day by DEFECT S1: a date whose only
 *                  unsettled verdicts are 48-hour VOIDS stays readable for CFB_VOID_RECHECK_MS
 *                  past its last kickoff, because such a game can still finalise — see that
 *                  constant, which also states what that costs.
 * finishMs         how long after the LAST kickoff of a date the day is treated as finished and
 *                  worth reading. A college football game runs about three and a half hours; six
 *                  hours clears a long one plus overtime and a weather delay, so a poke inside a
 *                  live slate spends nothing at all instead of reading a scoreboard that cannot
 *                  yet settle anything. Reading early is not unsafe — gradeCfbEntry reports a
 *                  game with no final as `pending` and never invents a result — it is only waste,
 *                  and the whole point of this pass is that it costs nothing.
 */
export const CFB_SETTLE = {
  maxDatesPerPoke: 2,
  finishMs: 6 * 3600_000,
} as const;

/**
 * HOW LONG A 48-HOUR VOID STAYS PROVISIONAL (INSTRUCTION 45, 2026-09-06, DEFECT S1 — the second
 * critic's regression pass).
 *
 * DEFECT I(a) widened the void so it escalates on the CLOCK alone: a leg still pending
 * CFB_UNGRADABLE_MS (48 h) past its kickoff is `ungradable`, whatever ESPN last said about the
 * game. That is right — it is what ends the "read this date on every poke, for ever" starvation —
 * but it was made TERMINAL, and terminal is a stronger claim than the desk can support.
 *
 * MEASURED (the probe that found it): a CFB game suspended for weather at 20:00 on 2026-09-05 and
 * RESUMED 50 hours later, which ESPN serves as `live` throughout. At K+48h−1ms the ticket is
 * `pending`; at K+48h+1ms it is `ungradable` and, because `overlayCfbGrading`'s RESOLVED set counts
 * a void as resolved, `grading.done` flips true — and `cfbSettleCandidate` refused a done date, so
 * `settlePass`'s todo filter never selected that date again and NO LATER ESPN READ WAS EVER MADE.
 * The honest verdict would have been accepted if anything had offered it (a void is not in SETTLED,
 * so the overlay lets a real final overwrite it) — nothing offered it. The money: `ticketPL`
 * (src/lib/bankroll.ts, the `push/void/pending → 0` arm) books a genuine winner as a wash, so
 * realizedPL stays 0 for that ticket and cfbBankroll — which Kelly-sizes every later day — stays
 * low by that amount PERMANENTLY.
 *
 * So the void is now PROVISIONAL for a bounded window: a date whose only unsettled verdicts are
 * voids stays a settle candidate until this long past its LAST kickoff, and after that it is
 * closed for good. Nothing about the 48-hour escalation changed — the desk still says "void" while
 * it waits, and still stops waiting — only its permanence.
 *
 * WHY SEVEN DAYS. A resumed or rescheduled college game is played inside the same week: the NCAA's
 * own make-up practice is the following weekend at the latest, and a game not replayed by then is
 * not going to be. It also spans a full ticker week, so a date cannot be closed by an outage that
 * happens to straddle a weekend.
 *
 * IT HAS A SECOND CONSUMER SINCE DEFECT C1 (2026-09-06), and a maintainer moving this number
 * moves both. `voidWindowMs` (src/lib/cfb/grade.ts) hands THIS window — instead of the 48 hours
 * every other pending shape gets — to the one leg shape that means "the result exists and our read
 * of it failed": a game reported `final: true` whose score will not parse. The two are the same
 * number on purpose, so the grader can never still be waiting for a result the settle pass has
 * stopped fetching.
 *
 * WHAT IT COSTS, stated rather than buried: at most ONE keyless ESPN scoreboard read per voided
 * date per poke (`finalsFromEspn` builds its board with `oddsEvents: []`) and ZERO Odds API
 * credits — never a game-lines pull, which only the lock and the top-up path can buy. It cannot
 * re-open the starvation DEFECT I(b) closed either: `settlePass` tiers its queue on the last read
 * attempt, so a voided date read on this poke sorts to the BACK and every other candidate is still
 * reached within one poke per two dates. A date with no void in it is never re-read at all, which
 * is the steady state for every ordinary Saturday.
 */
export const CFB_VOID_RECHECK_MS = 7 * 24 * 3600_000;

/** Device storage — DISTINCT from every MLB key (pl_ledger / pl_bank2 / pl_noplay). */
export const CFB_KEYS = {
  ledger: "pl_cfb_ledger",
  bank: "pl_cfb_bank2",
} as const;

/** Cloud storage — DISTINCT from pl:ledger:v1 / pl:bank:v1 / pl:noplay:v1.

    `oddsGap` is a PREFIX, not a blob: `${oddsGap}:${date}` is a short-lived marker the lock
    route's odds-missing refusal leaves behind (2026-09-06, verification pass, DEFECT 4), so the
    next day's sweep can tell a day the ticker never reached inside its window from a day that was
    poked all day and refused for want of a Caesars price. It holds no money and no card — the
    ledger is still the only record — and it expires on its own. */
export const CFB_REDIS = {
  ledger: "pl:cfb:ledger:v1",
  bank: "pl:cfb:bank:v1",
  oddsGap: "pl:cfb:oddsgap:v1",
} as const;

/** How long an odds-gap marker lives. Sized to outlast the sweep window itself
    ((CFB_SWEEP_DAYS + 1) days), so a marker can never expire while the walk that reads it can
    still reach its date — an expired marker would send the sweep back to the ticker-gap note for
    a day the odds feed actually lost. */
export const CFB_ODDS_GAP_TTL_SEC = (CFB_SWEEP_DAYS + 1) * 24 * 3600;

export const CFB_ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american";
export const CFB_ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
export const CFB_ESPN_FPI = "https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?region=us&lang=en&limit=400";

/** Player props (INSTRUCTION 39): the Odds API event-odds endpoint is one call per event,
    so a slate is capped at `maxEvents` priced events; `settleBook` is Caesars, as everywhere.

    QUOTA RAILS (2026-09-05, measured on prod): one fresh 24-event pull cost ~753 credits —
    about 31 credits per event (x-requests-used 2428 → 3187 across the pull plus one 6-credit
    slate call), NOT the 6 per event the endpoint's "[markets] × [regions]" note suggests. The
    Next data cache is per deployment, so every deploy re-spent it. Hence: 12 events, a 2 h
    window, the parsed board persisted in Redis across deploys (src/lib/cfb/props-store.ts),
    and a hard daily budget the route may spend, estimated at `measuredCreditsPerEvent` per
    event (worst case without the budget: 12 × 31 × 12 pulls/day = 4464; with it, 1200).

    LIVE WINDOW (INSTRUCTION 40, 2026-09-05): props used to vanish the moment the slate kicked
    off — `selectPropEvents` admitted only pre-kick games. It now admits LIVE games too (never
    final / postponed), live first. In-game lines move, so a board whose priced set holds a live
    event is held for `liveRevalidateSec` (10 min) instead of the 2 h `revalidateSec`: the
    stored board's staleness check and each event call's data-cache window read that shorter
    figure through `propsWindowSec` (src/lib/cfb/props.ts).

    SIZED FOR THE LIVE CADENCE (2026-09-05, review fix): a full 12-event re-price every 10 min
    would burn the 1200-credit day in four pulls (12 × 31 = 372 each), after which the props
    board used to collapse to nothing for the rest of the Pacific day — the same symptom
    INSTRUCTION 40 asked to fix, only later in the afternoon. So (1) a live pull re-prices
    ONLY the games that moved: the in-play events, at most `liveMaxEvents` of them, while the
    upcoming games' rows are carried over from the stored board for as long as their own 2 h
    window allows (the route merges the two sets); (2) the stored board is retained in Redis
    for `boardRetainSec`, well past its window, and when the budget refuses a pull the route
    serves that last good board flagged `stale: true` instead of an empty one — lines a bettor
    can read, honestly dated, never fabricated. A Saturday with N games in play at once costs
    about N × 31 credits per 10 min; the daily budget still caps the total.

    EVERY ELIGIBLE GAME PRICED (INSTRUCTION 42, 2026-09-05) — Josh: "Its only showing ANYTIME TD
    picks for 3 games under 'ALL' ... There are a ton of games live and a ton of games the rest
    of the day. It should be grading every possible pick available on the board that falls under
    those props". The 12 / 6 caps were the bottleneck: a 60-plus-game Saturday priced twelve
    pre-kick games and six in play. The pools are now `maxEvents` 60 pre-kick and `liveMaxEvents`
    24 in play, so every game the slate can carry (odds event + a Caesars side) gets its props
    pull, and `dailyBudget` rises to 2500 to pay for it. The cost math, worst case: 60 × 31 =
    1860 credits per 2 h pre-kick re-price, plus up to 24 × 31 = 744 per 10-min live pull —
    uncapped that is far past any day, so the 2500/day rail stays the hard stop (spend past it
    serves the last board, stale). Two savers keep the real spend well under the worst case:
    (a) the EMPTY-EVENT RULE (route) — an event whose last pull returned ZERO rows is not
    re-pulled until `revalidateSec` after its own `pricedAt`, even when it is live, because many
    small games carry no player props at the API and re-asking every 10 min bought nothing;
    (b) per-event `pricedAt` on the stored board, so an upcoming game rides on its own 2 h window
    whatever the board's window is. Josh's Odds API month had 16,480 credits left when read
    2026-09-05.

    WHAT THE 2500/DAY RAIL MEANS ON A FULL SATURDAY (2026-09-05, review finding — a contract
    decision, not a code fix; the numbers below are pinned by the shared contract): one 60-game
    pre-kick pull books 1860 credits and leaves 640 = 20 event-pulls for the rest of the day. The
    first live pull with 24 in-play games that carry rows wants 744, so it gets 20 of them and every
    10-min pull after that gets none — the props board then serves its last priced lines, flagged
    `stale: true`, for the remainder of the Pacific day (the 2 h upcoming re-price is refused the
    same way). A mid-day cold start needing 60 + 24 events (2604) prices 80 and is done. Uncapped,
    24 live games for a 6-hour afternoon would be ~26,800 credits — more than the whole month left.
    The rail, the stale flag and the budget note all behave as designed; what they cannot do is
    fund a 24 × 10-min live cadence inside 2500 credits. Closing that gap means one of: a longer
    live cadence (30 min ≈ 8,900 per afternoon), a smaller live pool, or a daily budget reconciled
    with the monthly balance — and telling Josh plainly that live props freeze mid-afternoon until
    one of those is chosen.

    THE CAESARS-MISSING RULE (2026-09-05, Josh, verbatim: "It's still only showing ANYTIME TD picks
    for ARST @ MEM, WYO @ CSU, FIU @ USF, WMU @ MICH, SHSU @ TROY, BOISE @ ORE; They are still 12
    games today that haven't started w/ current Anytime TD odds"). Read on prod at ~15:45 PT: of 17
    games with rows, 11 carried DK / FD anytime-TD rows but NO Caesars quote on any row, while
    Caesars itself was posting those games. Caesars posts player props later than DK / FD, and an
    upcoming game rode its stored rows for the whole 2 h carry — priced once before Caesars posted,
    nothing re-asked. So: an UPCOMING game on the stored board that HAS rows and, on at least one
    MARKET with rows, carries no Caesars quote (`czMissingGameIds` — keyed on the market, so Caesars
    yardage props without a Caesars anytime TD still re-check), with kickoff inside
    `czMissingWindowSec` (4 h) ahead, is re-fetched once its own pricedAt is older than
    `czMissingRevalidateSec` (30 min) — instead of the 2 h carry. A game with ZERO rows is NOT
    Caesars-missing (review fix): it stays on the 2 h empty-event hold, upcoming or live — 29 of the
    46 priced games on the complaint day were FBS-vs-FCS games no book posts props on, and re-asking
    them every 30 min would have wanted ~7,200 credits. Outside the 4 h window the 2 h rule stands;
    live games keep theirs (a live game with rows re-prices only once ITS OWN pricedAt is older than
    `liveRevalidateSec`). Those re-pulls are part of the pull's "need", ordered AFTER the live games
    and the games never priced, so under a tight budget the cheapest wins still go first — which
    also means that on a busy live afternoon the re-checks are bought only when the live pulls leave
    room. Cost, honestly: per game at most one extra pull per 30 min in the 4 h before kickoff —
    8 × 31 = 248 credits worst case — but in AGGREGATE the 12 such games Josh named would want
    12 × 248 = 2,976, more than the 2,500 daily rail before a single live pull; the rail binds, and
    the games it refuses simply keep their last priced rows. A board that counts a Caesars-missing
    game answers `ttlSec` = min(window, 30 min) so the phone re-asks on the rule's cadence.

    THE CREDIT ARITHMETIC ABOVE IS UNCHANGED BY THE $250 ALLOTMENT (2026-09-08): the props route
    spends per EVENT, never per dollar staked, so widening the core from $150 / $25 max / 3–7
    tickets to $250 / $50 max / 3–10 tickets moves no credit figure here — the lock and the two
    top-up boards still cost one 6-credit game-lines pull each. */
export const CFB_PROPS = {
  /** pre-kick events priced per slate (INSTRUCTION 42, 2026-09-05: was 12 — every eligible game now) */
  maxEvents: 60,
  revalidateSec: 7200,
  /** the cache window (s) when any priced event is in play — in-game lines move */
  liveRevalidateSec: 600,
  /** in-play events a live re-price may fetch per pull (the upcoming games' rows are carried over; INSTRUCTION 42: was 6) */
  liveMaxEvents: 24,
  /** how long the last good board stays in Redis past its window — the stale fallback once the budget is spent */
  boardRetainSec: 36 * 3600,
  /** an upcoming game with rows but NO Caesars quote on some market it has rows for is re-asked this often (s) — Caesars posts props late; a game with no rows is never re-asked early */
  czMissingRevalidateSec: 1800,
  /** …but only inside this many seconds before its kickoff; earlier, the 2 h carry stands */
  czMissingWindowSec: 4 * 3600,
  regions: "us",
  minBooks: 2,
  settleBook: "williamhill_us",
  /** credits the props route may spend per Pacific day (INSTRUCTION 42, 2026-09-05: was 1200) */
  dailyBudget: 2500,
  /** measured 2026-09-05 (~753 credits / 24 events); the budget estimate's per-event cost */
  measuredCreditsPerEvent: 31,
} as const;

/** Suggested parlays by tier: leg counts, price bands, and the per-leg / per-game gates.

    INSTRUCTION 42 (2026-09-05, Josh, verbatim): "Under the 'generated parlays' on board tab,
    there needs to be A TON more. There should be 50 parlay options under each category (ML,
    spread, Anytime TD, Pass TD, Pass Yards, Receiving Yards, Combos, etc) The live parlay
    section and combo section (that has live & pregame picks on the same ticket) should still
    be generating picks as well". `perCategory` (50) caps each of the twelve category sets in
    CfbPicks.sets (CFB_PARLAY_CATEGORIES); `perView` stays for the legacy tiered "parlays"
    view. Single-market sets hold one leg per game; combo / mixed / live keep `maxPerGame`. Tier 2
    (below) applies to EVERY single-market set — ML, SPREAD and TOTAL included, not only anytime
    TD — on purpose: INSTRUCTION 42 asked for 50 tickets under every category, and each loosened
    ticket wears the EDGE − tag with its red EV, so nothing is passed off as a gated edge.

    TIERED LEG POOL (2026-09-05, Josh, verbatim: "It's also only showing 4 Anytime TD parlays in
    the generated parlays. It should be showing 50+ Anytime TD parlays"): Caesars shades anytime
    TD, so on the opening Saturday only six ATD legs across two games cleared the −3 gate, and
    SET_BAND's decimal cap of 60 made a third 3–8 leg impossible — four tickets. A single-market
    category set now builds from tier 1 (Caesars-priced, EV ≥ `minLegEvPct`) first and, when that
    yields fewer than `perCategory` tickets, extends its pool to tier 2 — any Caesars-priced
    leg of that market, pregame or in-game (INSTRUCTION 44), with EV ≥ `setFloorEvPct` — until
    fifty or the pool runs dry. Tickets whose every leg passed the −3 gate rank first (by EV), then the rest by EV; each
    ticket carries `gated` so the Board can label the loosened ones honestly. The legacy tiered
    view, combo, mixed and live keep tier 1 only (combo's tier 1 is pregame + in-game legs since
    INSTRUCTION 44; the legacy view stays pregame-only). `setBands` overrides the set band per market:
    anytime TD legs price 3–8 decimal, so its tickets are 2–4 legs, decimal 4–250. */
export const CFB_PARLAYS = {
  safer: { legs: { min: 2, max: 3 }, minLegProb: 0.58, maxDec: 3.5 },
  longshot: { legs: { min: 4, max: 6 }, minDec: 8, maxDec: 60 },
  mix: { legs: { min: 3, max: 5 }, minDec: 3, maxDec: 20 },
  /** a leg needs at least this % EV at Caesars (grade D or better, never an F) */
  minLegEvPct: -3,
  /** tier 2 for the single-market category sets only: a Caesars-priced pregame or in-game leg admitted down to this % EV once tier 1 cannot fill the set */
  setFloorEvPct: -12,
  /** per-market set bands (leg count + decimal price); a market absent here uses the shared set band (2–6 legs, decimal 1.5–60) */
  setBands: { anytime_td: { legs: { min: 2, max: 4 }, minDec: 4, maxDec: 250 } },
  maxPerGame: 2,
  /** legacy tiered view: tickets per tier */
  perView: 6,
  /** INSTRUCTION 42: ranked tickets per category set */
  perCategory: 50,
} as const;

export const CFB_ROUTES = {
  props: "/api/cfb/props",
} as const;

/**
 * THE CFB LEAGUE CONFIG (2026-09-08, the NFL build — Josh: "NFL needs to be built NOW"). The
 * shared football engine (src/lib/cfb/*, the server bodies under src/lib/server/football-*.ts)
 * reads every league-specific number through one `LeagueConfig` object; this is the CFB one,
 * built FROM the constants above — the SAME objects (CFB_PAPER, CFB_RULES, CFB_MODEL, …), never
 * copies, so a maintainer moving a number above moves the desk, and every literal-regex pin on
 * this file (tests/cfb-separation.test.ts) keeps matching. The NFL twin, NFL_LEAGUE, is written
 * as literals in src/lib/nfl/rules.ts. `assertLeagueConfig` (tests/nfl-config.test.ts) pins the
 * money invariants for both: kellyCap × bankBase === maxStake and tickets.max × maxStake ≥ daily.
 *
 * `feeds.oddsPropMarkets` copies src/lib/cfb/props-types.ts CFB_PROPS_ODDS_MARKETS (the six
 * market keys in CFB_PROP_MARKETS order) and `feeds.espnByAthleteUrl` copies
 * src/lib/cfb/props-context.ts espnByAthleteUrl, both as literals so this module stays a leaf
 * that imports nothing but its own alias table and a type.
 */
export const CFB_LEAGUE: LeagueConfig = {
  id: "cfb",
  idPrefix: "cfb",
  label: "College Football",
  short: "CFB",
  noun: "FBS",
  paper: CFB_PAPER,
  rules: CFB_RULES,
  model: CFB_MODEL,
  bankBase: CFB_BANK_BASE,
  lock: CFB_LOCK,
  sweepDays: CFB_SWEEP_DAYS,
  settle: CFB_SETTLE,
  ungradableMs: 48 * 3600_000,
  voidRecheckMs: CFB_VOID_RECHECK_MS,
  topUp: { max: CFB_TOPUP_MAX, retryMs: CFB_TOPUP_RETRY_MS },
  props: CFB_PROPS,
  parlays: CFB_PARLAYS,
  ctx: { season: 2026, limit: 250, ttlSec: 3600 },
  keys: CFB_KEYS,
  events: { change: "pl:cfb-ledger-change", sync: "pl:cfb-ledger-sync" },
  redis: { ...CFB_REDIS, propsBoard: "pl:cfb:props:v1:", propsSpend: "pl:cfb:props:spend:v1:" },
  oddsGapTtlSec: CFB_ODDS_GAP_TTL_SEC,
  queryPrefix: "cfb",
  routes: { slate: "/api/cfb", ledger: "/api/cfb/ledger", lock: "/api/cfb/lock", props: CFB_ROUTES.props },
  feeds: {
    oddsSportKey: "americanfootball_ncaaf",
    oddsUrl: CFB_ODDS_URL,
    oddsEventBase: "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events",
    oddsPropMarkets: "player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds",
    espnScoreboard: CFB_ESPN_SCOREBOARD,
    espnScoreboardQuery: "groups=80&limit=400",
    espnFpi: CFB_ESPN_FPI,
    espnByAthleteUrl: (group, season = 2026) => {
      const q = `?region=us&lang=en&contentorigin=espn&season=${season}&seasontype=2`;
      const srt = { passing: "passing.passingYards", rushing: "rushing.rushingYards", receiving: "receiving.receivingYards" }[group];
      return `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/statistics/byathlete${q}&isqualified=true&page=1&limit=250&category=offense%3A${group}&sort=${srt}%3Adesc`;
    },
    headshotUrl: (athleteId) => `https://a.espncdn.com/i/headshots/college-football/players/full/${athleteId}.png`,
  },
  lockSource: "server-lock",
  triggers: { lock: "cfb-lock", oddsGap: "cfb-lock-odds-gap", sweep: "cfb-lock-sweep", sweepOdds: "cfb-lock-sweep-odds" },
  aliases: ALIASES,
} as const;
