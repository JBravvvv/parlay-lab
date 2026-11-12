# G1 — Inventory: routes, schedules, store keys, env vars, hosts, book names

Checkout: `/private/tmp/claude-501/pl-audit`, branch `az-two-book-anytime`, HEAD `8ab9e46` (2026-11-12). Read-only pass; no network; no `.env*` file opened; `tools/handoff-state.env` not opened; test suite not run. Untracked in-progress files (`src/lib/az/`, `src/lib/anytime/`, `src/lib/server/odds-client.ts`, `tests/az-two-book-core.test.ts`) were excluded from every count.

All paths are relative to the checkout unless absolute. `route` = `app/api/<path>/route.ts`. "sync" = header `x-pl-sync` compared to env `LEDGER_SYNC_KEY` (`src/lib/server/store.ts:78-84`, sha256 + timingSafeEqual). "cron header" = `x-cron-key` or `Authorization: Bearer` compared to env `CRON_SECRET` (`store.ts:108-123`, returns false when the variable is unset). "cron query" = `?key=` compared to `CRON_SECRET` (`store.ts:92-98`).

What was checked how:
- Read directly in this pass: every one of the 51 route files (methods, `maxDuration`, auth lines), `store.ts`, `vercel.json`, all 7 workflow files (grep of schedule / run / secrets / timeout lines), `docs/cron-jobs.md:1-32`, env-var greps, host greps, the new book-term sweep (script `/tmp/claude-501/g1/sweep2.py`, raw output `/tmp/claude-501/g1/sweep2.txt`).
- Carried from the earlier working paper `map-scheduler-infra.md` and not re-opened: the proposed propsnap rows at `docs/cron-jobs.md:709-810`, forward timeouts inside `/api/scheduler`, the origin/main sha. These are marked "(carried)".

---

## 1. API routes (51 files; `git ls-files 'app/api/**/route.ts'` = 51)

Spend column: "Odds" = can cause a billed call to api.the-odds-api.com with the server key; "Anthropic" = billed call to api.anthropic.com.

| # | Path `/api/...` | Methods (line) | Auth gate | Fails open when env unset? | maxDuration | External hosts | `pl:` keys read (R) / written (W) | Paid spend |
|---|---|---|---|---|---|---|---|---|
| 1 | board | GET :26 | none (deliberate, comment :13-18) | n/a — public. No store → `{board:null, reason:"store-not-configured"}` :27 | default | none | R `pl:board:<date>`, `:gens`, `:<at>` (:39,:56); R `pl:reading:<date>`; R `pl:ledger:v1` (lock entry); R `pl:grade:progress` :72 | no |
| 2 | calibrate | GET :116 | Bearer `CRON_SECRET` (plain `===`, :78) or sync (:79); `force=1` needs sync (:122) | **YES — `CRON_SECRET` unset returns "allowed" (:80-84)** | 60 (:42) | statsapi.mlb.com (:103,:210) | R/W `pl:cal:lastRun` (:121,:126); R `pl:pred:days` (:128); R/W `pl:pred:<d>` (:172,:188,:270,:307); W `pl:cal:summary` (:523), `pl:cal:weights` (:534); R `pl:cal:auto` (:526); R `pl:ledger:v1` (:347); W `pl:grade:progress` (:399) | no |
| 3 | calibration | GET :18, POST :42 | GET none; POST sync (:44) | POST closed (sync unset → false); 503 with no store (:43) | default | none | R `pl:cal:summary|weights|auto` (:22-24); W `pl:cal:auto` (:53) | no |
| 4 | cfb/ledger | GET :65, PUT :76 | sync; 503 when sync/store env missing (:37) | closed | default | none | R/W `pl:cfb:ledger:v1` (:42,:115), `pl:cfb:bank:v1` (:53,:113) | no |
| 5 | cfb/lock | GET :279 | cron header (:284) | closed — 503 when `CRON_SECRET` unset (:281-283) | 60 (:225) | ESPN (site.api.espn.com), api.the-odds-api.com via `slateFromEspn` (:425) | R/W `pl:cfb:ledger:v1` (:231,:508); R `pl:cfb:bank:v1` (:232); R/W `pl:cfb:oddsgap:v1:<date>` (:140,:234); lease `pl:cfb:found:lease:<date>`; push keys | **Odds** (game lines; 240 s data cache) |
| 6 | cfb/props | GET :25 | **none**; only `refresh=1` needs sync (`src/lib/server/football-props.ts:179`) | n/a — public | 300 (:23) | api.the-odds-api.com per-event odds (`football-props.ts:125-135`), ESPN | R/W `pl:cfb:props:v1:<date>` + chunks + `:h1`; INCRBY `pl:cfb:props:spend:v1:<ptDate>` | **Odds, anonymous** (about 31 credits/event, up to 60 events; `dailyBudget` is `Infinity`, `src/lib/cfb/rules.ts:479`) |
| 7 | cfb | GET :28 | none; `refresh=1` needs sync (:40) | n/a — public | default | ESPN, api.the-odds-api.com (`src/lib/cfb/slate-server.ts:106-119`, 240 s cache) | R `pl:cfb:props:v1:<date>:h1` (:60); W `pl:discovery:cfb:<date>` (`slate-server.ts:160`) | **Odds, anonymous** (one game-lines pull per 240 s cache window per date) |
| 8 | cfb/season | GET :53 | none | n/a | default | site.web.api.espn.com, site.api.espn.com | none | no |
| 9 | clv | GET :59 | cron query `?key=` or sync (:60) | closed; 503 without `ODDS_API_KEY` (:62) | 60 (:33) | own `/api/odds` proxy (:50) → api.the-odds-api.com (`regions=us,eu` :90; per-event `regions=us` :108) | R/W `pl:clv:lastRun` (:66,:70); R/W `pl:ledger:v1` (:72,:131,:139) | **Odds** (rate-limited to one run per 25 min, :41,:67) |
| 10 | digest | GET :19 | sync (:20); 503 no store (:21) | closed | default | none | R `pl:ledger:v1` (:23), `pl:cal:weights` (:26) | no |
| 11 | discovery | GET :8 | none | n/a | default | none | R `pl:board:<date>` (:15), `pl:<sport>:props:v1:` + spend (:18), `pl:discovery:<sport>:<date>` (:18) | no |
| 12 | football/[sport]/games/[gameId] | GET :4 | none | n/a | default | site.api.espn.com (:11) | none | no |
| 13 | football/positions | GET :6 | none | n/a | 60 (:3) | site.api.espn.com (:17), up to 32 team rosters per call | none | no |
| 14 | games/[gamePk]/plays | GET :6 | none | n/a | default | statsapi.mlb.com (:10) | none | no |
| 15 | games/[gamePk] | GET :47 | none | n/a | default | statsapi.mlb.com (:23) | none | no |
| 16 | games/calendar | GET :5 | none | n/a | default | statsapi.mlb.com (:7) | none | no |
| 17 | games | GET :72 | none | n/a | default | statsapi.mlb.com (:25) | R `pl:board:<date>` (:63) | no |
| 18 | generate | GET :117 | sync (:119) or cron header (:123); else 401 with a log line (:124-139) | closed; 503 with no store (:118) and no `ODDS_API_KEY` (:141) | 300 (:42) | api.the-odds-api.com direct with server key (:80-101), statsapi.mlb.com | R/W `pl:gen:lastRun` (:145,:354); INCR `pl:gen:runs:<date>` (:340), `pl:gen:manual:<date>` (:337); R/W `pl:blocks:<date>` (:241-269,:600-684); W `pl:board:<date>` (:548), `:<at>` (:527,:545), `:gens` (:540); R cal keys (:367-369); R/W `pl:pred:<d>` (:758,:763), SADD `pl:pred:days` (:764); lease `pl:found:lease:<date>` (:568); W `pl:ledger:v1` via `writeLock` | **Odds** (`MAX_RUNS_PER_DATE` is `Infinity`, :67-68) |
| 19 | ledger | GET :71, PUT :83 | sync; 503 when sync/store env missing (:54) | closed | default | none | R/W `pl:ledger:v1` (:61,:149), `pl:bank:v1` (:31,:142), `pl:noplay:v1` (:43,:147) | no |
| 20 | live-context | GET :3 | none | n/a | default | statsapi.mlb.com or site.api.espn.com (:5) | none | no |
| 21 | mlb/ballpark | GET :27 | none | n/a | default | statsapi.mlb.com (:33); self-fetch `/model/priors.json` (:44) | none | no |
| 22 | mlb/hit-rates | POST :77 | none | n/a | default | statsapi.mlb.com (up to 400 players per call) | none | no |
| 23 | mlb/live-props | GET :60 | cron header or sync (:61-63) | closed | 60 (:51) | api.the-odds-api.com (`src/lib/server/mlb-live-quote.ts:396,:612`, no-store) | R/W `pl:mlb:liveprops:v1:<date>`, `:lock:<ptDate>`, `:slot:<ptDate>:<slot>`; INCRBY `pl:mlb:liveprops:spend:v1:<ptDate>`; R/W `pl:mlb:liveprops:429:<ptDate>` (:55-57) | **Odds** |
| 24 | mlb/positions | GET :11 | none | n/a | default | statsapi.mlb.com | none | no |
| 25 | nfl/ledger | GET :66, PUT :77 | sync; 503 when env missing (:38) | closed | default | none | R/W `pl:nfl:ledger:v1` (:43,:116), `pl:nfl:bank:v1` (:54,:114) | no |
| 26 | nfl/lock | GET :103 | cron header (:108) | closed — 503 when `CRON_SECRET` unset (:105-107) | 60 (:76) | ESPN, api.the-odds-api.com (`slateFromEspnOf` :242; `footballPropsGet` :221,:274) | R/W `pl:nfl:ledger:v1` (:82,:314); R `pl:nfl:bank:v1` (:83); R/W `pl:nfl:oddsgap:v1:<date>` (:85); props keys; lease `pl:nfl:found:lease:<date>` | **Odds** |
| 27 | nfl/props | GET :34 | **none**; `refresh=1` needs sync | n/a — public | 300 (:26) | api.the-odds-api.com per event, ESPN | R/W `pl:nfl:props:v1:<date>` + chunks + `:h1` (:30); INCRBY `pl:nfl:props:spend:v1:<ptDate>` (:31) | **Odds, anonymous** (31 credits/event, up to 16 events; `dailyBudget` `Infinity`, `src/lib/nfl/rules.ts:199`) |
| 28 | nfl/replay | GET :13, POST :28 | GET none; POST sync (:29) | closed; 503 no store | default | ESPN | R `pl:nfl:replay:2026-09-13:v1` (:16); W same, SET NX (:34) | no |
| 29 | nfl | GET :31 | none; `refresh=1` needs sync (:43) | n/a — public | default | ESPN, api.the-odds-api.com (240 s cache) | W `pl:discovery:nfl:<date>` | **Odds, anonymous** (cached 240 s) |
| 30 | odds | GET :23 | none for cached reads; `fresh=1` honoured when `!APP_PASSCODE` or header `x-pl-pass` matches (:47-49, plain `===`) | **YES — `APP_PASSCODE` unset: anyone gets uncached pulls** | default | api.the-odds-api.com only (:20,:33), URL shape allow-list (:36, `src/lib/server/odds-shape.ts`) | none | **Odds, anonymous** (any allowed URL not in the 240 s cache is a billed pull) |
| 31 | picks | GET :52 | none | n/a | default | none | R `pl:grade:progress` (:61), `pl:board:<d>` (:79), `pl:pred:<date>` (:111) | no |
| 32 | player-images | GET :4 | none | n/a | 60 (:3) | site.api.espn.com (`src/lib/server/player-images.ts:11`), api.sleeper.app (:25) | none | no |
| 33 | player/resolve | GET :16 | none | n/a | default | statsapi.mlb.com | none | no |
| 34 | player | GET :29 | none | n/a | default | statsapi.mlb.com (:13) | none | no |
| 35 | predictions | GET :32, PUT :48 | sync; 503 when not configured (:25-30) | closed | default | none | R/W `pl:pred:<d>` (:38,:81,:90); SMEMBERS/SADD `pl:pred:days` (:41,:91) | no |
| 36 | prefs | GET :47, PUT :58 | sync (:32-34) | closed | default | none | R/W `pl:prefs:v1` (:41,:77) | no |
| 37 | propsnap | GET :60 | read path `?date=` **ungated** (:68-71); write/pull path cron header (:76) | closed for the pull; 503 no store (:61) | 60 (:31) | api.the-odds-api.com `baseball_mlb`, `regions=us` (:51,:98), up to 16 events | R/W `pl:propsnap:<date>` (:35,:114; EXPIRE 4 d :115) | **Odds** (pull path only) |
| 38 | push | GET :13, POST :23, DELETE :32 | GET public (returns VAPID public key; richer answer with sync :15); POST/DELETE sync (:24,:33) | closed; POST 503 without VAPID keys (:25) | default | none | R/W `pl:push:subs:v1` | no |
| 39 | push/test | POST :8 | sync (:9) | closed | default | Web Push endpoints of stored subscriptions | R/W `pl:push:subs:v1` | no |
| 40 | pvt | GET :24 | none | n/a | default | statsapi.mlb.com (:13,:18) | none | no |
| 41 | refill | POST :45 | sync (:48) | closed; 503 when `CRON_SECRET` or store unset (:46-47) | 300 (:40) | self (`/api/<desk>/lock`, `/api/generate`, `/api/mlb/live-props`) with `x-cron-key` (:76-77) | via the forwarded routes | **Odds** (through the forwarded route) |
| 42 | relevant-sport | GET :9 | none | n/a | default | site.api.espn.com (:13,:14), statsapi.mlb.com (:15) | none | no |
| 43 | scheduler | GET :114 | cron header (:164) | closed — 503 when `CRON_SECRET` unset (:161-163) | 90 (:45) | self: `/api/generate` (:396), `/api/calibrate?grade=only` (:418), live-props, cfb/lock, nfl/lock | R `pl:board:<date>` (:173); R/W `pl:blocks:<date>` (:183,:203,:204); lease `pl:found:lease:<date>` (:231,:289); `pl:push:retry:v1` | **Odds** (through the forwarded routes) |
| 44 | sharp | POST :61 | `if (pass && x-pl-pass !== pass) 401` (:69-71) | **YES — `APP_PASSCODE` unset: open to anyone** | 300 (:11) | api.anthropic.com `/v1/messages` (:93), model `claude-opus-4-8` (:13), `max_tokens` 16000 (:102) | none | **Anthropic** (501 when `ANTHROPIC_API_KEY` unset, :62-67) |
| 45 | splits | GET :17 | none | n/a | default | www.scoresandodds.com (`src/lib/splits.ts:49`), 600 s cache, UA "Mozilla/5.0 (Macintosh) ParlayLab/1.0" (:26) | none | no (scrape) |
| 46 | stats | GET :12 | none; open proxy limited to 3 hosts (:9) | n/a | default | statsapi.mlb.com, site.web.api.espn.com, site.api.espn.com; 180 s cache | none | no |
| 47 | stats/window | GET :48 | none | n/a | default | statsapi.mlb.com (:22) | none | no |
| 48 | taken | GET :14 | sync (:15) | closed | default | none | MGET `pl:ledger:v1`, `pl:cfb:ledger:v1`, `pl:nfl:ledger:v1` (:21); R `pl:push:t:<k>` | no |
| 49 | teams/[sport]/[teamId] | GET :11 | none | n/a | 30 (:4) | statsapi.mlb.com or site.api.espn.com (:18) | none | no |
| 50 | ufcprops | GET :32 | none | n/a | 60 (:11) | www.bestfightodds.com (:35,:38) | none | no (scrape) |
| 51 | version | GET :9 | none | n/a | default | none | none (returns `VERCEL_GIT_COMMIT_SHA`, :10) | no |

Routes that spend money and can be reached with no credential: `cfb/props` (6), `nfl/props` (27), `cfb` (7), `nfl` (29), `odds` (30), and `sharp` (44) whenever `APP_PASSCODE` is unset. Routes that fail open on a missing env var: `calibrate` (2), `odds` fresh path (30), `sharp` (44).

The app never sends `x-pl-pass`. The only senders are tools (`tools/quota.mjs:94`, `tools/snapshot_odds.py:33`, `tools/snapshot_props.py:34`). `app/settings/page.tsx:361` saves the passcode in localStorage `pl_pass`, and nothing reads it back into a request (`app/sharp/page.tsx:727` and `app/settings/page.tsx:335` post to `/api/sharp` with no passcode header).

---

## 2. Scheduled jobs

### 2a. Vercel cron (`vercel.json:8-25`) — visible on disk

| Path | Schedule (UTC) | Auth | Notes |
|---|---|---|---|
| `/api/scheduler?poke=evening` | `45 21 * * *` (:10-11) | Vercel sends `Authorization: Bearer <CRON_SECRET>`; route accepts it via cron header | scheduler `maxDuration` 90 |
| `/api/scheduler?poke=night` | `0 0 * * *` (:14-15) | same | |
| `/api/nfl/lock?poke=sunday-early` | `0 16 * * 0` (:18-19) | same | added 2026-09-20 (`docs/cron-jobs.md:1-3`) |
| `/api/nfl/lock?poke=sunday-standard` | `0 17 * * 0` (:22-23) | same | |

`vercel.json:3-6` turns off git deploys for `main` and `line-history`. `tests/vercel-cron-pokes.test.ts:61` requires every cron path to start with `/api/scheduler`, and `:69` requires at most 2 crons ("the Hobby plan cap"). The file now has 4 crons, 2 of them on `/api/nfl/lock`. Read as written, both assertions fail. Whether Vercel registered all 4 depends on the plan and cannot be seen from disk.

### 2b. GitHub Actions (`.github/workflows/`, 7 files) — visible on disk

No workflow references `secrets.*` or `vars.*` (grep: zero hits). No workflow sets `timeout-minutes`. No workflow has an `if: failure()` step or any notification step. All have `permissions: contents: write`. GitHub runs `schedule` triggers only from the repository's default branch.

| Workflow | Schedule (UTC) | Runs | Checks out / commits to | Hosts touched | Spend |
|---|---|---|---|---|---|
| `board-archive.yml` | `0 12 * * *`, `0 19 * * *` (:31-32) + dispatch | `python3 tools/archive_boards.py` (:58) | `line-history` (:52) | parlay-lab-six.vercel.app `/api/board` (`tools/archive_boards.py:51,:99,:103`) | none |
| `context.yml` | `0 17 * * *`, `30 22 * * *` (:10-11) + dispatch | `python3 tools/build_context.py public/model/context.json` (:25) | `frontend-rebuild` (:23) | statsapi.mlb.com (`tools/build_context.py:13`) | none |
| `hr-overround.yml` | `0 15 * * 0` (:18) + dispatch | `python3 tools/hr_overround.py --dir data/props --min-days 14 --json data/hr_overround.json` (:36) | `line-history` (:30) | statsapi.mlb.com (`tools/hr_overround.py:48`) | none |
| `props-history.yml` | `0 17`, `10 18`, `55 18`, `0 20`, `0 21`, `30 22` daily (:35,:45-49) + dispatch | `python3 tools/snapshot_props.py $PL_WINDOW` (:89); `PL_WINDOW` = `--window 120` for the 18:10 and 18:55 runs (:88) | `line-history` (:79) | parlay-lab-six.vercel.app `/api/odds?...&fresh=1` (`tools/snapshot_props.py:15,:30`) → api.the-odds-api.com `regions=us`, 6 markets (:24,:323); `/api/propsnap?date=` (:235) | **Odds credits, through the public proxy, no secret** |
| `line-history.yml` | schedule commented out (:10); dispatch only (:20) | `python3 tools/snapshot_odds.py` (:37) | `line-history` (:31) | `/api/odds` proxy → api.the-odds-api.com `regions=us,eu` (`tools/snapshot_odds.py:14,:24`) | Odds (only when dispatched) |
| `model.yml` | schedule commented out (:8); dispatch only (:11) | `python3 tools/build_priors.py public/model/priors.json` (:24) | `frontend-rebuild` (:22) | baseballsavant.mlb.com (`tools/build_priors.py:19`), statsapi.mlb.com (:125) | none |
| `ufc.yml` | dispatch only (:9) | `python3 tools/build_ufc.py public/model/ufc.json` (:22) | `frontend-rebuild` (:20) | www.ufc.com (`tools/build_ufc.py:240`), en.wikipedia.org (:246) | none |

The `props-history` job works without a secret only because `/api/odds` honours `fresh=1` while `APP_PASSCODE` is unset. If `APP_PASSCODE` is ever set in Vercel and not added as a GitHub secret, the job keeps running and silently records prices up to 240 s old (`app/api/odds/route.ts:48-50`, header `x-pl-stale`).

### 2c. External scheduler (cron-job.org) — documented only, cannot be seen from disk

| Job | URL | Auth | Schedule (UTC) | Source | Status on disk |
|---|---|---|---|---|---|
| scheduler | `/api/scheduler` | header `x-cron-key` | every 15 min, hours 15–23 and 0–2 | `docs/cron-jobs.md:22` | documented only; "Josh creating 2026-08-06" |
| calibrate | `/api/calibrate` | `Authorization: Bearer` | Sundays 10:00 | `docs/cron-jobs.md:23` | documented only |
| Parlay CLV | `/api/clv?key=…` | secret in the query string | every 30 min | `docs/cron-jobs.md:24` | documented as existing; the route itself rate-limits to 25 min (`app/api/clv/route.ts:41`) |
| propsnap (weekend closes) | `/api/propsnap` | cron header | proposed `0 17 * * 0,6`, `30 18 * * 0,6` | `docs/cron-jobs.md:709-810` (carried) | documented only; existence unknown |

`docs/cron-jobs.md:7-14` records that four earlier documented entries were never created and were carried as live for ten days. The same document says the scheduler row "IS the system" (:26). Nothing on disk proves that row exists today, and no route writes a heartbeat key that would show when the external scheduler last arrived.

Fires that `/api/scheduler` decides internally once poked: grading slots 08:00, 09:30, 12:00, 15:00, 16:45 PT (`src/lib/grading-progress.ts:55`); MLB live slots 15:00, 16:45, 17:15, 17:45, 18:15, 18:45 PT (`src/lib/mlb/live-props-rules.ts:221`).

---

## 3. Store keys (Upstash Redis REST, `src/lib/server/store.ts`)

Values that are JSON strings of 2,048 bytes or more are stored gzip-packed with a `gz1:` prefix (`store.ts:26-38`, `PACK_WRITES = true` :33). The comment at :28-32 forbids rolling production back before `b29961e`.

| Key pattern | Defined | Writer(s) | Reader(s) | TTL | Value |
|---|---|---|---|---|---|
| `pl:board:<date>` | `src/lib/server/board-store.ts:26` | generate :548 | board :39, games :63, picks :79, discovery :15, scheduler :173 | 3 days (generate :523) | encoded board blob |
| `pl:board:<date>:<at>` | `board-store.ts:43` | generate :527 (DEL :545) | board :56 | 3 days | one earlier generation of the board |
| `pl:board:<date>:gens` | `board-store.ts:44` | generate :540 (EXPIRE :541) | board :56 | 3 days | list of generation stamps, max 6 (`board-store.ts:46`) |
| `pl:blocks:<date>` | `src/lib/server/blocks.ts:36` | generate :269,:655,:684; scheduler :204 | generate :241,:246,:600; scheduler :183,:203; `src/lib/server/refill.ts:45` | **none — one key per date, grows forever** (`redisSetJson`, `store.ts:74-76`, sets no expiry) | block registry (which block fired, cost) |
| `pl:gen:lastRun` | generate :54 | generate :354 | generate :145 | none (single key) | epoch ms |
| `pl:gen:runs:<date>` | generate :55 | generate INCR :340 | generate | 3 days (:341) | counter |
| `pl:gen:manual:<date>` | generate :70 | generate INCR :337 | generate | 3 days (:338) | counter |
| `pl:pred:<date>` | generate :72, predictions :18, calibrate :45 | generate :763, predictions PUT :90, calibrate :188,:270 | predictions GET :38, calibrate :172,:307, picks :111 | **none — one key per date, grows forever** (by design; cap 3,000,000 bytes per day, generate :73, predictions :23) | `{records, parlays}` for the day |
| `pl:pred:days` | generate :71, predictions :19, calibrate :44 | SADD generate :764, predictions :91 | SMEMBERS calibrate :128, predictions :41 | none — set grows by one member per day | Redis set of dates |
| `pl:cal:summary` | calibrate :46 | calibrate :523 | calibration :22, generate :367-369 | none (single key) | calibration summary |
| `pl:cal:weights` | calibrate :47 | calibrate :534 | calibration :23, digest :26, generate | none | weight table |
| `pl:cal:auto` | calibrate :48 | calibration POST :53 | calibrate :526, calibration :24, generate | none | on/off flag |
| `pl:cal:lastRun` | calibrate :49 | calibrate :126 | calibrate :121 | none | epoch ms |
| `pl:clv:lastRun` | clv :35 | clv :70 | clv :66 | none | epoch ms |
| `pl:grade:progress` | `src/lib/grading-progress.ts:32` | calibrate :399 | board :72, picks :61 | none | grading cohorts and stamp |
| `pl:ledger:v1` | `src/lib/server/lock-card.ts:63` | ledger PUT :149; clv :139 (only when ≤ 900,000 bytes); `writeLock` (`lock-card.ts:1301-1323`, **no size check**) | ledger GET :61, board, calibrate :347, clv :72,:131, digest :23, taken :21 | **none — grows forever**; PUT caps at 900,000 bytes and 500 days (`src/lib/ledger-merge.ts:110-111,:116,:140`) | `{ledger: SyncEntry[], at, epoch}` |
| `pl:ledger:archive:e1` | `src/lib/ledger-epoch.ts:21` | SET NX in `src/lib/server/ledger-epoch-server.ts:26` | ledger-epoch-server | none (write-once) | archived pre-epoch ledger |
| `pl:bank:v1` | ledger :27 | ledger PUT :142 | ledger :31 | none | bankroll record |
| `pl:noplay:v1` | ledger :39 | ledger PUT :147 | ledger :43 | none | no-play dates |
| `pl:prefs:v1` | prefs :26 | prefs PUT :77 | prefs :41 | none; cap 256 KB (`src/lib/cz-hidden-merge.ts:24`) | `{czHidden, at}` |
| `pl:cfb:ledger:v1` | cfb/ledger :26, cfb/lock :231 | cfb/ledger PUT :115; cfb/lock :508; `src/lib/server/football-lock.ts:202,:374,:495,:521,:598,:759,:875` | cfb/ledger :42, taken :21, football-lock :104 | none — grows; every writer checks 900,000 bytes | `{ledger, at}` |
| `pl:cfb:bank:v1` | cfb/ledger :27 | cfb/ledger PUT :113 | cfb/ledger :53, football-lock :117 | none | bankroll |
| `pl:nfl:ledger:v1` | nfl/ledger :27, nfl/lock :82 | nfl/ledger PUT :116; nfl/lock :314; football-lock (same lines) | nfl/ledger :43, taken :21 | none — grows; size-checked | `{ledger, at}` |
| `pl:nfl:bank:v1` | nfl/ledger :28 | nfl/ledger PUT :114 | nfl/ledger :54 | none | bankroll |
| `pl:cfb:oddsgap:v1:<date>` | cfb/lock :234; `football-lock.ts:133` | `football-lock.ts:145` | `football-lock.ts:152` | 4 days (`src/lib/cfb/rules.ts:145,:364`) | ISO timestamp of the first odds gap |
| `pl:nfl:oddsgap:v1:<date>` | nfl/lock :85 | `football-lock.ts:145` | `football-lock.ts:152` | 5 days (`src/lib/nfl/rules.ts:116,:166`) | ISO timestamp |
| `pl:<id>:found:lease:<date>` (id = cfb, nfl) | `football-lock.ts:645` | SET NX PX 300,000 (:650) | GET/DEL (:659) | 5 minutes | lease token |
| `pl:found:lease:<date>` (MLB) | `src/lib/server/found-lease.ts:15` | SET NX PX 300,000 (:20) | generate :568, scheduler :231,:289 | 5 minutes | lease token |
| `pl:cfb:props:v1:<date>` (+ `:c:<stamp>:<n>` chunks, + `:h1`) | `src/lib/cfb/props-store.ts:63,:66,:111` | football-props (cfb/props, cfb/lock) | cfb/props, cfb :60, discovery :18 | 36 h (`props-store.ts:251,:252,:272`; `cfb/rules.ts:469`) | priced prop board in chunks; first-half lines under `:h1` |
| `pl:cfb:props:spend:v1:<ptDate>` | `props-store.ts:58` | INCRBY (:261) | football-props budget rail, discovery | 36 h (:262) | credits spent that PT day |
| `pl:nfl:props:v1:<date>` (+ chunks, `:h1`) | nfl/props :30; `src/lib/nfl/rules.ts:161` | football-props (nfl/props, nfl/lock) | nfl/props, discovery | 36 h (`nfl/rules.ts:192`) | as CFB |
| `pl:nfl:props:spend:v1:<ptDate>` | nfl/props :31; `nfl/rules.ts:162` | INCRBY | budget rail | 36 h | counter |
| `pl:mlb:liveprops:v1:<date>` | mlb/live-props :55; `src/lib/mlb/live-props-store.ts:55` | SET EX (:129) | board-side live readers | 36 h | live in-play prop quotes |
| `pl:mlb:liveprops:v1:lock:<ptDate>` | `live-props-store.ts:225` | SET NX EX 60 (`src/lib/server/mlb-live-quote.ts:603`; DEL :822) | same | 60 s (`live-props-store.ts:224`) | run lock |
| `pl:mlb:liveprops:v1:slot:<ptDate>:<slot>` | `live-props-store.ts:236-237` | SET NX EX 3600 (`mlb-live-quote.ts:118,:526`) | same | 1 hour | slot-fired marker |
| `pl:mlb:liveprops:spend:v1:<ptDate>` | mlb/live-props :56; `live-props-store.ts:53` | INCRBY (:138) | budget rail | 36 h (:139) | counter |
| `pl:mlb:liveprops:429:<ptDate>` | mlb/live-props :57 | SET "1" or "manual-used" (`live-props-store.ts:147`, `mlb-live-quote.ts:549`) | live quote gate | until PT midnight | rate-limit / manual-use marker |
| `pl:discovery:<id>:<date>` (id = cfb, nfl) | `src/lib/cfb/slate-server.ts:160` | every slate build, including anonymous `/api/cfb?date=` and `/api/nfl?date=` | discovery :18 | 36 h (EX 129600) | discovery summary of the slate |
| `pl:propsnap:<date>` | propsnap :35 | propsnap :114 | propsnap :68-71, `tools/snapshot_props.py:235` | 4 days (:36,:115) | last 6 raw prop snapshots |
| `pl:reading:<date>` | `src/lib/server/self-reading.ts:26` | SET EX (:245) | board | 3 days (:28) | self-check reading |
| `pl:push:subs:v1` | `src/lib/server/push.ts:37` | :79,:85,:124 | :64 | none; capped at 10 subscriptions (:38,:78) | push subscriptions |
| `pl:push:t:<sport>:<date>:<id>` | `push.ts:54` | :183 | taken, push | 21 days (:39) | per-ticket alert record |
| `pl:push:t:<k>:lease` | `push.ts:169` | SET NX PX 60,000 | push | 60 s | send lease |
| `pl:push:retry:v1` | `push.ts:209` | :187 (DEL :215) | scheduler | 1 day | retry flag |
| `pl:nfl:replay:2026-09-13:v1` | nfl/replay :10 | SET NX (:34) | :16 | none (write-once, single key) | Week 1 replay payload |

Keys with no expiry that grow with time: `pl:blocks:<date>`, `pl:pred:<date>`, `pl:pred:days`, and the three ledgers. Everything else is either a single fixed key or carries an expiry.

Strings that start with `pl:` but are not store keys (browser events or guard lists): `pl:cfb-ledger-change`, `pl:cfb-ledger-sync` (`src/lib/cfb/store.ts:22,24`), `pl:nfl-ledger-change`, `pl:nfl-ledger-sync` (`src/lib/nfl/store.ts:20,22`), `pl:ledger-sync` (`src/lib/ledgerSync.ts:21`), `pl:density-change` (`src/lib/vertical-density.ts:4`), `pl:sportsbook` (`src/lib/sportsbook/store.ts:4`), `pl:sport` (`src/lib/sport.ts:24`); prefix guard lists naming `pl:board:`, `pl:clv:`, `pl:picks:`, `pl:cfb:props:`, `pl:nfl:props:` in `src/lib/mlb/live-props-store.ts:44-45` and `src/lib/server/mlb-live-quote.ts:101-104`. No code writes a `pl:picks:` or `pl:clv:` prefixed key other than `pl:clv:lastRun`.

### 3b. Browser storage keys

| Key | Where | Holds |
|---|---|---|
| `pl_synckey` | `src/lib/ledgerSync.ts:19` | **the sync phrase, in plain localStorage** |
| `pl_pass` | `app/settings/page.tsx:328,:361-362` | the app passcode; saved, never sent by the app |
| `pl_ledger`, `pl_ledger_epoch`, `pl_ledger_archive_e1` | `ledgerSync.ts:20`; `src/lib/ledger-epoch.ts:23-24` | MLB ledger copy, epoch number, archived ledger |
| `pl_cfb_ledger`, `pl_cfb_bank2`, `pl_cfb_season` | `src/lib/cfb/rules.ts:343-344`; `src/lib/cfb/season-store.ts:28` | CFB ledger, bankroll, season lab state |
| `pl_nfl_ledger`, `pl_nfl_bank2` | `src/lib/nfl/rules.ts:142-143` | NFL ledger, bankroll |
| `pl_bank2`, `pl_noplay` | `src/lib/bankroll.ts:33`; `src/lib/noplay.ts:21` | MLB bankroll, no-play dates |
| `pl_quota`, `pl_quota_at` | `src/lib/fetcher.ts:13,:36-37`; `src/lib/cfb/client.ts:64-65`; `src/lib/football/client.ts:32-33` | last seen Odds API credits remaining and when |
| `pl_sport`, `pl_board_sport`, `pl_builder_sport`, `pl_sharp_sport`, `pl_stats_sport` | `src/lib/sport.ts:23`; `app/board/page.tsx:211`; `app/builder/page.tsx:461`; `app/sharp/page.tsx:111`; `app/stats/page.tsx:282` | selected sport per page |
| `pl_selmode`, `pl_dirpref`, `pl_autogen`, `pl_gencount`, `pl_board_r1`, `pl_livegencount` | `src/lib/engine-client.ts:54,:88,:151,:167,:145`; `src/lib/live-board-client.ts:42` | engine selection mode, direction preference, auto-generate flag, generate counters, cached board |
| `pl_display_sportsbook_dk_v1` | `src/lib/sportsbook/store.ts:4` | display sportsbook choice |
| `pl_cz_hidden_v1`, `pl_cz_hidden_v2` | `src/lib/cz-offered.ts:34-35` | rows hidden as "not offered at Caesars" |
| `pl_headshots` | `src/lib/mlb-visuals.ts:105` | headshot cache |
| `pl_asgMoney`, `pl_asgPaste` | `src/hooks/useAllStar.ts:31-32` | All-Star desk inputs |
| `pl_ufc_view` | `src/components/ufc/UfcRankings.tsx:169` | UFC view choice |
| `pl:workspace:v1` | `src/lib/workspace-session.ts:2` | every `useSessionState` value (15-minute closed TTL) |
| `pl:vertical-density` | `src/lib/vertical-density.ts:4` | density setting |
| `pl:props:collapsed`, `pl:props:gen-open` (+ `:setup`), `pl:<id>:props:gen-open`, `pl:props:hit-window`, `pl:board:overview-open`, `pl:first-six:<date>` | `src/lib/collapse-store.ts:27`; `app/props/page.tsx:102`; `src/hooks/useParlayGen.ts:190`; `src/components/cfb/CfbProps.tsx:954`; `src/hooks/useHitRates.ts:46`; `app/board/page.tsx:105`; `src/components/nfl/FirstSundaySix.tsx:17` | UI open/closed state and filter choices |
| `pl_reloaded_for` (sessionStorage) | `src/components/shell/SwRegister.tsx:8,:29-30` | build sha the page already reloaded for |
| Legacy engine: `pl_ledger`, `pl_legs`, `pl_sharp`, `pl_claudekey`, `pl_oddskey`, `pl_books`, `pl_stake`, `pl_sport`, `pl_override`, `pl_fun`, `pl_daily`, `pl_czNote`, `pl_bankroll` | `legacy/index.html` (e.g. `pl_oddskey` :892,:1028; `pl_claudekey` :1063-1064,:4181), mirrored in `src/engine/legacy-src.gen.ts:5` | **`pl_claudekey` and `pl_oddskey` hold API keys in plain localStorage** when a user types them into the legacy page |

---

## 4. Environment variable names (names only)

| Name | Read at | Effect when unset |
|---|---|---|
| `CRON_SECRET` | `store.ts:93,:109`; calibrate :77; cfb/lock :281; nfl/lock :105; refill :46; scheduler :101,:118,:129,:161,:371-373,:397; `tools/board_window.py:113` | scheduler, cfb/lock, nfl/lock, refill answer 503 (nothing locks, nothing generates). **calibrate becomes open to anyone.** clv and generate then accept only the sync phrase. |
| `LEDGER_SYNC_KEY` | `store.ts:79,:87` | every sync-gated route answers 503 or 401: ledgers, predictions, prefs, digest, taken, push, refill, manual generate. Device sync stops. |
| `ODDS_API_KEY` | generate :87,:141; odds :40; clv :62; propsnap :47; `slate-server.ts:108`; `football-props.ts:112,:197`; `mlb-live-quote.ts:71,:593` | generate and clv 503; odds 500 (:42-44); football slates come back scores-only; no prop pricing. Nothing opens. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (fallbacks `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | `store.ts:11-12` | store-backed routes 503 or return empty. **The football props budget rail is skipped with no store** (`football-props.ts:364`), so an anonymous `/api/cfb/props` call would price every event with nothing counting the spend. |
| `APP_PASSCODE` | odds :47; sharp :69; `tools/quota.mjs:93`; `tools/snapshot_odds.py:15`; `tools/snapshot_props.py:16` | **`/api/sharp` is open to anyone; `/api/odds?fresh=1` gives anyone uncached paid pulls.** When set: the app's own Sharp page gets 401 (it sends no header) and the GitHub props archive silently degrades to cached prices. |
| `ANTHROPIC_API_KEY` | sharp :62 | `/api/sharp` answers 501. Nothing opens. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `src/lib/server/push.ts:57,:58,:60`; set by `tools/push-setup.sh:20-21` | push subscribe answers 503; no bet alerts are sent; locks are unaffected. `VAPID_SUBJECT` falls back to a literal. |
| `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` | clv :44; generate :76; mlb/ballpark :23 | self-calls fall back to the hard-coded host `parlay-lab-six.vercel.app` (clv :45, generate :77, ballpark :24). |
| `VERCEL_GIT_COMMIT_SHA` | `next.config.ts:11`; version :10; calibrate :398,:522 | `/api/version` returns nothing useful; the installed app's self-update check has nothing to compare. |
| `NEXT_PUBLIC_BUILD_SHA` | `src/components/shell/SwRegister.tsx:6` | self-update check is skipped. |
| `PL_CFSEL` | generate :511,:728 | optional switch; default behaviour applies. |
| `NEXT_DIST_DIR` | `next.config.ts:8`; `tools/sync-handoff.sh:549` | default `.next`. |
| `NODE_ENV` | `SwRegister.tsx:43` | service worker registration logic only. |
| `PL_BASE` | `tools/archive_boards.py:51` | defaults to the production host. |
| `PL_WINDOW` | `.github/workflows/props-history.yml:88-89` | set by the workflow itself; empty means no window flag. |
| `RW_CACHE` | `tools/recency_weights.py:27` | defaults to `.rw_cache`. |
| Test-only: `PL_BOARD`, `PL_DUMP`, `PL_ENGINE_PATH`, `PL_GEN_PATH`, `TZ`, `PATH` | `tests/*.test.ts` (e.g. `tests/blend-sweep.test.ts:35,:160`, `tests/site-id-integrity.test.ts:31`, `tests/served-extractor.test.ts:65`, `tests/timezone-parity.test.ts:25`) | tests skip or use defaults. |

No workflow reads `secrets.*`. GitHub therefore holds none of the above.

---

## 5. External hosts

| Host | Called from | For | Paid / keyed / free |
|---|---|---|---|
| api.the-odds-api.com | server: generate :80-101, clv :81-108 (through own proxy), propsnap :51, odds proxy :20, `slate-server.ts:106-119`, `football-props.ts:125-135`, `mlb-live-quote.ts:396,:612`, `src/engine2/sharpBoard.ts:10`; browser via `/api/odds` (`src/lib/fetcher.ts`, `src/lib/ufc.ts:86`, `src/hooks/useAllStar.ts:65`); tools: `quota.mjs:42`, `snapshot_odds.py:23`, `snapshot_props.py:299,:322` | game lines, player props, closing lines | **Paid, keyed** (`ODDS_API_KEY`) |
| api.anthropic.com | sharp :93; legacy page direct from the browser (`legacy/index.html:2960`) | LLM handicapping write-up | **Paid, keyed** (`ANTHROPIC_API_KEY`; legacy path uses a key typed by the user) |
| Upstash Redis REST (host from env) | `store.ts:50` | all server state | Paid plan / keyed |
| Web Push endpoints (Apple, Google, Mozilla; taken from each subscription) | `push.ts` | bet alerts | free, VAPID-signed |
| statsapi.mlb.com | 27 code sites: calibrate :103,:210; games routes; player routes; pvt; stats proxy :9; mlb/* routes; tools `build_context.py:13`, `hr_overround.py:48`, `build_priors.py:125`, `board_window.py:49`, `factor_activity.py:31` | schedule, boxscores, player stats, grading | free, no key |
| site.api.espn.com | 11 code sites: football games route :11, positions :17, relevant-sport :13-14, teams :18, live-context :5, `player-images.ts:11`, `slate-server.ts` | scoreboards, summaries, rosters, finals | free, unofficial |
| site.web.api.espn.com | `app/stats/page.tsx:196,198`; `src/lib/props-context.ts:46`; `cfb/rules.ts:369,:614`; `nfl/rules.ts:174`; stats proxy :9 | by-athlete stat tables | free, unofficial |
| a.espncdn.com | `app/stats/page.tsx:221,:230`; `src/components/ui/TeamMark.tsx:59`; `cfb/rules.ts:616`; `mlb-visuals.ts:48`; `nfl/rules.ts:305` | logos, headshots (browser image loads) | free |
| www.scoresandodds.com | splits :17 via `src/lib/splits.ts:49` | bet % and money % (HTML scrape) | free scrape, no agreement |
| www.bestfightodds.com | ufcprops :35,:38 | UFC prop prices across books (HTML scrape) | free scrape |
| api.sleeper.app | `src/lib/server/player-images.ts:25` | NFL player list for headshots | free |
| sleepercdn.com | `src/lib/player-images.ts:52` | headshot images | free |
| img.mlbstatic.com, www.mlbstatic.com | `mlb-visuals.ts:103`; `src/lib/team-profile.ts:118,:132,:149` | MLB headshots and logos | free |
| api.fontshare.com, cdn.fontshare.com | `app/layout.tsx:38,:39,:42` | web fonts | free |
| fonts.googleapis.com | `legacy/index.html:20` | fonts for the legacy page | free |
| corsproxy.io | `legacy/index.html:681,:895` and `src/engine/legacy-src.gen.ts:5` | **third-party CORS proxy**, fallback for stats and for `obFetchJson` (:893-896) | free third party |
| api.allorigins.win | `legacy/index.html:680` and `legacy-src.gen.ts:5` | **third-party CORS proxy**, fallback for stats | free third party |
| raw.githubusercontent.com, github.com | `src/components/ui/ProScoreboard.tsx:17`; `src/components/nfl/FirstSundaySix.tsx:64`; `tools/first-sunday-six-history.py:85`; `tools/sync-handoff.sh:1032` | static assets and links | free |
| www.ufc.com, en.wikipedia.org | `src/components/ufc/UfcRankings.tsx:46`; `tools/build_ufc.py:240,:246` | UFC rankings build | free scrape |
| baseballsavant.mlb.com | `tools/build_priors.py:19` | Statcast priors (workflow paused) | free |
| parlay-lab-six.vercel.app (self) | clv :45, generate :77, ballpark :24, `push.ts:60`; tools `archive_boards.py:51`, `snapshot_odds.py:14`, `snapshot_props.py:15,:235`, `board-report.mjs:7`, `board_window.py:50`, `gate_activity.py:34` | self-calls and archive reads | own host |
| Nevada sportsbook sites: www.circasports.com, sports.nv.betmgm.com, sportsbook.caesars.com (`/us/nv/bet`), www.stationcasinos.com, www.superbook.com | link list `DEFAULT_BOOKS`, `legacy/index.html:529` (+ `legacy-src.gen.ts:5`); sportsbook.caesars.com also in `src/lib/nfl/first-sunday-six-prices.json:5` | outbound links only, never fetched | n/a |

Whether the legacy page's proxy fallback (`obFetchJson`) can run inside the Next app, where Odds calls go through `/api/odds`, was not traced in this pass. In the standalone `legacy/index.html` it can, and an Odds API URL that carries a user-typed key would then pass through corsproxy.io.

---

## 6. Sportsbook-name sweep, second pass

Method: `/tmp/claude-501/g1/sweep2.py` over the same 894 tracked text files as `book-sweep.md` (conflict copies, binaries and `tools/handoff-state.env` excluded). Case-insensitive except `NV`, `AZ`, `DK`, `FD`. Full line lists for the four requested terms are in the appendix.

Verdict rule: for a system that may price only from DraftKings and FanDuel, CHANGE = the line lets another book's price reach a number, a label, a stored field or user-facing copy; KEEP = harmless (team name, test fixture of raw feed data, dated record).

| Term | Lines / files / occurrences | Where (code and docs; fixtures summarised) | Verdict |
|---|---|---|---|
| `matchbook` | 24 / 8 / 24 | Code: `legacy/index.html:1557` (`SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5}`), `src/engine/legacy-src.gen.ts:5`, `src/engine2/devig.ts:65,:70`, `src/engine2/sharpBoard.ts:58` (`SHARPS` set), `src/components/mlb/SharpDesk.tsx:145` (copy). Docs: `ENGINE2.md:79`, `docs/phase2-memo.md:522`. Fixture: `tests/fixtures/cfb/odds-ncaaf-2026-09-05.json` 16 lines (8 key/title pairs). | **CHANGE** all five code sites: the sharp consensus is a weighted median of Pinnacle, Betfair and Matchbook prices pulled with `regions=us,eu`. KEEP the fixture as raw feed data; update the two docs with the code. |
| `ballybet` (searched as `bally`) | 13 / 8 / 14; **2 real** | Real: `src/components/cfb/CfbGameCard.tsx:50` (`ballybet: "Bally"`), `src/components/cfb/CfbProps.tsx:124` (`ballybet: "BB"`). The other 11 lines are the word "globally" (docs ×8, `src/lib/fun-hr.ts:19`, `tests/pair-pred-vs-lock.test.ts:30`). | **CHANGE** both: they are display-label maps for quotes from books other than the two allowed; once the feed is cut to two books these rows are dead. |
| `Nevada` | 7 / 5 / 7; **5 real** | `legacy/index.html:411` ("NEVADA BOOKS" panel header), `:3810` ("Caesars' national feed — the Nevada app can differ"), `legacy-src.gen.ts:5`, `CLAUDE.md:96` ("Nevada book quick-links"), `docs/multibook-memo.md:83` ("DraftKings and FanDuel are not playable from Nevada"). 2 fixture lines are the Nevada Wolf Pack team. | **CHANGE** the legacy lines and `CLAUDE.md:96`. `docs/multibook-memo.md:83` states the opposite of the new premise; annotate it as superseded. KEEP fixtures. |
| `\bNV\b` | 84 / 28 / 97; 2 false positives | UI: `app/builder/page.tsx:338,:626,:646,:744,:815`; `app/ledger/page.tsx:262`; `src/components/allstar/AllStarSurfaces.tsx:5,:92,:210,:290,:391,:438`; `src/components/ledger/ReceiptsPanel.tsx:126`; `src/components/ufc/UfcLiveProps.tsx:139`. Calculation / stored fields: `src/lib/ledger-segments.ts:70,:72,:208` ("NV tax paid"), `src/lib/ticket-payout.ts:10,:33` (NV-confirmed price beats the stored price), `src/lib/ledger-merge.ts:45`, `src/engine2/allstar.ts:17,:360,:613`. Legacy: `legacy/index.html:529` (×2, "BetMGM NV", "Caesars NV"), `:2486,:2487,:2657,:2658,:3332,:3447,:3460,:3539,:3548,:4224`; `legacy-src.gen.ts:5` (×12). Docs: `CLAUDE.md:160,:162,:937`; `ENGINE2.md:4,:179,:311,:319,:326,:332,:333,:340,:347,:349,:381,:501,:534`; `docs/multibook-memo.md:57,:78,:84,:85,:596`; `docs/session-handoff.md:659,:756`; `docs/phase2-memo.md:139`; `docs/harness-substitutions.md:400`; `docs/credit-budget.md:206`. Tests: `tests/dkfd-basis.test.ts` ×11, `tests/ticket-payout.test.ts:17,:29`, `tests/ledger-merge.test.ts:69,:451`, `tests/legacy-harness/int40lock.js:30,:34`, `tests/legacy-harness/unit40grade.js:57`, `tests/engine-units.test.ts:202`, `tests/builder-card-sections.test.ts:16`, `tests/autopsy-floors.test.ts:7`. False positives: `tests/fixtures/fix39/bvp_656427.json:1`, `tests/fixtures/nfl/espn-scoreboard-2026-09-13.json:1`. | **CHANGE** every UI, calculation and legacy line: "NV price confirm", "NV tax paid" and "Caesars NV takes no parlays" all assume the bet is placed at a Nevada Caesars counter. The stored field behind them (`confirmed`, `czOdds`, `czDec`) must stay readable for old tickets. Tests change with the code. Docs: annotate as historical. |
| `betway` | 1 / 1 / 1 | `app/api/ufcprops/route.ts:18` (`REAL_BOOKS = {FanDuel, Caesars, BetRivers, BetWay, BetMGM, DraftKings}`) | **CHANGE**: cut the set to FanDuel and DraftKings, or retire the scrape. |
| `betanysports`, `everygame`, `gtbets` | 8 / 16 / 20 lines, 1 file each | `tests/fixtures/cfb/odds-ncaaf-2026-09-05.json` only | KEEP (raw feed fixture). No code names these keys; they reach the football consensus only through the unfiltered `bookmakers[]` loop already listed in `book-sweep.md` section 3. |
| Other feed keys present only in that fixture: `onexbet` (11 pairs), `marathonbet` (6), `coolbet` (8), `nordicbet` (12), `betsson` (12), `leovegas_se` (13), `unibet_se` (13), `unibet_nl` (9), `williamhill` non-US (12) | 117 fixture lines | same fixture; doc mentions at `CLAUDE.md:981-982` and `docs/collection-period.md:837` (also name `winamax_de`, `betclic_fr`) | KEEP fixture and docs. They show that a `regions=us,eu` pull returns about 26 books. |
| `unibet_us`, `espnbet`, `hardrockbet`, `williamhill`, `betrivers`, `fanatics`, `bovada`, `betonlineag`, `lowvig`, `mybookieag`, `betus`, `pinnacle`, `betmgm` in label maps | (counted in `book-sweep.md`) | `src/components/cfb/CfbGameCard.tsx:40-52`, `src/components/cfb/CfbProps.tsx:112-124`, `src/components/props/props-model.ts:72-73`, `src/lib/sportsbook/books.ts:6-7` | **CHANGE**: `books.ts` feeds the `book` query parameter of `/api/games` (`app/api/games/route.ts:1,:79`), so a user can select a non-DK/FD display book. |
| `us2`, `uk`, `au` regions | 5 / 2 / 9 | `docs/multibook-memo.md:61`; `tests/odds-hardening.test.ts:62,:69,:114,:156` (negative tests that a widened region is refused) | KEEP |
| `Vegas` | 45 / 10 / 65; 3 real | `legacy/index.html:1256,:2182` ("Vegas total" label on the consensus total), `prompts/mlb_prop_handicapper_prompt.md:18`; the rest are Las Vegas Raiders / UNLV in fixtures | CHANGE wording (low priority); KEEP fixtures |
| `Arizona`, `\bAZ\b` | 55 / 41 and 18 / 12 | every hit is a team name or team abbreviation (e.g. `src/lib/mlb/ballpark.ts:70`, `src/lib/player-card.ts:46,:401`, `src/lib/mlb-visuals.ts:14,:68`, `app/stats/page.tsx:217`, `legacy/index.html:515,:603,:906`) or a matchup in docs (`docs/multibook-memo.md:139,:140,:370`; `docs/session-handoff.md:2070,:2088,:2113`) | KEEP. **No tracked code or doc states Arizona as the betting jurisdiction.** The only Arizona-as-jurisdiction code is the untracked `src/lib/az/`. |
| `scoresandodds` | 23 / 13 / 23 | `src/lib/splits.ts:6,:30,:42,:49,:112,:119`; `app/api/splits/route.ts:6,:23`; `src/components/ui/SplitsChip.tsx:5,:14`; `src/components/ui/OddsGrid.tsx:32,:86`; `src/lib/prop-lean.ts:4`; docs and tests | KEEP with a decision: it supplies bet and money percentages, not prices, but the percentages are a market-wide consensus, not DraftKings or FanDuel figures. |
| `bestfightodds` | 7 / 2 / 7 | `app/api/ufcprops/route.ts:5,:35,:38,:80`; `src/components/ufc/UfcLiveProps.tsx:12,:68,:81` | **CHANGE**: scraped prices from six books including a Caesars column. |
| `dk_fd`, `\bDK\b`, `\bFD\b` | 197 / 40; 273 / 72; 222 / 54 | throughout engine, tests and docs | KEEP the names. **CHANGE the meaning**: `dk_fd` mode is documented as "shop at DraftKings/FanDuel, settle at Caesars NV" (`ENGINE2.md:311`), so the settlement price is still Caesars. |
| `CZ = "williamhill_us"` in tools | (term counted in `book-sweep.md`) | `tools/snapshot_props.py:27`; `src/lib/server/clv-core.ts:44` (`CAESARS_KEY`) | **CHANGE**: the scheduled archive and the CLV job both key on the Caesars feed. |

Zero hits anywhere: `betparx`, `sport888`, `tipico`, `sisportsbook`, `wind creek`, `novig`, `prophetx`, `rebet`, `kalshi`, `polymarket`, `thescore`, `sugarhouse`, `twinspires`, `foxbet`, `betfred`, `golden nugget`, `desert diamond`, `wynnbet`, `pick6`, `dabble`, `betr`.

Unfiltered pulls that return every book in a region, which is how the names above reach calculations: `regions=us` at propsnap :51,:98, clv :108, `football-props.ts:125-135`, `tools/snapshot_props.py:323`; `regions=us,eu` at clv :90, `tools/snapshot_odds.py:24`, and the sharp markets in `src/lib/server/odds-shape.ts`.

### Do the generated handoff documents carry book names?

- There is no `tools/handoff/` directory in this checkout. The handoff sources are `tools/sync-handoff.sh` (1,072 lines), `tools/handoff-inventory.py` (41 lines) and `tools/handoff-state.env` (not opened).
- `tools/sync-handoff.sh` writes handoff text that names DraftKings as the only book: `:256-258` ("DraftKings via The Odds API" for MLB, CFB, NFL), `:263` and `:639` ("DraftKings is the default and settlement book; browsing can select another sportsbook"). FanDuel is not mentioned once in the script. **CHANGE** to DraftKings and FanDuel.
- The script copies `docs/*.md`, `CLAUDE.md` and `ENGINE2.md` verbatim into `/Users/josh/Documents/Parlay Lab Handoff/repo/` (`:175-179`). Every Caesars and Nevada line in those files therefore travels into the handoff folder. Lines naming Caesars or William Hill per doc: `docs/collection-period.md` 60, `docs/session-handoff.md` 48 (plus 2 NV), `docs/multibook-memo.md` 17 (plus 6 NV/Nevada and 21 lines naming other books), `docs/cfb-desk.md` 16, `docs/progress.md` 13, `docs/freeze-exit-bundle.md` 8, `docs/phase2-memo.md` 7, `docs/auto-lock-memo.md` 6, `docs/singles-vs-parlays.md` 5, `docs/first-sunday-six.md` 4, `docs/harness-substitutions.md` 3, `docs/nfl-desk.md` 2, `docs/pitcher-outs-audit.md` 2, `docs/hrr-recalibration.md` 2. `tools/handoff-inventory.py` names no book.
- `tools/sync-handoff.sh:186` also copies `tools/handoff-state.env` out of the repository into the handoff folder.

---

## 7. Defects

| # | Severity | Defect | Evidence | Impact | Proposed fix |
|---|---|---|---|---|---|
| 1 | High | `/api/sharp` is open to anyone when `APP_PASSCODE` is unset, and unusable by the app when it is set | `app/api/sharp/route.ts:69-71` (`if (pass && …)`), :13 model `claude-opus-4-8`, :102 `max_tokens` 16000, :11 `maxDuration` 300; the app sends no `x-pl-pass` (`app/sharp/page.tsx:727`, `app/settings/page.tsx:335,:361`) | anyone who finds the URL can run paid Anthropic calls with a payload of their choosing; the only lever that closes it also locks the owner out | gate on the sync phrase (`syncAuthed`), fail closed, cap the request body size |
| 2 | High | `/api/cfb/props` and `/api/nfl/props` spend Odds API credits for anonymous callers with no daily cap | `app/api/cfb/props/route.ts:25`, `app/api/nfl/props/route.ts:34` (no gate); `football-props.ts:179` (only `refresh=1` is gated); `src/lib/cfb/rules.ts:479` and `src/lib/nfl/rules.ts:199` (`dailyBudget` = `Infinity`); `football-props.ts:364` (rail skipped with no store) | a stale or unpriced `?date=` triggers per-event pulls at about 31 credits each, up to 60 CFB or 16 NFL events per call | anonymous GET serves the stored board only; pulls only under cron header or sync; restore a finite daily budget |
| 3 | High | Prices from books other than DraftKings and FanDuel reach calculations, stored fields and labels | unfiltered `regions=us` / `us,eu` pulls (propsnap :51, clv :90,:108, `football-props.ts:125-135`); `src/lib/server/clv-core.ts:44`; `src/engine2/devig.ts:65-70`; `src/engine2/sharpBoard.ts:58`; `legacy/index.html:1557`; `app/api/ufcprops/route.ts:18`; `tools/snapshot_props.py:27`; NV settlement logic `src/lib/ticket-payout.ts:10,:33`, `src/lib/ledger-segments.ts:70-72,:208` | the stated rule for the Arizona system (two books only) is not met on the sharp desk, CLV, UFC props, football consensus, the props archive and the ledger's "NV" settlement path | add `bookmakers=draftkings,fanduel` to every Odds API URL and to the proxy allow-list; replace Caesars/NV settlement with the book the ticket was priced at; retire or rebuild the sharp desk and UFC scrape |
| 4 | Medium | `/api/odds` gives uncached paid pulls to anyone when `APP_PASSCODE` is unset; cached pulls are public either way; the scheduled props archive depends on that | `app/api/odds/route.ts:47-49`; `tools/snapshot_props.py:30` (`fresh=1`); `.github/workflows/props-history.yml` has no secret | anonymous credit burn; setting the passcode later silently turns the archive into 240-second-old data | require cron header or sync for `fresh=1`; give the workflow a secret; keep the public path cache-only |
| 5 | Medium | `/api/calibrate` is open when `CRON_SECRET` is unset; the secret is compared with plain `===` | `app/api/calibrate/route.ts:76-84`, :78 | anyone can trigger grading and rewrite `pl:cal:weights`, `pl:cal:summary`, `pl:pred:<date>` | use `cronHeaderAuthed`, fail closed with 503 like the scheduler |
| 6 | Medium | `/api/clv` takes `CRON_SECRET` in the query string | `app/api/clv/route.ts:60`; `store.ts:92-98`; `docs/cron-jobs.md:24` calls it a queued security item | the same secret that unlocks every lock route sits in URL logs and in the external scheduler's job URL | header auth; rotate the secret after the change |
| 7 | Medium | The MLB ledger writer has no size check while every other writer refuses above 900,000 bytes | `src/lib/server/lock-card.ts:1301-1323` versus `src/lib/ledger-merge.ts:110-111`, `app/api/ledger/route.ts:135`, `app/api/clv/route.ts:139` | once `pl:ledger:v1` passes the cap, device sync gets 413 and the CLV job stops saving, with no alert; the key has no expiry | check size in `writeLock`; archive old days into a second key before the cap |
| 8 | Medium | The job that drives everything is not visible or monitored from the repository | `docs/cron-jobs.md:7-14,:22-26`; no heartbeat key in section 3; no `timeout-minutes` or failure step in any workflow | if the cron-job.org row is paused or deleted, nothing generates, locks or grades, and nothing reports it. The document records this already happening for ten days | write a heartbeat key on every scheduler arrival and show its age in the app; add timeouts and a failure step to the workflows |
| 9 | Low | `vercel.json` and its guard test disagree | `vercel.json:8-25` (4 crons, 2 on `/api/nfl/lock`); `tests/vercel-cron-pokes.test.ts:61,:69` | the test fails as written (not run here), or the plan limit it encodes means two crons never register | decide the plan limit, then fix whichever side is wrong |
| 10 | Low | Keys with no expiry | `pl:blocks:<date>` (`blocks.ts:36`, `store.ts:74-76`); `pl:pred:<date>`, `pl:pred:days` (generate :763-764) | one or two new keys per day forever; `pl:pred:<date>` can be up to 3 MB each | 30-day expiry on blocks; a retention rule for predictions once graded |
| 11 | Low | Anonymous callers can create store keys | `src/lib/cfb/slate-server.ts:160` writes `pl:discovery:<id>:<date>` for any `?date=` on public `/api/cfb` and `/api/nfl` | key spam (each expires in 36 h) and a billed game-lines pull per new date | validate the date window; write discovery only on authenticated or scheduled builds |
| 12 | Low | Legacy page routes requests through third-party CORS proxies and keeps API keys in localStorage | `legacy/index.html:680-681,:893-896,:1063-1064,:2960`; mirrored in `src/engine/legacy-src.gen.ts:5` | a typed Odds API or Claude key can pass through corsproxy.io or sit readable in the browser | remove the proxy fallbacks and the key fields from the legacy source |
| 13 | Low | Sync phrase and passcode kept in plain localStorage; passcode never used | `src/lib/ledgerSync.ts:19`; `app/settings/page.tsx:361` | any script on the origin can read the phrase that unlocks ledger writes and manual generates | acceptable for a single-user app if stated; drop `pl_pass` or wire it |
| 14 | Low | Public scrape and proxy routes with no gate or rate limit | `app/api/ufcprops/route.ts:35-38`; `app/api/splits/route.ts:17-26`; `app/api/stats/route.ts:9`; `app/api/football/positions/route.ts:17` (32 fetches per call); `app/api/mlb/hit-rates/route.ts` (400 players per call) | the deployment can be used to load third-party sites and to burn function time | cache at the edge; add a simple per-IP limit |
| 15 | Low | Handoff generator states a DraftKings-only system and copies an env-named file out of the repo | `tools/sync-handoff.sh:256-263,:639,:186` | the handoff folder will contradict a two-book system; the env-named file leaves the repository boundary | update the text; confirm the env-named file holds no secret |
| 16 | Low | 16 iCloud conflict copies are tracked in git | `book-sweep.md` section 2 list (e.g. `tools/build_ufc 3.py`, `tests/timezone-parity.test 3.ts`) | stale duplicates can be run or edited by mistake | untrack them |


---

## Appendix — raw hit lists for the four requested terms

Format: `file:line [xN] text` (N = occurrences on the line; lines over 1,500 characters are shown as a length only).

```
### matchbook: 24 lines, 8 files, 24 occurrences
ENGINE2.md:79 [x1] median consensus; Pinnacle ×3, Betfair/Matchbook ×2), unit-tested in
docs/phase2-memo.md:522 [x1] `matchbook` 2, `betonlineag` 1.5, else 1). Same function, same aggregation — that is
legacy/index.html:1557 [x1] var SH_BOOKW={pinnacle:3,betfair_ex_eu:2,matchbook:2,betonlineag:1.5};
src/components/mlb/SharpDesk.tsx:145 [x1] Consensus = per-book Shin de-vig, then a weighted median (Pinnacle ×3, Betfair/Matchbook ×2). Games without a
src/engine/legacy-src.gen.ts:5 [x1] [long line, 297804 chars]
src/engine2/devig.ts:65 [x1] /** Pinnacle is the classic sharp anchor; exchanges (Betfair/Matchbook) carry
src/engine2/devig.ts:70 [x1] matchbook: 2,
src/engine2/sharpBoard.ts:58 [x1] const SHARPS = new Set(["pinnacle", "betfair_ex_eu", "matchbook"]);
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1012 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:1013 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3805 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:3806 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5058 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:5059 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6010 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:6011 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7217 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:7218 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9193 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:9194 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10457 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:10458 [x1] "title": "Matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11943 [x1] "key": "matchbook",
tests/fixtures/cfb/odds-ncaaf-2026-09-05.json:11944 [x1] "title": "Matchbook",

### bally: 13 lines, 8 files, 14 occurrences
docs/branch-firing-audit.md:1539 [x1] | 3 | **`fresh=1` on the query string** | **THIS IS THE ONE THAT MATTERS — see below. `fresh=1` bypasses the 240 s cache, so EVERY call pays.** Withou
docs/branch-firing-audit.md:1613 [x1] **one spend per 4 minutes globally** — a ~2,160/day worst case, but only if something polls
docs/collection-period.md:2063 [x1] Prop lkeys are `player|market|line`, globally unique on a slate. **ML/RL lkeys are the
docs/collection-period.md:7742 [x1] **DOC SENTENCES CLAIMING A PROTECTION GLOBALLY — grepped, each with file and line:**
docs/collection-period.md:7747 [x1] | `legacy/index.html` L1070 | code comment: "zero edge = zero stake" — **globally false**: in legacy modes zero edge takes a $62 stake | **recorded he
docs/harness-substitutions.md:325 [x1] `tests/timezone-parity.test.ts` possible at all. Pinning it globally would recreate
docs/session-handoff.md:384 [x1] Board's SMALL graded tables now show ten globally sorted rows with Load 10 More, Undo and Clear. Search, category, odds and other filter changes reset
docs/session-handoff.md:388 [x1] Football fun-ticket search now considers other qualifying sides across distinct games rather than the five shortest ML favorites. Requires the existin
docs/session-handoff.md:1950 [x1] repeatCap 2 per player globally · rotated starts so no two tickets identical ·
src/components/cfb/CfbGameCard.tsx:50 [x2] ballybet: "Bally",
src/components/cfb/CfbProps.tsx:124 [x1] ballybet: "BB",
src/lib/fun-hr.ts:19 [x1] *     players"), enforced globally;
tests/pair-pred-vs-lock.test.ts:30 [x1] * globally unique — but ML/RL lkeys are the literals `ml_home` / `ml_away` / `rl_home` /

### nevada: 7 lines, 5 files, 7 occurrences
CLAUDE.md:96 [x1] Legs persist in `pl_legs`; combined parlay odds/payout/EV; Nevada book quick-links. Shared across sports.
docs/multibook-memo.md:83 [x1] {DK, FD, MGM, CZ}, and **DraftKings and FanDuel are not playable from Nevada**: verified,
legacy/index.html:411 [x1] <div class="bhead"><span>NEVADA BOOKS</span><button id="toggleBookForm">＋</button></div>
legacy/index.html:3810 [x1] if(!LS.get("pl_czNote",""))h+="<div class='shczno'>ℹ️ Playable prices are Caesars' national feed — the Nevada app can differ a touch. The ledger recor
src/engine/legacy-src.gen.ts:5 [x1] [long line, 297804 chars]
tests/fixtures/cfb/espn-fpi.json:3450 [x1] "nickname": "Nevada",
tests/fixtures/cfb/espn-fpi.json:3451 [x1] "displayName": "Nevada Wolf Pack"

### NV: 84 lines, 28 files, 97 occurrences
CLAUDE.md:160 [x1] - **Caesars-only playable card**: ingestion additively captures Caesars (`CAESARS_KEY`=`williamhill_us`) ML/RL/prop prices (`*_cz`, `row.cz`; RL only 
CLAUDE.md:162 [x1] - **Lock + ledger**: `shLockCard` freezes tickets/prices/stakes/`gameInfo` (pk+first pitch, additive engine output) into `pl_ledger` (seeded `SH_LEDGE
CLAUDE.md:937 [x1] | `docs/multibook-memo.md` | **the multi-book scoping memo (2026-07-28, corrected three times same day)**: feed census (only BetMGM of five targets; D
ENGINE2.md:4 [x1] Odds API + Caesars NV as the executable book. The champion engine (builds
ENGINE2.md:179 [x1] Correct Score. **STRAIGHT BETS ONLY — Caesars NV offers no ASG parlays**; the
ENGINE2.md:311 [x1] **The idea:** shop at DraftKings/FanDuel, settle at Caesars NV. The basis price per
ENGINE2.md:319 [x1] card legs need BOTH a basis and a CZ quote; the NV price-confirm stays the grading
ENGINE2.md:326 [x1] **Two dk_fd-only deviations the NV-blindness test forced (both documented here on
ENGINE2.md:332 [x1] selection (the spec lists it), and a no-basis row's NV-anchored prob steering the
ENGINE2.md:333 [x1] builder's shared usage ledger would leak NV prices into which SELECTABLE tickets
ENGINE2.md:340 [x1] invariant, so the opinion is pinned while NV prices move wildly. Every pick, ranking
ENGINE2.md:347 [x1] paid it (Receipts "vs DK/FD close" column). "NV tax paid" = basis P/L − actual P/L
ENGINE2.md:349 [x1] at the NV counter; void-repriced wins are excluded (a basis reprice would be a
ENGINE2.md:381 [x1] anchors at the basis price (NV-blind, per the dk_fd deviation rule). Tests in
ENGINE2.md:501 [x1] (reason `nv_tax`) and the Builder shows "blocked: NV tax turns this negative".
ENGINE2.md:534 [x1] - Blocked message wording per the correction: "Blocked — the NV price turns this negative
app/builder/page.tsx:338 [x1] nv_tax: "NV price turns it negative",
app/builder/page.tsx:626 [x1] /* one locked ticket + its NV price-confirm input — shared by the CORE and FUN sections
app/builder/page.tsx:646 [x1] <span className="text-[10px] uppercase tracking-wide text-faint">NV price</span>
app/builder/page.tsx:744 [x1] ? "All-Star Game — a sized card of STRAIGHT bets (Caesars NV takes no ASG parlays)"
app/builder/page.tsx:815 [x1] append-only, no retroactive edits. Confirm the NV app&apos;s price on any ticket until its first pitch.
app/ledger/page.tsx:262 [x1] {t.confirmed != null ? `${amSign(t.confirmed)} (NV)` : String(t.czOdds ?? "")}
docs/credit-budget.md:206 [x1] | `/api/clv` | ~30–60 | ~900–1,860 | CLV report, receipts, NV-tax accounting | the scoreboard |
docs/harness-substitutions.md:400 [x1] | 1 | `boardToPredictions` output **vs** `shTicketSnap` output, for the SAME leg | the calibration channel and the CLV/ledger channel are measuring **
docs/multibook-memo.md:57 [x1] Owner context: live BetMGM NV and Circa accounts exist. `PLAY_BOOKS` is a single-entry
docs/multibook-memo.md:78 [x1] line — NV occasionally differs, which the existing at-lock confirm discipline covers.
docs/multibook-memo.md:84 [x1] not assumed — DK has no NV book at all; FD's is a single in-person counter at the Fremont
docs/multibook-memo.md:85 [x1] (no online), and both companies' NV licensing collapsed in Nov 2025 over prediction-market
docs/multibook-memo.md:596 [x1] | grader | pays P/L from the ticket's cz price (NV-confirm overlays cz) |
docs/phase2-memo.md:139 [x1] | receipts / NV-tax accounting | **dark** |
docs/session-handoff.md:659 [x1] ONE ticket renderer (`renderLockedTicket`, so the split cannot fork the NV
docs/session-handoff.md:756 [x1] return at the settling price — confirmed NV beats the Caesars quote, cents rounded once like
legacy/index.html:529 [x2] var DEFAULT_BOOKS=[{id:uid(),name:"Circa Sports",url:"https://www.circasports.com"},{id:uid(),name:"BetMGM NV",url:"https://sports.nv.betmgm.com"},{id
legacy/index.html:2486 [x1] anchoring to the all-books best would let an NV quote steer selection (the
legacy/index.html:2487 [x1] NV-blindness test catches exactly this). No basis → legacy anchor, and the
legacy/index.html:2657 [x1] one-sided no-basis rows carry an NV-anchored prob — letting them into the
legacy/index.html:2658 [x1] shared usage ledger would leak NV prices into which SELECTABLE tickets get
legacy/index.html:3332 [x1] grading results, closing-price sightings (CLV) and the optional NV price confirms — the
legacy/index.html:3447 [x1] /* optional NV price confirm — allowed on a locked ticket only until its first pitch */
legacy/index.html:3460 [x1] shStatus("NV price confirmed for that ticket — grading will pay at "+obSign(am)+".");
legacy/index.html:3539 [x1] "<span class='shprop'>"+esc(t.confirmed!=null?obSign(t.confirmed)+" (NV)":t.czOdds+" @ Caesars")+"</span></div>"+
legacy/index.html:3548 [x1] (!started&&!gr?"<div class='shconfrow'>NV price differs? <input class='shconf' data-czconfirm='"+esc(t.id)+"' placeholder='e.g. +450' value='"+(t.conf
legacy/index.html:4224 [x1] /* NV price-confirm inputs on locked tickets (change events don't bubble as clicks) */
src/components/allstar/AllStarSurfaces.tsx:5 [x1] Caesars NV offers no parlays on this game, so there is no combo UI at all —
src/components/allstar/AllStarSurfaces.tsx:92 [x1] Every All-Star market is posted in your Caesars Sportsbook NV app. ML, F3, F5, the total and the
src/components/allstar/AllStarSurfaces.tsx:210 [x1] Straight bets only — Caesars NV doesn&apos;t offer All-Star Game parlays. Exhibition baseball: tiny
src/components/allstar/AllStarSurfaces.tsx:290 [x1] Straight bets only (no ASG parlays at Caesars NV). Informational only, not betting advice.
src/components/allstar/AllStarSurfaces.tsx:391 [x1] Caesars NV doesn&apos;t offer parlays on the All-Star Game, so every ticket below is a single.
src/components/allstar/AllStarSurfaces.tsx:438 [x1] body="The allocator sizes straight bets only — Caesars NV takes no All-Star parlays — and the stakes sum exactly to your numbers."
src/components/ledger/ReceiptsPanel.tsx:126 [x1] <span className="font-bold text-gold">NV tax paid</span>{" "}
src/components/ufc/UfcLiveProps.tsx:139 [x1] Slip probability uses the market median, same caveat. Method-of-victory prices from the selected book NV app
src/engine/legacy-src.gen.ts:5 [x12] [long line, 297804 chars]
src/engine2/allstar.ts:17 [x1] - Caesars NV offers NO parlays on the All-Star Game, so everything here is
src/engine2/allstar.ts:360 [x1] Caesars NV app; this router sorts a raw dump line-by-line: correct scores
src/engine2/allstar.ts:613 [x1] /* Straight bets ONLY — Caesars NV does not offer All-Star Game parlays.
src/lib/ledger-merge.ts:45 [x1] * sightings, NV price confirms) — so the richer entry wins as the base and
src/lib/ledger-segments.ts:70 [x1] /* dk_fd: running "NV tax paid" — what settling at Caesars cost vs the DK/FD basis
src/lib/ledger-segments.ts:72 [x1] Positive = money given up to the NV counter. Void-repriced wins are skipped
src/lib/ledger-segments.ts:208 [x1] // dk_fd: NV tax paid = basis P/L − actual P/L on settled basis-locked tickets.
src/lib/ticket-payout.ts:10 [x1] * pair is the ticket's potential at its settling price (NV-confirmed price beats the
src/lib/ticket-payout.ts:33 [x1] /** settling decimal price: confirmed NV → czDec → parsed czOdds; null when unpriced */
tests/autopsy-floors.test.ts:7 [x1] - settlement floor: czEv must be ≥ coreCzEvMin (0) — NV tax never flips a lock negative
tests/builder-card-sections.test.ts:16 [x1] * NV price-confirm behavior.
tests/dkfd-basis.test.ts:13 [x1] The NV-blindness proof: perturb Caesars/BetMGM quotes by scaling both sides'
tests/dkfd-basis.test.ts:14 [x1] DECIMAL odds by the same factor. That changes every NV price wildly while
tests/dkfd-basis.test.ts:16 [x1] held constant and any selection difference can only come from an NV PRICE
tests/dkfd-basis.test.ts:35 [x1] const K = 3; // triples every NV decimal — pair ratios (and so de-vigged fairs) unchanged
tests/dkfd-basis.test.ts:102 [x1] explicitly outside the NV-blind guarantee — they can never take card money. */
tests/dkfd-basis.test.ts:128 [x1] describe("dk_fd: selection is provably NV-blind", () => {
tests/dkfd-basis.test.ts:133 [x1] // sanity: the perturbation really moved NV prices (display fields differ)
tests/dkfd-basis.test.ts:141 [x1] // membership is a display ranking off NV-anchored probs and may legitimately shift
tests/dkfd-basis.test.ts:237 [x1] expect(g({ ...ticket, confirmed: 300 }, res).payout).toBe(40); // NV confirm is the price of record
tests/dkfd-basis.test.ts:283 [x1] describe("dk_fd: receipts — CLV vs basis close and the NV tax line", () => {
tests/dkfd-basis.test.ts:284 [x1] it("basis CLV averages over basis-locked legs; NV tax reconciles basis P/L vs actual P/L by market", () => {
tests/engine-units.test.ts:202 [x1] it("any lost leg loses; all-void pushes the stake back; NV-confirmed price wins over czDec", () => {
tests/fixtures/fix39/bvp_656427.json:1 [x2] [long line, 30559 chars]
tests/fixtures/nfl/espn-scoreboard-2026-09-13.json:1 [x1] [long line, 163923 chars]
tests/ledger-merge.test.ts:69 [x1] expect(m[0].core.find((t) => t.id === "t2")?.confirmed).toBe(-118); // NV confirm carried over
tests/ledger-merge.test.ts:451 [x1] expect(a1?.confirmed, "the loser's NV confirm was dropped").toBe(-125);
tests/legacy-harness/int40lock.js:30 [x1] /* NV price confirm on a pregame ticket */
tests/legacy-harness/int40lock.js:34 [x1] chk("NV price confirm recorded pre-pitch",e2.core[0].confirmed===500,String(e2.core[0].confirmed));
tests/legacy-harness/unit40grade.js:57 [x1] chk("confirmed NV price pays instead of feed price (+800 -> $90 on $10)",g6.result==="won"&&Math.abs(g6.payout-90)<1e-9,"payout $"+g6.payout);
tests/ticket-payout.test.ts:17 [x1] it("a confirmed NV price supersedes the Caesars quote (the ledger's old 'to win' rule)", () => {
tests/ticket-payout.test.ts:29 [x1] // settled at a confirmed NV price the grader already applied — the grade wins, not the quote

```
