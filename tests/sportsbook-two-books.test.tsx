import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

(globalThis as { React?: typeof React }).React = React;
vi.mock("next/navigation", () => ({ usePathname: () => "/games" }));

import { SportsbookSelector } from "@/components/sportsbook/SportsbookSelector";
import { getSportsbook } from "@/lib/sportsbook/store";

/** THE PICKER OFFERS THE TWO ARIZONA BOOKS ONLY (2026-11-14): the live site still listed seven. */
describe("the sportsbook picker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists DraftKings and FanDuel, in that order, and nothing else", () => {
    const html = renderToStaticMarkup(React.createElement(SportsbookSelector));
    const options = [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options).toEqual([["draftkings", "DraftKings"], ["fanduel", "FanDuel"]]);
    expect(html).not.toMatch(/Caesars|BetMGM|BetRivers|Fanatics|Pinnacle/);
  });

  it("a device that stored another book reads as DraftKings; a stored FanDuel is kept", async () => {
    const read = async (stored: string | null) => {
      vi.resetModules();
      vi.stubGlobal("localStorage", { getItem: () => stored, setItem: () => {} });
      return (await import("@/lib/sportsbook/store")).getSportsbook();
    };
    for (const other of ["williamhill_us", "betmgm", "betrivers", "fanatics", "pinnacle", "nonsense", "", null]) expect(await read(other), String(other)).toBe("draftkings");
    expect(await read("fanduel")).toBe("fanduel");
    expect(await read("draftkings")).toBe("draftkings");
    expect(typeof getSportsbook).toBe("function");
  });

  it("source: the picker and the stored choice both pass through the two-book check", () => {
    expect(readFileSync("src/components/sportsbook/SportsbookSelector.tsx", "utf8")).toContain("{BOOKS.filter(b=>isAzBook(b.key)).map(b=><option");
    expect(readFileSync("src/lib/sportsbook/store.ts", "utf8")).toContain("return BOOKS.find(b=>b.key===v&&isAzBook(b.key))?.key??DEFAULT_BOOK;");
  });
});
