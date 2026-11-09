import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSupabase } from "../../lib/supabaseContext";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import type { LiveActivityEvent, LiveUpdateSnapshot } from "./liveUpdateContext";

/** Bursts of events (an edit resets a decision, a share records a response) refetch once. */
const SETTLE_MS = 250;

/**
 * Live updates. Listens for new activity_events rows (content-free by schema, RLS-scoped by
 * Realtime) and treats each one only as a "something changed" signal: it copies only the opaque
 * event tuple, ignores content-like fields, and refetches through the normal RLS-scoped queries.
 * Mounted inside the signed-in shell, so the subscription closes on sign-out or identity change.
 */
function activityFromPayload(payload: unknown): LiveActivityEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const record = "new" in payload ? (payload as { new?: unknown }).new : null;
  if (!record || typeof record !== "object") return null;
  const { id, item_id: itemId, event_type: eventType } = record as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    (typeof itemId !== "string" && itemId !== null) ||
    typeof eventType !== "string"
  ) {
    return null;
  }
  return Object.freeze({ id, itemId, eventType });
}

export function useLiveUpdates(identityKey: string): LiveUpdateSnapshot | null {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [published, setPublished] = useState<{ identityKey: string; snapshot: LiveUpdateSnapshot } | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let settledWhileRunning = false;
    let sequence = 0;
    let pending = new Map<string, LiveActivityEvent>();

    const refreshProtectedData = async () => {
      const results = await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }, { throwOnError: true }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }, { throwOnError: true }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }, { throwOnError: true }),
      ]);
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("protected refresh failed");
      }
    };

    const runCycle = async () => {
      if (!active || running || pending.size === 0) return;
      running = true;
      settledWhileRunning = false;
      const cycle = pending;
      pending = new Map();
      let succeeded = false;

      try {
        await refreshProtectedData();
        if (active) {
          const events = Object.freeze([...cycle.values()]);
          setPublished({ identityKey, snapshot: Object.freeze({ sequence: ++sequence, events }) });
          succeeded = true;
        }
      } catch {
        // Keep the failed immutable cycle available for a later event-triggered retry. Events
        // received during the failed refetch remain newer entries in the fresh accumulator.
        pending = new Map([...cycle, ...pending]);
      } finally {
        running = false;
        if (active && pending.size > 0) {
          if (settledWhileRunning) {
            void runCycle();
          } else if (succeeded && !timer) {
            timer = setTimeout(onSettled, SETTLE_MS);
          }
        }
      }
    };

    const onSettled = () => {
      timer = undefined;
      if (running) {
        settledWhileRunning = true;
        return;
      }
      void runCycle();
    };

    const collect = (payload: unknown) => {
      const event = activityFromPayload(payload);
      if (!event) return;
      pending.set(event.id, event);
      clearTimeout(timer);
      settledWhileRunning = false;
      timer = setTimeout(onSettled, SETTLE_MS);
    };

    const channel = client
      .channel("ours-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, collect)
      .subscribe();
    return () => {
      active = false;
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [client, identityKey, queryClient]);

  return published?.identityKey === identityKey ? published.snapshot : null;
}
