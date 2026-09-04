import type { BoxscorePayload } from "@/lib/boxscore";
import { logoFor, startLabel } from "./logo";
import { PlayerName } from "@/components/player/PlayerName";

const last = (n: string) => n.split(" ").slice(-1)[0];

/**
 * The scoreboard: away | status | home, logos over abbreviations over records,
 * the big score for live/final, the start time for pregame, and the W/L/S line.
 */
export function BoxHeader({ g }: { g: BoxscorePayload }) {
  const played = g.status === "live" || g.status === "final";
  const winner = g.status === "final" ? ((g.away.score ?? 0) > (g.home.score ?? 0) ? "away" : (g.home.score ?? 0) > (g.away.score ?? 0) ? "home" : null) : null;
  const extra = g.linescore && g.linescore.innings.length > 9 ? `/${g.linescore.innings.length}` : "";
  const status =
    g.status === "live" && g.inning ? (
      <span className="flex flex-col items-center gap-0.5 text-live">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em]">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" />
          {g.detail === "Warmup" ? "Warmup" : `${g.inning.state} ${g.inning.ordinal}`}
        </span>
        {g.inning.outs != null && g.detail !== "Warmup" && (
          <span className="num text-[10.5px] text-muted">
            {g.inning.balls ?? 0}-{g.inning.strikes ?? 0} · {g.inning.outs} out{g.inning.outs === 1 ? "" : "s"}
          </span>
        )}
      </span>
    ) : g.status === "live" ? (
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-live">{g.detail}</span>
    ) : g.status === "final" ? (
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text">Final{extra}</span>
    ) : g.status === "postponed" ? (
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold">{g.detail}</span>
    ) : (
      <span className="flex flex-col items-center text-center">
        <span className="num text-[13px] font-semibold text-text">{startLabel(g.start)}</span>
        <span className="text-[10.5px] text-faint">{g.detail}</span>
      </span>
    );

  const side = (k: "away" | "home") => {
    const t = g[k];
    const won = winner === k;
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoFor(t.abbr)} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
        <div className={`text-[13px] font-bold ${won || !played ? "text-text" : "text-muted"}`}>{t.abbr}</div>
        <div className="num text-[10.5px] text-faint">{t.record}</div>
      </div>
    );
  };
  const score = (k: "away" | "home") =>
    played ? <div className={`num text-[36px] font-bold leading-none ${winner === k || g.status === "live" ? "text-text" : "text-muted"}`}>{g[k].score ?? "—"}</div> : null;

  const d = g.decisions;
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        {side("away")}
        {score("away")}
        <div className="flex w-[104px] shrink-0 flex-col items-center justify-center">{status}</div>
        {score("home")}
        {side("home")}
      </div>
      {d && (
        <div className="num mt-3 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {d.w && (
            <span>
              <span className="font-semibold text-pos">W</span>{" "}
              <PlayerName id={d.w.id} name={d.w.name}>
                {last(d.w.name)}
              </PlayerName>
              {d.w.wl ? ` (${d.w.wl}${d.w.era ? `, ${d.w.era}` : ""})` : ""}
            </span>
          )}
          {d.l && (
            <span>
              <span className="font-semibold text-neg">L</span>{" "}
              <PlayerName id={d.l.id} name={d.l.name}>
                {last(d.l.name)}
              </PlayerName>
              {d.l.wl ? ` (${d.l.wl}${d.l.era ? `, ${d.l.era}` : ""})` : ""}
            </span>
          )}
          {d.s && (
            <span>
              <span className="font-semibold text-text">S</span>{" "}
              <PlayerName id={d.s.id} name={d.s.name}>
                {last(d.s.name)}
              </PlayerName>
              {d.s.saves != null ? ` (${d.s.saves})` : ""}
            </span>
          )}
        </div>
      )}
      {!d && !played && (g.away.probable || g.home.probable) && (
        <div className="num mt-3 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {(["away", "home"] as const).map((k) => {
            const p = g[k].probable;
            return (
              <span key={k}>
                <span className="text-faint">{g[k].abbr}</span>{" "}
                {p ? (
                  <>
                    <PlayerName id={p.id} name={p.name} />
                    {`${p.wl ? ` ${p.wl}` : ""}${p.era ? ` · ${p.era} ERA` : ""}`}
                  </>
                ) : (
                  "TBD"
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
