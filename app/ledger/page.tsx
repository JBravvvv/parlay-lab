import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function LedgerPage() {
  return (
    <>
      <PageHeader
        title="Ledger"
        sub="Locked cards, auto-grading, CLV, season ROI and bankroll history"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 3"
          body="Your real ledger stays in the old app until cutover — nothing is lost. A one-time import brings it here when this page is ready."
        />
      </Panel>
    </>
  );
}
