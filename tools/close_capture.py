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
    # ---- KEEP RATE BY DAY OF WEEK — the second-reading selection, reported weekly
    # Series B kept only games that had not started when the later snapshot fired, so its
    # movement population is night games: Sun 3/45 = 6.7%, Wed 6/14 = 43%, Mon 15/15 = 100%,
    # median first pitch 22.68 UTC for kept vs 18.18 for dropped. Whether the retimed cadence
    # fixes that is the 2026-08-02 test, and Wednesday and Thursday need watching too --
    # 43% and 50% are nearly as bad as Sunday and nobody had looked at them.
    DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    by = {}
    for f in files:
        day = os.path.basename(f)[:10]
        d = json.load(open(f))
        ss = d.get("snapshots") or []
        if len(ss) < 2:
            continue
        first = {e["id"]: parse_t(e.get("start")) for e in ss[0].get("events", [])}
        # the CLOSE if one exists, else the last reading -- the question is what the
        # movement half actually sees, not what an ideal one would
        close = next((s for s in reversed(ss) if s.get("kind") == "close"), ss[-1])
        later = {e["id"] for e in close.get("events", [])}
        dw = DOW[datetime.strptime(day, "%Y-%m-%d").weekday()]
        b = by.setdefault(dw, [0, 0])
        b[0] += len(first)
        b[1] += sum(1 for k in first if k in later)

    print("\nKEEP RATE BY DAY OF WEEK — games surviving into the close/last reading")
    print("  (Series B baseline: Mon 100%, Tue 94%, Fri 93%, Sat 68%, Thu 50%, Wed 43%, SUN 6.7%)")
    for dw in DOW:
        if dw not in by:
            continue
        n, k = by[dw]
        pct = 100 * k / max(1, n)
        flag = ""
        if dw == "Sun":
            flag = ("  <-- RETIME CONFIRMED" if pct >= 90 else
                    "  <-- STRUCTURAL: the cadence is the problem, not the hour" if pct <= 30 else
                    "  <-- partial; read the note below")
        elif pct < 70:
            flag = "  <-- start-time selection, same mechanism as Sunday"
        print(f"    {dw}  {k:>3}/{n:<3} = {pct:>5.1f}%{flag}")

    print("""
  2026-08-02 IS THE PRE-COMMITTED TEST (Series A's first Sunday):
    Sunday keep rate >= 90%  -> the 17:00 UTC firing takes the close before the 17:35 bulk.
                                The schedule solved it; both series' Sundays are usable.
    Sunday keep rate 6-30%   -> the SNAPSHOT CADENCE is the problem, not the generate hour.
                                The near-pitch sweep must fire on Sundays independently of
                                the generate schedule, and until it does Sunday is unusable
                                in BOTH series.
    anything between         -> partial; report per-game rather than pooling.
  Re-read this table WEEKLY, not once: Wed 43% and Thu 50% are nearly as bad as Sunday and
  have never been looked at.""")

    if a.json:
        json.dump({"days": out, "byDow": by}, open(a.json, "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
