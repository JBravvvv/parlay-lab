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


def xba_asof(commits, field="xba", cache={}):
    """date -> {player_id(str): <field>} from the latest commit dated <= date."""
    def load(h):
        key = (h, field)
        if key not in cache:
            raw = subprocess.run(["git", "show", f"{h}:public/model/priors.json"],
                                 capture_output=True, text=True, check=True).stdout
            j = json.loads(raw)
            if field == "xiso":
                # not stored — derived, exactly as the engine's shPriorHR does
                cache[key] = {k: (v["xslg"] - v["xba"])
                              for k, v in (j.get("batters") or {}).items()
                              if v.get("xslg") is not None and v.get("xba") is not None}
            else:
                cache[key] = {k: v.get(field) for k, v in (j.get("batters") or {}).items()}
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


PRIOR_FIELD = {"hits": "xba", "tb": "xslg", "hr": "xiso"}


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
    ids = season_batters()
    print(f"batters with ≥{MIN_ABSEA_POOL} season AB: {len(ids)}")
    commits = prior_commits()
    print(f"priors.json commits available: {len(commits)} "
          f"({commits[-1][1]} → {commits[0][1]})" if commits else "NO priors history")
    getx = xba_asof(commits, PRIOR_FIELD[market])

    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    days = [(d0 + timedelta(i)).isoformat() for i in range((d1 - d0).days + 1)]

    obs = []  # (r30, rSeason, xba, y, ab_weight)
    dropped = defaultdict(int)
    for n_i, pid in enumerate(ids):
        gl = game_log(pid, market)
        if n_i % 100 == 0:
            print(f"  …{n_i}/{len(ids)} players", file=sys.stderr)
        for D in days:
            day = gl.get(D)
            if not day or day[1] < 1:
                continue
            xmap = getx(D)
            xba = xmap.get(str(pid)) if xmap else None
            if xba is None:
                dropped["no_xba"] += 1
                continue
            lo = (date.fromisoformat(D) - timedelta(30)).isoformat()
            h30 = ab30 = hs = abs_ = 0
            for dt, (h, ab) in gl.items():
                if dt >= D:            # SAME-DAY (and any later) EXCLUDED from every window
                    continue
                hs += h; abs_ += ab
                if dt >= lo:
                    h30 += h; ab30 += ab
            if ab30 < MIN_AB30:
                dropped["thin_ab30"] += 1
                continue
            if abs_ < MIN_ABSEASON:
                dropped["thin_season"] += 1
                continue
            obs.append((h30 / ab30, hs / abs_, float(xba), day[0] / day[1], day[1]))
    print(f"\nplayer-dates: {len(obs)}  dropped: {dict(dropped)}")
    if len(obs) < 100:
        print("too thin — aborting")
        return

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
