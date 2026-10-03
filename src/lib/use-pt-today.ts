"use client";

import { useEffect, useState } from "react";

/** today's date in Pacific time (YYYY-MM-DD) — the calendar every paper day is keyed on */
export function ptTodayOf(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(now));
}

/**
 * Today (Pacific) on the client only — undefined during the server/static render and the first client
 * render, so prerendered pages never bake in the build day and hydration always matches
 * (FOUND MODE, 2026-10-03: the banner and the Builder's lock row switch on the found rule once mounted).
 */
export function usePtToday(): string | undefined {
  const [day, setDay] = useState<string | undefined>(undefined);
  useEffect(() => {
    setDay(ptTodayOf());
  }, []);
  return day;
}
