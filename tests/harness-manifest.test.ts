import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * THE HARNESS MANIFEST (2026-07-25)
 *
 * A 24% hole in every server board survived a 339-test, parity-verified suite for a
 * week — not because a test was missing, but because `createEngine` REPLACED the
 * function that had the bug. Pin `today` and `obSameDay` becomes a UTC-string
 * comparison, so the suite tested neither production nor the browser.
 *
 * A substitution is a region of production behaviour the suite structurally cannot
 * see. This test makes adding one without documenting it fail the build.
 */

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src/engine/index.ts"), "utf8");
const manifest = fs.readFileSync(path.join(root, "docs/harness-substitutions.md"), "utf8");

describe("every harness substitution is documented", () => {
  it("every scope.set() binding the facade installs is named in the manifest", () => {
    // scope.set("name", …) — the engine bindings createEngine overwrites
    const names = [...src.matchAll(/scope\.set\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(manifest, `scope.set("${n}") is not documented in docs/harness-substitutions.md`).toContain(n);
    }
  });

  it("every global the sandbox shims is named in the manifest", () => {
    // the boot preamble: `var localStorage=…,document=…,window=…` plus the
    // function-valued shims declared inline (setTimeout, fetch, …)
    const boot = src.slice(src.indexOf("const boot = new Function"), src.indexOf("as (s: object"));
    const shimmed = new Set<string>();
    for (const m of boot.matchAll(/(\w+)\s*=\s*__shims\./g)) shimmed.add(m[1]);
    for (const m of boot.matchAll(/(\w+)\s*=\s*function\s*\(/g)) shimmed.add(m[1]);
    // `self` is an alias of window and is covered by the window row
    shimmed.delete("self");
    expect(shimmed.size).toBeGreaterThan(5);
    for (const n of shimmed) {
      expect(manifest, `sandbox shim "${n}" is not documented in docs/harness-substitutions.md`).toContain(n);
    }
  });

  it("the manifest states the both-timezone rule, which is the lesson not the patch", () => {
    expect(manifest).toContain("TZ=UTC");
    expect(manifest).toContain("America/Los_Angeles");
    expect(manifest).toMatch(/never patched out/i);
  });

  it("Date and Math.random are still NOT substituted", () => {
    // pinning either would recreate the blindness that hid the slate hole
    expect(src).not.toMatch(/scope\.set\(\s*"Date"/);
    expect(src).not.toMatch(/Date\s*=\s*function/);
    expect(src).not.toMatch(/Math\.random\s*=/);
    expect(manifest).toContain("NOT substituted");
  });

  it("the engine no longer calls obSameDay — the fix, pinned", () => {
    const engine = fs.readFileSync(path.join(root, "legacy/index.html"), "utf8");
    const collect = engine
      .slice(engine.indexOf("function shCollectSlate()"), engine.indexOf("function shAnalyzeLocal"))
      // strip comments: the fix's own comment explains what obSameDay used to do
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(collect, "obSameDay is back in the engine's slate collector").not.toContain("obSameDay(");
  });
});
