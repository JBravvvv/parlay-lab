#!/usr/bin/env python3
"""GATE ACTIVITY — the drift check for thresholds, as factor_activity.py is for inputs.

WHY THIS EXISTS (2026-07-26)
----------------------------
`tools/factor_activity.py` catches an engine INPUT that has gone missing. Nothing caught a
THRESHOLD that can never be reached. Five protections were found inert in one week —
shPenQF, shUmpKf, the H+R+RBI slope criterion, slopeMults, applyWeeklyAdjustment — and a
value-based drift check reports clean for every one of them, because no value moved.

REPORTED PER CATEGORY, NEVER AS ONE FLAT COUNT. The categories mean different things and a
single "never fired" number would blur three of them:

  A STRUCTURAL  threshold unreachable by arithmetic       -> a FINDING
  B PINNED      inert by decision, with an activation plan -> HEALTHY
  C ZEROED      configured off                             -> HEALTHY
  D PENDING     reachable, not yet reached                 -> WATCH
  E FIRING      acts routinely                             -> healthy; going quiet is an ALARM

Reads only what is public: the persisted board (/api/board) and /api/calibration. Gates
that live behind the sync phrase (ledger-derived lock counts) are listed as UNREADABLE
rather than silently omitted — an unmeasured gate must not look like a passing one.

    python3 tools/gate_activity.py --date 2026-07-26
    python3 tools/gate_activity.py --board ./b.json          # offline
"""
import argparse, json, sys, urllib.request

# mirrors MKT_SHORT in src/lib/gate-rebuild.ts
MKT_SHORT = {"ml": "ML", "rl": "RL", "batter_hits": "Hits", "batter_total_bases": "Total Bases",
             "batter_home_runs": "HR", "batter_hits_runs_rbis": "H+R+RBI",
             "pitcher_strikeouts": "K's", "pitcher_outs": "Outs"}

BASE = "https://parlay-lab-six.vercel.app"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "parlay-lab-gate-activity/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())


def am_to_dec(a):
    a = float(a)
    return 1 + a / 100 if a > 0 else 1 + 100 / abs(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--board", default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    if a.board:
        board = json.load(open(a.board))
    elif a.date:
        board = get(f"{BASE}/api/board?date={a.date}")
    else:
        print("need --date or --board", file=sys.stderr)
        return 2
    d = (board.get("board") or {}).get("data")
    if not d:
        print(f"no board: {board.get('reason')}", file=sys.stderr)
        return 1
    cal = get(f"{BASE}/api/calibration")
    summary = cal.get("summary") or {}
    # THE D-CATEGORY READINGS COME FROM THE STORED SUMMARY, which is rewritten only by the
    # nightly calibrate run — so it can PREDATE a code change and report the old behaviour.
    # Caught on this tool's very first run: `significant` read FIRED while every market sat
    # at n=5-15, because SIG_MIN_N=50 was committed after the summary was last written. A
    # stale artifact and a live gate look identical here unless the timestamp is checked.
    stamp = summary.get("at")

    cats = {k: v for k, v in (d.get("categories") or {}).items() if k != "all"}
    rows = [r for v in cats.values() for r in v]
    tix = list(d.get("parlays") or []) + list(d.get("parlaysMixed") or [])

    def hr(t):
        return t.get("type") == "batter_home_runs" or any(
            "|batter_home_runs|" in str(l.get("lkey") or "") for l in t.get("legs") or [])

    def clears_ev(t):
        return t.get("czEv") is not None and t["czEv"] >= 2

    # ---- E: gates whose firing is countable straight off the board
    bi0_rows = [r for r in rows if r.get("booksInd") == 0]
    bi0_tix = [t for t in tix if any(l.get("booksInd") == 0 for l in t.get("legs") or [])]
    firing = {
        "coreNoHR": {"fires": sum(1 for t in tix if hr(t)), "of": len(tix), "unit": "tickets dropped pre-gate"},
        "coreEvMin(+2%)": {"fires": sum(1 for t in tix if not clears_ev(t)), "of": len(tix), "unit": "tickets below the EV floor"},
        "coreMaxLegs(3)": {"fires": sum(1 for t in tix if len(t.get("legs") or []) > 3), "of": len(tix), "unit": "tickets over the leg cap"},
        "coreMaxDec(15)": {"fires": sum(1 for t in tix if t.get("czDec") and t["czDec"] > 15), "of": len(tix), "unit": "tickets over the odds ceiling"},
        "hrrAltMax(susp)": {"fires": sum(1 for r in rows if r.get("susp")), "of": len(rows), "unit": "rows suspended"},
        "booksInd(==0)": {
            "fires": len([t for t in bi0_tix if not hr(t) and clears_ev(t)]),
            "of": len(tix),
            "unit": "tickets that REACH the gate and are blocked",
            "note": f"{len(bi0_rows)} rows at booksInd=0; {len(bi0_tix)} tickets carry one; "
                    f"{len([t for t in bi0_tix if hr(t)])} of those are HR and die at coreNoHR first",
        },
    }

    # ---- A/B/C/D: gates whose state comes from config or the calibration channel
    rel = summary.get("reliability") or {}
    per = summary.get("perMarket") or {}
    report = {
        "A_structural": {
            "slopeMults": {"fired": bool(cal.get("mults")),
                           "why": "needs slope + 1.96*se < 1; at measured within-market sigma_p that is a fitted slope below -0.54 to -3.45"},
            "hrr_slope_band": {"fired": None,
                               "why": "human criterion, [0.85,1.15] at n>=100 is 0.17 SE wide; admits a perfect market ~14% of the time"},
        },
        "B_pinned": {
            "shPenQF": {"fired": False, "why": "SH_CFG.penQFrozen — activation plan in docs/collection-period.md"},
            "shUmpKf": {"fired": False, "why": "SH_CFG.umpKFrozen — would otherwise self-arm ~2026-08-04"},
        },
        "C_zeroed": {
            "mayAutoRun": {"fired": False, "why": "MAX_AUTO_RUNS_PER_DAY = 0, prompt-only by design"},
        },
        "D_pending": {
            "applyWeeklyAdjustment": {"fired": len(cal.get("log") or []) > 0,
                                      "progress": {m: v.get("n") for m, v in rel.items() if m != "all"},
                                      "needs": "ADJUST tier n>=150/market + Wilson significance + 7-day gap"},
            "fitGlobalShrink": {"fired": (cal.get("global") or {}).get("s", 1) != 1,
                                "progress": (cal.get("global") or {}).get("n"), "needs": "n>=150 legs with a logged pMkt"},
            "quarantine": {"fired": len(cal.get("quarantine") or []) > 0,
                           "progress": summary.get("graded"), "needs": "n>=30 extreme-edge legs, realised < predicted/2"},
            "significant(SIG_MIN_N)": {"fired": any(v.get("significant") for v in per.values()),
                                       "progress": {m: v.get("n") for m, v in per.items()}, "needs": "n>=50 per market"},
        },
        "E_firing": firing,
        "UNREADABLE": {
            "lockMaxAgeMin": "ledger-gated — needs the sync phrase",
            "dailyBankrollCap": "ledger-gated",
            "funMinProb / funMaxTickets / funTiers": "card-time, ledger-gated",
            "kellyStakeMult": "card-time, ledger-gated",
        },
    }

    from datetime import datetime, timezone
    ts = datetime.fromtimestamp(stamp / 1000, timezone.utc).isoformat() if stamp else "unknown"
    print(f"GATE ACTIVITY — board {(board.get('board') or {}).get('date')}, "
          f"{len(rows)} rows, {len(tix)} tickets, calibration graded={summary.get('graded')}")
    print(f"  calibration summary written: {ts}  <-- category D reflects THAT run, not current code\n")
    for cat, gates in report.items():
        if cat == "UNREADABLE":
            print("UNREADABLE (listed, not omitted — an unmeasured gate must not look like a passing one)")
            for k, v in gates.items():
                print(f"    {k:<34} {v}")
            continue
        label = {"A_structural": "A STRUCTURAL — unreachable by arithmetic   ** FINDING **",
                 "B_pinned": "B PINNED — inert by decision                 (healthy)",
                 "C_zeroed": "C ZEROED — configured off                    (healthy)",
                 "D_pending": "D PENDING — reachable, not yet reached       (watch)",
                 "E_firing": "E FIRING — acts routinely; silence is an ALARM"}[cat]
        print(label)
        for k, v in gates.items():
            if cat == "E_firing":
                flag = "  <-- SILENT, investigate" if v["fires"] == 0 else ""
                print(f"    {k:<22} {v['fires']:>4} / {v['of']:<4} {v['unit']}{flag}")
                if v.get("note"):
                    print(f"    {'':<22} {v['note']}")
            else:
                st = {True: "FIRED", False: "never", None: "n/a"}[v.get("fired")]
                print(f"    {k:<24} {st:<6} {v.get('why') or v.get('needs')}")
                if v.get("progress") is not None:
                    print(f"    {'':<24} progress: {json.dumps(v['progress'])}")
        print()

    # ---- consMinN: the one D-category threshold with a DATE, recomputed nightly
    # This gate is not a curiosity: under consMinN a market's tickets must also clear the
    # de-vigged consensus, and that is what produced the NO-PLAY card. Its reopening date is
    # therefore the date betting resumes per market — and it moves whenever accrual moves,
    # which is exactly why it is read from the summary instead of a doc.
    ro = summary.get("reopen") or {}
    mk = ro.get("markets") or {}
    print(f"consMinN({ro.get('need', 100)}) — THE GATE THAT DECIDES NO-PLAY, projected from measured accrual")
    if not mk:
        print("    no `reopen` block in the stored summary — the calibrate run predates it. "
              "Re-run /api/calibrate before trusting any reopening date.\n")
    else:
        den = ro.get("rateDays") or 0
        print(f"    rate measured over {den} COMPLETE date(s) "
              f"{ro.get('rateFrom') or '—'} → {ro.get('rateTo') or '—'}"
              f"{'   <-- THIN: this rate is not yet stable' if den < 5 else ''}")
        for m, v in sorted(mk.items(), key=lambda kv: -(kv[1].get("n") or 0)):
            n, need, per_d, on = v.get("n", 0), v.get("need", 100), v.get("perDay", 0), v.get("on")
            state = "OPEN" if n >= need else (on or "never at this rate")
            bar = "#" * int(20 * min(1, n / max(1, need)))
            print(f"    {MKT_SHORT.get(m, m):<14} {n:>4}/{need}  [{bar:<20}] {per_d:>5.1f}/day  -> {state}")
        print("    a market with 0.0/day is not accruing at all — check that /api/generate is")
        print("    still logging rows for it, not that the market is quiet.\n")

    if a.json:
        report["consMinN_reopen"] = ro
        json.dump(report, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
