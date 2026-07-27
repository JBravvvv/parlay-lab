#!/usr/bin/env python3
"""RANGE-COMPRESSION DETECTOR — a model can be centred correctly and still unable to
reach the tails. That is a distinct pathology from bias, and nothing was checking it.

    python3 tools/range_compression.py b-2026-07-26.json
    curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-26" -o b.json

WHY THIS EXISTS (2026-07-26)
----------------------------
`pitcher_outs` defect 3: `shShrink(ipg, n, 4, Lipg)` at n≈4 puts exactly 0.5 weight on the
pitcher's own workload, so the estimator spans only 4.67-6.17 IP while the market wants
6.2-6.5 for deep starters. **The model was not mis-centred there — it was too narrow.** A
bias check reports that as a small mean error; a range check names it.

Same family as `tools/factor_activity.py` (an input gone missing), `tools/gate_activity.py`
(a threshold that cannot be reached) and `tests/clamp-activity.test.ts` (a clamp pinned at a
bound): a component producing perfectly plausible numbers over too narrow a range.

WHAT IT COMPUTES — AND THE FIRST VERSION OF THIS TOOL DID NOT WORK
------------------------------------------------------------------
The first version compared the spread of `pModel` against the spread of `implied`, in
PROBABILITY. It reported `pitcher_outs` as 1.20x WIDER than the market — the opposite of the
defect it was written to find, and it would have been believed.

**Probability is a monotone transform of (lambda, LINE), and the lines differ across rows.**
Comparing probability spreads therefore mixes the estimator's dispersion with the book's
choice of line, so a model whose lambda range is too narrow can still show a wide
probability spread simply because it sits at varying distances from varying lines. That is
exactly what outs does.

So the measurement is done in the MARKET'S OWN UNITS. For every market the engine prices
with `shPOver` — hits, HR, H+R+RBI, K's, outs — both sides are inverted through the engine's
own Poisson at that row's line:

    solve  1 - PoisCdf(floor(line), lam) = p     for lam, at p = pModel and at p = implied

giving lambda_model and lambda_market in expected-events. Then:

    IQR ratio   = IQR(lam_model)       / IQR(lam_market)
    P1090 ratio = (p90-p10)(lam_model) / (p90-p10)(lam_market)

A ratio materially below 1 means the model cannot reach where the market goes -> over-
shrinkage upstream. Above 1 is the opposite failure and just as informative.

NOT COVERED, and stated rather than silently omitted:
  * `batter_total_bases` uses `shTbOver` (a compound distribution needing s1/s2, which the
    board does not carry) — NOT INVERTIBLE HERE, so TB is excluded from the lambda table.
  * `ml`/`rl` have no lambda at all — excluded.
The probability-space table is still printed BELOW the lambda table, labelled as the weaker
statistic, so the two can be compared and the confound is visible rather than hidden.

WHY `categories` IS THE RIGHT POPULATION HERE, DESPITE BEING ONE-SIDED
---------------------------------------------------------------------
`categories` is "top 50 per market ranked by win probability, ONE side per line". That
manufactures the SIGN of `pModel - implied` (see docs/harness-substitutions.md, fourth
methodology rule) — but this measurement compares the SPREAD of two columns over the SAME
rows, and any row selection shifts both columns identically. The ratio is therefore
side-invariant. Two caveats that are NOT removable and are printed with the result:
  * the top-50 cap truncates TB/hits/HR/HRR (350/267/246/271 rows available), so their
    spreads are measured on a probability-ranked subset. `pitcher_outs` (38), K's (35),
    ml and rl (15) are under the cap and complete.
  * ranking by probability truncates the LOW-probability tail specifically, which shrinks
    BOTH columns. The ratio is the robust statistic here; the absolute spreads are not.
"""
import argparse, json, math, sys
from collections import defaultdict

# markets the engine prices with shPOver (Poisson). TB uses shTbOver and is not invertible
# from board fields; ml/rl have no lambda.
POIS = {"batter_hits", "batter_home_runs", "batter_hits_runs_rbis",
        "pitcher_strikeouts", "pitcher_outs"}


def pois_cdf(k, lam):
    s, t = 0.0, math.exp(-lam)
    for i in range(int(k) + 1):
        s += t
        t *= lam / (i + 1)
    return s


def invert(line, p):
    """lambda such that the engine's own shPOver reproduces p at this line"""
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


def line_of(lkey):
    parts = str(lkey or "").split("|")
    if len(parts) != 3:
        return None
    try:
        return float(parts[2])
    except ValueError:
        return None

LABEL = {"ml": "ml", "rl": "rl", "batter_hits": "hits", "batter_total_bases": "TB",
         "batter_home_runs": "HR", "batter_hits_runs_rbis": "HRR",
         "pitcher_strikeouts": "K's", "pitcher_outs": "outs"}
FLAG = 0.85  # ratio below this = materially compressed


def q(xs, p):
    s = sorted(xs)
    if not s:
        return None
    i = (len(s) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()
    b = json.load(open(a.board))
    d = b["board"]["data"]

    avail = defaultdict(int)
    for g in d.get("propBoard") or []:
        for mkt, rs in (g.get("markets") or {}).items():
            avail[mkt] += sum(1 for r in rs if not r.get("alt"))

    rows = defaultdict(list)
    seen = set()
    for mkt, rs in (d.get("categories") or {}).items():
        if mkt == "all":
            continue
        for r in rs:
            k = (r.get("gkey"), r.get("lkey"))
            if r.get("pModel") is None or r.get("implied") is None or k in seen:
                continue
            seen.add(k)
            # ORIENT TO THE OVER FIRST. `categories` carries one side per line and it is
            # mostly the UNDER for pitcher_outs; inverting P(under) through an OVER CDF
            # silently prices a different event. Caught when outs read 2.32x WIDER.
            sub = str(r.get("sub") or "")
            und = " U " in sub
            pm = 100 - float(r["pModel"]) if und else float(r["pModel"])
            im = 100 - float(r["implied"]) if und else float(r["implied"])
            rows[mkt].append((pm, im, line_of(r.get("lkey"))))

    out = {}
    print(f"RANGE COMPRESSION — board {b['board'].get('date')}\n")

    # ---- PRIMARY: lambda space, the market's own units ----------------------
    print("A. LAMBDA SPACE (expected events) — both sides inverted through the engine's own")
    print("   Poisson at each row's line. This is the measurement; the table below is not.\n")
    print(f"{'mkt':<6}{'n':>5}{'IQRmodel':>10}{'IQRmkt':>9}{'ratio':>8}"
          f"{'1090model':>11}{'1090mkt':>10}{'ratio':>8}   verdict")
    lam_res = []
    for mkt, v in rows.items():
        if mkt not in POIS:
            continue
        lm, lk = [], []
        for pm, im, ln in v:
            if ln is None:
                continue
            a1, a2 = invert(ln, pm / 100), invert(ln, im / 100)
            if a1 is None or a2 is None:
                continue
            lm.append(a1)
            lk.append(a2)
        if len(lm) < 5:
            continue
        iq_m, iq_k = q(lm, .75) - q(lm, .25), q(lk, .75) - q(lk, .25)
        w_m, w_k = q(lm, .90) - q(lm, .10), q(lk, .90) - q(lk, .10)
        lam_res.append((mkt, len(lm), iq_m, iq_k, (iq_m / iq_k) if iq_k else None,
                        w_m, w_k, (w_m / w_k) if w_k else None))
    for mkt, n, iq_m, iq_k, r1, w_m, w_k, r2 in sorted(lam_res, key=lambda x: (x[4] is None, x[4])):
        worst = min([x for x in (r1, r2) if x is not None], default=None)
        verdict = ("COMPRESSED" if worst is not None and worst < FLAG else
                   "wider than market" if worst is not None and worst > 1.15 else "ok")
        print(f"{LABEL.get(mkt,mkt):<6}{n:>5}{iq_m:>10.2f}{iq_k:>9.2f}"
              f"{(f'{r1:.2f}' if r1 else '—'):>8}{w_m:>11.2f}{w_k:>10.2f}"
              f"{(f'{r2:.2f}' if r2 else '—'):>8}   {verdict}")
        out.setdefault(LABEL.get(mkt, mkt), {})["lambda"] = {
            "n": n, "iqrModel": iq_m, "iqrMkt": iq_k, "iqrRatio": r1,
            "p1090Model": w_m, "p1090Mkt": w_k, "p1090Ratio": r2, "verdict": verdict}
    print("   excluded: TB (shTbOver needs s1/s2, not on the board), ml/rl (no lambda)\n")

    # ---- SECONDARY: probability space, kept only to show the confound -------
    print("B. PROBABILITY SPACE — WEAKER, and shown only so the confound stays visible.")
    print("   Probability is a transform of (lambda, LINE); lines differ across rows, so a")
    print("   narrow lambda range can still read wide here. Do not act on this table.\n")
    print(f"{'mkt':<6}{'n':>5}{'avail':>7}{'IQRmodel':>10}{'IQRmkt':>9}{'ratio':>8}"
          f"{'1090model':>11}{'1090mkt':>10}{'ratio':>8}   verdict")
    res = []
    for mkt, v in rows.items():
        pm = [x[0] for x in v]
        im = [x[1] for x in v]
        iq_m = q(pm, .75) - q(pm, .25)
        iq_k = q(im, .75) - q(im, .25)
        w_m = q(pm, .90) - q(pm, .10)
        w_k = q(im, .90) - q(im, .10)
        r1 = (iq_m / iq_k) if iq_k else None
        r2 = (w_m / w_k) if w_k else None
        res.append((mkt, len(v), avail.get(mkt), iq_m, iq_k, r1, w_m, w_k, r2))
    for mkt, n, av, iq_m, iq_k, r1, w_m, w_k, r2 in sorted(res, key=lambda x: (x[5] is None, x[5])):
        worst = min([x for x in (r1, r2) if x is not None], default=None)
        verdict = ("COMPRESSED" if worst is not None and worst < FLAG else
                   "wider than market" if worst is not None and worst > 1.15 else "ok")
        cap = "  (capped at 50)" if av and av > 50 and n >= 50 else ""
        print(f"{LABEL.get(mkt,mkt):<6}{n:>5}{(av if av else '—'):>7}{iq_m:>10.1f}{iq_k:>9.1f}"
              f"{(f'{r1:.2f}' if r1 else '—'):>8}{w_m:>11.1f}{w_k:>10.1f}"
              f"{(f'{r2:.2f}' if r2 else '—'):>8}   {verdict}{cap}")
        out.setdefault(LABEL.get(mkt, mkt), {})["prob"] = {
            "n": n, "available": av, "iqrModel": iq_m, "iqrMkt": iq_k, "iqrRatio": r1,
            "p1090Model": w_m, "p1090Mkt": w_k, "p1090Ratio": r2, "verdict": verdict}
    print(f"\nflag threshold: ratio < {FLAG}, applied to TABLE A only. A COMPRESSED market cannot"
          f"\nreach where the market goes and the cause is upstream — check shShrink k"
          f"\n(tests/shrink-activity.test.ts) and clamp saturation (tests/clamp-activity.test.ts)"
          f"\nfor that market's branch.")
    if a.json:
        json.dump(out, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
