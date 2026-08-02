#!/usr/bin/env python3
"""pitcher_outs model audit — sign, magnitude in OUTS, tail, and the 0.140 counterfactual.

    python3 tools/outs_audit.py b-2026-07-26.json
    curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-26" -o b.json

WHY THIS EXISTS (2026-07-26)
----------------------------
pitcher_outs supplied 46% of the selected legs on a board where it was 12.5% of rows, at a
median disagreement of 23.1 pp. Two defects were found and neither is board-specific in
mechanism. See docs/pitcher-outs-audit.md. NOTHING IS CHANGED BY THIS SCRIPT.

THREE MEASUREMENT RULES THIS SCRIPT ENCODES, each of which a first pass got wrong:

1. SIGN COMES FROM propBoard, NEVER FROM categories. `categories` is "top 50 per market
   ranked by win probability, ONE side per line (the side the model favors)" -- it
   manufactures the sign. |gap| is side-invariant so MAGNITUDES survive there; the sign does
   not. propBoard carries pO/fO both oriented to the OVER, uncapped.

2. propBoard.pO IS THE BLENDED PROBABILITY, not the model's. `modelBy` reads `r.p`, not
   `r.pModel`. Verified by a 273-row join against categories: 0 fair mismatches, ratio
   0.350 = wBlend. Raw model gaps are the blended figure / wBlend.

3. COMPARE MEANS IN OUTS, NOT PROBABILITIES. A probability gap confounds the mean with the
   line's position. Inverting the market fair through the engine's OWN Poisson puts both on
   the same scale and cancels the distributional assumption.
"""
import argparse, json, math, re, sys
from collections import defaultdict

# the engine's opposing-offense factor, legacy/index.html L2258
OF_CONST_AS_BUILT = 0.140   # divided into offense() = TB/AB ... which is SLUGGING
OF_CONST_CORRECT = 0.400    # league TB/AB; the same file uses 0.40 for the bvp adjustment
OF_CLAMP = (0.86, 1.12)


def med(xs):
    s = sorted(xs); n = len(s)
    return None if not n else (s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2)


def pois_cdf(k, lam):
    s, t = 0.0, math.exp(-lam)
    for i in range(int(k) + 1):
        s += t; t *= lam / (i + 1)
    return s


def p_over(line, lam):
    return 1 - pois_cdf(math.floor(line), lam)


def invert(line, p):
    """lambda such that the engine's own shPOver reproduces the market's fair"""
    lo, hi = 0.5, 40.0
    for _ in range(80):
        m = (lo + hi) / 2
        if p_over(line, m) < p: lo = m
        else: hi = m
    return (lo + hi) / 2


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("board")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()
    d = json.load(open(a.board))["board"]["data"]

    # ---- RULE 1: side-neutral population -----------------------------------
    pb = defaultdict(dict)
    for g in d.get("propBoard") or []:
        for mkt, rs in (g.get("markets") or {}).items():
            for r in rs:
                if r.get("alt") or r.get("pO") is None or r.get("fO") is None: continue
                pb[mkt][r["lkey"]] = r

    print("SIGNED BLENDED GAP (pO - fO), propBoard, both sides oriented to the OVER, alt excluded")
    print(f"{'market':<24}{'n':>6}{'median':>9}{'mean':>8}{'%>0':>7}")
    for mkt in sorted(pb, key=lambda m: -len(pb[m])):
        g = [r["pO"] - r["fO"] for r in pb[mkt].values()]
        print(f"{mkt:<24}{len(g):>6}{med(g):>9.1f}{sum(g)/len(g):>8.1f}"
              f"{100*sum(1 for x in g if x > 0)/len(g):>6.0f}%")

    # ---- RULE 2: recover wBlend by a real join, do not assume 0.35 ----------
    ratios = []
    for r in (d.get("categories") or {}).get("pitcher_outs", []):
        p = pb["pitcher_outs"].get(r.get("lkey"))
        if not p or r.get("pModel") is None: continue
        side = "O" if " O " in (r.get("sub") or "") else "U"
        pmO = r["pModel"] if side == "O" else 100 - r["pModel"]
        fO = r["implied"] if side == "O" else 100 - r["implied"]
        if abs(fO - p["fO"]) > 0.15: continue
        raw = pmO - p["fO"]
        if abs(raw) > 0.05: ratios.append((p["pO"] - p["fO"]) / raw)
    w = med(ratios)
    print(f"\nwBlend recovered from a {len(ratios)}-row join: {w:.4f}  (raw gap = blended / wBlend)")

    # ---- outs rows: back out every model term from the published `case` -----
    rows, seen = [], set()
    for r in (d.get("categories") or {}).get("pitcher_outs", []):
        if r["lkey"] in seen: continue
        seen.add(r["lkey"])
        p = pb["pitcher_outs"].get(r["lkey"])
        if not p: continue
        m = re.search(r"([\d.]+) IP over (\d+) starts", r["case"])
        l = re.search(r"~([\d.]+) outs", r["case"])
        o = re.search(r"opposing lineup ([\d.]+) TB/AB", r["case"])
        if not (m and l): continue
        oo = float(o.group(1)) if o else None
        ofn = clamp(OF_CONST_AS_BUILT / oo, *OF_CLAMP) if oo else 1.0
        off = clamp(OF_CONST_CORRECT / oo, *OF_CLAMP) if oo else 1.0
        lam = float(l.group(1))
        rows.append({"name": r["label"], "line": p["ln"], "lam": lam, "lamFix": lam / ofn * off,
                     "lmkt": invert(p["ln"], p["fO"] / 100), "fair": p["fO"], "oo": oo,
                     "ofn": ofn, "off": off, "ipg": float(m.group(1)) / int(m.group(2)),
                     "side": "U" if " U " in (r.get("sub") or "") else "O"})

    withOo = [r for r in rows if r["oo"]]
    atFloor = [r for r in withOo if abs(r["ofn"] - OF_CLAMP[0]) < 1e-9]
    print(f"\nTHE {OF_CONST_AS_BUILT} CONSTANT — offense() returns TB/AB (slugging, league ~{OF_CONST_CORRECT})")
    print(f"  rows with an opposing-lineup read : {len(withOo)} of {len(rows)}")
    print(f"  {OF_CONST_AS_BUILT}/oo range              : "
          f"{min(OF_CONST_AS_BUILT/r['oo'] for r in withOo):.3f} - {max(OF_CONST_AS_BUILT/r['oo'] for r in withOo):.3f}")
    print(f"  pinned at the {OF_CLAMP[0]} clamp floor  : {len(atFloor)} of {len(withOo)}"
          f"  ({100*len(atFloor)/max(1,len(withOo)):.0f}%)")
    print(f"  oo needed to reach the {OF_CLAMP[1]} cap  : <= {OF_CONST_AS_BUILT/OF_CLAMP[1]:.3f} TB/AB"
          f"   (observed min {min(r['oo'] for r in withOo):.3f}) -> UNREACHABLE")
    print(f"  distinct reachable of values      : {sorted({round(r['ofn'],3) for r in rows})}")

    dl = [r["lam"] - r["lmkt"] for r in rows]
    dlf = [r["lamFix"] - r["lmkt"] for r in rows]
    g0 = [(p_over(r["line"], r["lam"]) * 100 - r["fair"]) / w * w for r in rows]
    raw0 = [(p_over(r["line"], r["lam"]) * 100 - r["fair"]) for r in rows]
    raw1 = [(p_over(r["line"], r["lamFix"]) * 100 - r["fair"]) for r in rows]
    print(f"\nMAGNITUDE IN OUTS (market fair inverted through the engine's own Poisson), n={len(rows)}")
    print(f"  lamModel - lamMkt   median {med(dl):+.2f} outs ({med(dl)/3:+.2f} IP)"
          f"   negative in {sum(1 for x in dl if x < 0)}/{len(dl)}")
    print(f"  with {OF_CONST_AS_BUILT} -> {OF_CONST_CORRECT}   median {med(dlf):+.2f} outs"
          f"   negative in {sum(1 for x in dlf if x < 0)}/{len(dlf)}")
    print(f"  raw model gap       as built {med(raw0):+.1f} pp, above market in {sum(1 for x in raw0 if x>0)}/{len(raw0)}")
    print(f"                      corrected {med(raw1):+.1f} pp, above market in {sum(1 for x in raw1 if x>0)}/{len(raw1)}")
    print(f"  sides on the board  {sum(1 for r in rows if r['side']=='U')} UNDER / "
          f"{sum(1 for r in rows if r['side']=='O')} OVER")

    print("\nBY LINE — does the shortfall grow toward the tail?")
    by = defaultdict(list)
    for r in rows: by[r["line"]].append(r)
    print(f"{'line':>7}{'n':>4}{'asBuilt':>10}{'corrected':>11}   (lamModel - lamMkt, outs)")
    for ln in sorted(by):
        v = by[ln]
        print(f"{ln:>7}{len(v):>4}{med([r['lam']-r['lmkt'] for r in v]):>10.2f}"
              f"{med([r['lamFix']-r['lmkt'] for r in v]):>11.2f}")
    for lab, f in (("<= 15.5", lambda r: r["line"] <= 15.5), (">= 16.5", lambda r: r["line"] >= 16.5)):
        v = [r for r in rows if f(r)]
        print(f"  lines {lab}  n={len(v):<3} asBuilt {med([r['lam']-r['lmkt'] for r in v]):+.2f}"
              f"   corrected {med([r['lamFix']-r['lmkt'] for r in v]):+.2f}")

    # Lipg is recoverable in closed form from any row with no lineup read (of == 1)
    free = [r for r in rows if not r["oo"]]
    if free:
        print(f"\nLipg recovered from the {len(free)} rows with no lineup read (of == 1.00):")
        for r in free:
            print(f"  {r['name'][:28]:<30} ipgRaw {r['ipg']:.2f}  lam {r['lam']:.1f}"
                  f"  -> Lipg = {2*(r['lam']/3) - r['ipg']:.2f} IP/start")

    if a.json:
        json.dump({"rows": rows, "wBlend": w, "medDeltaOuts": med(dl),
                   "medDeltaOutsFixed": med(dlf), "atFloor": len(atFloor),
                   "withOo": len(withOo)}, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
