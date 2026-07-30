import { readFileSync } from "node:fs";

/**
 * DEVICE-REACHABLE MODE CENSUS (2026-07-30, owner's item 1 — "a protection that fires
 * in one quarter of its domain and reports success").
 *
 * The suspension guards extracted only {CRON_SEL_MODE, getSelectionMode's default} =
 * {ev_gated}, so every "zero suspended legs" certification covered ONE of the four
 * selectable modes. This module extracts the WHOLE reachable domain from SOURCE (open
 * capture, never hardcoded), so a new mode joins the guards the day it is added:
 *
 *   - the `SelectionMode` union in src/lib/engine-client.ts — every mode the Settings
 *     page can persist to `pl_selmode` (~2 taps: Settings → mode);
 *   - CRON_SEL_MODE in the generate route — the server's pinned mode;
 *   - the override (force), reachable from the Builder's "Allocate anyway" control
 *     (1 tap, NO-PLAY days only) via `shSetOverride(true)`.
 *
 * DISCIPLINED vs LEGACY is the engine's own split (`shAllocate` L2998–3001,
 * `finalizeCats` L2513, `buildParlaySet`'s dscp gate): suspension bars are conditional
 * on selMode ∈ {ev_gated, dk_fd}. The legacy pair is unfiltered BY DESIGN (the parity
 * stance) — which the guards now measure and pin with counts rather than leave to the
 * old `undefined`-posture plant.
 */

export const DISCIPLINED = ["ev_gated", "dk_fd"] as const;

/** Every mode the device can select, extracted from the SelectionMode union. */
export function selectableModes(): string[] {
  const client = readFileSync("src/lib/engine-client.ts", "utf8");
  const m = /export type SelectionMode\s*=\s*([^;]+);/.exec(client);
  if (!m) throw new Error("SelectionMode union vanished from engine-client — re-point this extraction");
  const modes = [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  if (!modes.length) throw new Error("SelectionMode union parsed to nothing — re-point this extraction");
  return modes;
}

/** The server's pinned mode. */
export function cronMode(): string {
  const route = readFileSync("app/api/generate/route.ts", "utf8");
  const m = /CRON_SEL_MODE\s*=\s*"(\w+)"/.exec(route);
  if (!m) throw new Error("CRON_SEL_MODE vanished from the generate route — re-point this extraction");
  return m[1];
}

/** The app default when localStorage carries nothing. */
export function clientDefaultMode(): string {
  const client = readFileSync("src/lib/engine-client.ts", "utf8");
  const fn = client.slice(client.indexOf("function getSelectionMode"));
  const m = /return\s+"(\w+)"/.exec(fn);
  if (!m) throw new Error("getSelectionMode's default vanished — re-point this extraction");
  return m[1];
}

/** Is the allocator override (force) reachable from the shipped UI? */
export function overrideReachable(): boolean {
  const builder = readFileSync("app/builder/page.tsx", "utf8");
  return /shSetOverride"\)\(true\)/.test(builder);
}

/** The full domain a suspension guard must cover: every selectable mode + the pin. */
export function deviceReachableModes(): string[] {
  return [...new Set([...selectableModes(), cronMode(), clientDefaultMode()])];
}

export function isDisciplined(mode: string): boolean {
  return (DISCIPLINED as readonly string[]).includes(mode);
}
