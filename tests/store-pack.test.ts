import { afterEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { BIG_VALUE, GZ, PACK_WRITES, packValue, redis, unpackValue } from "@/lib/server/store";

/**
 * UPSTASH BANDWIDTH (2026-10-12, Josh: "its saying its almost out of bandwidth ... Need to fix it"). The store
 * wrapper gzips big JSON values on SET and unpacks them on GET/MGET; callers only ever see plain JSON. Values
 * written before (no marker) and values their owner already packed (plain base64) pass through untouched.
 * Fetch is a stand-in; no store is reached, made-up URL and token only.
 */

const big = JSON.stringify({ ledger: Array.from({ length: 200 }, (_, i) => ({ date: `2026-09-${i % 30}`, core: [{ id: `t${i}`, stake: 10 }] })) });
const packed = GZ + gzipSync(Buffer.from(big, "utf8")).toString("base64");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubStore(result: unknown) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://store.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token-never-logged");
  const calls: unknown[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ result }), { status: 200 });
  }));
  return calls;
}

describe("store packing", () => {
  it("reads a packed value back as the exact JSON, on GET and on MGET", async () => {
    expect(unpackValue(packed)).toBe(big);
    stubStore(packed);
    expect(await redis(["GET", "pl:ledger:v1"])).toBe(big);
    stubStore([packed, null, "plain", big]);
    expect(await redis(["MGET", "a", "b", "c", "d"])).toEqual([big, null, "plain", big]);
  });

  it("leaves unmarked, small, non-JSON and already-packed values alone", () => {
    expect(unpackValue(big)).toBe(big);
    expect(packValue("x".repeat(BIG_VALUE + 10))).toBe("x".repeat(BIG_VALUE + 10)); // base64 / not JSON
    expect(packValue('{"a":1}')).toBe('{"a":1}'); // small
    expect(packValue(42)).toBe(42);
  });

  it(PACK_WRITES ? "packs a big JSON value on SET, keeping the SET options" : "step one: writes stay plain until packing is switched on", async () => {
    const calls = stubStore("OK");
    await redis(["SET", "pl:ledger:v1", big, "EX", 60]);
    const [op, key, value, ...rest] = calls[0] as [string, string, string, ...unknown[]];
    expect([op, key, rest]).toEqual(["SET", "pl:ledger:v1", ["EX", 60]]);
    if (PACK_WRITES) {
      expect(value.startsWith(GZ)).toBe(true);
      expect(value.length).toBeLessThan(big.length / 4);
      expect(unpackValue(value)).toBe(big);
    } else {
      expect(value).toBe(big);
    }
  });
});
