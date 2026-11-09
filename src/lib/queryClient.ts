import { QueryClient } from "@tanstack/react-query";

/** In-memory only: private server state is never persisted to browser storage. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: true,
        staleTime: 15_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
