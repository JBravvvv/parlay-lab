#!/usr/bin/env python3
"""INTRACLASS CORRELATION of the calibration residual — the clustering unit, measured.

WHY THIS EXISTS (2026-07-26)
----------------------------
Every standard error in the calibration channel assumes INDEPENDENT legs: the Wilson
interval behind `perMarket.significant`, `GAP_BUCKET_MIN_N`'s gap SE, and the H+R+RBI
retirement criterion proposed in docs/hrr-recalibration.md. Legs are not independent —
two props in the same game share a pitcher, a park and a weather draw.

The design effect is  DEFF = 1 + (m - 1) * rho , and the CLUSTERING UNIT decides the
verdict, not the correlation alone:

    game-level, m~7,   rho 0.05  -> DEFF 1.30 -> a 2.66-sigma result becomes 2.33
    game-level, m~7,   rho 0.111 -> DEFF 1.67 ->                            2.06
    day-level,  m~100, rho 0.05  -> DEFF 5.95 ->                            1.09

The 12.9-point H+R+RBI gap is 2.7 sigma independent and ~1.1 sigma under day-level
clustering. That is the difference between the proposed replacement criterion working and
being the same mistake in a different variable. **The amendment stays unsigned until this
script reports.**

rho was never measured. An attempt to back it out of the engine's own sim yielded exactly
ONE same-game leg pair on the captured fixture — not a measurement. So it has to come from
the graded record, which means it has to be measured DURING the window: capture-first, the
same rule as CLV and the HR overround test.

WHAT IT COMPUTES
----------------
The residual is  e_i = y_i - p_i  (outcome minus stated probability). Under correct
calibration E[e] = 0, so ICC is estimated one-way-random from the cluster decomposition:

    ICC = (MSB - MSW) / (MSB + (m0 - 1) * MSW)

with m0 the size-corrected mean cluster size. Reported at THREE candidate units — game,
day, player — and the data chooses, rather than a default being assumed. Negative ICC is
reported as-is, never clamped to 0: a negative value is evidence AGAINST clustering and
clamping it would quietly bias every downstream SE upward.

Requires the prediction store, which is sync-phrase gated — so this runs with the owner's
own key, never mine:

    python3 tools/icc.py --blob day-2026-07-26.json [more days...]
    python3 tools/icc.py --dir ./blobs
"""
import argparse, glob, json, math, os, sys
from collections import defaultdict

# below this many clusters the ICC point estimate is itself noise
MIN_CLUSTERS = 20
MIN_ROWS = 300


def icc_oneway(groups):
    """One-way random-effects ICC(1) over {cluster: [residuals]}."""
    groups = {k: v for k, v in groups.items() if len(v) >= 1}
    k = len(groups)
    n_tot = sum(len(v) for v in groups.values())
    if k < 2 or n_tot <= k:
        return None
    grand = sum(sum(v) for v in groups.values()) / n_tot
    ssb = sum(len(v) * (sum(v) / len(v) - grand) ** 2 for v in groups.values())
    ssw = sum(sum((x - (sum(v) / len(v))) ** 2 for x in v) for v in groups.values())
    msb = ssb / (k - 1)
    msw = ssw / (n_tot - k)
    sizes = [len(v) for v in groups.values()]
    # size-corrected mean cluster size (unequal groups)
    m0 = (n_tot - sum(s * s for s in sizes) / n_tot) / (k - 1)
    denom = msb + (m0 - 1) * msw
    if denom == 0:
        return None
    return {
        "icc": (msb - msw) / denom,
        "clusters": k,
        "rows": n_tot,
        "meanSize": round(n_tot / k, 2),
        "m0": round(m0, 2),
        "usable": k >= MIN_CLUSTERS and n_tot >= MIN_ROWS,
    }


def deff(rho, m):
    return 1 + (m - 1) * rho


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blob", nargs="*", default=[])
    ap.add_argument("--dir", default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    paths = list(a.blob)
    if a.dir:
        paths += sorted(glob.glob(os.path.join(a.dir, "*.json")))
    if not paths:
        print("no blobs given; --blob FILE... or --dir DIR", file=sys.stderr)
        return 2

    units = {"game": defaultdict(list), "day": defaultdict(list), "player": defaultdict(list)}
    graded = 0
    for path in paths:
        blob = json.load(open(path))
        date = blob.get("date") or os.path.basename(path)[:10]
        for r in (blob.get("records") or {}).values():
            if r.get("res") not in ("won", "lost"):
                continue
            if r.get("superseded"):
                continue
            p = r.get("p")
            if p is None:
                continue
            e = (1.0 if r["res"] == "won" else 0.0) - float(p) / 100.0
            graded += 1
            units["game"][f'{date}|{r.get("gkey")}'].append(e)
            units["day"][date].append(e)
            # prop lkeys are player|market|line; game markets have no player
            lk = str(r.get("lkey") or "")
            parts = lk.split("|")
            if len(parts) == 3:
                units["player"][f"{date}|{parts[0]}"].append(e)

    out = {"gradedRows": graded, "units": {}}
    print(f"graded rows: {graded}\n")
    print(f"{'unit':<8}{'clusters':>9}{'rows':>7}{'meanSize':>10}{'ICC':>9}{'usable':>8}")
    for name, g in units.items():
        r = icc_oneway(g)
        out["units"][name] = r
        if not r:
            print(f"{name:<8}{'—':>9}{'—':>7}{'—':>10}{'—':>9}{'no':>8}")
            continue
        print(f"{name:<8}{r['clusters']:>9}{r['rows']:>7}{r['meanSize']:>10}{r['icc']:>9.4f}{('yes' if r['usable'] else 'NO'):>8}")

    print("\nDesign effect at the measured ICC, and what it does to a 2.66-sigma result:")
    for name, r in out["units"].items():
        if not r:
            continue
        d = deff(r["icc"], r["m0"])
        d = max(d, 1e-9)
        flag = "" if r["usable"] else "   (NOT USABLE — too few clusters/rows)"
        print(f"  {name:<8} m0={r['m0']:<6} rho={r['icc']:+.4f}  DEFF={d:.2f}  2.66 -> {2.66 / math.sqrt(d):.2f} sigma{flag}")

    usable = [n for n, r in out["units"].items() if r and r["usable"]]
    if not usable:
        out["verdict"] = (
            f"INSUFFICIENT — need >= {MIN_CLUSTERS} clusters and >= {MIN_ROWS} graded rows at some unit. "
            "The HRR amendment stays unsigned."
        )
    else:
        worst = max(usable, key=lambda n: deff(out["units"][n]["icc"], out["units"][n]["m0"]))
        r = out["units"][worst]
        out["verdict"] = (
            f"Use the {worst} unit: it produces the largest design effect "
            f"(DEFF={deff(r['icc'], r['m0']):.2f}) among the units with enough data, which is the "
            f"conservative choice. Multiply every calibration-channel SE by {math.sqrt(max(deff(r['icc'], r['m0']), 1e-9)):.2f}."
        )
    print("\n" + out["verdict"])
    if a.json:
        json.dump(out, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
