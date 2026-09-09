import { NextResponse } from "next/server";
import { CFB_CTX_SEASON, CFB_CTX_TTL, espnByAthleteUrl, parseByAthlete, type CfbPropsContext } from "@/lib/cfb/props-context";
import { parseAthleteMeta, parseSeasonTeams, seasonPlayersOf, type SeasonFeed, type SeasonPlayerMeta } from "@/lib/cfb/season";
import { fpiPayload } from "@/lib/cfb/slate-server";

/**
 * THE SEASON FEED (INSTRUCTION 46, 2026-09-08) — ESPN ONLY, NO ODDS API, NO PAID SPEND.
 *
 *   GET /api/cfb/season → SeasonFeed { season, generatedAt, players, teams, avgFpi, fpiUpdated }
 *
 * Two free upstreams, both on the Next data cache at an hour or longer (season totals move once
 * a week, on Saturday night):
 *   ESPN byathlete   revalidate CFB_CTX_TTL (3600 s) — the SAME three passing / rushing / receiving
 *                    URLs src/lib/cfb/props-context.ts reads for the props context, parsed by ITS
 *                    `parseByAthlete` for the stat totals (one copy of that parser) plus
 *                    `parseAthleteMeta` (./season) for the name / team / position the context map
 *                    does not keep. A failed table is skipped; three failures → an empty players list.
 *   ESPN FPI         revalidate FPI_TTL (21600 s) via `fpiPayload` (src/lib/cfb/slate-server.ts —
 *                    the slate's own fetch); records and ESPN's own projected W-L ride the same
 *                    payload's columns. Failure → no teams, avgFpi null, every win total renders "—".
 *
 * Nothing here prices anything: the book's season line and price are typed on the page, because
 * no feed the repo may read carries them (verified 2026-09-08 — The Odds API's NCAAF markets are
 * game markets and per-game player props only). This route never touches ODDS_API_KEY.
 */

export const SEASON_ROUTE_TTL = CFB_CTX_TTL;
const GROUPS = ["passing", "rushing", "receiving"] as const;

async function athleteTables(): Promise<{ ctx: CfbPropsContext; meta: Map<string, SeasonPlayerMeta> }> {
  const ctx: CfbPropsContext = new Map();
  const meta = new Map<string, SeasonPlayerMeta>();
  const pages = await Promise.all(
    GROUPS.map(async (group) => {
      try {
        const r = await fetch(espnByAthleteUrl(group), { next: { revalidate: SEASON_ROUTE_TTL } });
        if (!r.ok) return null;
        return (await r.json().catch(() => null)) as unknown;
      } catch {
        return null;
      }
    }),
  );
  for (const page of pages) {
    if (!page) continue;
    parseByAthlete(page, ctx);
    parseAthleteMeta(page, meta);
  }
  return { ctx, meta };
}

export async function GET() {
  const [{ ctx, meta }, fpi] = await Promise.all([athleteTables(), fpiPayload()]);
  const { teams, avgFpi, updated } = parseSeasonTeams(fpi);
  const body: SeasonFeed = {
    season: CFB_CTX_SEASON,
    generatedAt: new Date().toISOString(),
    players: seasonPlayersOf(ctx.size ? ctx : null, meta),
    teams,
    avgFpi,
    fpiUpdated: updated,
  };
  return NextResponse.json(body, { headers: { "cache-control": `public, max-age=0, s-maxage=${SEASON_ROUTE_TTL}` } });
}
