#!/usr/bin/env python3
"""Engine v2 data spine — skill priors from Baseball Savant (free, no key).

Produces public/model/priors.json: per-player Statcast skill (expected stats,
K/BB/whiff/barrel rates), park factors by batter handedness, catcher framing,
and PA-weighted league means. The runtime v2 layer shrinks observed rates
toward THESE priors instead of league means — skill-informed regression.

Stdlib only. Sources are public leaderboard CSV/HTML endpoints; every pull is
real data or the field is omitted (never fabricated). FanGraphs projections are
Cloudflare-walled from scripts and deliberately NOT scraped.
"""
import csv, io, json, re, sys, time, urllib.request
from datetime import datetime, timezone

SEASON = 2026
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
BASE = "https://baseballsavant.mlb.com"

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))

def rows(text):
    return list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))

def num(v):
    try:
        f = float(str(v).replace('"', ""))
        return round(f, 4)
    except (TypeError, ValueError):
        return None

def xstats(kind):
    t = get(f"{BASE}/leaderboard/expected_statistics?type={kind}&year={SEASON}&position=&team=&min=25&csv=true")
    out = {}
    for r in rows(t):
        pid = r.get("player_id", "").strip()
        if not pid:
            continue
        d = {
            "name": r.get("last_name, first_name", "").strip(),
            "pa": num(r.get("pa")),
            "ba": num(r.get("ba")), "xba": num(r.get("est_ba")),
            "slg": num(r.get("slg")), "xslg": num(r.get("est_slg")),
            "woba": num(r.get("woba")), "xwoba": num(r.get("est_woba")),
        }
        if kind == "pitcher":
            d["era"] = num(r.get("era"))
            d["xera"] = num(r.get("xera"))
        out[pid] = d
    return out

def skills(kind):
    sel = "player_age,pa,k_percent,bb_percent,barrel_batted_rate,hard_hit_percent,whiff_percent,sprint_speed" \
        if kind == "batter" else "pa,k_percent,bb_percent,whiff_percent,barrel_batted_rate,hard_hit_percent"
    t = get(f"{BASE}/leaderboard/custom?year={SEASON}&type={kind}&filter=&min=25&selections={sel}"
            "&chart=false&x=pa&y=pa&r=no&chartType=beeswarm&sort=1&sortDir=desc&csv=true")
    out = {}
    for r in rows(t):
        pid = str(r.get("player_id", "")).strip()
        if not pid:
            continue
        out[pid] = {k: num(r.get(src)) for k, src in [
            ("k_pct", "k_percent"), ("bb_pct", "bb_percent"), ("whiff_pct", "whiff_percent"),
            ("barrel_pct", "barrel_batted_rate"), ("hardhit_pct", "hard_hit_percent"),
            ("sprint", "sprint_speed"),
        ] if r.get(src) not in (None, "")}
    return out

def percentiles(kind):
    """Savant percentile ranks. Orientation verified empirically 2026-07-12:
    ALWAYS 100 = elite for the player's role (Savant inverts negative stats —
    batter whiff/K percentiles, pitcher BB/hard-hit/xwOBA percentiles)."""
    fields = (["xwoba", "xba", "xslg", "xiso", "brl_percent", "exit_velocity", "hard_hit_percent",
               "k_percent", "bb_percent", "whiff_percent", "chase_percent", "sprint_speed", "bat_speed"]
              if kind == "batter" else
              ["xwoba", "xba", "xslg", "brl_percent", "exit_velocity", "hard_hit_percent",
               "k_percent", "bb_percent", "whiff_percent", "chase_percent", "xera", "fb_velocity"])
    t = get(f"{BASE}/leaderboard/percentile-rankings?type={kind}&year={SEASON}&team=&csv=true")
    out = {}
    for r in rows(t):
        pid = str(r.get("player_id", "")).strip()
        if not pid:
            continue
        d = {k: num(r.get(k)) for k in fields if r.get(k) not in (None, "")}
        if d:
            out[pid] = d
    return out

def park_factors(bat_side):
    """Savant serves park factors as HTML with an embedded `var data = [...]` blob."""
    t = get(f"{BASE}/leaderboard/statcast-park-factors?type=year&year={SEASON}&batSide={bat_side}"
            "&stat=index_wOBA&condition=All&rolling=")
    m = re.search(r"var data = (\[.*?\]);", t, re.S)
    if not m:
        return {}
    out = {}
    for v in json.loads(m.group(1)):
        name = v.get("venue_name")
        if not name:
            continue
        out[name] = {k: num(v.get(src)) for k, src in [
            ("woba", "index_woba"), ("hr", "index_hr"), ("hits", "index_hits"),
            ("runs", "index_runs"), ("k", "index_so"), ("bb", "index_walk"),
        ] if v.get(src) not in (None, "")}
    return out

def handedness(ids):
    """batSide/pitchHand from MLB statsapi (free, batched) — drives platoon and
    park-by-handedness in the sim. Missing players are simply omitted."""
    out = {}
    ids = [str(i) for i in ids if str(i).isdigit()]
    for i in range(0, len(ids), 400):
        chunk = ids[i:i + 400]
        try:
            t = get("https://statsapi.mlb.com/api/v1/people?personIds=" + ",".join(chunk)
                    + "&fields=people,id,batSide,pitchHand,code")
            for p in json.loads(t).get("people", []):
                out[str(p["id"])] = {
                    "bats": (p.get("batSide") or {}).get("code"),
                    "throws": (p.get("pitchHand") or {}).get("code"),
                }
        except Exception as e:
            print(f"handedness chunk {i}: {e}", file=sys.stderr)
    return out

def framing():
    try:
        t = get(f"{BASE}/catcher_framing?year={SEASON}&team=&min=q&type=catcher&sort=4,1&csv=true")
        out = {}
        for r in rows(t):
            pid = str(r.get("player_id", "") or r.get("catcher", "")).strip()
            score = num(r.get("runs_extra_strikes") or r.get("framing_runs"))
            if pid and score is not None:
                out[pid] = score
        return out
    except Exception:
        return {}  # optional garnish — omit rather than guess

def league_means(bat, skl):
    tot_pa, acc = 0, {}
    for pid, b in bat.items():
        pa = b.get("pa") or 0
        if not pa:
            continue
        s = skl.get(pid, {})
        for k, v in list(b.items()) + list(s.items()):
            if k in ("name", "pa") or not isinstance(v, (int, float)):
                continue
            acc.setdefault(k, [0.0, 0])
            acc[k][0] += v * pa
            acc[k][1] += pa
        tot_pa += pa
    return {k: round(a / n, 4) for k, (a, n) in acc.items() if n}

def main():
    bat_x, pit_x = xstats("batter"), xstats("pitcher")
    bat_s, pit_s = skills("batter"), skills("pitcher")
    for pid, s in bat_s.items():
        bat_x.setdefault(pid, {}).update(s)
    for pid, s in pit_s.items():
        pit_x.setdefault(pid, {}).update(s)
    for pid, d in percentiles("batter").items():
        bat_x.setdefault(pid, {})["pct"] = d
    for pid, d in percentiles("pitcher").items():
        pit_x.setdefault(pid, {})["pct"] = d
    hands = handedness(list(bat_x.keys()) + list(pit_x.keys()))
    for pid, h in hands.items():
        if pid in bat_x and h.get("bats"):
            bat_x[pid]["stands"] = h["bats"]
        if pid in pit_x and h.get("throws"):
            pit_x[pid]["throws"] = h["throws"]
    parks = {"R": park_factors("R"), "L": park_factors("L")}
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": SEASON,
        "source": "baseballsavant.mlb.com leaderboards (expected stats, custom skills, park factors, framing)",
        "league": league_means(bat_x, bat_s),
        "batters": bat_x,
        "pitchers": pit_x,
        "parks": parks,
        "framing": framing(),
    }
    path = sys.argv[1] if len(sys.argv) > 1 else "public/model/priors.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"priors.json: {len(bat_x)} batters, {len(pit_x)} pitchers, "
          f"parks R/L {len(parks['R'])}/{len(parks['L'])}, framing {len(out['framing'])}, "
          f"{len(json.dumps(out)) // 1024} KB")

if __name__ == "__main__":
    main()
