#!/usr/bin/env python3
"""CLOSE CAPTURE RATE — Phase 2's health metric, and it is not row volume.

    python3 tools/close_capture.py --dir path/to/data/props
    python3 tools/close_capture.py --dir data/props --since 2026-07-27

WHY THIS AND NOT ROW COUNT
--------------------------
Series A's instrument is the CLOSE. A day whose ten crons all miss the ~95-minute window
writes a perfectly healthy-looking file full of `pre` readings and no close — hundreds of
rows, and nothing Series A can use. Row volume reports that day as fine. Nothing else was
watching it, and a missed close is unrecoverable: the price is gone.

So the number to read daily is: **did a close land, and how far ahead of first pitch was it.**

WHAT A HEALTHY DAY LOOKS LIKE
-----------------------------
  kinds        at least one `close`
  lead         the close lands INSIDE CLOSE_WINDOW_S (95 min) of the next unstarted first
               pitch. A "close" 6 hours out is a mislabelled `pre`
  fp           per-book prices present, which is what lets Series A recompute Shin de-vig
               instead of inheriting Series B's proportional one

`kind` and `fp` were both added on 2026-07-27 and NO snapshot carried them before that date;
files older than that legitimately report `kind: —` and `fp: no`, and are Series B's vintage.
The two vintages are never pooled (docs/phase2-memo.md).
"""
import argparse, glob, json, os, sys
from datetime import datetime, timezone

CLOSE_WINDOW_S = 95 * 60  # must match tools/snapshot_props.py
VINTAGE_A = "2026-07-27"  # first date `kind` + `fp` can exist


def parse_t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="data/props from the line-history branch")
    ap.add_argument("--since", default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(a.dir, "*.json")))
    if a.since:
        files = [f for f in files if os.path.basename(f)[:10] >= a.since]
    if not files:
        print("no day files", file=sys.stderr)
        return 2

    print(f"{'day':<12}{'snaps':>6}{'close':>7}{'pre':>5}{'lead':>9}{'fp':>5}{'rows':>7}  note")
    out, closes, days_a = [], 0, 0
    for f in files:
        day = os.path.basename(f)[:10]
        d = json.load(open(f))
        ss = d.get("snapshots") or []
        kinds = [s.get("kind") for s in ss]
        nclose = sum(1 for k in kinds if k == "close")
        npre = sum(1 for k in kinds if k == "pre")

        # first pitch of the slate, from whichever snapshot carries commence times
        starts = []
        for s in ss:
            for e in s.get("events", []):
                t = parse_t(e.get("commence"))
                if t:
                    starts.append(t)
        first = min(starts) if starts else None

        # lead of the LAST close before first pitch
        lead = None
        for s in ss:
            if s.get("kind") != "close":
                continue
            t = parse_t(s.get("t"))
            if t and first and t <= first:
                gap = (first - t).total_seconds()
                lead = gap if lead is None else min(lead, gap)

        rows = sum(len(r) for s in ss for e in s.get("events", []) for r in (e.get("markets") or {}).values())
        has_fp = any(bool(r.get("fp")) for s in ss for e in s.get("events", [])
                     for mk in (e.get("markets") or {}).values() for r in mk.values())

        note = ""
        if day < VINTAGE_A:
            note = "Series B vintage — kind/fp predate it"
        elif nclose == 0:
            note = "*** NO CLOSE — unrecoverable hole in the primary instrument ***"
        elif lead is None:
            note = "close recorded but not before first pitch — check the labelling"
        elif lead > CLOSE_WINDOW_S:
            note = f"close is {lead/60:.0f} min out — wider than the {CLOSE_WINDOW_S/60:.0f} min window"
        elif not has_fp:
            note = "no `fp` — Series A cannot recompute Shin de-vig on this day"

        if day >= VINTAGE_A:
            days_a += 1
            closes += 1 if nclose else 0
        print(f"{day:<12}{len(ss):>6}{nclose:>7}{npre:>5}"
              f"{(f'{lead/60:.0f}m' if lead is not None else '—'):>9}"
              f"{('yes' if has_fp else 'no'):>5}{rows:>7}  {note}")
        out.append({"date": day, "snapshots": len(ss), "close": nclose, "pre": npre,
                    "leadS": lead, "fp": has_fp, "rows": rows, "note": note})

    if days_a:
        print(f"\nSERIES A CLOSE CAPTURE RATE: {closes}/{days_a} days = {100*closes/days_a:.0f}%")
        print("  a day without a close is a permanent hole — the price cannot be re-fetched.")
    else:
        print(f"\nNo Series A days yet (nothing on or after {VINTAGE_A}).")
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
