#!/usr/bin/env node
/**
 * GUARD-DIFF AUDIT (2026-07-31, M27 — owner's item 3).
 *
 *   node tools/guard-diff-audit.mjs [--since 2026-07-24]
 *
 * WHY A TOOL AND NOT A BUILD GUARD. The natural encoding — "fail when a commit touching tests/
 * has a subject that does not name a guard change" — does not work here: subjects in this repo
 * run to hundreds of words and nearly always mention a test somewhere, so the rule flagged 45 of
 * 87 commits, almost all of which were NEW guards shipped alongside a finding (the healthy
 * pattern). A subject rule would train suppression.
 *
 * WHAT ACTUALLY DISTINGUISHES A WEAKENING IS THE DIFF, NOT THE MESSAGE. This lists every commit
 * that DELETES lines from a tests/*.test.ts file, with how many of those lines carried an
 * assertion or a case. That is a tractable review set (31 of 87 since 2026-07-24) rather than a
 * build-time veto.
 *
 * ITS LIMIT, STATED: M27's own widening deleted ONE line and ZERO assertion lines — a behaviour
 * change inside a helper, not an assertion removal. An assertion-count rule would MISS it. What
 * found M27 was an untracked orphan preserving the pre-change file. So this tool narrows the
 * review set; it does not close the class.
 */
import { execFileSync } from "node:child_process";

const git = (a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const since = (() => { const i = process.argv.indexOf("--since"); return i >= 0 ? process.argv[i + 1] : "2026-07-24"; })();
const ASSERT = /\bexpect\(|\bit\(|\bit\.fails\(|\bdescribe\(/;

const recs = git(["log", `--since=${since}`, "--format=@@@%h|%cI|%s", "--numstat"]).split("@@@").filter((r) => r.trim());
let touched = 0;
const rows = [];
for (const r of recs) {
  const lines = r.trim().split("\n").filter(Boolean);
  const [h, t, ...rest] = lines[0].split("|");
  const subject = rest.join("|");
  const files = [];
  let any = false;
  for (const l of lines.slice(1)) {
    const p = l.split("\t");
    if (p.length !== 3 || !p[2].startsWith("tests/")) continue;
    any = true;
    if (p[2].endsWith(".test.ts") && Number(p[1]) > 0) files.push({ f: p[2], add: Number(p[0]), del: Number(p[1]) });
  }
  if (any) touched++;
  if (!files.length) continue;
  let asserts = 0;
  for (const { f } of files) {
    const d = git(["show", "-1", h, "--", f]);
    asserts += d.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && ASSERT.test(l)).length;
  }
  const net = files.reduce((s, x) => s + x.add - x.del, 0);
  rows.push({ h, t: t.slice(0, 19), files, asserts, net, subject });
}
rows.sort((a, b) => b.asserts - a.asserts || a.net - b.net);
console.log(`commits touching tests/ since ${since}: ${touched}`);
console.log(`of those, DELETING lines from a *.test.ts: ${rows.length}`);
console.log(`removing assertion/case lines: ${rows.filter((r) => r.asserts).length}   total such lines: ${rows.reduce((s, r) => s + r.asserts, 0)}`);
console.log(`NET-NEGATIVE in a test file (coverage actually shrank): ${rows.filter((r) => r.net < 0).length}\n`);
for (const r of rows) {
  const flag = r.net < 0 ? "  <<< NET-NEGATIVE" : r.asserts ? "  <<< assertion lines removed" : "";
  console.log(`  ${r.t}  ${r.h}  net ${r.net >= 0 ? "+" : ""}${r.net}, ${r.asserts} assertion line(s)${flag}`);
  console.log(`      ${r.files.map((x) => `${x.f.split("/").pop()} +${x.add}/-${x.del}`).join(", ")}`);
  console.log(`      ${r.subject.slice(0, 100)}`);
}
