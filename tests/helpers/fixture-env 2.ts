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
