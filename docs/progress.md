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

## THE EXACT NEXT STEP: NOTHING. The freeze is on.
Only sanctioned work: bug fixes with Josh's sign-off; the HRR sim recalibration when
an exit condition fires. Do not tune weights/gates/caps — check collection-period.md.

## Gotchas for the next session
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest.
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; `npm run build:local`;
  `git pull --rebase origin frontend-rebuild` before push; purge iCloud dupes with
  `find . -name "* [0-9].*" -not -path "./node_modules/*" -delete`.
- Browser pane: unfocused clicks/form_input may not fire React handlers — DOM .click().
