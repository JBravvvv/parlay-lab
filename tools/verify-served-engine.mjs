#!/usr/bin/env node
/**
 * VERIFY THE SERVED ENGINE — the chain's only eye on production.
 *
 *   node tools/verify-served-engine.mjs [--chunk /tmp/chunk.js] [--url <app-url>]
 *
 * WHY THIS FILE EXISTS (2026-07-31): until today there was NO extractor in the repo.
 * The STEP-0 re-grep ritual was an ad-hoc script re-typed at the terminal on each ship,
 * and on 2026-07-31 the ad-hoc version reported a FALSE MISMATCH on a correct ship —
 * 278,267 chars against the true 281,096. It did not fail loudly; it returned a
 * plausible number, which is the shape every defect in this project has taken.
 *
 * THE DEFECT: the old anchor was "the longest single-quoted literal". The chunk contains
 * `\"Pitcher K\\'s\"` — an escaped apostrophe inside an EARLIER double-quoted string. A
 * scan keyed on `'` opened a pseudo-literal there, closed it on the engine literal's own
 * opening quote, and resumed 2,829 chars INSIDE the engine, returning a SUFFIX.
 *
 * THE FIX — a double anchor, neither derived from "longest":
 *   1. the facade call `)(r,'` that immediately precedes the literal (the engine is
 *      passed as a single-quoted argument to the eval'd shim; verified UNIQUE in the
 *      chunk), and
 *   2. the engine's own opening bytes `\n/* ===== config ===== *\/` in escaped form
 *      (also verified UNIQUE).
 * Both must agree on the same offset. Neither can be produced by chunk content earlier
 * in the file: (1) is a call-site shape emitted once by the facade, and (2) is the
 * engine's first line. A quote appearing anywhere earlier is now irrelevant — nothing
 * scans for quotes to FIND the start.
 *
 * THE SUFFIX SIGNATURE, asserted: a proper-substring match against the repo string is
 * the exact fingerprint of the old defect, and it is cheap to check. If the extraction
 * is a substring but not equal, this exits non-zero and SAYS SO rather than reporting a
 * mismatch — the two are entirely different findings.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";

const FACADE = ")(r,'";
const HEAD_ESCAPED = "\\n/* ===== config ===== */";

const args = process.argv.slice(2);
const argOf = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};

export function repoEngine(path = "src/engine/legacy-src.gen.ts") {
  const m = fs.readFileSync(path, "utf8").match(/export const LEGACY_SRC: string =\s*([\s\S]*);\s*$/);
  if (!m) throw new Error("legacy-src.gen.ts does not match the expected shape");
  return JSON.parse(m[1].trim());
}

/** Extract the engine literal from a served chunk. Throws with a named reason. */
export function extractServed(chunk) {
  const viaFacade = chunk.indexOf(FACADE);
  const viaHead = chunk.indexOf(HEAD_ESCAPED);
  if (viaFacade < 0) throw new Error(`ANCHOR-1 MISSING: the facade call ${FACADE} is absent — the bundler changed the call shape`);
  if (viaHead < 0) throw new Error("ANCHOR-2 MISSING: the engine's opening bytes are absent — this chunk does not carry the engine");
  if (chunk.indexOf(FACADE, viaFacade + 1) >= 0) throw new Error("ANCHOR-1 AMBIGUOUS: the facade call appears more than once");
  if (chunk.indexOf(HEAD_ESCAPED, viaHead + 1) >= 0) throw new Error("ANCHOR-2 AMBIGUOUS: the engine head appears more than once");
  const start = viaFacade + FACADE.length;
  if (start !== viaHead) {
    throw new Error(`ANCHORS DISAGREE: facade says ${start}, engine head says ${viaHead} — do not trust either`);
  }
  // escape-aware scan forward to the closing quote (safe: the START is not quote-derived)
  let j = start;
  while (j < chunk.length) {
    if (chunk[j] === "\\") { j += 2; continue; }
    if (chunk[j] === "'") break;
    j++;
  }
  if (j >= chunk.length) throw new Error("UNTERMINATED: no closing quote for the engine literal");
  return new Function("return '" + chunk.slice(start, j) + "'")();
}

/** The full verification, with the suffix signature called out by name. */
export function verify(served, repo) {
  const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
  const out = { servedLen: served.length, repoLen: repo.length, servedSha: sha(served), repoSha: sha(repo) };
  out.match = served === repo;
  out.properSubstring = !out.match && repo.includes(served);
  out.offset = out.properSubstring ? repo.indexOf(served) : null;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chunkPath = argOf("--chunk", "/tmp/chunk.js");
  const chunk = fs.readFileSync(chunkPath, "utf8");
  const repo = repoEngine();
  const served = extractServed(chunk);
  const r = verify(served, repo);
  console.log(`served ${r.servedLen} chars  sha ${r.servedSha}`);
  console.log(`repo   ${r.repoLen} chars  sha ${r.repoSha}`);
  if (r.match) { console.log("MATCH — the served artifact carries the repo engine byte-for-byte"); process.exit(0); }
  if (r.properSubstring) {
    console.error(`EXTRACTION DEFECT, NOT A MISMATCH: the extracted text is a PROPER SUBSTRING of the repo string at offset ${r.offset}.`);
    console.error("This is the 2026-07-31 suffix signature. Do NOT treat it as a served/repo divergence.");
    process.exit(2);
  }
  console.error("MISMATCH — served and repo engines differ and neither contains the other.");
  process.exit(1);
}
