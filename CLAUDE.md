# CLAUDE.md — Parlay Lab

Context for continuing development of **PARLAY//LAB**, a single-file multi-sport stat desk + parlay/bet-slip tool (MLB · NFL · NCAAF).

## What it is
A self-contained web app and installable PWA. A top sport bar switches between **MLB / NFL / NCAAF**; each sport has a live stat desk and a betting odds board. A bottom tab bar switches **Stats / Odds / Slip** (the bet slip with parlay math is shared across sports). Deployed to **GitHub Pages: https://jbravvvv.github.io/parlay-lab/** (repo `JBravvvv/parlay-lab`, public) — push to `main` and Pages redeploys. Tested live on iPhone via Add to Home Screen.

## Golden rules
1. **`index.html` is the entire app and the only source of truth.** All HTML, CSS, JS, and the baked-in MLB snapshot live inside it. No framework, no build step. Keep it that way.
2. **Bump the build number on every change.** Footer reads `build N · YYYY-MM-DD` (current: **build 22**). After deploying, confirm the footer number in the live app — stale cache is always the first suspect, not a code bug. **Also bump `CACHE` in `sw.js`** (current `parlay-lab-v3`) whenever `index.html` or any shell asset changes, or installed apps keep serving the old build.
3. **Validate before handing off.** Extract the inline script and parse-check it. **Node is not installed on this machine** — use JavaScriptCore instead:
   `jsc -e "try{new Function(readFile('script.js'));print('OK')}catch(e){print(e)}"` where `jsc` = `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`.
4. **Preserve live data.** Must be served over http(s) — `file://` breaks all fetches. Local dev: run `serve.command` (or `python3 -m http.server 8790`) → http://localhost:8790.
5. **Never fabricate stats or odds.** Test any new endpoint with curl before wiring it in.

## Files
- `index.html` — the app.
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon*.png` — PWA shell (added build 20).
- `serve.command` — one-click local dev server.

## Architecture (inside index.html)
Vanilla JS. Key state:
- `SPORT` — `'mlb'|'nfl'|'cfb'`, persisted in localStorage `pl_sport`. The `SPORTS` registry holds each sport's label, Odds-API key, stat groups, seasons, prop markets, and odds-board modes. `switchSport()` resets sport-specific state (bet slip persists).
- `S` — stat desk: `scope` (`ind`|`team`), `group`, `season`, `team`, `timeframe` (MLB only), `position`, `minVal`, `sort`, `picked`, `query`, `cache` keyed by `ckey()` = `sport-scope-group-timeframe-season`.
- `OB` — odds board: `mode` (`ml`|`spread`|`props`), `games`, `game`, `market`, `rows`, `ncaa` (the game-card rows for ML/spread views — legacy name), `seq` (stale-response guard).

### Stat desk
- Groups: MLB = Hitting/Pitching; NFL/NCAAF = Passing/Rushing/Receiving. Individual + Team scopes for all sports. Football is season-scope only (timeframe select hidden); seasons 2026/25/24/23 — each sport's `defSeason` (football: 2025, the last completed season) is the default; seasons above it are labeled "· upcoming" and show a "hasn't kicked off yet" empty state until ESPN starts returning rows (verified: ESPN returns HTTP 200 with 0 athletes/teams for 2026 pre-kickoff).
- **MLB data** — MLB Stats API (`statsapi.mlb.com`), season + byDateRange; individual 2026 has baked snapshot fallback (`SNAP_HIT`/`SNAP_PIT`); team mode live-only.
- **Football data** — ESPN (no key):
  - Athletes: `site.web.api.espn.com/apis/common/v3/sports/football/{nfl|college-football}/statistics/byathlete?...&category=offense:{group}&sort={group}.{group}Yards:desc&season=YYYY&seasontype=2&isqualified=true&limit=350`
  - Teams: same host `/statistics/byteam?...season=YYYY&seasontype=2` — **NCAAF byteam requires `&group=80`** (FBS) or it 500s.
  - Parsing: `parseFootball()`/`fbZip()` zip each entity category's `totals` against the response's top-level `labels` by category name; team categories come as Own/Opponent pairs — we use "Own"; duplicate labels resolve last-wins. Columns in `FB_COLS` are label-keyed; values are ESPN's preformatted strings, so sorting/min-filter go through `statNum()` (strips commas).
- Fetches try direct then allorigins/corsproxy (`fetchSeq`), with a parse fn captured per request.
- Team logos: MLB + NFL via ESPN CDN (`logoImg`); NCAAF text-only (130+ programs).

### Odds board (The Odds API; NCAA **baseball** was removed in build 21)
- Modes per sport: MLB = ML | Props; NFL/NCAAF = ML | **Spreads** | Props. `obLoadML(mode)` is the generalized game-card loader (`h2h` or `spreads` markets; spread points shown next to team, included in the slip leg as "Spread +3.5 vs Opp").
- Sport keys: `baseball_mlb`, `americanfootball_nfl`, `americanfootball_ncaaf`.
- Props: per-event endpoint; markets per sport — MLB: HR/Hits/TB/H+R+RBI/Ks; football: Anytime TD (`player_anytime_td`, yes/no like Anytime HR), Pass Yds/TDs, Rush Yds, Receptions, Rec Yds. Caesars (`williamhill_us`) preferred, **falls back to any US book** with a note. Default game skips already-started events (started games 404 on the props endpoint). Off-season/far-out games: ML+spreads post early; player props post near kickoff — the empty-state note says so.
- Key embedded as `ODDS_KEY_DEFAULT` (overridable via gear → `pl_oddskey`). It is public in the source (accepted trade-off); rotate if quota drains. `x-requests-remaining` response header shows quota.

### App shell (build 20)
Sticky glass app bar (status pill + spinning refresh) · top sport bar (build 21) · bottom tab bar Stats/Odds/Slip with leg-count badge · safe-area insets · service worker caches the shell (network passthrough for all API calls).

### Bet slip
Legs persist in `pl_legs`; combined parlay odds/payout/EV; Nevada book quick-links. Shared across sports.

### The Sharp (builds 23–24) — daily MLB prop board
Fourth bottom tab. Two engines share one slate collector (`shCollectSlate`: statsapi schedule with `hydrate=probablePitcher,weather,lineups,venue`, Odds API h2h+totals + 5 prop markets per un-started game ≈80 quota credits/run, 7/15/30-day player form filtered to slate players, gaps disclosed in `data_gaps` — umps/xStats/BvP/movement; never fabricate) and one renderer:
- **Built-in model (default, free, no key)** — `shAnalyzeLocal()` (build 25 shape): returns `{overview, categories, parlays, trap}`. **Categories** (`ml`, `rl`, and the 5 prop markets) are non-overlapping ranked lists — each sorted by win probability desc, **top 50/day**, one row per game (ML/RL: the likelier side) or per listed prop (the likelier side). Props: recency-weighted per-AB/per-game rates → Poisson (compound hit-mix for Total Bases), adjusted for opposing-starter WHIP/ERA, lineup spot → expected ABs, Coors, 10+ mph wind. **ML/RL**: light game model (lineup TB/AB offense + starter blended ERA, `0.52+(oH−oA)×1.5+(eA−eH)×0.045`) blended 50/50 with the vig-removed market; RL cover prob via `mapCover(F)=clamp(F×0.72−0.015)`; falls back to pure market (edge ~0) until lineups/probables post. All probabilities shrunk 45% toward market (knob tuned 2026-07-07: raw Poisson over-loved TB unders). **Parlays** (may reuse solo picks — intentional): high-floor 2/3-leg, value 3-leg (edge-sorted), cross-category 3-leg, plus-money 3-leg; combined odds/probability computed; same-game legs flagged correlated. UI: sub-nav SUGGESTED PICKS (category chip row) / SUGGESTED PARLAYS (`SH.view`/`SH.cat`); parlay cards have add-all-legs. Claude mode still returns the legacy 15-pick shape — `shRender()` branches on `data.picks` vs `data.categories`.
- **Claude mode (optional)** — system prompt **`prompts/mlb_prop_handicapper_prompt.md`** (fetched at runtime; sw serves `/prompts/` network-first) + slate as user message to `claude-opus-4-8` (adaptive thinking, `output_config.format` json_schema). **Key is user-supplied via ⚙ (localStorage `pl_claudekey`) — never embed one in source**; browser calls need the `anthropic-dangerous-direct-browser-access: true` header; handle `stop_reason` `refusal`/`max_tokens`. ~$0.30–0.60/run.
Both produce the same JSON shape → `shRender()`; board persists per-day in `pl_sharp`; picks add to the slip with model probability pre-filled as EST WIN % to drive the EV math.

## Deploy workflow
Edit `index.html` → bump footer build number → bump `sw.js` CACHE if shell changed → validate JS (jsc) → commit → `git push` → wait ~1 min → open https://jbravvvv.github.io/parlay-lab/ → **confirm footer build number**. (Legacy Netlify drag-and-drop target `parlaylab-jbravvv.netlify.app` still exists but Pages is primary.)
