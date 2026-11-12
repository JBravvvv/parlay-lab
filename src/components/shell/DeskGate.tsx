"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NcaabDesk } from "@/components/ncaab/NcaabDesk";
import { ArchiveBanner, ArchiveShelf } from "@/components/shell/ArchiveNotes";
import { ncaabViewOf } from "@/lib/ncaab/view";
import { isArchived, useSport } from "@/lib/sport";

/**
 * THE DESK GATE (2026-11-12). The one place that decides what fills the page area for a desk the
 * app's own pages were not written for, so none of those pages had to learn a new sport:
 *
 *   College Basketball   its own desk (NcaabDesk) stands in for every desk page. Pages that are not
 *                        a desk's (Settings, the calculator, the any-time record) show as they are.
 *   an archived desk     the app's own pages, under a banner that says they are the stored record.
 *   every other desk     the app's own pages, untouched; the Ledger gains the archive shelf below it.
 *
 * It sits inside app/template.tsx, so it remounts with each navigation like the page it wraps.
 */
export function DeskGate({ children }: { children: ReactNode }) {
  const sport = useSport();
  const pathname = usePathname();
  /* the same list of paths says "this is a desk page" for every desk */
  const deskView = ncaabViewOf(pathname);
  if (sport === "ncaab" && deskView) return <NcaabDesk key={deskView} view={deskView} />;
  return (
    <>
      {isArchived(sport) && deskView && <ArchiveBanner sport={sport} />}
      {children}
      {deskView === "ledger" && <ArchiveShelf />}
    </>
  );
}
