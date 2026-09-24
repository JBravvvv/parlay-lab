"use client";
import Link from "next/link";

/** Query navigation keeps the Board mounted, preserving its date and filters. */
export function BoardModeToggle({ parlays }: { parlays: boolean }) {
  return <nav className="board-mode-toggle" aria-label="Board views">
    <Link replace href="/board" scroll={false} aria-current={!parlays ? "page" : undefined}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 17 10 11l4 3 6-8M4 21h16"/></svg>
      Board
    </Link>
    <Link replace href="/board?view=parlays" scroll={false} aria-current={parlays ? "page" : undefined}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="3" width="14" height="18" rx="3"/><path d="m8 8 1 1 2-2m-3 7 1 1 2-2m2-5h3m-3 6h3"/></svg>
      Generated Parlays
    </Link>
  </nav>;
}
