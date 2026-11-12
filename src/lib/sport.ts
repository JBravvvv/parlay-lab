"use client";

import { useSyncExternalStore } from "react";
import { pacificDate, relevantSport } from "./relevant-sport";
import { currentSession, readSession, writeSession } from "./use-session-state";

/**
 * THE SPORT SWITCH (INSTRUCTION 38, 2026-09-05): one app-wide selector — MLB or College
 * Football — that every desk page reads. "EVERYTHING for College Football (CFB) should be
 * SEPARATE": flipping the switch swaps the Board, Builder, Parlay Builder, Ledger, The Sharp,
 * Games and Stats to the CFB desk, which has its own model, tickets, ledger, bank and
 * allotment. The MLB desk is untouched underneath.
 *
 * Persisted per device under `pl_sport`. Read through useSyncExternalStore with an "mlb"
 * server snapshot so the first client render matches SSR (the hydration rule).
 *
 * THE THIRD DESK (2026-09-08, Josh: "NFL needs to be built NOW"): "nfl" joins the switch as its
 * own pill, its own ledger / bank / keys (src/lib/nfl/rules.ts) and its own accent colour; the
 * football surfaces are shared with CFB through a LeagueContext, never the constants.
 *
 * THE FOURTH DESK AND THE ARCHIVE (2026-11-12, Josh: "since mlb is done, archive MLB. Add NCAAB to
 * the site"): "ncaab" is the College Basketball desk (src/lib/ncaab, src/components/ncaab). A desk
 * named in ARCHIVED_SPORTS is off the switch and is never the desk the app opens on; its pages,
 * routes, store keys and ledger are untouched and still open through `openArchive`. Emptying that
 * list brings the desk back: nothing was deleted to archive it.
 */
export type Sport = "mlb" | "cfb" | "nfl" | "ncaab";

export const SPORT_KEY = "pl_sport";
export const SPORT_EVENT = "pl:sport";

export const SPORT_META: Record<Sport, { label: string; short: string; emoji: string; eyebrow: string; feed: string }> = {
  mlb: { label: "MLB", short: "MLB", emoji: "⚾", eyebrow: "Major League Baseball", feed: "official MLB box scores" },
  cfb: { label: "College Football", short: "CFB", emoji: "🏈", eyebrow: "College Football · FBS", feed: "ESPN final scores" },
  nfl: { label: "NFL", short: "NFL", emoji: "🏈", eyebrow: "National Football League", feed: "ESPN final scores" },
  ncaab: { label: "College Basketball", short: "CBB", emoji: "🏀", eyebrow: "College Basketball · D-I", feed: "ESPN final scores" },
};

/** desk order on the switch — NFL first (Josh, 2026-09-18: "Re-order the sports from MLB/CFB/NFL to NFL/CFB/MLB") */
export const SPORTS: readonly Sport[] = ["nfl", "cfb", "mlb"] as const;

/** Desks put aside for now. Reversible: remove a desk from this list and it is back on the switch. */
export const ARCHIVED_SPORTS: readonly Sport[] = ["mlb"];

export function isArchived(s: Sport): boolean {
  return ARCHIVED_SPORTS.includes(s);
}

/** The desk the app lands on when it would have landed on an archived one (MLB's weekday slot). */
export const ARCHIVE_FALLBACK: Sport = "ncaab";

/* The desks on the switch, in order. The switch is measured for three label-only pills (see
   SportSwitch.tsx): a fourth does not fit the 375px header or the 168px rail, so a desk that
   comes back out of the archive has to trade places with one that goes in. */
export const ACTIVE_SPORTS: readonly Sport[] = (["nfl", "cfb", "mlb", "ncaab"] as const).filter((s) => !isArchived(s));

export function isSport(x: unknown): x is Sport {
  return x === "mlb" || x === "cfb" || x === "nfl" || x === "ncaab";
}

/** this session asked to look at an archived desk's stored record */
function archiveOpen(): boolean {
  try {
    return currentSession() ? readSession<unknown>("archive-open", () => false) === true : false;
  } catch {
    return false;
  }
}

/** An archived desk stands only while its archive was opened on purpose; otherwise the fallback desk. */
export function deskOf(s: Sport, open: boolean = archiveOpen()): Sport {
  return isArchived(s) && !open ? ARCHIVE_FALLBACK : s;
}

export function getSport(): Sport {
  try {
    const v = currentSession() ? readSession<unknown>("sport", () => null) : null;
    return deskOf(isSport(v) ? v : relevantSport(pacificDate()));
  } catch {
    return deskOf(relevantSport(pacificDate()), false);
  }
}

export function setSport(asked: Sport, manual = true) {
  const s = deskOf(asked);
  if (!isArchived(s)) writeSession("archive-open", false, false);
  writeSession("sport", s, false);
  if (manual) writeSession("sport-manual", true, false);
  try {
    localStorage.setItem(SPORT_KEY, s);
  } catch {
    /* private mode — the switch still applies for this page life */
  }
  cached = s;
  window.dispatchEvent(new CustomEvent(SPORT_EVENT));
}

/** Open an archived desk's stored record on this device, until another desk is picked. */
export function openArchive(s: Sport) {
  writeSession("archive-open", true, false);
  setSport(s);
}

let cached: Sport | null = null;
function snapshot(): Sport {
  if (cached == null) cached = getSport();
  return cached;
}
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SPORT_KEY) {
      cached = getSport();
      cb();
    }
  };
  window.addEventListener(SPORT_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SPORT_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The selected sport; "mlb" on the server and during hydration. */
export function useSport(): Sport {
  return useSyncExternalStore(subscribe, snapshot, () => "mlb");
}
