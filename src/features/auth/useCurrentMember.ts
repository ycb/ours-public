import { useQuery } from "@tanstack/react-query";
import { MemberMappingError, OperationError } from "../../lib/errors";
import { useSupabase } from "../../lib/supabaseContext";
import type { Tables } from "../../types/database";
import { useAuth } from "./authContext";

export type CurrentMember = Tables<"members">;

export const currentMemberQueryKey = (userId: string | null) =>
  ["current-member", userId] as const;

function isMemberFor(value: unknown, userId: string): value is CurrentMember {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Partial<Record<keyof CurrentMember, unknown>>;
  return (
    typeof row.id === "string" &&
    typeof row.couple_id === "string" &&
    typeof row.display_name === "string" &&
    row.auth_user_id === userId
  );
}

/**
 * Resolves the signed-in user to exactly one member via get_current_member().
 * Anything else — no row, an all-null row, or a row for a different auth user — fails closed.
 */
export function useCurrentMember() {
  const client = useSupabase();
  const { status, userId } = useAuth();

  return useQuery({
    queryKey: currentMemberQueryKey(userId),
    enabled: status === "signed_in" && userId !== null,
    retry: (failureCount, error) => !(error instanceof MemberMappingError) && failureCount < 1,
    queryFn: async (): Promise<CurrentMember> => {
      const { data, error } = await client.rpc("get_current_member");
      if (error) {
        throw new OperationError("get_current_member");
      }
      if (!userId || !isMemberFor(data, userId)) {
        throw new MemberMappingError();
      }
      return data;
    },
  });
}
