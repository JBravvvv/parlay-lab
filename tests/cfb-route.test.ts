import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import { CFB_REDIS } from "@/lib/cfb/rules";
import { CFB_STALE_MS, cfbQueryKey } from "@/lib/cfb/client";

/**
 * THE CFB ROUTES + CLIENT + SYNC (INSTRUCTION 38, 2026-09-05) — source-scan pins on the
 * comment-stripped files, so a comment about a rule can never satisfy the rule.
 *
 *   /api/cfb          — Pacific date basis (ptToday), force-dynamic, the three cache windows,
 *                       the server key by env reference only (never a literal after apiKey=),
 *                       an odds failure degrades to `oddsMissing` instead of a 500, no-store,
 *                       finals mode returns before the odds call.
 *   /api/cfb/ledger   — the same gate as the MLB route, the CFB blobs by their pinned literals,
 *                       validate → merge server-side (ledger + bank), 413 over MAX_BYTES,
 *                       every entry sport "cfb", and NONE of the MLB blobs or epoch machinery.
 *   client.ts         — talks to /api/cfb only, remembers the quota under pl_quota.
 *   sync.ts           — talks to /api/cfb/ledger only, reads the phrase through getSyncKey
 *                       and never stores it.
 */

const root = path.join(__dirname, "..");
const read = (p: string) => stripComments(fs.readFileSync(path.join(root, p), "utf8"));

describe("app/api/cfb/route.ts — the slate feed", () => {
  const src = read("app/api/cfb/route.ts");

  it("derives its date from the shared Pacific helper", () => {
    expect(src).toMatch(/ptToday\(/);
    expect(src).toMatch(/from "@\/lib\/server\/pt-date"/);
    expect(src).not.toMatch(/new Date\([^)]*\)\.toISOString\(\)\.slice\(0, ?10\)/);
    expect(src).not.toMatch(/timeZone: ?"America\/Los_Angeles"/);
  });

  it("is force-dynamic and never cached by the browser", () => {
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).toMatch(/"cache-control": "no-store"/);
  });

  it("uses the three cache windows: ESPN 60s, FPI 6h, odds 240s", () => {
    expect(src).toMatch(/revalidate: ESPN_TTL/);
    expect(src).toMatch(/const ESPN_TTL = 60\b/);
    expect(src).toMatch(/revalidate: FPI_TTL/);
    expect(src).toMatch(/const FPI_TTL = 21600\b/);
    expect(src).toMatch(/revalidate: ODDS_TTL/);
    expect(src).toMatch(/const ODDS_TTL = 240\b/);
  });

  it("injects the server key by env reference only — never a literal after apiKey=", () => {
    expect(src).toMatch(/process\.env\.ODDS_API_KEY/);
    expect(src).toMatch(/CFB_ODDS_URL/);
    expect(src).not.toMatch(/apiKey=[A-Za-z0-9]/);
    // the key is appended through a template expression, not concatenated from a string
    expect(src).toMatch(/apiKey=\$\{/);
  });

  it("an odds failure degrades to oddsMissing, never a 500", () => {
    expect(src).toMatch(/oddsMissing/);
    expect(src).toMatch(/missing: true/);
    expect(src).not.toMatch(/status: 500/);
  });

  it("forwards the quota as body and headers", () => {
    expect(src).toMatch(/x-requests-remaining/);
    expect(src).toMatch(/x-requests-used/);
    expect(src).toMatch(/quota/);
  });

  it("validates the date and mode, and defaults the bankroll to CFB_BANK_BASE", () => {
    expect(src).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
    expect(src).toMatch(/status: 400/);
    expect(src).toMatch(/mode === "finals"/);
    expect(src).toMatch(/CFB_BANK_BASE/);
  });

  it("finals mode returns before the odds call and builds through the pure model", () => {
    expect(src).toMatch(/buildCfbBoard\(/);
    const finalsBranch = src.indexOf('mode === "finals"');
    const oddsCall = src.lastIndexOf("oddsPayload()");
    expect(finalsBranch).toBeGreaterThan(0);
    expect(oddsCall).toBeGreaterThan(finalsBranch);
    // both ESPN dates are fetched (the US-Eastern bucketing rule)
    expect(src).toMatch(/nextDate\(date\)/);
  });
});

describe("app/api/cfb/ledger/route.ts — the CFB cloud record", () => {
  const src = read("app/api/cfb/ledger/route.ts");

  it("shares the MLB gate: config check then timing-safe phrase check", () => {
    expect(src).toMatch(/syncConfigMissing\(/);
    expect(src).toMatch(/syncAuthed\(/);
    expect(src).toMatch(/sync-not-configured/);
    expect(src).toMatch(/bad-sync-key/);
    expect(src).toMatch(/status: 503/);
    expect(src).toMatch(/status: 401/);
  });

  it("stores under the CFB blobs by their pinned literals (and they equal CFB_REDIS)", () => {
    expect(src).toMatch(/"pl:cfb:ledger:v1"/);
    expect(src).toMatch(/"pl:cfb:bank:v1"/);
    expect(CFB_REDIS.ledger).toBe("pl:cfb:ledger:v1");
    expect(CFB_REDIS.bank).toBe("pl:cfb:bank:v1");
  });

  it("never touches the MLB blobs or the epoch machinery", () => {
    expect(src).not.toMatch(/pl:ledger:v1/);
    expect(src).not.toMatch(/pl:bank:v1/);
    expect(src).not.toMatch(/pl:noplay/);
    expect(src).not.toMatch(/epoch/i);
  });

  it("validates, merges server-side, caps size, and requires sport cfb on every entry", () => {
    expect(src).toMatch(/validateLedger\(/);
    expect(src).toMatch(/validateBankStore\(/);
    expect(src).toMatch(/mergeLedgers\(/);
    expect(src).toMatch(/mergeBankStores\(/);
    expect(src).toMatch(/MAX_BYTES/);
    expect(src).toMatch(/status: 413/);
    expect(src).toMatch(/sport !== "cfb"/);
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });
});

describe("src/lib/cfb/client.ts — the browser side of the feed", () => {
  const src = read("src/lib/cfb/client.ts");

  it("talks to /api/cfb only and remembers the quota the way fetcher.ts does", () => {
    expect(src).toMatch(/\/api\/cfb/);
    expect(src).not.toMatch(/api\.the-odds-api\.com/);
    expect(src).toMatch(/"pl_quota"/);
    expect(src).toMatch(/"pl_quota_at"/);
    expect(src).toMatch(/mode: "finals"/);
  });

  it("stale window matches the route's odds cache and the key carries date + bankroll", () => {
    expect(CFB_STALE_MS).toBe(240_000);
    expect(cfbQueryKey("2026-09-05", 2500)).toEqual(["cfb", "slate", "2026-09-05", 2500]);
    expect(cfbQueryKey(undefined, 2500)).toEqual(["cfb", "slate", "today", 2500]);
  });
});

describe("src/lib/cfb/sync.ts — the CFB sync loop", () => {
  const src = read("src/lib/cfb/sync.ts");

  it("syncs against /api/cfb/ledger only", () => {
    expect(src).toMatch(/"\/api\/cfb\/ledger"/);
    expect(src).not.toMatch(/\/api\/ledger"/);
  });

  it("reads the phrase through ledgerSync's getSyncKey and never stores it anywhere new", () => {
    expect(src).toMatch(/getSyncKey\(/);
    expect(src).toMatch(/x-pl-sync/);
    expect(src).not.toMatch(/setItem\(\s*"pl_synckey"/);
    expect(src).not.toMatch(/console\.(log|info|warn|error)/);
  });

  it("merges with the shared kernels and pushes only on change", () => {
    expect(src).toMatch(/mergeLedgers\(/);
    expect(src).toMatch(/mergeBankStores\(/);
    expect(src).toMatch(/method: "PUT"/);
    expect(src).toMatch(/CFB_SYNC_EVENT/);
    expect(src).toMatch(/visibilitychange/);
    expect(src).toMatch(/"focus"/);
  });
});

describe("src/lib/cfb/store.ts — separation from the MLB device keys", () => {
  const src = read("src/lib/cfb/store.ts");
  it("stores under CFB_KEYS only", () => {
    expect(src).toMatch(/CFB_KEYS\.ledger/);
    expect(src).toMatch(/CFB_KEYS\.bank/);
    expect(src).not.toMatch(/"pl_ledger"/);
    expect(src).not.toMatch(/"pl_bank2"/);
    expect(src).not.toMatch(/"pl_noplay"/);
  });
});
