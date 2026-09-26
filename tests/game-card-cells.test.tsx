import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sideCell } from "@/components/cfb/CfbGameCard";
import { OddsCellButton } from "@/components/ui/OddsGrid";
import type { CfbGame } from "@/lib/cfb/types";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("game card missing market taps", () => {
  it("keeps an unpriced cell available to open game coverage", () => {
    const open = vi.fn();
    const cell = sideCell(null, { game: {} as CfbGame, onClick: open });
    const html = renderToStaticMarkup(<OddsCellButton cell={cell} />);
    expect(html).not.toContain("disabled");
    expect(html).toContain("No line · open game details");
    cell.onClick?.();
    expect(open).toHaveBeenCalledOnce();
  });
  it("leaves a truly actionless missing cell inert", () => {
    const cell = sideCell(null, { game: {} as CfbGame });
    expect(renderToStaticMarkup(<OddsCellButton cell={cell} />)).toContain("disabled");
  });
});
