import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CFB SEPARATION PINS (2026-09-05, owner E) — source-scan guards that the College
 * Football desk is wired in AND kept apart from MLB: its own paper amounts, its own
 * localStorage + Redis keys, its own sync route, its own settle book. A refactor that
 * quietly points a CFB surface at an MLB key (or drops the desk from a page) fails here.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const PAGES: Record<string, string> = {
  "app/board/page.tsx": "CfbPicksBoard",
  "app/builder/page.tsx": "CfbBuilder",
  "app/props/page.tsx": "CfbProps",
  "app/ledger/page.tsx": "CfbLedger",
  "app/sharp/page.tsx": "CfbSharp",
  "app/games/page.tsx": "CfbGames",
  "app/stats/page.tsx": "CfbFpiPanel",
  "app/settings/page.tsx": "CfbBankPanel",
};

describe("cfb rules — the constants the desk runs on", () => {
  const rules = read("src/lib/cfb/rules.ts");
  it("paper amounts: $150 daily / $25 fun", () => {
    expect(rules).toMatch(/daily:\s*150\b/);
    expect(rules).toMatch(/fun:\s*25\b/);
  });
  it("localStorage keys are the CFB ones", () => {
    expect(rules).toMatch(/ledger:\s*"pl_cfb_ledger"/);
    expect(rules).toMatch(/bank:\s*"pl_cfb_bank2"/);
  });
  it("redis keys are the CFB ones", () => {
    expect(rules).toMatch(/ledger:\s*"pl:cfb:ledger:v1"/);
    expect(rules).toMatch(/bank:\s*"pl:cfb:bank:v1"/);
  });
  it("Caesars settles", () => {
    expect(rules).toMatch(/settleBook:\s*"williamhill_us"/);
  });
  it("the server lock window (INSTRUCTION 45): one hour before the first kickoff, a 25 s forward budget", () => {
    expect(rules).toMatch(/export const CFB_LOCK = \{\s*leadMs:\s*60 \* 60_000,\s*forwardTimeoutMs:\s*25_000,\s*\} as const;/);
  });
});

describe("cfb feature flag + shell", () => {
  it("CFB_ENABLED is on", () => {
    expect(read("src/lib/features.ts")).toMatch(/export const CFB_ENABLED = true;/);
  });
  it("AppShell mounts the SportSwitch and the CFB sync beacon", () => {
    const shell = read("src/components/shell/AppShell.tsx");
    expect(shell).toMatch(/import \{ SportSwitch \} from ["']\.\/SportSwitch["']/);
    expect(shell).toMatch(/useCfbSyncBeacon\(\);/);
  });
});

describe("every page is wired to the global sport switch", () => {
  for (const [file, component] of Object.entries(PAGES)) {
    it(`${file} imports useSport and ${component}`, () => {
      const src = read(file);
      expect(src, `${file} must read the global switch`).toMatch(/import \{ useSport \} from "@\/lib\/sport"/);
      expect(src, `${file} must call it`).toMatch(/useSport\(\)/);
      expect(src, `${file} must import ${component}`).toMatch(
        new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from "@/components/cfb/${component === "CfbFpiPanel" ? "CfbFpiPanel" : component}"`),
      );
      expect(src, `${file} must render ${component}`).toMatch(new RegExp(`<${component}\\b`));
      expect(src, `${file} must gate on the flag`).toMatch(/CFB_ENABLED/);
    });
  }
  it("the CFB branches carry the College Football eyebrow", () => {
    for (const file of Object.keys(PAGES)) {
      // literal on the CFB-only branches; `{cfbDesk ? "College Football" : undefined}` where the page is shared
      expect(read(file), file).toMatch(/eyebrow=(?:"College Football"|\{[^}]*"College Football")/);
    }
  });
  it("settings shows the College Football bank beside the MLB one", () => {
    const src = read("app/settings/page.tsx");
    expect(src).toMatch(/<Panel title="College Football bank">/);
    expect(src).toMatch(/<CfbBankPanel \/>/);
    expect(src).toMatch(/MLB bank/);
  });
  it("stats no longer squats on the global pl_sport key", () => {
    const src = read("app/stats/page.tsx");
    expect(src).not.toMatch(/localStorage\.(get|set)Item\("pl_sport"/);
    expect(src).toMatch(/"pl_stats_sport"/);
  });
});

describe("the CFB server lock route (INSTRUCTION 45) stays on the CFB rails", () => {
  it("app/api/cfb/lock/route.ts writes the CFB ledger blob only, gated by the cron header, never the sync phrase", () => {
    const route = read("app/api/cfb/lock/route.ts");
    expect(route).toMatch(/pl:cfb:ledger:v1/);
    expect(route).toMatch(/pl:cfb:bank:v1/);
    expect(route).toMatch(/cronHeaderAuthed\(/);
    expect(route).not.toMatch(/pl:ledger:v1/);
    expect(route).not.toMatch(/pl:bank:v1/);
    expect(route).not.toMatch(/x-pl-sync/);
    expect(route).not.toMatch(/syncAuthed\(/);
  });
});

describe("cfb storage never touches the MLB keys", () => {
  it("store.ts", () => {
    const store = read("src/lib/cfb/store.ts");
    expect(store).not.toMatch(/"pl_ledger"/);
    expect(store).not.toMatch(/"pl_bank2"/);
    expect(store).not.toMatch(/"pl_noplay"/);
  });
  it("sync.ts posts to /api/cfb/ledger, never the MLB route", () => {
    const sync = read("src/lib/cfb/sync.ts");
    expect(sync).toMatch(/\/api\/cfb\/ledger/);
    expect(sync).not.toMatch(/\/api\/ledger"/);
  });
  it("the CFB ledger route never reads the MLB redis keys", () => {
    const route = read("app/api/cfb/ledger/route.ts");
    expect(route).not.toMatch(/pl:ledger:v1/);
    expect(route).not.toMatch(/pl:bank:v1/);
    expect(route).toMatch(/pl:cfb:ledger:v1/);
    expect(route).toMatch(/pl:cfb:bank:v1/);
  });
});
