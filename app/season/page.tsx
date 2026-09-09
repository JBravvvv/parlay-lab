"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";
import { CFB_ENABLED, CFB_SEASON_ENABLED } from "@/lib/features";
import { CfbSeason } from "@/components/cfb/CfbSeason";

/**
 * /season — SEASON LAB (INSTRUCTION 46, 2026-09-08): season-long College Football props, win
 * totals and season parlays, on the CFB desk only (there is no MLB half — the sport switch is
 * not read here). Both flags off → a plain notice, never a blank page.
 */
export default function SeasonPage() {
  const on = CFB_ENABLED && CFB_SEASON_ENABLED;
  return (
    <>
      <PageHeader
        title="Season Lab"
        eyebrow="College Football"
        chip={<CfbChip />}
        sub="Season-long props and win totals: the model projects every season total from ESPN's tables; you type the book's line and price. Paper tickets, hand-settled."
      />
      {on ? (
        <CfbSeason />
      ) : (
        <Panel>
          <EmptyState title="Season Lab is off" body="Flip CFB_SEASON_ENABLED in src/lib/features.ts to bring it back." />
        </Panel>
      )}
    </>
  );
}

function CfbChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cfb/40 bg-cfb/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cfb">
      🏈 CFB
    </span>
  );
}
