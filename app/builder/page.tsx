import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function BuilderPage() {
  return (
    <>
      <PageHeader
        title="Parlay Builder"
        sub="True probability vs offered odds, fair price, EV, correlation flags — plus Today's Card, FUN money, and Lock"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 5"
          body="Same engine, same locked rules (no repeated picks, HR props only with HR props, exact-sum daily allocation) — rebuilt as a proper builder."
        />
      </Panel>
    </>
  );
}
