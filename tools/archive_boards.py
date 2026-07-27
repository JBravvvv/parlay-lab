#!/usr/bin/env python3
"""BOARD ARCHIVE — pull each day's board out of Redis before its 3-day TTL eats it.

    python3 tools/archive_boards.py                     # PT yesterday, -2, -3 (self-healing)
    python3 tools/archive_boards.py --dates 2026-07-26  # explicit backfill
    python3 tools/archive_boards.py --out data/boards --dry-run

WHY THIS EXISTS
---------------
`pl:board:{date}` is written with `EX 259200`. Three days. Every board-level finding this
project has produced — the 2.28 winner's-curse decomposition, the pitcher_outs audit, the
H+R+RBI ladder test, the range-compression detector, the sim-coverage table — was computed
from a live board and is UNREPRODUCIBLE 72 hours later. The prediction store keeps rows,
not boards, and it does not keep the three fields those audits ran on:

    propBoard   (35% of the blob)  -> ladder test, range detector
    categories  (26%)              -> the row `case` strings, i.e. the whole outs + PA audits
    parlays[]   czEv/bsEv/consCzEv -> the +2%-gate chain

so the >=20-board threshold that Phase 3's shrink decision rests on was unreachable: boards
2..20 would expire before board 20 existed.

Costs ZERO Odds credits: /api/board serves what the cron already paid for. Needs NO secret:
/api/board is deliberately ungated (model output over public market data).

TWO FILES PER DAY, AND WHY
--------------------------
`latest` is the freshest-priced pass — what a bet was actually placed from, so any
bet-reconstruction question needs it. `best` is the pass that priced the most STILL-BETTABLE
games — what analysis needs. On a weekday with one generation they are the same pass. On a
Sunday they are not: the 17:00 pass covers ~15 games and the 22:30 pass reaches ~1.
Archiving only `latest` would put the 1-game board in git forever and lose the 15-game one.

Both filenames are always written even when the two resolve to the same generation. That
costs nothing: gzip here is byte-reproducible (mtime=0, no filename header), so identical
content is a single blob in git's object store with two tree entries. It also means a
missing file always means "the archive failed", never "they happened to agree".

TIMING — CAPTURED AFTER THE DAY IS DONE, NOT RACING IT
------------------------------------------------------
The default target is PT **yesterday** and the two days before it, never today. Today's
board is still being generated; yesterday's cannot be. The last generation of PT day D is
the Sunday 22:30 UTC entry = 15:30 PT on D; this run at 12:00 UTC on D+1 = 05:00 PT sits
13.5 hours after it. The three-day window is the delay tolerance: GitHub's schedule queueing
runs +3.3h to +8.75h (measured, docs/cron-jobs.md), so a run can be hours late, or skipped
outright, and the date still gets three separate chances before the TTL expires it.
"""
import argparse, glob, gzip, io, json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("PL_BASE", "https://parlay-lab-six.vercel.app")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
WINDOW_DAYS = 3          # the board TTL, so every date gets 3 attempts
MANIFEST = "index.json"


def pt_today(now=None):
    """The product's day boundary is PACIFIC everywhere (see src/lib/server/pt-date.ts).
    Using UTC here would archive the wrong date for every board generated after 17:00 PT."""
    now = now or datetime.now(timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        return now.astimezone(ZoneInfo("America/Los_Angeles")).date()
    except Exception:
        # tzdata missing: MLB's season is entirely inside PDT, so UTC-7 is exact here.
        return (now - timedelta(hours=7)).date()


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print(f"  attempt {i+1}: {e}", file=sys.stderr)
    return None


def write_gz(path, obj):
    """Byte-reproducible: mtime=0 and no filename header, so re-archiving an unchanged
    board is a git no-op instead of a fresh 145 KB blob every day it stays in the window."""
    raw = json.dumps(obj, separators=(",", ":"), sort_keys=True).encode()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as g:
        g.write(raw)
    blob = buf.getvalue()
    prev = open(path, "rb").read() if os.path.exists(path) else None
    if prev == blob:
        return len(raw), len(blob), False
    with open(path, "wb") as f:
        f.write(blob)
    return len(raw), len(blob), True


def archive_date(date, outdir, dry=False):
    """-> a manifest row, or None if there is nothing stored for the date."""
    idx = fetch(f"{BASE}/api/board?date={date}&gen=list") or {}
    gens = idx.get("gens") or []
    got = {}
    for which in ("latest", "best"):
        d = fetch(f"{BASE}/api/board?date={date}&gen={which}")
        if not d or not d.get("board"):
            print(f"  {date} {which}: {(d or {}).get('reason', 'fetch failed')}")
            continue
        got[which] = d["board"]

    if "latest" not in got:
        return None
    # `best` falls back to the plain key when no generation index exists (boards written
    # before the non-destructive store shipped). Record that it resolved to the same pass
    # rather than pretending two generations were compared.
    got.setdefault("best", got["latest"])

    row = {"date": date, "gens": len(gens),
           "latestAt": got["latest"].get("at"), "bestAt": got["best"].get("at")}
    row["identical"] = row["latestAt"] == row["bestAt"]
    row["genIndex"] = gens
    for which, board in got.items():
        path = os.path.join(outdir, f"{date}.{which}.json.gz")
        if dry:
            raw = len(json.dumps(board, separators=(",", ":")))
            print(f"  {date}.{which}: {raw:,} raw (dry run)")
            continue
        raw, gz, changed = write_gz(path, board)
        row[f"{which}Raw"] = raw
        row[f"{which}Gz"] = gz
        print(f"  {date}.{which}.json.gz  {raw:>9,} raw -> {gz:>7,} gz  "
              f"{'written' if changed else 'unchanged'}")
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dates", nargs="*", help="explicit dates; default is PT yesterday and the 2 before")
    ap.add_argument("--out", default="data/boards")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    today = pt_today()
    dates = a.dates or [str(today - timedelta(days=k)) for k in range(1, WINDOW_DAYS + 1)]
    os.makedirs(a.out, exist_ok=True)
    print(f"board archive -> {a.out}   (PT today {today}; targets {', '.join(dates)})\n")

    mpath = os.path.join(a.out, MANIFEST)
    man = {}
    if os.path.exists(mpath):
        try:
            man = {r["date"]: r for r in json.load(open(mpath)).get("boards", [])}
        except Exception:
            man = {}

    for d in dates:
        print(d)
        row = archive_date(d, a.out, a.dry_run)
        if row:
            man[d] = row
        else:
            print(f"  {d}: nothing stored (expired, or no board was generated)")

    if not a.dry_run:
        # the manifest is what makes the series readable without decompressing 100 files
        with open(mpath, "w") as f:
            json.dump({"boards": [man[k] for k in sorted(man)]}, f, indent=1, sort_keys=True)
        n = len(man)
        files = len(glob.glob(os.path.join(a.out, "*.json.gz")))
        print(f"\nmanifest -> {mpath}   {n} dates, {files} files")
        # the >=20-board Phase 3 threshold, reported rather than remembered
        print(f"BOARD SERIES n = {n}   (Phase 3's crossover/shrink threshold is 20)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
