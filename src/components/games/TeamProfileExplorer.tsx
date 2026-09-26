"use client";

import { useRef, useState } from "react";
import { TeamProfile } from "./TeamProfile";
import { GameDetail } from "./GameDetail";
import { FootballGameDetail } from "./FootballGameDetail";

type ScheduleGame = { id: string; date: string; status: string; label: string };

/** Keep the schedule mounted so returning from a score preserves its filters and position. */
export function TeamProfileExplorer({ sport, teamId }: { sport: "nfl" | "cfb" | "mlb"; teamId: string }) {
  const [selectedGame, setSelectedGame] = useState<ScheduleGame | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scheduleScroll = useRef(0);
  const scoreOpener = useRef<HTMLElement | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const selectGame = (game: ScheduleGame) => {
    const sheet = root.current?.closest(".sheet-body");
    scheduleScroll.current = sheet?.scrollTop ?? 0;
    scoreOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedGame(game);
    requestAnimationFrame(() => { backButton.current?.focus({ preventScroll: true }); if (sheet) sheet.scrollTop = 0; });
  };
  const backToTeam = () => {
    setSelectedGame(null);
    requestAnimationFrame(() => {
      const sheet = root.current?.closest(".sheet-body");
      scoreOpener.current?.focus({ preventScroll: true });
      if (sheet) sheet.scrollTop = scheduleScroll.current;
    });
  };
  return <div ref={root}>
    <div hidden={!!selectedGame}>
      <TeamProfile sport={sport} teamId={teamId} onGameSelect={selectGame} />
    </div>
    {selectedGame && <div>
      <button ref={backButton} type="button" onClick={backToTeam} className="sticky top-0 z-20 mb-3 min-h-11 rounded-xl border border-line-2 bg-[#17222e] px-3 text-sm font-semibold text-text">‹ Back to team schedule</button>
      <h3 className="mb-3 text-sm font-bold text-muted">{selectedGame.label}</h3>
      {sport === "mlb"
        ? <GameDetail key={selectedGame.id} pk={selectedGame.id} qDate={selectedGame.date} embedded />
        : <FootballGameDetail key={selectedGame.id} sport={sport} gameId={selectedGame.id} />}
    </div>}
  </div>;
}
