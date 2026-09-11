import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 50 (2026-09-11), Josh's item 1, verbatim:
 *   "Refresh button not working on 'Board' tab; works if I refresh on 'The Sharp' tab"
 *
 * FOUR causes were found in the wiring, and this file pins all four shut:
 *
 *   1. The INSTRUCTION 49 pill only fell back to a browser re-price when the server refused with
 *      ONE of two reasons (/no paper lock|every game started/). The refill pass is slot-gated and
 *      attempt-capped, so most taps were refused free under one of the other reasons and NOTHING
 *      re-priced. The fallback is now unconditional on any refusal.
 *   2. `refillDesk` resolves 401 / 502 / 503 as a mutation SUCCESS carrying no `fired` field at
 *      all (src/lib/refill-client.ts — it throws only when no sync phrase is stored), so a failing
 *      server also did nothing. The status is read explicitly now, and onError falls back too.
 *   3. The pill label watched `regen.isPending` only, so the control looked inert for the whole of
 *      a refill.
 *   4. THE REAL "works on The Sharp" CAUSE: the day's stamped picks — the rows every prop tab
 *      renders — were fetched once on mount with an empty dependency list. Navigating to The Sharp
 *      unmounted the page; coming back remounted and refetched. The refresh never did it, the
 *      navigation did. It is a TanStack query keyed ["picks"] now, invalidated by both refresh
 *      mutations.
 *
 * Source scans only (the repo has no DOM runtime): comment-stripped, so prose about a trap can
 * never be counted as the trap.
 */

const read = (p: string) => stripComments(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
const PAGE = "app/board/page.tsx";
const page = read(PAGE);
const refillClient = read("src/lib/refill-client.ts");
const useBoard = read("src/lib/useBoard.ts");

/** the pill's click handler — from the refill.mutate call to the end of the onClick block */
const handler = (() => {
  const i = page.indexOf('refill.mutate("mlb"');
  expect(i, "the MLB pill no longer calls refill.mutate").toBeGreaterThan(-1);
  return page.slice(i, page.indexOf("disabled={regen.isPending", i));
})();

const NARROW = /no paper lock\|every game started/;

describe("INSTRUCTION 50 item 1 — a tap always re-prices something", () => {
  it("the two-reason regex that gated the fallback is gone from the page", () => {
    expect(page).not.toMatch(NARROW);
  });

  it("PLANT: re-introducing the narrow two-reason gate is detected", () => {
    const reverted = handler.replace(
      "const refused = r.body.fired === false;",
      "const refused = r.body.fired === false && /no paper lock|every game started/.test(reason);",
    );
    expect(reverted, "the checker is blind to the narrow gate coming back").toMatch(NARROW);
    // and the real handler is genuinely different from the planted one
    expect(handler).not.toEqual(reverted);
  });

  it("any refusal falls back to the browser re-price", () => {
    expect(handler).toMatch(/const refused = r\.body\.fired === false;/);
    expect(handler).toMatch(/if \(refused \|\| httpFail\) regen\.mutate\(\);/);
  });

  it("a non-2xx answer falls back too — refillDesk resolves 401/502/503 as a success", () => {
    expect(handler).toMatch(/const httpFail = r\.status < 200 \|\| r\.status > 299;/);
    // the client really does resolve every HTTP status instead of throwing
    expect(refillClient).toMatch(/return \{ status: r\.status, body:/);
    expect(refillClient).toMatch(/if \(!key\) throw new Error\("sync phrase required"\);/);
  });

  it("a thrown mutation falls back too", () => {
    expect(handler).toMatch(/onError: \(\) => regen\.mutate\(\),/);
  });

  it("with no board or no sync phrase the pill still generates (the pre-49 path)", () => {
    expect(page).toMatch(/if \(!\(d && getSyncKey\(\)\)\) \{\s*regen\.mutate\(\);\s*return;\s*\}/);
  });

  it("no blocking cooldown was added — the spend counter is visibility, never a gate", () => {
    expect(page).not.toMatch(/cooldown/i);
    // the only thing that disables the pill is work already in flight
    expect(page).toMatch(/disabled=\{regen\.isPending \|\| refill\.isPending \|\| isPending\}/);
    const engine = read("src/lib/engine-client.ts");
    expect(engine).toMatch(/export const GEN_CREDITS_EST = 140;/);
  });
});

describe("INSTRUCTION 50 item 1 — the pill says what it is doing", () => {
  it("the label watches BOTH mutations", () => {
    expect(page).toMatch(/\{regen\.isPending \|\| refill\.isPending \? "Scanning slate…" : d \? "Refresh MLB" : "Generate board"\}/);
  });

  it("every tap prints a note — including a plain success and a plain re-price", () => {
    const note = page.slice(page.indexOf("const refreshNote ="), page.indexOf("/* CFB desk"));
    expect(note).toMatch(/refill\.isPending \|\| regen\.isPending/);
    expect(note).toMatch(/refill\.error/);
    expect(note).toMatch(/regen\.isError/);
    expect(note).toMatch(/regen\.isSuccess/);
    // the note element itself is no longer gated on a refill reason existing
    expect(page).toMatch(/\{sport === "mlb" && refreshNote && \(/);
    expect(page).not.toMatch(/\(\(refill\.data && refillReason\(refill\.data\.body\)\) \|\| refill\.error\)/);
  });

  /* The offline tap lands HERE: the refill fetch throws, onError fires regen.mutate(), and that
     fails too. Before the fix this branch said "re-priced in the browser instead" unconditionally —
     an action the app had not taken. A refresh may report what it did; it may never report what it
     wished it had done. */
  it("a refill failure that ALSO fails to re-price says so, inside the refill.error branch", () => {
    const note = page.slice(page.indexOf("const refreshNote ="), page.indexOf("/* CFB desk"));
    const err = note.slice(note.indexOf("refill.error"), note.indexOf("refill.data"));
    expect(err).toMatch(/regen\.isError/);
    expect(err).toContain("and the browser re-price also failed");
    expect(err).toContain("nothing was re-priced and nothing was fabricated");
    // the optimistic claim survives only under regen.isSuccess, never as the branch's default
    const claim = "re-priced in the browser instead";
    expect(err).toContain(claim);
    expect(err.slice(0, err.indexOf(claim))).toMatch(/regen\.isSuccess/);
    // and the still-running case promises nothing
    expect(err).toContain("re-pricing in the browser…");
  });

  it("PLANT: collapsing the double-failure branch back to the optimistic claim is detected", () => {
    const note = page.slice(page.indexOf("const refreshNote ="), page.indexOf("/* CFB desk"));
    const err = note.slice(note.indexOf("refill.error"), note.indexOf("refill.data"));
    const flat = err.split("and the browser re-price also failed").join("");
    expect(flat, "the checker cannot see the honest branch disappear").not.toContain(
      "and the browser re-price also failed",
    );
  });

  it("the note states the day's visible spend from the existing counters", () => {
    expect(page).toMatch(/const n = generatesToday\(\);/);
    expect(page).toMatch(/n \* GEN_CREDITS_EST/);
    expect(page).toMatch(/import \{ GEN_CREDITS_EST, generatesToday, getMoney, getSelectionMode, SIM_PATHS_TXT, type SelectionMode \} from "@\/lib\/engine-client";/);
  });
});

describe("INSTRUCTION 50 item 1 — the picks feed is a query, not a mount-only fetch", () => {
  it("the /api/picks read is a TanStack query keyed [\"picks\"], always stale", () => {
    expect(page).toMatch(/queryKey: \["picks"\],/);
    expect(page).toMatch(/staleTime: 0,/);
    expect(page).toMatch(/import \{ useQuery \} from "@tanstack\/react-query";/);
  });

  it("the nearest hook wrapping the /api/picks call is useQuery, not useEffect", () => {
    const i = page.indexOf('"/api/picks"');
    expect(i).toBeGreaterThan(-1);
    const before = page.slice(0, i);
    expect(
      before.lastIndexOf("useQuery"),
      "the picks fetch is still inside a useEffect — that is the mount-only bug",
    ).toBeGreaterThan(before.lastIndexOf("useEffect("));
    // and the old empty-dependency effect is gone from that neighbourhood
    expect(page.slice(Math.max(0, i - 900), i + 900)).not.toMatch(/\}, \[\]\);/);
  });

  it("the old setPicksData state is gone — one source of truth", () => {
    expect(page).not.toMatch(/setPicksData/);
    expect(page).toMatch(/const picksData = picksQuery\.data \?\? null;/);
  });

  it("both refresh mutations invalidate [\"picks\"] alongside the board", () => {
    expect(refillClient).toMatch(/void qc\.invalidateQueries\(\{ queryKey: \["board"\] \}\);/);
    expect(refillClient).toMatch(/void qc\.invalidateQueries\(\{ queryKey: \["picks"\] \}\);/);
    const regen = useBoard.slice(useBoard.indexOf("export function useRegenerateBoard"));
    expect(regen).toMatch(/qc\.setQueryData\(\["board"\], b\);/);
    expect(regen).toMatch(/void qc\.invalidateQueries\(\{ queryKey: \["picks"\] \}\);/);
  });

  it("PLANT: dropping the picks invalidation from either module is detected", () => {
    const stripped = refillClient.split('void qc.invalidateQueries({ queryKey: ["picks"] });').join("");
    expect(stripped, "the checker cannot see the picks invalidation disappear").not.toMatch(/queryKey: \["picks"\]/);
  });

  it("/api/picks is still a free read — no auth header, no credit spend, from the page", () => {
    expect(page).toMatch(/await fetch\("\/api\/picks", \{ cache: "no-store" \}\)/);
    const q = page.slice(page.indexOf("const picksQuery"), page.indexOf("const picksData ="));
    expect(q).not.toMatch(/x-pl-sync|x-cron-key|method: "POST"/);
  });
});
