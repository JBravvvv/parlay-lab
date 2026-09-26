import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GameDetail } from "@/components/games/GameDetail";
import { shapeBoxscore, type ApiBoxscore, type ApiLinescore, type ApiScheduleGame } from "@/lib/boxscore";
import fixture from "./fixtures/boxscore-live-824796.json";
afterEach(() => vi.unstubAllGlobals());
describe("live box score refresh", () => {
  it("keeps the last live score visible when a later refresh fails", () => {
    vi.stubGlobal("React", React);
    const f = fixture as unknown as { game: ApiScheduleGame; boxscore: ApiBoxscore; linescore: ApiLinescore };
    const game = shapeBoxscore(f.game, f.boxscore, f.linescore);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, refetchOnMount: false } } });
    const key = ["boxscore", "824796"];
    client.setQueryData(key, game);
    client.getQueryCache().find({ queryKey: key })!.setState({ status: "error", error: new Error("feed temporarily unavailable") });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><GameDetail pk="824796" embedded /></QueryClientProvider>);
    expect(html).toContain("Showing the last available box score");
    expect(html).toContain("Live game");
    expect(html).toContain("Play-by-play");
    expect(html).not.toContain("Couldn't load the game");
    client.clear();
  });
});
