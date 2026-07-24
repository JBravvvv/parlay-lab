# Settlement audit — historical record addendum (fix-file Phase 4, 2026-07-24)

**Verdict: zero misgraded tickets. Every stored win/loss stands, and the ledger's
reported P/L (−$376.91 on $850 staked, 6-32, 2026-07-17 → 07-22) is the true P/L.**

The suspected bug was real — but it lived in the *display string*, not the grading
logic. `detail` printed the raw away-home score with no orientation, which made
correct grades look contradictory. This addendum records the audit; the ledger
itself is append-only and was not edited (the one change to stored data was the
`grading.v=2` re-rendering of score strings to [bet team]-[opponent], which touches
no result, stake, or payout).

## The ticket that triggered the audit
**2026-07-22 CORE Mixed 4L (+918, $2)** — graded LOST, and that grade is CORRECT:

| Leg | Result | Truth (statsapi, by gamePk) |
|---|---|---|
| Francisco Alvarez H+R+RBI O 0.5 | won (2) | ✓ |
| Seiya Suzuki H+R+RBI O 1.5 | won (3) | ✓ |
| Washington Nationals ML | won 8-0 | WSH 8 @ COL 0 — pk 824327 ✓ |
| **Los Angeles Angels ML** | **lost 0-1** | **STL 1 @ LAA 0 — pk 824004** |

The old display showed the Angels leg as "1-0" — the *road* team's score first. The
Cardinals were the away team and won 1-0. Three legs won; the Angels leg lost; the
ticket lost. No $20.36 payout was owed.

## Full re-verification, all 15 settled ML/RL legs
Method: every leg re-graded from statsapi finals with explicit home/away team-ID
mapping, matched by the stored gamePk (doubleheaders included). Scores below are
[bet team]-[opponent] — the only format the app now prints.

| Date | Leg | Stored | Truth | Match |
|---|---|---|---|---|
| 07-18 | DET ML vs LAA | won 7-0 | DET(116) 7 @ LAA(108) 0 | ✓ |
| 07-18 | PHI ML vs NYM | won 6-1 | NYM(121) 1 @ PHI(143) 6 | ✓ |
| 07-18 | HOU RL +1.5 vs BAL | lost 2-4 | BAL(110) 4 @ HOU(117) 2 | ✓ |
| 07-18 | CLE RL +1.5 vs PIT | lost 1-7 | PIT(134) 7 @ CLE(114) 1 — **pk 824414, GM1** of the doubleheader, matching the stored pk (GM2, pk 824412, went 3-5 CLE and would have covered — the bet was on GM1) | ✓ |
| 07-19 | SF RL +1.5 vs SEA | lost 3-6 | SF(137) 3 @ SEA(136) 6 | ✓ |
| 07-19 | LAA RL +1.5 vs DET | won 3-2 | DET(116) 2 @ LAA(108) 3 | ✓ |
| 07-19 | ATH RL +1.5 vs WSH | lost 2-5 | WSH(120) 5 @ ATH(133) 2 | ✓ |
| 07-19 | COL RL +1.5 vs CIN | lost 6-9 | CIN(113) 9 @ COL(115) 6 | ✓ |
| 07-20 | KC ML vs SF | won 4-3 | SF(137) 3 @ KC(118) 4 | ✓ |
| 07-20 | COL RL +1.5 vs WSH | lost 3-7 | WSH(120) 7 @ COL(115) 3 | ✓ |
| 07-20 | CHC ML vs DET | lost 6-8 | DET(116) 8 @ CHC(112) 6 | ✓ |
| 07-20 | NYM RL +1.5 vs MIL | lost 3-8 | NYM(121) 3 @ MIL(158) 8 | ✓ |
| 07-20 | PIT ML vs NYY | lost 5-8 | PIT(134) 5 @ NYY(147) 8 | ✓ |
| 07-22 | WSH ML vs COL | won 8-0 | WSH(120) 8 @ COL(115) 0 | ✓ |
| 07-22 | LAA ML vs STL | lost 0-1 | STL(138) 1 @ LAA(108) 0 | ✓ |

15/15 results confirmed. All player-prop legs were separately spot-verified against
boxscores during the same audit (the "9 K" / "2 H" style details read directly off
official stat lines and carried no orientation ambiguity).

## What was fixed going forward
- Both graders (`shGradeLeg` in the engine, `gradePrediction` in the calibration cron)
  and the live in-progress score chip render **[bet team]-[opponent]**, always.
- Stored v1 strings were re-oriented once via `shGradeOrientFix` (idempotent,
  `grading.v=2`, results untouched) — verified on the live synced record.
- The settlement unit-test matrix covers every case: home/away picks winning and
  losing, RL +1.5 covering via outright win and via 1-run loss, failing by exactly 2
  and by more, RL −1.5 both sides (`tests/grade-orientation.test.ts`).

## True P/L (unchanged)
| Day | Staked | Returned | P/L |
|---|---|---|---|
| 07-17 | $300 | $198.33 | −$101.67 |
| 07-18 | $300 | $244.87 | −$55.13 |
| 07-19 | $125 | $0 | −$125.00 |
| 07-20 | $43 | $0 | −$43.00 |
| 07-21 | $42 | $29.89 | −$12.11 |
| 07-22 | $40 | $0 | −$40.00 |
| **Total** | **$850** | **$473.09** | **−$376.91** |
