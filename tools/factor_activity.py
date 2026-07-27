#!/usr/bin/env python3
"""FACTOR ACTIVITY — the drift check for engine inputs that are not parameters.

WHY THIS EXISTS (2026-07-25)
----------------------------
The frozen-parameter table in docs/collection-period.md tracks parameter VALUES.
EIGHT engine factors are not parameters at all — they are data-availability
outcomes, each returning an identity value (1.0) when its input is missing, stale,
or under a guard threshold:

    shUmpKf  shTempF  shPitPctF  shOppWhiffF  shPenF  shLaborF  shPenQF  shPriorKf

So an input can go inert -> live or live -> inert mid-freeze with no frozen value
changing, and the drift detector reports clean. That is exactly how shPenQF spent
its entire life returning 1.0 without anything noticing, and how shUmpKf is on
course to switch itself ON around 2026-08-04 when its 5-games-per-umpire guard
finally clears.

This script makes that observable. Run it on a real slate; any material change in
a factor's live share during the freeze is a finding with the same standing as a
parameter drift.

Zero API credits: reads the committed artifacts plus keyless statsapi.

    python3 tools/factor_activity.py [--date YYYY-MM-DD] [--json out.json]
"""
import argparse, json, re, sys, unicodedata, urllib.request
from datetime import datetime, timezone

API = "https://statsapi.mlb.com/api/v1"
# shPriorKf ADDED 2026-07-27 — it was the EIGHTH, found by tests/factor-classification.test.ts
# rather than by a consequence. It returns 1 whenever SH_PRIORS.pitchers[id].k_pct or the league
# k_pct is missing, and it appeared in no registry, no doc and no drift check.
# Keep this list equal to REGISTRY in that test — the test enforces it in both directions.
FACTORS = ["shUmpKf", "shTempF", "shPitPctF", "shOppWhiffF", "shPenF", "shLaborF", "shPenQF",
           "shPriorKf"]


def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "parlay-lab-factor-activity/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())


def pn(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9 ]", "", s).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.now(timezone.utc).astimezone().date().isoformat())
    ap.add_argument("--ctx", default="public/model/context.json")
    ap.add_argument("--priors", default="public/model/priors.json")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    ctx = json.load(open(a.ctx))
    pri = json.load(open(a.priors))
    PIT, BAT = pri.get("pitchers", {}), pri.get("batters", {})
    PQ = ctx.get("pen_quality") or {}
    PQL = PQ.get("__league") or {}
    BP = ctx.get("bullpen_last3") or {}
    ctxg = ctx.get("games") or []

    sched = get(f"{API}/schedule?sportId=1&date={a.date}&hydrate=probablePitcher,weather,lineups")
    games = [g for d in sched.get("dates", []) for g in d.get("games", [])]

    pids = sorted({(g["teams"][s].get("probablePitcher") or {}).get("id")
                   for g in games for s in ("away", "home")} - {None})
    season = {}
    if pids:
        ppl = get(f"{API}/people?personIds={','.join(map(str, pids))}&hydrate=stats(group=pitching,type=season)")
        for p in ppl.get("people", []):
            for st in p.get("stats", []):
                for sp in st.get("splits", []):
                    s = sp.get("stat", {})
                    season[p["id"]] = {"np": s.get("numberOfPitches"), "gsn": s.get("gamesStarted")}

    R = {k: [0, 0] for k in FACTORS}

    def bump(k, live):
        R[k][1] += 1
        R[k][0] += 1 if live else 0

    # shPenF replicates the engine's own load weighting (daysAgo 1 / 2 / else)
    loads = {}
    if BP:
        for k, v in BP.items():
            loads[k] = sum((1 if (r.get("daysAgo") or 0) <= 1 else 0.6 if r.get("daysAgo") == 2 else 0.3)
                           * (r.get("pitches") or 0) for r in (v or []))
    avg_load = (sum(loads.values()) / len(loads)) if loads else 0

    for g in games:
        aw, hm = g["teams"]["away"]["team"]["name"], g["teams"]["home"]["team"]["name"]
        # shUmpKf — per game, needs a matched ctx game with a non-null kFactor
        kf = next((bool((c.get("hpUmp") or {}).get("kFactor")) for c in ctxg
                   if pn(c.get("away")) == pn(aw) and pn(c.get("home")) == pn(hm)), False)
        bump("shUmpKf", kf)
        # shTempF — per game, off the statsapi slate (NOT context.json); 70F is exactly identity
        try:
            t = float((g.get("weather") or {}).get("temp"))
        except (TypeError, ValueError):
            t = None
        bump("shTempF", t is not None and abs(t - 70) > 1e-9)

        for side in ("away", "home"):
            team = g["teams"][side]["team"]["name"]
            pid = (g["teams"][side].get("probablePitcher") or {}).get("id")
            if pid:
                pc = (PIT.get(str(pid)) or {}).get("pct") or {}
                bump("shPitPctF", pc.get("xwoba") is not None or pc.get("xera") is not None)
                s = season.get(pid) or {}
                np_, gsn = s.get("np"), s.get("gsn")
                ppg = (np_ / gsn) if (np_ and gsn and gsn >= 3) else None
                bump("shLaborF", ppg is not None and (ppg >= 97 or ppg <= 84))
            opp = "home" if side == "away" else "away"
            lu = (g.get("lineups") or {}).get(f"{opp}Players") or []
            if lu:
                c = sum(1 for p in lu if ((BAT.get(str(p.get("id"))) or {}).get("pct") or {}).get("whiff_percent") is not None)
                bump("shOppWhiffF", c >= 5)
            if loads:
                mine = next((v for k, v in loads.items() if pn(k) == pn(team)), None)
                if mine is not None and avg_load > 0:
                    bump("shPenF", abs(mine / avg_load - 1) > 1e-9)
            row = next((v for k, v in PQ.items() if k != "__league" and pn(k) == pn(team)), None)
            if row and PQL.get("era"):
                bump("shPenQF", (row.get("ip") or 0) >= 15)

    out = {
        "date": a.date,
        "games": len(games),
        "context_generated_at": ctx.get("generated_at"),
        "priors_generated_at": pri.get("generated_at"),
        "factors": {k: {"live": v[0], "applicable": v[1],
                        "share": (round(v[0] / v[1], 3) if v[1] else None)} for k, v in R.items()},
    }
    print(json.dumps(out, indent=2))
    if a.json:
        json.dump(out, open(a.json, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
