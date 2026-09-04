import type { BoxTeam } from "@/lib/boxscore";
import { dash } from "./logo";
import { InfoBlock } from "./InfoBlock";
import { PlayerName } from "@/components/player/PlayerName";

const COLS = ["AB", "R", "H", "RBI", "BB", "K", "AVG", "OPS"] as const;
const th = "num px-1 py-1.5 text-right text-[9.5px] font-semibold text-faint";
const td = "num px-1 py-[5px] text-right text-[11px]";

/**
 * One club's batting box, MLB-app style: name with the position in faint
 * small caps, substitutes indented under the starter they replaced (the feed's
 * own order), a Totals row, then the feed's batting / baserunning / fielding
 * notes. Pregame: the posted lineup with 0-0 lines, or a clean empty state.
 */
export function BattingBox({ t, pregame, postponed = false }: { t: BoxTeam; pregame: boolean; postponed?: boolean }) {
  const totals = t.battingTotals;
  return (
    <div>
      {t.batters.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-muted">{postponed ? "Postponed — no box score" : pregame ? "Lineups not posted yet" : "No batting lines yet"}</div>
      ) : (
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface/95 px-3 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {pregame ? "Lineup" : "Batters"}
                </th>
                {COLS.map((c) => (
                  <th key={c} className={`${th} ${c === "OPS" ? "pr-3" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.batters.map((b) => (
                <tr key={b.id} className="border-t border-white/[0.04]">
                  <td className={`sticky left-0 bg-surface/95 py-[5px] pr-2 text-left ${b.sub ? "pl-6" : "pl-3"}`}>
                    <span className={`whitespace-nowrap text-[12px] ${b.sub ? "text-muted" : "font-medium text-text"}`}>
                      {b.note && <span className="mr-0.5 text-[10px] text-faint">{b.note}</span>}
                      <PlayerName id={b.id} name={b.name}>
                        {b.boxName}
                      </PlayerName>
                    </span>
                    <span className="ml-1.5 whitespace-nowrap text-[10px] font-medium text-faint">{b.pos}</span>
                  </td>
                  <td className={`${td} text-text`}>{pregame ? "" : dash(b.ab)}</td>
                  <td className={`${td} text-muted`}>{pregame ? "" : dash(b.r)}</td>
                  <td className={`${td} text-text`}>{pregame ? "" : dash(b.h)}</td>
                  <td className={`${td} text-muted`}>{pregame ? "" : dash(b.rbi)}</td>
                  <td className={`${td} text-muted`}>{pregame ? "" : dash(b.bb)}</td>
                  <td className={`${td} text-muted`}>{pregame ? "" : dash(b.k)}</td>
                  <td className={`${td} text-muted`}>{dash(b.avg)}</td>
                  <td className={`${td} pr-3 text-muted`}>{dash(b.ops)}</td>
                </tr>
              ))}
              {!pregame && (
                <tr className="border-t border-white/[0.1]">
                  <td className="sticky left-0 bg-surface/95 py-1.5 pl-3 pr-2 text-left text-[11.5px] font-semibold text-text">Totals</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.ab)}</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.r)}</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.h)}</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.rbi)}</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.bb)}</td>
                  <td className={`${td} font-semibold text-text`}>{dash(totals.k)}</td>
                  <td className={td} />
                  <td className={`${td} pr-3`} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {t.info.map((blk, i) => (
        <InfoBlock key={blk.title} title={blk.title.charAt(0) + blk.title.slice(1).toLowerCase()} items={blk.items} notes={i === 0 ? t.notes : undefined} />
      ))}
      {t.info.length === 0 && t.notes.length > 0 && <InfoBlock title="Batting" items={[]} notes={t.notes} />}
    </div>
  );
}
