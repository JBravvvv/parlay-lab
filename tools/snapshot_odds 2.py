#!/usr/bin/env python3
"""Engine v2 line history — hourly odds snapshots so we own open-to-close.

Pulls MLB h2h/totals/spreads across us+eu regions (eu carries Pinnacle, the
sharp anchor) through the app's own /api/odds proxy — the API key stays in
Vercel, this script needs no secrets. Appends one compact snapshot per run to
data/YYYY-MM-DD.json on the line-history branch.

Cost: 3 markets x 2 regions = 6 credits/run; hourly ~ 2.7k/month.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

PROXY = "https://parlay-lab-six.vercel.app/api/odds"
UPSTREAM = ("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"
            "?regions=us,eu&markets=h2h,totals,spreads&oddsFormat=american")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

def fetch():
    url = f"{PROXY}?u={urllib.parse.quote(UPSTREAM, safe='')}&fresh=1"
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode()
            return json.loads(body)  # non-JSON (bot challenge) -> except -> retry
        except Exception as e:
            print(f"attempt {i+1}: {e}", file=sys.stderr)
            time.sleep(20 * (i + 1))
    return None

def compact(events):
    out = []
    for e in events:
        books = {}
        for b in e.get("bookmakers", []):
            entry = {}
            for m in b.get("markets", []):
                k, o = m.get("key"), m.get("outcomes", [])
                if k == "h2h" and len(o) == 2:
                    entry["ml"] = {x["name"]: x["price"] for x in o}
                elif k == "totals" and o:
                    entry["tot"] = {"pt": o[0].get("point"), **{x["name"]: x["price"] for x in o}}
                elif k == "spreads" and o:
                    entry["rl"] = {x["name"]: [x.get("point"), x["price"]] for x in o}
            if entry:
                books[b["key"]] = entry
        out.append({"id": e["id"], "away": e.get("away_team"), "home": e.get("home_team"),
                    "start": e.get("commence_time"), "books": books})
    return out

def main():
    events = fetch()
    if events is None:
        print("snapshot skipped: proxy unreachable (bot challenge or outage)")
        return  # exit 0 — cron resilience; the next hour tries again
    now = datetime.now(timezone.utc)
    os.makedirs("data", exist_ok=True)
    path = f"data/{now.date().isoformat()}.json"
    day = []
    if os.path.exists(path):
        with open(path) as f:
            day = json.load(f)
    day.append({"t": now.isoformat(timespec="seconds"), "events": compact(events)})
    with open(path, "w") as f:
        json.dump(day, f, separators=(",", ":"))
    print(f"{path}: {len(day)} snapshots, latest {len(events)} events")

if __name__ == "__main__":
    main()
