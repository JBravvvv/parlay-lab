#!/usr/bin/env python3
"""Rung-signature check for the M7+M9 interlock — per row, per market, each row's OWN λ and expAB.

The interlock's testable prediction (2026-07-27): if M9's compensator is a uniform λ inflation
calibrated to cancel M7 at the 0.5 rung, then at every rung above 0.5 the model should sit
≈ +5 pp ABOVE a binomial truth that agrees with it at 0.5. The market is the stand-in for truth
at the LEVEL; the within-player rung DELTA does not even need that — any player-level market or
model offset differences out.

Method, per hits row:
  pModel = (pO − (1−W)·fO) / W          # un-blend; W read per-market off the board's own cats
  λ̂     = −ln(1 − pModel@0.5)          # exact inversion of shPOver at the 0.5 rung
  p_n    = 1 − (1−pModel@0.5)^(1/n)     # the binomial matched to the model AT 0.5 (per n)
  pred_k = PoisTail(k, λ̂) − Σ_n w_n·BinomTail(k, n, p_n)   # n ∈ {⌊expAB⌋, ⌈expAB⌉} mixture
  meas_k = pModel@k − fO@k
  Δmeas  = meas_k − meas_0.5            # within-player: differences out level offsets

expAB comes from the board's own case strings ("#N spot → ~X.X ABs" and the HRR re-base
"(~X.X AB vs Y.Y AB/g)") — exact engine output, never reconstructed. Coverage is reported;
rows without a case-string expAB fall back to the slate median ONLY in the labelled column.

Also: OLS of the O0.5 residual on expAB (hits and HRR). The slope survives a common market
bias that the level does not — see the 2026-07-27 turn.

Usage: python3 tools/rung_signature.py <archived-board.json[.gz]>
"""
import gzip, json, math, re, sys
from math import comb, exp, log

TOL_LADDER = 1.5  # pp — Poisson self-consistency of the recovered ladder (rounding noise ~0.9)


def load(path):
    f = gzip.open(path, "rt") if path.endswith(".gz") else open(path)
    w = json.load(f)
    return w.get("data", w)


def pois_tail(k, lam):
    return 1.0 - sum(exp(-lam) * lam**i / math.factorial(i) for i in range(k))


def binom_tail(k, n, p):
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


def matched_binom_tail(k, n_frac, q1):
    """P(X≥k) for the binomial matched to first-rung prob q1, n as a floor/ceil mixture."""
    lo, hi = int(math.floor(n_frac)), int(math.ceil(n_frac))
    frac = n_frac - lo
    out = 0.0
    for n, w in ((lo, 1 - frac), (hi, frac)):
        if w <= 0 or n < 1:
            continue
        p = 1 - (1 - q1) ** (1 / n)
        out += w * binom_tail(k, n, p)
    return out


def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    resid = [y - (a + b * x) for x, y in zip(xs, ys)]
    s2 = sum(r * r for r in resid) / (n - 2)
    return b, math.sqrt(s2 / sxx), a, n


def med(v):
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def main(path):
    d = load(path)

    # -- per-market blend weight, read off the board's own cats rows (calW can shrink it) --
    W = {}
    for mkt, rows in (d.get("categories") or {}).items():
        for r in rows if isinstance(rows, list) else []:
            if isinstance(r, dict) and r.get("wBlend") is not None and r.get("lkey"):
                parts = r["lkey"].split("|")
                if len(parts) >= 3:
                    W.setdefault(parts[1], set()).add(r["wBlend"])
    print("wBlend per market (from cats):", {k: sorted(v) for k, v in sorted(W.items())})
    Wm = {k: max(v) for k, v in W.items()}

    # -- expAB + quality controls per player, from the engine's own case strings --
    # avg30/xwOBA are INPUT-side quality reads — independent of pO/fO, so they can control a
    # quality-vs-volume confound without the circularity trap (rule 22): every price-derived
    # control is a function of the residual's own ingredients.
    exp_ab, spot_of, avg30, xwoba = {}, {}, {}, {}
    pat_spot = re.compile(r"#(\d+) spot → ~(\d+\.\d) ABs")
    pat_hrr = re.compile(r"\(~(\d+\.\d) AB vs (\d+\.\d) AB/g\)")
    pat_avg = re.compile(r"(\d+)-for-(\d+) \(\.(\d+)\)")
    pat_xw = re.compile(r"xwOBA (\d+)th pct")
    for mkt, rows in (d.get("categories") or {}).items():
        for r in rows if isinstance(rows, list) else []:
            if not isinstance(r, dict) or not r.get("lkey"):
                continue
            who = r["lkey"].split("|")[0]
            case = r.get("case") or ""
            m = pat_spot.search(case)
            if m:
                spot_of[who] = int(m.group(1))
                exp_ab[who] = float(m.group(2))
            else:
                m2 = pat_hrr.search(case)
                if m2:
                    exp_ab.setdefault(who, float(m2.group(1)))
            ma = pat_avg.search(case)
            if ma and int(ma.group(2)) >= 20:
                avg30.setdefault(who, int(ma.group(1)) / int(ma.group(2)))
            mx = pat_xw.search(case)
            if mx:
                xwoba.setdefault(who, int(mx.group(1)))
    print(f"expAB from case strings: {len(exp_ab)} players ({len(spot_of)} with a confirmed spot); "
          f"avg30 for {len(avg30)}, xwOBA pct for {len(xwoba)}")

    # -- collect propBoard rows, un-blend --
    # rowsBy[mkt][player][ln] = (pModel, fO)  — percent
    rowsBy = {}
    for g in d.get("propBoard") or []:
        for mkt, rows in (g.get("markets") or {}).items():
            for r in rows:
                if r.get("pO") is None or r.get("fO") is None:
                    continue
                w = Wm.get(mkt, 0.35)
                pm = (r["pO"] - (1 - w) * r["fO"]) / w
                who = (r.get("lkey") or "||").split("|")[0]
                rowsBy.setdefault(mkt, {}).setdefault(who, {})[r["ln"]] = (pm, r["fO"])

    # -- validation: the recovered hits ladder must be Poisson-consistent with itself --
    bad, checked, worst = 0, 0, 0.0
    for who, lns in rowsBy.get("batter_hits", {}).items():
        if 0.5 in lns and 1.5 in lns:
            q1 = lns[0.5][0] / 100
            if not (0 < q1 < 1):
                continue
            lam = -log(1 - q1)
            gap = abs(pois_tail(2, lam) * 100 - lns[1.5][0])
            checked += 1
            worst = max(worst, gap)
            if gap > TOL_LADDER:
                bad += 1
    print(f"\nladder self-consistency (hits): {checked} players with 0.5+1.5; "
          f"{bad} beyond {TOL_LADDER} pp; worst {worst:.2f} pp")

    # -- ITEM 1: rung table, measured vs predicted, per market --
    slate_med_ab = med(list(exp_ab.values())) if exp_ab else 4.1
    for mkt in ("batter_hits", "batter_total_bases", "batter_home_runs"):
        by = rowsBy.get(mkt, {})
        per_rung = {}
        for who, lns in by.items():
            for ln, (pm, fo) in lns.items():
                per_rung.setdefault(ln, []).append((who, pm - fo, pm, fo))
        print(f"\n== {mkt} ==")
        for ln in sorted(per_rung):
            rs = per_rung[ln]
            print(f"  O{ln}: n={len(rs)}  median(model−market) {med([r[1] for r in rs]):+.1f} pp"
                  f"  mean {sum(r[1] for r in rs)/len(rs):+.1f}")
        if mkt != "batter_hits":
            continue
        # hits: the per-row interlock prediction at rungs above 0.5, PAIRED per player
        for k, ln in ((2, 1.5), (3, 2.5)):
            pairs = []  # (Δmeasured, Δpredicted) — predicted needs the player's own expAB
            meas_all = []
            for who, lns in by.items():
                if 0.5 not in lns or ln not in lns:
                    continue
                q1 = lns[0.5][0] / 100
                if not (0.02 < q1 < 0.98):
                    continue
                lam = -log(1 - q1)
                dmeas = (lns[ln][0] - lns[ln][1]) - (lns[0.5][0] - lns[0.5][1])
                meas_all.append(dmeas)
                nab = exp_ab.get(who)
                if nab is not None:
                    dpred = (pois_tail(k, lam) - matched_binom_tail(k, nab, q1)) * 100
                    pairs.append((dmeas, dpred))
            if not meas_all:
                continue
            print(f"  INTERLOCK @O{ln}: n={len(meas_all)} within-player pairs "
                  f"(own expAB for {len(pairs)})")
            print(f"    Δmeasured  (rung − 0.5 residual): median {med(meas_all):+.2f} pp"
                  f"  mean {sum(meas_all)/len(meas_all):+.2f}")
            if len(pairs) >= 3:
                gaps = [p - m for m, p in pairs]
                mg = sum(gaps) / len(gaps)
                sd = math.sqrt(sum((g - mg) ** 2 for g in gaps) / (len(gaps) - 1))
                se = sd / math.sqrt(len(gaps))
                print(f"    Δpredicted (own expAB):          median {med([p for _, p in pairs]):+.2f} pp"
                      f"  mean {sum(p for _, p in pairs)/len(pairs):+.2f}")
                print(f"    paired shortfall (pred − meas): mean {mg:+.2f} pp  SE {se:.2f}"
                      f"  t {mg/se:.1f}  n {len(gaps)}")

    # -- ITEM 2 / ITEM 4: OLS of the O0.5 residual on expAB, with quality controls --
    def multi_ols(X, y):
        """OLS with intercept. X = list of regressor columns. Returns (betas, SEs)."""
        n, k = len(y), len(X) + 1
        rows = [[1.0] + [c[i] for c in X] for i in range(n)]
        XtX = [[sum(rows[i][a] * rows[i][b] for i in range(n)) for b in range(k)] for a in range(k)]
        Xty = [sum(rows[i][a] * y[i] for i in range(n)) for a in range(k)]
        # Gauss-Jordan inverse
        aug = [XtX[i][:] + [1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
        for col in range(k):
            piv = max(range(col, k), key=lambda r: abs(aug[r][col]))
            aug[col], aug[piv] = aug[piv], aug[col]
            pv = aug[col][col]
            aug[col] = [v / pv for v in aug[col]]
            for r in range(k):
                if r != col and aug[r][col]:
                    f = aug[r][col]
                    aug[r] = [v - f * w for v, w in zip(aug[r], aug[col])]
        inv = [row[k:] for row in aug]
        betas = [sum(inv[a][b] * Xty[b] for b in range(k)) for a in range(k)]
        resid = [y[i] - sum(betas[j] * rows[i][j] for j in range(k)) for i in range(n)]
        s2 = sum(r * r for r in resid) / (n - k)
        return betas, [math.sqrt(s2 * inv[j][j]) for j in range(k)]

    # sim-tag per lkey (archived cats top-50 only) — splits HRR's two pricing paths
    sim_tag = {}
    for mkt, rows in (d.get("categories") or {}).items():
        for r in rows if isinstance(rows, list) else []:
            if isinstance(r, dict) and r.get("lkey"):
                sim_tag[r["lkey"]] = "sim" in (r.get("tags") or [])

    for mkt in ("batter_hits", "batter_hits_runs_rbis"):
        pts = []  # (expAB, y, spot, avg30, xwoba, q1, who)
        total = 0
        for who, lns in rowsBy.get(mkt, {}).items():
            if 0.5 not in lns:
                continue
            total += 1
            if who in exp_ab:
                pm, fo = lns[0.5]
                pts.append((exp_ab[who], pm - fo, spot_of.get(who),
                            avg30.get(who), xwoba.get(who), pm / 100, who))
        if len(pts) < 10:
            print(f"\n{mkt} O0.5 regression: only {len(pts)} of {total} rows carry expAB — skipped")
            continue
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        b, se, a, n = ols(xs, ys)
        print(f"\n== {mkt} O0.5 residual ~ expAB ==")
        print(f"  simple: slope {b:+.2f} pp/AB (SE {se:.2f}), n={n} of {total} O0.5 rows; "
              f"intercept {a:+.1f}; expAB range {min(xs):.1f}–{max(xs):.1f}")
        # mean residual by lineup spot — the readable version of the same gradient
        by_spot = {}
        for eab, y, sp, *_ in pts:
            if sp:
                by_spot.setdefault(sp, []).append(y)
        line = "  by spot: " + "  ".join(
            f"#{sp} {sum(v)/len(v):+.1f}(n{len(v)})" for sp, v in sorted(by_spot.items()))
        print(line)
        # quality-controlled: does the expAB slope survive holding avg30 + xwOBA fixed?
        ctl = [(e, y, av, xw) for e, y, sp, av, xw, _, _w in pts if av is not None and xw is not None]
        if len(ctl) >= 15:
            E = [c[0] for c in ctl]
            Y = [c[1] for c in ctl]
            A = [c[2] * 100 for c in ctl]   # avg30 in points of average ×100
            Xw = [float(c[3]) for c in ctl]
            betas, ses = multi_ols([E, A, Xw], Y)
            print(f"  controlled (n={len(ctl)}): expAB {betas[1]:+.2f} (SE {ses[1]:.2f})  "
                  f"avg30 {betas[2]:+.2f}/pt (SE {ses[2]:.2f})  xwOBApct {betas[3]:+.3f} (SE {ses[3]:.3f})")
        if mkt == "batter_hits_runs_rbis":
            # HRR prices through TWO paths (game sim vs closed form) — same gradient in
            # both would place the defect upstream of either formula
            for label, want in (("sim-priced", True), ("closed-form", False)):
                sub = [(e, y) for e, y, sp, av, xw, q1, who in pts
                       if sim_tag.get(f"{who}|{mkt}|0.5") is want]
                if len(sub) >= 6:
                    b2, se2, _, n2 = ols([s[0] for s in sub], [s[1] for s in sub])
                    print(f"    {label}: slope {b2:+.2f} (SE {se2:.2f}) n={n2}  "
                          f"mean resid {sum(s[1] for s in sub)/n2:+.1f}")
                else:
                    print(f"    {label}: n={len(sub)} — too thin to regress"
                          + (f"  mean resid {sum(s[1] for s in sub)/len(sub):+.1f}" if sub else ""))
        # decompose expAB = pa(spot) × (1 − 0.9·bbr): which dimension carries the slope?
        # pa is the SLOT volume read; expAB/pa is the engine's walk discount.
        dec = [(4.68 - 0.11 * (sp - 1), e / (4.68 - 0.11 * (sp - 1)), y)
               for e, y, sp, *_ in pts if sp]
        if len(dec) >= 15:
            betas, ses = multi_ols([[x[0] for x in dec], [x[1] * 10 for x in dec]],
                                   [x[2] for x in dec])
            print(f"  decomposed (n={len(dec)}): pa(spot) {betas[1]:+.2f} pp/AB (SE {ses[1]:.2f})  "
                  f"walk-discount {betas[2]:+.2f} pp/0.1 (SE {ses[2]:.2f})")
        if mkt == "batter_hits":
            # the interlock's OWN predicted slope: fixed +13.9% λ inflation, per row
            pr = []
            for eab, y, sp, av, xw, q1, _w in pts:
                if not (0.02 < q1 < 0.98):
                    continue
                lam = -log(1 - q1)
                lam_true = lam / 1.139
                lo, hi = int(math.floor(eab)), int(math.ceil(eab))
                frac = eab - lo
                bt = 0.0
                for nn, wq in ((lo, 1 - frac), (hi, frac)):
                    if wq <= 0 or nn < 1:
                        continue
                    p = min(lam_true / nn, 0.99)
                    bt += wq * binom_tail(1, nn, p)
                pr.append((eab, (pois_tail(1, lam) - bt) * 100))
            bp, sep, ap, np_ = ols([p[0] for p in pr], [p[1] for p in pr])
            print(f"  interlock-predicted slope (fixed +13.9% λ): {bp:+.2f} pp/AB "
                  f"(n={np_}) — the measured slope must match this for M9-as-uniform to survive")


if __name__ == "__main__":
    main(sys.argv[1])
