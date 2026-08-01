#!/usr/bin/env node
/**
 * DOES A SAME-TEAM HR PAIR HAPPEN LESS OFTEN THAN INDEPENDENCE? (2026-08-01, owner's item 1.)
 * ZERO ODDS CREDITS — statsapi is free and keyless. This is the measurement the proposed
 * "no two players from the same team on a HR parlay" rule rests on, taken BEFORE any design.
 *
 *   node tools/hr-pair-dependence.mjs <startDate> <endDate> [--pairsC N]
 *
 * THE QUANTITY. For a pair of hitters (i, j), independence predicts P(both homer) = p_i * p_j,
 * where p is P(at least one HR in a game started). The RATIO observed / independent is the whole
 * finding: **> 1 is positive dependence, < 1 is negative.** The owner's claim is that stratum (a)
 * sits below 1.
 *
 * THREE STRATA: (a) same team, same game · (b) opposing teams, same game · (c) different games,
 * same slate. (a) and (b) share park, weather and — for (a) — the opposing starter; (c) shares
 * nothing but the date. Those shared inputs are mechanisms that would push (a) and (b) ABOVE 1,
 * and they cut against the claim; the design must survive them being the explanation.
 *
 * RAW vs RATE-MATCHED, because pairing two high-rate hitters inflates the joint rate with no
 * dependence at all:
 *   RAW           — observed against (pooled mean rate)^2, i.e. every hitter treated alike.
 *   RATE-MATCHED  — observed against p_i * p_j, each player's OWN rate. This is the honest one;
 *                   the raw number is printed only so the confounder's size is visible.
 *
 * CONFIDENCE. Pairs inside one game are not independent observations, so the bootstrap resamples
 * GAMES (strata a, b) or DATES (stratum c), never pairs. 1,000 replicates, percentile interval.
 *
 * KNOWN LIMIT, stated rather than buried: p_i is estimated from the same sample the joints are
 * measured in. That biases the ratio slightly toward 1 (a player's own HR contributes to his own
 * rate), so it is CONSERVATIVE for a claim of dependence in either direction.
 */

const SLEEP = 40;
const CONC = 12;

const j = async (u) => {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 300 * (k + 1)));
  }
  return null;
};

/** deterministic PRNG so stratum (c)'s sample is reproducible */
let seed = 20260801;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

async function pool(items, fn, conc = CONC) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
        if (SLEEP) await new Promise((s) => setTimeout(s, SLEEP));
      }
    }),
  );
  return out;
}

/** Pure: ratio of observed joint events to the independence prediction. */
export function ratio(pairs) {
  const obs = pairs.reduce((n, p) => n + (p.both ? 1 : 0), 0);
  const exp = pairs.reduce((n, p) => n + p.pi * p.pj, 0);
  return { n: pairs.length, obs, exp, ratio: exp > 0 ? obs / exp : null };
}

/** Cluster bootstrap over the grouping key (game or date). Pure given `pairs`. */
export function boot(pairs, keyOf, reps = 1000) {
  const byKey = new Map();
  for (const p of pairs) {
    const k = keyOf(p);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(p);
  }
  const keys = [...byKey.keys()];
  if (keys.length < 2) return { lo: null, hi: null, clusters: keys.length };
  const rs = [];
  for (let r = 0; r < reps; r++) {
    let obs = 0, exp = 0;
    for (let c = 0; c < keys.length; c++) {
      for (const p of byKey.get(keys[Math.floor(rnd() * keys.length)])) {
        obs += p.both ? 1 : 0;
        exp += p.pi * p.pj;
      }
    }
    if (exp > 0) rs.push(obs / exp);
  }
  rs.sort((a, b) => a - b);
  return { lo: rs[Math.floor(0.025 * rs.length)], hi: rs[Math.floor(0.975 * rs.length)], clusters: keys.length };
}

const f = (x, d = 3) => (x == null ? "—" : x.toFixed(d));

if (import.meta.url === `file://${process.argv[1]}`) {
  const [start, end] = process.argv.slice(2);
  if (!start || !end) { console.error("usage: node tools/hr-pair-dependence.mjs <startDate> <endDate>"); process.exit(64); }
  const pairsC = Number(process.argv.includes("--pairsC") ? process.argv[process.argv.indexOf("--pairsC") + 1] : 400000);

  const sched = await j(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}`);
  const games = (sched?.dates ?? []).flatMap((d) => d.games.filter((g) => g.status?.abstractGameState === "Final").map((g) => ({ pk: g.gamePk, date: d.date })));
  console.error(`schedule: ${games.length} final games ${start}..${end} — fetching boxscores…`);

  const boxes = (await pool(games, async (g) => {
    const b = await j(`https://statsapi.mlb.com/api/v1/game/${g.pk}/boxscore`);
    if (!b?.teams) return null;
    const sides = [];
    for (const side of ["away", "home"]) {
      const t = b.teams[side];
      const players = Object.values(t?.players ?? {})
        .filter((p) => (p.stats?.batting?.plateAppearances ?? 0) > 0)
        .map((p) => ({ id: p.person.id, hr: (p.stats.batting.homeRuns ?? 0) > 0 ? 1 : 0, order: Number(p.battingOrder ?? 0) }));
      sides.push({ teamId: t?.team?.id, players });
    }
    return { ...g, sides };
  })).filter(Boolean);
  console.error(`boxscores: ${boxes.length}`);

  /* per-player rate: P(>=1 HR in a game with a PA) */
  const gp = new Map(), hr = new Map();
  for (const b of boxes) for (const s of b.sides) for (const p of s.players) {
    gp.set(p.id, (gp.get(p.id) ?? 0) + 1);
    hr.set(p.id, (hr.get(p.id) ?? 0) + p.hr);
  }
  const rate = (id) => (gp.get(id) ? hr.get(id) / gp.get(id) : 0);
  const pooled = [...gp.keys()].reduce((n, id) => n + hr.get(id), 0) / [...gp.values()].reduce((a, b) => a + b, 0);

  const A = [], B = [], C = [];
  for (const b of boxes) {
    for (const s of b.sides) {
      for (let x = 0; x < s.players.length; x++) for (let y = x + 1; y < s.players.length; y++) {
        const i = s.players[x], k = s.players[y];
        const adj = i.order && k.order ? Math.abs(Math.round(i.order / 100) - Math.round(k.order / 100)) : null;
        A.push({ key: b.pk, pi: rate(i.id), pj: rate(k.id), both: i.hr && k.hr, adj });
      }
    }
    for (const i of b.sides[0].players) for (const k of b.sides[1].players) {
      B.push({ key: b.pk, pi: rate(i.id), pj: rate(k.id), both: i.hr && k.hr });
    }
  }
  /* (c) different games, same slate — sampled, because the full cross product is enormous */
  const byDate = new Map();
  for (const b of boxes) { if (!byDate.has(b.date)) byDate.set(b.date, []); byDate.get(b.date).push(b); }
  for (const [date, gs] of byDate) {
    if (gs.length < 2) continue;
    const flat = gs.flatMap((g, gi) => g.sides.flatMap((s) => s.players.map((p) => ({ ...p, gi }))));
    const want = Math.min(pairsC / byDate.size, flat.length * 4);
    for (let t = 0; t < want; t++) {
      const i = flat[Math.floor(rnd() * flat.length)], k = flat[Math.floor(rnd() * flat.length)];
      if (i.gi === k.gi || i.id === k.id) continue;
      C.push({ key: date, pi: rate(i.id), pj: rate(k.id), both: i.hr && k.hr });
    }
  }

  const rows = [
    ["(a) same team, same game", A, (p) => p.key],
    ["(b) opposing teams, same game", B, (p) => p.key],
    ["(c) different games, same slate", C, (p) => p.key],
  ];

  console.log(`\nHR PAIR DEPENDENCE — ${boxes.length} games, ${byDate.size} dates, ${gp.size} hitters, ${start}..${end}`);
  console.log(`pooled P(>=1 HR per game-with-a-PA) = ${f(pooled, 4)}\n`);
  console.log("stratum                            pairs    joints    RATE-MATCHED ratio [95% CI]        RAW ratio");
  for (const [label, arr, keyOf] of rows) {
    if (!arr.length) { console.log(`${label.padEnd(34)} 0`); continue; }
    const r = ratio(arr);
    const ci = boot(arr, keyOf);
    const rawExp = arr.length * pooled * pooled;
    console.log(
      `${label.padEnd(34)} ${String(r.n).padStart(8)} ${String(r.obs).padStart(8)}    ` +
      `${f(r.ratio).padStart(6)}  [${f(ci.lo)}, ${f(ci.hi)}]  (${ci.clusters} clusters)   ${f(rawExp > 0 ? r.obs / rawExp : null).padStart(6)}`,
    );
  }

  console.log("\n(a) SPLIT BY LINEUP ADJACENCY — consecutive hitters face the same pitcher in the same inning more often");
  console.log("gap   pairs    joints   rate-matched ratio [95% CI]");
  for (const g of [1, 2, 3, 4]) {
    const sub = A.filter((p) => p.adj === g);
    if (!sub.length) continue;
    const r = ratio(sub), ci = boot(sub, (p) => p.key, 400);
    console.log(`${String(g).padEnd(6)}${String(r.n).padStart(7)}${String(r.obs).padStart(9)}   ${f(r.ratio).padStart(6)}  [${f(ci.lo)}, ${f(ci.hi)}]`);
  }
  const far = A.filter((p) => p.adj != null && p.adj >= 5);
  if (far.length) {
    const r = ratio(far), ci = boot(far, (p) => p.key, 400);
    console.log(`>=5   ${String(r.n).padStart(7)}${String(r.obs).padStart(9)}   ${f(r.ratio).padStart(6)}  [${f(ci.lo)}, ${f(ci.hi)}]`);
  }
}
