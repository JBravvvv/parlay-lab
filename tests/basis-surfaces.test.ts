import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FROZEN_NOW, TODAY, fixtureFetchJson } from "./helpers/fixture-env";
import { createEngine, type BoardData, type PickRow } from "@/engine";
import { basisPick } from "@/engine2/sharpBoard";

/* Board + Sharp priced at the DK/FD basis (2026-07-20): the Board table and The
   Sharp's plays present the exact numbers the Builder's allocator selects on —
   EV/Kelly/badges at the basis. The engine emits bsKellyF + bsBadge additively
   (parity digest is field-selective, so the baseline is untouched), and the
   Sharp page's dk_fd play selection replicates the allocator's discipline:
   basis + CZ required, core EV gate at the basis, ranked by basis EV. */

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => vi.useRealTimers());

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const amToDec = (am: number) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);

let d: BoardData;
let allRows: PickRow[];
beforeAll(async () => {
  const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage: memoryStorage() });
  eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
  d = eng.analyze(await eng.collectSlate()) as BoardData;
  allRows = Object.entries(d.categories)
    .filter(([k]) => k !== "all")
    .flatMap(([, v]) => v);
});

describe("engine rows: Kelly + edge badge at the basis", () => {
  it("emits bsKellyF for every basis-quoted row — quarter-Kelly at the basis price, capped at 2%", () => {
    const withBasis = allRows.filter((r) => r.bs != null);
    expect(withBasis.length).toBeGreaterThan(0);
    for (const r of withBasis) {
      expect(r.bsKellyF).not.toBeNull();
      const f = Number(r.bsKellyF);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(0.02);
      // recompute from the row's own (rounded) prob — must match within rounding slack
      const p = Number(r.prob) / 100;
      const dec = amToDec(Number(r.bs));
      const kelly = Math.max(0, (p * dec - 1) / (dec - 1));
      const expected = Math.min(0.25 * kelly, 0.02);
      expect(Math.abs(f - expected)).toBeLessThan(0.003);
    }
  });

  it("no basis quote → no basis Kelly, no basis badge (never fabricated)", () => {
    for (const r of allRows.filter((x) => x.bs == null)) {
      expect(r.bsKellyF ?? null).toBeNull();
      expect(r.bsBadge ?? false).toBe(false);
    }
  });

  it("bsBadge only fires alongside a real positive basis EV", () => {
    for (const r of allRows.filter((x) => x.bsBadge)) {
      expect(r.bs).not.toBeNull();
      expect(Number(r.bsEv)).toBeGreaterThan(0);
    }
  });
});

describe("The Sharp's dk_fd play selection (page logic, replicated)", () => {
  // mirror of app/sharp/page.tsx: basis required, gate at the basis, CZ to be playable
  function sharpPlays(board: BoardData, gatePct: number) {
    const seen = new Set<string>();
    const rows = Object.entries(board.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([, v]) => v)
      .filter((r) => {
        const k = `${r.label}|${r.sub}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const gated = rows
      .filter((r) => r.bs != null && Number(r.bsEv) >= gatePct)
      .sort((a, b) => Number(b.bsEv) - Number(a.bsEv));
    return {
      plays: gated.filter((r) => r.cz != null).slice(0, 8),
      notOffered: gated.filter((r) => r.cz == null).slice(0, 8),
    };
  }

  it("every play carries BOTH a basis and a CZ quote and clears the gate at the basis", () => {
    const { plays } = sharpPlays(d, 2);
    for (const r of plays) {
      expect(r.bs).not.toBeNull();
      expect(r.cz).not.toBeNull();
      expect(Number(r.bsEv)).toBeGreaterThanOrEqual(2);
    }
  });

  it("plays are ranked by EV at the basis, descending", () => {
    const { plays } = sharpPlays(d, 2);
    for (let i = 1; i < plays.length; i++) {
      expect(Number(plays[i - 1].bsEv)).toBeGreaterThanOrEqual(Number(plays[i].bsEv));
    }
  });

  it("gate-clearing picks without a CZ quote are disclosed, never promoted into plays", () => {
    const { plays, notOffered } = sharpPlays(d, 2);
    const playKeys = new Set(plays.map((r) => `${r.label}|${r.sub}`));
    for (const r of notOffered) {
      expect(r.cz ?? null).toBeNull();
      expect(playKeys.has(`${r.label}|${r.sub}`)).toBe(false);
    }
  });
});

describe("HR parlays in dk_fd: '1+ HR' milestone IS Over 0.5", () => {
  /* Reproduces the live gap: DK/FD list home runs only as the milestone ladder
     ("1+ HR"), not the standard O/U market — so HR rows had no basis and dk_fd's
     parlay builder (basis-priced universe only) generated ZERO HR parlays. The
     fix maps integer milestone points to the standard half-line (1 → 0.5) and
     lets DK/FD alternates fill the basis (standard quote still wins per book). */
  function dkAltFetch(url: string) {
    return fixtureFetchJson(url).then((r) => {
      if (!/\/events\/[a-f0-9]+\/odds/.test(url)) return r;
      const body = JSON.parse(JSON.stringify(r.body)) as {
        bookmakers?: { key: string; markets: { key: string; outcomes: { name: string; description?: string; point?: number; price: number }[] }[] }[];
      };
      const wh = body.bookmakers?.find((b) => b.key === "williamhill_us");
      const hr = wh?.markets.find((m) => m.key === "batter_home_runs");
      if (!hr) return { ok: r.ok, body };
      body.bookmakers!.push({
        key: "draftkings",
        markets: [
          {
            key: "batter_home_runs_alternate",
            // "1+ HR" milestone: integer point, over-side only, slightly better price
            outcomes: hr.outcomes
              .filter((o) => o.name === "Over" && o.point === 0.5)
              .map((o) => ({ name: "Over", description: o.description, point: 1, price: o.price + 10 })),
          },
        ],
      });
      return { ok: r.ok, body };
    });
  }

  it("HR rows gain a DK basis from the milestone ladder and HR parlays generate (longshot tickets included)", async () => {
    const eng = createEngine({ fetchJson: dkAltFetch, today: TODAY, storage: memoryStorage() });
    eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
    const board = eng.analyze(await eng.collectSlate()) as BoardData;

    const hrRows = board.categories.batter_home_runs ?? [];
    const withBasis = hrRows.filter((r) => r.bs != null);
    expect(withBasis.length).toBeGreaterThan(0);
    for (const r of withBasis) expect(r.bsBook).toBe("DK");

    const hrParlays = board.parlays.filter((t) => t.type === "batter_home_runs");
    expect(hrParlays.length).toBeGreaterThan(0);
    // every generated HR ticket is basis-priced (selection rule) and HR-pure (isolation rule)
    for (const t of hrParlays) {
      expect(t.bsDec).not.toBeNull();
      for (const l of t.legs) expect(l.bs).not.toBeNull();
    }
    // the point of the exercise: HR tickets reach the LONGSHOT tier
    expect(hrParlays.some((t) => (t as { tier?: string }).tier === "LONGSHOT")).toBe(true);
  });

  it("without a DK/FD quote in any form, dk_fd still generates no HR parlays (never fabricated)", async () => {
    const eng = createEngine({ fetchJson: fixtureFetchJson, today: TODAY, storage: memoryStorage() });
    eng.get<Record<string, unknown>>("SH_CFG").selMode = "dk_fd";
    const board = eng.analyze(await eng.collectSlate()) as BoardData;
    expect(board.parlays.filter((t) => t.type === "batter_home_runs").length).toBe(0);
  });
});

describe("sharp desk basisPick (DK/FD pair shop)", () => {
  it("better payout wins the pair", () => {
    expect(basisPick(-115, -105)).toEqual({ am: -105, bk: "FD" });
    expect(basisPick(120, 110)).toEqual({ am: 120, bk: "DK" });
  });
  it("exact tie goes to DK", () => {
    expect(basisPick(-110, -110)).toEqual({ am: -110, bk: "DK" });
  });
  it("one-sided pair takes the only quote; empty pair is null (never fabricated)", () => {
    expect(basisPick(null, -120)).toEqual({ am: -120, bk: "FD" });
    expect(basisPick(-120, null)).toEqual({ am: -120, bk: "DK" });
    expect(basisPick(null, null)).toBeNull();
  });
});
