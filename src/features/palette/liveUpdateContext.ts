import { createContext, useContext } from "react";

export type LiveActivityEvent = Readonly<{
  id: string;
  itemId: string | null;
  eventType: string;
}>;

export type LiveUpdateSnapshot = Readonly<{
  sequence: number;
  events: readonly LiveActivityEvent[];
}>;

export const LiveUpdateContext = createContext<LiveUpdateSnapshot | null>(null);

/** The latest immutable activity snapshot whose protected refetch completed successfully. */
export function useLiveUpdateSnapshot() {
  return useContext(LiveUpdateContext);
}
