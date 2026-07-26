/**
 * Test double for the engine's network layer — a straight port of the routing
 * in tests/legacy-harness/baseline40_env.js. Frozen clock: 2026-07-09 23:30 ET
 * (the moment the fix39/fix40 fixtures were captured), "today" = 2026-07-10.
 */
import fs from "node:fs";
import path from "node:path";
import { createEngine, type Engine } from "@/engine";

const FIX = path.join(__dirname, "..", "fixtures");
export const FROZEN_NOW = Date.parse("2026-07-10T03:30:00Z");
export const TODAY = "2026-07-10";

function route(url: string): string | null {
  if (url.includes("/schedule")) {
    const dm = url.match(/date=([0-9-]+)/);
    if (dm && dm[1] === "2026-07-09") return "fix40/sched_0709.json";
    return "fix39/schedule_tom_lu.json";
  }
  if (url.includes("/boxscore")) {
    const bm = url.match(/game\/(\d+)\/boxscore/);
    return bm ? `fix40/box_${bm[1]}.json` : null;
  }
  const m = url.match(/\/events\/([a-f0-9]+)\/odds/);
  if (m) {
    // one event carries a synthetic Caesars alternate-ladder (parser test double)
    if (m[1] === "250b0373676b10f51ed1c59c93714245") return `fix40/props_alt_${m[1]}.json`;
    return `fix39/props_${m[1]}.json`;
  }
  if (url.includes("/events?")) return "fix39/events.json";
  if (url.includes("the-odds-api") && url.includes("markets=h2h")) return "fix39/odds.json";
  if (url.includes("stats=season") && url.includes("group=pitching")) return "fix39/pitseason.json";
  if (url.includes("byDateRange")) {
    const s = url.match(/startDate=([0-9-]+)/);
    if (!s) return null;
    return `fix39/${url.includes("group=pitching") ? "pit_" : "hit_"}${s[1]}.json`;
  }
  if (url.includes("/people?personIds=")) {
    const b = url.match(/opposingPlayerId=(\d+)/);
    return b ? `fix39/bvp_${b[1]}.json` : null;
  }
  return null;
}

export function fixtureFetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  const f = route(url);
  let body: unknown = null;
  if (f) {
    try {
      body = JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
    } catch {
      body = null;
    }
  }
  return Promise.resolve({ ok: body != null, body: body ?? {} });
}

export function fixtureEngine(): Engine {
  return createEngine({ fetchJson: fixtureFetchJson, today: TODAY });
}

/**
 * ARMED fixture engine (2026-07-26) — arms the v2 kernel exactly as production's
 * `armV2()` does, so the seven identity factors are actually exercised.
 *
 * `fixtureEngine()` leaves `SH_V2`/`SH_PRIORS`/`SH_CTX` at their `legacy/index.html`
 * L1547 defaults of `null`, which is why `baseline43.json` is a v2-DORMANT board and
 * cannot see any v2-gated change (see docs/collection-period.md, "What the parity digest
 * actually covers"). This is the counterpart used by `baseline-armed-v1`.
 *
 * `tests/fixtures/fix45/context.json` is a SYNTHETIC COMPOSITION of real values: the
 * weather/probables/bullpen/pen_quality blocks come verbatim from a real committed
 * `context.json`, remapped onto the fixture slate's teams, with `hpUmp.g` spanning
 * 3/5/9/40 and `pen_quality.ip` alternating 9.0/40.0 so both sides of the `g >= 5` and
 * `ip >= 15` guards are covered. It is test data and is labelled as such — no market
 * price is synthesised anywhere in it.
 *
 * `pinned` defaults to true = today's production state (`umpKFrozen`/`penQFrozen` on),
 * which is what a regression baseline should hold.
 */
export function armedFixtureEngine(opts: { pinned?: boolean } = {}): Engine {
  const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY });
  eng.set("SH_PRIORS", JSON.parse(fs.readFileSync(path.join(FIX, "..", "..", "public", "model", "priors.json"), "utf8")));
  eng.set("SH_CTX", JSON.parse(fs.readFileSync(path.join(FIX, "fix45", "context.json"), "utf8")));
  // mirrors armV2() in src/lib/engine-client.ts
  eng.set("SH_V2", {
    shin: true, sharpW: true, sim: true, projLineup: true,
    priors: true, ctx: true, regions: "us,eu",
    simN: SIM_PATHS_FIXTURE, simNHR: SIM_PATHS_FIXTURE,
  });
  if (opts.pinned === false) {
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    eng.set("SH_CFG", { ...cfg, umpKFrozen: false, penQFrozen: false });
  }
  return eng;
}

/* Pinned low for baseline runtime. The production value is SIM_PATHS (50,000) — the
   inequality is deliberate and documented; what matters for a baseline is that the
   number is FIXED, since sim depth changes every probability. */
export const SIM_PATHS_FIXTURE = 2000;

/** Fixed inputs for the card path, so the baseline never depends on `SH` UI state. */
export const ARMED_DAILY = 250;
export const ARMED_FUN = 5;

/**
 * ARMED DIGEST — deliberately WIDER than `digest()`.
 *
 * `digest()` keeps only `[label, sub, odds, prob, ev]` per row, and covers nothing the
 * allocator does. Phases 3 (shAllocate), 4 (buildParlaySet/shCardPool) and 5 (row shape)
 * all land outside it, which is why their "parity digest unchanged" acceptance criterion
 * was void. This one carries the row fields selection actually reads, plus the whole card
 * path including the BLOCKED LIST WITH REASONS — the surface a gate change moves.
 */
export function armedDigest(d: Record<string, unknown>, eng: Engine) {
  type Row = Record<string, unknown>;
  const rows = (C: Record<string, Row[]> = {} as never) => {
    const o: Record<string, unknown[]> = {};
    Object.keys(C)
      .sort()
      .forEach((k) => {
        o[k] = (C[k] || []).map((r) => [
          r.label, r.sub, String(r.odds), r.prob, r.ev, r.implied, r.edge,
          r.cz, r.czEv, r.bs, r.bsEv, r.kellyF, r.lu, r.susp ?? null,
          Array.isArray(r.tags) ? (r.tags as string[]).join(",") : null,
        ]);
      });
    return o;
  };
  const tix = (set: Record<string, unknown>[] = []) =>
    (set || []).map((p) => ({
      n: p.name, o: p.odds, p: p.prob, cz: p.czOdds, czEv: p.czEv,
      bsEv: p.bsEv, consEv: p.consEv, consCzEv: p.consCzEv,
      legs: (p.legs as Record<string, unknown>[]).map((l) => `${l.label}|${l.prop}|${l.odds}|${l.lkey}`),
    }));

  const pool = eng.get<(b: unknown) => { pl: Record<string, unknown> }[]>("shCardPool")(d);
  const cfg = eng.get<Record<string, unknown>>("SH_CFG");
  const tid = eng.get<(pl: unknown) => string>("shTicketId");
  const alloc = eng.get<(p: unknown, a: number, c: unknown, f: boolean) => Record<string, unknown>>(
    "shAllocate",
  )(pool, ARMED_DAILY, cfg, false);
  const ids: Record<string, number> = {};
  (alloc.picks as { id: string }[]).forEach((p) => (ids[p.id] = 1));
  const fun = eng.get<(p: unknown, a: number, c: unknown, i: unknown, l: unknown) => Record<string, unknown>>(
    "shFunPick",
  )(pool, ARMED_FUN, cfg, ids, alloc.legs);

  return {
    categories: rows(d.categories as never),
    categoriesLive: rows(d.categoriesLive as never),
    parlays: tix(d.parlays as never),
    parlaysMixed: tix(d.parlaysMixed as never),
    parlaysLive: tix(d.parlaysLive as never),
    // ---- the card path, which digest() never saw ----
    pool: pool.map((w) => tid(w.pl)).sort(),
    alloc: {
      sum: alloc.sum, ev: alloc.ev, noPlay: alloc.noPlay ?? false, overrode: alloc.overrode ?? false,
      unallocated: alloc.unallocated ?? null,
      picks: (alloc.picks as Record<string, unknown>[]).map((p) => [p.id, p.amt ?? p.amount]),
      blocked: (alloc.blocked as Record<string, unknown>[] | undefined ?? [])
        .map((b) => `${b.name}|${b.reason}`)
        .sort(),
    },
    fun: {
      sum: fun.sum,
      picks: (fun.picks as Record<string, unknown>[]).map((p) => [p.id, p.amt ?? p.amount]),
    },
  };
}

/** The exact digest from tests/legacy-harness/baseline40.js. */
export function digest(d: Record<string, unknown>) {
  type Row = { label: string; sub: string; odds: unknown; prob: unknown; ev: unknown };
  type Tik = { name: string; odds: unknown; prob: unknown; legs: { label: string; prop: string; odds: unknown }[] };
  const cats = (C: Record<string, Row[]> = {} as never) => {
    const o: Record<string, unknown[]> = {};
    Object.keys(C)
      .sort()
      .forEach((k) => {
        o[k] = (C[k] || []).map((r) => [r.label, r.sub, String(r.odds), r.prob, r.ev]);
      });
    return o;
  };
  const tix = (set: Tik[] = []) =>
    (set || []).map((p) => ({
      n: p.name,
      o: p.odds,
      p: p.prob,
      legs: p.legs.map((l) => `${l.label}|${l.prop}|${l.odds}`),
    }));
  return {
    categories: cats(d.categories as never),
    categoriesLive: cats(d.categoriesLive as never),
    parlays: tix(d.parlays as never),
    parlaysMixed: tix(d.parlaysMixed as never),
    parlaysLive: tix(d.parlaysLive as never),
  };
}

export function readBaseline(name: string): string {
  const raw = fs.readFileSync(path.join(FIX, name), "utf8");
  return raw.slice(raw.indexOf("\t") + 1).trim();
}
