import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 50 (2026-09-11), item 5. Josh's word, verbatim: "Need to be able to collapse
 * list of picks for each individual game/prop by clicking/pressing in the top box that shows
 * the team matchup".
 *
 * The collapse ALREADY EXISTED on both Parlay Builder cards — GameHeader has been a real
 * <button aria-expanded> since the UI rebuild. What was wrong with it:
 *   1. the strip was h-9 = 36px, under this repo's own 44px thumb-target bar;
 *   2. no `press` tap feedback, so a tap felt like nothing happened;
 *   3. the open/closed state was a bare `useState(true)` inside each card — thrown away on
 *      every remount (market change, deep-link narrowing at app/props/page.tsx) and reload;
 *   4. aria-controls named nothing, so a screen reader had no link from the header to the body.
 *
 * These are the guards for that fix. Two layers: source pins on the markup (the repo has no
 * jsdom, so a click is pinned at source level) and real behaviour tests against
 * collapse-store.ts with a fake localStorage — including the case that matters most, that the
 * stored set is read only AFTER mount and never at import or in a useState initializer.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const GAMES_PATH = "src/components/props/GameCard.tsx";
const ROWS_PATH = "src/components/props/PlayerRow.tsx";
const STORE_PATH = "src/components/props/collapse-store.ts";

const gamesRaw = read(GAMES_PATH);
const rowsRaw = read(ROWS_PATH);
const games = stripComments(gamesRaw);
const rows = stripComments(rowsRaw);
const store = stripComments(read(STORE_PATH));

/** the GameHeader button only — so a pin cannot be satisfied by some other control in the file */
const headerOf = (src: string) =>
  src.slice(src.indexOf("export function GameHeader"), src.indexOf("export function TeamSidePills"));
const HEADER_44 = /className="press flex min-h-\[44px\] w-full items-center gap-2 px-3 text-left"/;

/* --------------------------------------------------------------- the header */

describe("the matchup box is the toggle — a real 44px button with press feedback", () => {
  it("GameHeader is a <button> carrying aria-expanded, not a div with an onClick", () => {
    const header = headerOf(games);
    expect(header.length).toBeGreaterThan(0);
    expect(header).toMatch(/<button\b/);
    expect(header).toMatch(/aria-expanded=\{open\}/);
    expect(header).toMatch(/onClick=\{onToggle\}/);
    expect(header).toMatch(/type="button"/);
  });
  it("the strip is min-h-[44px] with .press — the 36px h-9 target is gone", () => {
    const header = headerOf(games);
    expect(header).toMatch(HEADER_44);
    expect(header).not.toMatch(/h-9 w-full/);
    expect(games).not.toMatch(/flex h-9 w-full/);
  });
  it("the density pins the rebuild set on this header still hold (20px logos, 11px matchup line)", () => {
    expect(games).toMatch(/size = "h-5 w-5"/);
    expect(games).toMatch(/text-\[11px\] font-semibold tracking-wide/);
  });
  it("the team-side pills keep their own min-h-9 sizing — this change did not touch them", () => {
    expect(games).toMatch(/min-h-9 rounded-full px-3 py-1 text-\[11px\]/);
  });
});

describe("aria-controls points at the body, and only while the body exists", () => {
  it("the header emits aria-controls in the open state only", () => {
    expect(headerOf(games)).toMatch(/aria-controls=\{open && panelId \? panelId : undefined\}/);
  });
  it("both cards give their body that id inside the {open && ...} branch", () => {
    for (const [name, src] of [["GameMarketCard", games], ["PropGameCard", rows]] as const) {
      expect(src, `${name} must pass panelId to the header`).toMatch(/panelId=\{panel\}/);
      expect(src, `${name} body must be keyed by the same id`).toMatch(/\{open && \(\s*<div id=\{panel\}/);
      expect(src, `${name} must derive the id from the collapse key`).toMatch(/const panel = panelIdFor\(ckey\);/);
    }
  });
  it("a collapsed ML/RL card still reads its line count in the header", () => {
    const ml = games.slice(games.indexOf("export function GameMarketCard"));
    expect(ml).toMatch(/count=\{`\$\{g\.rows\.length\} line\$\{g\.rows\.length === 1 \? "" : "s"\}`\}/);
    expect(rows).toMatch(/count=\{`\$\{visible\.length\} line/);
  });
});

/* ------------------------------------------------------- the store's wiring */

describe("the open/closed choice is remembered, and read the way the hydration rule demands", () => {
  it("both cards read and write through the shared store — no bare useState(true), no localStorage of their own", () => {
    for (const [name, src] of [["GameMarketCard", games], ["PropGameCard", rows]] as const) {
      expect(src, `${name} must use the store hook`).toMatch(/const \{ open: stored, toggle \} = useGameCollapse\(ckey\);/);
      expect(src, `${name} must key it off gkey ?? game`).toMatch(/const ckey = collapseKey\(g\.gkey, g\.game\);/);
      expect(src, `${name} must import the store`).toMatch(
        /import \{[^}]*\buseGameCollapse\b[^}]*\} from "\.\/collapse-store";/,
      );
      expect(src, `${name} must clear a remembered collapse through the store`).toMatch(
        /import \{[^}]*\bsetCollapsed\b[^}]*\} from "\.\/collapse-store";/,
      );
      expect(src, `${name} must not keep the forgotten local state`).not.toMatch(/useState\(true\)/);
      expect(src, `${name} must not touch storage directly`).not.toMatch(/localStorage/);
    }
  });
  it("the key is pl:props:collapsed and every access to it sits in a try/catch", () => {
    expect(store).toMatch(/export const COLLAPSED_KEY = "pl:props:collapsed";/);
    expect(store).toMatch(/try \{\s*const raw = localStorage\.getItem\(COLLAPSED_KEY\);/);
    expect(store).toMatch(/try \{\s*localStorage\.setItem\(COLLAPSED_KEY, JSON\.stringify\(\[\.\.\.set\]\)\);\s*\} catch \{/);
    // exactly two touches, both the guarded ones above — a third would be an unguarded read
    expect(store.match(/localStorage\./g) ?? []).toHaveLength(2);
  });
  it("the stored set is read after mount, never in an initializer, and the server sees everything open", () => {
    expect(store).toMatch(/useEffect\(\(\) => \{\s*hydrateCollapsed\(\);\s*\}, \[\]\);/);
    expect(store).not.toMatch(/useState\([^)]*localStorage/);
    expect(store).toMatch(/useSyncExternalStore\(\s*subscribe,\s*\(\) => mem\.has\(key\),\s*\(\) => false,\s*\)/);
  });
  /* THE DEEP LINK OPENS THE CARD ONCE — IT DOES NOT HOLD IT OPEN.
     `open = stored || hasHit` made the matchup header a DEAD BUTTON on exactly the card a
     ledger link lands on: the tap wrote collapsed=true to the store, the override forced `open`
     back to true, nothing moved on screen and aria-expanded stayed "true", while the persisted
     state silently drifted from what was rendered. That is Josh's item-1 complaint ("button not
     working") reintroduced by item 5's own fix. Clearing the stored bit in an effect instead
     still reveals the linked row on arrival and leaves the header live afterwards. */
  it("a deep link CLEARS the remembered collapse once, and never overrides `open` on every render", () => {
    for (const [name, src] of [["GameMarketCard", games], ["PropGameCard", rows]] as const) {
      expect(src, `${name} must render the store's value, not an override`).toMatch(/const open = stored;/);
      expect(src, `${name} must not re-introduce the override`).not.toMatch(/const open = stored \|\|/);
      expect(src, `${name} must clear the collapse on arrival, in an effect`).toMatch(
        /useEffect\(\(\) => \{\s*if \(hasHit\) setCollapsed\(ckey, false\);\s*\}, \[hasHit, ckey\]\);/,
      );
    }
  });

  it("PLANT: restoring the `stored || hit` override is detected", () => {
    const patched = games.replace("const open = stored;", "const open = stored || hasHit;");
    expect(patched).toMatch(/const open = stored \|\|/);
    expect(games).not.toMatch(/const open = stored \|\|/);
  });
});

/* ------------------------------------------- the store's actual behaviour */

type Store = typeof import("../src/components/props/collapse-store");

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const KEY = "pl:props:collapsed";

async function freshStore(storage: unknown): Promise<Store> {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage);
  return (await import("../src/components/props/collapse-store")) as Store;
}

afterEach(() => vi.unstubAllGlobals());

describe("collapse-store — open by default, remembered when closed, never throws", () => {
  it("an unseen game key is OPEN: the default is unchanged by adding persistence", async () => {
    const s = await freshStore(fakeStorage());
    expect(s.isCollapsed("401570123")).toBe(false);
  });

  it("collapsing writes the key through to storage; re-opening takes it back out", async () => {
    const ls = fakeStorage();
    const s = await freshStore(ls);
    s.setCollapsed("401570123", true);
    expect(s.isCollapsed("401570123")).toBe(true);
    expect(JSON.parse(ls.map.get(KEY) as string)).toEqual(["401570123"]);
    s.toggleCollapsed("401570123");
    expect(s.isCollapsed("401570123")).toBe(false);
    expect(JSON.parse(ls.map.get(KEY) as string)).toEqual([]);
  });

  it("the stored set is NOT read at import — only hydrateCollapsed() (the post-mount read) applies it", async () => {
    const s = await freshStore(fakeStorage({ [KEY]: JSON.stringify(["401570123"]) }));
    // this is the hydration rule: the first render must match the server, which sees nothing
    expect(s.isCollapsed("401570123")).toBe(false);
    s.hydrateCollapsed();
    expect(s.isCollapsed("401570123")).toBe(true);
    // idempotent — the second card to mount must not re-read or undo a toggle made since
    s.setCollapsed("401570123", false);
    s.hydrateCollapsed();
    expect(s.isCollapsed("401570123")).toBe(false);
  });

  it("blocked storage degrades to session-only: nothing throws, the choice still holds", async () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
      setItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    const s = await freshStore(blocked);
    expect(() => s.hydrateCollapsed()).not.toThrow();
    expect(() => s.setCollapsed("401570123", true)).not.toThrow();
    expect(s.isCollapsed("401570123")).toBe(true);
  });

  it("no localStorage at all (SSR / node) is just as safe", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", undefined);
    const s = (await import("../src/components/props/collapse-store")) as Store;
    expect(() => s.hydrateCollapsed()).not.toThrow();
    expect(() => s.setCollapsed("g", true)).not.toThrow();
    expect(s.isCollapsed("g")).toBe(true);
  });

  it("a corrupt or foreign stored value leaves every card open", async () => {
    for (const raw of ["{not json", '"a string"', "42", JSON.stringify([1, 2, 3])]) {
      const s = await freshStore(fakeStorage({ [KEY]: raw }));
      s.hydrateCollapsed();
      expect(s.isCollapsed("401570123"), `corrupt value ${raw} must not collapse anything`).toBe(false);
    }
  });

  it("the set cannot grow without bound — the oldest collapse ages out at 400", async () => {
    const ls = fakeStorage();
    const s = await freshStore(ls);
    for (let i = 0; i < 405; i++) s.setCollapsed(`g${i}`, true);
    const stored = JSON.parse(ls.map.get(KEY) as string) as string[];
    expect(stored).toHaveLength(400);
    expect(s.isCollapsed("g0")).toBe(false);
    expect(s.isCollapsed("g404")).toBe(true);
  });

  it("collapseKey prefers the engine's game key and falls back to the matchup string", async () => {
    const s = await freshStore(fakeStorage());
    expect(s.collapseKey("401570123", "Giants @ Rockies · 5:40 PM")).toBe("401570123");
    expect(s.collapseKey(null, "Giants @ Rockies · 5:40 PM")).toBe("Giants @ Rockies · 5:40 PM");
    expect(s.collapseKey(undefined, "")).toBe("");
    // an empty key is not storable — it would collapse every unkeyed card at once
    s.setCollapsed("", true);
    expect(s.isCollapsed("")).toBe(false);
  });

  it("panelIdFor is DOM-safe and stable for the same game", async () => {
    const s = await freshStore(fakeStorage());
    const id = s.panelIdFor("Giants @ Rockies · 5:40 PM");
    expect(id).toMatch(/^props-panel-[a-z0-9_-]+$/);
    expect(s.panelIdFor("Giants @ Rockies · 5:40 PM")).toBe(id);
    expect(s.panelIdFor("401570123")).toBe("props-panel-401570123");
    expect(s.panelIdFor("")).toBe("props-panel-game");
  });
});

/* ---------------------------------------------------------- iOS + plants */

describe("the iOS freeze rule still holds on both card files", () => {
  const BLUR = /backdrop-(filter|blur)/;
  for (const [name, src] of [[GAMES_PATH, gamesRaw], [ROWS_PATH, rowsRaw]] as const) {
    it(`${name} carries no backdrop-filter / backdrop-blur`, () => {
      expect(src).not.toMatch(BLUR);
    });
  }
});

describe("PLANTS — the guards above are not vacuous", () => {
  it("PLANT: reverting the header to the old 36px h-9 target is detected", () => {
    const reverted = games.replace(
      'className="press flex min-h-[44px] w-full items-center gap-2 px-3 text-left"',
      'className="flex h-9 w-full items-center gap-2 px-3 text-left"',
    );
    expect(reverted, "the string the guard reads must actually be in the file").not.toBe(games);
    expect(HEADER_44.test(headerOf(games))).toBe(true);
    expect(HEADER_44.test(headerOf(reverted))).toBe(false);
    expect(headerOf(reverted)).toMatch(/h-9 w-full/);
  });

  it("PLANT: a card going back to the forgotten useState(true) is detected", () => {
    const reverted = rows.replace(
      "const { open: stored, toggle } = useGameCollapse(ckey);",
      "const [open, setOpen] = useState(true);",
    );
    expect(reverted).not.toBe(rows);
    expect(/useState\(true\)/.test(rows)).toBe(false);
    expect(/useState\(true\)/.test(reverted)).toBe(true);
  });

  it("PLANT: an unguarded localStorage read in the store is detected", () => {
    const unguarded = store.replace(
      "const raw = localStorage.getItem(COLLAPSED_KEY);",
      "const raw = localStorage.getItem(COLLAPSED_KEY) ?? localStorage.getItem('pl:props:collapsed:v0');",
    );
    expect(unguarded).not.toBe(store);
    expect(store.match(/localStorage\./g) ?? []).toHaveLength(2);
    expect(unguarded.match(/localStorage\./g) ?? []).toHaveLength(3);
  });
});
