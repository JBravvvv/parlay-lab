import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";
import { CFB_DESK } from "@/lib/cfb/desk";
import { NFL_DESK } from "@/lib/nfl/desk";
import { NFL_LEAGUE, NFL_PROPS, NFL_ROUTES } from "@/lib/nfl/rules";
import { readCfbLedger, useCfbLedger } from "@/lib/cfb/store";
import { cfbQueryKey, loadCfbSlate } from "@/lib/cfb/client";
import { syncCfbNow } from "@/lib/cfb/sync";
import { useCfbDesk } from "@/lib/cfb/useCfbDesk";
import { NFL_STORE, readNflLedger } from "@/lib/nfl/store";
import { NFL_SYNC_ENDPOINT, syncNflNow, useNflSyncState } from "@/lib/nfl/sync";
import { nflQueryKey } from "@/lib/nfl/client";
import { makeClient } from "@/lib/football/client";
import { makeSync } from "@/lib/football/sync";

/**
 * NFL_DESK — the NFL DeskHandles a shared football surface reads through `useLeague()`
 * (2026-09-08). Pins that the handles are the NFL's own (keys, events, routes, query prefix)
 * and that the CFB handles are still, by identity, today's named exports — so a surface under
 * no provider keeps reading exactly what it read before the NFL existed.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("NFL_DESK — identity and config", () => {
  it("is the NFL league config plus handles", () => {
    expect(NFL_DESK.id).toBe("nfl");
    expect(NFL_DESK.idPrefix).toBe("nfl");
    expect(NFL_DESK.queryPrefix).toBe("nfl");
    expect(NFL_DESK.paper).toBe(NFL_LEAGUE.paper);
    expect(NFL_DESK.paper.daily).toBe(350);
    expect(NFL_DESK.bankBase).toBe(2500);
    expect(NFL_DESK.keys).toEqual({ ledger: "pl_nfl_ledger", bank: "pl_nfl_bank2" });
    expect(NFL_DESK.routes).toEqual({ slate: "/api/nfl", ledger: "/api/nfl/ledger", lock: "/api/nfl/lock", props: "/api/nfl/props" });
  });

  it("client: query keys carry the nfl prefix and the props window is NFL_PROPS.revalidateSec", () => {
    expect(NFL_DESK.client.queryKey("2026-09-13", 2500)).toEqual(["nfl", "slate", "2026-09-13", 2500]);
    expect(NFL_DESK.client.queryKey(undefined, 2500)).toEqual(["nfl", "slate", "today", 2500]);
    expect(NFL_DESK.client.propsQueryKey("2026-09-13", 2500)).toEqual(["nfl", "props", "2026-09-13", 2500]);
    expect(NFL_DESK.client.propsQueryKey(null, 2500)[0]).toBe("nfl");
    expect(NFL_DESK.client.STALE_MS).toBe(240_000);
    expect(NFL_DESK.client.PROPS_STALE_MS).toBe(NFL_PROPS.revalidateSec * 1000);
    expect(NFL_DESK.client.PROPS_STALE_MS).toBe(7200 * 1000);
    expect(NFL_DESK.client.queryKey).toBe(nflQueryKey);
    /* the two desks' key builders never collide on their first segment */
    expect(NFL_DESK.client.queryKey("2026-09-13", 2500)[0]).not.toBe(CFB_DESK.client.queryKey("2026-09-13", 2500)[0]);
    expect(NFL_DESK.client.cacheLabel({ ttlSec: 7200 })).toBe("2 h");
    expect(NFL_DESK.client.cacheLabel({ ttlSec: 600 })).toBe("10 min");
  });

  it("store: the NFL events are the literals and the handles are the NFL store's own", () => {
    expect(NFL_DESK.store.CHANGE_EVENT).toBe("pl:nfl-ledger-change");
    expect(NFL_DESK.store.SYNC_EVENT).toBe("pl:nfl-ledger-sync");
    expect(NFL_DESK.store.readLedger).toBe(readNflLedger);
    expect(NFL_DESK.store.readLedger).toBe(NFL_STORE.readLedger);
    expect(NFL_DESK.store.useLedger).toBe(NFL_STORE.useLedger);
    expect(NFL_DESK.store.lock).toBe(NFL_STORE.lock);
    expect(NFL_DESK.store.getBankroll).toBe(NFL_STORE.getBankroll);
    expect(NFL_DESK.store.readLedger).not.toBe(CFB_DESK.store.readLedger);
  });

  it("sync: the loop talks to /api/nfl/ledger — makeSync used NFL_ROUTES.ledger", () => {
    expect(NFL_DESK.routes.ledger).toBe("/api/nfl/ledger");
    expect(NFL_ROUTES.ledger).toBe("/api/nfl/ledger");
    expect(NFL_SYNC_ENDPOINT).toBe("/api/nfl/ledger");
    expect(NFL_DESK.sync.syncNow).toBe(syncNflNow);
    expect(NFL_DESK.sync.useSyncState).toBe(useNflSyncState);
    expect(NFL_DESK.sync.syncNow).not.toBe(syncCfbNow);
    /* the factory exposes the endpoint it was built with, for any desk */
    const probe = makeSync({ ...NFL_LEAGUE, routes: { ...NFL_ROUTES, ledger: "/api/probe/ledger" }, store: NFL_STORE });
    expect(probe.ENDPOINT).toBe("/api/probe/ledger");
    expect(probe.syncNow).not.toBe(syncNflNow);
  });

  it("the NFL sync module is built through the shared factory and never names a CFB route", () => {
    const sync = stripComments(read("src/lib/nfl/sync.ts"));
    expect(sync).toMatch(/makeSync\(\{ \.\.\.NFL_LEAGUE, store: NFL_STORE \}\)/);
    expect(sync).not.toMatch(/\/api\/cfb/);
    expect(sync).not.toMatch(/\/api\/ledger"/);
    const factory = stripComments(read("src/lib/football/sync.ts"));
    expect(factory).toMatch(/const ENDPOINT = cfg\.routes\.ledger;/);
    expect(factory).toMatch(/fetch\(ENDPOINT, \{ headers, cache: "no-store" \}\)/);
    expect(factory).toMatch(/method: "PUT"/);
    expect(factory).toMatch(/x-pl-sync/);
    expect(factory).toMatch(/getSyncKey\(/);
    expect(factory).toMatch(/mergeLedgers\(/);
    expect(factory).toMatch(/mergeBankStores\(/);
    expect(factory).toMatch(/visibilitychange/);
    expect(factory).not.toMatch(/\/api\//); // no route literal in the shared loop
    expect(factory).not.toMatch(/console\.(log|info|warn|error)/);
  });

  it("makeClient builds routes off cfg — a probe prefix reaches the key, never a hardcoded desk", () => {
    const c = makeClient({ ...NFL_LEAGUE, queryPrefix: "cfb" });
    expect(c.queryKey("2026-09-13", 1)).toEqual(["cfb", "slate", "2026-09-13", 1]);
    const client = stripComments(read("src/lib/football/client.ts"));
    expect(client).not.toMatch(/\/api\/(cfb|nfl)/);
    expect(client).toMatch(/"pl_quota"/); // the ONE shared quota pool
    expect(client).toMatch(/"pl_quota_at"/);
    expect(client).toMatch(/mode: "finals"/);
  });
});

describe("CFB_DESK — still today's named exports, by identity", () => {
  it("query keys keep the cfb prefix and the handles are the same functions the surfaces import", () => {
    expect(CFB_DESK.id).toBe("cfb");
    expect(CFB_DESK.client.queryKey("2026-09-13", 2500)).toEqual(["cfb", "slate", "2026-09-13", 2500]);
    expect(CFB_DESK.client.queryKey).toBe(cfbQueryKey);
    expect(CFB_DESK.client.loadSlate).toBe(loadCfbSlate);
    expect(CFB_DESK.store.readLedger).toBe(readCfbLedger);
    expect(CFB_DESK.store.useLedger).toBe(useCfbLedger);
    expect(CFB_DESK.store.CHANGE_EVENT).toBe("pl:cfb-ledger-change");
    expect(CFB_DESK.sync.syncNow).toBe(syncCfbNow);
    expect(CFB_DESK.useDesk).toBe(useCfbDesk);
    expect(CFB_DESK.useDesk).not.toBe(NFL_DESK.useDesk);
    expect(CFB_DESK.useBankroll).not.toBe(NFL_DESK.useBankroll);
  });

  it("the CFB store instance is bound through CFB_KEYS and re-exports every name it did", () => {
    const store = read("src/lib/cfb/store.ts");
    expect(store).toMatch(/makeDeviceStore\(\{ \.\.\.CFB_LEAGUE, keys: \{ ledger: CFB_KEYS\.ledger, bank: CFB_KEYS\.bank \} \}\)/);
    for (const name of [
      "readCfbRaw",
      "isCfbEntry",
      "cfbEntriesOf",
      "readCfbLedger",
      "writeCfbLedger",
      "findCfbEntry",
      "upsertCfbEntries",
      "upsertCfbEntry",
      "applyCfbGrading",
      "readCfbBankStore",
      "writeCfbBankStore",
      "getCfbBankStore",
      "addCfbBankAdjustment",
      "getCfbBankroll",
      "cfbExposure",
      "exportCfbLedger",
      "importCfbLedger",
      "wipeCfbDevice",
      "lockCfb",
      "gradeCfb",
      "useCfbLedger",
    ]) {
      expect(store, name).toMatch(new RegExp(`export const ${name} = S\\.`));
    }
    expect(store).toMatch(/export type \{ CfbGrading, CfbStats, CfbImportResult, CfbLedgerSnapshot \}/);
  });

  it("the shared factory names no desk in code", () => {
    const factory = stripComments(read("src/lib/football/store.ts"));
    expect(factory).not.toMatch(/"cfb"/);
    expect(factory).not.toMatch(/"nfl"/);
    expect(factory).not.toMatch(/pl_cfb|pl_nfl|pl:cfb|pl:nfl/);
    expect(factory).not.toMatch(/CFB_KEYS|NFL_KEYS|CFB_PAPER|NFL_PAPER|CFB_BANK_BASE|NFL_BANK_BASE/);
    expect(factory).toMatch(/lockCfbCard\(card, board, Date\.now\(\), cfg\)/);
    expect(factory).toMatch(/gradeCfbEntry\(entry, finals, Date\.now\(\), cfg\)/);
    expect(factory).toMatch(/e\.sport === cfg\.id/);
  });
});
