# Progress — 2026-07-24 (hardening series)

## Status: parlay-lab-hardening-instructions.md (Downloads) — Phases 1–2 built
- Phase 1 (APPROVED, deployed 9793d2c): bankroll adjustment log cloud-syncs with the
  ledger — append-only union merge (mergeBankStores, de-dup ts+kind+amt+note), server
  blob pl:bank:v1 in /api/ledger, pl_bank2 is now a mirror of the cloud copy. Kelly +
  10% cap price off one converged bankroll everywhere.
- Phase 2 (deployed 70dfa8e, AWAITING Josh's approval): CLV report. Legs already stored
  cz/bs/imp at lock; entries now stamp selMode. clv-report.ts: fairPts = closing
  consensus fair − locked fair (imp), czCents on seam-free cents scale; Stats →
  CALIBRATION gains a CLV panel (mean+n+SE, by-market, 30d trend, filters
  market/tier/direction/mode). docs/clv.md. No backfill — dataset starts clean.

## Next: Phase 3 (override accountability) then Phase 4 (freeze doc), each gated on
approval. Phase 3: Stats "Discipline" section (gated vs override count/staked/P-L/ROI,
NO-PLAY honored vs overridden — may need a noPlay flag stamped going forward),
Dashboard one-line override readout, Ledger override tag. Much exists already in
ledger-segments.ts (overrideDays); extend, don't duplicate.

## Gotchas (carried forward)
- After ANY legacy/index.html edit: `node tools/extract-engine.mjs`, then vitest
  (236 tests incl. baseline43 parity digest).
- env: export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; build:local;
  `git pull --rebase origin frontend-rebuild` before push; purge iCloud dupes
  `find . -name "* [0-9].*" -not -path "./node_modules/*" -delete`.
- Frozen protections (never weaken without Josh): EV gate, HRR O1.5+/HR-parlay
  suspensions, CORE≤3/FUN≤4 legs, FUN $5/day, managed bankroll, 10% exposure cap,
  append-only ledger + bank log.
