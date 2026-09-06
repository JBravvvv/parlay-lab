import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CFB BOARD UI PINS (INSTRUCTION 40, 2026-09-05) — source scans on the College Football Board
 * (CfbPicksBoard) and the board page's CFB branch.
 *
 * Josh: "The green 'Refresh Board' button is gone from the Board screen." The header carries
 * ONE green primary "Refresh Board" pill (the MLB desk's "Refresh MLB" placement) and it
 * re-pulls BOTH feeds — the slate and the player-props board. The small "↻ Refresh" pill is
 * gone. The Board itself borrows the Caesars grammar: a TOP EDGES snap carousel of featured
 * picks above the table, a parlay carousel on phones, a chip-row category strip — with no
 * per-item blur (iOS freeze rule) and no history-pushing navigation.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const board = read("src/components/cfb/CfbPicksBoard.tsx");
const page = read("app/board/page.tsx");
const BLUR = /backdrop-filter|backdrop-blur/;

describe("CFB Board — the one green Refresh Board control", () => {
  it("the page's CFB branch mounts CfbRefreshPill as the PageHeader action", () => {
    expect(page).toMatch(/import \{ CfbPicksBoard, CfbRefreshPill \} from "@\/components\/cfb\/CfbPicksBoard"/);
    const cfb = page.slice(page.indexOf('if (CFB_ENABLED && desk === "cfb")'), page.indexOf("<CfbPicksBoard />"));
    expect(cfb.length).toBeGreaterThan(0);
    expect(cfb).toMatch(/eyebrow="College Football"/);
    expect(cfb).toMatch(/action=\{<CfbRefreshPill \/>\}/);
  });
  it("the pill is a green primary Pill reading Refresh Board / Pulling… while fetching", () => {
    const pill = board.slice(board.indexOf("export function CfbRefreshPill"), board.indexOf("function winsOn"));
    expect(pill).toMatch(/<Pill\s+variant="primary"/);
    expect(pill).toMatch(/"Pulling…" : "Refresh Board"/);
    expect(pill).toMatch(/disabled=\{fetching\}/);
  });
  it("the MLB header action is untouched (Refresh MLB stays a primary Pill)", () => {
    expect(page).toMatch(/\{regen\.isPending \? "Scanning slate…" : d \? "Refresh MLB" : "Generate board"\}/);
  });
  it("the small ↻ Refresh pill is gone — one refresh control on the desk", () => {
    expect(board).not.toMatch(/↻ Refresh/);
    expect(page).not.toMatch(/↻ Refresh/);
    // exactly one JSX label — the pill (the docblock quotes Josh in single quotes)
    expect(board.match(/: "Refresh Board"\}/g)?.length).toBe(1);
  });
  it("the refresh handler invalidates BOTH the slate and the props queries via the key builders' own prefixes", () => {
    expect(board).toMatch(/import \{ CFB_PROPS_STALE_MS, cfbCacheLabel, cfbPricedAtLabel, cfbPropsQueryKey, cfbPropsStaleMs, cfbQueryKey, loadCfbProps \} from "@\/lib\/cfb\/client"/);
    expect(board).toMatch(/export const CFB_SLATE_KEY_PREFIX = cfbQueryKey\(null, CFB_BANK_BASE\)\.slice\(0, 2\);/);
    expect(board).toMatch(/export const CFB_PROPS_KEY_PREFIX = cfbPropsQueryKey\(null, CFB_BANK_BASE\)\.slice\(0, 2\);/);
    const fn = board.slice(board.indexOf("export function refreshCfbBoard"), board.indexOf("export function CfbRefreshPill"));
    expect(fn).toMatch(/qc\.invalidateQueries\(\{ queryKey: CFB_SLATE_KEY_PREFIX \}\)/);
    expect(fn).toMatch(/qc\.invalidateQueries\(\{ queryKey: CFB_PROPS_KEY_PREFIX \}\)/);
    // the "Pulling…" state watches both feeds too
    expect(board).toMatch(/useIsFetching\(\{ queryKey: CFB_SLATE_KEY_PREFIX \}\) \+ useIsFetching\(\{ queryKey: CFB_PROPS_KEY_PREFIX \}\)/);
  });
  it("the key builders really do start with the two-segment prefixes the board invalidates", () => {
    const client = read("src/lib/cfb/client.ts");
    expect(client).toMatch(/return \["cfb", "slate", date \?\? "today", bankroll\] as const;/);
    expect(client).toMatch(/return \["cfb", "props", date \?\? "today", bankroll\] as const;/);
  });
  it("the props query still never polls", () => {
    expect(board).toMatch(/refetchInterval: false/);
    // 2026-09-05 (integration): staleTime became a function of the board's own ttlSec (10 min live / 2 h pre-kick), CFB_PROPS_STALE_MS is the fallback
    expect(board).toMatch(/staleTime: \(q\) => propsBoardStaleMs\(q\.state\.data\)/);
    expect(board).toMatch(/: CFB_PROPS_STALE_MS;/);
  });
});

describe("CFB Board — the Caesars grammar", () => {
  it("TOP EDGES is a snap carousel of featured +EV picks with a Caesars price, above the table", () => {
    expect(board).toMatch(/function TopEdges\(/);
    expect(board).toMatch(/data-testid="cfb-top-edges"/);
    expect(board.indexOf("<TopEdges rows=")).toBeLessThan(board.indexOf("<DataTable"));
    // the data decides the strip: only +EV rows with a Caesars quote, count off plusEv
    expect(board).toMatch(/const featured = useMemo\(\(\) => plusEv\.filter\(\(r\) => r\.cz != null\)\.slice\(0, FEATURED_N\), \[plusEv\]\);/);
    expect(board).toMatch(/\{featured\.length > 0 && <TopEdges rows=\{featured\} total=\{plusEv\.length\}/);
    const strip = board.slice(board.indexOf("function TopEdges("), board.indexOf("function FeaturedPick("));
    expect(strip).toMatch(/className="carousel /);
    expect(strip).toMatch(/\{total\}/);
  });
  it("a featured card shows the hero price, grade, EV and $10 wins $X off Caesars' own decimal", () => {
    const card = board.slice(board.indexOf("function FeaturedPick("), board.indexOf("function sideTeamId("));
    expect(card).toMatch(/hero-price is-cfb/);
    expect(card).toMatch(/fmtAmerican\(cz\.price\)/);
    expect(card).toMatch(/<GradeChip grade=\{r\.grade\}/);
    expect(card).toMatch(/<EvBadge ev=\{r\.evCz\} \/>/);
    expect(card).toMatch(/\{usd\(winsOn\(cz\.dec\)\)\}/);
    expect(card).toMatch(/size="md"/);
    expect(board).toMatch(/const WIN_STAKE = 10;/);
    // to the cent, through the calculator's own profit() — never a whole-dollar rounding beside the price (2026-09-05 review fix)
    expect(board).toMatch(/return profit\(WIN_STAKE, dec\);/);
    expect(board).not.toMatch(/Math\.round\(WIN_STAKE/);
    expect(board).not.toMatch(/Math\.round\(REF_STAKE/);
    expect(board.match(/const pays = payout\(REF_STAKE, t\.dec\);/g)?.length).toBe(2);
    // INSTRUCTION 43 widened the import with decimalToAmerican (the set blurbs print the band as American odds)
    expect(board).toMatch(/import \{ decimalToAmerican, payout, profit \} from "@\/lib\/calc-math"/);
    expect(board).toMatch(/import \{ usd \} from "@\/lib\/ticket-payout"/);
  });
  it("the parlay section is a snap carousel on phones (tier, legs, hero price, $25 pays, % to hit) and the full slips ≥ md", () => {
    expect(board).toMatch(/className="carousel -mx-4 px-4 md:hidden" data-testid="cfb-parlay-carousel"/);
    expect(board).toMatch(/className="hidden gap-3 md:grid md:grid-cols-2"/);
    const card = board.slice(board.indexOf("export function CfbParlayFeature"), board.indexOf("export function CfbParlayCard"));
    expect(card).toMatch(/<TierTag tier=\{t\.tier\} \/>/);
    expect(card).toMatch(/\{t\.legs\.length\} legs/);
    expect(card).toMatch(/hero-price is-gold/);
    expect(card).toMatch(/fmtAmerican\(t\.am\)/);
    expect(card).toMatch(/\$\{REF_STAKE\} pays/);
    expect(card).toMatch(/\{pct\.toFixed\(1\)\}% to hit/);
    expect(card).toMatch(/pulse-dot/);
  });
  it("the category strip is a chip-row and the stat tiles, search and sortable table stay", () => {
    expect(board).toMatch(/className="chip-row -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Pick category"/);
    expect(board.match(/<StatTile/g)?.length).toBe(4);
    expect(board).toMatch(/aria-label="Search picks"/);
    expect(board).toMatch(/<DataTable columns=\{columns\} rows=\{rows\}/);
    expect(board).toMatch(/<Segmented options=\{SCOPES\}/);
  });
  it("the footnotes print the LOADED board's window and in-play count — never the 2 h constant while a game is live", () => {
    expect(board).toMatch(/cached \{cfbCacheLabel\(propsQ\.data\)\}/);
    expect(board).toMatch(/propsQ\.data\.live \? ` · \$\{propsQ\.data\.live\} in play` : ""/);
    expect(board).toMatch(/propsQ\.data\.stale[\s\S]*?lines as priced at \$\{cfbPricedAtLabel\(propsQ\.data\)\}/);
    // 2026-09-05 (same-day follow-up): the budget is blamed only when it actually refused the pull
    expect(board).toMatch(/\$\{propsQ\.data\.budgeted \? " — today's props budget is used up" : ""\}/);
    expect(board).not.toMatch(/cached \{PROPS_CACHE_H\} h/);
    // THE CAESARS-MISSING RULE (2026-09-05, review-fixed copy): the lead counts only games WITH rows (fetched − noProps —
    // "props for 46 of 46" beside "29 have none" read as a contradiction); the Caesars-missing count says "other books",
    // never "DK/FD" (rows come from any US book); the no-props count claims only what a zero-row game proves
    expect(board).toMatch(/priced <span className="num">\{propsQ\.data\.fetched - propsQ\.data\.noProps\}<\/span> of <span className="num">\{propsQ\.data\.events\}<\/span> games/);
    expect(board).not.toMatch(/props for <span/);
    expect(board).toMatch(
      /\{propsQ\.data\.czMissing\s*\? ` · \$\{propsQ\.data\.czMissing\} game\$\{propsQ\.data\.czMissing === 1 \? "" : "s"\} post player props at other books but no Caesars line yet — re-checked every \$\{CFB_PROPS\.czMissingRevalidateSec \/ 60\} min inside \$\{CFB_PROPS\.czMissingWindowSec \/ 3600\} h of kickoff`\s*: ""\}/,
    );
    expect(board).toMatch(/\{propsQ\.data\.noProps \? ` · \$\{propsQ\.data\.noProps\} game\$\{propsQ\.data\.noProps === 1 \? "" : "s"\} on the slate ha\$\{propsQ\.data\.noProps === 1 \? "s" : "ve"\} no player props posted at the books we price` : ""\}/);
    expect(board).not.toMatch(/only at DK\/FD|at any book/);
    expect(board).not.toMatch(/every 30 min/);
    expect(board).not.toMatch(/inside 4 h/);
    expect(board).toMatch(/player props \{propsQ\.data \? cfbCacheLabel\(propsQ\.data\) : `\$\{PROPS_CACHE_H\} h`\}/);
    // the pill's title can see no board, so it names both windows
    expect(board).toMatch(/\$\{PROPS_CACHE_H\} h pre-kick \/ \$\{LIVE_CACHE_MIN\} min while a priced game is in play/);
  });
  it("phone tap floors: chips ≥ 40px, the scope Segmented at md, the search box 44px with 16px text", () => {
    // 4 since the INSTRUCTION 42 review fix (2026-09-05): the two category strips, the tier pills, and the parlay carousel's Show-more control
    expect(board.match(/min-h-\[40px\]/g)?.length).toBe(4);
    expect(board).not.toMatch(/!py-1 /);
    expect(board).toMatch(/<Segmented options=\{SCOPES\}[^>]*size="md"/);
    expect(board).toMatch(/aria-label="Search picks"[\s\S]*?className="num h-11 [^"]*text-\[16px\]/);
  });
  it("every count on the strips comes from the data, never a literal", () => {
    expect(board).toMatch(/const n = picks\?\.categories\[c\.key\]\?\.length \?\? 0;/);
    // INSTRUCTION 42 (2026-09-05): the three VIEWS pills became the twelve-category chip-row — each count is its set's length
    expect(board).toMatch(/const n = sets\[k\]\?\.length \?\? 0;/);
    expect(board).not.toMatch(/\{lists\[v\]\.length\}/);
    expect(board).toMatch(/const n = all\.filter\(\(t\) => match\(t, k\)\)\.length;/);
  });
});

/**
 * INSTRUCTION 42 (2026-09-05, Josh, verbatim): "It should be grading every possible pick available
 * on the board that falls under those props and displaying them … Under the 'generated parlays' on
 * board tab, there needs to be A TON more. There should be 50 parlay options under each category
 * (ML, spread, Anytime TD, Pass TD, Pass Yards, Receiving Yards, Combos, etc) The live parlay
 * section and combo section … should still be generating picks as well".
 * The Board reads picks.sets (twelve CFB_PARLAY_CATEGORIES keys, up to CFB_PARLAYS.perCategory
 * each) through a chip-row of category pills, shows up to 50 per category, tags live rows in
 * the table, and counts live rows on the PICKS tile.
 */
describe("CFB Board — INSTRUCTION 42 (2026-09-05): every pick graded, 50 parlays per category", () => {
  const section = board.slice(board.indexOf("export function CfbParlaysSection"), board.indexOf("const REF_STAKE"));
  const KEYS = ["ml", "spread", "total", "anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds", "combo", "mixed", "live"] as const;

  it("the parlay section is a chip-row of category pills over CFB_PARLAY_CATEGORIES, counts off picks.sets", () => {
    expect(board).toMatch(/import \{ CFB_PARLAY_CATEGORIES, CFB_PROP_MARKETS, type CfbParlay, type CfbParlayCategory,/);
    expect(section).toMatch(/className="chip-row -mx-4 mb-2 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Parlay category" data-testid="cfb-parlay-cats"/);
    expect(section).toMatch(/\{CFB_PARLAY_CATEGORIES\.map\(\(k\) => \{/);
    expect(section).toMatch(/const sets = picks\.sets;/);
    expect(section).toMatch(/const all: CfbParlay\[\] = sets\[cat\] \?\? \[\];/);
    // the legacy three-view strip is gone
    expect(board).not.toMatch(/const VIEWS/);
    expect(board).not.toMatch(/"MIXED PARLAYS"/);
  });
  it("PARLAY_CATS carries all twelve keys with the contract's labels (MIXED reads live+pregame)", () => {
    const cats = board.slice(board.indexOf("const PARLAY_CATS"), board.indexOf("const PREGAME_CATS"));
    for (const k of KEYS) expect(cats, k).toMatch(new RegExp(`\\n  ${k}: \\{ label: "`));
    for (const label of ["ML", "SPREAD", "TOTAL", "ANYTIME TD", "PASS TDS", "PASS YDS", "RECEPTIONS", "RUSH YDS", "REC YDS", "COMBOS", "MIXED", "LIVE"]) expect(cats, label).toMatch(new RegExp(`label: "${label}"`));
    expect(cats).toMatch(/mixed: \{ label: "MIXED", hint: "live\+pregame"/);
    expect(cats).toMatch(/mixed: \{[^\n]*live: true/);
    expect(cats).toMatch(/\n  live: \{[^\n]*live: true/);
    expect(cats.match(/live: false/g)?.length).toBe(10);
    expect(board).toMatch(/const PREGAME_CATS = CFB_PARLAY_CATEGORIES\.filter\(\(k\) => !PARLAY_CATS\[k\]\.live\);/);
  });
  it("the default category is the first non-empty pregame set (never opens on an empty set while another has tickets)", () => {
    expect(section).toMatch(/const cat: CfbParlayCategory = picked \?\? PREGAME_CATS\.find\(\(k\) => \(sets\[k\]\?\.length \?\? 0\) > 0\) \?\? "ml";/);
  });
  it("the tier filter (ALL / SAFER / LONGSHOTS / MIXED) still sits under the category row", () => {
    expect(board).toMatch(/\["LONGSHOT", "LONGSHOTS"\],\n  \["MIX", "MIXED"\],/);
    expect(section.indexOf('data-testid="cfb-parlay-cats"')).toBeLessThan(section.indexOf("{filters.map(([k, label]) => {"));
    expect(section).toMatch(/const shown = all\.filter\(\(t\) => match\(t, active\)\);/);
  });
  it("SHOW_CAP is 50 — the whole category set can show on phones (rank badges, PHONE_CHUNK at a time) and in the desktop grid", () => {
    expect(board).toMatch(/const SHOW_CAP = 50;/);
    expect(section).toMatch(/\{shown\.slice\(0, Math\.min\(phoneShown, SHOW_CAP\)\)\.map\(\(t, i\) => \(\n\s*<CfbParlayFeature key=\{t\.id\} t=\{t\} rank=\{i \+ 1\} live=\{cat === "live"\} \/>/);
    expect(section).toMatch(/\{shown\.slice\(0, SHOW_CAP\)\.map\(\(t, i\) => \(\n\s*<CfbParlayCard key=\{t\.id\} t=\{t\} games=\{games\} rank=\{i \+ 1\} \/>/);
    expect(board).toMatch(/Up to \{CFB_PARLAYS\.perCategory\} ranked by EV\./);
  });
  describe("INSTRUCTION 42 (2026-09-05, review fix): one layout mounted, chunked carousel, top-rank sheen, per-leg LIVE", () => {
    const feature = board.slice(board.indexOf("export function CfbParlayFeature"), board.indexOf("export function CfbParlayCard"));
    const desktopCard = board.slice(board.indexOf("export function CfbParlayCard"));
    it("only the active layout mounts: the carousel under !desktop, the grid under desktop, via a matchMedia(md) hook", () => {
      expect(board).toMatch(/function useIsDesktop\(\): boolean/);
      expect(board).toMatch(/window\.matchMedia\("\(min-width: 768px\)"\)/);
      expect(section).toMatch(/const desktop = useIsDesktop\(\);/);
      expect(section).toMatch(/\{!desktop && \(\n\s*<div className="carousel -mx-4 px-4 md:hidden" data-testid="cfb-parlay-carousel">/);
      expect(section).toMatch(/\{desktop && \(\n\s*<div className="hidden gap-3 md:grid md:grid-cols-2">/);
    });
    it("phones mount PHONE_CHUNK tickets and a ≥40px Show more control appends up to SHOW_CAP; the count resets with the category and the filter", () => {
      expect(board).toMatch(/const PHONE_CHUNK = 12;/);
      expect(section).toMatch(/const \[phoneShown, setPhoneShown\] = useState\(PHONE_CHUNK\);/);
      expect(section).toMatch(/\{phoneShown < Math\.min\(shown\.length, SHOW_CAP\) && \(/);
      expect(section).toMatch(/data-testid="cfb-parlay-more"/);
      expect(section).toMatch(/onClick=\{\(\) => setPhoneShown\(\(n\) => Math\.min\(SHOW_CAP, n \+ PHONE_CHUNK\)\)\}/);
      expect(section).toMatch(/className="press flex min-h-\[40px\][^"]*"\n\s*onClick=\{\(\) => setPhoneShown/);
      expect(section.match(/setPhoneShown\(PHONE_CHUNK\);/g)?.length).toBe(2);
    });
    it("the S-grade sheen runs on the top SHINE_TOP ranks only, on both cards", () => {
      expect(board).toMatch(/const SHINE_TOP = 3;/);
      expect(feature).toMatch(/grade === "S" && rank <= SHINE_TOP \? "shine" : ""/);
      expect(desktopCard).toMatch(/grade === "S" && \(rank \?\? 1\) <= SHINE_TOP \? "shine" : ""/);
      // three sheen sites on the board: the two parlay cards (rank-gated) and the TOP EDGES pick card
      expect(board.match(/"shine"/g)?.length).toBe(3);
    });
    it("only the LIVE set badges the whole ticket; a MIXED ticket tags its in-play leg (leg.live) on phone and desktop", () => {
      expect(section).not.toMatch(/live=\{meta\.live\}/);
      expect(board).toMatch(/function LiveLegTag\(\)/);
      expect(board).toMatch(/data-testid="cfb-live-leg"/);
      expect(feature).toMatch(/\{leg\.live && !live && <LiveLegTag \/>\}/);
      expect(desktopCard).toMatch(/\{leg\.live && t\.category !== "live" && <LiveLegTag \/>\}/);
      // the engine keeps `live` on finished legs (the type carries it)
      expect(read("src/lib/cfb/picks.ts")).toMatch(/legs: d\.legs\.map\(\(\{ evCz: _e, \.\.\.leg \}\) => leg\)/);
      expect(read("src/lib/cfb/props-types.ts")).toMatch(/\n  live\?: boolean;\n\};\n\nexport type CfbParlay = \{/);
    });
    it("chip-row sets only its block padding, so the callers' px-4 applies and the first pill clears the screen edge", () => {
      const css = read("app/globals.css");
      const m = css.match(/\n\.chip-row\s*\{([^}]*)\}/);
      expect(m).not.toBeNull();
      expect(m![1]).toMatch(/padding-block: 2px 6px;/);
      expect(m![1]).not.toMatch(/\n\s*padding:/);
    });
  });
  it("the PICKS tile sub reads N sides · M props · L live when liveRows > 0; the PARLAYS tile counts every set", () => {
    expect(board).toMatch(/const liveRows = picks\?\.liveRows \?\? 0;/);
    expect(board).toMatch(/\$\{liveRows > 0 \? ` · \$\{liveRows\} live` : ""\}/);
    expect(board).toMatch(/const setTickets = useMemo\(\(\) => \(picks \? CFB_PARLAY_CATEGORIES\.flatMap\(\(k\) => picks\.sets\[k\] \?\? \[\]\) : \[\]\), \[picks\]\);/);
    expect(board).toMatch(/const parlayCount = setTickets\.length;/);
  });
  it("live rows in the table show a LIVE tag in place of the ¼-Kelly stake", () => {
    expect(board).toMatch(/function LiveTag\(\)/);
    expect(board).toMatch(/data-testid="cfb-live-tag"/);
    expect(board).toMatch(/cell: \(r\) => \(r\.status === "live" \? <LiveTag \/> : r\.kelly != null \? <KellyChip stake=\{r\.kelly\} \/> : <span className="text-faint">—<\/span>\),/);
    // the pick-category pills keep counting off the data (live rows now included by the engine)
    expect(board).toMatch(/const n = picks\?\.categories\[c\.key\]\?\.length \?\? 0;/);
    expect(board).not.toMatch(/on a game that has not kicked off\./);
  });
  it("phone rules hold: every new pill ≥ 40px, the row scrolls (chip-row), no blur", () => {
    expect(section).toMatch(/data-testid="cfb-parlay-cats"[\s\S]*?className="min-h-\[40px\] !px-3 !text-\[11px\] whitespace-nowrap"/);
    expect(section).not.toMatch(BLUR);
  });
});

describe("CFB Board — iOS rules", () => {
  it("no backdrop blur anywhere on the board or the page", () => {
    expect(board).not.toMatch(BLUR);
    expect(page).not.toMatch(BLUR);
  });
  it("no <Link> without replace, no router.push", () => {
    for (const src of [board, page]) {
      const links = src.match(/<Link[\s>][^>]*>/g) ?? [];
      for (const tag of links) expect(tag).toMatch(/\breplace\b/);
      expect(src).not.toMatch(/router\.push\(/);
    }
  });
  it("the carousel and chip-row classes exist in globals.css and are blur-free", () => {
    const css = read("app/globals.css");
    for (const cls of ["carousel", "chip-row", "hero-price"]) {
      const m = css.match(new RegExp(`\\n\\.${cls}\\s*\\{([^}]*)\\}`));
      expect(m, `.${cls} declared`).not.toBeNull();
      expect(m![1]).not.toMatch(BLUR);
    }
    expect(css).toMatch(/\n\.carousel\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
  });
});

/**
 * INSTRUCTION 43 (2026-09-05, Josh: "It should be showing 50+ Anytime TD parlays"): the picks
 * engine extends a single-market set past the −3 leg gate (CFB_PARLAYS.setFloorEvPct) when tier 1
 * cannot fill it and stamps each ticket `gated`. The Board must SAY which tickets loosened the
 * gate — an EDGE − tag beside the tier chip, the EV chip dimmed, a count on the PARLAYS tile and
 * under the blurb — and every leg-count / price figure in a set blurb must come off `setBandOf`.
 */
describe("CFB Board — INSTRUCTION 43 (2026-09-05): tickets past the leg gate are tagged, never hidden", () => {
  const feature = board.slice(board.indexOf("export function CfbParlayFeature"), board.indexOf("export function CfbParlayCard"));
  const desktopCard = board.slice(board.indexOf("export function CfbParlayCard"));
  const section = board.slice(board.indexOf("export function CfbParlaysSection"), board.indexOf("const REF_STAKE"));
  it("an OpenTag (data-testid cfb-parlay-open, muted line-2 style, not the live tone) renders on both cards only when t.gated is false", () => {
    expect(board).toMatch(/function OpenTag\(\)/);
    const tag = board.slice(board.indexOf("function OpenTag()"), board.indexOf("function TierTag"));
    expect(tag).toMatch(/data-testid="cfb-parlay-open"/);
    expect(tag).toMatch(/border-line-2/);
    expect(tag).toMatch(/text-muted/);
    expect(tag).not.toMatch(/text-live|bg-live|border-live/);
    expect(tag).toMatch(/edge −/);
    // the title names the two gates off the constants, never a literal −3 / −12
    expect(tag).toMatch(/\$\{CFB_PARLAYS\.minLegEvPct\}% EV gate \(down to \$\{CFB_PARLAYS\.setFloorEvPct\}%\)/);
    expect(tag).not.toMatch(/-3%|−3%|-12%|−12%/);
    expect(feature).toMatch(/\{!t\.gated && <OpenTag \/>\}/);
    expect(desktopCard).toMatch(/\{!t\.gated && <OpenTag \/>\}/);
    // review fix: the tag sits in the ticket header beside TierTag and the type chip, so it takes their size — never the 8px leg-row tag
    expect(tag).toMatch(/px-2 py-0\.5 text-\[9px\] font-bold uppercase tracking-\[0\.16em\]/);
    expect(tag).not.toMatch(/text-\[8px\]|py-px|tracking-\[0\.14em\]/);
  });
  it("the EV chip is NOT dimmed on an ungated ticket (review fix: opacity-70 pushed 11px red below AA; the EDGE − tag and the red sign carry it)", () => {
    expect(feature).toMatch(/<EvBadge ev=\{t\.ev\} \/>/);
    expect(desktopCard).toMatch(/<EvBadge ev=\{t\.ev\} \/>/);
    expect(board).not.toMatch(/opacity-70"\s*\}\s*\/>/);
    expect(board).not.toMatch(/EvBadge[^\n]*opacity-70/);
  });
  it("the PARLAYS tile counts the below-gate tickets off the sets, only when > 0", () => {
    expect(board).toMatch(/const openCount = setTickets\.filter\(\(t\) => !t\.gated\)\.length;/);
    expect(board).toMatch(/\$\{openCount \? ` · \$\{openCount\} below gate` : ""\}/);
  });
  it("the set blurb adds the EDGE − note off the constants when the set holds ungated tickets, and the empty state names the extension", () => {
    expect(section).toMatch(/const openN = all\.filter\(\(t\) => !t\.gated\)\.length;/);
    expect(section).toMatch(/\{openN > 0 && \(/);
    expect(section).toMatch(/data-testid="cfb-parlay-open-note"/);
    expect(section).toMatch(
      /Fewer than \{CFB_PARLAYS\.perCategory\} tickets clear the \{CFB_PARLAYS\.minLegEvPct\}% leg gate, so \{openN\} tagged EDGE − use Caesars-priced legs down to EV ≥ \{CFB_PARLAYS\.setFloorEvPct\}% — ranked after the gated ones\./,
    );
    expect(section).toMatch(/the set extends to Caesars-priced legs down to EV ≥ \$\{CFB_PARLAYS\.setFloorEvPct\}% \(tagged EDGE −\)/);
    // the pinned blurb tail survives
    expect(board).toMatch(/Up to \{CFB_PARLAYS\.perCategory\} ranked by EV\./);
  });
  it("every single-market blurb reads its leg count off setBandOf; anytime TD also prints its price band as American odds — no literal 2–6", () => {
    expect(board).toMatch(/import \{ buildCfbPicks, CFB_PICK_CATEGORIES, setBandOf \} from "@\/lib\/cfb\/picks"/);
    expect(board).toMatch(/import \{ decimalToAmerican, payout, profit \} from "@\/lib\/calc-math"/);
    const cats = board.slice(board.indexOf("const PARLAY_CATS"), board.indexOf("const PREGAME_CATS"));
    for (const k of ["ml", "spread", "total", "anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds"]) {
      expect(cats, k).toMatch(new RegExp(`\\$\\{legsOf\\("${k}"\\)\\}`));
    }
    expect(cats).toMatch(/priced \$\{priceRangeOf\("anytime_td"\)\}/);
    expect(cats).not.toMatch(/2–6/);
    expect(board).toMatch(/return `\$\{fmtAmerican\(decimalToAmerican\(b\.minDec\)\)\} to \$\{fmtAmerican\(decimalToAmerican\(b\.maxDec\)\)\}`;/);
  });
});

/**
 * INSTRUCTION 44 (2026-09-05, Josh: "no they should be using in game lines as well; make it also
 * use in game prop lines for all of the same props as they are available"): the single-market
 * sets and COMBOS draw from pregame AND in-game legs and each ticket carries `liveLegs`. The
 * Board tags such a ticket "N in-game" in its header chip row (live tone, pulse dot, OpenTag's
 * size), keeps the whole-ticket LIVE pill for the LIVE set alone, appends "N with in-game legs"
 * to the PARLAYS tile and says in every pregame-category blurb that the lines are pregame and
 * in-game. Every N is read off the data.
 */
describe("CFB Board — INSTRUCTION 44 (2026-09-05): in-game legs in the category sets are tagged", () => {
  const feature = board.slice(board.indexOf("export function CfbParlayFeature"), board.indexOf("export function CfbParlayCard"));
  const desktopCard = board.slice(board.indexOf("export function CfbParlayCard"));
  const section = board.slice(board.indexOf("export function CfbParlaysSection"), board.indexOf("const REF_STAKE"));
  const cats = board.slice(board.indexOf("const PARLAY_CATS"), board.indexOf("const PREGAME_CATS"));
  it("InGameTag: live tone with the pulse dot, OpenTag's chip size, data-testid cfb-parlay-ingame, the count from its prop", () => {
    expect(board).toMatch(/function InGameTag\(\{ n \}: \{ n: number \}\)/);
    const tag = board.slice(board.indexOf("function InGameTag("), board.indexOf("function OpenTag()"));
    expect(tag).toMatch(/data-testid="cfb-parlay-ingame"/);
    expect(tag).toMatch(/border-live\/50 bg-live\/10 px-2 py-0\.5 text-\[9px\] font-bold uppercase tracking-\[0\.16em\] text-live/);
    expect(tag).toMatch(/<span className="pulse-dot h-1\.5 w-1\.5 rounded-full bg-live" aria-hidden \/> \{n\} in-game/);
    expect(tag).not.toMatch(/text-\[8px\]|py-px|tracking-\[0\.14em\]/);
    expect(tag).not.toMatch(/\d+ in-game/);
  });
  it("both cards render it from t.liveLegs only when > 0 and the ticket is a pregame-set ticket (not LIVE, not MIXED — those say it already); the whole-ticket LIVE pill stays cat === 'live'", () => {
    expect(feature).toMatch(/\{t\.liveLegs > 0 && !live && t\.category !== "mixed" && <InGameTag n=\{t\.liveLegs\} \/>\}/);
    expect(desktopCard).toMatch(/\{t\.liveLegs > 0 && t\.category !== "live" && t\.category !== "mixed" && <InGameTag n=\{t\.liveLegs\} \/>\}/);
    expect(section).toMatch(/live=\{cat === "live"\}/);
    // the per-leg tag survives beside it
    expect(feature).toMatch(/\{leg\.live && !live && <LiveLegTag \/>\}/);
    expect(desktopCard).toMatch(/\{leg\.live && t\.category !== "live" && <LiveLegTag \/>\}/);
    // the engine's contract carries the count
    expect(read("src/lib/cfb/props-types.ts")).toMatch(/\n  liveLegs: number;\n/);
  });
  it("the PARLAYS tile appends N with in-game legs off the ten pregame sets (MIXED / LIVE excluded), only when > 0", () => {
    expect(board).toMatch(/const inGameCount = setTickets\.filter\(\(t\) => t\.liveLegs > 0 && t\.category !== "mixed" && t\.category !== "live"\)\.length;/);
    expect(board).toMatch(/\$\{openCount \? ` · \$\{openCount\} below gate` : ""\}\$\{inGameCount \? ` · \$\{inGameCount\} with in-game legs` : ""\}/);
  });
  it("every pregame-category blurb says pregame and in-game Caesars lines; none says upcoming-only any more", () => {
    for (const k of ["ml", "spread", "total", "anytime_td", "pass_tds", "pass_yds", "receptions", "rush_yds", "rec_yds", "combo"]) {
      const line = cats.slice(cats.indexOf(`\n  ${k}: {`) + 1);
      expect(line.slice(0, line.indexOf("\n")), k).toMatch(/pregame and in-game/);
    }
    expect(cats).not.toMatch(/upcoming games only|haven't kicked off|distinct upcoming games/);
    // MIXED / LIVE keep their own copy and their live flag; the flag count is untouched (10 pregame categories)
    expect(cats).toMatch(/mixed: \{ label: "MIXED", hint: "live\+pregame"/);
    expect(cats.match(/live: false/g)?.length).toBe(10);
    // the empty state no longer demands a game that hasn't kicked off
    expect(section).toMatch(/a Caesars price \(pregame or in play\) and grade D or better/);
    expect(section).not.toMatch(/on a game that hasn't kicked off/);
  });
});
