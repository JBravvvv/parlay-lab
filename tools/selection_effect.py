#!/usr/bin/env python3
"""Winner's-curse ratio, decomposed. Exactly multiplicative, no undefined strata.

    python3 tools/selection_effect.py b-2026-07-26.json
    curl -s "https://parlay-lab-six.vercel.app/api/board?date=2026-07-26" -o b.json

WHY THIS EXISTS (2026-07-26)
----------------------------
The pooled ratio  median|pModel-implied| over SELECTED legs / same over the BOARD  came out
at 2.13 and was about to become Phase 3's global shrink factor. It is almost entirely
COMPOSITION: no market's own ratio exceeds 1.81, none has a CI excluding 1, and pitcher_outs
runs 0.83 — the gate selects LESS extreme rows there than the outs board average, so a
global 1/2.13 would invert on the market supplying 46% of the legs.

Phase 3's band must therefore be PER-MARKET, and on one board no per-market band is
estimable at all (every CI contains 1). See docs/collection-period.md.

    R_pooled = AVAILABILITY x MIX x WITHIN

  AVAILABILITY  med(board restricted to the markets the gate can draw from) / med(board, all)
                -- half the board's markets contribute zero selected legs (HR dies at
                   coreNoHR; hits/ml/rl simply never clear +2%). Standardising "back to the
                   board mix" is UNDEFINED for a stratum with no sampled units, so the
                   market-set restriction is its own term rather than being folded into mix.
    MIX         med(restricted board reweighted to the selected market shares) / med(restricted)
    WITHIN      med(selected) / med(restricted board reweighted to selected shares)
                -- the actual winner's curse.
"""
import json, sys, random
from collections import defaultdict

random.seed(20260726)
B = 4000
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "b-2026-07-26.json"))["board"]["data"]
LABEL = {"ml": "ml", "rl": "rl", "batter_hits": "hits", "batter_total_bases": "TB",
         "batter_home_runs": "HR", "batter_hits_runs_rbis": "HRR",
         "pitcher_strikeouts": "K's", "pitcher_outs": "outs"}


def med(xs):
    s = sorted(xs); n = len(s)
    if not n: return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def wmed(pairs):
    s = sorted(pairs); tot = sum(w for _, w in s)
    if tot <= 0: return None
    c = 0
    for v, w in s:
        c += w
        if c >= tot / 2: return v
    return s[-1][0]


rows, by_mkt = {}, defaultdict(list)
for mkt, rs in (d.get("categories") or {}).items():
    if mkt == "all": continue
    for r in rs:
        if r.get("pModel") is None or r.get("implied") is None: continue
        rec = {"mkt": mkt, "gkey": r.get("gkey"), "lkey": r.get("lkey"),
               "gap": r["pModel"] - r["implied"], "sel": False}
        rows[(r.get("gkey"), r.get("lkey"))] = rec
        by_mkt[mkt].append(rec)

pool = [p for p in (d.get("parlays") or []) if p.get("czDec") is not None]
pool += [p for p in (d.get("parlaysMixed") or [])
         if p.get("czDec") is not None and not any(l.get("live") for l in p["legs"])]
core = lambda pl: not (pl.get("type") == "batter_home_runs"
    or any("|batter_home_runs|" in (l.get("lkey") or "") for l in pl["legs"])
    or len(pl["legs"]) > 3 or (pl.get("czDec") is not None and pl["czDec"] > 15))
sel_tix = [p for p in pool if core(p) and (p.get("czEv") or -99) >= 2]
for p in sel_tix:
    for l in p["legs"]:
        r = rows.get((l.get("gkey"), l.get("lkey")))
        if r: r["sel"] = True

board = list(rows.values())
sel = [r for r in board if r["sel"]]
M4 = sorted({r["mkt"] for r in sel})
restricted = [r for r in board if r["mkt"] in M4]


def terms(pop):
    """all three ratios from one population; used for the point estimate and each bootstrap"""
    s = [r for r in pop if r["sel"]]
    rst = [r for r in pop if r["mkt"] in M4]
    if len(s) < 3 or not rst: return None
    mB, mR, mS = med([abs(r["gap"]) for r in pop]), med([abs(r["gap"]) for r in rst]), med([abs(r["gap"]) for r in s])
    nR = defaultdict(int); nS = defaultdict(int)
    for r in rst: nR[r["mkt"]] += 1
    for r in s: nS[r["mkt"]] += 1
    mixw = wmed([(abs(r["gap"]), (nS[r["mkt"]] / len(s)) / (nR[r["mkt"]] / len(rst)))
                 for r in rst if nR[r["mkt"]]])
    if not (mB and mR and mixw): return None
    return {"pooled": mS / mB, "avail": mR / mB, "mix": mixw / mR, "within": mS / mixw,
            "mB": mB, "mR": mR, "mixw": mixw, "mS": mS}


pt = terms(board)
games = defaultdict(list)
for r in board: games[r["gkey"]].append(r)
gk = list(games)
boots = defaultdict(list)
for _ in range(B):
    draw = [r for g in (random.choice(gk) for _ in gk) for r in games[g]]
    t = terms(draw)
    if t:
        for k in ("pooled", "avail", "mix", "within"): boots[k].append(t[k])


def ci(k):
    v = sorted(boots[k])
    return (v[int(.025 * len(v))], v[int(.975 * len(v))]) if len(v) > 100 else (None, None)


print(f"board {len(board)} rows | selected {len(sel)} distinct legs from {len(sel_tix)} tickets")
print(f"markets the gate drew from: {', '.join(LABEL[m] for m in M4)} "
      f"({len(restricted)} of {len(board)} board rows)\n")
print("MULTIPLICATIVE DECOMPOSITION OF THE POOLED RATIO   (game-clustered 95% CI, 4000 resamples)")
for k, name, note in [("pooled", "POOLED", f"{pt['mS']:.1f} / {pt['mB']:.1f}"),
                      ("avail", "  AVAILABILITY", f"{pt['mR']:.1f} / {pt['mB']:.1f}  which markets the gate can reach"),
                      ("mix", "  MIX", f"{pt['mixw']:.1f} / {pt['mR']:.1f}  weighting inside those markets"),
                      ("within", "  WITHIN", f"{pt['mS']:.1f} / {pt['mixw']:.1f}  the actual winner's curse")]:
    lo, hi = ci(k)
    print(f"{name:<16}{pt[k]:>6.2f}   [{lo:.2f}, {hi:.2f}]   {note}")
print(f"{'  check':<16}{pt['avail']*pt['mix']*pt['within']:>6.2f}   (avail x mix x within)\n")

print("PER-MARKET, SELECTED vs BOARD  (|pModel - implied|, pp)")
print(f"{'mkt':<6}{'nBoard':>7}{'medBd':>7}{'nSel':>5}{'medSel':>8}{'ratio':>7}   95% CI          "
      f"{'nUnsel':>7}{'medUns':>8}{'sel/uns':>8}")
sel_by = defaultdict(list)
for r in sel: sel_by[r["mkt"]].append(r)
per = {}
for m in sorted(by_mkt, key=lambda m: -len(sel_by.get(m, []))):
    bd = [abs(r["gap"]) for r in by_mkt[m]]
    sl = [abs(r["gap"]) for r in sel_by.get(m, [])]
    un = [abs(r["gap"]) for r in by_mkt[m] if not r["sel"]]
    mB, mS, mU = med(bd), (med(sl) if sl else None), (med(un) if un else None)
    if len(sl) >= 3:
        gm = defaultdict(list)
        for r in by_mkt[m]: gm[r["gkey"]].append(r)
        keys = list(gm); bs = []
        for _ in range(B):
            dr = [r for g in (random.choice(keys) for _ in keys) for r in gm[g]]
            ss = [abs(r["gap"]) for r in dr if r["sel"]]
            aa = [abs(r["gap"]) for r in dr]
            if len(ss) >= 3 and med(aa): bs.append(med(ss) / med(aa))
        bs.sort(); lo, hi = bs[int(.025 * len(bs))], bs[int(.975 * len(bs))]
        cis = f"[{lo:.2f}, {hi:.2f}]"
    else:
        lo = hi = None; cis = "— (n<3)"
    per[LABEL[m]] = {"nB": len(bd), "medB": mB, "nS": len(sl), "medS": mS,
                     "ratio": (mS / mB) if mS else None, "lo": lo, "hi": hi,
                     "nU": len(un), "medU": mU}
    print(f"{LABEL[m]:<6}{len(bd):>7}{mB:>7.1f}{len(sl):>5}"
          f"{(f'{mS:.1f}' if mS is not None else '—'):>8}"
          f"{(f'{mS/mB:.2f}' if mS is not None else '—'):>7}   {cis:<16}"
          f"{len(un):>7}{(f'{mU:.1f}' if mU is not None else '—'):>8}"
          f"{(f'{mS/mU:.2f}' if (mS is not None and mU) else '—'):>8}")

print("\nSIGN OF THE GAP (pModel - implied, signed pp) — board rows")
print(f"{'mkt':<6}{'n':>5}{'medSigned':>11}{'%high':>8}{'p10':>8}{'p50':>8}{'p90':>8}")
for m in sorted(by_mkt, key=lambda m: -med([abs(r['gap']) for r in by_mkt[m]])):
    g = sorted(r["gap"] for r in by_mkt[m]); n = len(g)
    q = lambda p: g[min(n - 1, int(p * n))]
    print(f"{LABEL[m]:<6}{n:>5}{med(g):>11.1f}{100*sum(1 for x in g if x>0)/n:>7.0f}%"
          f"{q(.10):>8.1f}{q(.50):>8.1f}{q(.90):>8.1f}")

json.dump({"terms": {k: [pt[k], *ci(k)] for k in ("pooled", "avail", "mix", "within")},
           "per": per}, open("mixdecomp2.json", "w"), indent=2)
