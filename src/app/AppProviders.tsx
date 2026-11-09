import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "../features/auth/AuthProvider";
import { createQueryClient } from "../lib/queryClient";
import type { OursSupabaseClient } from "../lib/supabase";
import { SupabaseContext } from "../lib/supabaseContext";

type AppProvidersProps = {
  client: OursSupabaseClient;
  queryClient?: QueryClient;
  children: ReactNode;
};

export function AppProviders({ client, queryClient, children }: AppProvidersProps) {
  const [ownQueryClient] = useState(() => queryClient ?? createQueryClient());

  return (
    <SupabaseContext.Provider value={client}>
      <QueryClientProvider client={ownQueryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </SupabaseContext.Provider>
  );
}
