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
    fair P(over) (the classic CLV convention), best prices, book count."""
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
                r = acc.setdefault(m["key"], {}).setdefault(kk, {"fairs": [], "cz": None, "bo": None, "bu": None})
                if "o" in pair and "u" in pair:
                    io, iu = imp(pair["o"]), imp(pair["u"])
                    r["fairs"].append(io / (io + iu))
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
                "fair": round(median(r["fairs"]), 4) if r["fairs"] else None,
                "n": len(r["fairs"]),
                "cz": r["cz"],
            }
    return out

def main():
    events = fetch("https://api.the-odds-api.com/v4/sports/baseball_mlb/events")
    if events is None:
        print("skipped: proxy unreachable")
        return
    now = datetime.now(timezone.utc)
    todays = [e for e in events
              if 0 < (datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) - now).total_seconds() < 20 * 3600]
    snap = {"t": now.isoformat(timespec="seconds"), "events": []}
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
