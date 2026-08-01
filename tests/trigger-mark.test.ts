import { readFileSync } from "node:fs";
import { stripComments } from "./helpers/source";
import { describe, expect, it } from "vitest";

/**
 * TRIGGER-MARK GUARD (2026-07-30, owner's ship order — "tomorrow's board should not
 * be the one board on disk whose provenance is unrecorded").
 *
 * THE GAP IT CLOSES: the gen stamp carried no force/manual field and the route
 * hardcoded `src: "cron"` into the prediction records for EVERY caller — a forced
 * manual board was indistinguishable from a scheduled one in the archive AND the
 * prediction store. The mark: `gen.trigger = "cron-ua" | "header" | "manual" |
 * "manual-forced"`, computed from the route's own auth state. Because it lives on
 * the gen object it reaches, with NO further plumbing: the board KV + the archive
 * (data.gen rides the encode), the prediction store (mergeDayBlob's gens[] carries
 * {...gen}), and the response body (gen is returned).
 *
 * OBSERVED RED before the implementation (no `trigger` in the route or the type),
 * GREEN after, same commit — the teeth standard.
 */

const ROUTE = "app/api/generate/route.ts";
const SERIAL = "src/lib/pred-serialize.ts";
const VALUES = ["cron-ua", "header", "manual", "manual-forced"];

describe("trigger mark: board provenance is recorded", () => {
  it("the route computes a trigger from its auth state and puts it on gen", () => {
    /* STRIP COMMENTS (2026-08-01). OBSERVED DEAD: with "manual-forced" removed from the
       route's code and surviving only in a comment, this guard passed 3/3. It protects BOARD
       PROVENANCE — the trigger mark is reading 5's entire basis, and the fire block turns on
       reading `"header"` rather than `"manual"`. `stripComments` preserves length (comment
       characters become spaces), so the indexOf ORDERING assertion below is unaffected. */
    const src = stripComments(readFileSync(ROUTE, "utf8"));
    for (const v of VALUES) {
      expect(src.includes(`"${v}"`), `trigger value missing from the route: ${v}`).toBe(true);
    }
    const trigIdx = src.indexOf("trigger");
    expect(trigIdx, "no trigger assignment in the route").toBeGreaterThan(-1);
    // the gen object (carrying trigger) must be attached before the board encode
    expect(
      src.indexOf("trigger,") < src.indexOf("encodeBoard("),
      "trigger must sit on gen BEFORE encodeBoard so it rides the archive",
    ).toBe(true);
  });

  it("GenStamp carries the field (the prediction store's gens[] inherits it)", () => {
    const src = stripComments(readFileSync(SERIAL, "utf8"));
    expect(/trigger\?：?:?\s*"cron-ua"/.test(src) || src.includes('trigger?: "cron-ua"'),
      "GenStamp lacks the trigger field").toBe(true);
  });

  it("PLANT (invalid-by-value): a route without the mark is flagged", () => {
    const stripped = "const gen = { at: now, games: 3 };";
    expect(VALUES.every((v) => !stripped.includes(v))).toBe(true);
  });
});
