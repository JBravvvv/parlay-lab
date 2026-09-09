import type { BoxTeam } from "@/lib/boxscore";
import { dash } from "./logo";
import { PlayerName } from "@/components/player/PlayerName";

const th = "num px-1 py-1.5 text-right text-[9.5px] font-semibold text-faint";
const td = "num px-1 py-[5px] text-right text-[11px]";

/**
 * GAME PREVIEW lineup (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim:
 * "'Preview' should be named 'Game Preview' and has avg, ops stats but no AB,
 * R, H, RBI, etc."). The posted lineup with each batter's SEASON AVG and OPS
 * (the box's own seasonStats.batting) — the in-game columns exist only on the
 * box score. No lineup posted: say so; nothing is invented.
 */
export function PreviewBox({ t, postponed = false }: { t: BoxTeam; postponed?: boolean }) {
  if (t.batters.length === 0) {
    return <div className="px-4 py-8 text-center text-[12px] text-muted">{postponed ? "Postponed — no box score" : "Lineup not posted"}</div>;
  }
  return (
    <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface/95 px-3 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
              {t.lineupPosted ? "Lineup" : "Batters"}
            </th>
            <th className={th}>AVG</th>
            <th className={`${th} pr-3`}>OPS</th>
          </tr>
        </thead>
        <tbody>
          {t.batters.map((b, i) => (
            <tr key={b.id} className="border-t border-white/[0.04]">
              <td className="sticky left-0 bg-surface/95 py-[5px] pl-3 pr-2 text-left">
                <span className="num mr-1.5 inline-block w-3 text-[10px] text-faint">{t.lineupPosted ? i + 1 : ""}</span>
                <span className="whitespace-nowrap text-[12px] font-medium text-text">
                  <PlayerName id={b.id} name={b.name}>
                    {b.boxName}
                  </PlayerName>
                </span>
                <span className="ml-1.5 whitespace-nowrap text-[10px] font-medium text-faint">{b.pos}</span>
              </td>
              <td className={`${td} text-text`}>{dash(b.avg)}</td>
              <td className={`${td} pr-3 text-muted`}>{dash(b.ops)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pb-2.5 pt-1.5 text-[10px] text-faint">Season AVG / OPS from the box's own feed.</p>
    </div>
  );
}
