import { NextRequest, NextResponse } from "next/server";
import type { DayBlob } from "@/lib/pred-serialize";
import { applyWeeklyAdjustment, computeCalibration, type GradedPick, type WeightState } from "@/engine2/calibration";
import { gradePrediction, pnorm, starterInfo, type Boxscore, type GameStatus } from "@/engine2/grade";
import { redis, redisGetJson, redisSetJson, storeEnv, syncAuthed } from "@/lib/server/store";
import { marketOf } from "@/lib/ledger-segments";

/* the slice of a synced ledger day the training loop reads */
type LedgerDay = {
  date: string;
  locked?: boolean;
  core?: { legs?: { label?: string; prop?: string; lkey?: string | null; est?: unknown }[] }[];
  funT?: { legs?: { label?: string; prop?: string; lkey?: string | null; est?: unknown }[] }[];
  grading?: { legs?: Record<string, { result?: string }> } | null;
};

/**
 * Calibration spec 3B/3C/3D (settle-side) — runs nightly via Vercel cron and
 * on demand. Grades every logged prediction from official box scores (same
 * Caesars void rules as the ledger's grader), reconciles projected lineups
 * (Update 2), recomputes the calibration summary, and — at most weekly, only
 * with statistical significance at n>=150, capped ±10%, shrink-only — adjusts
 * per-market model blend weights. Idempotent: graded records never change.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS_SET = "pl:pred:days";
const dayKey = (d: string) => `pl:pred:${d}`;
const K_SUMMARY = "pl:cal:summary";
const K_WEIGHTS = "pl:cal:weights";
const K_AUTO = "pl:cal:auto";
const K_LASTRUN = "pl:cal:lastRun";

const GRADE_DAYS = 6; // grade the most recent N days per run
const SUMMARY_DAYS = 45; // rolling window feeding the calibration summary
const MAX_BOX_FETCHES = 14;

function authed(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  if (cron && req.headers.get("authorization") === `Bearer ${cron}`) return true;
  if (syncAuthed(req)) return true;
  // No CRON_SECRET configured: the run is idempotent, writes only derived
  // aggregates, and is rate-limited below — allow so the cron works with
  // zero extra setup. Adding CRON_SECRET in Vercel tightens this any time.
  return !cron;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type SchedGame = {
  gamePk: number;
  status?: { detailedState?: string };
  teams?: { away?: { score?: number }; home?: { score?: number } };
};

async function dayStatuses(date: string): Promise<Map<number, GameStatus>> {
  const j = await fetchJson<{ dates?: { games?: SchedGame[] }[] }>(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`,
  );
  const out = new Map<number, GameStatus>();
  for (const g of j?.dates?.[0]?.games ?? []) {
    out.set(g.gamePk, {
      state: g.status?.detailedState ?? "",
      away: g.teams?.away?.score ?? null,
      home: g.teams?.home?.score ?? null,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  try {
    const now = Date.now();
    const lastRun = Number(await redis(["GET", K_LASTRUN])) || 0;
    const force = req.nextUrl.searchParams.get("force") === "1" && syncAuthed(req);
    if (!force && now - lastRun < 10 * 60_000) {
      return NextResponse.json({ ok: true, skipped: "ran recently" });
    }
    await redis(["SET", K_LASTRUN, String(now)]);

    const allDays = (((await redis(["SMEMBERS", DAYS_SET])) as string[] | null) ?? []).sort();
    const today = new Date().toISOString().slice(0, 10);
    let boxFetches = 0;
    let newlyGraded = 0;

    for (const date of allDays.slice(-GRADE_DAYS)) {
      const blob = await redisGetJson<DayBlob>(dayKey(date));
      if (!blob) continue;
      const pending = Object.values(blob.records).filter((r) => !r.res || r.res === "pending");
      if (!pending.length && date < today) continue;
      if (!pending.length) continue;

      const statuses = await dayStatuses(date);
      const boxes = new Map<number, Boxscore>();
      const pkOf = (gkey: string | null) => (gkey ? blob.games[gkey]?.pk ?? null : null);
      const startedLongAgo = (gkey: string | null) => {
        const s = gkey ? blob.games[gkey]?.start : null;
        return !!s && Date.now() - new Date(s).getTime() > 2.5 * 3600_000;
      };

      // which games need a boxscore (prop grading / lineup reconciliation)
      const needBox = new Set<number>();
      for (const r of pending) {
        const pk = pkOf(r.gkey);
        if (!pk || !startedLongAgo(r.gkey)) continue;
        const st = statuses.get(pk);
        if (st && /final|game over|completed/i.test(st.state)) needBox.add(pk);
      }
      for (const pk of needBox) {
        if (boxFetches >= MAX_BOX_FETCHES) break;
        const bx = await fetchJson<Boxscore>(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`);
        if (bx) boxes.set(pk, bx);
        boxFetches++;
      }

      let changed = false;
      for (const r of Object.values(blob.records)) {
        if (r.res && r.res !== "pending") continue;
        const pk = pkOf(r.gkey);
        if (!pk || !startedLongAgo(r.gkey)) continue;
        const st = statuses.get(pk) ?? null;
        const bx = boxes.get(pk) ?? null;
        const g = gradePrediction(r.lkey ?? "", r.sub, st, bx);
        if (g.result === "pending") continue;
        r.res = g.result;
        r.detail = g.detail;
        r.gradedAt = now;
        // Update 2: lineup reconciliation for projected picks (batters)
        if (r.lu === "projected" && bx && r.lkey && r.lkey.includes("|batter_")) {
          const info = starterInfo(bx, pnorm(r.label.replace(/\s*\([A-Z]{2,3}\)$/, "")));
          r.luRes = info.started;
          r.boAct = info.order;
        }
        changed = true;
        newlyGraded++;
      }
      for (const t of Object.values(blob.parlays)) {
        if (t.res && t.res !== "pending") continue;
        const legRes = t.legs.map((l) => {
          const pk = pkOf(l.gkey);
          if (!pk || !startedLongAgo(l.gkey)) return { result: "pending" as const };
          return gradePrediction(l.lkey ?? "", l.prop, statuses.get(pk) ?? null, boxes.get(pk) ?? null);
        });
        if (legRes.some((x) => x.result === "pending")) continue;
        if (legRes.some((x) => x.result === "ungradable")) {
          t.res = "ungradable";
        } else if (legRes.some((x) => x.result === "lost")) {
          t.res = "lost";
        } else {
          const liveLegs = legRes.filter((x) => x.result === "won").length;
          t.res = liveLegs > 0 ? "won" : "void"; // voids/pushes divide out
        }
        t.gradedAt = now;
        changed = true;
      }
      if (changed) await redisSetJson(dayKey(date), blob);
    }

    // 3C: rolling summary over the graded window (pMkt rides along so the summary
    // can score the model against the consensus-only baseline — upgrade 03)
    const graded: GradedPick[] = [];
    for (const date of allDays.slice(-SUMMARY_DAYS)) {
      const blob = await redisGetJson<DayBlob>(dayKey(date));
      if (!blob) continue;
      for (const r of Object.values(blob.records)) {
        if (r.res === "won" || r.res === "lost") {
          graded.push({ market: r.market, p: r.p, edge: r.edge, lu: r.lu, res: r.res, pMkt: r.pMkt ?? null });
        }
      }
    }
    // upgrade 03: the cloud ledger's graded legs join the training set for any date the
    // prediction store never logged (the pre-logging history) — never double-counted:
    // dates the store covers are skipped outright.
    try {
      const cut = new Date(Date.now() - SUMMARY_DAYS * 86_400_000).toISOString().slice(0, 10);
      const dayset = new Set(allDays);
      const rawLedger = (await redis(["GET", "pl:ledger:v1"])) as string | null;
      const ledger: LedgerDay[] = rawLedger ? ((JSON.parse(rawLedger) as { ledger?: LedgerDay[] }).ledger ?? []) : [];
      for (const e of ledger) {
        if (!e.locked || e.date < cut || dayset.has(e.date)) continue;
        const gLegs = e.grading?.legs ?? {};
        const seen = new Set<string>();
        for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
          for (const l of t.legs ?? []) {
            if (!l.lkey || l.est == null || !l.label || !l.prop) continue;
            const lid = `${l.label}|${l.prop}`;
            if (seen.has(lid)) continue;
            seen.add(lid);
            const res = gLegs[lid]?.result;
            if (res !== "won" && res !== "lost") continue;
            graded.push({ market: marketOf(l.lkey), p: Number(l.est), edge: null, lu: "confirmed", res, pMkt: null });
          }
        }
      }
    } catch {
      /* ledger unreadable — the prediction store still feeds the summary */
    }
    const summary = computeCalibration(graded);
    await redisSetJson(K_SUMMARY, summary);

    // 3D: weekly, capped, shrink-only, significance-gated
    const auto = ((await redis(["GET", K_AUTO])) as string | null) ?? "on";
    let weights = (await redisGetJson<WeightState>(K_WEIGHTS)) ?? { mults: {}, lastAdjust: 0, log: [] };
    if (auto !== "off") {
      const next = applyWeeklyAdjustment(summary, weights, now);
      if (next !== weights) {
        weights = next;
        await redisSetJson(K_WEIGHTS, weights);
      }
    }

    return NextResponse.json({
      ok: true,
      newlyGraded,
      gradedTotal: graded.length,
      markets: summary.markets.length,
      quarantine: summary.quarantine,
      adjustments: weights.log.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
