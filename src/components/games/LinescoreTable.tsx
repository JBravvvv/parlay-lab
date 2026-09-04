import type { BoxLinescore } from "@/lib/boxscore";

/**
 * Innings 1..N with R H E. A half the feed never scored is blank; the bottom
 * the home club never batted (a final the home side led) prints "x".
 */
export function LinescoreTable({ ls, away, home, winner }: { ls: BoxLinescore; away: string; home: string; winner: "away" | "home" | null }) {
  const cell = (v: number | null, side: "away" | "home", n: number) => (v == null ? (side === "home" && ls.xBottom === n ? "x" : "") : String(v));
  const row = (label: string, side: "away" | "home") => {
    const won = winner === side;
    return (
      <tr className="border-t border-white/[0.05]">
        <th className={`sticky left-0 bg-surface/95 py-1.5 pr-3 text-left text-[11.5px] font-semibold ${won ? "text-text" : "text-muted"}`}>{label}</th>
        {ls.innings.map((c) => (
          <td key={c.n} className="num px-1.5 py-1.5 text-center text-[11.5px] text-muted">
            {cell(c[side], side, c.n)}
          </td>
        ))}
        <td className={`num border-l border-white/[0.08] px-1.5 py-1.5 pl-2.5 text-center text-[12px] font-bold ${won ? "text-text" : "text-muted"}`}>{ls.totals[side].r}</td>
        <td className="num px-1.5 py-1.5 text-center text-[11.5px] text-muted">{ls.totals[side].h}</td>
        <td className="num px-1.5 py-1.5 text-center text-[11.5px] text-muted">{ls.totals[side].e}</td>
      </tr>
    );
  };
  return (
    <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface/95" />
            {ls.innings.map((c) => (
              <th key={c.n} className="num px-1.5 pb-1 text-center text-[10px] font-semibold text-faint">
                {c.n}
              </th>
            ))}
            <th className="num border-l border-white/[0.08] px-1.5 pb-1 pl-2.5 text-center text-[10px] font-bold text-muted">R</th>
            <th className="num px-1.5 pb-1 text-center text-[10px] font-semibold text-faint">H</th>
            <th className="num px-1.5 pb-1 text-center text-[10px] font-semibold text-faint">E</th>
          </tr>
        </thead>
        <tbody>
          {row(away, "away")}
          {row(home, "home")}
        </tbody>
      </table>
    </div>
  );
}
