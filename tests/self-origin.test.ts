import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUCTION_HOST, selfOrigin } from "@/lib/server/self-origin";

/**
 * THE 302 OUTAGE (2026-11-14). Vercel's cron reaches the scheduler on the deployment hostname, which
 * is behind Vercel's login page; every forward the scheduler made to its own routes was answered 302
 * and nothing ran. In production a self-call goes to the production domain.
 */
const DEPLOY = "https://parlay-rjw0a9nbh-jbravvvvs-projects.vercel.app";

describe("where the app calls itself", () => {
  it("in production: the one measured production host, whatever host the request came in on and whatever the platform says", () => {
    expect(PRODUCTION_HOST).toBe("parlay-lab-six.vercel.app");
    expect(selfOrigin(DEPLOY, { VERCEL_ENV: "production" })).toBe("https://parlay-lab-six.vercel.app");
    expect(selfOrigin("https://parlay-lab-six.vercel.app", { VERCEL_ENV: "production" })).toBe("https://parlay-lab-six.vercel.app");
    const other = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "parlay-other-alias.vercel.app" };
    expect(selfOrigin(DEPLOY, other)).toBe("https://parlay-lab-six.vercel.app");
    expect(readFileSync("src/lib/server/self-origin.ts", "utf8")).not.toContain("env.VERCEL_PROJECT_PRODUCTION_URL");
  });

  it("anywhere else (local, tests, a preview): the request's own origin, untouched", () => {
    for (const env of [undefined, "", "preview", "development", "PRODUCTION"]) {
      expect(selfOrigin("http://localhost:3000", { VERCEL_ENV: env }), String(env)).toBe("http://localhost:3000");
    }
    expect(selfOrigin(DEPLOY, {})).toBe(DEPLOY);
  });

  it("every forwarder sends its call to selfOrigin(origin), never to the origin it was handed", () => {
    const want: [string, string][] = [
      ["src/lib/server/anytime-forward.ts", 'new URL("/api/anytime/run", selfOrigin(origin))'],
      ["src/lib/server/cfb-lock-forward.ts", 'new URL("/api/cfb/lock", selfOrigin(origin))'],
      ["src/lib/server/nfl-lock-forward.ts", 'new URL("/api/nfl/lock", selfOrigin(origin))'],
      ["app/api/scheduler/route.ts", 'new URL("/api/calibrate?grade=only", selfOrigin(origin))'],
      ["app/api/scheduler/route.ts", "`, selfOrigin(req.nextUrl.origin)), {"],
    ];
    for (const [f, text] of want) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain(text);
      expect(src, f).toContain('import { selfOrigin } from "@/lib/server/self-origin";');
    }
    const route = readFileSync("app/api/refill/route.ts", "utf8");
    expect(route.split("selfOrigin(req.nextUrl.origin)").length - 1).toBe(2);
    expect(route.split("req.nextUrl.origin").length - 1).toBe(2);
    for (const f of ["src/lib/server/anytime-forward.ts", "src/lib/server/cfb-lock-forward.ts", "src/lib/server/nfl-lock-forward.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/new URL\([^)]*, origin\)/);
    }
  });

  it("a forward made in production lands on the production domain even when handed the deployment host", async () => {
    const { forwardAnytimeRun } = await import("@/lib/server/anytime-forward");
    const saved = { e: process.env.VERCEL_ENV, u: process.env.VERCEL_PROJECT_PRODUCTION_URL };
    const seen: string[] = [];
    const f = async (u: URL) => {
      seen.push(String(u));
      return new Response("{}", { status: 200 });
    };
    try {
      process.env.VERCEL_ENV = "production";
      await forwardAnytimeRun(DEPLOY, "test-key-never-logged", f);
      delete process.env.VERCEL_ENV;
      await forwardAnytimeRun(DEPLOY, "test-key-never-logged", f);
    } finally {
      if (saved.e === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = saved.e;
      if (saved.u === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      else process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.u;
    }
    expect(seen).toEqual(["https://parlay-lab-six.vercel.app/api/anytime/run", DEPLOY + "/api/anytime/run"]);
  });

  it("the Sunday NFL pokes start an engine run: only a sunday poke, only when authorised, and the answer is the lock's own", () => {
    const src = readFileSync("app/api/nfl/lock/route.ts", "utf8");
    expect(src).toContain('const sunday = (req.nextUrl.searchParams.get("poke") ?? "").startsWith("sunday-");');
    expect(src).toContain("const anytime = sunday && !!process.env.CRON_SECRET && cronHeaderAuthed(req) ? forwardAnytimeRun(req.nextUrl.origin, process.env.CRON_SECRET) : null;");
    expect(src).toContain("const res = await lockGet(req);");
    expect(src).toContain("if (anytime) {\n    const any = await anytime;");
    expect(src.trimEnd().endsWith("  return res;\n}")).toBe(true);
    expect(src.split("forwardAnytimeRun(").length - 1).toBe(1);
    expect(src.split("export async function GET(").length - 1).toBe(1);
    expect(src.indexOf("async function lockGet(req: NextRequest) {")).toBeLessThan(src.indexOf("export async function GET("));
    expect(readFileSync("src/lib/server/nfl-lock-forward.ts", "utf8")).not.toContain("sunday");
    expect(readFileSync("vercel.json", "utf8")).toContain("/api/nfl/lock?poke=sunday-early");
    expect(readFileSync("vercel.json", "utf8")).toContain("/api/nfl/lock?poke=sunday-standard");
  });
});
