#!/usr/bin/env python3
"""RANGE-COMPRESSION DETECTOR — a model can be centred correctly and still unable to reach
the tails. That is a distinct pathology from bias, and nothing was checking it.

    python3 tools/range_compression.py b-2026-07-26.json
    python3 tools/range_compression.py b.json --truncation-check
    curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-26" -o b.json

WHY THIS EXISTS (2026-07-26)
----------------------------
`pitcher_outs` defect 3: `shShrink(ipg, n, 4, Lipg)` at n≈4 puts exactly 0.5 weight on the
pitcher's own workload, so the estimator spans only 4.67-6.17 IP while the market wants
6.2-6.5 for deep starters. **The model is not mis-centred there — it is too narrow.** A bias
check reports that as a small mean error; a range check names it.

Same family as `tools/factor_activity.py` (an input gone missing), `tools/gate_activity.py`
(a threshold that cannot be reached), `tests/clamp-activity.test.ts` (a clamp pinned at a
bound) and `tests/shrink-activity.test.ts` (k too large for the n available).

THIS TOOL WAS WRONG THREE TIMES. ALL THREE ARE RECORDED, BECAUSE EACH PRODUCED A
CONFIDENT, PLAUSIBLE, RANKED TABLE.
------------------------------------------------------------------------------------
1. WRONG SPACE. v1 compared the spread of `pModel` against the spread of `implied` in
   PROBABILITY, and reported `pitcher_outs` 1.20x WIDER than the market -- the opposite of
   the defect it was written to find. Probability is a transform of (lambda, LINE) and the
   lines differ across rows; worse, books SET the line near their own lambda, which pins
   market probabilities near 50% by construction while the model's inherit its bias. Any
   probability-scale spread ratio therefore flatters a biased model as "wider".
2. WRONG ORIENTATION. v2 moved to lambda space but inverted `pModel` as if every row were an
   OVER. `categories` carries one side per line and it is the UNDER on 35 of 38 outs rows,
   so P(under) was being priced as P(over). It read 2.32x wider.
3. WRONG POPULATION -- the one that actually mattered. v3 was oriented and in lambda space,
   and reported `pitcher_outs` 0.51 (real) and `batter_hits_runs_rbis` 0.50 (NOT REAL).
   `categories` is "top 50 per market ranked by win PROBABILITY", and probability is a
   function of pModel -- so the sample is selected ON THE MODEL SIDE of the ratio.
   `--truncation-check` demonstrates it: restricting to the top 30/20/12 swings H+R+RBI's
   ratio 0.50 -> 2.10 -> 4.88 -> 1.83 and hits 2.96 -> 10.24 -> 13.05 -> 15.66. A statistic
   that moves by 10x under truncation is measuring the truncation.

THE POPULATION IS `propBoard`
-----------------------------
Uncapped, every priced line, both sides oriented to the OVER, and NOT ranked on anything the
model produces. `fO` is the market's de-vigged fair for the over. `pO` is the BLENDED
probability (`modelBy` reads `r.p`, not `r.pModel`), so the raw model probability is
recovered as

    pModel_over = fO + (pO - fO) / w        w = 0.35 for props

and the recovery is CHECKED, not assumed: against the rows that also appear in `categories`
(where the true `pModel` is stored) the error is median -0.01 pp, p05/p95 -0.17/+0.16,
max 0.26 pp over 223 rows. `w` varies slightly on shrunk-to-mean rows; that is the whole
residual. The check prints every run and a large error invalidates the table.

WHAT IT COMPUTES
----------------
For every market the engine prices with `shPOver` -- hits, HR, H+R+RBI, K's, outs -- both
sides are inverted through the engine's OWN Poisson at that row's own `ln`:

    solve  1 - PoisCdf(floor(ln), lam) = p     at p = pModel_over and at p = fO

    IQR ratio   = IQR(lam_model)       / IQR(lam_market)
    P1090 ratio = (p90-p10)(lam_model) / (p90-p10)(lam_market)

NOT COVERED, stated rather than silently omitted: `batter_total_bases` uses `shTbOver`, a
compound distribution needing s1/s2 which the board does not carry -- NOT INVERTIBLE, so TB
is excluded. `ml`/`rl` have no lambda.
"""
import argparse, json, math, sys
from collections import defaultdict

POIS = {"batter_hits", "batter_home_runs", "batter_hits_runs_rbis",
        "pitcher_strikeouts", "pitcher_outs"}
LABEL = {"batter_hits": "hits", "batter_total_bases": "TB", "batter_home_runs": "HR",
         "batter_hits_runs_rbis": "HRR", "pitcher_strikeouts": "K's", "pitcher_outs": "outs"}
W_PROPS = 0.35
FLAG = 0.85
W_ERR_MAX = 1.0  # pp; above this the recovery is unsound and the table must not be read


def pois_cdf(k, lam):
    s, t = 0.0, math.exp(-lam)
    for i in range(int(k) + 1):
        s += t
        t *= lam / (i + 1)
    return s


def invert(line, p):
    if not (0 < p < 1):
        return None
    lo, hi = 1e-6, 60.0
    for _ in range(90):
        m = (lo + hi) / 2
        if 1 - pois_cdf(math.floor(line), m) < p:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def q(xs, p):
    s = sorted(xs)
    if not s:
        return None
    i = (len(s) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def iqr(xs):
    return q(xs, .75) - q(xs, .25)


def spread(xs):
    return q(xs, .90) - q(xs, .10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--truncation-check", action="store_true",
                    help="show why `categories` cannot be used: ratio vs top-N")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()
    b = json.load(open(a.board))
    d = b["board"]["data"]

    # ---- the categories rows, kept ONLY to check the w-recovery --------------
    cats = {}
    for mkt, rs in (d.get("categories") or {}).items():
        if mkt == "all":
            continue
        for r in rs:
            if r.get("pModel") is not None and r.get("lkey"):
                cats[r["lkey"]] = r

    rows, err = defaultdict(list), []
    for g in d.get("propBoard") or []:
        for mkt, rs in (g.get("markets") or {}).items():
            if mkt not in POIS:
                continue
            for r in rs:
                if r.get("alt") or r.get("pO") is None or r.get("fO") is None or r.get("ln") is None:
                    continue
                pm = r["fO"] + (r["pO"] - r["fO"]) / W_PROPS
                rows[mkt].append((pm, r["fO"], r["ln"]))
                c = cats.get(r["lkey"])
                if c is not None:
                    und = " U " in (c.get("sub") or "")
                    err.append(pm - ((100 - c["pModel"]) if und else c["pModel"]))

    print(f"RANGE COMPRESSION — board {b['board'].get('date')}   population: propBoard "
          f"(uncapped, over-oriented)\n")
    if err:
        err.sort()
        worst = max(abs(err[0]), abs(err[-1]))
        print(f"w-recovery check ({len(err)} rows present in both representations): "
              f"median {err[len(err)//2]:+.2f} pp, p05 {err[int(.05*len(err))]:+.2f}, "
              f"p95 {err[int(.95*len(err))]:+.2f}, max |err| {worst:.2f} pp"
              + ("   <-- UNSOUND, DO NOT READ THE TABLE" if worst > W_ERR_MAX else "   OK"))
    print()

    print(f"{'mkt':<6}{'n':>6}{'IQRmodel':>10}{'IQRmkt':>9}{'ratio':>8}{'1090ratio':>11}   verdict")
    out = {}
    res = []
    for mkt, v in rows.items():
        lm, lk = [], []
        for pm, fo, ln in v:
            x = invert(ln, min(max(pm, 0.01), 99.99) / 100)
            y = invert(ln, fo / 100)
            if x and y:
                lm.append(x)
                lk.append(y)
        if len(lm) < 10:
            continue
        r1 = iqr(lm) / iqr(lk) if iqr(lk) else None
        r2 = spread(lm) / spread(lk) if spread(lk) else None
        res.append((mkt, len(lm), iqr(lm), iqr(lk), r1, r2))
    for mkt, n, im_, ik, r1, r2 in sorted(res, key=lambda x: (x[4] is None, x[4])):
        worst = min(x for x in (r1, r2) if x is not None)
        verdict = "COMPRESSED" if worst < FLAG else ("wider than market" if worst > 1.15 else "ok")
        print(f"{LABEL[mkt]:<6}{n:>6}{im_:>10.3f}{ik:>9.3f}{r1:>8.2f}{r2:>11.2f}   {verdict}")
        out[LABEL[mkt]] = {"n": n, "iqrModel": im_, "iqrMkt": ik, "iqrRatio": r1,
                           "p1090Ratio": r2, "verdict": verdict}
    print("\nexcluded: TB (shTbOver needs s1/s2, not on the board), ml/rl (no lambda)")

    if a.truncation_check:
        print("\n\nWHY `categories` CANNOT BE THE POPULATION — ratio vs top-N by probability.")
        print("`categories` ranks on win probability, which is a function of pModel, so the")
        print("sample is selected on the MODEL side of the ratio. A stable statistic would be")
        print("flat across these columns.\n")
        print(f"{'mkt':<6}{'inCats':>8}   {'all':>6}{'top30':>8}{'top20':>8}{'top12':>8}")
        for mkt in POIS:
            cr = [r for r in (d.get("categories") or {}).get(mkt, [])
                  if r.get("pModel") is not None and r.get("implied") is not None]
            cr.sort(key=lambda r: -r["prob"])
            cells = []
            for N in (len(cr), 30, 20, 12):
                lm, lk = [], []
                for r in cr[:N]:
                    parts = str(r.get("lkey") or "").split("|")
                    if len(parts) != 3:
                        continue
                    try:
                        ln = float(parts[2])
                    except ValueError:
                        continue
                    und = " U " in (r.get("sub") or "")
                    x = invert(ln, ((100 - r["pModel"]) if und else r["pModel"]) / 100)
                    y = invert(ln, ((100 - r["implied"]) if und else r["implied"]) / 100)
                    if x and y:
                        lm.append(x)
                        lk.append(y)
                cells.append(f"{iqr(lm)/iqr(lk):.2f}" if len(lm) >= 6 and iqr(lk) else "—")
            print(f"{LABEL[mkt]:<6}{len(cr):>8}   " + "".join(f"{c:>8}" for c in cells))

    if a.json:
        json.dump(out, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
