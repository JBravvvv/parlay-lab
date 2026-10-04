"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState, type ReactNode } from "react";
import { WorkspaceSession } from "@/components/shell/WorkspaceSession";
import { PlayerSheetProvider } from "@/components/player/PlayerSheet";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 4 * 60_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={null}><WorkspaceSession><PlayerSheetProvider>{children}</PlayerSheetProvider></WorkspaceSession></Suspense>
    </QueryClientProvider>
  );
}
