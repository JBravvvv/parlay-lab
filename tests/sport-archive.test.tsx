import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { stripComments } from "./helpers/source";

/**
 * MLB ARCHIVED, COLLEGE BASKETBALL ON THE SWITCH (2026-11-12, Josh: "for now since mlb is done,
 * archive MLB. Add NCAAB to the site").
 *
 * What "archived" has to mean, each line a test below:
 *   - the desk is off the switch, and the app never opens on it by itself, on any day of the week
 *   - a device that was last on it comes back on the fallback desk
 *   - nothing of it is removed: its pages still mount, behind a banner, when its record is opened
 *   - it is one list: empty the list and the desk is back
 *
 * No DOM (node env): the store is driven through its own functions over a stubbed window, and the
 * gate is rendered with renderToStaticMarkup.
 */

(globalThis as { React?: typeof React }).React = React;

const state = vi.hoisted(() => ({ sport: "nfl", path: "/games" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/components/ncaab/NcaabDesk", () => ({ NcaabDesk: ({ view }: { view: string }) => <div data-fake-desk={view} /> }));
/* the real module, with the hook answering what the test set; `useRealSport` is the untouched hook */
vi.mock("@/lib/sport", async (orig) => {
  const real = await orig<typeof import("@/lib/sport")>();
  return { ...real, useSport: () => state.sport, useRealSport: real.useSport };
});

import { DeskGate } from "@/components/shell/DeskGate";
import { ArchiveBanner, ArchiveShelf } from "@/components/shell/ArchiveNotes";
import { startSession, writeSession, readSession } from "@/lib/use-session-state";
import { ACTIVE_SPORTS, ARCHIVED_SPORTS, ARCHIVE_FALLBACK, SPORTS, SPORT_META, deskOf, getSport, isArchived, isSport, openArchive, setSport, type Sport } from "@/lib/sport";
import { relevantSport } from "@/lib/relevant-sport";

const OWN = '<div data-own-page="1"></div>';
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};
const gate = (sport: string, p: string) => {
  state.sport = sport;
  state.path = p;
  return renderToStaticMarkup(
    <DeskGate>
      <div data-own-page="1" />
    </DeskGate>,
  );
};

afterEach(() => {
  vi.useRealTimers();
});

describe("the list of desks", () => {
  it("MLB is the one archived desk, and College Basketball is a desk", () => {
    expect(ARCHIVED_SPORTS).toEqual(["mlb"]);
    expect(isArchived("mlb")).toBe(true);
    for (const s of ["nfl", "cfb", "ncaab"] as const) expect(isArchived(s)).toBe(false);
    for (const s of ["mlb", "nfl", "cfb", "ncaab"]) expect(isSport(s)).toBe(true);
    for (const s of ["ncaaw", "nba", "", null, undefined, 3]) expect(isSport(s)).toBe(false);
    expect(SPORT_META.ncaab).toEqual({ label: "College Basketball", short: "CBB", emoji: "🏀", eyebrow: "College Basketball · D-I", feed: "ESPN final scores" });
  });

  it("the switch shows three desks, MLB not among them, each under a three-letter label", () => {
    expect(ACTIVE_SPORTS).toEqual(["nfl", "cfb", "ncaab"]);
    expect(ACTIVE_SPORTS.some(isArchived)).toBe(false);
    for (const s of ACTIVE_SPORTS) expect(SPORT_META[s].short).toHaveLength(3);
    /* nothing was removed to archive it: the full list and its copy are still there */
    expect(SPORTS).toEqual(["nfl", "cfb", "mlb"]);
    expect(SPORT_META.mlb.label).toBe("MLB");
    expect(isArchived(ARCHIVE_FALLBACK)).toBe(false);
    expect(ACTIVE_SPORTS).toContain(ARCHIVE_FALLBACK);
  });

  it("an archived desk stands only when its record was opened on purpose", () => {
    expect(deskOf("mlb", false)).toBe("ncaab");
    expect(deskOf("mlb", true)).toBe("mlb");
    for (const s of ["nfl", "cfb", "ncaab"] as const) {
      expect(deskOf(s, false)).toBe(s);
      expect(deskOf(s, true)).toBe(s);
    }
  });
});

describe("the desk the app opens on (no session yet)", () => {
  /* 2026-11-15 is a Sunday; noon Pacific each day */
  it.each([
    ["2026-11-15", "nfl"],
    ["2026-11-16", "nfl"],
    ["2026-11-17", "ncaab"],
    ["2026-11-18", "ncaab"],
    ["2026-11-19", "nfl"],
    ["2026-11-20", "cfb"],
    ["2026-11-21", "cfb"],
  ])("%s opens on %s", (date, want) => {
    at(`${date}T20:00:00Z`);
    expect(getSport()).toBe(want);
  });

  it("the days that used to open on MLB are exactly the days that now open on College Basketball", () => {
    for (let d = 15; d <= 21; d++) {
      const date = `2026-11-${d}`;
      at(`${date}T20:00:00Z`);
      const was = relevantSport(date);
      expect(getSport()).toBe(was === "mlb" ? "ncaab" : was);
      expect(getSport()).not.toBe("mlb");
    }
  });
});

describe("the switch on a device (a session)", () => {
  const events: string[] = [];
  const mem = new Map<string, string>();
  beforeAll(() => {
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    vi.stubGlobal("window", { dispatchEvent: (e: Event) => (events.push(e.type), true), localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    startSession();
  });
  const open = () => readSession<unknown>("archive-open", () => "unset");

  it("a device that has never opened an archive has it closed", () => {
    /* nothing has read or written the flag yet: a session's first read keeps the default it is handed,
       so the default itself has to be "closed" */
    writeSession("sport", "mlb", false);
    expect(getSport()).toBe("ncaab");
    expect(open()).toBe(false);
    setSport("mlb");
    expect(readSession<unknown>("sport", () => null)).toBe("ncaab");
  });

  it("picking a desk on the switch is remembered", () => {
    setSport("cfb");
    expect(getSport()).toBe("cfb");
    expect(mem.get("pl_sport")).toBe("cfb");
    expect(events.at(-1)).toBe("pl:sport");
  });

  it("asking for MLB lands on College Basketball, and that is what is stored", () => {
    setSport("mlb");
    expect(getSport()).toBe("ncaab");
    expect(readSession<unknown>("sport", () => null)).toBe("ncaab");
    expect(mem.get("pl_sport")).toBe("ncaab");
  });

  it("a device whose last desk was MLB comes back on College Basketball", () => {
    writeSession("sport", "mlb", false);
    writeSession("archive-open", false, false);
    expect(getSport()).toBe("ncaab");
  });

  it("opening the archive shows MLB, until another desk is picked", () => {
    openArchive("mlb");
    expect(getSport()).toBe("mlb");
    expect(open()).toBe(true);
    expect(readSession<unknown>("sport", () => null)).toBe("mlb");
    /* a reload inside the archive stays in it: the same stored values answer the same */
    expect(deskOf("mlb")).toBe("mlb");

    setSport("nfl");
    expect(getSport()).toBe("nfl");
    expect(open()).toBe(false);
    setSport("mlb");
    expect(getSport()).toBe("ncaab");
  });

  it("the automatic landing (not a tap) is redirected the same way", () => {
    setSport("mlb", false);
    expect(getSport()).toBe("ncaab");
    expect(readSession<unknown>("sport-manual", () => "unset")).not.toBe("unset");
  });
});

describe("what fills the page", () => {
  it("College Basketball: its own desk on every desk page", () => {
    for (const [p, view] of [
      ["/games", "games"],
      ["/games/401917176", "games"],
      ["/board", "board"],
      ["/ledger", "ledger"],
      ["/stats", "other"],
      ["/builder", "other"],
      ["/props", "other"],
      ["/sharp", "other"],
      ["/simulator", "other"],
      ["/board/parlays", "other"],
    ]) {
      const html = gate("ncaab", p);
      expect(html, p).toBe(`<div data-fake-desk="${view}"></div>`);
    }
  });

  it("College Basketball: the pages that are not a desk's show as they are", () => {
    for (const p of ["/settings", "/calc", "/anytime", "/taken", "/"]) expect(gate("ncaab", p), p).toBe(OWN);
  });

  it("the football desks: the app's own page, untouched", () => {
    for (const s of ["nfl", "cfb"]) {
      for (const p of ["/games", "/board", "/props", "/stats", "/settings", "/anytime", "/"]) expect(gate(s, p), `${s} ${p}`).toBe(OWN);
    }
  });

  it("the football desks' Ledger gains the archive shelf under it, and only the Ledger", () => {
    const html = gate("nfl", "/ledger");
    expect(html.startsWith(OWN)).toBe(true);
    expect(html).toContain("data-archive-shelf");
    expect(html).toContain("Open the MLB record");
    expect(html).not.toContain("data-archive-banner");
    expect(gate("cfb", "/ledger")).toContain("Open the MLB record");
    expect(gate("nfl", "/games")).not.toContain("data-archive-shelf");
  });

  it("the archived desk, opened: its own pages still mount, under the banner that says what they are", () => {
    for (const p of ["/games", "/board", "/ledger", "/stats", "/ballpark", "/props"]) {
      const html = gate("mlb", p);
      expect(html, p).toContain('data-archive-banner="mlb"');
      expect(html, p).toContain(OWN);
      expect(html.indexOf("data-archive-banner"), p).toBeLessThan(html.indexOf("data-own-page"));
      expect(html, p).not.toContain("data-fake-desk");
    }
    expect(gate("mlb", "/ledger")).not.toContain("data-archive-shelf");
  });

  it("the banner stays off the pages that are not a desk's", () => {
    for (const p of ["/settings", "/calc", "/anytime", "/taken", "/"]) expect(gate("mlb", p), p).toBe(OWN);
  });

  it("the banner says the record is kept and nothing new is made, and leads back", () => {
    const html = renderToStaticMarkup(<ArchiveBanner sport={"mlb" as Sport} />);
    expect(html).toContain("MLB is archived.");
    expect(html).toContain("This is the stored record of the season. No new card or bet is made on this desk while it is put aside.");
    expect(html).toContain("Back to College Basketball");
    expect(html).toContain('role="status"');
  });

  it("the shelf lists every archived desk but the one on screen, and is absent when there is none", () => {
    state.sport = "ncaab";
    const html = renderToStaticMarkup(<ArchiveShelf />);
    expect(html).toContain("Archived desks");
    expect(html).toContain("Its ledger, cards and results are kept as they were.");
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    state.sport = "mlb";
    expect(renderToStaticMarkup(<ArchiveShelf />)).toBe("");
  });
});

describe("as source", () => {
  const sport = stripComments(read("src/lib/sport.ts"));
  const sw = stripComments(read("src/components/shell/SportSwitch.tsx"));

  it("the switch's pills are the desks that are not archived, in the measured three-pill shape", () => {
    expect(sw).toMatch(/const OPTIONS: readonly SegmentedOption<Sport>\[\] = ACTIVE_SPORTS\.map\(\(s\) => \(\{/);
    expect(sw).toMatch(/import \{ ACTIVE_SPORTS, SPORT_META, setSport, useSport, type Sport \} from "@\/lib\/sport";/);
    expect(sw).not.toMatch(/[^_]SPORTS\.map/);
    expect(sport).toMatch(/export const ACTIVE_SPORTS: readonly Sport\[\] = \(\["nfl", "cfb", "mlb", "ncaab"\] as const\)\.filter\(\(s\) => !isArchived\(s\)\);/);
  });

  it("every way a desk is set or read goes through the archive rule", () => {
    expect(sport).toMatch(/export function setSport\(asked: Sport, manual = true\) \{\n  const s = deskOf\(asked\);\n  if \(!isArchived\(s\)\) writeSession\("archive-open", false, false\);\n  writeSession\("sport", s, false\);/);
    expect(sport).toMatch(/return deskOf\(isSport\(v\) \? v : relevantSport\(pacificDate\(\)\)\);/);
    expect(sport).toMatch(/return deskOf\(relevantSport\(pacificDate\(\)\), false\);/);
    expect(sport).toMatch(/export function openArchive\(s: Sport\) \{\n  writeSession\("archive-open", true, false\);\n  setSport\(s\);\n\}/);
    expect((sport.match(/"archive-open", true/g) ?? []).length).toBe(1);
  });

  it("archiving removed nothing: MLB's pages, routes and store keys are where they were", () => {
    for (const p of ["app/ballpark/page.tsx", "app/board/page.tsx", "app/ledger/page.tsx", "app/api/ledger/route.ts", "app/api/generate/route.ts", "app/api/board/route.ts", "src/lib/server/lock-card.ts"]) {
      expect(fs.existsSync(path.join(process.cwd(), p)), p).toBe(true);
    }
    expect(read("app/api/ledger/route.ts")).toMatch(/"pl:ledger:v1"/);
    /* the archive is a rule about which desk a device shows; the server side never reads it */
    for (const p of ["app/api/ledger/route.ts", "app/api/generate/route.ts", "app/api/scheduler/route.ts", "src/lib/server/lock-card.ts"]) {
      expect(read(p), p).not.toMatch(/ARCHIVED_SPORTS|isArchived|@\/lib\/sport"/);
    }
  });

  it("the gate sits in the page template, around the page and nothing else", () => {
    const tpl = stripComments(read("app/template.tsx"));
    expect(tpl).toMatch(/import \{ DeskGate \} from "@\/components\/shell\/DeskGate";/);
    expect(tpl).toMatch(/<DeskGate>\{children\}<\/DeskGate>/);
    expect((tpl.match(/\{children\}/g) ?? []).length).toBe(1);
    const gateSrc = stripComments(read("src/components/shell/DeskGate.tsx"));
    expect(gateSrc).toMatch(/if \(sport === "ncaab" && deskView\) return <NcaabDesk key=\{deskView\} view=\{deskView\} \/>;/);
    expect(gateSrc).toMatch(/\{isArchived\(sport\) && deskView && <ArchiveBanner sport=\{sport\} \/>\}\n\s+\{children\}\n\s+\{deskView === "ledger" && <ArchiveShelf \/>\}/);
  });

  it("the shell drops the sportsbook picker on the desk that has no use for it, and nowhere else", () => {
    const shell = read("src/components/shell/AppShell.tsx");
    expect(shell).toMatch(/<VerticalDensity toolbar=\{sport === "ncaab" \? undefined : <SportsbookSelector \/>\} enabled=/);
  });

  it("the shelf's button opens the archive, and the banner's button goes back to the fallback desk", () => {
    const notes = stripComments(read("src/components/shell/ArchiveNotes.tsx"));
    expect(notes).toMatch(/<Pill onClick=\{\(\) => openArchive\(s\)\}>Open the \{SPORT_META\[s\]\.short\} record<\/Pill>/);
    expect(notes).toMatch(/<Pill onClick=\{\(\) => setSport\(ARCHIVE_FALLBACK\)\}>Back to \{SPORT_META\[ARCHIVE_FALLBACK\]\.label\}<\/Pill>/);
    expect((notes.match(/openArchive\(/g) ?? []).length).toBe(1);
  });

  it("the stats map still has a row for every desk", () => {
    expect(stripComments(read("src/lib/stats-scope.ts"))).toMatch(/const DESK_STATS: Record<Sport, readonly StatsSportId\[\]> = \{\n  mlb: \["mlb"\],\n  cfb: \["cfb"\],\n  nfl: \["nfl"\],\n\s+ncaab: \["mlb"\],\n\};/);
  });
});
