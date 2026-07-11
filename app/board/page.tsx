import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function BoardPage() {
  return (
    <>
      <PageHeader
        title="Board"
        sub="Consensus de-vigged probability vs the Caesars line — EV%, edge highlighting, market filters"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 2"
          body="The board connects to the odds proxy (server-cached, quota-safe) and renders every playable pick with consensus fair value vs the gold Caesars price."
        />
      </Panel>
    </>
  );
}
