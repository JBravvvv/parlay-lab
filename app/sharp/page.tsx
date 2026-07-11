import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function SharpPage() {
  return (
    <>
      <PageHeader
        title="The Sharp"
        sub="Structured pick cards — the play, the edge, the reasoning, the stake"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 5"
          body="The Sharp moves behind a server-side Claude proxy (your key never ships to the browser) and renders structured pick cards with confidence and suggested ¼-Kelly stakes."
        />
      </Panel>
    </>
  );
}
