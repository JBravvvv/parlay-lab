#!/usr/bin/env python3
"""merge_prior — the guard that stopped context.json erasing itself daily.

    python3 tools/test_build_context.py

WHY THIS FILE EXISTS
--------------------
`public/model/context.json` was written by replacing the whole object. `officials` are
published by statsapi only near first pitch, so the morning run resolved `hpUmp: null` for
every game and wrote that over an evening file carrying 11-15 of them. Measured over git
history: every 20:xx commit carries 15/15, 14/15, 5/5, 14/17...; the 07:xx commit that
follows each one carries 0/N. **Nothing was ever missing — it was overwritten.**

The fixture is the REAL 2026-07-26 20:32 context (15 of 15 umpires resolved), reduced to the
fields under test. Run it with no arguments; exit code is the result.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_context import merge_prior  # noqa: E402

FULL = {
    "date": "2026-07-26",
    "league_k_per_game": 16.72,
    "games": [
        {"away": f"Away {i}", "home": f"Home {i}", "hpUmp": {"name": f"Ump {i}", "g": 9, "kFactor": 1.02}}
        for i in range(15)
    ],
    "bullpen_last3": {f"Team {i}": {"outs": 9} for i in range(30)},
    "pen_quality": {f"Team {i}": {"era": 3.6} for i in range(31)},
}
clone = lambda d: json.loads(json.dumps(d))
fails = []


def check(name, cond):
    print(("  PASS  " if cond else "  FAIL  ") + name)
    if not cond:
        fails.append(name)


print("merge_prior — context.json null-overwrite guard\n")

nulled = clone(FULL)
for g in nulled["games"]:
    g["hpUmp"] = None
kept = merge_prior(nulled, FULL)
check("a nulling run over the SAME date preserves every umpire",
      kept == 15 and sum(1 for g in nulled["games"] if g["hpUmp"]) == 15)

# carrying yesterday's umpire onto today's game would be a FABRICATED input, which is worse
# than a missing one — the merge must be scoped to the date
tomorrow = clone(FULL)
tomorrow["date"] = "2026-07-27"
for g in tomorrow["games"]:
    g["hpUmp"] = None
check("a DIFFERENT date inherits nothing",
      merge_prior(tomorrow, FULL) == 0 and all(g["hpUmp"] is None for g in tomorrow["games"]))

fresh = clone(FULL)
for g in fresh["games"]:
    g["hpUmp"] = {"name": "NEW", "g": 9, "kFactor": 1.05}
check("a run that DOES resolve is never clobbered by the prior",
      merge_prior(fresh, FULL) == 0 and fresh["games"][0]["hpUmp"]["name"] == "NEW")

# shPenF is 100% LIVE in production — a null-overwrite here disables a working factor with
# no symptom anywhere downstream
empty = clone(FULL)
empty["bullpen_last3"], empty["pen_quality"] = {}, {}
merge_prior(empty, FULL)
check("an empty bullpen_last3/pen_quality does not erase a populated one",
      len(empty["bullpen_last3"]) == 30 and len(empty["pen_quality"]) == 31)

part = clone(FULL)
for i, g in enumerate(part["games"]):
    if i % 2:
        g["hpUmp"] = None
check("a partially-resolving run fills only what it missed",
      merge_prior(part, FULL) == 7 and sum(1 for g in part["games"] if g["hpUmp"]) == 15)

nokey = clone(FULL)
nokey["league_k_per_game"] = None
merge_prior(nokey, FULL)
check("league_k_per_game survives a failed lookup", nokey["league_k_per_game"] == 16.72)

check("no prior file at all is not an error", merge_prior(clone(FULL), {}) == 0)

print(f"\n{6 + 1 - len(fails)}/7 passed")
sys.exit(1 if fails else 0)
