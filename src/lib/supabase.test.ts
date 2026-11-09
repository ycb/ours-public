import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./errors";
import { readSupabaseConfig } from "./supabase";

describe("Supabase browser configuration", () => {
  it("reads only the URL and publishable key", () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "http://127.0.0.1:54421",
        VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
        VITE_SUPABASE_SERVICE_ROLE_KEY: "must-not-be-read",
      }),
    ).toEqual({ url: "http://127.0.0.1:54421", publishableKey: "synthetic-publishable-key" });
  });

  it.each([
    [{}],
    [{ VITE_SUPABASE_URL: "http://127.0.0.1:54421" }],
    [{ VITE_SUPABASE_URL: " ", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key" }],
  ])("throws a content-free configuration error when values are missing (%#)", (env) => {
    expect(() => readSupabaseConfig(env)).toThrow(ConfigurationError);
    try {
      readSupabaseConfig(env);
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/127\.0\.0\.1|synthetic/);
    }
  });

  it("rejects a non-http(s) URL without echoing it", () => {
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: "javascript:alert(1)",
        VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      }),
    ).toThrow(/configuration/i);
  });
});
