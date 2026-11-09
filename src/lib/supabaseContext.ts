import { createContext, useContext } from "react";
import type { OursSupabaseClient } from "./supabase";

export const SupabaseContext = createContext<OursSupabaseClient | null>(null);

export function useSupabase(): OursSupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error("useSupabase must be used inside AppProviders.");
  }
  return client;
}
