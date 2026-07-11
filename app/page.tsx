import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, Skeleton, SkeletonRows } from "@/components/ui/states";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        sub="Bankroll, season ROI, today's top edges, The Sharp's featured play"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Bankroll">
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-12 w-24" />
          </div>
        </Panel>
        <Panel title="Season ROI">
          <Skeleton className="h-24 w-full" />
        </Panel>
        <Panel title="The Sharp — featured" className="md:col-span-2 xl:col-span-1">
          <SkeletonRows rows={3} />
        </Panel>
        <Panel title="Today's top edges" className="md:col-span-2 xl:col-span-3">
          <EmptyState
            title="Wired up in Phase 3"
            body="This dashboard fills with live data once the Board and Ledger pages are connected to the engine. The current app at jbravvvv.github.io/parlay-lab stays fully working in the meantime."
          />
        </Panel>
      </div>
    </>
  );
}
