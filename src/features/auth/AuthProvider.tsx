import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useSupabase } from "../../lib/supabaseContext";
import { AuthContext, type AuthState, type AuthStatus } from "./authContext";

type Snapshot = { status: AuthStatus; userId: string | null };

/**
 * Owns the Supabase session and the identity boundary. Whenever the identity changes
 * (sign-out, or a different user appearing), private server state is cleared before
 * anything for the next identity can render.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading", userId: null });
  const currentUserId = useRef<string | null>(null);
  const signingOut = useRef(false);

  const applySessionUser = useCallback(
    (userId: string | null) => {
      if (signingOut.current) {
        return;
      }
      if (currentUserId.current !== userId) {
        // Identity changed. Unmount the previous person's private tree first (synchronously),
        // so none of its query observers can re-create a cache entry after the clear.
        if (currentUserId.current !== null) {
          flushSync(() => setSnapshot({ status: "loading", userId: null }));
        }
        // Then drop everything cached for the previous person.
        queryClient.clear();
        currentUserId.current = userId;
      }
      setSnapshot({ status: userId ? "signed_in" : "signed_out", userId });
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      // Do not call other Supabase methods inside this callback.
      if (active) {
        applySessionUser(session?.user.id ?? null);
      }
    });

    client.auth.getSession().then(({ data: sessionData }) => {
      if (active) {
        applySessionUser(sessionData.session?.user.id ?? null);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client, applySessionUser]);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false } : { ok: true };
    },
    [client],
  );

  const signOut = useCallback<AuthState["signOut"]>(async () => {
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    // 1. Unmount the private tree (renders a neutral, content-free state).
    setSnapshot({ status: "signing_out", userId: null });
    // 2. Drop every cached query and mutation before any other identity can render.
    queryClient.clear();
    currentUserId.current = null;
    // 3. End the session; fall back to a local sign-out if the server call fails.
    const { error } = await client.auth.signOut();
    if (error) {
      await client.auth.signOut({ scope: "local" });
    }
    signingOut.current = false;
    setSnapshot({ status: "signed_out", userId: null });
  }, [client, queryClient]);

  const value = useMemo<AuthState>(
    () => ({ ...snapshot, signIn, signOut }),
    [snapshot, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
