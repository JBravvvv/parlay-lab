import { NextRequest, NextResponse } from "next/server";
import {
  TEAM_ABBR, TEAM_IDS, hittersFromRoster, isIntId, pitchersFromRoster, pvtTotals, rowFromVsPlayer, sortRows,
  type PvtPitcher, type PvtResponse,
} from "@/lib/pvt";

/**
 * Pitcher vs Team (2026-09-03). Read-only proxy over statsapi.mlb.com:
 *   ?pitchers=1                 -> every active MLB pitcher (for the picker)
 *   ?pitcher=<id>&team=<teamId> -> each active hitter's career line vs that pitcher
 * Public route: no ledger data, no secrets, nothing but MLB's own numbers.
 */
const API = "https://statsapi.mlb.com/api/v1";
const TTL = 1800;
const SEASON = 2026;

async function mlb(path: string): Promise<unknown> {
  const r = await fetch(`${API}${path}`, { next: { revalidate: TTL }, headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`MLB ${r.status} on ${path}`);
  return r.json();
}
const roster = (teamId: number) => mlb(`/teams/${teamId}/roster?rosterType=active&season=${SEASON}`);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("pitchers") === "1") {
      const docs = await Promise.all(TEAM_IDS.map((id) => roster(id).then((d) => pitchersFromRoster(d as never, id))));
      const pitchers: PvtPitcher[] = docs.flat().sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ pitchers });
    }

    const pitcherId = sp.get("pitcher");
    const teamId = sp.get("team");
    if (!isIntId(pitcherId) || !isIntId(teamId)) {
      return NextResponse.json({ error: "pitcher and team must be integer ids" }, { status: 400 });
    }
    const tid = Number(teamId);
    const pid = Number(pitcherId);
    if (!TEAM_ABBR[tid]) return NextResponse.json({ error: "unknown team id" }, { status: 400 });

    const [rosterDoc, pitcherDoc] = await Promise.all([roster(tid), mlb(`/people/${pid}`)]);
    const person = (pitcherDoc as { people?: { id?: number; fullName?: string }[] })?.people?.[0];
    if (!person) return NextResponse.json({ error: "unknown pitcher id" }, { status: 400 });
    const teamDoc = (await mlb(`/teams/${tid}`)) as { teams?: { name?: string }[] };

    const hitters = hittersFromRoster(rosterDoc as never);
    const rows = await Promise.all(
      hitters.map((h) =>
        mlb(`/people/${h.id}/stats?stats=vsPlayer&opposingPlayerId=${pid}&group=hitting`)
          .then((d) => rowFromVsPlayer(h, d))
          // one hitter's feed hiccup shouldn't sink the table; he shows as no history
          .catch(() => rowFromVsPlayer(h, null)),
      ),
    );
    const sorted = sortRows(rows);
    const body: PvtResponse = {
      pitcher: { id: pid, name: String(person.fullName ?? pid) },
      team: { id: tid, abbr: TEAM_ABBR[tid], name: String(teamDoc?.teams?.[0]?.name ?? TEAM_ABBR[tid]) },
      rows: sorted,
      totals: pvtTotals(sorted),
    };
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failure";
    return NextResponse.json({ error: `MLB Stats API didn't answer: ${msg}` }, { status: 502 });
  }
}
