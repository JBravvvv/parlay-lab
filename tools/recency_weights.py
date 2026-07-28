#!/usr/bin/env python3
"""The recency-weight measurement — M11's fix gate (2026-07-27).

Regresses each player-date's REALIZED per-AB hit rate on the three candidate predictors as of
that date: last-30 rate, season rate, xBA prior. Returns the true predictive weight of each —
the number the .25/.35/.40 blend hard-codes from intent. The M11 fix spec is GATED on this.

Leak-free construction:
  - every window ends at D−1: the player's own game(s) on the target date are excluded from
    EVERY predictor window, not just the last-30 (game logs are grouped by date first, so a
    doubleheader's two games leave both windows together);
  - xBA as-of-date comes from the priors.json GIT HISTORY (nightly model.yml commits): the
    latest commit dated ≤ D reflects data through D−1.

The predictors are the NOISY OBSERVABLES the engine actually consumes, so attenuation is the
correct object here — the regression answers "what weight should the engine put on the
last-30 rate it can see", not "does true form exist".

Usage: python3 tools/recency_weights.py [--start 2026-07-11] [--end 2026-07-26]
Caches statsapi responses under the scratch dir given by RW_CACHE (or ./.rw_cache).
"""
import json, math, os, re, subprocess, sys, time, urllib.request
from collections import defaultdict
from datetime import date, timedelta

API = "https://statsapi.mlb.com/api/v1"
CACHE = os.environ.get("RW_CACHE", ".rw_cache")
MIN_AB30, MIN_ABSEASON, MIN_ABSEA_POOL = 20, 40, 40


def fetch(url, key):
    os.makedirs(CACHE, exist_ok=True)
    fp = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9]", "_", key) + ".json")
    if os.path.exists(fp):
        return json.load(open(fp))
    with urllib.request.urlopen(url, timeout=30) as r:
        d = json.loads(r.read())
    json.dump(d, open(fp, "w"))
    time.sleep(0.12)
    return d


def season_batters():
    d = fetch(f"{API}/stats?stats=season&group=hitting&season=2026&playerPool=ALL&limit=3000",
              "season_hitting_2026")
    out = []
    for sp in d["stats"][0]["splits"]:
        ab = int(sp["stat"].get("atBats") or 0)
        if ab >= MIN_ABSEA_POOL and sp.get("player"):
            out.append(sp["player"]["id"])
    return out


STAT_KEY = {"hits": "hits", "tb": "totalBases", "hr": "homeRuns"}
# pitcher outcomes: numerator key, denominator ("bf" per batter faced | "start" per start)
PIT_KEY = {"p_h": ("hits", "bf"), "p_k": ("strikeOuts", "bf"), "p_outs": ("outs", "start")}


def ip_outs(ip):
    """statsapi inningsPitched "6.1" → outs (6⅓ innings = 19)."""
    if ip is None:
        return 0
    t = str(ip).split(".")
    return int(t[0]) * 3 + (int(t[1]) if len(t) > 1 else 0)


def season_pitchers():
    d = fetch(f"{API}/stats?stats=season&group=pitching&season=2026&playerPool=ALL&limit=3000",
              "season_pitching_2026")
    out = []
    for sp in d["stats"][0]["splits"]:
        gs = int(sp["stat"].get("gamesStarted") or 0)
        if gs >= 3 and sp.get("player"):
            out.append(sp["player"]["id"])
    return out


def pitcher_log(pid, num_key):
    """date -> [numerator, BF, outs, isStart] for START games only."""
    d = fetch(f"{API}/people/{pid}/stats?stats=gameLog&group=pitching&season=2026", f"pgl_{pid}")
    by_date = defaultdict(lambda: [0, 0, 0])
    try:
        splits = d["stats"][0]["splits"]
    except (KeyError, IndexError):
        return {}
    for sp in splits:
        dt, st = sp.get("date"), sp.get("stat") or {}
        if not dt or int(st.get("gamesStarted") or 0) < 1:
            continue
        num = ip_outs(st.get("inningsPitched")) if num_key == "outs" else int(st.get(num_key) or 0)
        by_date[dt][0] += num
        by_date[dt][1] += int(st.get("battersFaced") or 0)
        by_date[dt][2] += ip_outs(st.get("inningsPitched"))
    return dict(by_date)


def game_log(pid, market="hits"):
    d = fetch(f"{API}/people/{pid}/stats?stats=gameLog&group=hitting&season=2026", f"gl_{pid}")
    by_date = defaultdict(lambda: [0, 0])  # date -> [numerator, AB]
    try:
        splits = d["stats"][0]["splits"]
    except (KeyError, IndexError):
        return {}
    key = STAT_KEY[market]
    for sp in splits:
        dt = sp.get("date")
        st = sp.get("stat") or {}
        if dt:
            by_date[dt][0] += int(st.get(key) or 0)
            by_date[dt][1] += int(st.get("atBats") or 0)
    return dict(by_date)


def prior_commits():
    out = subprocess.run(
        ["git", "log", "--format=%H %as", "--", "public/model/priors.json"],
        capture_output=True, text=True, check=True).stdout.split("\n")
    pairs = [l.split() for l in out if l.strip()]
    return [(h, d) for h, d in pairs]  # newest first


def xba_asof(commits, field="xba", section="batters", cache={}):
    """date -> {player_id(str): <field>} from the latest commit dated <= date."""
    def load(h):
        key = (h, field, section)
        if key not in cache:
            raw = subprocess.run(["git", "show", f"{h}:public/model/priors.json"],
                                 capture_output=True, text=True, check=True).stdout
            j = json.loads(raw)
            if field == "xiso":
                # not stored — derived, exactly as the engine's shPriorHR does
                cache[key] = {k: (v["xslg"] - v["xba"])
                              for k, v in (j.get(section) or {}).items()
                              if v.get("xslg") is not None and v.get("xba") is not None}
            else:
                cache[key] = {k: v.get(field) for k, v in (j.get(section) or {}).items()}
        return cache[key]

    def get(day):
        for h, d in commits:  # newest first
            if d <= day:
                return load(h)
        return None
    return get


def wls(X, y, w):
    n, k = len(y), len(X) + 1
    rows = [[1.0] + [c[i] for c in X] for i in range(n)]
    XtX = [[sum(w[i] * rows[i][a] * rows[i][b] for i in range(n)) for b in range(k)] for a in range(k)]
    Xty = [sum(w[i] * rows[i][a] * y[i] for i in range(n)) for a in range(k)]
    aug = [XtX[i][:] + [1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
    for col in range(k):
        piv = max(range(col, k), key=lambda r: abs(aug[r][col]))
        aug[col], aug[piv] = aug[piv], aug[col]
        pv = aug[col][col]
        aug[col] = [v / pv for v in aug[col]]
        for r in range(k):
            if r != col and aug[r][col]:
                f = aug[r][col]
                aug[r] = [v - f * z for v, z in zip(aug[r], aug[col])]
    inv = [row[k:] for row in aug]
    betas = [sum(inv[a][b] * Xty[b] for b in range(k)) for a in range(k)]
    resid = [y[i] - sum(betas[j] * rows[i][j] for j in range(k)) for i in range(n)]
    s2 = sum(w[i] * resid[i] ** 2 for i in range(n)) / (sum(w) - k) * (n / sum(w)) * (sum(w) / n)
    # heteroskedasticity-consistent would be nicer; binomial weights make classical OK here
    s2 = sum(w[i] * resid[i] ** 2 for i in range(n)) / (n - k)
    return betas, [math.sqrt(max(s2 * inv[j][j], 0)) for j in range(k)]


PRIOR_FIELD = {"hits": "xba", "tb": "xslg", "hr": "xiso",
               "p_h": "xba", "p_k": "whiff_pct", "p_outs": None}


def main(start="2026-07-11", end="2026-07-26", market="hits"):
    args = sys.argv[1:]
    if "--start" in args:
        start = args[args.index("--start") + 1]
    if "--end" in args:
        end = args[args.index("--end") + 1]
    if "--market" in args:
        market = args[args.index("--market") + 1]
    print(f"market: {market}  (prior = {PRIOR_FIELD[market]}; xSLG IS expected TB/AB; "
          f"xISO rescaled to HR/AB by the sample league ratio)")
    pitcher = market.startswith("p_")
    ids = season_pitchers() if pitcher else season_batters()
    print(f"{'pitchers with ≥3 GS' if pitcher else f'batters with ≥{MIN_ABSEA_POOL} season AB'}: {len(ids)}")
    commits = prior_commits()
    print(f"priors.json commits available: {len(commits)} "
          f"({commits[-1][1]} → {commits[0][1]})" if commits else "NO priors history")
    getx = (xba_asof(commits, PRIOR_FIELD[market], "pitchers") if pitcher and PRIOR_FIELD[market]
            else xba_asof(commits, PRIOR_FIELD[market]) if PRIOR_FIELD[market] else None)

    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    days = [(d0 + timedelta(i)).isoformat() for i in range((d1 - d0).days + 1)]

    obs = []  # (r30, rSeason, xba, y, ab_weight)
    dropped = defaultdict(int)
    for n_i, pid in enumerate(ids):
        if pitcher:
            num_key, den = PIT_KEY[market]
            gl = pitcher_log(pid, num_key)
        else:
            gl = game_log(pid, market)
        if n_i % 100 == 0:
            print(f"  …{n_i}/{len(ids)} players", file=sys.stderr)
        for D in days:
            day = gl.get(D)
            if not day or (day[1] < 1 and not pitcher):
                continue
            if getx is not None:
                xmap = getx(D)
                xv = xmap.get(str(pid)) if xmap else None
                if xv is None:
                    dropped["no_prior"] += 1
                    continue
            else:
                xv = None
            lo = (date.fromisoformat(D) - timedelta(30)).isoformat()
            n30 = d30 = ns = ds = st30 = sts = 0
            for dt, rec in gl.items():
                if dt >= D:            # SAME-DAY (and any later) EXCLUDED from every window
                    continue
                ns += rec[0]; ds += rec[1]; sts += 1
                if dt >= lo:
                    n30 += rec[0]; d30 += rec[1]; st30 += 1
            if pitcher:
                # engine parity: the cliff branch needs 3 starts last-30; season floor 5
                if st30 < 3:
                    dropped["thin_st30"] += 1; continue
                if sts < 5:
                    dropped["thin_season"] += 1; continue
                if den == "bf":
                    if d30 < 30 or ds < 60 or day[1] < 1:
                        dropped["thin_bf"] += 1; continue
                    obs.append((n30 / d30, ns / ds, xv, day[0] / day[1], day[1]))
                else:  # outs per start
                    obs.append((n30 / st30, ns / sts, xv, day[0], 1))
            else:
                if d30 < MIN_AB30:
                    dropped["thin_ab30"] += 1; continue
                if ds < MIN_ABSEASON:
                    dropped["thin_season"] += 1; continue
                obs.append((n30 / d30, ns / ds, xv, day[0] / day[1], day[1]))
    print(f"\nplayer-dates: {len(obs)}  dropped: {dict(dropped)}")
    if len(obs) < 100:
        print("too thin — aborting")
        return

    if PRIOR_FIELD[market] is None:
        R30 = [o[0] for o in obs]; RS = [o[1] for o in obs]
        Y = [o[3] for o in obs]; Wt = [o[4] for o in obs]
        betas, ses = wls([R30, RS], Y, Wt)
        print(f"\nWLS, y = outs recorded per start (no expected-metric prior exists — 2-var):")
        print(f"  intercept {betas[0]:+.3f} (SE {ses[0]:.3f})")
        print(f"  last-30   {betas[1]:+.4f} (SE {ses[1]:.4f})")
        print(f"  season    {betas[2]:+.4f} (SE {ses[2]:.4f})")
        import statistics
        print(f"  n={len(obs)}  y mean {statistics.fmean(Y):.2f}  "
              f"r30 SD {statistics.pstdev(R30):.2f}  season SD {statistics.pstdev(RS):.2f}")
        return
    if market == "p_k":
        # whiff% is in percent units — rescale to K/BF by the sample league ratio
        mS = sum(o[1] for o in obs) / len(obs)
        mX = sum(o[2] for o in obs) / len(obs)
        k = mS / mX
        obs = [(a, b, c * k, d, e) for a, b, c, d, e in obs]
        print(f"  whiff%→K/BF rescale: ×{k:.4f}")
    if market == "hr":
        # xISO is expected (TB−H)/AB; rescale to HR/AB units via the sample ratio so the
        # weights are share-comparable with the windowed rates
        mS = sum(o[1] for o in obs) / len(obs)
        mX = sum(o[2] for o in obs) / len(obs)
        k = mS / mX
        obs = [(a, b, c * k, d, e) for a, b, c, d, e in obs]
        print(f"  xISO→HR/AB rescale: ×{k:.3f}")
    R30 = [o[0] for o in obs]
    RS = [o[1] for o in obs]
    XB = [o[2] for o in obs]
    Y = [o[3] for o in obs]
    Wt = [o[4] for o in obs]
    betas, ses = wls([R30, RS, XB], Y, Wt)
    print(f"\nWLS (AB-weighted), y = realized per-AB hit rate on date D:")
    print(f"  intercept {betas[0]:+.4f} (SE {ses[0]:.4f})")
    print(f"  last-30   {betas[1]:+.4f} (SE {ses[1]:.4f})")
    print(f"  season    {betas[2]:+.4f} (SE {ses[2]:.4f})")
    print(f"  xBA       {betas[3]:+.4f} (SE {ses[3]:.4f})")
    print(f"  (delta form: form-delta weight = last-30 coefficient = {betas[1]:+.4f})")
    mR, mS, mX = (sum(v) / len(v) for v in (R30, RS, XB))
    print(f"  predictor means: r30 {mR:.3f}  season {mS:.3f}  xBA {mX:.3f}  y {sum(Y)/len(Y):.3f}")
    import statistics
    print(f"  predictor SDs:   r30 {statistics.pstdev(R30):.4f}  season {statistics.pstdev(RS):.4f}  "
          f"xBA {statistics.pstdev(XB):.4f}")
    print(f"\nengine's implied weights for comparison: blend(.25/.35/.40 recency-nested, no season) "
          f"kept at ~56% past shShrink(k=60) + ~44% xBA prior")


if __name__ == "__main__":
    main()
