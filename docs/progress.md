# Progress — 2026-07-24 (session end)

## Status: parlay-lab-fix-instructions.md — ALL 6 PHASES DONE, approved, deployed
Every phase approved by Josh, live at parlay-lab-six.vercel.app (branch frontend-rebuild
= Vercel prod). 225/225 tests, parity digest (baseline43) intact. Commits ada22a4→e4f7a40.
Read 00-READ-BEFORE-THE-FIX-FILE.md (Downloads) — its 4 corrections were applied.

## Beyond the fix file (Josh's direct orders, also done)
- Default selection mode = ev_gated @ CZ (dk_fd selectable; hrr suspension + consensus
  gate carried into ev_gated via consCzEv; Sharp gained a real ev_gated plays branch).
- 2026-07-22 autopsy: score-orientation fix ([bet team]-[opp] everywhere, grading.v=2
  migration ran on the live synced ledger — results untouched, zero misgrades found).

## Gotchas the next session must know
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest.
- New selection rules gate on selMode ev_gated/dk_fd; legacy modes stay byte-identical
  (that is how parity survives). Allocator test tickets need prob×dec−1 consistent with
  stated EVs or the Kelly ceiling zeroes stakes.
- Managed bankroll: pl_bank2 {base:2500, asOf, log[]} is PER-DEVICE localStorage, not
  cloud-synced; graded P/L rides the synced ledger so totals converge, adjustment logs
  don't. setMoney no longer accepts bankroll.
- iCloud creates "file 2.ts" dupes that break tsc — purge with find -name "* [0-9].*".
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; build via
  `npm run build:local`; `git pull --rebase origin frontend-rebuild` before every push.

## Exact next step (only open follow-up; NOT yet approved by Josh)
Sync pl_bank2 (bankroll adjustment log) across devices alongside the ledger: merge-by-ts
union of log[] inside src/lib/ledgerSync.ts pull/push, server blob key pl:bank:v1 in
app/api/ledger route, tests in tests/bankroll.test.ts. Ask Josh before building.
