#!/usr/bin/env python3
"""Close fairs per board row — Series A's first build (2026-07-27, ordered before the join).

Reads a date's props archive (`data/props/<date>.json` on the line-history branch), takes the
`kind == "close"` snapshot, and emits one JSON: `{lkey: {fair, n, mins, night}}` keyed exactly
as the archived board keys its rows (pnorm slug | market | line), plus coverage counts.

Quality stamps per row: `mins` = minutes from the close snapshot to that event's first pitch
(the close-quality stamp — Series B's lesson was that a "close" 2.5h out attenuates every
slope); `night` = first pitch 22:00Z or later (the day/night stamp).

The `--spot N` mode re-derives `fair` for N sampled rows from the stored raw per-book prices
(median across books of the per-book two-sided de-vig, iO/(iO+iU)) and prints stored vs
recomputed side by side — the pipeline is spot-checked BEFORE anything regresses on it.

Usage:
  git show origin/line-history:data/props/2026-07-27.json > /tmp/p.json
  python3 tools/close_fair.py /tmp/p.json --out close-2026-07-27.json --spot 5
"""
import json, re, sys, unicodedata
from datetime import datetime
from statistics import median


def pnorm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def imp(am):
    am = float(am)
    return 100.0 / (am + 100.0) if am > 0 else -am / (-am + 100.0)


def devig2(o, u):
    io, iu = imp(o), imp(u)
    return io / (io + iu) if (io + iu) > 0 else None


def main(path, out=None, spot=0):
    d = json.load(open(path))
    closes = [s for s in d.get("snapshots", []) if s.get("kind") == "close"]
    if not closes:
        print("NO close snapshot in this file — every event is an attrition row for this date")
        return
    snap = closes[-1]
    at = datetime.fromisoformat(snap["t"])
    rows, per_mkt, spot_rows = {}, {}, []
    for ev in snap["events"]:
        start = datetime.fromisoformat(ev["start"].replace("Z", "+00:00"))
        mins = (start - at).total_seconds() / 60.0
        night = start.hour >= 22 or start.hour < 4
        for mkt, mrows in (ev.get("markets") or {}).items():
            for key, r in mrows.items():
                if r.get("fair") is None:
                    continue
                who, ln = key.rsplit("|", 1)
                lkey = f"{pnorm(who)}|{mkt}|{ln}"
                rows[lkey] = {"fair": r["fair"], "n": r.get("n"), "mins": round(mins, 1),
                              "night": night}
                per_mkt[mkt] = per_mkt.get(mkt, 0) + 1
                if r.get("fp") and len(r["fp"]) >= 2:
                    spot_rows.append((lkey, r))
    print(f"close snapshot {snap['t']}  events {len(snap['events'])}  rows {len(rows)}")
    print("  per market:", dict(sorted(per_mkt.items())))
    neg = [k for k, v in rows.items() if v["mins"] < 0]
    print(f"  events already started at capture: rows with mins<0: {len(neg)}")
    if spot and spot_rows:
        step = max(1, len(spot_rows) // spot)
        print(f"\nSPOT CHECK — stored `fair` vs median per-book de-vig from the stored raw prices:")
        for lkey, r in spot_rows[::step][:spot]:
            per_book = [devig2(o, u) for o, u in r["fp"].values()
                        if o is not None and u is not None]
            per_book = [p for p in per_book if p is not None]
            rec = median(per_book) if per_book else None
            flag = "OK" if rec is not None and abs(rec - r["fair"]) < 0.005 else "⚠️ DIFFERS"
            print(f"  {lkey:<44} stored {r['fair']:.4f}  recomputed {rec:.4f}  "
                  f"n={r.get('n')}  {flag}")
    if out:
        json.dump({"date": path, "at": snap["t"], "rows": rows}, open(out, "w"))
        print(f"\nwrote {out} ({len(rows)} rows)")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0],
         a[a.index("--out") + 1] if "--out" in a else None,
         int(a[a.index("--spot") + 1]) if "--spot" in a else 0)
