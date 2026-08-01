/**
 * SOURCE-SCANNING HELPERS FOR GUARDS (2026-08-01).
 *
 * WHY THIS FILE EXISTS — it is instrument defect #6's lesson, hit twice:
 *   1. `tests/strict-coercion.test.ts`'s raw-`Number(` ratchet first counted the PROSE
 *      explaining the trap as instances of it: 10 reported against 7 real.
 *   2. `tests/mirrored-constants.test.ts`'s echo-fallback check, written this same day and
 *      with that lesson in the file header, flagged `echo?.consMinN ?? 100` inside the
 *      comment recording that the fallback had been REMOVED. The guard fired on the
 *      tombstone.
 *
 * A guard that cannot tell code from a comment about code is measuring the wrong artifact.
 * Twice is a class, so the stripper lives in one place from here.
 *
 * NOTE: `tests/strict-coercion.test.ts` still carries its own inline copy. It is a
 * signed-off guard and is NOT edited in place here (the M27 failure mode); converting it
 * to this import is queued.
 */

/**
 * Blank out `/* … *\/` and `// …` while PRESERVING newlines, so line numbers stay true.
 * The `(^|[^:])` guard on the line comment keeps `https://…` inside a string from
 * swallowing the rest of the line.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Blank out `#` comments, preserving newlines. Python AND YAML — same comment character,
 * and both are scanned by guards in this repo (`snapshot_props.py`, `props-history.yml`).
 */
export function stripHashComments(src: string): string {
  return src.replace(/(^|[^"'])#[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/** @deprecated name — kept so existing imports keep working. Same function. */
export const stripPyComments = stripHashComments;
