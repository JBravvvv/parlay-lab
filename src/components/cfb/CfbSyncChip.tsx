"use client";

import { useLeague } from "@/components/football/LeagueContext";

/**
 * The football ledger's sync status — the MLB Ledger's SyncChip on the desk's own loop
 * (`L.sync.useSyncState` / `L.sync.syncNow`: the CFB loop against /api/cfb/ledger by default,
 * the NFL loop against /api/nfl/ledger under NflSyncChip's provider; each its own route and
 * blobs, behind the one sync phrase already entered in Settings). Same words for the same
 * states so Josh reads every desk the same way. The desk's hook is called unconditionally —
 * the context value is fixed for a mount.
 */

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CfbSyncChip({ className = "" }: { className?: string }) {
  const L = useLeague();
  const s = L.sync.useSyncState();
  let text: string;
  let tone = "text-muted";
  switch (s.kind) {
    case "off":
      text = `Sync is off — one phrase in Settings keeps the ${L.short} ledger the same on every device`;
      break;
    case "syncing":
      text = `Syncing the ${L.short} ledger…`;
      tone = "text-live";
      break;
    case "synced":
      text = `⟳ Synced · ${s.days} locked day${s.days === 1 ? "" : "s"} · ${clock(s.at)}`;
      tone = "text-pos";
      break;
    case "not-configured":
      text = "Sync needs its one-time Vercel setup — steps are in Settings";
      tone = "text-gold";
      break;
    case "bad-key":
      text = "Sync phrase doesn't match Vercel — fix it in Settings";
      tone = "text-neg";
      break;
    default:
      text = `Sync error — ${s.detail}`;
      tone = "text-neg";
  }
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-(--radius-panel) border border-line bg-surface/60 px-3.5 py-2 text-[11.5px] ${className}`}
      data-testid={`${L.id}-sync-chip`}
    >
      <span className={`min-w-0 ${tone}`}>{text}</span>
      {s.kind !== "off" && (
        <button
          onClick={() => void L.sync.syncNow()}
          disabled={s.kind === "syncing"}
          className="shrink-0 rounded-full border border-line-2 bg-white/[0.04] px-3 py-1 text-[10.5px] font-semibold text-text transition-transform duration-(--dur-fast) hover:bg-white/[0.08] active:scale-[0.96] disabled:opacity-40"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
