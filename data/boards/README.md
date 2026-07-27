# Board archive

One day's full engine board, pulled out of Redis before its 3-day TTL deletes it.

    YYYY-MM-DD.latest.json.gz   the freshest-priced generation — what a bet was placed from
    YYYY-MM-DD.best.json.gz     the generation that priced the most STILL-BETTABLE games —
                                what analysis wants
    index.json                  manifest: per date, both generation timestamps, the
                                generation index, raw/gz sizes, and whether the two agree

On a weekday with one generation the two files are byte-identical, which costs nothing —
git stores identical content as a single blob. On a Sunday they differ: the 17:00 UTC pass
covers ~15 games, the 22:30 pass reaches ~1.

## Why

`pl:board:{date}` is written `EX 259200`. Every board-level finding in this project — the
winner's-curse decomposition, the `pitcher_outs` audit, the H+R+RBI ladder test, the
range-compression detector, the sim-coverage table — was computed from a live board and was
unreproducible 72 hours later. The prediction store keeps rows, not boards, and does not
keep `propBoard`, the row `case` strings, or ticket `czEv`/`bsEv`/`consCzEv`. Phase 3's
>=20-board threshold was therefore unreachable: boards 2..20 expired before board 20 existed.

## Reading one

    python3 -c "import gzip,json;b=json.load(gzip.open('2026-07-26.best.json.gz'));print(b['data'].keys())"

Written by `tools/archive_boards.py` (source of truth on `frontend-rebuild`) from
`GET /api/board?date=&gen=`. Zero Odds credits — it reads what the cron already paid for —
and no secret: `/api/board` is deliberately ungated.
