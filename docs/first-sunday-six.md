# First Sunday Six: historical evidence and price capture

Caesars public market inspected September 20, 2026: 267 distinct selections. Stored prices are a dated capture, not an automatic live feed; manual replacement is supported per date/device. No prices are invented from Anytime TD markets. Full field includes selections without unique current First TD estimates; these remain ungraded.

Source: https://sportsbook.caesars.com/americanfootball?id=007d7c61-07a7-4e18-bb40-15104b6eac92 . Visible market rules confirm earliest touchdown by game time across Sunday early games. $500K/$10/token details are owner-supplied; full official eligibility, tie, expiry and cap terms remain unverified. No wager, token action, or ledger allocation is performed.

## Historical archive

Official nflverse releases: https://github.com/nflverse/nflverse-data/releases/tag/pbp . Schedule: https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv . Players: https://github.com/nflverse/nflverse-data/releases/tag/players . Preserve upstream attribution; these derived data are provided for analysis with source links and checksums.

Scope: every completed regular-season and postseason game in the downloaded 2016–2026 data, with 2026 limited through Week 2. Preseason excluded. Snapshot through September 17, 2026; Week 2 is incomplete. 2,778 games, 2,761 first TD scorers, 17 no-TD games, no missing PBP games/scorers/end clocks. One 2017 game first scored a TD in overtime; retained in archive, censored for regulation-clock model. 175 Sunday 13:00 ET regular-season slates, one tied earliest clock. Historical winners are reconstructed outcomes, not claims that this promotion existed then.

Use touchdown flags, excluding no-play rows; retain the first touchdown per game and its scorer GSIS ID. Scoring clock is drive_game_clock_end (end of scoring play), not the snap clock or wall-clock timestamp. Regulation elapsed = (quarter−1)*900 + 900−remaining. Overtime uses applicable 10/15 minute period. No-TD games remain in clock distributions as censored outcomes. CSVs expose snap and end clock provenance for audit. Defense/special-team scorers remain actual historical players rather than relabeled offensive players.

## Evidence and limitations

Clock candidate: empirical distributions by total <42, 42–<48, ≥48, shrunk with 50 pooled observations. Train 2016–2021, select 2022–2023; then train through 2023 and hold out 2024–completed 2026. Selection log loss: total bands 1.949 vs uniform 1.957 (36 slates). Held-out log loss: total bands 2.001 vs uniform 1.989 (36 slates); Brier .866 vs .862. Candidate failed release gate; deployed baseline uses pooled empirical clocks, equal across games. Tied outcome slates excluded from this evaluation; future-game/player prices were unavailable, so this is not an ROI backtest or a player probability calibration.

Race calculation integrates empirical exact-second first-TD distributions across ALL eligible games. Equal-clock probability is withheld until settlement rules are known. Game race chance is multiplied by current First TD market share; overfull game fields normalized, incomplete field residual left unassigned. Player/scoring-time independence is assumed. Current football fair values use existing disclosed market-consensus/assumed-overround behavior, not a separately trained player prediction. No unsupported true-probability claim. Current First TD quotes expire at three hours; estimates close at first kickoff and cannot use history dated on/after the predicted slate. Do not compare historical lines to today's projected totals as identical data sources; released baseline does not use either for differential weighting.

Cash grade uses existing EV thresholds, excludes bonus. Bonus-pool section is a sensitivity scenario with editable winner count, conversion fraction and pool. Winner popularity unknown; no promo-inclusive Kelly or guaranteed profit. Counts by player are descriptive, not exposure-adjusted rates.

## Rebuild

Download play_by_play_2016.csv.gz through play_by_play_2026.csv.gz from the official pbp release plus games.csv and players.csv into an input directory. Run `python3 tools/first-sunday-six-history.py INPUT_DIR OUTPUT_DIR`. Copy history.json to src/lib/nfl/first-sunday-six-history.json and output files to public/data/first-sunday-six. Check coverage, latest completed date and validation gates before release. Source PBP SHA-256 checksums are included in history.json. Raw 190MB PBP files are not committed. Rerun after Week 2 completes to add those outcomes; no future results are assumed.
