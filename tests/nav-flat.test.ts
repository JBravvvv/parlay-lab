import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FLAT NAVIGATION + NO PER-ITEM BLUR — iOS freeze guard (2026-09-05).
 *
 * Josh, iPhone: "Football side is freezing A TON & only way to get out of freeze is to
 * swipe back a page. Same as last time this happened I don't want swiping left to right
 * to go backwards like Apple has their stuff set."
 *
 * Root cause (verified in the Scramble Lab sibling): a history PUSH arms iOS Safari's
 * edge-swipe-back recognizer, which randomly wedges and eats every tap until the swipe is
 * performed; and one backdrop-filter layer PER CARD over a video background freezes the
 * compositor. So:
 *   (a) every internal <Link> carries `replace` — history stays one entry deep, the back
 *       gesture never arms, a back-swipe intentionally does nothing;
 *   (b) no router.push anywhere (replace only);
 *   (c) html/body carry `touch-action: manipulation` (NOT pan-x pan-y — that also wedged);
 *   (d) per-item surfaces (game cards, ticket cards, stat tiles, table rows, player rows)
 *       carry no backdrop-filter / backdrop-blur. Blur lives only on fixed shell chrome.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const SOURCES = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "src"))];

/** every `<Link …>` opening tag in a file, brace-aware (attributes may hold `=>`) */
function linkTags(src: string): string[] {
  const tags: string[] = [];
  let i = src.indexOf("<Link");
  while (i !== -1) {
    // must be the JSX tag, not a word like <LinkIcon or a comment "<Link> card"
    const after = src[i + 5];
    if (after === undefined || /[\s\n/>]/.test(after)) {
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      tags.push(src.slice(i, j + 1));
    }
    i = src.indexOf("<Link", i + 5);
  }
  return tags;
}

/** attribute names of one opening tag, ignoring attribute VALUES (braces / quotes) */
function attrNames(tag: string): string[] {
  const body = tag.replace(/^<Link\s*/, "").replace(/\/?>$/, "");
  const names: string[] = [];
  let i = 0;
  while (i < body.length) {
    const m = /^\s*([A-Za-z_-][\w:-]*)/.exec(body.slice(i));
    if (!m) break;
    names.push(m[1]);
    i += m[0].length;
    if (body[i] === "=") {
      i++;
      if (body[i] === '"' || body[i] === "'") {
        const q = body[i];
        i = body.indexOf(q, i + 1) + 1;
      } else if (body[i] === "{") {
        let depth = 0;
        for (; i < body.length; i++) {
          if (body[i] === "{") depth++;
          else if (body[i] === "}" && --depth === 0) {
            i++;
            break;
          }
        }
      }
    }
  }
  return names;
}

function hrefOf(tag: string): string | null {
  const m = /\bhref=(?:"([^"]*)"|\{([\s\S]*?)\})/.exec(tag);
  if (!m) return null;
  return m[1] ?? m[2];
}

/** internal = a literal path, or a variable / template (only http(s) literals are external) */
function isInternal(href: string): boolean {
  return !/^["'`]?https?:\/\//.test(href.trim());
}

describe("nav-flat — every internal Link is replace-only (iOS back-swipe never arms)", () => {
  const found: { file: string; tag: string }[] = [];
  for (const f of SOURCES) {
    const src = fs.readFileSync(f, "utf8");
    for (const tag of linkTags(src)) found.push({ file: path.relative(ROOT, f), tag });
  }
  it("finds the Links (the scan is not vacuous)", () => {
    expect(found.length).toBeGreaterThanOrEqual(15);
  });
  it("each internal <Link> carries `replace` (attribute order free)", () => {
    const missing = found
      .filter(({ tag }) => {
        const href = hrefOf(tag);
        return href !== null && isInternal(href) && !attrNames(tag).includes("replace");
      })
      .map(({ file, tag }) => `${file}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
    expect(missing).toEqual([]);
  });
});

describe("nav-flat — no router.push anywhere in app/ or src/", () => {
  it("router.push( is absent", () => {
    const hits = SOURCES.filter((f) => /router\.push\(/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});

describe("nav-flat — html/body touch-action: manipulation", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  it("html and body both declare touch-action: manipulation (never pan-x pan-y)", () => {
    const blocks = [...css.matchAll(/(?:^|\n)((?:html|body)(?:\s*,\s*(?:html|body))?)\s*\{([^}]*)\}/g)];
    const decl = (sel: "html" | "body") =>
      blocks.some((b) => b[1].split(",").map((s) => s.trim()).includes(sel) && /touch-action:\s*manipulation\s*;/.test(b[2]));
    expect(decl("html")).toBe(true);
    expect(decl("body")).toBe(true);
    expect(css).not.toMatch(/touch-action:\s*pan-x\s+pan-y/);
    // the pull-to-refresh guard stays
    expect(css).toMatch(/overscroll-behavior-y:\s*none/);
  });
});

describe("nav-flat — no backdrop blur on per-item surfaces", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const BLUR = /backdrop-filter|backdrop-blur/;
  /** the CSS declaration block(s) for one class selector */
  function rule(cls: string): string {
    return [...css.matchAll(new RegExp(`\\n\\.${cls.replace(/[.-]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");
  }
  it("the shared per-item classes (.glass, .glass-table, .ticket, .stat-tile, .liquid-glass) are tint-only", () => {
    for (const cls of ["glass", "glass-table", "ticket", "stat-tile", "liquid-glass"]) {
      expect(rule(cls).length, `.${cls} rule present`).toBeGreaterThan(0);
      expect(rule(cls), `.${cls} has no blur`).not.toMatch(BLUR);
    }
  });
  const FILES = [
    "src/components/cfb/CfbGameCard.tsx",
    "src/components/cfb/CfbTicketCard.tsx",
    "src/components/ui/StatTile.tsx",
    "src/components/props/GameCard.tsx",
    "src/components/props/PlayerRow.tsx",
  ];
  for (const f of FILES) {
    it(`${f} carries no backdrop-filter / backdrop-blur`, () => {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8")).not.toMatch(BLUR);
    });
  }
  it("DataTable row markup (thead + tbody) carries no blur", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/components/ui/DataTable.tsx"), "utf8");
    const table = src.slice(src.indexOf("<table"), src.indexOf("</table>"));
    expect(table.length).toBeGreaterThan(0);
    expect(table).not.toMatch(BLUR);
  });
});
