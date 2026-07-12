/**
 * Regenerates src/engine/legacy-src.gen.ts from legacy/index.html.
 * The quant engine is the legacy app's inline script, taken VERBATIM — the
 * math must never be transcribed by hand. Run after any change to legacy/:
 *   node tools/extract-engine.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, "legacy/index.html"), "utf8");

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error("no <script> blocks found in legacy/index.html");
const src = scripts.sort((a, b) => b.length - a.length)[0];
if (src.length < 100_000) throw new Error(`script suspiciously small: ${src.length} bytes`);

const out =
  "/* AUTO-GENERATED from legacy/index.html by tools/extract-engine.mjs — DO NOT EDIT.\n" +
  "   This is the quant engine VERBATIM (builds 23-44). Parity is enforced by\n" +
  "   tests/parity.test.ts against tests/fixtures/baseline43.json. */\n" +
  "export const LEGACY_SRC: string =\n  " +
  JSON.stringify(src) +
  ";\n";

fs.writeFileSync(path.join(root, "src/engine/legacy-src.gen.ts"), out);
console.log(`wrote src/engine/legacy-src.gen.ts (${src.length.toLocaleString()} bytes of engine source)`);
