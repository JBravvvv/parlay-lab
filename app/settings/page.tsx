import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/states";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        sub="Kelly fraction, unit size, bankroll, book preferences, API status"
      />
      <Panel>
        <EmptyState
          title="Arrives in Phase 6"
          body="Includes the API quota readout and the device passcode that guards the spend-money endpoints."
        />
      </Panel>
    </>
  );
}
