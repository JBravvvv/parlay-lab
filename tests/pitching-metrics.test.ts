import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "@/engine";

/* Pitching-metrics upgrades (2026-07-20): FIP, ERA-vs-xERA luck fade, pitch-count
   efficiency, bullpen quality. Every factor is v2-gated (exactly 1 / null when
   SH_V2 is dormant — parity protection) and hard-capped. */

const stubFetch = () => Promise.resolve({ ok: false, body: {} });
function eng(): Engine {
  return createEngine({ fetchJson: stubFetch, today: "2026-07-20" });
}
function armed(): Engine {
  const e = eng();
  e.set("SH_V2", { sim: true });
  return e;
}
const P = (season: Record<string, unknown>) => ({ season, id: 7 });

describe("shFip — defense-independent pitching", () => {
  it("computes the textbook formula: (13·HR + 3·(BB+HBP) − 2·K)/IP + 3.10", () => {
    const f = eng().get<(p: unknown) => number | null>("shFip");
    // 180 IP, 20 HR, 50 BB, 5 HBP, 200 K → (260+165−400)/180 + 3.1
    expect(f(P({ ip: "180.0", hr: 20, bb: 50, hbp: 5, k: 200 }))).toBeCloseTo(25 / 180 + 3.1, 10);
  });
  it("refuses thin samples and missing components (never fabricated)", () => {
    const f = eng().get<(p: unknown) => number | null>("shFip");
    expect(f(P({ ip: "12.0", hr: 2, bb: 5, hbp: 0, k: 15 }))).toBeNull(); // <20 IP
    expect(f(P({ ip: "100.0", bb: 30, k: 90 }))).toBeNull(); // no HR data
    expect(f(null)).toBeNull();
  });
  it("missing HBP degrades to 0, not to a refusal (statsapi sometimes omits it)", () => {
    const f = eng().get<(p: unknown) => number | null>("shFip");
    expect(f(P({ ip: "100.0", hr: 10, bb: 30, k: 100 }))).toBeCloseTo((130 + 90 - 200) / 100 + 3.1, 10);
  });
});

describe("shEraLuck — fade the flattered, credit the unlucky", () => {
  const priors = (era: number, xera: number) => ({ pitchers: { 7: { era, xera } } });
  it("dormant (SH_V2 unset) → null, always", () => {
    const e = eng();
    e.set("SH_PRIORS", priors(2.5, 4.0));
    expect(e.get<(p: unknown) => unknown>("shEraLuck")(P({}))).toBeNull();
  });
  it("ERA ≥ 0.75 under xERA → fade factor >1 on opposing offense", () => {
    const e = armed();
    e.set("SH_PRIORS", priors(2.8, 3.9));
    const r = e.get<(p: unknown) => { f: number; tag: string } | null>("shEraLuck")(P({}));
    expect(r?.f).toBe(1.04);
    expect(r?.tag).toContain("era-luck");
  });
  it("ERA ≥ 0.75 over xERA → credit factor <1", () => {
    const e = armed();
    e.set("SH_PRIORS", priors(5.0, 3.8));
    expect(e.get<(p: unknown) => { f: number } | null>("shEraLuck")(P({}))?.f).toBe(0.96);
  });
  it("inside the honest band → no adjustment at all", () => {
    const e = armed();
    e.set("SH_PRIORS", priors(3.9, 3.6));
    expect(e.get<(p: unknown) => unknown>("shEraLuck")(P({}))).toBeNull();
  });
});

describe("shLaborF — pitch-count efficiency", () => {
  it("dormant → 1", () => {
    expect(eng().get<(p: unknown) => number>("shLaborF")(P({ np: 1000, gsn: 10 }))).toBe(1);
  });
  it("laboring (≥97 avg pitches/start) trims outs; efficient (≤84) extends", () => {
    const f = armed().get<(p: unknown) => number>("shLaborF");
    expect(f(P({ np: 990, gsn: 10 }))).toBe(0.96); // 99/start
    expect(f(P({ np: 800, gsn: 10 }))).toBe(1.02); // 80/start
    expect(f(P({ np: 900, gsn: 10 }))).toBe(1); // 90/start — normal
  });
  it("needs 3+ starts of real data", () => {
    expect(armed().get<(p: unknown) => number>("shLaborF")(P({ np: 200, gsn: 2 }))).toBe(1);
  });
});

describe("shPenQF — bullpen quality (rolling pen ERA vs league)", () => {
  const ctx = (era: number, ip: number, lgEra = 4.0) => ({
    pen_quality: { __league: { era: lgEra, whip: 1.3, ip: 900 }, "Boston Red Sox": { era, whip: 1.3, ip } },
  });
  it("dormant or no context → 1", () => {
    expect(eng().get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBe(1);
    expect(armed().get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBe(1);
  });
  it("leaky pen boosts opposing late offense; shutdown pen trims it (both capped)", () => {
    const e = armed();
    e.set("SH_CTX", ctx(6.0, 60));
    expect(e.get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBeCloseTo(1.06, 10); // capped
    e.set("SH_CTX", ctx(2.0, 60));
    expect(e.get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBeCloseTo(0.95, 10); // capped
    e.set("SH_CTX", ctx(4.4, 60));
    expect(e.get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBeCloseTo(1.012, 10);
  });
  it("refuses pens under 15 IP of sample and unknown teams", () => {
    const e = armed();
    e.set("SH_CTX", ctx(9.0, 10));
    expect(e.get<(t: string) => number>("shPenQF")("Boston Red Sox")).toBe(1);
    e.set("SH_CTX", ctx(9.0, 60));
    expect(e.get<(t: string) => number>("shPenQF")("Arizona Diamondbacks")).toBe(1);
  });
});
