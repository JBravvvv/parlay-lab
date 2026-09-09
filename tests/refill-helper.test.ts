import { describe, expect, it, vi } from "vitest";
import { decideSlotTick, GRADE_SLOT_WINDOW_MIN, manualHeadroomRefusal, REFILL_SLOTS_PT, slotsAheadPT, unstampedSlotsAhead } from "@/lib/server/grading-progress";
import { forwardMlbRefill } from "@/lib/server/refill";
import { refillReason } from "@/lib/refill-client";

/**
 * INSTRUCTION 49 (2026-09-09) — the shared slot helper and the MLB forward, pure.
 * Josh, verbatim: "It should be 8am, 9:30am, 12pm, 3pm & 4:45pm."
 */
const at = (iso: string) => Date.parse(iso);

describe("decideSlotTick — the window is [slot, slot + 15 min), Pacific, DST-correct", () => {
  it("window edges on 12:00 PT (19:00Z in September): start fires, +14:59 fires, +15:00 does not", () => {
    expect(GRADE_SLOT_WINDOW_MIN).toBe(15);
    expect(decideSlotTick(at("2026-09-05T19:00:00Z"))).toEqual({ fire: true, slot: "12:00" });
    expect(decideSlotTick(at("2026-09-05T19:14:59Z"))).toEqual({ fire: true, slot: "12:00" });
    expect(decideSlotTick(at("2026-09-05T19:15:00Z"))).toEqual({ fire: false, slot: null });
    expect(decideSlotTick(at("2026-09-05T18:59:59Z"))).toEqual({ fire: false, slot: null });
  });
  it("every slot start fires under PDT and names itself", () => {
    const pdt: Record<string, string> = { "08:00": "15:00", "09:30": "16:30", "12:00": "19:00", "15:00": "22:00", "16:45": "23:45" };
    for (const slot of REFILL_SLOTS_PT) {
      expect(decideSlotTick(at(`2026-09-05T${pdt[slot]}:00Z`)), slot).toEqual({ fire: true, slot });
    }
  });
  it("PST: 2026-11-05T00:47Z is 16:47 PT on the 4th — inside the 16:45 window", () => {
    expect(decideSlotTick(at("2026-11-05T00:47:00Z"))).toEqual({ fire: true, slot: "16:45" });
    expect(decideSlotTick(at("2026-11-05T01:00:00Z"))).toEqual({ fire: false, slot: null });
    expect(decideSlotTick(at("2026-11-05T16:00:00Z"))).toEqual({ fire: true, slot: "08:00" });
  });
  it("the vercel.json crons (21:45Z, 00:00Z) sit outside every window under both offsets", () => {
    for (const iso of ["2026-09-05T21:45:00Z", "2026-09-06T00:00:00Z", "2026-12-05T21:45:00Z", "2026-12-06T00:00:00Z"]) {
      expect(decideSlotTick(at(iso)), iso).toEqual({ fire: false, slot: null });
    }
  });
  it("custom slots and windows are honoured (the helper is generic)", () => {
    expect(decideSlotTick(at("2026-09-05T18:27:00Z"), ["11:20"], 10)).toEqual({ fire: true, slot: "11:20" });
    expect(decideSlotTick(at("2026-09-05T18:31:00Z"), ["11:20"], 10)).toEqual({ fire: false, slot: null });
  });
});

describe("forwardMlbRefill — the one MLB spending forward, slot-stamped and cron-keyed", () => {
  it("encodes the slot (12:00 → 12%3A00), sends x-cron-key, no-store, and reports status + body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, topup: true }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await forwardMlbRefill({ origin: "https://parlay.test", secret: "s", slot: "12:00", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL | string, RequestInit];
    expect(String(url)).toBe("https://parlay.test/api/generate?topup=1&slot=12%3A00");
    expect((init.headers as Record<string, string>)["x-cron-key"]).toBe("s");
    expect(init.cache).toBe("no-store");
    expect(r).toEqual({ generateStatus: 200, generate: { ok: true, topup: true } });
  });
  it("slot manual rides as slot=manual; a non-JSON answer is reported, not thrown", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const r = await forwardMlbRefill({ origin: "https://parlay.test", secret: "s", slot: "manual", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(String((fetchImpl.mock.calls[0] as unknown as unknown[])[0])).toBe("https://parlay.test/api/generate?topup=1&slot=manual");
    expect(r.generateStatus).toBe(503);
    expect(r.generate).toBeTruthy();
  });
});

describe("slotsAheadPT / unstampedSlotsAhead — the manual-headroom count (fix round 2026-09-09)", () => {
  it("names the slots still ahead, Pacific: 09:00 PT → four, 12:03 PT → two, 17:00 PT → none", () => {
    expect(slotsAheadPT(at("2026-09-05T16:00:00Z"))).toEqual(["09:30", "12:00", "15:00", "16:45"]);
    expect(slotsAheadPT(at("2026-09-05T19:03:00Z"))).toEqual(["15:00", "16:45"]);
    expect(slotsAheadPT(at("2026-09-06T00:00:00Z"))).toEqual([]);
    expect(slotsAheadPT(at("2026-09-05T23:45:00Z")), "a slot's own start minute is not ahead").toEqual([]);
  });
  it("a stamped slot is not counted; blanks and 'manual' stamps are ignored", () => {
    expect(unstampedSlotsAhead(at("2026-09-05T16:00:00Z"), ["09:30", undefined, "manual"])).toBe(3);
    expect(unstampedSlotsAhead(at("2026-09-05T16:00:00Z"), [])).toBe(4);
  });
  it("the refusal string pluralises", () => {
    expect(manualHeadroomRefusal(1, 1)).toBe("manual refill would spend a slot's attempt — 1 attempt left, 1 automatic slot still ahead today");
    expect(manualHeadroomRefusal(4, 4)).toBe("manual refill would spend a slot's attempt — 4 attempts left, 4 automatic slots still ahead today");
  });
});

describe("refillReason — every click prints one line (fix round 2026-09-09)", () => {
  it("MLB: topup.reason first; else the generate body's skipped / error / lock tickets", () => {
    expect(refillReason({ topup: { reason: "top-up cap spent (6/6)" } })).toBe("top-up cap spent (6/6)");
    expect(refillReason({ topup: { fire: true, reason: "day short $90" }, generate: { skipped: "topup-claimed" } })).toBe("day short $90");
    expect(refillReason({ generate: { skipped: "ran recently" } })).toBe("generate skipped: ran recently");
    expect(refillReason({ generate: { error: "run cap reached for this date" } })).toBe("generate error: run cap reached for this date");
    expect(refillReason({ generate: { ok: true, lock: { tickets: 3 } } })).toBe("refilled — the card now holds 3 tickets");
  });
  it("football: result.topUp.reason; else the not-yet-locked shapes; else result.error", () => {
    expect(refillReason({ result: { status: "already-locked", topUp: { action: "skipped", reason: "not a refill slot" } } })).toBe("not a refill slot");
    expect(refillReason({ result: { status: "waiting", locksAt: "2026-09-05T16:00:00.000Z" } })).toBe("waiting — locks at 2026-09-05T16:00:00.000Z");
    expect(refillReason({ result: { status: "waiting", note: "first kickoff 17:00Z" } })).toBe("waiting — locks at the 60-min lead (first kickoff 17:00Z)");
    expect(refillReason({ result: { status: "locked", date: "2026-09-05", tickets: 4 } })).toBe("locked 2026-09-05 — 4 tickets");
    expect(refillReason({ result: { status: "no-slate", note: "ESPN lists no games" } })).toBe("ESPN lists no games");
    expect(refillReason({ result: { status: "odds-missing" } })).toBe("odds-missing");
    expect(refillReason({ result: { error: "espn unavailable: 503" } })).toBe("espn unavailable: 503");
  });
  it("a bare error body prints its error; an empty body prints nothing", () => {
    expect(refillReason({ ok: false, error: "sync phrase required" })).toBe("sync phrase required");
    expect(refillReason({})).toBeNull();
  });
});
