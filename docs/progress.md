# Progress — 2026-07-24 (hardening series)

## Status: parlay-lab-hardening-instructions.md (Downloads) — Phases 1–3 built
- Phase 1 (APPROVED, deployed 9793d2c): bankroll adjustment log cloud-syncs with the
  ledger — append-only union merge (mergeBankStores, de-dup ts+kind+amt+note), server
  blob pl:bank:v1 in /api/ledger, pl_bank2 is now a mirror of the cloud copy. Kelly +
  10% cap price off one converged bankroll everywhere.
- Phase 3 (deployed ca03a02, AWAITING Josh's approval): override accountability.
  Synced pl_noplay verdict log (pl:noplay:v1, append-only union by date; Builder
  records the NO-PLAY verdict on sight); pure discipline() in src/lib/noplay.ts;
  Stats Discipline panel (gated vs override, month+lifetime, NO-PLAY honored vs
  overridden), Dashboard month-override one-liner, red OVERRIDE tags on Ledger.
- Phase 2 (APPROVED, deployed 70dfa8e): CLV report. Legs already stored
  cz/bs/imp at lock; entries now stamp selMode. clv-report.ts: fairPts = closing
  consensus fair − locked fair (imp), czCents on seam-free cents scale; Stats →
  CALIBRATION gains a CLV panel (mean+n+SE, by-market, 30d trend, filters
  market/tier/direction/mode). docs/clv.md. No backfill — dataset starts clean.

## Next: Phase 4 (docs/collection-period.md freeze doc, no code) once Phase 3 is
approved: freeze through late August, exits = ~150 graded HRR O0.5 legs or 60 days,
list every frozen parameter's current value (SH_CFG floors/caps, selMode default,
suspensions, FUN_DEFAULT, BANK_BASE, dailyBankrollCap, SH_W, SH_EDGE_MIN).

## Gotchas (carried forward)
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest
  (236 tests incl. baseline43 parity digest).
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; build:local;
  `git pull --rebase origin frontend-rebuild` before push; purge iCloud dupes
  `find . -name "* [0-9].*" -not -path "./node_modules/*" -delete`.
- Frozen protections (never weaken without Josh): EV gate, HRR O1.5+/HR-parlay
  suspensions, CORE≤3/FUN≤4 legs, FUN $5/day, managed bankroll, 10% exposure cap,
  append-only ledger + bank log.
