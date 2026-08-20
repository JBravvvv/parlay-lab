import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cronHeaderAuthed } from "@/lib/server/store";

/**
 * VERCEL CRON POKES (2026-08-20, after two watched evenings of darkness).
 *
 * 08-19 (watched live 23:47–00:20Z): zero pokes, block C's $100 never fired, day
 * closed $49. 08-20: same shape — $101 deployed by daytime fires, the evening
 * block's $49 stranded, no poke after ~21Z. The external cron-job.org pokes do not
 * cover the evening, and "$150 every single day no matter what" (Josh, twice) dies
 * on a poke that never comes.
 *
 * The fix is platform-side: vercel.json schedules evening /api/scheduler pokes and
 * Vercel invokes cron paths with `Authorization: Bearer <CRON_SECRET>` (the platform
 * injects the env value — the secret never appears in the repo). cronHeaderAuthed
 * accepts that spelling beside x-cron-key: same secret, same timing-safe compare,
 * a second spelling, not a second key. The scheduler poke is idempotent and
 * self-deciding, so redundant pokes from two sources are safe by design.
 */

const OLD = process.env.CRON_SECRET;
afterEach(() => {
  if (OLD == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = OLD;
});

const req = (headers: Record<string, string>) => ({
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
});

describe("cronHeaderAuthed — both spellings, one secret, fails closed", () => {
  it("accepts x-cron-key (the cron-job.org spelling) and Bearer (the Vercel Cron spelling)", () => {
    process.env.CRON_SECRET = "s3cret-for-test";
    expect(cronHeaderAuthed(req({ "x-cron-key": "s3cret-for-test" }))).toBe(true);
    expect(cronHeaderAuthed(req({ authorization: "Bearer s3cret-for-test" }))).toBe(true);
  });
  it("rejects a wrong value in either spelling, and a bare token without the Bearer scheme", () => {
    process.env.CRON_SECRET = "s3cret-for-test";
    expect(cronHeaderAuthed(req({ "x-cron-key": "wrong" }))).toBe(false);
    expect(cronHeaderAuthed(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(cronHeaderAuthed(req({ authorization: "s3cret-for-test" }))).toBe(false);
    expect(cronHeaderAuthed(req({}))).toBe(false);
  });
  it("FAILS CLOSED with the env unset — no header can open the path", () => {
    delete process.env.CRON_SECRET;
    expect(cronHeaderAuthed(req({ "x-cron-key": "anything" }))).toBe(false);
    expect(cronHeaderAuthed(req({ authorization: "Bearer anything" }))).toBe(false);
  });
});

describe("vercel.json — the evening pokes exist and stay inside the Hobby plan", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    git?: { deploymentEnabled?: Record<string, boolean> };
    crons?: { path: string; schedule: string }[];
  };
  it("schedules /api/scheduler pokes covering the dark evening (one ~21:45Z, one ~00:00Z)", () => {
    const crons = cfg.crons ?? [];
    expect(crons.length, "the evening pokes vanished from vercel.json").toBeGreaterThanOrEqual(2);
    expect(crons.every((c) => c.path === "/api/scheduler"), "a cron points somewhere other than the self-deciding scheduler").toBe(true);
    const hours = crons.map((c) => Number(c.schedule.split(" ")[1]));
    expect(hours.some((h) => h >= 20 || h <= 1), "no cron lands in the evening gap the two watched days exposed").toBe(true);
  });
  it("the Hobby plan cap is respected (2 cron jobs) and the git deploy config survived", () => {
    expect((cfg.crons ?? []).length).toBeLessThanOrEqual(2);
    expect(cfg.git?.deploymentEnabled?.main).toBe(false);
    expect(cfg.git?.deploymentEnabled?.["line-history"]).toBe(false);
  });
});
