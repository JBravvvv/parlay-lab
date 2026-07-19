import { NextRequest, NextResponse } from "next/server";
import { createEngine, type BoardData } from "@/engine";
import { boardToPredictions, mergeDayBlob, type DayBlob } from "@/lib/pred-serialize";
import type { WeightState } from "@/engine2/calibration";
import { redis, redisGetJson, redisSetJson, storeEnv, syncAuthed } from "@/lib/server/store";

/**
 * Vercel-side daily board generation (calibration 3A, self-driving): the SAME
 * sandboxed engine the app runs in the browser executes here on a morning
 * cron, so every slate's full board is logged and graded even on days the
 * app is never opened. Josh's on-device generates still upsert on top (the
 * last pre-start statement per pick wins; the merge rules in pred-serialize
 * freeze anything graded or already past first pitch).
 *
 * Costs real Odds API credits per run, so the gate is strict: the sync
 * phrase always works; otherwise only Vercel's cron user-agent inside the
 * pre-slate window, with a 45-minute rate cap.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const K_LASTGEN = "pl:gen:lastRun";
const DAYS_SET = "pl:pred:days";
const dayKey = (d: string) => `pl:pred:${d}`;
const MAX_BYTES = 3_000_000;

function selfBase(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return prod ? `https://${prod}` : "https://parlay-lab-six.vercel.app";
}

/** The engine's network layer on the server: odds direct with the server key. */
async function serverFetchJson(url: string): Promise<{ ok: boolean; body: unknown }> {
  try {
    let target = url;
    try {
      const u = new URL(url);
      if (u.hostname === "api.the-odds-api.com") {
        const key = process.env.ODDS_API_KEY;
        if (!key) return { ok: false, body: {} };
        u.searchParams.set("apiKey", key);
        target = u.toString();
      }
    } catch {
      /* relative URL — fetch as-is */
    }
    const r = await fetch(target, { cache: "no-store" });
    const body = await r.json().catch(() => null);
    return { ok: r.ok && body != null, body: body ?? {} };
  } catch {
    return { ok: false, body: {} };
  }
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

export async function GET(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  const manual = syncAuthed(req);
  if (!manual) {
    const ua = req.headers.get("user-agent") ?? "";
    const hour = new Date().getUTCHours();
    if (!ua.startsWith("vercel-cron") || hour < 12 || hour >= 21) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!process.env.ODDS_API_KEY) return NextResponse.json({ error: "no ODDS_API_KEY" }, { status: 503 });

  try {
    const now = Date.now();
    const lastRun = Number(await redis(["GET", K_LASTGEN])) || 0;
    const force = manual && req.nextUrl.searchParams.get("force") === "1";
    if (!force && now - lastRun < 45 * 60_000) {
      return NextResponse.json({ ok: true, skipped: "ran recently" });
    }
    await redis(["SET", K_LASTGEN, String(now)]);

    // arm the same v2 stack the app arms (armV2 in engine-client)
    const base = selfBase();
    const grab = (u: string) =>
      fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [priors, ctx, weights, auto] = await Promise.all([
      grab(`${base}/model/priors.json`),
      grab(`${base}/model/context.json`),
      redisGetJson<WeightState>("pl:cal:weights"),
      redis(["GET", "pl:cal:auto"]).catch(() => null),
    ]);

    const eng = createEngine({ fetchJson: serverFetchJson, storage: memoryStorage() });
    eng.set("SH_PRIORS", priors);
    eng.set("SH_CTX", ctx);
    eng.set("SH_V2", {
      priors: !!priors,
      ctx: !!ctx,
      shin: true,
      sharpW: true,
      regions: "us,eu",
      sim: true,
      simN: 10000,
      simNHR: 20000,
      projLineup: true,
      calW: auto === "off" ? null : weights?.mults ?? null,
    });

    const slate = await eng.collectSlate();
    const data = eng.analyze(slate) as BoardData;
    const date = eng.get<() => string>("shToday")();
    const { records, parlays, games } = boardToPredictions(data);
    if (!records.length) {
      return NextResponse.json({ ok: true, date, logged: 0, note: "no pregame picks (off day or slate underway)" });
    }

    const cur = await redisGetJson<DayBlob>(dayKey(date));
    const { blob, written } = mergeDayBlob(cur, date, records, parlays, games, now);
    if (JSON.stringify(blob).length > MAX_BYTES) {
      return NextResponse.json({ error: "day blob too large" }, { status: 413 });
    }
    await redisSetJson(dayKey(date), blob);
    await redis(["SADD", DAYS_SET, date]);

    return NextResponse.json({
      ok: true,
      date,
      priced: records.length,
      parlays: parlays.length,
      written,
      total: Object.keys(blob.records).length,
      overview: String(data.overview ?? "").slice(0, 160),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
