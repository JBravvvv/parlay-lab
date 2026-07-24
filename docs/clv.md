# CLV — closing line value (hardening Phase 2, 2026-07-24)

One page on exactly how CLV is computed, which prices feed it, and how to read it.

## Why CLV is the scoreboard

With a strict EV gate at a high-vig book, monthly ticket volume is too small for the
win/loss record to mean anything for months. CLV — the price we locked versus the market
just before first pitch — shows whether the engine finds real edge at sample sizes we
will actually have in weeks, not seasons.

**How to read it:** positive CLV through a losing stretch = the system is working (the
market keeps agreeing with us after we bet; results are variance). Negative CLV through
a winning stretch = luck, not edge. The mean, the count, and the standard error are shown
together; a mean inside ±1–2 SE of zero is noise, not a verdict.

## The prices that feed it

**Stored at lock, per leg** (in the locked ledger entry — frozen, append-only):

| field | meaning |
|---|---|
| `cz` | the executed Caesars price (american) — the price that settles |
| `bs` | the selection-basis price (DK/FD best, per the mode that picked the leg) |
| `imp` | the de-vigged multi-book consensus fair probability at lock (percent, oriented to the side we bet) |
| entry `selMode` | which selection mode built the card (stamped at lock from this deploy on) |

**Stored at the close, per leg** (`entry.clv[lid]`, written by the automated `/api/clv`
sighting job — cron every ~30 min during slate hours plus the in-app beacon):

| field | meaning |
|---|---|
| `am` | the last pre-pitch Caesars price |
| `bsAm` / `bsBk` | the last pre-pitch DK/FD basis price and book |
| `consensusFair` | the de-vigged multi-book consensus fair probability at that sighting, same side |
| `at` | when the sighting was taken |

The job structurally cannot sight a started game, so every stored close is honestly
pre-pitch. When the odds feed offers no truer close, **the last snapshot before game
start stands and is marked by its timestamp — never backfilled from memory, never
interpolated.**

## The two CLV numbers

- **Fair points** = `100 × (closing consensusFair − locked imp)`. Fair-vs-fair, so vig
  is out of the comparison entirely. Positive = the consensus moved toward our side
  after we locked — we beat the close.
- **CZ cents** = locked `cz` − closing `am`, on a continuous cents scale that removes
  the american-odds seam (−105 ↦ 95, +105 ↦ 105, so −105 → +105 is 10 cents, not 210).
  Positive = the price we locked was better than the closing price at the same book,
  same side — vig cancels.

(`ledger-segments.ts` additionally reports the older locked-implied-vs-close variants
on the Ledger receipts; the Stats CLV panel is the fair-vs-fair report.)

## No backfill — ever

A leg enters a CLV column only when **both** of that column's inputs were captured live:
locked `imp` + closing `consensusFair` for fair points; locked `cz` + closing `am` for
cents. Historical legs missing either stay out of the dataset rather than polluting it
with reconstructed numbers. CLV starts clean from this deploy.

## Where it shows

Stats → 📐 CALIBRATION → **Closing line value** panel: average CLV (prob points and CZ
cents) with n and standard error, a by-market table, and a rolling 30-day daily-mean
trend — all filterable by market, tier (CORE/FUN), direction (overs/unders), and
selection mode.
