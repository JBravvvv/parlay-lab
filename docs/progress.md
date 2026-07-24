# Progress — 2026-07-24 (session end)

## Status: parlay-lab-hardening-instructions.md — ALL 4 PHASES DONE, deployed
Live at parlay-lab-six.vercel.app (branch frontend-rebuild = Vercel prod).
Commits 9793d2c → 18ec6ad. 242/242 tests, baseline43 parity digest intact.
Phases 1–3 approved by Josh individually; Phase 4 run on his "run the rest".

## What shipped this session
- P1: bankroll adjustment log (pl_bank2) cloud-syncs — mergeBankStores append-only
  union in src/lib/bankroll.ts, server blob pl:bank:v1 on /api/ledger, pull-merge-push
  in ledgerSync.ts. One converged bankroll feeds Kelly + the 10% cap everywhere.
- P2: CLV report — entries stamp selMode at lock; src/lib/clv-report.ts (fairPts =
  closing consensus fair − locked imp; czCents seam-free); Stats → CALIBRATION ClvPanel
  (mean+n+SE, by-market, 30d trend, filters); docs/clv.md. No backfill, starts clean.
- P3: override accountability — synced pl_noplay verdict log (pl:noplay:v1; Builder
  marks the NO-PLAY banner, write-once/day); discipline() in src/lib/noplay.ts; Stats
  DisciplinePanel, Dashboard month-override one-liner, red OVERRIDE tags on Ledger.
- P4: docs/collection-period.md — FREEZE through late Aug 2026; exits = ~150 graded
  HRR O0.5 legs (→ deferred HRR sim recal project) or 60 days (≈2026-09-22); every
  frozen parameter's deployed value tabled there for drift detection.

## Post-freeze addition (Josh's explicit request, display-only — no frozen param touched)
- "Parlay Builder" nav tab (/props): Caesars-style sandbox prop board from the cached
  engine board (games/batter/pitcher tabs, market pills, per-game cards, True Win %
  beside each CZ price) + bottom ticket slip (combined odds, naive true %, EV, payout).
  Never locks, never enters the ledger. src/lib/ticket-math.ts + app/props/page.tsx.

## Parlay Builder coverage fix (2026-07-24, Josh: "only showing certain players odds")
The sandbox was reading the engine's ranked `categories`, which are the SELECTION pool:
top 50 rows per market by win probability, ONE side per line, and only players past the
model's filters (25+ AB in 30 days; scratched-from-a-posted-lineup returns early). On
the 6-game fixture that showed 50 of 133 posted anytime-HR prices and 50 of 81 hits rows
— on a 15-game slate it is far worse. Right pool for picking plays, wrong one for
browsing a book.
- Engine (`legacy/index.html` → `node tools/extract-engine.mjs`): new `data.propBoard`,
  built from the RAW slate after finalizeCats — every game, every market, every player,
  every line, BOTH sides, uncapped. Rows carry best-price + book, the Caesars quote,
  `pO` (the engine's own model % for that line when it priced it) and `fO` (de-vigged
  market fair). Caesars milestone ladders now ride along on the slate (`slate.props[].alt`)
  and appear as ALT rows, de-duped against standard rows (integer rung n → n−0.5).
  Additive + display-only: `categories`, parlays, allocator, ledger and the parity digest
  are untouched (parity green), and NO frozen parameter moved.
- UI (`app/props/page.tsx`): player props render from propBoard — two price buttons per
  row (Over/Under with per-side %), player search, per-game counts, book tags (DK/FD/CZ…),
  ALT + PROJ + "market price only" tags, and market-fair legs shown italic with a slip
  note that their EV is ~0 by construction. Boards cached before this deploy lack
  `propBoard` → honest "regenerate" panel instead of silently showing the old 50.
- `tests/prop-board.test.ts` (10) pins full coverage, no dupes, the model-% match against
  categories, the ladder normalisation/de-dupe, and that categories stay ≤50 with their
  EV layers. 255 tests total.

## THE EXACT NEXT STEP: NOTHING. The freeze is on.
Only sanctioned work: bug fixes with Josh's sign-off; the HRR sim recalibration when
an exit condition fires. Do not tune weights/gates/caps — check collection-period.md.

## Gotchas for the next session
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest.
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; `npm run build:local`;
  `git pull --rebase origin frontend-rebuild` before push; purge iCloud dupes with
  `find . -name "* [0-9].*" -not -path "./node_modules/*" -delete`.
- Browser pane: unfocused clicks/form_input may not fire React handlers — DOM .click().
