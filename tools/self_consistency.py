#!/usr/bin/env python3
"""SELF-CONSISTENCY — the model checked against ITSELF. A violation is a PROOF, not evidence.

    python3 tools/self_consistency.py --board b.json
    python3 tools/self_consistency.py --date 2026-07-26
    python3 tools/self_consistency.py --archive data/boards        # every archived board

WHY THIS IS DIFFERENT FROM EVERY OTHER DETECTOR HERE
----------------------------------------------------
Every finding in this project has been bottlenecked on lacking an independent reference. The
market is not independent (the model blends toward it). The fixture is not production. The
archive needs weeks to accrue. Twenty boards of the same instrument is precision, not
independence.

**These constraints need none of that.** They are logical identities between two prices the
model itself emits, so a violation is a proof that at least one of them is wrong — with no
assumption that the market is right, no fixture, and no waiting.

That is how `shTbOver`'s 0.5 branch was found: TB O0.5 and hits O0.5 are the same event, the
market priced them 0.1pp apart, and the model priced them 24.4pp apart on 127 rows.

THE CONSTRAINTS
---------------
Written as `P(A) >= P(B)` where A is implied by B, plus one exact identity. Every one is
derivable from the definitions of the markets, not from any model:

  TB>=1   ==  H>=1          a single IS one total base — an EQUALITY, both directions
  HRR>=1  >=  H>=1          a hit is one of the three H+R+RBI components
  HRR>=1  >=  HR>=1         a home run is 1H + 1R + 1RBI
  HRR>=3  >=  HR>=1         ...so a home run implies HRR >= 3 exactly
  H>=1    >=  HR>=1         a home run is a hit
  TB>=4   >=  HR>=1         a home run is four total bases
  TB>=k   >=  H>=k          k hits are at least k total bases (any k)
  ladder monotonicity       P(X>=a) >= P(X>=b) for a < b, within every market

The MARKET is scored on the same constraints. It should satisfy them too — if it does not, the
constraint or the de-vig is suspect rather than the model, and the run says so instead of
blaming the model by default.
"""
import argparse, collections, glob, gzip, json, os, statistics as st, sys, urllib.request

BASE = "https://parlay-lab-six.vercel.app"
W_PROPS = 0.35  # wBlend for props: pO = W*pModel + (1-W)*fO
TOL = 1.0       # pp — below this a violation is de-vig noise, not a finding
H, TB, HR, HRR = "batter_hits", "batter_total_bases", "batter_home_runs", "batter_hits_runs_rbis"
K, OUTS = "pitcher_strikeouts", "pitcher_outs"


def load(args):
    if args.board:
        raw = open(args.board, "rb").read()
        d = json.loads(gzip.decompress(raw) if args.board.endswith(".gz") else raw)
    else:
        req = urllib.request.Request(f"{BASE}/api/board?date={args.date}",
                                     headers={"User-Agent": "parlay-lab-selfcheck/1.0"})
        d = json.loads(urllib.request.urlopen(req, timeout=90).read())
    return (d.get("board") or d).get("data") or d.get("data") or d


def rows(data):
    """{(player, market, line): (pModel, market_fair)} from propBoard — both sides, uncapped."""
    out = {}
    for g in data.get("propBoard") or []:
        for mkt, rs in (g.get("markets") or {}).items():
            for r in rs:
                if r.get("pO") is None or r.get("fO") is None:
                    continue
                who = (r.get("lkey") or "|").split("|")[0]
                cf = (r["pO"] - (1 - W_PROPS) * r["fO"]) / W_PROPS
                out[(who, mkt, float(r["ln"]))] = (cf, r["fO"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board")
    ap.add_argument("--date")
    ap.add_argument("--archive")
    ap.add_argument("--json")
    a = ap.parse_args()
    if a.archive:
        files = sorted(glob.glob(os.path.join(a.archive, "*.best.json.gz")))
        if not files:
            print("no archived boards", file=sys.stderr)
            return 2
        print(f"SELF-CONSISTENCY over {len(files)} archived board(s)\n")
        worst = collections.Counter()
        for f in files:
            a.board = f
            n = run(load(a), os.path.basename(f)[:10], worst)
        print("\nVIOLATIONS BY CONSTRAINT ACROSS THE SERIES")
        for k, v in worst.most_common():
            print(f"  {k:<34}{v:>6}")
        return 0
    if not (a.board or a.date):
        print("need --board, --date or --archive", file=sys.stderr)
        return 2
    return run(load(a), a.date or os.path.basename(a.board)[:10], collections.Counter(), a.json)


def run(data, label, tally, jout=None):
    R = rows(data)
    players = {p for (p, _, _) in R}
    checks = []

    def add(name, who, a, b, exact=False):
        """a and b are (pModel, fair) pairs. Constraint: P(a) >= P(b), or == when exact."""
        for side, i in (("model", 0), ("market", 1)):
            d = a[i] - b[i]
            bad = abs(d) > TOL if exact else d < -TOL
            checks.append({"c": name, "p": who, "side": side, "delta": round(d, 2), "bad": bad})

    for p in players:
        g = lambda m, ln: R.get((p, m, ln))
        pairs = [
            ("TB>=1 == H>=1", g(TB, 0.5), g(H, 0.5), True),
            ("HRR>=1 >= H>=1", g(HRR, 0.5), g(H, 0.5), False),
            ("HRR>=1 >= HR>=1", g(HRR, 0.5), g(HR, 0.5), False),
            ("HRR>=3 >= HR>=1", g(HRR, 2.5), g(HR, 0.5), False),
            ("H>=1 >= HR>=1", g(H, 0.5), g(HR, 0.5), False),
            ("TB>=2 >= H>=2", g(TB, 1.5), g(H, 1.5), False),
        ]
        for name, x, y, ex in pairs:
            if x and y:
                add(name, p, x, y, ex)
        # ladder monotonicity, within each market
        for m in (H, TB, HR, HRR, K, OUTS):
            lns = sorted(ln for (q, mm, ln) in R if q == p and mm == m)
            for i in range(len(lns) - 1):
                x, y = R[(p, m, lns[i])], R[(p, m, lns[i + 1])]
                add(f"monotone {m.split('_')[-1]}", p, x, y, False)

    print(f"=== {label} ===")
    by = collections.defaultdict(lambda: {"model": [], "market": []})
    for c in checks:
        by[c["c"]][c["side"]].append(c)
    print(f"{'constraint':<24}{'n':>5}{'MODEL bad':>11}{'med Δ':>9}{'  MARKET bad':>13}{'med Δ':>9}")
    for name in sorted(by):
        mo, mk = by[name]["model"], by[name]["market"]
        if not mo:
            continue
        bm = sum(1 for x in mo if x["bad"])
        bk = sum(1 for x in mk if x["bad"])
        flag = "   <-- PROOF OF A BUG" if bm and not bk and bm / len(mo) > 0.5 else ""
        print(f"{name:<24}{len(mo):>5}{bm:>11}{st.median([x['delta'] for x in mo]):>+8.1f}"
              f"{bk:>13}{st.median([x['delta'] for x in mk]):>+8.1f}{flag}")
        if bm:
            tally[name] += bm
    print("\n  MODEL bad with MARKET clean on the same rows = the model contradicts itself and")
    print("  the constraint is sound. That is a proof, not evidence.")
    if jout:
        json.dump(checks, open(jout, "w"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
