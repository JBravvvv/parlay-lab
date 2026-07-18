import { NextRequest, NextResponse } from "next/server";
import { calibrationLine, type CalibrationSummary, type WeightState } from "@/engine2/calibration";
import { redis, redisGetJson, storeEnv, syncAuthed } from "@/lib/server/store";

/**
 * Read side of the calibration module (3C/3E) + the kill switch (3D).
 * GET is open: it serves only aggregate statistics computed from graded
 * public box scores — nothing personal, nothing fabricatable. POST (the
 * auto_calibration toggle) requires the sync phrase.
 *
 * When auto_calibration is OFF the response's mults are empty (the engine
 * blends at its shipped defaults) but flags and reporting still flow —
 * the spec's "flagging/reporting runs regardless".
 */

export const dynamic = "force-dynamic";

export async function GET() {
  if (!storeEnv()) return NextResponse.json({ summary: null, line: null, mults: {}, quarantine: [], auto: "on", log: [] });
  try {
    const summary = await redisGetJson<CalibrationSummary>("pl:cal:summary");
    const weights = (await redisGetJson<WeightState>("pl:cal:weights")) ?? { mults: {}, lastAdjust: 0, log: [] };
    const auto = (((await redis(["GET", "pl:cal:auto"])) as string | null) ?? "on") as "on" | "off";
    return NextResponse.json({
      summary,
      line: calibrationLine(summary),
      mults: auto === "off" ? {} : weights.mults,
      quarantine: summary?.quarantine ?? [],
      auto,
      log: weights.log.slice(-20),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!storeEnv()) return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  if (!syncAuthed(req)) return NextResponse.json({ error: "bad-sync-key" }, { status: 401 });
  let body: { auto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (body.auto !== "on" && body.auto !== "off") return NextResponse.json({ error: "auto must be on|off" }, { status: 400 });
  try {
    await redis(["SET", "pl:cal:auto", body.auto]);
    return NextResponse.json({ ok: true, auto: body.auto });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
