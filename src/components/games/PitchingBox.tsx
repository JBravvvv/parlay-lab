import type { BoxTeam } from "@/lib/boxscore";
import { dash } from "./logo";
import { PlayerName } from "@/components/player/PlayerName";

const COLS = ["IP", "H", "R", "ER", "BB", "K", "HR", "ERA"] as const;
const th = "num px-1 py-1.5 text-right text-[9.5px] font-semibold text-faint";
const td = "num px-1 py-[5px] text-right text-[11px]";

/** One club's pitching lines with the (W, 2-0) / (L, 2-2) / (S, 3) tags, then Totals. */
export function PitchingBox({ t, pregame }: { t: BoxTeam; pregame: boolean }) {
  const tot = t.pitchingTotals;
  if (pregame) {
    return (
      <div className="px-4 py-3 text-[12px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Probable</span>
        <div className="num mt-1 text-text">
          {t.probable ? (
            <>
              <PlayerName id={t.probable.id} name={t.probable.name} className="font-medium" />
              <span className="ml-2 text-muted">
                {t.probable.wl ?? "—"}
                {t.probable.era ? ` · ${t.probable.era} ERA` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted">TBD</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface/95 px-3 py-1.5 text-left text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">Pitchers</th>
            {COLS.map((c) => (
              <th key={c} className={`${th} ${c === "ERA" ? "pr-3" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.pitchers.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-[12px] text-muted">
                No pitching lines yet
              </td>
            </tr>
          )}
          {t.pitchers.map((p) => (
            <tr key={p.id} className="border-t border-white/[0.04]">
              <td className="sticky left-0 whitespace-nowrap bg-surface/95 py-[5px] pl-3 pr-2 text-left text-[12px] font-medium text-text">
                <PlayerName id={p.id} name={p.name}>
                  {p.boxName}
                </PlayerName>
                {p.tag && <span className={`num ml-1.5 text-[10.5px] font-semibold ${/^\((L|BS)/.test(p.tag) ? "text-neg" : /^\((W|S|H)/.test(p.tag) ? "text-pos" : "text-muted"}`}>{p.tag}</span>}
              </td>
              <td className={`${td} text-text`}>{dash(p.ip)}</td>
              <td className={`${td} text-muted`}>{dash(p.h)}</td>
              <td className={`${td} text-muted`}>{dash(p.r)}</td>
              <td className={`${td} text-muted`}>{dash(p.er)}</td>
              <td className={`${td} text-muted`}>{dash(p.bb)}</td>
              <td className={`${td} text-text`}>{dash(p.k)}</td>
              <td className={`${td} text-muted`}>{dash(p.hr)}</td>
              <td className={`${td} pr-3 text-muted`}>{dash(p.era)}</td>
            </tr>
          ))}
          {t.pitchers.length > 0 && (
            <tr className="border-t border-white/[0.1]">
              <td className="sticky left-0 bg-surface/95 py-1.5 pl-3 pr-2 text-left text-[11.5px] font-semibold text-text">Totals</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.ip)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.h)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.r)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.er)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.bb)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.k)}</td>
              <td className={`${td} font-semibold text-text`}>{dash(tot.hr)}</td>
              <td className={`${td} pr-3`} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
