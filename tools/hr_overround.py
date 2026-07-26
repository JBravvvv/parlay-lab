#!/usr/bin/env python3
"""Measure the REALIZED overround on the anytime-HR market.

WHY THIS EXISTS (2026-07-25)
----------------------------
`legacy/index.html` L2388 prices every one-sided row as `fair = oneImp / 1.06`.
Measured against 12 days of two-sided rows, Caesars' real overround on props is
**1.071** — so on the markets we can see, the constant is thin by ~1.1% relative,
worth ~+0.6pp of czEV. But `batter_home_runs` is `n = 0` on 100% of rows: no book
posts both sides, so that audit is impossible there, and HR is the market where the
fallback prices *everything*. The sensitivity is wide and decision-relevant:

    overround 1.07  ->  czEV overstated ~+0.7pp
    overround 1.15  ->  czEV overstated ~+5.5pp
    overround 1.25  ->  czEV overstated ~+11.7pp

The second and third would each dwarf `coreEvMin` (+2%).

THE ESTIMATOR (owner's, 2026-07-25) — exact, not approximate
------------------------------------------------------------
By linearity of expectation, the sum of P(player i hits >= 1 HR) over a set of
players IS E[number of distinct HR hitters in that set]. No independence assumption
is needed, which is what makes this clean:

    overround_HR = SUM over listed players of implied(bo_i)
                 / mean realized distinct HR hitters AMONG THOSE SAME PLAYERS

Numerator from the archive's `bo` (best over price across books) — deliberately `bo`
rather than any single book's price, because `bo` is what the fallback actually
consumes (`oneImp = iO` at L2388). Denominator from statsapi box scores, restricted
to the same player set so the populations match.

SCRATCHES: a listed player who never appears has a posted probability but zero
chance of a HR, so counting him inflates the estimate. Caesars voids those bets, so
the honest primary figure EXCLUDES players who did not appear. Both variants are
reported — the gap between them is itself the size of the scratch effect.

REQUIRES `bo`, added to snapshot_props.py on 2026-07-25. Snapshots archived before
that date carry no HR price at all and are skipped. Zero API credits: the archive is
already on disk and statsapi is keyless.

Usage:
    python3 tools/hr_overround.py [--dir data/props] [--min-days 14] [--json out.json]
"""
import argparse, json, os, re, sys, unicodedata, urllib.request
from datetime import datetime

STATS = "https://statsapi.mlb.com/api/v1"
MKT = "batter_home_runs"
UA = "parlay-lab-hr-overround/1.0"
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?$")


def imp(am):
    am = float(am)
    return 100 / (am + 100) if am > 0 else abs(am) / (abs(am) + 100)


def norm(name):
    """Fold accents/punctuation/suffixes so Odds API and statsapi names meet."""
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[.'`\-]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return SUFFIX.sub("", s).strip()


def short(name):
    """Fallback key: first initial + last token ('a judge')."""
    parts = norm(name).split()
    return f"{parts[0][:1]} {parts[-1]}" if len(parts) >= 2 else norm(name)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def schedule(date):
    """gamePk -> (away, home, gameNumber, startISO) for one date."""
    out = []
    for d in get(f"{STATS}/schedule?sportId=1&date={date}").get("dates", []):
        for g in d.get("games", []):
            out.append({
                "pk": g["gamePk"],
                "away": g["teams"]["away"]["team"]["name"],
                "home": g["teams"]["home"]["team"]["name"],
                "gn": g.get("gameNumber", 1),
                "start": g.get("gameDate"),
                "state": (g.get("status") or {}).get("abstractGameState"),
            })
    return out


def hr_by_player(pk):
    """{normalized name: HR} for every player who actually BATTED in the game."""
    bx = get(f"{STATS}/game/{pk}/boxscore")
    out = {}
    for side in ("away", "home"):
        for p in (bx.get("teams", {}).get(side, {}).get("players", {}) or {}).values():
            bat = (p.get("stats") or {}).get("batting") or {}
            if not bat:
                continue  # never came to the plate — a scratch, not a 0-for
            nm = (p.get("person") or {}).get("fullName")
            out[norm(nm)] = int(bat.get("homeRuns") or 0)
    return out


def pick_game(sched, ev):
    """Match an archived odds event to its gamePk (doubleheader-safe via start time)."""
    cands = [g for g in sched if g["away"] == ev.get("away") and g["home"] == ev.get("home")]
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0]
    def secs(g):
        try:
            a = datetime.fromisoformat(str(ev.get("start", "")).replace("Z", "+00:00"))
            b = datetime.fromisoformat(str(g.get("start", "")).replace("Z", "+00:00"))
            return abs((a - b).total_seconds())
        except Exception:
            return 1e12
    return min(cands, key=secs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="data/props")
    ap.add_argument("--min-days", type=int, default=14)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    files = sorted(f for f in os.listdir(a.dir) if f.endswith(".json"))
    sum_p_all = sum_p_app = 0.0
    hits_all = hits_app = 0
    days, games, rows, unmatched, no_price = set(), 0, 0, 0, 0

    for f in files:
        date = f[:10]
        day = json.load(open(os.path.join(a.dir, f)))
        snaps = day.get("snapshots") or []
        if not snaps:
            continue
        snap = snaps[-1]  # last read before the slate = the close, same convention as the scoreboard
        sched = None
        for ev in snap.get("events", []):
            hr = (ev.get("markets") or {}).get(MKT)
            if not hr:
                continue
            priced = {}
            for kk, r in hr.items():
                # ONLY the 0.5 line. The archive carries 0.5 / 1.5 / 2.5 for most
                # players (250 / 231 / 210 on 2026-07-24), and the estimator is exact
                # only for P(>= 1 HR): E[distinct HR hitters] is the sum of the 0.5
                # probabilities, not of "2+ HR" probabilities. Keying by player name
                # without this filter silently keeps whichever line iterated last.
                # It is also the only line the engine plays (locked rule: HR 0.5 only).
                who, _, pt = kk.rpartition("|")
                try:
                    if float(pt) != 0.5:
                        continue
                except ValueError:
                    continue
                bo = r.get("bo")
                if bo is None:
                    no_price += 1
                    continue
                priced[norm(who)] = imp(bo)
            if not priced:
                continue
            if sched is None:
                sched = schedule(date)
            g = pick_game(sched, ev)
            if not g or g.get("state") != "Final":
                unmatched += 1
                continue
            box = hr_by_player(g["pk"])
            byshort = {short(k): v for k, v in box.items()}
            games += 1
            days.add(date)
            for nm, p in priced.items():
                rows += 1
                sum_p_all += p
                appeared = nm in box or short(nm) in byshort
                got = box.get(nm, byshort.get(short(nm), 0))
                hits_all += got if appeared else 0
                if appeared:
                    sum_p_app += p
                    hits_app += got

    def ratio(num, den):
        return round(num / den, 4) if den else None

    res = {
        "days": len(days), "games": games, "rows": rows,
        "rows_without_price": no_price, "games_unmatched_or_unfinal": unmatched,
        # PRIMARY: appeared-only, matching Caesars' void rule
        "appeared": {"sum_implied": round(sum_p_app, 2), "realized_hr_hitters": hits_app,
                     "overround": ratio(sum_p_app, hits_app)},
        # SECONDARY: every listed player, scratches included — always >= primary
        "all_listed": {"sum_implied": round(sum_p_all, 2), "realized_hr_hitters": hits_all,
                       "overround": ratio(sum_p_all, hits_all)},
    }
    if len(days) < a.min_days:
        res["verdict"] = f"INSUFFICIENT — {len(days)} day(s) with HR prices, need {a.min_days}"
    else:
        ov = res["appeared"]["overround"]
        res["verdict"] = (
            "no reading" if ov is None else
            f"overround {ov:.3f} vs the hardcoded 1.06 -> czEV overstated ~{65 * (ov / 1.06 - 1):.1f}pp "
            f"(0.65 x relative bias, price-independent)"
        )
    print(json.dumps(res, indent=2))
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(res, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
