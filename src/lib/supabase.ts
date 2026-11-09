import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { ConfigurationError } from "./errors";

export type OursSupabaseClient = SupabaseClient<Database>;

export type SupabaseConfig = { url: string; publishableKey: string };

type BrowserEnv = Record<string, string | boolean | undefined>;

/** Reads only the two public browser values. Never logs or echoes them. */
export function readSupabaseConfig(env: BrowserEnv): SupabaseConfig {
  const url = typeof env.VITE_SUPABASE_URL === "string" ? env.VITE_SUPABASE_URL.trim() : "";
  const publishableKey =
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
      ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : "";

  if (!url || !publishableKey) {
    throw new ConfigurationError();
  }

  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new ConfigurationError();
  }
  if (protocol !== "https:" && protocol !== "http:") {
    throw new ConfigurationError();
  }

  return { url, publishableKey };
}

export function createSupabaseBrowserClient(config: SupabaseConfig): OursSupabaseClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      // Alpha convenience: stay signed in across visits. Passwords and content are never persisted.
      persistSession: true,
      autoRefreshToken: true,
      // No magic links, invitations, or recovery flows exist in the alpha.
      detectSessionInUrl: false,
      storageKey: "ours-auth",
    },
  });
}
