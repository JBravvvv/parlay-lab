#!/usr/bin/env python3
"""M10 errors-in-variables test — is the expAB gradient measurement noise in `bbr`?

The candidate (2026-07-27): `bbr = shBlend(st, bb, "ab", 10)` is a recency-weighted blend with
a 10-AB minimum per window, so it carries large sampling noise. `expAB = pa(spot)·(1−0.9·bbr)`
inherits it, and rows landing at high expAB are disproportionately rows where bbr was
UNDERestimated — the model's λ is too high exactly where expAB is high. That manufactures a
positive residual-on-expAB slope with the 0.9 coefficient perfectly correct.

Discriminating prediction:
  - errors-in-variables → the walk-dimension slope SHRINKS as the bbr sample grows
    (steep in the thin-AB tail, flat for 200-AB regulars — proxied here by last-30 AB,
    the largest window `shBlendN` reports; the blend has no season window at all);
  - a wrong 0.9 coefficient → the slope is INVARIANT to the denominator.

Also reported: the FULL-NOISE EIV slope the mechanism predicts if ~all cross-sectional
walk-discount variance were noise: d(resid)/d(expAB) = e^{−λ}·λ/expAB per AB — at the board's
λ ≈ 0.96, expAB ≈ 4.1 that is ≈ +9.0 pp/AB, against the measured +7.39.

Inputs are the board's own case strings (exact engine output):
  spot + expAB from "#N spot → ~X.X ABs"; last-30 AB from "H-for-AB (.avg)";
  bbr recovered as (1 − expAB/pa(spot))/0.9  (±0.013 granularity from the 0.1-AB rounding —
  common to every stratum, so it attenuates all strata equally and cannot fake the signature).

Usage: python3 tools/m10_eiv.py <archived-board.json[.gz]>
"""
import gzip, json, math, re, sys
from math import log

W = 0.35  # wBlend, verified uniform across markets on 2026-07-26 by tools/rung_signature.py


def load(path):
    f = gzip.open(path, "rt") if path.endswith(".gz") else open(path)
    w = json.load(f)
    return w.get("data", w)


def multi_ols(X, y):
    n, k = len(y), len(X) + 1
    rows = [[1.0] + [c[i] for c in X] for i in range(n)]
    XtX = [[sum(r[a] * r[b] for r in rows) for b in range(k)] for a in range(k)]
    Xty = [sum(rows[i][a] * y[i] for i in range(n)) for a in range(k)]
    aug = [XtX[i][:] + [1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
    for col in range(k):
        piv = max(range(col, k), key=lambda r: abs(aug[r][col]))
        aug[col], aug[piv] = aug[piv], aug[col]
        pv = aug[col][col]
        aug[col] = [v / pv for v in aug[col]]
        for r in range(k):
            if r != col and aug[r][col]:
                f = aug[r][col]
                aug[r] = [v - f * w2 for v, w2 in zip(aug[r], aug[col])]
    inv = [row[k:] for row in aug]
    betas = [sum(inv[a][b] * Xty[b] for b in range(k)) for a in range(k)]
    resid = [y[i] - sum(betas[j] * rows[i][j] for j in range(k)) for i in range(n)]
    s2 = sum(r * r for r in resid) / (n - k)
    return betas, [math.sqrt(max(s2 * inv[j][j], 0)) for j in range(k)]


def sd(v):
    m = sum(v) / len(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))


def med(v):
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def main(path):
    d = load(path)
    pat_spot = re.compile(r"#(\d+) spot → ~(\d+\.\d) ABs")
    pat_avg = re.compile(r"(\d+)-for-(\d+) \(\.(\d+)\)")
    info = {}  # who -> (spot, expAB, ab30, avg30)
    for mkt, rows in (d.get("categories") or {}).items():
        for r in rows if isinstance(rows, list) else []:
            if not isinstance(r, dict) or not r.get("lkey"):
                continue
            who = r["lkey"].split("|")[0]
            case = r.get("case") or ""
            m, ma = pat_spot.search(case), pat_avg.search(case)
            if m and ma:
                info.setdefault(who, (int(m.group(1)), float(m.group(2)),
                                      int(ma.group(2)), int(ma.group(1)) / int(ma.group(2))))

    pts = []
    for g in d.get("propBoard") or []:
        for r in (g.get("markets") or {}).get("batter_hits") or []:
            if r.get("ln") != 0.5 or r.get("pO") is None or r.get("fO") is None:
                continue
            who = (r.get("lkey") or "||").split("|")[0]
            if who not in info:
                continue
            spot, eab, ab30, avg30 = info[who]
            pa = 4.68 - 0.11 * (spot - 1)
            wf = eab / pa                       # the walk-discount factor (1 − 0.9·bbr)
            bbr = (1 - wf) / 0.9
            pm = (r["pO"] - (1 - W) * r["fO"]) / W
            pts.append(dict(who=who, spot=spot, pa=pa, eab=eab, wf=wf, bbr=bbr,
                            ab30=ab30, avg30=avg30, y=pm - r["fO"], pm=pm))
    print(f"hits O0.5 rows with spot+expAB+ab30: {len(pts)}")
    dflt = [p for p in pts if abs(p["bbr"] - 0.09) <= 0.006]
    print(f"players at the 0.09 default bbr (±granularity): {len(dflt)} — "
          f"zero bbr variance, excluded from walk-dimension inference")
    live = [p for p in pts if abs(p["bbr"] - 0.09) > 0.006]

    # full-noise EIV prediction at the pooled parameters
    lam = med([-log(1 - p["pm"] / 100) for p in pts if 0.02 < p["pm"] / 100 < 0.98])
    eabm = med([p["eab"] for p in pts])
    full_noise = math.exp(-lam) * lam / eabm * 100
    print(f"\npooled λ̂ median {lam:.3f}, expAB median {eabm:.1f} → "
          f"FULL-NOISE EIV slope = e^(−λ)·λ/expAB = {full_noise:+.1f} pp/AB "
          f"(measured pooled: +7.39)")

    # stratify by last-30 AB quartile (denominator proxy — the blend's largest window)
    live.sort(key=lambda p: p["ab30"])
    qs = [live[i * len(live) // 4:(i + 1) * len(live) // 4] for i in range(4)]
    print(f"\n{'quartile':<10} {'ab30':<10} {'n':<4} {'SD(bbr)':<8} "
          f"{'expAB slope':<18} {'walk-dim (per 0.1 wf)':<22} {'pa-dim (pp/AB)'}")
    for i, q in enumerate(qs):
        if len(q) < 8:
            print(f"Q{i+1}: n={len(q)} — too thin")
            continue
        rng = f"{q[0]['ab30']}–{q[-1]['ab30']}"
        b1, s1, = None, None
        E, Y = [p["eab"] for p in q], [p["y"] for p in q]
        mB, sB = multi_ols([E], Y)
        PA, WF = [p["pa"] for p in q], [p["wf"] * 10 for p in q]
        mb, ms = multi_ols([PA, WF], Y)
        print(f"Q{i+1:<9} {rng:<10} {len(q):<4} {sd([p['bbr'] for p in q]):<8.4f} "
              f"{mB[1]:+.2f} (SE {sB[1]:.2f})    {mb[2]:+.2f} (SE {ms[2]:.2f})       "
              f"{mb[1]:+.2f} (SE {ms[1]:.2f})")
    # halves as the coarser, better-powered cut
    for name, h in (("thin half", live[:len(live) // 2]), ("thick half", live[len(live) // 2:])):
        E, Y = [p["eab"] for p in h], [p["y"] for p in h]
        mB, sB = multi_ols([E], Y)
        PA, WF = [p["pa"] for p in h], [p["wf"] * 10 for p in h]
        mb, ms = multi_ols([PA, WF], Y)
        print(f"{name}: ab30 {h[0]['ab30']}–{h[-1]['ab30']}, n={len(h)}, SD(bbr) "
              f"{sd([p['bbr'] for p in h]):.4f}, expAB {mB[1]:+.2f} (SE {sB[1]:.2f}), "
              f"walk-dim {mb[2]:+.2f}/0.1 (SE {ms[2]:.2f}), pa-dim {mb[1]:+.2f} (SE {ms[1]:.2f})")


if __name__ == "__main__":
    main(sys.argv[1])
