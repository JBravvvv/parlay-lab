"use client";

import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { ARCHIVED_SPORTS, ARCHIVE_FALLBACK, SPORT_META, openArchive, setSport, useSport, type Sport } from "@/lib/sport";

/**
 * THE ARCHIVE, AS THE READER MEETS IT (2026-11-12, Josh: "since mlb is done, archive MLB").
 *
 * An archived desk is off the switch, and the app never opens on it. Its record is still there:
 *   ArchiveShelf   sits under every desk's Ledger and opens an archived desk's stored pages
 *   ArchiveBanner  sits above those pages while one is open, says what they are, and leads back
 * Nothing is deleted, moved or rewritten by either; both only change which desk this device shows.
 */

export function ArchiveBanner({ sport }: { sport: Sport }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-(--radius-panel) border border-gold/30 bg-gold/[0.06] px-3 py-2" role="status" data-archive-banner={sport}>
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-text/90">
        <span className="font-bold text-gold">{SPORT_META[sport].label} is archived.</span> This is the stored record of the season. No new card or bet is made on this desk while it is put aside.
      </p>
      <Pill onClick={() => setSport(ARCHIVE_FALLBACK)}>Back to {SPORT_META[ARCHIVE_FALLBACK].label}</Pill>
    </div>
  );
}

export function ArchiveShelf() {
  const sport = useSport();
  const shelved = ARCHIVED_SPORTS.filter((s) => s !== sport);
  if (!shelved.length) return null;
  return (
    <Panel title="Archived desks" className="mt-3">
      <ul className="space-y-2" data-archive-shelf>
        {shelved.map((s) => (
          <li key={s} className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted">
              <span className="font-semibold text-text">{SPORT_META[s].label}</span> · put aside for now. Its ledger, cards and results are kept as they were.
            </p>
            <Pill onClick={() => openArchive(s)}>Open the {SPORT_META[s].short} record</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
