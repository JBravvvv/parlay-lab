import { afterEach, describe, expect, it, vi } from "vitest";
import { isGameCardBackground } from "@/lib/game-card-interaction";

// Minimal DOM contract: verify delegation boundaries without a browser dependency.
class TapElement {
  constructor(readonly control = false, readonly inside = true) {}
  closest() { return this.control ? this : null; }
}
const card = { contains: (node: TapElement) => node.inside } as unknown as HTMLElement;
afterEach(() => vi.unstubAllGlobals());
describe("game card tap boundaries", () => {
  it("opens from a score, logo or whitespace", () => {
    vi.stubGlobal("Element", TapElement);
    expect(isGameCardBackground(new TapElement() as unknown as EventTarget, card)).toBe(true);
  });
  it("keeps team names and pick buttons on their own action", () => {
    vi.stubGlobal("Element", TapElement);
    expect(isGameCardBackground(new TapElement(true) as unknown as EventTarget, card)).toBe(false);
  });
  it("does not reopen when a portalled sheet backdrop closes", () => {
    vi.stubGlobal("Element", TapElement);
    expect(isGameCardBackground(new TapElement(false, false) as unknown as EventTarget, card)).toBe(false);
    expect(isGameCardBackground(null, card)).toBe(false);
  });
});
