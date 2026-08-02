#!/usr/bin/env python3
"""Build public/model/ufc.json — the UFC rankings + roster reference for the
Stats tab. Two authoritative live sources, merged; nothing is ever invented.

  1. ufc.com/rankings  -> the OFFICIAL rank order: champion + #1..15 for each of
     the 11 divisions, plus the Men's and Women's Pound-for-Pound top-15.
  2. Wikipedia "List of current UFC fighters" -> the full ACTIVE roster of every
     signed fighter in each division, with MMA record, nickname and age.

The rank order is overlaid on the full roster by fuzzy name match, so each
division reads "champion, then #1..15, then everyone else (unranked)" — exactly
the shape the Stats view wants. Records/nicknames come from Wikipedia (ufc.com's
rankings table carries none). If either source is unreachable the tool exits
non-zero and leaves the existing ufc.json untouched (never publishes a blank).

Runs with the Python standard library only (CI needs no pip install). Refreshed
weekly by .github/workflows/ufc.yml after the weekend cards settle.
"""

import html
import json
import re
import sys
import time
import unicodedata
import urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")

# Canonical divisions, heaviest men first, then women's. `ufc` matches the
# ufc.com grouping header exactly (after unescaping); `wiki` is a lowercase
# prefix of the Wikipedia section heading (e.g. "Light heavyweights (205 lb…)").
DIVISIONS = [
    ("heavyweight",          "Heavyweight",           "265 lb", "men",   "Heavyweight",           "heavyweights"),
    ("light-heavyweight",    "Light Heavyweight",     "205 lb", "men",   "Light Heavyweight",     "light heavyweights"),
    ("middleweight",         "Middleweight",          "185 lb", "men",   "Middleweight",          "middleweights"),
    ("welterweight",         "Welterweight",          "170 lb", "men",   "Welterweight",          "welterweights"),
    ("lightweight",          "Lightweight",           "155 lb", "men",   "Lightweight",           "lightweights"),
    ("featherweight",        "Featherweight",         "145 lb", "men",   "Featherweight",         "featherweights"),
    ("bantamweight",         "Bantamweight",          "135 lb", "men",   "Bantamweight",          "bantamweights"),
    ("flyweight",            "Flyweight",             "125 lb", "men",   "Flyweight",             "flyweights"),
    ("womens-bantamweight",  "Women's Bantamweight",  "135 lb", "women", "Women's Bantamweight",  "women's bantamweights"),
    ("womens-flyweight",     "Women's Flyweight",     "125 lb", "women", "Women's Flyweight",     "women's flyweights"),
    ("womens-strawweight",   "Women's Strawweight",   "115 lb", "women", "Women's Strawweight",   "women's strawweights"),
]


def fetch(url, tries=3):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/json,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE401
            last = e
            time.sleep(1.5 * (i + 1))
    raise SystemExit(f"fetch failed for {url}: {last}")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def _fold(name):
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\b(jr|sr|ii|iii|iv)\b", " ", s)


def norm(name):
    """Normalise a fighter name for matching: lowercase, drop accents, strip
    Jr/Sr/II/III suffixes and any non-letters."""
    return re.sub(r"[^a-z]", "", _fold(name))


def toks(name):
    """Token set of a name (letters only, length >= 2) — order-independent so
    'Weili Zhang' and 'Zhang Weili' compare equal."""
    return {t for t in re.findall(r"[a-z]+", _fold(name)) if len(t) >= 2}


def make_index(entries):
    """Prepare a roster for lookup: exact-norm map + token-set list."""
    exact, toklist = {}, []
    for e in entries:
        exact.setdefault(norm(e["name"]), e)
        toklist.append((toks(e["name"]), e))
    return exact, toklist


def name_match(target, index):
    """Resolve a fighter name against a prepared roster index. Tries exact,
    then order-independent token containment (handles reversed names, added
    middle names / nicknames like 'Michael Venom Page' vs 'Michael Page'),
    then a loose prefix fallback. Never matches on a single shared token."""
    exact, toklist = index
    n = norm(target)
    if n in exact:
        return exact[n]
    tt = toks(target)
    if len(tt) >= 2:
        best, best_diff = None, 99
        for ts, e in toklist:
            if len(ts) < 2:
                continue
            small, large = (tt, ts) if len(tt) <= len(ts) else (ts, tt)
            if small <= large and len(small & large) >= 2:
                diff = len(large) - len(small)
                if diff < best_diff:
                    best, best_diff = e, diff
        if best:
            return best
    for k, e in exact.items():
        if k and (k.startswith(n) or n.startswith(k)) and abs(len(k) - len(n)) <= 6:
            return e
    return None


# ---------------------------------------------------------------------------
# 1) ufc.com/rankings  ->  rank order
# ---------------------------------------------------------------------------
def parse_rankings(h):
    """Return {division_name: {champion, ranks[]}} and the two P4P lists.
    Each grouping block on the page = header + champion card + a table whose
    rows are (rank number, athlete link, movement)."""
    blocks = re.split(r'<div class="view-grouping">', h)
    out = {}
    p4p = {"men": [], "women": []}
    for b in blocks[1:]:
        hm = re.search(r'view-grouping-header">(.*?)</div>', b, re.S)
        if not hm:
            continue
        header = strip_tags(hm.group(1))
        champ = None
        cm = re.search(r'rankings--athlete--champion.*?<h5><a href="/athlete/([^"]+)"[^>]*>([^<]+)</a>', b, re.S)
        if cm:
            champ = {"slug": cm.group(1), "name": html.unescape(cm.group(2)).strip()}
        ranks = []
        for row in re.findall(r"<tr>(.*?)</tr>", b, re.S):
            rk = re.search(r'weight-class-rank">\s*(\d+)', row)
            nm = re.search(r'views-field-title"><a href="/athlete/([^"]+)"[^>]*>([^<]+)</a>', row)
            if not rk or not nm:
                continue
            mv = None
            if "rank-increase" in row:
                n = re.search(r"increased by</span>\s*(\d+)", row)
                mv = {"dir": "up", "n": int(n.group(1))} if n else {"dir": "up", "n": 0}
            elif "rank-decrease" in row:
                n = re.search(r"decreased by</span>\s*(\d+)", row)
                mv = {"dir": "down", "n": int(n.group(1))} if n else {"dir": "down", "n": 0}
            elif "not-ranked" in row:
                mv = {"dir": "new", "n": 0}
            ranks.append({
                "rank": int(rk.group(1)),
                "slug": nm.group(1),
                "name": html.unescape(nm.group(2)).strip(),
                "move": mv,
            })
        low = header.lower()
        if "pound-for-pound" in low:
            p4p["women" if low.startswith("women") else "men"] = ranks
        else:
            out.setdefault(header, {"champion": champ, "ranks": ranks})
    return out, p4p


# ---------------------------------------------------------------------------
# 2) Wikipedia  ->  full active roster per division (records/nicknames/ages)
# ---------------------------------------------------------------------------
def parse_roster(h):
    """Return {wiki_key_lower: [ {name, nickname, age, record, country} ]}.
    Each division heading is followed by a wikitable of every active fighter;
    columns are located by their header labels so a reorder won't misread."""
    # split on headings so each division's first wikitable belongs to it
    heads = list(re.finditer(r"<h[234][^>]*>(.*?)</h[234]>", h, re.S))
    rosters = {}
    for i, m in enumerate(heads):
        title = strip_tags(m.group(1)).lower()
        start = m.end()
        end = heads[i + 1].start() if i + 1 < len(heads) else len(h)
        seg = h[start:end]
        ts = seg.find("<table")
        if ts < 0 or "wikitable" not in seg[ts:ts + 200]:
            continue
        te = seg.find("</table>", ts)
        table = seg[ts:te]
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)
        if not rows:
            continue
        hdr = [strip_tags(c).lower() for c in re.findall(r"<th[^>]*>(.*?)</th>", rows[0], re.S)]
        def col(*names):
            for want in names:
                for j, lab in enumerate(hdr):
                    if want in lab:
                        return j
            return None
        ci_name = col("name")
        ci_nick = col("nickname")
        ci_age = col("age")
        ci_rec = col("mma record", "record")
        if ci_name is None or ci_rec is None:
            continue
        fighters = []
        for row in rows[1:]:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
            if len(cells) <= max(ci_name, ci_rec):
                continue
            link = re.search(r'<a href="/wiki/[^"]*"[^>]*>([^<]+)</a>', cells[ci_name])
            if not link:
                continue
            rec = strip_tags(cells[ci_rec]).replace("–", "-")
            if not re.match(r"\d+-\d+", rec):
                continue
            country = None
            cflag = re.search(r'title="([^"]+)"', cells[0]) if cells else None
            if cflag:
                country = cflag.group(1)
            fighters.append({
                "name": html.unescape(link.group(1)).strip(),
                "nickname": strip_tags(cells[ci_nick]) if ci_nick is not None and ci_nick < len(cells) else "",
                "age": strip_tags(cells[ci_age]) if ci_age is not None and ci_age < len(cells) else "",
                "record": rec,
                "country": country,
            })
        if fighters:
            rosters[title] = fighters
    return rosters


# ---------------------------------------------------------------------------
# merge
# ---------------------------------------------------------------------------
def build():
    rank_html = fetch("https://www.ufc.com/rankings")
    ranks_by_div, p4p = parse_rankings(rank_html)
    if not ranks_by_div:
        raise SystemExit("parsed 0 divisions from ufc.com/rankings — markup changed")

    wiki_json = json.loads(fetch(
        "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_current_UFC_fighters"
        "&prop=text&format=json&formatversion=2"))
    rosters = parse_roster(wiki_json["parse"]["text"])

    # global roster index — lets a fighter ranked in one division (e.g. Max
    # Holloway ranked at LW but rostered at FW) still resolve to a record.
    all_entries = [f for flist in rosters.values() for f in flist]
    global_index = make_index(all_entries)

    divisions = []
    for did, name, weight, gender, ufc_key, wiki_key in DIVISIONS:
        rk = ranks_by_div.get(ufc_key, {"champion": None, "ranks": []})
        roster = None
        for wk, flist in rosters.items():
            if wk.startswith(wiki_key):
                roster = flist
                break
        roster = roster or []
        idx = make_index(roster)
        used = set()

        def enrich(nm):
            # local match decides roster membership (so unranked can exclude it);
            # fall back to the global roster only to fill in the record.
            local = name_match(nm, idx)
            if local:
                used.add(norm(local["name"]))
            return local or name_match(nm, global_index)

        fighters = []
        # champion
        champion = None
        if rk["champion"]:
            f = enrich(rk["champion"]["name"])
            champion = {
                "rank": "C",
                "name": rk["champion"]["name"],
                "slug": rk["champion"]["slug"],
                "record": f["record"] if f else None,
                "nickname": f["nickname"] if f else "",
                "age": f["age"] if f else "",
                "country": f["country"] if f else None,
                "move": None,
            }
            fighters.append(champion)
        # ranked #1..15
        for r in sorted(rk["ranks"], key=lambda x: x["rank"]):
            f = enrich(r["name"])
            fighters.append({
                "rank": r["rank"],
                "name": r["name"],
                "slug": r["slug"],
                "record": f["record"] if f else None,
                "nickname": f["nickname"] if f else "",
                "age": f["age"] if f else "",
                "country": f["country"] if f else None,
                "move": r["move"],
            })
        # unranked — everyone left in the roster, alphabetical
        unranked = [f for f in roster if norm(f["name"]) not in used]
        unranked.sort(key=lambda f: f["name"].split()[-1].lower())
        for f in unranked:
            fighters.append({
                "rank": None,
                "name": f["name"],
                "slug": None,
                "record": f["record"],
                "nickname": f["nickname"],
                "age": f["age"],
                "country": f["country"],
                "move": None,
            })

        divisions.append({
            "id": did, "name": name, "weight": weight, "gender": gender,
            "rankedCount": (1 if champion else 0) + len(rk["ranks"]),
            "totalCount": len(fighters),
            "fighters": fighters,
        })

    def p4p_rows(rows):
        out = []
        for r in rows:
            f = name_match(r["name"], global_index)
            out.append({
                "rank": r["rank"], "name": r["name"], "slug": r["slug"],
                "record": f["record"] if f else None,
                "nickname": f["nickname"] if f else "",
                "move": r["move"],
            })
        return out

    return {
        "generatedAt": int(time.time() * 1000),
        "source": "Official rankings via ufc.com/rankings · active rosters via Wikipedia",
        "divisions": divisions,
        "p4p": {"men": p4p_rows(p4p["men"]), "women": p4p_rows(p4p["women"])},
    }


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "public/model/ufc.json"
    data = build()
    ranked = sum(d["rankedCount"] for d in data["divisions"])
    total = sum(d["totalCount"] for d in data["divisions"])
    if ranked < 80:  # sanity: 11 champs + ~150 ranked expected
        raise SystemExit(f"only {ranked} ranked fighters parsed — refusing to publish")
    with open(out_path, "w") as fh:
        json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {out_path}: {len(data['divisions'])} divisions, "
          f"{ranked} ranked, {total} total fighters, "
          f"P4P men {len(data['p4p']['men'])}/women {len(data['p4p']['women'])}")


if __name__ == "__main__":
    main()
