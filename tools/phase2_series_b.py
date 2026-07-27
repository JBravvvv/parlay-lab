#!/usr/bin/env python3
"""PHASE 2 / SERIES B — the close-half, built and validated without the sync phrase.

    python3 tools/phase2_series_b.py --dir path/to/data/props [--out join.json]

WHAT THIS IS
------------
Series A's headline is the MOVEMENT SLOPE: regression of `(close_fair - open_fair)` on
`(pModel - open_fair)`. `pModel` sits behind `/api/predictions` and needs the owner's sync
phrase, so **this tool builds and validates everything except the join**, and emits a
join-ready table keyed by `(date, market, player, line)`.

Per docs/phase2-memo.md the two vintages are NEVER pooled. This is **Series B**:
`data/props/` from 2026-07-12 to 2026-07-26, whose `fair` is PROPORTIONAL de-vig, not the
engine's Shin. Series A (from 2026-07-27, multi-book Shin recomputed from `fp`) is a
different instrument and gets its own run.

THREE THINGS THIS MEASURES BEFORE ANY SLOPE IS FIT
--------------------------------------------------
1. **Is there a close at all?** The later snapshot lands ~20:16 UTC while first pitches are
   22:40-23:20 UTC, so it is a **T-2.5h reading, not a close**. The field is therefore named
   `late_fair`, never `close_fair`. THIS ATTENUATES ANY SLOPE TOWARD ZERO, which matters
   because "slope near 0" is a pre-committed reading — see the memo's warning.
2. **Attrition.** Only ~56% of open rows have a later reading. If the missing rows are not
   missing at random the movement distribution is selected, and every rule in
   docs/harness-substitutions.md about selected populations applies.
3. **Rung.** The H+R+RBI error is +11.5pp at O0.5 and -1.4pp at O1.5 — opposite signs inside
   one market. Everything is bucketed by (market, rung); the market-level number is secondary
   and, when rungs disagree in sign, is not reported at all.
"""
import argparse, glob, json, os, sys
from collections import defaultdict

MIN_RUNG_N = 30  # memo: below this a rung is listed with its count and no statistic


def med(xs):
    s = sorted(xs)
    n = len(s)
    return None if not n else (s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2)


def q(xs, p):
    s = sorted(xs)
    return None if not s else s[min(len(s) - 1, int(p * len(s)))]


def flatten(snap):
    """{(event, market, player, line): (fair, n, czf)} for one snapshot"""
    out = {}
    for e in snap.get("events", []):
        for mkt, rows in (e.get("markets") or {}).items():
            for kk, r in rows.items():
                if r.get("fair") is None:
                    continue
                who, _, ln = kk.rpartition("|")
                try:
                    lnf = float(ln)
                except ValueError:
                    continue
                out[(e["id"], mkt, who, lnf)] = (r["fair"], r.get("n") or 0, bool(r.get("czf")))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="data/props from the line-history branch")
    ap.add_argument("--out", default=None, help="write the join-ready table here")
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(a.dir, "*.json")))
    if not files:
        print("no day files found", file=sys.stderr)
        return 2

    rows, days, gaps = [], [], []
    n_open = n_join = 0
    attrition_by = defaultdict(lambda: [0, 0])
    for f in files:
        day = os.path.basename(f)[:10]
        d = json.load(open(f))
        ss = d.get("snapshots") or []
        if len(ss) < 2:
            days.append((day, len(ss), None, None, 0, 0))
            continue
        t0, t1 = ss[0]["t"], ss[-1]["t"]
        gaps.append((t0[11:16], t1[11:16]))
        o, l = flatten(ss[0]), flatten(ss[-1])
        n_open += len(o)
        for k, (f0, n0, cz0) in o.items():
            attrition_by[k[1]][0] += 1
            # bucket the OPEN fair so attrition can be tested against it
            if k in l:
                n_join += 1
                attrition_by[k[1]][1] += 1
                rows.append({"date": day, "market": k[1], "player": k[2], "line": k[3],
                             "open_fair": f0, "late_fair": l[k][0], "move": l[k][0] - f0,
                             "n_open": n0, "n_late": l[k][1], "czf_open": cz0,
                             "t_open": t0, "t_late": t1})
        days.append((day, len(ss), t0[11:16], t1[11:16], len(o), sum(1 for k in o if k in l)))

    print("PHASE 2 / SERIES B — close-half feasibility  (proportional de-vig; NOT the engine's Shin)\n")
    print(f"{'day':<12}{'snaps':>6}{'first':>8}{'last':>8}{'open rows':>11}{'joined':>8}{'pct':>6}")
    for day, ns, t0, t1, no, nj in days:
        print(f"{day:<12}{ns:>6}{(t0 or '—'):>8}{(t1 or '—'):>8}{no:>11}{nj:>8}"
              f"{(f'{100*nj/no:.0f}%' if no else '—'):>6}")
    print(f"\n{'TOTAL':<12}{'':>6}{'':>8}{'':>8}{n_open:>11}{n_join:>8}"
          f"{(f'{100*n_join/max(1,n_open):.0f}%'):>6}")

    print("\n⚠️  THERE IS NO CLOSE IN THIS ARCHIVE.")
    print("   The later snapshot lands ~20:15 UTC; first pitches run 22:40-23:20 UTC, so every")
    print("   reading is T-2.5h or earlier. The field is `late_fair`, NOT `close_fair`.")
    print("   Consequence: the movement slope measured here is ATTENUATED toward 0 by the")
    print("   fraction of the day's move that happens after 20:15. A slope near 0 in Series B")
    print("   therefore CANNOT be read as 'no edge' — that reading needs a real close.")
    print("   Configured cron is 17:00 and 22:45 UTC on BOTH main and frontend-rebuild; the")
    print("   observed timestamps match neither. UNEXPLAINED — resolve from the Actions run log")
    print("   before Series A's close definition is trusted.")

    print(f"\nATTRITION BY MARKET  (open rows with no later reading)")
    print(f"{'market':<26}{'open':>7}{'joined':>8}{'lost':>7}{'pct kept':>10}")
    for m, (x, y) in sorted(attrition_by.items(), key=lambda kv: -kv[1][0]):
        print(f"{m:<26}{x:>7}{y:>8}{x-y:>7}{100*y/max(1,x):>9.0f}%")
    print("  batter_home_runs is absent by construction: it is quoted one-sided, so `fair` is")
    print("  null on 100% of its rows (docs/collection-period.md).")

    # is attrition related to the open fair itself? if so the surviving set is selected
    if rows:
        kept = [r["open_fair"] for r in rows]
        print(f"\n  open_fair of SURVIVING rows: p10 {q(kept,.10):.3f}  median {med(kept):.3f}  p90 {q(kept,.90):.3f}")
        print("  (the lost rows' fairs are recoverable from the same file — run the comparison")
        print("   before fitting, per the selected-population rule)")

    print(f"\nMOVEMENT open -> late, SIGNED, by market x rung   (min n for a statistic: {MIN_RUNG_N})")
    print(f"{'market':<26}{'rung':>6}{'n':>7}{'median':>9}{'p25':>8}{'p75':>8}{'|move|med':>11}{'%up':>6}")
    byk = defaultdict(list)
    for r in rows:
        byk[(r["market"], r["line"])].append(r["move"] * 100)
    for (m, ln), v in sorted(byk.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        if len(v) < MIN_RUNG_N:
            print(f"{m:<26}{ln:>6}{len(v):>7}   (below n={MIN_RUNG_N}, no statistic reported)")
            continue
        print(f"{m:<26}{ln:>6}{len(v):>7}{med(v):>+9.2f}{q(v,.25):>+8.2f}{q(v,.75):>+8.2f}"
              f"{med([abs(x) for x in v]):>11.2f}{100*sum(1 for x in v if x>0)/len(v):>5.0f}%")

    if a.out:
        json.dump(rows, open(a.out, "w"))
        print(f"\njoin-ready table -> {a.out}  ({len(rows)} rows)")
        print("  key: (date, market, player, line). Join to the prediction store's pModel on the")
        print("  same key to fit  move ~ (pModel - open_fair).  THAT JOIN NEEDS THE SYNC PHRASE.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
