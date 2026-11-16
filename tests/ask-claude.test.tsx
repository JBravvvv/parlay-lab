import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskClaude, AskClaudeLink } from "@/components/anytime/AskClaude";
import { GenOptions } from "@/components/props/GenOptions";
import { buildPool } from "@/components/props/mlb-gen-pool";
import {
  ASK_CLAUDE_BASE, ASK_OPTIONS_MAX, ASK_USAGE_KEY, PROMPT_MAX, askClaudeUrl, askUsageText, bumpAskUsage, cardPrompt, clipPrompt,
  ASK_PROJECT_KEY, askTarget, cleanProjectUrl, monthOf, readAskProject, readAskUsage, saveAskProject, ticketPrompt, type AskLeg,
} from "@/lib/ask-claude";
import { generate, openOptions, specSeed, type GenSpec } from "@/lib/parlay-gen";
import type { PropBoardGame } from "@/engine";

/**
 * 2026-11-15, Josh: "add claude to parlay lab and add the use count to each users plan (I would be signed in through
 * my own account so it will use my own claude usage)", then: "No one needs an API key; it is not required".
 *
 * So: a link that hands the question to Claude under the person's own sign-in. No key, no API call, no server route.
 * The count is questions sent from the device. Prices below come from tests/fixtures/gen-pool.json; none is made up.
 */
vi.stubGlobal("React", React);
(globalThis as { React?: typeof React }).React = React;

const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const NOV = new Date(2026, 10, 15, 12).getTime();
const DEC = new Date(2026, 11, 1, 0, 5).getTime();

describe("the link", () => {
  it("opens Claude's own new-chat page with the question in the q parameter, and nothing else", () => {
    const url = new URL(askClaudeUrl("Which leg is weakest? 50% & rising"));
    expect(`${url.origin}${url.pathname}`).toBe(ASK_CLAUDE_BASE);
    expect(ASK_CLAUDE_BASE).toBe("https://claude.ai/new");
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.searchParams.get("q")).toBe("Which leg is weakest? 50% & rising");
  });

  it("a question past the limit is cut and says it was cut", () => {
    const long = "x".repeat(PROMPT_MAX + 500);
    const cut = clipPrompt(long);
    expect(cut.length).toBe(PROMPT_MAX);
    expect(cut.endsWith("[list cut short to fit]")).toBe(true);
    expect(clipPrompt("short")).toBe("short");
    expect(new URL(askClaudeUrl(long)).searchParams.get("q")!.length).toBe(PROMPT_MAX);
  });
});

describe("the card question", () => {
  const picks = [
    { selection: "Detroit Lions -2.5", event: "New England Patriots @ Detroit Lions", kickoff: "Sun 10:00 AM", price: "−105", bookName: "FanDuel", bet: "$250", toWin: "$238.10", ev: "+7.4%" },
    { selection: "Over 41.5", event: "Carolina Panthers @ New Orleans Saints", kickoff: "Sun 1:25 PM", price: "+102", bookName: "DraftKings", bet: "$155", toWin: "$158.10", ev: "+3.1%" },
  ];
  const q = cardPrompt("NFL", picks, "$405");

  it("carries every pick with its price, book, dollars and the app's edge, and the total staked", () => {
    expect(q).toContain("My NFL card has 2 open picks, $405 staked in total:");
    expect(q).toContain("1. Detroit Lions -2.5 (New England Patriots @ Detroit Lions, Sun 10:00 AM PT) at −105 on FanDuel. Bet $250 to win $238.10. The app's estimated edge: +7.4%.");
    expect(q).toContain("2. Over 41.5 (Carolina Panthers @ New Orleans Saints, Sun 1:25 PM PT) at +102 on DraftKings. Bet $155 to win $158.10.");
    expect(cardPrompt("CFB", picks.slice(0, 1), "$250")).toContain("My CFB card has 1 open pick, $250 staked");
  });

  it("says it is paper and informational", () => {
    expect(q).toContain("paper picks");
    expect(q).toContain("Nothing here is a real wager");
    expect(q).toContain("not betting advice");
  });
});

describe("the ticket question", () => {
  const leg = (n: number, over: Partial<AskLeg> = {}): AskLeg => ({ label: `Player ${n}`, sub: "H+R+RBI Over 1.5", am: -120 - n, prob: 55 + n / 10, src: "model", gameLabel: "NYY @ BOS", ...over });
  const legs = [leg(1), leg(2), leg(3), leg(4, { am: 105, src: "market" })];

  it("lists the legs in slot order, marks the locked ones, and keeps the Model / Market labels", () => {
    const q = ticketPrompt({ legs, lockedIdx: [0, 2], options: [leg(9)], open: 2 });
    expect(q).toContain("My parlay has 4 legs:");
    expect(q).toContain("1. [LOCKED] Player 1, H+R+RBI Over 1.5 (NYY @ BOS) at -121. Model estimate 55.1%.");
    expect(q).toContain("2. Player 2, H+R+RBI Over 1.5 (NYY @ BOS) at -122.");
    expect(q).toContain("3. [LOCKED] Player 3");
    expect(q).toContain("4. Player 4, H+R+RBI Over 1.5 (NYY @ BOS) at +105. Market estimate 55.4%.");
    expect(q).toContain("1 pick could fill my 2 open slots:");
    expect(q).toContain("not certainties");
  });

  it("a long list is cut to the first 25 and states the true total", () => {
    const options = Array.from({ length: 61 }, (_, i) => leg(100 + i));
    const q = ticketPrompt({ legs: legs.slice(0, 3), lockedIdx: [0, 1, 2], options, open: 1 });
    expect(q).toContain(`61 picks could fill my 1 open slot (showing ${ASK_OPTIONS_MAX} of 61, best estimated chance first):`);
    expect((q.match(/^- Player /gm) ?? []).length).toBe(ASK_OPTIONS_MAX);
    const few = ticketPrompt({ legs: legs.slice(0, 3), lockedIdx: [], options: options.slice(0, 6), open: 1 });
    expect(few).toContain("6 picks could fill my 1 open slot:");
    expect(few).not.toContain("showing");
  });

  it("with every slot locked it asks about the parlay itself, not about a slot", () => {
    const q = ticketPrompt({ legs, lockedIdx: [0, 1, 2, 3], options: [], open: 0 });
    expect(q).toContain("What is the weakest leg here and why?");
    expect(q).not.toContain("could fill");
  });
});

describe("the count: questions sent from this device", () => {
  it("starts at zero, goes up by one a question, and is stored on the device", () => {
    const s = memStore();
    expect(readAskUsage(s, NOV)).toEqual({ month: "2026-11", count: 0, total: 0 });
    expect(bumpAskUsage(s, NOV)).toEqual({ month: "2026-11", count: 1, total: 1 });
    expect(bumpAskUsage(s, NOV)).toEqual({ month: "2026-11", count: 2, total: 2 });
    expect(JSON.parse(s.raw.get(ASK_USAGE_KEY)!)).toEqual({ month: "2026-11", count: 2, total: 2 });
    expect(readAskUsage(s, NOV)).toEqual({ month: "2026-11", count: 2, total: 2 });
  });

  it("a new month starts the month's count again and keeps the all-time total", () => {
    const s = memStore();
    bumpAskUsage(s, NOV); bumpAskUsage(s, NOV); bumpAskUsage(s, NOV);
    expect(monthOf(DEC)).toBe("2026-12");
    expect(readAskUsage(s, DEC)).toEqual({ month: "2026-12", count: 0, total: 3 });
    expect(bumpAskUsage(s, DEC)).toEqual({ month: "2026-12", count: 1, total: 4 });
  });

  it("a missing, damaged or refused store reads as zero and never throws", () => {
    expect(readAskUsage(null, NOV)).toEqual({ month: "2026-11", count: 0, total: 0 });
    expect(readAskUsage(memStore({ [ASK_USAGE_KEY]: "{not json" }), NOV).total).toBe(0);
    expect(readAskUsage(memStore({ [ASK_USAGE_KEY]: JSON.stringify({ month: "2026-11", count: -4, total: "9" }) }), NOV)).toEqual({ month: "2026-11", count: 0, total: 0 });
    expect(readAskUsage(memStore({ [ASK_USAGE_KEY]: JSON.stringify({ month: "2026-11", count: 50, total: 7 }) }), NOV).count).toBe(7);
    const refuses = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(readAskUsage(refuses, NOV).count).toBe(0);
    expect(bumpAskUsage(refuses, NOV)).toEqual({ month: "2026-11", count: 1, total: 1 });
  });

  it("is worded as questions, singular and plural", () => {
    expect(askUsageText({ month: "2026-11", count: 1, total: 1 })).toBe("1 question this month · 1 all time");
    expect(askUsageText({ month: "2026-11", count: 14, total: 30 })).toBe("14 questions this month · 30 all time");
  });
});

describe("the button", () => {
  const out = renderToStaticMarkup(createElement(AskClaude, { prompt: "Which leg is weakest?", label: "Ask Claude about these picks" }));

  it("is a plain link to Claude that opens outside the app, with the question in it", () => {
    expect(out).toContain(`href="${askClaudeUrl("Which leg is weakest?")}"`.replace(/&/g, "&amp;"));
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("Ask Claude about these picks");
    expect(out).toContain("Opens Claude in your own account. No key needed.");
  });

  it("uses no key, no API and no server route: the code only builds a claude.ai link", () => {
    for (const p of ["src/lib/ask-claude.ts", "src/components/anytime/AskClaude.tsx"]) {
      const src = read(p);
      expect(src).not.toMatch(/api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key|\/api\/sharp|fetch\(/);
      expect(src).not.toMatch(/pl_synckey|x-pl-sync|getSyncKey/);
    }
  });
});

describe("where it is mounted", () => {
  it("on the Locked picks block, in the builder's possible-picks fold, and as a count in Settings", () => {
    expect(read("src/components/anytime/EnginePicks.tsx")).toContain('<AskClaude label="Ask Claude about these picks" prompt={cardPrompt(name, card.days.flatMap((d) => d.picks), card.atRiskText)} />');
    expect(read("src/components/props/GenOptions.tsx")).toContain("<AskClaude label=");
    expect(read("src/components/props/GenSheet.tsx")).not.toContain("AskClaude");
    expect(read("app/settings/page.tsx")).toContain("<AskClaudeUsage />");
    expect(read("app/settings/page.tsx")).toContain("<AskClaudeProject />");
  });

  it("the builder's question carries the real ticket, its locks and the real possible picks", () => {
    const board = (JSON.parse(read("tests/fixtures/gen-pool.json")) as { propBoard: PropBoardGame[] }).propBoard;
    const spec: GenSpec = { market: "batter_hits_runs_rbis", legs: 4, legMinAm: -152, legMaxAm: 110, payout: null, sides: "o", onePerGame: false, czOnly: false, includeStarted: false, modelOnly: false, pinned: [null, null, null, null] };
    const pool = buildPool(board, spec, 0);
    const first = generate(pool, spec, specSeed(spec, "2026-07-10", 0));
    if (!first.ok) throw new Error("fixture no longer fills four slots");
    const legs = first.ticket.legs;
    const locked: GenSpec = { ...spec, pinned: [legs[0].id, legs[1].id, legs[2].id, null] };
    const o = openOptions(pool, locked);
    const out = renderToStaticMarkup(createElement(GenOptions, { pool, spec: locked, ticketIds: legs.map((l) => l.id), ticket: legs, renderMark: () => null } as Parameters<typeof GenOptions>[0]));
    const href = /href="(https:\/\/claude\.ai\/new\?q=[^"]+)"/.exec(out)?.[1].replace(/&amp;/g, "&");
    expect(href).toBeTruthy();
    const q = new URL(href!).searchParams.get("q")!;
    expect(q).toContain("My parlay has 4 legs:");
    expect((q.match(/\[LOCKED\]/g) ?? []).length).toBe(3);
    expect(q).toContain(`1. [LOCKED] ${legs[0].label}, ${legs[0].sub}`);
    expect(q).toContain(`4. ${legs[3].label}, ${legs[3].sub}`);
    expect(q).toContain(`${o.legs.length} pick${o.legs.length === 1 ? "" : "s"} could fill my 1 open slot`);
    expect(out).toContain("Ask Claude which pick to take");
  });
});

describe("a Claude that knows the project", () => {
  const PROJECT = "https://claude.ai/project/0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000";
  const projStore = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };

  it("accepts only a project address on claude.ai, and strips anything extra", () => {
    expect(cleanProjectUrl(PROJECT)).toBe(PROJECT);
    expect(cleanProjectUrl(`  ${PROJECT}/?x=1#frag `)).toBe(PROJECT);
    /* the owner's own Claude Code session, served by Remote Control to their sign-in only */
    expect(cleanProjectUrl("https://claude.ai/code/session_01AbCdEf-9")).toBe("https://claude.ai/code/session_01AbCdEf-9");
    expect(cleanProjectUrl("https://claude.ai/code/session_01AbCdEf-9/?from=badge")).toBe("https://claude.ai/code/session_01AbCdEf-9");
    expect(askTarget("Which leg?", "https://claude.ai/code/session_01AbCdEf-9")).toEqual({ href: "https://claude.ai/code/session_01AbCdEf-9", inProject: true });
    for (const bad of ["https://claude.ai/code", "https://claude.ai/code/", "https://claude.ai/code/a b", "https://claude.ai/code/a/b/c/d/e", "https://claude.ai/codex/abc", "claude://claude.ai/code/abc"]) expect(cleanProjectUrl(bad)).toBeNull();
    for (const bad of [
      "", "not a link", null, 7, "http://claude.ai/project/0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000", "https://claude.ai.evil.com/project/0199aaaa-bbbb",
      "https://evil.com/project/0199aaaa-bbbb-7ccc", "https://claude.ai/new", "https://claude.ai/chat/0199aaaa-bbbb-7ccc", "https://claude.ai/project/",
      "https://claude.ai/project/abc/../../x", "https://user:pw@claude.ai/project/0199aaaa-bbbb-7ccc", "javascript:alert(1)", "https://claude.ai:8443/project/0199aaaa-bbbb-7ccc",
    ]) expect(cleanProjectUrl(bad)).toBeNull();
  });

  it("saves, reads back and removes the project on the device; a bad address is refused and changes nothing", () => {
    const s = projStore();
    expect(readAskProject(s)).toBeNull();
    expect(saveAskProject(s, `${PROJECT}?utm=1`)).toBe(PROJECT);
    expect(s.raw.get(ASK_PROJECT_KEY)).toBe(PROJECT);
    expect(readAskProject(s)).toBe(PROJECT);
    expect(saveAskProject(s, "https://evil.com/project/0199aaaa-bbbb-7ccc")).toBe("bad");
    expect(readAskProject(s)).toBe(PROJECT);
    expect(saveAskProject(s, "  ")).toBeNull();
    expect(readAskProject(s)).toBeNull();
    expect(readAskProject(projStore({ [ASK_PROJECT_KEY]: "https://evil.com/x" }))).toBeNull();
    expect(readAskProject(null)).toBeNull();
  });

  it("with a project the button opens the project; without one, a new chat carrying the question", () => {
    expect(askTarget("Which leg?", PROJECT)).toEqual({ href: PROJECT, inProject: true });
    expect(askTarget("Which leg?", null)).toEqual({ href: askClaudeUrl("Which leg?"), inProject: false });
    expect(askTarget("Which leg?", "https://evil.com/project/0199aaaa-bbbb-7ccc").inProject).toBe(false);
    const withProject = renderToStaticMarkup(createElement(AskClaudeLink, { prompt: "Which leg?", label: "Ask Claude", project: PROJECT }));
    expect(withProject).toContain(`href="${PROJECT}"`);
    expect(withProject).toContain('data-ask-claude="project"');
    expect(withProject).toContain("Opens your own Parlay Lab chat in Claude, which knows the whole app.");
    const without = renderToStaticMarkup(createElement(AskClaudeLink, { prompt: "Which leg?", label: "Ask Claude", project: null }));
    expect(without).toContain('data-ask-claude="new"');
    expect(without).toContain("https://claude.ai/new?q=");
  });
});
