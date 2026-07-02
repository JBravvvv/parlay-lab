# CLAUDE.md — Parlay Lab

Context for continuing development of **PARLAY//LAB**, a single-file MLB stat desk + parlay/bet-slip tool.

## What it is
A self-contained web app: a live MLB stat desk (player + team stats) on the left, a betting odds board (moneylines + player props) on the right, and a bet slip with parlay math. It runs as a PWA, is tested live on iPhone, and is deployed to Netlify at `parlaylab-jbravvv.netlify.app` by **drag-and-drop** (no CI).

## Golden rules
1. **`index.html` is the entire app and the only source of truth.** All HTML, CSS, JS, and the baked-in stat snapshot live inside it. No framework, no build step, no bundler — keep it that way so it stays droppable onto Netlify as one file.
2. **Bump the build number on every change.** The footer reads `build N · YYYY-MM-DD`. This is the canonical version check — after deploying, we confirm the footer number to know the new file actually loaded (stale cache is always the first thing to suspect, not a code bug).
3. **Validate before handing off.** After editing the inline script, extract it and run `node --check` to catch syntax errors. Confirm brace/paren/bracket balance.
4. **Preserve live data.** The app fetches from public APIs at runtime; it must be served over http(s), not opened as a `file://`, or CORS/fetch will fail.

## Files
- `index.html` — the app (current: build 19).
- `apple-touch-icon.png`, `apple-touch-icon-180.png`, `icon-512.png` — home-screen / PWA icons; keep alongside `index.html`.
- (`ParlayLab.jsx`, if present, is an OLD React preview ~build 12 — not part of the app. Ignore or delete.)

## Architecture (inside index.html)
Vanilla JS, two main state objects:
- `S` — stat desk state: `scope` (`ind`|`team`), `group` (`hitting`|`pitching`), `season`, `team`, `timeframe`, `position`, `minVal`, `sort`, `picked`, `query`, and a `cache` keyed by `ckey()` = `scope-group-timeframe-season`.
- `OB` — odds board state: `mode` (`mlbml`|`props`|`ncaaml`), `key`, `games`, `game`, `market`, `rows`, `ncaa`, plus loading/err/note flags.

### Stat desk
- Toggles: **Individual/Team** (amber, `scInd`/`scTeam`) and **Hitting/Pitching** (green, `tHit`/`tPit`).
- Filters row: search, team dropdown, **position** (individual only), **Min AB/G** (a dropdown that opens a small slider — AB 0–200 step 5, Games 0–50 step 1; individual only), **timeframe** (Last 7/15/30 Days, 2026 Season).
- Sortable columns; team logos render next to each name via `logoImg(abbr)` (ESPN CDN, with `ESPN_LOGO` overrides for ATH→oak, CWS→chw, etc.).
- Hitting columns end at K (order: G, AB, AVG, H, 2B, 3B, HR, TB, RBI, R, OBP, SLG, OPS, BB, K).
- **Data — MLB Stats API:**
  - Players: `https://statsapi.mlb.com/api/v1/stats?stats=season&group={hitting|pitching}&season={yr}&sportId=1&playerPool=All&limit=2500`
  - Teams: `https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group={hitting|pitching}&season={yr}&sportId=1`
  - Date ranges: `stats=byDateRange&startDate=&endDate=` (7/15/30 days).
  - `parseSplits()` handles both player splits (`s.player`) and team splits (`s.team`).
  - Individual + 2026 has a baked-in snapshot fallback (`SNAP_HIT`/`SNAP_PIT`). **Team mode is live-only** (no snapshot) — the endpoint params are the least-documented piece, so if team stats ever stop populating, check them first.

### Odds board
- Three tabs (in order): **MLB ML** (default landing), **MLB PROPS**, **COLLEGE ML** (`obModeMlb`/`obModeProps`/`obModeNcaa`).
- **Moneyline tabs** use one generalized loader `obLoadML(sport)` hitting The Odds API `h2h`:
  - `baseball_mlb` and `baseball_ncaa`, endpoint `/v4/sports/{sport}/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=`.
  - Renders game cards; tapping a team's moneyline adds a leg "Team · ML vs Opp".
- **Props tab:** custom game dropdown (team **logos + nicknames** via `TEAM_META`), market dropdown (Anytime HR, Hits O/U, Total Bases O/U, H+R+RBIs O/U, — separator —, Pitcher K's O/U), green Over / red Under buttons.
- **The Odds API key** is embedded as `ODDS_KEY_DEFAULT` (overridable via the gear → stored in `localStorage` `pl_oddskey`). Caesars is preferred (`williamhill_us`), else first book. `obFetchJson` tries a direct fetch then a corsproxy fallback and returns `{ok,status,body}`.

### Bet slip
- Legs persist in `localStorage` (`pl_legs`); computes combined parlay odds/payout. Nevada book quick-links.

### Layout & theme
- Two-column at ≥900px, single column below. Stats column is always slightly wider than the odds board: `1.12fr 0.88fr` at 900–1199px (landscape phone), `1fr 460px` at ≥1200px (desktop).
- CSS vars: `--green` (stats/values), `--amber` (team codes / Individual+Team toggle).

## Deploy workflow
Edit `index.html` → bump footer build number → validate JS → download → Netlify **Deploys** tab → drag the file → reopen app → **confirm footer build number**. If the site looks unchanged, it's almost always a stale file/cache, not code.

## Security note
The Odds API key is visible in the client source. Before any public repo/hosting, rotate it or move it behind a proxy. MLB Stats API and ESPN logo CDN need no key.

## Local dev
Serve the folder over http (e.g. `python3 -m http.server` or any static server) and open `index.html`. Do not open via `file://` — the API fetches need a real origin.
