#!/usr/bin/env python3
"""
SELF-SCHEDULING BOARD GENERATION (2026-08-02, owner's item 1).

    python3 tools/board_window.py            # hold until the window opens, then fire once
    python3 tools/board_window.py --dry-run  # evaluate and print, never fire
    python3 tools/board_window.py --once     # evaluate once and exit (no hold)

═══ WHY THIS IS NOT "A CRON EVERY 15 MINUTES" ═══════════════════════════════════════════
The brief specified a 15-minute GitHub Actions schedule that evaluates the window each tick and
fires the first time it holds. **THAT DESIGN CANNOT WORK ON THIS ACCOUNT, and the measurement is
already in this repo.** `.github/workflows/props-history.yml` L26-30 records it:

    "every scheduled workflow lands in one of two batches: ~20:00-21:00Z or ~06:00-08:30Z the
     NEXT morning ... Ten fires inside a 95-minute window was not redundancy, it was a lottery
     drawing on the same throttled queue that drops 19 of 24 line-history ticks."

and the delay itself is **40-80 minutes, median ~56** (session handoff §0.16). **The delay is
LARGER THAN THE WINDOW.** Sunday's two-condition window on 2026-08-02 is 17:05Z-17:35Z — thirty
minutes. A tick scheduled at 17:00Z lands at 17:40-18:20Z, after first pitch, every time. Adding
more ticks does not help: they queue behind each other on the same throttle.

**SO THE JITTER IS ABSORBED BY HOLDING, NOT BY TICKING** — the pattern this repo already proved
in `snapshot_props.py::_wait_for_window`. The job is scheduled EARLY, lands whenever the queue
delivers it, and then **polls the condition from inside the runner** (statsapi, free) until it
holds. Delivery jitter becomes irrelevant by construction, which is what the brief asked for;
only the mechanism differs. The repo is PUBLIC, so hosted-runner minutes are unlimited and a
multi-hour hold costs nothing.

═══ THE CONDITION — BOTH HALVES, ALWAYS PRINTED TOGETHER ════════════════════════════════
Per the standing rule from the 2026-08-02 derivation defect (§12Z.3): **"ready" and "unstarted"
are two conditions and neither is reported without the other.**

    ready     = games unstarted AND within LINEUP_LEAD (3h) of first pitch   <- what a board prices
    achievable= ready / unstarted                                            <- the quality ratio
    FIRE when  achievable >= T (0.80)  AND  ready >= MIN_READY

`achievable` alone selects for LATENESS — a started game leaves the DENOMINATOR, so the ratio
rises as the slate burns down. `MIN_READY` is what stops a 1-of-1 leftover scoring 1.000 and
firing a one-game board at 20:30Z. Both are needed; neither is sufficient.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}"
GENERATE = "https://parlay-lab-six.vercel.app/api/generate"

LINEUP_LEAD_S = 3 * 3600          # mirrors src/lib/board-coverage.ts LINEUP_LEAD_MS
T = 0.80                          # the operator's board-quality bar (NOT MIN_ACHIEVABLE=0.15)
MIN_READY = 4                     # floor on the priceable population; see the header
POLL_S = 5 * 60                   # how often the held runner re-evaluates
MAX_WAIT_S = 300 * 60             # 5h — under the 360-min hosted-runner ceiling, as snapshot_props
DEADLINE_PAD_S = 0                # fire right up to the moment the condition breaks


def _get(url, headers=None, method="GET", timeout=30):
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def starts_utc(date_str):
    """First-pitch epochs for the date, postponed/cancelled excluded."""
    _, body = _get(SCHEDULE.format(date=date_str))
    j = json.loads(body)
    out = []
    for d in j.get("dates", []):
        for g in d.get("games", []):
            st = (g.get("status") or {}).get("detailedState") or ""
            if "Postponed" in st or "Cancelled" in st:
                continue
            gd = g.get("gameDate")
            if not gd:
                continue
            out.append(datetime.fromisoformat(gd.replace("Z", "+00:00")).timestamp())
    return sorted(out)


def evaluate(starts, now):
    """BOTH CONDITIONS, as one record. Mirrors achievableCoverage() exactly."""
    unstarted = [s for s in starts if s > now]
    if not unstarted:
        return {"ready": 0, "unstarted": 0, "achievable": 0.0, "started": len(starts),
                "fire": False, "why": "dead-slate: nothing left to price"}
    ready = [s for s in unstarted if s - LINEUP_LEAD_S <= now]
    ach = round(len(ready) / len(unstarted), 3)
    fire = ach >= T and len(ready) >= MIN_READY
    if fire:
        why = "BOTH conditions hold"
    elif ach < T and len(ready) < MIN_READY:
        why = f"achievable {ach} < {T} AND ready {len(ready)} < {MIN_READY}"
    elif ach < T:
        why = f"achievable {ach} < {T} (lineups not posted for enough of what is left)"
    else:
        why = f"ready {len(ready)} < {MIN_READY} (ratio is high only because the slate burned down)"
    return {"ready": len(ready), "unstarted": len(unstarted), "achievable": ach,
            "started": len(starts) - len(unstarted), "fire": fire, "why": why,
            "cost_est": 1 + 6 * len(unstarted)}


def line(now, ev):
    ts = datetime.fromtimestamp(now, timezone.utc).strftime("%H:%MZ")
    return (f"  {ts}  ready {ev['ready']}/{ev['unstarted']} unstarted "
            f"({ev['started']} started)  achievable {ev['achievable']:.3f}  "
            f"est cost {ev.get('cost_est', 0)}  -> {'FIRE' if ev['fire'] else 'hold'}: {ev['why']}")


def fire(dry):
    key = os.environ.get("CRON_SECRET", "")
    if not key:
        print("!! CRON_SECRET is not in the environment — NOT firing. This is a config error, "
              "not a window decision.")
        return 78
    if dry:
        print("  --dry-run: would POST /api/generate with x-cron-key")
        return 0
    status, body = _get(GENERATE, headers={"x-cron-key": key}, method="POST", timeout=120)
    print(f"  POST /api/generate -> HTTP {status}")
    print(f"  body: {body[:600]}")
    # 200 is not automatically success: the route may skip. Print, never interpret.
    return 0 if status == 200 else 1


def main():
    dry = "--dry-run" in sys.argv
    once = "--once" in sys.argv
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for a in sys.argv:
        if a.startswith("--date="):
            date_str = a.split("=", 1)[1]

    starts = starts_utc(date_str)
    print(f"board_window {date_str}: {len(starts)} games on the slate")
    if not starts:
        print("  no games — nothing to schedule. Exiting 0; an empty slate is not a failure.")
        return 0
    fp = datetime.fromtimestamp(starts[0], timezone.utc).strftime("%H:%MZ")
    lp = datetime.fromtimestamp(starts[-1], timezone.utc).strftime("%H:%MZ")
    print(f"  first pitch {fp}   last {lp}   T={T}  MIN_READY={MIN_READY}")

    waited = 0
    while True:
        now = time.time()
        ev = evaluate(starts, now)
        print(line(now, ev), flush=True)
        if ev["fire"]:
            return fire(dry)
        if ev["unstarted"] == 0:
            print("  slate is dead and the window never opened. NO BOARD TODAY, and the reason is "
                  "printed above, not inferred.")
            return 0
        if once:
            return 0
        if waited >= MAX_WAIT_S:
            print(f"  held {waited // 60} min without the condition holding — at the "
                  f"{MAX_WAIT_S // 60}-min cap. Exiting WITHOUT firing; a board fired outside its "
                  f"window is worse than no board.")
            return 0
        time.sleep(POLL_S)
        waited += POLL_S


if __name__ == "__main__":
    sys.exit(main())
