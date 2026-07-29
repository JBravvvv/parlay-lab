#!/usr/bin/env python3
"""Engine v2 prop line history — the closing-line dataset for player props.

Sweeps every eligible MLB game's prop markets (the 6 the engine plays) through
the app's own /api/odds proxy and appends a compact snapshot to
data/props/YYYY-MM-DD.json on the line-history branch. The scoreboard uses the
last snapshot before each game's first pitch as its "close".

Budget: ~6 credits per event per sweep (6 markets x us region); a 15-game slate
is ~90 credits, twice daily ~5.4k/month. Cadence lives in the workflow.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

PROXY = "https://parlay-lab-six.vercel.app/api/odds"
MARKETS = "batter_hits,batter_total_bases,batter_home_runs,batter_hits_runs_rbis,pitcher_strikeouts,pitcher_outs"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
CZ = "williamhill_us"

def fetch(upstream, tries=3):
    url = f"{PROXY}?u={urllib.parse.quote(upstream, safe='')}&fresh=1"
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print(f"attempt {i+1}: {e}", file=sys.stderr)
            time.sleep(15 * (i + 1))
    return None

def imp(am):
    am = float(am)
    return 100 / (am + 100) if am > 0 else abs(am) / (abs(am) + 100)

def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

def compact(eventodds):
    """per market/player/line: Caesars O/U, cross-book proportional-devig median
    fair P(over) (the classic CLV convention), best prices, book count.

    2026-07-25 — WHICH books are behind the fair, not just how many. `n` alone
    cannot answer the two questions the eligibility rule turns on:
      1. is the settlement book pricing itself?  -> `czf`
      2. when only one book is behind a fair, is it a sharp or a placeholder-prone
         offshore key?                            -> `fb`
    `n = 1` plus a two-sided `cz` recovers (1) exactly for past days, but (2) is
    not inferable from anything already archived. Costs zero extra credits — the
    book keys are already in the response we pay for. `n` is kept verbatim so the
    12 days archived before this change stay directly comparable.
    """
    acc = {}
    for bk in eventodds.get("bookmakers", []):
        is_cz = bk["key"] == CZ
        for m in bk.get("markets", []):
            if m["key"] not in MARKETS.split(","):
                continue
            rows = {}
            for o in m.get("outcomes", []):
                side = "o" if ("over" in (o.get("name") or "").lower() or o.get("name") == "Yes") else "u"
                kk = f'{o.get("description") or o.get("name")}|{o.get("point", "")}'
                rows.setdefault(kk, {})[side] = o["price"]
            for kk, pair in rows.items():
                r = acc.setdefault(m["key"], {}).setdefault(kk, {"fairs": [], "fb": [], "fp": {}, "no": 0, "cz": None, "bo": None, "bu": None})
                if "o" in pair and "u" in pair:
                    io, iu = imp(pair["o"]), imp(pair["u"])
                    r["fairs"].append(io / (io + iu))
                    r["fb"].append(bk["key"])  # this book contributed a fair
                    # ...and ITS OWN PAIR. Added 2026-07-26: without the per-book prices the
                    # archive's `fair` can never be recomputed at the engine's de-vig. `bo`/`bu`
                    # are cross-book BESTS, so de-vigging them prices a pair no book posted —
                    # measured on a live row, S=1.0564 against the real per-book 1.0654, i.e.
                    # 0.90 points of vig that does not exist. See docs/collection-period.md.
                    r["fp"][bk["key"]] = [pair["o"], pair["u"]]
                if "o" in pair:
                    r["no"] += 1  # books posting an OVER at all (one-sided depth)
                if is_cz:
                    r["cz"] = {"o": pair.get("o"), "u": pair.get("u")}
                if "o" in pair and (r["bo"] is None or pair["o"] > r["bo"]):
                    r["bo"] = pair["o"]
                if "u" in pair and (r["bu"] is None or pair["u"] > r["bu"]):
                    r["bu"] = pair["u"]
    out = {}
    for mkt, rows in acc.items():
        out[mkt] = {}
        for kk, r in rows.items():
            out[mkt][kk] = {
                # PROPORTIONAL de-vig — the classic CLV convention, and deliberately NOT the
                # engine's. The engine runs Shin (shShin2 via shDevigPair, armed in production).
                # NEVER read this as "the engine's consensus fair"; recompute from `fp` instead.
                "fair": round(median(r["fairs"]), 4) if r["fairs"] else None,
                "n": len(r["fairs"]),
                "fb": sorted(r["fb"]),
                # per-book {key: [over, under]} for every book behind the fair. This is the
                # ONLY field from which the engine's Shin fair is recomputable; `fair` below
                # is PROPORTIONAL and is NOT the engine's number (they differ by 0 pp at an
                # even market and up to ~1.2 pp at long odds — a product of imbalance and
                # overround, so no flat correction exists).
                "fp": r["fp"],
                "czf": CZ in r["fb"],
                # `bo`/`bu` were already computed and then thrown away. They are what
                # the engine's one-sided fallback actually anchors to (best over price
                # across books, legacy/index.html L2388) — without them the 1.06
                # constant can only be audited at Caesars, not where it is applied.
                # `no` is how many books posted an over at all, so "the best of one"
                # is distinguishable from "the best of six". Zero extra credits.
                "bo": r["bo"],
                "bu": r["bu"],
                "no": r["no"],
                "cz": r["cz"],
            }
    return out

# ---- near-close capture (2026-07-26) --------------------------------------------
# THE ARCHIVE HAD NO CLOSE, AND IT WAS NOT A CADENCE BUG. Measured from the Actions API
# over 15 days: the `0 17` cron starts at ~20:20Z (+3.3h) and the `45 22` cron at ~07:30Z
# (+8.75h) the NEXT morning. Both are `event: schedule`; GitHub queues scheduled runs and
# the delay is systematic, not random. So the 22:45 "near-close" sweep was landing ~9 hours
# late, by which time the games it was meant to price had been played — every archived
# "close" was really T-2.5h or earlier.
#
# THE FIX CANNOT BE ANOTHER CRON: a new schedule entry inherits the same queueing delay.
# It has to be SELF-PACING, the pattern /api/clv already uses — fire often, and let the
# SCRIPT decide from the slate whether this firing is close enough to first pitch to be
# worth a capture. That is robust to a trigger arriving hours off its nominal time, which
# is the only property that matters here.
#
# A close not captured during the window is unrecoverable — the same rule that governs CLV.
CLOSE_WINDOW_S = 95 * 60   # a firing this close to the next unstarted first pitch is a CLOSE
MIN_GAP_S      = 40 * 60   # ...and we take at most one close capture per 40 min

def _snapshot_kind(events, now, day):
    """'close' | 'pre' | None(skip) — decided from the slate, not from the clock alone."""
    starts = [datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) for e in events]
    ahead = sorted(s for s in starts if s > now)
    if not ahead:
        return None
    lead = (ahead[0] - now).total_seconds()
    prior = day.get("snapshots") or []
    last_close = None
    last_any = None
    for sn in prior:
        t = datetime.fromisoformat(sn["t"])
        if sn.get("kind") == "close":
            last_close = t
        if last_any is None or t > last_any:
            last_any = t
    if lead <= CLOSE_WINDOW_S:
        if last_close and (now - last_close).total_seconds() < MIN_GAP_S:
            return None            # already have a close this close to the pitch
        return "close"
    # MIN_GAP pre-dedupe (2026-07-29, signed): measured 07-28/29, cron clusters landed
    # 3-minutes-apart pre sweeps, each paying ~96 credits for duplicates carrying 3-5%
    # changed rows at mean |dfair| <= 0.042 pp (vs 20%/0.214 pp across 14 min). A pre
    # within MIN_GAP_S of ANY paid snapshot is a duplicate: payment deduped, delivery
    # redundancy retained (every cron entry stays; a close is never blocked by this —
    # the close branch above runs first with its own gap). Vintage: the archive series
    # segments pre/post this commit; prior snapshots are never reinterpreted under the
    # new cadence (docs/collection-period.md, THE CREDIT BUDGET).
    if last_any and (now - last_any).total_seconds() < MIN_GAP_S:
        print(f"  skipped: pre within MIN_GAP ({(now - last_any).total_seconds()/60:.0f} min since last paid snapshot)")
        return None
    return "pre"


# ---- SELF-PACED WAIT (2026-07-27) ----------------------------------------------------------
# Ten crons inside a 95-minute window is not redundancy, it is a lottery — and it draws on the
# same throttled queue that drops 19 of 24 line-history ticks. Measured on this account:
# afternoon crons all land in a ~20:00-21:00Z batch and evening ones land 06:00-08:30Z the NEXT
# morning, so of ten configured firings only the early one arrives usefully at all.
#
# So: fire ONCE, early, and WAIT INSIDE THE RUNNER until the window opens. Deterministic,
# one tick, and it does not care what the queue does with the other nine.
#
# THE CEILING IS REAL. A GitHub-hosted job is killed at 360 minutes. MAX_WAIT_S leaves ~60 for
# the sweep itself (a 15-game slate is ~90 proxy calls), and the workflow sets an explicit
# `timeout-minutes` under the ceiling so the kill is ours, not GitHub's.
# If the window opens beyond the cap, we do NOT wait: we take the `pre` reading and exit, which
# leaves an honest hole that tools/close_capture.py reports rather than a job killed mid-sweep.
MAX_WAIT_S = 300 * 60      # 5h — under the 360-minute hosted-runner job ceiling, with headroom
WAIT_TICK_S = 5 * 60       # log progress so a waiting runner is visibly alive, not hung


def _wait_for_window(events, now):
    """Sleep until the next unstarted first pitch is within CLOSE_WINDOW_S. Returns the new
    `now`. Never sleeps past MAX_WAIT_S — the caller then records a `pre` instead."""
    starts = sorted(datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) for e in events)
    ahead = [s for s in starts if s > now]
    if not ahead:
        return now
    need = (ahead[0] - now).total_seconds() - CLOSE_WINDOW_S
    if need <= 0:
        print(f"  already inside the window ({(ahead[0]-now).total_seconds()/60:.0f} min to first pitch)")
        return now
    if need > MAX_WAIT_S:
        print(f"  window opens in {need/60:.0f} min, past the {MAX_WAIT_S/60:.0f}-min cap — "
              f"NOT waiting; a `pre` reading will be recorded and the close left to a later run")
        return now
    print(f"  waiting {need/60:.0f} min for the close window (first pitch {ahead[0].isoformat()})")
    waited = 0
    while waited < need:
        chunk = min(WAIT_TICK_S, need - waited)
        time.sleep(chunk)
        waited += chunk
        print(f"    +{waited/60:.0f}/{need/60:.0f} min", flush=True)
    return datetime.now(timezone.utc)


def fold_vercel(day_iso=None):
    """Fold any Vercel-captured close snapshots into data/props/<date>.json.

    /api/propsnap stores the RAW odds payload and de-vigs nothing, so the same `compact()` that
    every other snapshot went through runs here. One implementation of the de-vig, not two — the
    archive stays byte-comparable across capture routes, and the `src` field says which one.

    Idempotent: a snapshot already folded (same `t`) is skipped, so re-running is free.
    """
    from datetime import date as _date
    day_iso = day_iso or datetime.now(timezone.utc).astimezone().date().isoformat()
    url = f"https://parlay-lab-six.vercel.app/api/propsnap?date={day_iso}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = json.loads(r.read().decode())
    except Exception as e:
        print(f"fold: /api/propsnap unreachable ({e}) — nothing folded")
        return 0
    stored = payload.get("snapshots") or []
    if not stored:
        print(f"fold: no Vercel captures for {day_iso}")
        return 0

    path = f"data/props/{day_iso}.json"
    day = {"snapshots": []}
    if os.path.exists(path):
        with open(path) as f:
            day = json.load(f)
    have = {sn.get("t") for sn in day["snapshots"]}
    added = 0
    for sn in stored:
        if sn.get("t") in have:
            continue
        evs = []
        for e in sn.get("events", []):
            raw = e.get("raw")
            if not raw or not raw.get("bookmakers"):
                continue
            evs.append({"id": e["id"], "away": e["away"], "home": e["home"],
                        "start": e["start"], "markets": compact(raw)})
        if not evs:
            continue
        day["snapshots"].append({"t": sn["t"], "kind": sn.get("kind", "close"),
                                 "src": sn.get("src", "vercel"), "events": evs})
        added += 1
    if not added:
        print(f"fold: {len(stored)} Vercel capture(s) already present")
        return 0
    day["snapshots"].sort(key=lambda x: x.get("t", ""))
    os.makedirs("data/props", exist_ok=True)
    with open(path, "w") as f:
        json.dump(day, f, separators=(",", ":"))
    print(f"fold: +{added} Vercel snapshot(s) -> {path} ({len(day['snapshots'])} total)")
    return added


def main():
    # the weekend/matinee half: closes Actions cannot reach, captured by /api/propsnap and
    # folded in here. Runs FIRST so a sweep that then skips still leaves the folded close.
    fold_vercel()
    if "--fold-only" in sys.argv:
        return
    wait = "--wait" in sys.argv
    events = fetch("https://api.the-odds-api.com/v4/sports/baseball_mlb/events")
    if events is None:
        print("skipped: proxy unreachable")
        return
    now = datetime.now(timezone.utc)
    if wait:
        now = _wait_for_window(events, now)
    path_probe = f"data/props/{now.date().isoformat()}.json"
    day_probe = {"snapshots": []}
    if os.path.exists(path_probe):
        with open(path_probe) as f:
            day_probe = json.load(f)
    kind = _snapshot_kind(events, now, day_probe)
    if kind is None:
        print("skipped: no unstarted games, or a close was already captured within the gap")
        return
    print(f"snapshot kind={kind}")
    todays = [e for e in events
              if 0 < (datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) - now).total_seconds() < 20 * 3600]
    snap = {"t": now.isoformat(timespec="seconds"), "kind": kind, "events": []}
    for e in todays[:16]:
        od = fetch(f'https://api.the-odds-api.com/v4/sports/baseball_mlb/events/{e["id"]}/odds'
                   f"?regions=us&oddsFormat=american&markets={MARKETS}")
        if not od or not od.get("bookmakers"):
            continue
        snap["events"].append({
            "id": e["id"], "away": e["away_team"], "home": e["home_team"],
            "start": e["commence_time"], "markets": compact(od),
        })
    if not snap["events"]:
        print("no upcoming games with props — nothing stored")
        return
    os.makedirs("data/props", exist_ok=True)
    path = f"data/props/{now.date().isoformat()}.json"
    day = {"snapshots": []}
    if os.path.exists(path):
        with open(path) as f:
            day = json.load(f)
    day["snapshots"].append(snap)
    with open(path, "w") as f:
        json.dump(day, f, separators=(",", ":"))
    print(f"{path}: {len(day['snapshots'])} snapshots, latest {len(snap['events'])} games")

if __name__ == "__main__":
    main()
