import type { MatchupSide } from "@/lib/boxscore";
import { dash } from "./logo";
import { PlayerName } from "@/components/player/PlayerName";

const COLS = ["AB", "H", "HR", "BB", "K", "AVG", "OPS"] as const;
const th = "num px-1 py-1.5 text-right text-[9.5px] font-semibold text-faint";
const td = "num px-1 py-[5px] text-right text-[11px]";

/**
 * GAME PREVIEW matchups (INSTRUCTION 46, 2026-09-08, Josh: "it should also have
 * batter vs pitcher matchup data on that page"). One club's hitters vs the other
 * club's probable: career AB H HR BB K AVG OPS from statsapi's vsPlayer splits,
 * summed across seasons (src/lib/boxscore.ts aggregateVsPlayer), history first
 * by AB desc. A hitter the feed never listed prints "no history" — never a 0-for-0.
 */
export function MatchupBox({ m, abbr }: { m: MatchupSide; abbr: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between px-4 pt-3 pb-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          {abbr} hitters vs{" "}
          <PlayerName id={m.pitcher.id} name={m.pitcher.name} className="normal-case tracking-normal text-text" />
        </span>
        <span className="text-[10px] text-faint">career</span>
      </div>
      {!m.lineupPosted && (
        <p className="px-4 pb-2 text-[10.5px] text-faint">Lineup not posted — {abbr} hitters on the roster with history vs this arm.</p>
      )}
      {m.lines.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted">No {abbr} hitter has faced {m.pitcher.name.split(" ").slice(-1)[0]}.</div>
      ) : (
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface/95 px-3 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Batter</th>
                {COLS.map((c) => (
                  <th key={c} className={`${th} ${c === "OPS" ? "pr-3" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.lines.map((b) => (
                <tr key={b.id} className="border-t border-white/[0.04]">
                  <td className="sticky left-0 whitespace-nowrap bg-surface/95 py-[5px] pl-3 pr-2 text-left text-[12px]">
                    <span className={b.history ? "font-medium text-text" : "text-muted"}>
                      <PlayerName id={b.id} name={b.name}>
                        {b.boxName}
                      </PlayerName>
                    </span>
                  </td>
                  {b.history ? (
                    <>
                      <td className={`${td} text-text`}>{dash(b.ab)}</td>
                      <td className={`${td} text-text`}>{dash(b.h)}</td>
                      <td className={`${td} text-muted`}>{dash(b.hr)}</td>
                      <td className={`${td} text-muted`}>{dash(b.bb)}</td>
                      <td className={`${td} text-muted`}>{dash(b.k)}</td>
                      <td className={`${td} text-text`}>{dash(b.avg)}</td>
                      <td className={`${td} pr-3 text-muted`}>{dash(b.ops)}</td>
                    </>
                  ) : (
                    <td colSpan={COLS.length} className="px-1 py-[5px] pr-3 text-right text-[10.5px] italic text-faint">
                      no history
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
