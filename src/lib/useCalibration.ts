"use client";

import { useEffect, useState } from "react";
import type { CalibrationSummary, WeightState } from "@/engine2/calibration";

/**
 * Client read of the calibration module (3C/3E) — one fetch per mount with a
 * module cache so every surface (Sharp line, Stats panel, quarantine badges)
 * shares a single request. Fail-silent: no store, no data → nulls.
 */

export type CalibrationRead = {
  summary: CalibrationSummary | null;
  line: string | null;
  mults: Record<string, number>;
  quarantine: string[];
  auto: "on" | "off";
  log: WeightState["log"];
};

const EMPTY: CalibrationRead = { summary: null, line: null, mults: {}, quarantine: [], auto: "on", log: [] };

let cache: { at: number; data: CalibrationRead } | null = null;
const TTL = 10 * 60_000;

export async function fetchCalibration(): Promise<CalibrationRead> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const r = await fetch("/api/calibration", { cache: "no-store" });
    if (!r.ok) return EMPTY;
    const j = (await r.json()) as Partial<CalibrationRead>;
    const data: CalibrationRead = {
      summary: j.summary ?? null,
      line: j.line ?? null,
      mults: j.mults ?? {},
      quarantine: j.quarantine ?? [],
      auto: j.auto === "off" ? "off" : "on",
      log: j.log ?? [],
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return EMPTY;
  }
}

export function invalidateCalibration() {
  cache = null;
}

export function useCalibration(): CalibrationRead {
  const [data, setData] = useState<CalibrationRead>(cache?.data ?? EMPTY);
  useEffect(() => {
    let alive = true;
    void fetchCalibration().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
