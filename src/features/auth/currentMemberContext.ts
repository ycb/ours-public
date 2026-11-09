import { createContext, useContext } from "react";
import type { CurrentMember } from "./useCurrentMember";

export const CurrentMemberContext = createContext<CurrentMember | null>(null);

/** The validated member for the signed-in person. Only available inside the private tree. */
export function useMember(): CurrentMember {
  const member = useContext(CurrentMemberContext);
  if (!member) {
    throw new Error("useMember must be used inside the authenticated app shell.");
  }
  return member;
}
