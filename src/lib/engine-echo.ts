import { createHash } from "node:crypto";
import { LEGACY_SRC } from "@/engine/legacy-src.gen";

/**
 * sha+config ECHO (2026-07-29, owner's authorization — "the echo is the missing input
 * we have named for four turns"). ADDITIVE-ONLY, WRITE-ONLY: every value here is
 * computed and attached to outputs (the generate response body and the board archive);
 * NOTHING branches on any of it and no code path reads it back — enforced by
 * tests/engine-echo.test.ts, which scans the route source and fails on any read of
 * `data.echo` beyond the single assignment, and by the absence of any other consumer
 * (an instrument that can alter behavior is not an instrument).
 */

/** sha256 of the engine source string, computed ONCE at module load. */
export const ENGINE_SHA = createHash("sha256").update(LEGACY_SRC, "utf8").digest("hex");

/**
 * The served-chunk engine hash last verified by the STEP-0 re-grep ritual (CLAUDE.md).
 * ⚠️ PENDING-LIVE-VERIFICATION 2026-07-31 ~02:40Z — the outs-flag ship moved the engine
 * string (f6cf1513… -> b862b2b2…, 280,466 -> 281,096 chars). The served artifact cannot
 * carry the new string until this commit deploys, so this constant is set to the RUNTIME
 * hash AHEAD of its live verification and tests/served-verification.json holds the pending
 * marker; the post-deploy re-grep confirms it and clears the marker within 24h (enforced).
 * The guard fails the build when ENGINE_SHA diverges from this — i.e., when the repo
 * engine moves without the served-artifact verification moving with it. Update ONLY
 * alongside a fresh served-chunk verification, in the same commit.
 */
export const SERVED_ENGINE_SHA_VERIFIED =
  "b862b2b2c59532a4df598f93959512c073bc04d93cb76a8c436f38b582ea3867";

export const sha256Text = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * The shared-game damping constant, extracted from the LIVE allocator source at module
 * load (legacy L3088: `shared+=(gUse[l.game]||0)*0.5`) — a runtime read of the shipped
 * expression, not a copied literal. Null if the expression ever moves (which the echo
 * would then say out loud instead of echoing a stale number).
 */
const dampM = LEGACY_SRC.match(/\(gUse\[l\.game\]\|\|0\)\*([0-9.]+)/);
export const DAMPING = dampM ? Number(dampM[1]) : null;

/**
 * ── THE DAMPING PATTERN, GENERALIZED (2026-08-01, owner's item 2) ────────────────────
 * DAMPING above is a RUNTIME READ of the shipped expression rather than a copied literal,
 * and it is the answer to a class this repo has now hit four times. These two exports
 * apply it to the modelled-market SET, which is mirrored by hand in thirteen tracked
 * files (six tools, seven src) — every one of which is a drift waiting to happen, and
 * none of which the parameter census covers, because the census covers CONFIG KEYS and
 * this is a key SET.
 *
 * Null (not a guessed default) if either declaration ever moves — a missing extraction
 * must read as "we no longer know", never as an empty market set, which would silently
 * make every downstream membership test vacuously true. `tests/mirrored-constants.test.ts`
 * fails on null for exactly that reason.
 *
 * WHY EXPORTS AND NOT A REWRITE OF ALL THIRTEEN: six of the mirrors are PYTHON tools that
 * cannot import this module. They are covered instead by the guard, which re-parses the
 * engine and diffs every mirror on every run — the repo's own idiom of an encoded
 * invariant over a written rule. The seven TS/TSX mirrors CAN import these; converting
 * them is queued, not done, and the guard holds the line meanwhile.
 */
const lblM = LEGACY_SRC.match(/var SH_MKT_LABEL=\{([^}]*)\}/);
export const MODELLED_MARKETS: string[] | null = lblM
  ? (lblM[1].match(/([a-z_]+):/g) ?? []).map((s) => s.slice(0, -1))
  : null;

const catsM = LEGACY_SRC.match(/var SH_NAMED_CATS=\[([^\]]*)\]/);
export const NAMED_CATS: string[] | null = catsM
  ? (catsM[1].match(/"([a-z_]+)"/g) ?? []).map((s) => s.replace(/"/g, ""))
  : null;

export type BoardEcho = {
  engineSha: string;
  priorsSha: string | null;
  ctxSha: string | null;
  hrrAltMax: unknown;
  coreEvMin: unknown;
  coreCzEvMin: unknown;
  consMinN: unknown;
  consMinEv: unknown;
  coreMaxLegs: unknown;
  maxCoreTickets: unknown;
  coreMaxDec: unknown;
  perParlayCap: unknown;
  kellyStakeMult: unknown;
  dailyBankrollCap: unknown;
  selMode: unknown;
  outsSusp: unknown;
  damping: number | null;
  cfSelEnabled: boolean;
  /** graded legs per market at arm time — the COUNT that arms the consensus gate
      (`small` when `mktN[mkt] < consMinN`). Added 2026-07-30 on the owner's order:
      the reopen "dates" are accrual PROJECTIONS off this number, it lives only in
      the server calibration store, and without it on the board the crossing is
      observable only as a blocked-reason proxy. Echo-only; nothing branches on it. */
  mktN: unknown;
};

export function buildEcho(
  cfg: Record<string, unknown> | null,
  x: { priorsSha: string | null; ctxSha: string | null; cfSelEnabled: boolean },
): BoardEcho {
  const g = (k: string) => (cfg && k in cfg ? (cfg[k] ?? null) : null);
  return {
    engineSha: ENGINE_SHA,
    priorsSha: x.priorsSha,
    ctxSha: x.ctxSha,
    hrrAltMax: g("hrrAltMax"),
    coreEvMin: g("coreEvMin"),
    coreCzEvMin: g("coreCzEvMin"),
    consMinN: g("consMinN"),
    consMinEv: g("consMinEv"),
    coreMaxLegs: g("coreMaxLegs"),
    maxCoreTickets: g("maxCoreTickets"),
    coreMaxDec: g("coreMaxDec"),
    perParlayCap: g("perParlayCap"),
    kellyStakeMult: g("kellyStakeMult"),
    dailyBankrollCap: g("dailyBankrollCap"),
    selMode: g("selMode"),
    outsSusp: g("outsSusp"),
    mktN: g("mktN"),
    damping: DAMPING,
    cfSelEnabled: x.cfSelEnabled,
  };
}
