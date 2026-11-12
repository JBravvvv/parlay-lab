# G2 — spend, security and front-end gaps

Read-only pass over `/private/tmp/claude-501/pl-audit` (branch `az-two-book-anytime`), 2026-11-12.
No network, no tests run, no `.env*` opened. Paths are relative to the checkout.
Checked against `findings.json` (140 ids) first; anything already covered there is named and not repeated
(P-10, E3-16, E2-2, E2-5, E2-6, E2-9, E2-10, E1-2, E1-13, E3-10, E3-11, E3-12).

Severity key: critical / high / medium / low. "Cannot be known from disk" items are called out per section.

---

## A. Paid LLM route — `app/api/sharp/route.ts`

### What the code does today

- `POST /api/sharp` (`app/api/sharp/route.ts:61-133`), `maxDuration = 300` (:11), model `claude-opus-4-8` (:13).
- Order of checks: `ANTHROPIC_API_KEY` missing -> 501 (:62-68); `APP_PASSCODE` set and `x-pl-pass` differs -> 401 (:69-72);
  body parse (:74-79); `if (!slate)` -> 400 (:80). The passcode check is **skipped entirely when `APP_PASSCODE` is unset** (:70).
- The only input check is truthiness of `slate` (:80). No type check, no size bound, no rate limit, no per-day counter,
  no lease, no store write, `usage` never read or logged.
- One raw `fetch` to `https://api.anthropic.com/v1/messages` (:93-108): `max_tokens: 16000`, `thinking: {type:"adaptive"}`,
  `output_config.format` json_schema, system = `prompts/mlb_prop_handicapper_prompt.md` (5,384 bytes on disk),
  user message = fixed preamble + `JSON.stringify(slate)` (:89-91). No `cache_control`, no streaming, no `AbortSignal`, no retry.
- Callers:
  - `app/sharp/page.tsx:727` — `AiMode()` posts `body: "{}"` with only a `content-type` header. No slate, no `x-pl-pass`.
    It is an availability probe: it can only ever get 501, 401 or 400 "missing slate". It can never reach Anthropic.
  - `src/components/mlb/SharpDesk.tsx` — does **not** call `/api/sharp`. It is the engine-v2 market desk
    (`loadSharpBoard` from `@/engine2/sharpBoard`, :53-58); `const basis=false` (:51) makes every DK/FD-basis branch dead.
  - `legacy/index.html:2957-2975` (`shCallClaude`) — makes its **own** direct browser call to `api.anthropic.com` with a
    key the user typed on the device (`x-api-key: SH.key`, `anthropic-dangerous-direct-browser-access: true`, same model,
    same `max_tokens: 16000`). It does not go through `/api/sharp`. `legacy/` is outside `public/`, so Next does not serve it.
  - `tools/quota.mjs:93-94` is the only code anywhere that sends `x-pl-pass` (a CLI, for `/api/odds`). No app/src client sends it (already P-10).
- So the paid path of `/api/sharp` has **no in-app caller**. It is reachable only by a hand-made POST.

### Worst-case spend per call

- Input: system prompt (about 1.4k tokens) + the caller's `slate`, bounded only by the platform request-body limit and the
  model's 1M-token context. Output: capped at 16,000 tokens (thinking counts inside it).
- At the list price in the bundled claude-api reference (cached 2026-11-03: `claude-opus-4-8` $5 / MTok in, $25 / MTok out):
  about 1,000,000 x $5/M = $5.00 input + 16,000 x $25/M = $0.40 output = **about $5.40 per call**, no cap on calls.
  The UI's own estimate for a normal slate is "~$0.50/run" (`app/sharp/page.tsx:701`).
- An over-context body is rejected by Anthropic and not billed. A `max_tokens` stop is billed and then returned as a 502 (:123-124).

### Cannot be known from disk

- Whether `ANTHROPIC_API_KEY` is set in production (if not, the route is a harmless 501).
- Whether `APP_PASSCODE` is set in production. `docs/session-handoff.md:4083` itself marks "APP_PASSCODE IS UNSET IN PRODUCTION"
  as unverified, and :2326-2328 warns not to set it yet. A live `POST {}` answers this in one call (see G2-2).
- Whether the legacy page is still hosted anywhere (e.g. an old static host).

### Findings

**G2-1 — high (conditional) — `/api/sharp` is an unbounded paid LLM proxy with no in-app caller; open to anyone when `APP_PASSCODE` is unset**
- Evidence: `app/api/sharp/route.ts:69-72` (gate skipped when env unset), :74-80 (only `!slate`), :93-108 (no bound, no timeout, no usage log); `app/sharp/page.tsx:727` (only caller sends `{}`).
- Impact (spend): if the key is set and the passcode is not, any anonymous POST with a non-empty `slate` bills up to about $5.40, repeatable in parallel with no ceiling. Nothing in the app records that it happened. If the passcode is set, the phone still cannot use the feature (P-10), so the route is all cost and no function either way.
- Fix: delete the route until the feature is wired; or gate with `syncAuthed` (the phrase the phone already holds), reject bodies over about 200 KB, add a per-day NX counter in the store (for example 5 runs/day), add `AbortSignal.timeout`, log `usage`, and put `cache_control` on the fixed system prompt.

**G2-2 — low — `/api/sharp` tells an anonymous caller which secrets are configured; passcode compare is a plain string compare**
- Evidence: `app/api/sharp/route.ts:62-68` (501 = no key), :70-72 (401 = passcode set), :80 (400 "missing slate" = key set, passcode unset). Compare at :70 is `!==`; same pattern `app/api/odds/route.ts:49` (`===`). All other auth uses sha256 + `timingSafeEqual` (`src/lib/server/store.ts:78-123`).
- Impact (security): a single empty POST reveals whether the paid path is open. The timing difference of a plain compare is minor next to that.
- Fix: check the passcode first and return one generic 401/404 for every unauthenticated case; reuse the `timingSafeEqual` helper.

**G2-3 — low — legacy page calls Anthropic from the browser with a device-held key and relays Odds API URLs (key in the query string) through third-party CORS proxies**
- Evidence: `legacy/index.html:2957-2975` (direct call, `anthropic-dangerous-direct-browser-access`), :436 (key kept on the device), :893-896 (`obFetchJson` falls back to `https://corsproxy.io/?url=<full URL>`), :919, :941, :997 (those URLs carry `apiKey=`), :680-681 (`api.allorigins.win`, `corsproxy.io` for stats). The same text is embedded in `src/engine/legacy-src.gen.ts`.
- Reach inside the Next app: none. `src/engine/index.ts:260-267` shims `fetch` to a failed response and :303 rebinds `obFetchJson` to the caller's fetcher, so the relays are dead code there.
- Impact (security): only if the legacy page is still opened anywhere — a failed direct fetch hands the Odds API key to corsproxy.io. Unknown from disk.
- Fix: confirm the legacy page is not hosted; strip the relay fallback from `legacy/index.html` at the next engine re-extract.

---

## B. Thinly covered server paths

### B1. MLB live in-play — `app/api/mlb/live-props/route.ts`, `src/lib/server/mlb-live-quote.ts`, `src/lib/server/mlb-live-state.ts`

#### What the code does today

- Route is a thin shell: `cronHeaderAuthed || syncAuthed` else 401 (`app/api/mlb/live-props/route.ts:60-65`), `maxDuration = 60` (:51),
  store prefixes `pl:mlb:liveprops:v1:`, `pl:mlb:liveprops:spend:v1:`, `pl:mlb:liveprops:429:` (:54-58).
- Config (`src/lib/mlb/live-props-rules.ts`): `liveMaxEvents: 12` (:108), `liveRevalidateSec: 1800` (:110), `quoteMaxAgeSec: 1800` (:114),
  `probeEvents: 3` (:130), `rateMeasured: false` (:144), `dailyBudget: Number.POSITIVE_INFINITY` (:153), `measuredCreditsPerEvent: 6` (:155),
  eight markets in `MLB_LIVE_MARKETS` (:237-238) — code adds `extraMarkets = 2`, so 8 credits/event is assumed.
- Rails in `mlbLivePropsGet`: no store -> off; nothing live -> free; slot stamp only `if (slot && !manual)` (`mlb-live-quote.ts:524`);
  429 cooldown blocks automatic passes only; budget rail can never bind (Infinity); free divergence gate; 60 s NX lease (:603);
  probe cap `probing = !manual && (!cfg.rateMeasured || spentNow === 0)` (:660) -> 3 events for automatic/browser passes, up to 12 for `manual=1`.
- Three callers: the scheduler's six Pacific slots (`slot=`), the Refresh pill via `/api/refill` (`manual=1`), and the phone's own
  read `useMlbLiveQuotes` mounted on Board, Props and Sharp (`app/board/page.tsx:363`, `app/props/page.tsx:207`, `app/sharp/page.tsx:212`),
  which sends `x-pl-sync`, **no `slot`, no `manual`** (`src/lib/mlb/live-client.ts:362-378`).
- Live/final/priceable predicates are the same regexes on server (`mlb-live-state.ts:109-148`) and client (`src/lib/liveNow.ts:145-151`). They agree.
- statsapi reads are sequential and un-timed (`mlb-live-state.ts:188-195`, :235-263): up to 4 schedule + 12 boxscore calls before any Odds call.

#### Findings

**G2-4 — medium — the phone's own Board read is a paid pass with no slot stamp and no ceiling, while its docblock says it spends nothing**
- Evidence: `src/lib/mlb/live-client.ts:341-343` ("no credits spent by this call on its own") vs `src/lib/server/mlb-live-quote.ts:524` (stamp only when `slot` is present), :660 (3 events allowed), `live-props-rules.ts:153` (budget Infinity). A read with any live game that is unpriced / expired / cleared passes the free gate and goes on to the events list plus per-event pulls.
- Impact (spend): each cold start or stale refetch during live play can bill 1 + 3 x 8 = 25 credits on the assumed rate (1 + 3 x 31 = 94 if MLB bills like CFB — still unmeasured, E2-5). Because only 3 of up to 12 live games are bought per pass, the next open buys again. The six scheduled slots (about 19-25 credits each) are not the real daily total.
- Fix: make the un-slotted read store-only (never spend), or stamp it with a synthetic slot (for example the current half-hour) so it is de-duplicated like the scheduler's.

**G2-5 — medium — a manual Refresh buys up to 12 events and discards the 30-minute window and the 2-hour empty hold; nothing de-duplicates taps**
- Evidence: `mlb-live-quote.ts:583` (`overlay: manual && prev ? {...prev, pricedAt: {}, emptyAt: {}}`), :660-661 (`probing` false for manual), :524 (manual skips the stamp); `live-props-rules.ts:108`, :153.
- Impact (spend): one tap = 12 x 8 + 1 = 97 credits assumed, 12 x 31 + 1 = 373 at the CFB rate; three taps in an inning cost three times that for nearly identical prices.
- Fix: keep `pricedAt` on a manual pass for games priced in the last N minutes (5 is enough for in-play), and add a short manual NX stamp (60-120 s).

**G2-6 — medium — every credit rail on this route fails open when the store errors**
- Evidence: `mlb-live-quote.ts:496` (`readSpend` failure reads as 0), :524-528 (slot stamp failure -> "OK", pass proceeds), :603 (lease failure -> "OK"), :768 (`addSpend` failure swallowed). RAIL 0 only checks that the env names exist, not that the store answers.
- Impact (spend/reliability): during a store outage (HTTP 403/5xx from Upstash) scheduled slots are not de-duplicated, concurrent passes are not serialised, nothing is tallied, and the overlay write fails (`storeWriteFailed`), so the credits buy prices nobody sees.
- Fix: fail closed on the stamp and the lease for automatic passes (a tap can stay fail-open); skip the pull when the overlay cannot be read.

**G2-7 — low — docblocks on the spending route describe rails that no longer exist**
- Evidence: `app/api/mlb/live-props/route.ts:26` ("the 600-credit day"), :44 ("564 against the 600 rail"); `live-props-rules.ts:80` ("`dailyBudget: 600` therefore holds") vs :153 (Infinity); "six CORE in-play markets" vs eight at :237-238; `live-client.ts:341`.
- Impact (reliability): the next reader will assume a daily ceiling and a zero-cost phone read. Neither is true.
- Fix: rewrite the three docblocks to the current numbers.

**G2-8 — low — un-timed sequential upstream reads inside a 60 s function; the scheduler gives up at 20 s but the pass keeps spending**
- Evidence: `mlb-live-state.ts:188-195` (no `AbortSignal`), :235-263 (sequential); `mlb-live-quote.ts:396`, :612 (Odds fetches un-timed); `src/lib/server/refill.ts:139` (`MLB_LIVE_PULL_TIMEOUT_MS = 20_000`).
- Impact (reliability): a slow statsapi makes the scheduler log a timeout for a pass that still completes and bills; a hung fetch ends in a platform kill after the credits are spent and before the overlay is written.
- Fix: `AbortSignal.timeout(4000)` on each statsapi and Odds call, and read the schedule dates in parallel.

### B2. Public betting splits — `src/lib/splits.ts`, `app/api/splits/route.ts`, `src/lib/use-splits.ts`

#### What the code does today

- `GET /api/splits?league=nfl|mlb|ncaaf`, unauthenticated, direct server fetch of `https://www.scoresandodds.com/<league>/consensus-picks`
  with a browser-like user agent and `next: { revalidate: 600 }` (`app/api/splits/route.ts:14-28`). No CORS relay is used here; `corsproxy.io` / `api.allorigins.win` exist only in the legacy source (G2-3).
- Parsing is regex over HTML (`src/lib/splits.ts:53-108`): card split on a class name, market from the first 200 characters, team abbreviations via a pattern that depends on a doubled quote in the source markup, percentages from inline `width: N%`. Bar 0 = % of bets, bar 1 = % of money, left = away/over, right = home/under — all positional.
- Failure is always HTTP 200 with an `error` field and an empty game list (`route.ts:29`, :32, :33-35). The hook returns the feed or null and never surfaces `error` (`src/lib/use-splits.ts:35-36`), so chips simply disappear.
- Cache layers: Next data cache 600 s, edge `s-maxage=600, stale-while-revalidate=1800` (:38-40), client `staleTime` 10 min. `fetchedAt` is stamped at response time, not source-fetch time.

#### Findings

**G2-9 — medium — on a swapped-pair match the chip shows the opponent's bet % and money %**
- Evidence: `src/lib/splits.ts:177` accepts `(away matches consensus home && home matches consensus away)`; `sideSplit` (:189-196) then returns `m.a` for desk "away" and `m.b` for desk "home" with no record of the swap. The comment at :194 says the team "still reads its own bar"; the code does not do that.
- Impact (profit): on a neutral-site football game, or any game the source lists in the other order, the public-money lean shown against each side is inverted. That is the one number on the chip a user fades or follows.
- Fix: have `findGameSplits` return `{ game, swapped }` and flip `a`/`b` for ml and spread when swapped.

**G2-10 — medium — the scrape breaks silently and can serve numbers up to about 50 minutes old with a fresh-looking timestamp**
- Evidence: positional parsing `splits.ts:76-108`; HTTP 200 on failure `route.ts:29-35`; error dropped `use-splits.ts:35-36`; stacked caches `route.ts:27`, :38-40; `fetchedAt` set at response time.
- Impact (reliability): a markup change either removes every chip without an error anywhere, or (if the two bars swap order) swaps bets and money with no check. Staleness is invisible.
- Fix: return 502 on parse failure and show a "splits unavailable" note; sanity-check each pair (a + b within 98-102); stamp `fetchedAt` from the upstream `date` header or inside the cached fetch; add an `AbortSignal.timeout`.

**G2-11 — low — MLB doubleheaders and loose name matching pick the first card**
- Evidence: `splits.ts:180` (`hits[0]` when no kickoff); `app/games/page.tsx:229` and `mlbLegSplit` (`splits.ts:201-222`) pass no kickoff; `teamsMatch` (:154-162) accepts any `endsWith` suffix of 4+ characters.
- Impact (profit): game 2 of a doubleheader shows game 1's split; a suffix collision can attach another game's split.
- Fix: pass the game start to `findGameSplits` on every MLB call; require a full-token match rather than a suffix.

### B3. Push alerts — `app/api/push/route.ts`, `app/api/push/test/route.ts`, `src/lib/server/push.ts`

#### What the code does today

- Auth: `POST`/`DELETE /api/push` and `POST /api/push/test` require `syncAuthed` (constant time) (`app/api/push/route.ts:24`, :33; `test/route.ts:9`). `GET /api/push` is public and returns only `configured` and the VAPID public key (:13-21). Subscription validation requires an `https://` endpoint under 1000 chars and bounded keys (`push.ts:68-74`). This is sound.
- Subscriptions: one JSON array at `pl:push:subs:v1`, read-modify-write, capped at 10 newest (`push.ts:76-87`).
- Sending: `notifyNewBets([sport])` runs after each lock write (`app/api/generate/route.ts:650`, `app/api/scheduler/route.ts:266`, `src/lib/server/football-lock.ts:761`, :880). Per ticket: skip if a terminal record exists, take a 60 s NX lease, send, **then** write the record `pl:push:t:<key>` (TTL 21 days) (`push.ts:165-187`). Only a `failed` record sets `pl:push:retry:v1` (:187); the scheduler poke re-sweeps only when that key exists (:211-216, `scheduler/route.ts:143`).
- The service worker shows the notification with `tag = alert key` (`public/sw.js:52-66`), so a repeat of the same alert replaces the first instead of stacking.

#### Findings

**G2-12 — medium — an alert is lost when the store errors during the pass, because the retry flag is only set on a failed send**
- Evidence: `push.ts:169` (lease SET) and :183 (record SET) can throw; the throw lands in the per-sport catch at :193-196, which sets `rep.error` and does not set `RETRY_KEY`; :187 is the only writer of `RETRY_KEY`; `retryFailedAlerts` returns at :213 when the key is absent.
- Impact (reliability): a found bet locked during a store hiccup gets no alert unless another bet in the same sport locks within 12 hours (`ALERT_WINDOW_MS`, :35). The last bet of a night is the likely casualty. If the throw is at :183 (after a successful send) the next pass re-sends instead.
- Fix: set `RETRY_KEY` in the catch at :193 as well (best effort), and write a provisional record before the send.

**G2-13 — low — duplicate and partial-delivery edges**
- Evidence: record written after the send (`push.ts:176-183`) with a 60 s lease (:40) and no send timeout (`webpush.sendNotification` options at :95 carry no `timeout`) -> a slow push service outlives the lease and a second pass re-sends; `delivered > 0` marks the ticket `sent` even when other devices failed (:177); add/remove/prune are unsynchronised read-modify-writes of one key (:76-87, :122-125); `slice(-MAX_SUBS)` drops the oldest device without telling it (:78).
- Impact (reliability): occasional double buzz (the shared tag hides it visually), a second device that silently misses an alert, and a device that believes it is subscribed after being pruned.
- Fix: pass `timeout: 10_000` to web-push; record per-endpoint delivery; return the dropped endpoint from `addSub`.

### B4. Stats fan-out routes — `app/api/mlb/hit-rates/route.ts`, `app/api/stats/window/route.ts`, `app/api/pvt/route.ts`

#### What the code does today

- All three are unauthenticated, free-statsapi only, no Odds credits, no `maxDuration`, no fetch timeout, no rate limit.
- `POST /api/mlb/hit-rates`: up to `MAX_PLAYERS = 400` names (:21, :84-87), resolved against the player index, fetched in chunks of 40 ids (:20, :59-73) **sequentially**, each a `people?personIds=…&hydrate=stats(gameLog)` call. Per-instance memory cache 10 min (:19, :27); Next data cache keyed by the exact chunk URL (:65). One failed chunk fails the whole request with 502 (:66, :105-107).
- `GET /api/stats/window`: `group` (2) x `n` (3 each: 7/15/30, 3/5/10 — `src/lib/stats-window.ts:33-36`) x `season` 2015-2030 (:56-57) = 96 distinct keys. Each uncached key = one league season list (`limit=2500`, :60-62) + one `people` hydrate per 400 ids (:24, :39-46; the file's own note says 845 pitchers is about 3 MB upstream) + a game-log hydrate for some starters (:67-68). Edge cache 180 s (:71).
- `GET /api/pvt`: `?pitchers=1` = 30 roster calls in parallel (:27-31); `?pitcher=<id>&team=<id>` = roster + person + team + one `vsPlayer` call per active hitter (:42-55). `pitcher` is any integer up to 9 digits (`src/lib/pvt.ts:58-60`); team must be one of 30. No cache header on the response; upstream calls revalidate at 1800 s.
- Client use: `useHitRates` sends one sorted, de-duplicated list per board (`src/lib/mlb/useHitRates.ts:15-43`) and exposes `error`.
- Hit-rate maths (`src/lib/prop-hit-rate.ts`) is a plain count: over = `v > line`, under = `v < line` (:96), hitters need an at-bat (:88), pitchers a start (:80). Checked by hand: line 1.5 total bases, games [2,0,4,1] -> over 2 of 4 = 50%, under 2 of 4. Correct.

#### Findings

**G2-14 — medium — an anonymous caller can drive large statsapi fan-outs from the app's own egress, the same source grading and live state depend on**
- Evidence: `app/api/mlb/hit-rates/route.ts:21`, :59-73 (10 sequential multi-player game-log calls per request; reordering names changes chunk URLs and defeats the data cache); `app/api/stats/window/route.ts:56-68` (96 keys, each several multi-MB calls); `app/api/pvt/route.ts:33-55` with `src/lib/pvt.ts:58-60` (about 16 upstream calls per (pitcher, team), pitcher id unbounded -> effectively unlimited distinct keys).
- Impact (reliability/spend): no credits, but function time and bandwidth are billed, and sustained abuse risks statsapi throttling the deployment — which would also stall grading, live tallies and lineups. Nothing here is rate limited.
- Fix: clamp `season` to the current and previous year; validate `pitcher` against the cached pitcher list before fanning out; cap hit-rates to the board's size (about 150) and sort ids before chunking; add `AbortSignal.timeout` and a small per-IP limiter (an NX counter per IP per minute on the existing store helper is enough; no rate-limit library is in `package.json` today).

**G2-15 — low — hard-coded 2026 season constants will silently serve last year's logs as "last N games" when the 2027 season opens**
- Evidence: `src/lib/mlb/player-index.ts:10` (`MLB_SEASON = 2026`, used by hit-rates at `route.ts:63`), `app/api/pvt/route.ts:15`, `app/api/player/route.ts:15`, `app/api/stats/window/route.ts:56` (default 2026).
- Impact (profit): from opening day 2027 the L7-L120 hit rates, player cards and windows read the end of 2026 with no warning.
- Fix: derive the season from the Pacific date (roll over on a fixed spring date) in one shared helper.

**G2-16 — low — one failed 40-id chunk blanks every hit rate on the board**
- Evidence: `app/api/mlb/hit-rates/route.ts:66` (throw on any non-OK chunk), :105-107 (502 for the whole request).
- Impact (reliability): a single statsapi hiccup removes the hit-rate column for all players until the retry.
- Fix: catch per chunk and return the players that did load, plus a `partial: true` flag.

### B5. Freshness helpers — `src/lib/board-stale.ts`, `src/lib/liveNow.ts`, `src/lib/game-time-window.ts`

#### What the code does today

- `boardStale` (`board-stale.ts:66-85`) is about **lineup coverage only**: stale needs coverage under 50%, cache older than 30 min, first pitch within 4 h, and a lineup window that opened after the board was built. `MAX_AUTO_RUNS_PER_DAY = 0` (:64), so it only ever drives a prompt (`src/lib/engine-client.ts:209-225`, :329-341). It says nothing about price age; that is a separate guard.
- `useLiveNow` (`liveNow.ts:97-214`) polls statsapi from the browser: one schedule call per date (max 4), then boxscores for live games first, then finals, capped at 16; 60 s while anything is live, 300 s otherwise, stops when all are final (:180-183).
- `game-time-window.ts` maps a start to a Pacific wall-clock hour with a 4,096-entry cache; an unparseable start is excluded once the slider is narrowed (:41-45).

#### Findings

**G2-17 — low — one failed schedule read blanks every live number and drops the poll from 60 s to 5 minutes**
- Evidence: `liveNow.ts:72-79` (any failure -> null), :133-137 (no games recorded for that date), :179 (snapshot replaced with the empty set), :180-183 (`anyLive` false -> 300 s timer).
- Impact (reliability): mid-game, a single network blip removes "now 2 H · Bot 5" from every surface for five minutes; legs that had been marked settled lose that read until the next tick.
- Fix: on a failed schedule read keep the previous `games` for that date and retry at the 60 s cadence.

**G2-18 — low — smaller live-state edges**
- Evidence: `liveNow.ts:114` falls back to the **UTC** date when a leg has no date (after 5 pm Pacific that is tomorrow, so tonight's games are not found); :145 treats "Delayed Start" as live, so `legPhase` (:234-240) reports "live" for a game that has not begun; a postponed game is neither live nor final (:145-146), so `allFinal` (:181) is never true and the page polls every 5 minutes indefinitely.
- Impact (reliability): missing live numbers in the evening for undated legs; a pregame leg labelled live; needless polling.
- Fix: use the Pacific date helper; exclude `/delayed start/` from `live`; treat postponed/cancelled as terminal for polling.

No finding on `game-time-window.ts` or `board-stale.ts` beyond the notes above.

---

## C. Front end, efficiency, security

### What the code does today

- **Engine by eval.** `src/engine/legacy-src.gen.ts` is a 298,943-byte generated file holding the legacy script as one string
  (built from `legacy/index.html` by `tools/extract-engine.mjs`). `createEngine` (`src/engine/index.ts:226-316`) builds DOM/storage/timer
  stubs and runs it with `new Function(...)` whose body calls direct `eval(__src)` (:276-289), then exposes `get: eval(n)` and
  `set: eval(n + " = …")` (:287-288). Timers are stubbed to no-ops (:283); `fetch` is a failed-response shim (:260-267).
  It is instantiated once per browser session (`src/lib/engine-client.ts:109-111`) and once per server call in
  `app/api/generate/route.ts:392` and `app/api/scheduler/route.ts:248`. Every `get`/`set` caller passes a literal name (grep found no dynamic names).
- **Media.** `public/media/backdrop-llama.mp4` is 5,339,753 bytes and is **not referenced** by any file in `app/`, `src/` or `public/sw.js`;
  `src/components/shell/VideoBackdrop.tsx:5` renders the 166,131-byte `llama-forward-20260922.jpg` only.
  `/media/*` gets `Cache-Control: public, max-age=31536000, immutable` (`next.config.ts:16-21`).
- **Headers / middleware.** `next.config.ts` sets only that one header. There is no `middleware.ts` and no `headers` block in `vercel.json`.
  No CSP, frame-ancestors / X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy or HSTS is set by the app.
- **Service worker** (`public/sw.js`): never touches `/api/` (:23), so it cannot serve stale data; navigations are network-first (:25-36);
  only `/_next/static/` and png/woff are cached (:38-49); push handler and click-through at :52-79. Cache-name and update issues are already E3-10 / E3-11.
- **Auth helpers** (`src/lib/server/store.ts`): `syncAuthed` (:78-84, `x-pl-sync` vs `LEDGER_SYNC_KEY`), `cronKeyAuthed` (:92-98, `?key=` vs `CRON_SECRET`),
  `cronHeaderAuthed` (:108-123, `x-cron-key` or `Authorization: Bearer`). All three hash both sides with sha256 and use `timingSafeEqual`, and fail closed when the env var is missing.
  22 route files use them. The only weaker compares are the two `APP_PASSCODE` checks (`app/api/sharp/route.ts:70`, `app/api/odds/route.ts:49`), both skipped when the env var is unset.
  Of the 29 route files with no helper, the ones that cost something are `/api/odds` (E2-2), `/api/sharp` (G2-1), the football props routes (E2-9) and the free fan-outs in G2-14.
- **Calc** (`src/lib/calc-math.ts`, `app/calc/page.tsx`): pure functions on the user's own prices. See the hand check below.
- **Simulator / Ballpark / PlayerSheet**: Simulator shows in-memory sims from this browser's own model run (`app/simulator/page.tsx:46-52`) and says so;
  Ballpark reads today's schedule weather (5-minute cache) plus `/model/priors.json` (`app/api/mlb/ballpark/route.ts:33`, :44, :63);
  PlayerSheet and `player-card.ts` read statsapi only (5-minute TTL) and show no board prices or probabilities.

### Betting arithmetic — hand check of `src/lib/calc-math.ts`

| Function | Formula in code | Worked example | Result |
|---|---|---|---|
| `americanToDecimal` (:16-19) | `am > 0 ? 1 + am/100 : 1 + 100/-am` | +150 -> 2.50; -110 -> 1 + 100/110 = 1.9091; -100 -> 2.00 | correct |
| `decimalToAmerican` (:22-25) | `dec >= 2 ? (dec-1)*100 : -100/(dec-1)` | 2.50 -> +150; 1.9091 -> -110; 1.50 -> -200; 2.00 -> +100 | correct |
| `parlayDecimal` (:33-35) | product of legs with decimal > 1 | -110, -110, +150 -> 1.9091 x 1.9091 x 2.5 = 9.1116 (+811) | correct |
| `payout` / `profit` (:49-58) | `round(stake*dec*100)/100`, `round((stake*dec - stake)*100)/100` | $10 at 9.1116 -> pays $91.12, wins $81.12 | correct, rounded once |
| `impliedProb` (:38-41) | `1/dec` | 9.1116 -> 10.97% | correct (vig included, as labelled) |
| `evPct` (:64-67) | `(p*dec - 1)*100` | p = 0.12 at 9.1116 -> +9.34%; p = 1/dec -> 0% | correct |
| `jointProb` (:70-74) | product of confidences | 0.5 x 0.5 x 0.48 = 0.12 | correct under independence |
| `ladder` (:90-101) | cumulative product in entry order | rung 2 = 3.6446, rung 3 = 9.1116 | correct |
| push handling (:28-30; page :103-106) | pushed leg removed | 3 legs, one push -> priced as a 2-leg ticket | matches book rule |
| `fairML` (`app/simulator/page.tsx:22-25`) | `p >= .5 ? -100p/(1-p) : 100(1-p)/p` | 0.60 -> -150; 0.40 -> +150 | correct |

There is **no hedge, arbitrage or Kelly code** in `src/lib/calc-math.ts`, `app/calc/page.tsx` or `src/components/calc/` (grep for kelly / hedge / arbitrage returns nothing). Kelly staking lives in the engine and the lock paths, outside this gap's files.

### Findings

**G2-19 — medium — the app sets no security headers and has no middleware, while the write credential lives in `localStorage`**
- Evidence: `next.config.ts:15-22` (one `Cache-Control` rule only); no `middleware.ts`; sync phrase read from `localStorage` (`src/lib/ledgerSync.ts:50-52`) and sent as `x-pl-sync` on spending routes.
- Mitigating fact: no `dangerouslySetInnerHTML` / `innerHTML` in `app/` or `src/` outside the engine stubs, so the present script-injection surface is small.
- Impact (security): the site can be framed (clickjacking over "Lock in" and Refresh), and any future injected script can read the phrase that authorises ledger writes and paid pulls. There is no second line of defence.
- Fix: add `headers()` for `/:path*` with `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`, and a report-only CSP first (it must allow `'unsafe-eval'` until G2-20 is addressed).

**G2-20 — low — the model runs through `new Function` + direct `eval` of a 299 KB string, in the browser and on every server run**
- Evidence: `src/engine/index.ts:276-289`, :283 (timers stubbed), :287-288 (string-eval accessors); `src/lib/engine-client.ts:6`, :109-111 (ships in the client bundle); `app/api/generate/route.ts:392`, `app/api/scheduler/route.ts:248` (re-evaluated per call).
- Cost: about 300 KB of extra client JavaScript that the browser cannot pre-compile or code-cache, parsed on the main thread at first use; a full re-parse on each server generate. Not measurable offline; small next to a generate run.
- Risk: forces `'unsafe-eval'` in any CSP; no type checking, source maps or tree-shaking for the pricing code; any legacy path that relied on `setTimeout` silently never runs. Injection risk today is nil (source is build-time, names are literals).
- Fix: keep as is for parity, but record it as the reason a strict CSP is not possible; longer term, emit the legacy script as a real module at build time (`tools/extract-engine.mjs` already owns the extraction).

**G2-21 — low — a 5.3 MB video nobody loads is still deployed, and `/media` is cached for a year on names that are not content-hashed**
- Evidence: `public/media/backdrop-llama.mp4` (5,339,753 bytes), no reference in `app/` or `src/`; `src/components/shell/VideoBackdrop.tsx:5` uses the jpg; `next.config.ts:16-21` (`immutable`, one year).
- Impact (efficiency): dead weight in every deploy; and replacing any `/media` file under the same name will not reach returning devices for a year.
- Fix: delete the mp4 (owner's call); keep the date-in-filename habit the jpg already follows for anything under `/media`.

**G2-22 — low — Parlay Calc: duplicate React keys after a reload, and a confidence field that jumps between percent and fraction**
- Evidence: `app/calc/page.tsx:59-60` (`let nextId = 3` at module level) while legs and extras are restored from `localStorage` (`src/lib/use-session-state.tsx:11-12`; page :65-71) and used as keys (:179) — a restored ticket with ids 1-4 gets a second id 3 on "+ a leg". `src/lib/calc-math.ts:145-146`: "0.9" is read as 90% but "1.5" as 1.5%.
- Impact (profit/reliability): the key clash can attach focus/animation to the wrong leg card (values are index-driven, so the maths stays right). Typing "0.9" meaning 0.9% yields a wildly positive EV tile.
- Fix: seed `nextId` from `max(extras.id) + 1`; treat every entry as a percent, or show the parsed percent next to the field.

**G2-23 — low — the EV tile multiplies leg confidences as if independent, without saying so**
- Evidence: `src/lib/calc-math.ts:70-74`; `app/calc/page.tsx:112-113`; footer copy at :235 says only "Straight multiplication of your own prices".
- Impact (profit): for same-game or otherwise correlated legs the "true probability" and EV are wrong in a direction the user cannot see.
- Fix: one line of copy under the tile: "assumes the legs are independent".

**G2-24 — low — Ballpark says its multipliers are "exactly as the engine applies" them, but it reads current weather while a stored board keeps the weather from its build time**
- Evidence: `app/ballpark/page.tsx:249` (copy); `app/api/mlb/ballpark/route.ts:33` (schedule weather, 300 s revalidate), :63 (edge cache 300 s + 600 s stale).
- Impact (reliability): after a weather update the tab and the board (or a locked card) disagree with no "as of" on either.
- Fix: print the weather timestamp on the tab and the board's build time beside it, or soften the copy to "as the engine would apply it now".

---

## Summary

1. `/api/sharp` is the one paid route with no working caller and no bound: about $5.40 worst case per call, open to anyone if the key is set and the passcode is not (not knowable from disk; one empty POST would tell).
2. MLB live in-play has no finite credit rail left: the phone's own read and the Refresh tap both spend, taps wipe the re-buy windows, and every rail fails open on a store error.
3. Scraped betting splits can show the wrong side's numbers on swapped matches and fail or go stale silently; push alerts can be lost on a store error because the retry flag is only set on a failed send.
4. Auth helpers are sound (constant-time, fail closed); the gaps are the two plain `APP_PASSCODE` compares, zero security headers, and unauthenticated free fan-out routes.
5. Parlay Calc arithmetic is correct on every formula checked by hand; there is no hedge, arb or Kelly code in those files. Front-end issues are minor (dead 5.3 MB video, eval-loaded engine, small UI bugs).
