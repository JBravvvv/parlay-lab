"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
      <PlayerSheetProvider>{children}</PlayerSheetProvider>
    </QueryClientProvider>
  );
}
