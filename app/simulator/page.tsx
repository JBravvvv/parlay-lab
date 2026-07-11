import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function SimulatorPage() {
  return (
    <>
      <PageHeader
        title="Simulator"
        sub="Monte Carlo game sims — win distributions, fair lines, convergence"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 4"
          body="The existing Monte Carlo engine gets a real UI: pick a game, adjust inputs, watch the distribution build."
        />
      </Panel>
    </>
  );
}
