import { createContext, useContext } from "react";

export type AuthStatus = "loading" | "signed_out" | "signing_out" | "signed_in";

export type SignInResult = { ok: true } | { ok: false };

export type AuthState = {
  status: AuthStatus;
  /** Opaque Supabase Auth user id of the signed-in person, or null. */
  userId: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
