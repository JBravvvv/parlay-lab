import { assertAzBook } from "@/lib/az/books";
import { azEdge, validModel, type AzEdge } from "@/lib/az/market";
import { ANYTIME_RULES, type AnytimeRules } from "@/lib/anytime/rules";
import { familyKeyOf, type Candidate, type FamilyState, type PickRecord, type Reject, type Trigger } from "@/lib/anytime/types";

/**
 * THE DECISION (pure). Given every selection the two books are quoting right now and what the
 * ledger already holds, say which picks to record. No fetch, no store, no clock of its own: `now`
 * is handed in, so the same inputs always give the same picks.
 *
 * There is no window, no daily count and no daily ceiling in here. What stands between a
 * candidate and the ledger is only:
 *   started            the event must start later than now + margin (unless a live model exists)
 *   stale_snapshot     the quotes must come from a snapshot fetched within the freshness limit
 *   az_excluded        the market type is on the Arizona exclusion list
 *   bad_model          the model probability is not a probability
 *   no_book            neither DraftKings nor FanDuel is quoting this exact selection and line
 *   one_sided_no_fair  no book posts both sides, so there is no no-vig market number to measure against
 *   below_ev           the model's expected value at the better of the two books is under the floor
 *   not_best_in_family another line of the same side of the same market is the better bet this run
 *   duplicate          the family already has a pick and neither price nor EV improved past the threshold
 */

export type DecideInput = {
  candidates: Candidate[];
  now: number;
  runId: string;
  trigger: Trigger;
  /** Latest recorded pick per family (the re-entry rule reads it). */
  families: ReadonlyMap<string, FamilyState>;
  /** Arizona exclusion list. */
  excluded: (marketType: string) => boolean;
  /** Kelly bankroll in units right now, and units already staked on each event's open picks. */
  kellyBankroll: number;
  kellyOpenByEvent: ReadonlyMap<string, number>;
  rules?: AnytimeRules;
};

export type Decision = { picks: PickRecord[]; rejects: Reject[] };

/** cyrb53: a 53-bit string hash, as 14 hex digits. Not a secret; just a short stable id. */
export function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** A pick's id is its family and its place in it. Two runs that both decide the same pick write the
    same key, and the store keeps only the first. */
export function pickIdOf(family: string, seq: number): string {
  return `at-${hash53(family)}-${seq}`;
}

const sameLine = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Why a candidate cannot be picked right now, before any price is looked at. Null = it can. */
export function gateOf(c: Candidate, now: number, rules: AnytimeRules = ANYTIME_RULES): { reason: Reject["reason"]; detail?: string } | null {
  const start = Date.parse(c.commence);
  if (!Number.isFinite(start)) return { reason: "bad_commence", detail: String(c.commence) };
  if (start <= now + rules.startMarginMs) {
    /* an event that has started is open only to a live model on live odds; none exists yet */
    if (!c.live) return { reason: "started", detail: c.commence };
    return { reason: "live_unsupported" };
  }
  if (c.live) return { reason: "live_unsupported" };
  if (!Number.isFinite(c.fetchedAt) || now - c.fetchedAt > rules.freshnessMs || c.fetchedAt - now > 5_000) {
    return { reason: "stale_snapshot", detail: `${Math.round((now - c.fetchedAt) / 1000)}s old` };
  }
  return null;
}

/** The re-entry rule. `prior` is the family's latest pick. */
export function reentryAllowed(prior: FamilyState, next: { dec: number; ev: number; line: number | null }, rules: AnytimeRules = ANYTIME_RULES): boolean {
  if (sameLine(prior.line, next.line) && next.dec >= prior.dec * (1 + rules.reentry.priceImprove) - 1e-12) return true;
  return next.ev >= prior.ev + rules.reentry.evImprove - 1e-12;
}

/** Fractional-Kelly stake in units, capped per pick and trimmed to the event's remaining room. */
export function kellyUnits(fullKelly: number, bankroll: number, openOnEvent: number, rules: AnytimeRules = ANYTIME_RULES): number {
  if (!(bankroll > 0) || !(fullKelly > 0)) return 0;
  const want = Math.min(rules.kelly.fraction * fullKelly, rules.kelly.maxPct) * bankroll;
  const room = Math.max(0, rules.kelly.eventPct * bankroll - openOnEvent);
  return Math.max(0, r2(Math.min(want, room)));
}

export function decide(input: DecideInput): Decision {
  const rules = input.rules ?? ANYTIME_RULES;
  const rejects: Reject[] = [];
  const bestByFamily = new Map<string, { c: Candidate; e: AzEdge }>();
  const losers: { c: Candidate; family: string }[] = [];

  for (const c of input.candidates) {
    const family = familyKeyOf(c);
    const no = (reason: Reject["reason"], detail?: string) => rejects.push({ family, selection: c.selection, reason, ...(detail ? { detail } : {}) });
    const gate = gateOf(c, input.now, rules);
    if (gate) {
      no(gate.reason, gate.detail);
      continue;
    }
    if (input.excluded(c.marketType)) {
      no("az_excluded", c.marketType);
      continue;
    }
    if (!validModel(c.model)) {
      no("bad_model");
      continue;
    }
    const e = azEdge(c.model, c.quotes);
    if (!e) {
      no("no_book");
      continue;
    }
    if (!e.fair) {
      no("one_sided_no_fair");
      continue;
    }
    if (!(e.ev >= rules.minEv)) {
      no("below_ev", `${(100 * e.ev).toFixed(2)}%`);
      continue;
    }
    const held = bestByFamily.get(family);
    if (!held) {
      bestByFamily.set(family, { c, e });
    } else if (e.ev > held.e.ev + 1e-12 || (Math.abs(e.ev - held.e.ev) <= 1e-12 && e.best.dec > held.e.best.dec)) {
      losers.push({ c: held.c, family });
      bestByFamily.set(family, { c, e });
    } else {
      losers.push({ c, family });
    }
  }
  for (const l of losers) rejects.push({ family: l.family, selection: l.c.selection, reason: "not_best_in_family" });

  /* best bets first, so the event's Kelly room goes to them; the order is otherwise by family key */
  const ranked = [...bestByFamily.entries()].sort((a, b) => b[1].e.ev - a[1].e.ev || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const open = new Map(input.kellyOpenByEvent);
  const picks: PickRecord[] = [];
  const ts = new Date(input.now).toISOString();

  for (const [family, { c, e }] of ranked) {
    const prior = input.families.get(family) ?? null;
    if (prior && !reentryAllowed(prior, { dec: e.best.dec, ev: e.ev, line: c.line }, rules)) {
      rejects.push({ family, selection: c.selection, reason: "duplicate", detail: prior.id });
      continue;
    }
    const seq = (prior?.seq ?? 0) + 1;
    const eventKey = `${c.sport}|${c.eventId}`;
    const stakeKelly = kellyUnits(e.kelly, input.kellyBankroll, open.get(eventKey) ?? 0, rules);
    open.set(eventKey, (open.get(eventKey) ?? 0) + stakeKelly);
    const fair = e.fair!;
    const priceEv = e.priceEv!;
    const quoteAt: PickRecord["quoteAt"] = {};
    for (const b of ["draftkings", "fanduel"] as const) if (c.quotes[b]) quoteAt[b] = c.quotes[b]!.at ?? null;
    picks.push({
      v: 1,
      id: pickIdOf(family, seq),
      seq,
      reentryOf: prior?.id ?? null,
      runId: input.runId,
      trigger: input.trigger,
      ts,
      sport: c.sport,
      eventId: c.eventId,
      event: c.event,
      commence: c.commence,
      market: c.market,
      marketType: c.marketType,
      side: c.side,
      player: c.player ?? null,
      selection: c.selection,
      line: c.line,
      family,
      book: assertAzBook(e.best.book, "decide"),
      price: e.best.price,
      dec: r4(e.best.dec),
      otherBook: assertAzBook(e.best.otherBook, "decide"),
      otherPrice: e.best.otherPrice,
      modelWin: r4(c.model.win),
      modelPush: r4(c.model.push),
      modelP: r4(e.modelP),
      fairP: r4(fair.p),
      fairN: fair.n,
      edge: r4(e.modelP - fair.p),
      ev: r4(e.ev),
      priceEv: r4(priceEv),
      basis: priceEv > rules.priceBasisMinEv ? "price" : "model",
      stakeFlat: 1,
      stakeKelly,
      kellyBankroll: r2(input.kellyBankroll),
      modelVersion: c.modelVersion,
      modelKind: c.modelKind,
      snapshotId: c.snapshotId,
      fetchedAt: new Date(c.fetchedAt).toISOString(),
      quoteAt,
      live: c.live,
      gradeRef: c.gradeRef ?? null,
      engine: rules.version,
    });
  }
  return { picks, rejects };
}

/** The family state a recorded pick leaves behind. */
export function familyStateOf(p: PickRecord): FamilyState {
  return { id: p.id, seq: p.seq, dec: p.dec, ev: p.ev, line: p.line, book: p.book, ts: p.ts };
}

/**
 * THE LAST CHECK BEFORE THE WRITE (server clock, at write time, not at decision time). A pick that
 * was fine when decided but whose event has since started, or whose snapshot has since aged out,
 * is not written.
 */
export function stillWritable(p: PickRecord, now: number, rules: AnytimeRules = ANYTIME_RULES): { ok: true } | { ok: false; reason: Reject["reason"] } {
  const start = Date.parse(p.commence);
  if (!Number.isFinite(start)) return { ok: false, reason: "bad_commence" };
  if (!p.live && start <= now + rules.startMarginMs) return { ok: false, reason: "started" };
  const fetched = Date.parse(p.fetchedAt);
  if (!Number.isFinite(fetched) || now - fetched > rules.freshnessMs) return { ok: false, reason: "stale_snapshot" };
  return { ok: true };
}
