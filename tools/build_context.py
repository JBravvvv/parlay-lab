#!/usr/bin/env python3
"""Engine v2 daily context — weather, HP umpires, bullpen fatigue.

Writes public/model/context.json for today's slate and incrementally grows
data/ump_k.json (home-plate umpire K tendencies) from yesterday's finals.
Everything comes from the free MLB Stats API; anything unposted is null and
said so — never guessed. Weather uses statsapi's own park-relative wind
strings ("12 mph, Out To CF"), so no stadium-azimuth math is needed.
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

API = "https://statsapi.mlb.com/api/v1"
UA = "parlay-lab-engine2/1.0"

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))

def sched(date, hydrate):
    d = get(f"{API}/schedule?sportId=1&date={date}&hydrate={hydrate}")
    return [g for day in d.get("dates", []) for g in day.get("games", [])]

def load_json(path, fallback):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return fallback

def update_ump_db(today):
    """Fold yesterday's finals into the ump K database (HP ump, Ks, games)."""
    db = load_json("data/ump_k.json", {"umps": {}, "league": {"g": 0, "k": 0}, "days": [], "pks": []})
    db.setdefault("pks", [])
    y = (datetime.fromisoformat(today) - timedelta(days=1)).date().isoformat()
    if y in db["days"]:
        return db
    for g in sched(y, "linescore"):
        if g.get("status", {}).get("abstractGameState") != "Final":
            continue
        if g["gamePk"] in db["pks"]:
            continue  # midnight-straddling game already counted under the prior date
        db["pks"] = (db["pks"] + [g["gamePk"]])[-600:]
        try:
            box = get(f"{API}/game/{g['gamePk']}/boxscore")
        except Exception:
            continue
        hp = next((o.get("official", {}).get("fullName")
                   for o in box.get("officials", []) if o.get("officialType") == "Home Plate"), None)
        k = sum(int(box.get("teams", {}).get(s, {}).get("teamStats", {}).get("batting", {}).get("strikeOuts", 0) or 0)
                for s in ("away", "home"))
        db["league"]["g"] += 1
        db["league"]["k"] += k
        if hp:
            u = db["umps"].setdefault(hp, {"g": 0, "k": 0})
            u["g"] += 1
            u["k"] += k
    db["days"] = (db["days"] + [y])[-400:]
    os.makedirs("data", exist_ok=True)
    with open("data/ump_k.json", "w") as f:
        json.dump(db, f, separators=(",", ":"))
    return db

def bullpen_usage(today):
    """Per team: reliever pitch counts over the last 3 days (fatigue signal).
    statsapi dates are US-local while we run on UTC — dedupe by gamePk so a
    game straddling midnight never counts twice."""
    usage = {}
    seen = set()
    for back in (1, 2, 3):
        d = (datetime.fromisoformat(today) - timedelta(days=back)).date().isoformat()
        for g in sched(d, "linescore"):
            if g.get("status", {}).get("abstractGameState") != "Final":
                continue
            if g["gamePk"] in seen:
                continue
            seen.add(g["gamePk"])
            try:
                box = get(f"{API}/game/{g['gamePk']}/boxscore")
            except Exception:
                continue
            for side in ("away", "home"):
                t = box.get("teams", {}).get(side, {})
                team = t.get("team", {}).get("name")
                if not team:
                    continue
                for p in t.get("players", {}).values():
                    pit = p.get("stats", {}).get("pitching", {})
                    if not pit:
                        continue
                    n = pit.get("pitchesThrown") or pit.get("numberOfPitches")
                    started = p.get("gameStatus", {}).get("isStarter") or pit.get("gamesStarted")
                    if n and not started:  # relievers only
                        usage.setdefault(team, []).append(
                            {"name": p.get("person", {}).get("fullName"), "pitches": int(n), "daysAgo": back})
    return usage

def main():
    today = datetime.now(timezone.utc).date().isoformat()
    db = update_ump_db(today)
    lg_kpg = (db["league"]["k"] / db["league"]["g"]) if db["league"]["g"] else None

    games = []
    for g in sched(today, "probablePitcher,weather,venue,officials"):
        w = g.get("weather") or {}
        # officials appear only near first pitch; try, never guess
        hp = None
        for o in (g.get("officials") or []):
            if o.get("officialType") == "Home Plate":
                hp = o.get("official", {}).get("fullName")
        ump = None
        if hp and hp in db["umps"] and db["umps"][hp]["g"] >= 5 and lg_kpg:
            u = db["umps"][hp]
            ump = {"name": hp, "g": u["g"], "kFactor": round((u["k"] / u["g"]) / lg_kpg, 3)}
        elif hp:
            ump = {"name": hp, "g": db["umps"].get(hp, {}).get("g", 0), "kFactor": None}
        games.append({
            "pk": g.get("gamePk"),
            "start": g.get("gameDate"),
            "away": g.get("teams", {}).get("away", {}).get("team", {}).get("name"),
            "home": g.get("teams", {}).get("home", {}).get("team", {}).get("name"),
            "venue": g.get("venue", {}).get("name"),
            "weather": {k: w.get(k) for k in ("condition", "temp", "wind")} if w else None,
            "probables": {
                "away": (g.get("teams", {}).get("away", {}).get("probablePitcher") or {}).get("fullName"),
                "home": (g.get("teams", {}).get("home", {}).get("probablePitcher") or {}).get("fullName"),
            },
            "hpUmp": ump,
        })

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "date": today,
        "league_k_per_game": round(lg_kpg, 2) if lg_kpg else None,
        "ump_db_games": db["league"]["g"],
        "games": games,
        "bullpen_last3": bullpen_usage(today),
    }
    path = sys.argv[1] if len(sys.argv) > 1 else "public/model/context.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"context.json: {len(games)} games, bullpen teams {len(out['bullpen_last3'])}, "
          f"ump db {len(db['umps'])} umps over {db['league']['g']} games")

if __name__ == "__main__":
    main()
