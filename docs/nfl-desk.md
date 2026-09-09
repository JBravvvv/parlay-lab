# NFL desk — constants, pipeline, keys, routes, cron coverage (written 2026-09-08)

Josh, verbatim, 2026-09-08: "1. Widen the CFB allocation to $250  2. NFL needs to be built NOW  3. Allocation should be set to $350". This document is the NFL half; the CFB widening is recorded in `docs/cfb-desk.md` (section "Allocation widened", 2026-09-08). Every constant below is the value in `src/lib/nfl/rules.ts` on the day this was written, with the line it was read from. Nothing here has been read from prod yet — the NFL desk ships ahead of its first slate (TNF 2026-09-10).

## Shape — one engine, three desks
- `src/lib/sport.ts:19` — `Sport = "mlb" | "cfb" | "nfl"`; `SPORTS = ["mlb","cfb","nfl"]` (`:30`); `SPORT_META.nfl = { label "NFL", short "NFL", emoji "🏈", eyebrow "National Football League", feed "ESPN final scores" }` (`:27`). The switch is still `pl_sport` / `pl:sport`, server snapshot `mlb`.
- `src/lib/features.ts` — `NFL_ENABLED = true`; `false` hides the pill and pins every page to the other desks.
- **How to flip the sport:** tap **NFL** on the SportSwitch (phone header or the desktop rail). Every page (`app/{board,builder,props,ledger,sharp,games,stats,settings}/page.tsx`) early-returns its NFL surface BELOW the pinned CFB early-return, importing from `@/components/nfl/NflX`. The NFL wrappers are thin: `src/components/nfl/NflBuilder.tsx` etc. render `<LeagueProvider desk={NFL_DESK}><CfbBuilder /></LeagueProvider>` — the `src/components/cfb/*` files ARE the shared football surfaces, reading everything league-specific through `useLeague()` (`src/components/football/LeagueContext.tsx`, default `CFB_DESK`).
- The switch is label-only at both sizes ("MLB / CFB / NFL", no emoji — `src/components/shell/SportSwitch.tsx:15-22`): at 375px the CFB desk's header row leaves 106px and the label-only `sm` switch measures 101px (161px with emoji); the 200px rail (168px content) fits three md label-only pills at 164px but not three emoji pills (208px). Builder H's page measurement at 375px: CFB desk 370/375, MLB/NFL 342/375. The phone top-bar icons are `p-[3px]`.
- Accent: `--color-nfl: #4f8cff` (`app/globals.css:36`) — blue, distinct from CFB amber `#f5a524` and MLB lime. `.segmented-thumb.is-nfl`, `.stat-tile.is-nfl`, `.rail-glow.is-nfl`, `.odds-grid.is-nfl`, `.hero-price.is-nfl`, `.sheet-60.is-nfl` all exist (`globals.css:382,467,476,517,644,682`); `text-nfl` / `border-nfl/*` / `bg-nfl/*` come from the `@theme` token.
- **NFL Season Lab is CUT for this ship** — `/season` stays CFB-only (`CFB_SEASON_ENABLED`, the nav's `cfbOnly` gate unchanged, `src/lib/features.ts` says so in the `NFL_ENABLED` docblock). NFL has no new nav entry.

## The league config (Plan 3 seam)
- `src/lib/football/league.ts` — pure types (`LeagueConfig`, `LeagueRules`, `LeagueModel`, `LeagueProps`, `LeagueParlays`, `LeagueFeeds`, `DeskHandles`) plus ONE runtime helper, `assertLeagueConfig(cfg)`: throws unless `rules.kellyCap × bankBase === rules.maxStake`, `rules.tickets.max × rules.maxStake ≥ paper.daily`, and `idPrefix === id`. No React, no store imports.
- `CFB_LEAGUE` is built at the bottom of `src/lib/cfb/rules.ts` FROM the existing CFB_* constants (so the literal-regex pins on that file keep matching); `NFL_LEAGUE` is written as literals in `src/lib/nfl/rules.ts:230-273`. Its `model` is `NFL_MODEL`, its own object — never `CFB_MODEL` by reference.
- Engine modules under `src/lib/cfb` take `cfg: LeagueConfig` with a CFB default at the component layer (`buildCfbCard(board, { …, rules?, idPrefix? })`, `buildCfbPicks(…, { parlays?, idPrefix?, rules? })`, `buildCfbBoard({ …, league? })`, `lockCfbCard(card, board, now, cfg?)`, `gradeCfbEntry(entry, finals, now, cfg?)`, `validateCfbLedger(x, cfg?)`) and NO default at the server money seams: `src/lib/cfb/slate-server.ts` `espnEventsOf(cfg, date)` / `slateFromEspnOf(cfg, …)` / `finalsFromEspnOf(cfg, …)`, `src/lib/cfb/lock-server.ts` `assertCardMoney(cfg, card)` / `buildLockEntry(cfg, …)` / `planTopUp(cfg, …)`, `src/lib/server/football-lock.ts` `sweepPrevDates(cfg, keys, …)` / `settlePass(cfg, keys, …)` / `topUpDate(cfg, keys, …)`, `src/lib/server/football-props.ts` `footballPropsGet(cfg, req, deps)`. A forgotten league at a money seam is a type error, not a CFB ticket on the NFL ledger.
- Ticket / pick ids carry `idPrefix` at EVERY mint site: `nfl-<date>-core-<i>`, `nfl-<date>-fun-1`, `nfl-<date>-topup<n>-core-<i>` / `-fun-1`, picks `nfl-<date>-<view>-<n>`.
- The team matcher (`src/lib/cfb/names.ts matchOddsEvent`) takes the league's `model.matchWindowMs` as its fourth argument (threaded from `buildCfbBoard`, `src/lib/cfb/model.ts`); both leagues are 3 h today. `NFL_LEAGUE.aliases` is `{}` on purpose — ESPN's `displayName` and The Odds API both use the full NFL team names, and `tests/nfl-engine.test.ts` pins 13 of 13 fixture games matched.
- FPI columns are read BY NAME from the root `categories[].names` (`fpi`, `fpirank`) for both leagues (`src/lib/cfb/model.ts fpiColumns`, `:153-167`). This matters on the NFL: in the NFL powerindex `fpirank` is names index 4, and the old positional read (`values[1]`) would have returned `epaoffense` as the rank.

## Money (`NFL_PAPER`, `NFL_RULES`, `NFL_BANK_BASE`)
| constant | value | where |
|---|---|---|
| `NFL_PAPER` | since `2026-09-10`, daily **$350** core, fun **$25** | `src/lib/nfl/rules.ts:26-30` |
| `NFL_RULES.minEvPct` / `maxLegs` / `maxDec` | 2 % / 2 / 2.6 | `:34-37` |
| `NFL_RULES.maxStake` / `minStake` | **$50** / $5 | `:39-40` |
| `NFL_RULES.tickets` | 3 to **10** | `:42` |
| `forcedMaxDec` / `forcedMinEvPct` / `oneLegPerGame` | 1.75 / 0 / true | `:44-48` |
| `NFL_RULES.fun` | 3–5 legs, dec 4–40, minEvPct −3 | `:50` |
| `kellyFrac` / `kellyCap` | 0.25 / 0.02 | `:51-52` |
| `NFL_BANK_BASE` | 2500 | `:70` |
| top-up | `{ max: 6, retryMs: 0 }` (`NFL_TOPUP`, literals mirroring CFB; 2 → 6 by INSTRUCTION 48, retry 45 min → 0 by INSTRUCTION 49, 2026-09-09 — the five PT refill slots + manual are the only pacing) | `:120` |

Invariants (pinned in `tests/nfl-config.test.ts`, enforced at runtime by `assertLeagueConfig`): `0.02 × 2500 = 50 = maxStake`; `10 × 50 = 500 ≥ 350`. The card can always deploy the full $350: seven $50 tickets do it, and the forced top-up pool (dec ≤ 1.75, EV ≥ 0) fills the rest by probability. Grading windows: `NFL_UNGRADABLE_MS` 48 h (`:131`), `NFL_VOID_RECHECK_MS` 7 d (`:133`) — a postponed NFL game is replayed inside the week.

## Model (`NFL_MODEL`, `src/lib/nfl/rules.ts:56-67`)
sigma **13.5**, sigmaTotal **13.5**, hfa **2.0** (applied to the FPI margin only on a non-neutral site), blend `{ mkt .6, spread .25, fpi .15 }`, spreadBlend `{ mkt .75, fpi .25 }`, pinnacleWeight 2, minBooks 2, settleBook `williamhill_us` (Caesars), matchWindowMs 3 h. The pipeline (`buildCfbBoard`, `priceGame`, `kellyStake`) is the CFB one unchanged; only the numbers move.

## Feeds (`NFL_LEAGUE.feeds`, `src/lib/nfl/rules.ts:255-269`)
| feed | value |
|---|---|
| Odds sport key | `americanfootball_nfl` |
| game lines | `NFL_ODDS_URL` (`:164-165`): `…/v4/sports/americanfootball_nfl/odds?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american` — WITHOUT the key; the server appends `&apiKey=` from `process.env.ODDS_API_KEY` only |
| per-event props | `oddsEventBase` `…/v4/sports/americanfootball_nfl/events`, markets `player_anytime_td,player_pass_tds,player_pass_yds,player_receptions,player_rush_yds,player_reception_yds`, regions `us` |
| ESPN scoreboard | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` + `?limit=100&dates=YYYYMMDD` — NO `groups=80` (that is the FBS filter) |
| ESPN FPI | `https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?region=us&lang=en&limit=40` (32 teams; columns by name) |
| ESPN byathlete | `…/common/v3/sports/football/nfl/statistics/byathlete` per group (passing / rushing / receiving), season 2026, limit 150; `ctx.ttlSec` 3600 |
| headshots | `https://a.espncdn.com/i/headshots/nfl/players/full/<id>.png`; logos from the scoreboard's `team.logo` |

## Keys, events, ids, triggers
| kind | value | where |
|---|---|---|
| localStorage | `pl_nfl_ledger`, `pl_nfl_bank2` | `NFL_KEYS`, `:136-139` |
| window events | `pl:nfl-ledger-change`, `pl:nfl-ledger-sync` | `NFL_EVENTS`, `:142-145` |
| Redis | `pl:nfl:ledger:v1`, `pl:nfl:bank:v1`, `pl:nfl:oddsgap:v1:<date>` (TTL `(4+1)` days, `NFL_ODDS_GAP_TTL_SEC`) | `NFL_REDIS`, `:148-152`, `:161` |
| props Redis | `pl:nfl:props:v1:<date>`, `pl:nfl:props:spend:v1:<date>` | `NFL_PROPS_REDIS`, `:155-158` |
| react-query prefix | `nfl` — keys `["nfl","slate",date,bankroll]` / `["nfl","props",…]` (the Refresh Board pill invalidates the first two segments) | `src/lib/nfl/client.ts` |
| triggers | `nfl-lock`, `nfl-lock-odds-gap`, `nfl-lock-sweep`, `nfl-lock-sweep-odds` | `NFL_TRIGGERS`, `:217-222` |
| entry `sport` | `"nfl"` — `CfbLedgerEntry.sport` is `"cfb" \| "nfl"`; the merge kernel's allotment / fun caps come from a `DESK_PAPER` table keyed on the entry's sport (`src/lib/ledger-merge.ts`) — mlb `PAPER`, cfb `CFB_PAPER`, nfl `NFL_PAPER` |

Separation is pinned bidirectionally in `tests/nfl-separation.test.ts`: no `pl_cfb` / `pl:cfb` / `americanfootball_ncaaf` / `college-football` under `src/lib/nfl/**`, `app/api/nfl/**`, `src/components/nfl/**`; no `pl_nfl` / `pl:nfl` in the CFB tree; MLB keys in neither. `src/lib/nfl/rules.ts` is a pure constant module (no React, no store imports).

## Device store, sync, client, hooks
- `src/lib/football/store.ts makeDeviceStore(cfg)` — own subscribe / version / serverSnapshot closure per instance; `isEntry` tests `e.sport === cfg.id`; `lock()` calls `lockCfbCard(card, board, Date.now(), cfg)`. `src/lib/cfb/store.ts` re-exports the CFB instance under today's names; `src/lib/nfl/store.ts` exports the NFL instance as `readNflLedger`, `useNflLedger`, `gradeNfl`, `lockNfl`, `wipeNflDevice`, `importNflLedger`, `exportNflLedger`, `addNflBankAdjustment`, `getNflBankroll`, `nflExposure`, `NFL_CHANGE_EVENT`, `NFL_SYNC_EVENT`. The pure `upsertCfbEntries` is identity-shared with `NFL_STORE.upsertEntries`.
- `src/lib/football/sync.ts makeSync(cfg)` → `src/lib/nfl/sync.ts`: `syncNflNow`, `useNflSyncState`, `useNflSyncBeacon`. `AppShell` mounts a separate `useNflSyncBeacon();` line next to the pinned `useCfbSyncBeacon();` — the pinned call is never parameterised.
- `src/lib/football/client.ts makeClient(cfg)` → `src/lib/nfl/client.ts`: `NFL_STALE_MS`, `NFL_PROPS_STALE_MS`, `nflQueryKey`, `nflPropsQueryKey`, `loadNflSlate`, `loadNflFinals`, `loadNflProps`, `nflPropsStaleMs`, `nflCacheLabel`, `nflPricedAtLabel`. `DeskClient.queryKey` is typed `(date, bankroll) => readonly [League, "slate", string, number]` so both factories fit without a cast.
- `src/lib/nfl/useNflDesk.ts`: `useNflDesk()` → `{ today, date, pick, rail, bankroll, q, slate }`, `useNflBankroll()`.
- `src/lib/nfl/desk.ts:38` — `NFL_DESK: DeskHandles = { ...NFL_LEAGUE, store, sync, client, useDesk, useBankroll }`; the CFB twin is `src/lib/cfb/desk.ts` (`CFB_DESK`, the `LeagueContext` default).

## Routes (`NFL_ROUTES`, `src/lib/nfl/rules.ts:210-215`)
| route | what | shell |
|---|---|---|
| `GET /api/nfl?date&bankroll` | the priced slate — `espnEventsOf(NFL_LEAGUE, date)` then `slateFromEspnOf(NFL_LEAGUE, …)` (ESPN scoreboard for the date AND the next date, FPI, one Odds API game-lines pull); 502 when ESPN fails | `app/api/nfl/route.ts` |
| `GET /api/nfl?date&mode=finals` | scores only, `finalsFromEspnOf` — the grader's feed, zero Odds credits | same |
| `GET /api/nfl/ledger` / `PUT` | the cloud ledger on `pl:nfl:ledger:v1` / `pl:nfl:bank:v1`, merged through `mergeLedgers`; every entry must declare `sport: "nfl"` — a CFB or MLB entry is 400 (`app/api/nfl/ledger/route.ts:61,88`) | `app/api/nfl/ledger/route.ts` |
| `GET /api/nfl/lock` | the server lock rail (below) | `app/api/nfl/lock/route.ts` |
| `GET /api/nfl/props?date&bankroll` | the player-props board — `footballPropsGet(NFL_LEAGUE, req, { storeKeys })` (`app/api/nfl/props/route.ts:27`), the shared body `src/lib/server/football-props.ts`; the CFB props route is the same body on `CFB_LEAGUE` | `app/api/nfl/props/route.ts` |

Every NFL shell keeps its own literal keys and the CFB gate order: 503 when `CRON_SECRET` is unset → 401 unless `cronHeaderAuthed` → 503 unless `storeEnv`. Route files export only handlers and route config (scanned 2026-09-08: no other `export const` in any `app/api/**/route.ts`).

### Props (`NFL_PROPS`, `src/lib/nfl/rules.ts:182-195`)
maxEvents **16**, liveMaxEvents **16** (an NFL slate is at most 16 games — every game the slate can carry), revalidateSec 7200, liveRevalidateSec 600, boardRetainSec 36 h, czMissingRevalidateSec 1800, czMissingWindowSec 4 h, regions `us`, minBooks 2, settleBook `williamhill_us`, dailyBudget **1000**, measuredCreditsPerEvent **31**. Props rows' `headshot` is built from `cfg.feeds.headshotUrl` (the nfl path); `TeamMark.tsx PlayerMark` renders whatever a.espncdn.com headshot href the row carries. The props deep link is `/props?nfl=1&game=&mkt=&player=` — `app/props/page.tsx:94` flips the desk on `nfl=1`; an NFL href never carries `cfb=1` (`CfbTicketCard.tsx cfbLegHref`).

**Credits expectation per Sunday = events × 31.** The 31 is the CFB measurement (2026-09-05 prod, ~753 credits / 24 events on `americanfootball_ncaaf`) and is UNMEASURED on `americanfootball_nfl` — the same six markets over the same `us` region should cost about the same, but nobody has read the NFL number off a quota header yet. Week 1's Sunday fixture (`tests/fixtures/nfl/espn-scoreboard-2026-09-13.json`) carries 13 games → 13 × 31 = **403** credits per full pre-kick re-price; a full 16-game Sunday is 16 × 31 = **496**; the 1000-credit `dailyBudget` pays for two full boards plus change, after which the route serves the last board flagged `stale: true`. The CFB desk's ~2500/day cap binds on Saturdays; a Sunday NFL board on top of a Saturday CFB board is two separate daily budgets on the one Odds API key — read the first real NFL number from the `x-requests-used` headers on 2026-09-13 and replace the 31 here and in `NFL_PROPS.measuredCreditsPerEvent`. Add ≤42 lines credits per date on top (lock 6 + at most `NFL_TOPUP.max` = 6 top-up boards × 6 — the two arms share those attempts, INSTRUCTION 48).

Parlays (`NFL_PARLAYS`, `:198-208`): the CFB shape — safer 2–3 legs (minLegProb .58, maxDec 3.5), longshot 4–6 (dec 8–60), mix 3–5 (dec 3–20), minLegEvPct −3, setFloorEvPct −12, anytime_td band 2–4 legs dec 4–250, maxPerGame 2, perView 6, **perCategory 25** (a 16-game slate has fewer legs to draw on than CFB's 50).

## The server lock rail
- `/api/nfl/lock` is poked by `/api/scheduler`'s NFL self-forward (`src/lib/server/nfl-lock-forward.ts forwardNflLock`, imported on its own line in `app/api/scheduler/route.ts:17`), run CONCURRENTLY with the CFB forward under `Promise.allSettled` (`route.ts:116`); the body gains an `nfl` key (`attachNfl`, `:124`), `cfb` stays where it was, `mlbTick` is untouched. Each forward aborts at 25 s (`NFL_LOCK.forwardTimeoutMs`, `src/lib/nfl/rules.ts:102`), so the tick's worst case is max(cfb 25 s, nfl 25 s) + the ~60 s generate = 85 s inside the scheduler's `maxDuration = 90` (`route.ts:39`) — NOT their sum. `tests/nfl-config.test.ts:104-110` pins the ≤ 25 s bound; `tests/scheduler-route.test.ts` pins the added keys `["cfb","nfl"]`.
- Window: the day locks `NFL_LOCK.leadMs` = 60 min before the PT date's FIRST kickoff, from whatever is still ahead (`decideCfbLock` is league-free). A kicked game is never priced; after the LAST kickoff the day gets a NO-PLAY claim row whose note says the window was missed (and, when `pl:nfl:oddsgap:v1:<date>` says so, that the odds feed lost the day rather than the ticker).
- Decide before you spend: the decision is made on the FREE board (ESPN only) and the one Odds API pull is paid for only on a poke that will lock; an unpriced slate is 502 `odds-missing` and retried next poke.
- `NFL_SWEEP_DAYS` **4** (`:112`): each poke walks back four PT dates (Thu / Sun / Mon money, a long-weekend outage) — keyless ESPN reads only, zero Odds credits. `NFL_SETTLE` `{ maxDatesPerPoke 2, finishMs 5 h }` (`:125-128`): a date is settle-eligible five hours after its last kickoff. Top-up: at most 6 per arm per date (`NFL_TOPUP.max`, INSTRUCTION 48 2026-09-09), fired only on the first tick after 08:00 / 09:30 / 12:00 / 15:00 / 16:45 PT or on Josh's Refresh (`?manual=1` via `POST /api/refill?desk=nfl`; INSTRUCTION 49 — no retry cooldown, same-slot repeat refused free, the slot stamped on the claim row), through `topUpDate(NFL_LEAGUE, KEYS, …)`, which asserts append-only before its write — a locked ticket is never removed or resized.
- The GET flow lives in the shell (a parameterised copy of the CFB shell so the route-source pins hold); the helpers are `readLockStore` / `readLockBank` / `markOddsGap` / `missCauseOf` / `sweepPrevDates` / `settlePass` / `topUpDate` in `src/lib/server/football-lock.ts`, with `feeds: feedsOf(NFL_LEAGUE)` (`app/api/nfl/lock/route.ts:87`).

## Cron coverage — what the ticker can and cannot lock (docs only; vercel.json untouched)
The lock rail is driven by the EXTERNAL cron-job.org scheduler row: every 15 min during UTC hours **15–23 and 0–2** (`docs/cron-jobs.md`). Since INSTRUCTION 49 a poke only TOPS UP on the five PT refill slots (or Josh's own Refresh); first locks still use every poke. With a 60-minute lead the window for a kickoff at T is (T − 60 min, T]:

| NFL slot | kickoff (UTC) | lock window | covered? |
|---|---|---|---|
| Sunday early | 17:00Z | 16:00–17:00Z | **yes** — the 16:00Z tick |
| Sunday late afternoon | 20:20Z / 20:25Z | 19:20–20:25Z | **yes** |
| SNF | 00:20Z | 23:20–00:20Z | **yes** (the ticker runs 0–2Z) |
| TNF / MNF | 00:15Z–00:35Z | 23:15–00:35Z | **yes** |
| London / Germany | 13:30Z | 12:30–13:30Z | **NO** — the first poke of the day is 15:00Z |

The London gap: the 15:00Z poke sees the London game already kicked, so it is EXCLUDED from that date's card and the rest of the Sunday slate locks as normal at 16:00Z; a London-ONLY PT date is swept as a missed-window NO-PLAY claim row (`NFL_LOCK` docblock, `src/lib/nfl/rules.ts:72-99`). **OPEN ITEM FOR JOSH:** widening the ticker's hours to reach 12:30Z is a cron-job.org change (the free tier's 100 executions/day is the constraint `docs/cron-jobs.md` records), not a code change; until then London games are a known hole, and the settle pass still grades them when they ride a card locked before 12:30Z (it never will under today's hours).

The two vercel.json crons are unchanged and are not part of the lock rail.

## Tests and fixtures
- Fixtures under `tests/fixtures/nfl/`: `espn-scoreboard-2026-09-13.json` (real ESPN capture, 13 games, week 1 Sunday), `espn-scoreboard-2026-09-10.json` (SF @ LAR, TNF), `espn-scoreboard-2026-08-22-final.json` (finals shape), `espn-fpi.json` (powerindex, 32 teams), `espn-byathlete.json`; `odds-2026-09-13.json` is SYNTHESIZED from the CFB odds fixture shape (a bare array; each event carries `_note` / `_espnId`, which the loaders tolerate) with NFL team names matching the scoreboard; `odds-event-props-401872925.json` (an object with a top-level `_note`, id = the synthetic odds id for CIN v TB). The synthesized moneylines are model-identical, so NO side clears the +2 % core gate on the fixture (builder A's report: best evCz −0.72) — the store test sweetens in-test; a core-bearing fixture needs a deliberate price skew if one is wanted later. The Odds API was NOT called to build any of this.
- Suites: `tests/nfl-config.test.ts` (invariants for BOTH leagues), `nfl-separation`, `nfl-engine`, `nfl-store`, `nfl-desk`, `nfl-lock-route`, `nfl-lock-forward`, `nfl-routes`, `nfl-props-route`, `nfl-board-ui`, `nfl-money-ui`, `nfl-pages`; `tests/scheduler-route.test.ts` re-pinned for the `nfl` key.

## Open items (for Josh)
1. London 13:30Z kickoffs are outside the ticker (above).
2. `measuredCreditsPerEvent` 31 is unmeasured on the NFL — read it off the 2026-09-13 quota headers.
3. NFL Season Lab is cut for this ship.
4. `.gitignore` carries a pre-existing uncommitted `.env*` line that no builder added — decide at commit time.
