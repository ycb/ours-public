import { charLength } from "../../domain/model";
import { toOperationError } from "../../lib/errors";
import type { OursSupabaseClient } from "../../lib/supabase";
import type { Memory } from "../palette/api";

export type MemoryNextTime = "repeat" | "refine";

/** Mirrors memories_*_check: trimmed, bounded; what you enjoyed (body) or what to change (refinement). */
export const MEMORY_LIMITS = { body: 4000, highlight: 1000, refinement: 1000 } as const;

export type MemoryDraft = { body: string; highlight: string; nextTime: MemoryNextTime | ""; refinement: string };
export type MemoryErrors = Partial<Record<"body" | "highlight" | "refinement" | "either", "required" | "too_long">>;

export const EMPTY_MEMORY: MemoryDraft = { body: "", highlight: "", nextTime: "", refinement: "" };

export function validateMemory(draft: MemoryDraft): MemoryErrors {
  const errors: MemoryErrors = {};
  const body = draft.body.trim();
  // QA 2026-11-03: either answer is enough, but not neither.
  if (!body && !draft.refinement.trim()) errors.either = "required";
  if (charLength(body) > MEMORY_LIMITS.body) errors.body = "too_long";
  if (charLength(draft.highlight.trim()) > MEMORY_LIMITS.highlight) errors.highlight = "too_long";
  if (charLength(draft.refinement.trim()) > MEMORY_LIMITS.refinement) errors.refinement = "too_long";
  return errors;
}

const optional = (value: string) => value.trim() || null;

/** The author and couple come from the session on the server; a retry with the same request id returns the same memory. */
export async function addMemory(
  client: OursSupabaseClient,
  input: { requestId: string; itemId: string; drawId: string | null; draft: MemoryDraft },
): Promise<Memory> {
  // Optional parameters are nullable in SQL; the generated types do not say so.
  const { data, error } = await client.rpc("add_memory", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_draw_id: input.drawId as string,
    p_body: input.draft.body.trim(),
    p_highlight: optional(input.draft.highlight) as string,
    p_next_time: (input.draft.nextTime || null) as MemoryNextTime,
    p_refinement: optional(input.draft.refinement) as string,
  });
  if (error || !data) throw toOperationError("add_memory", error);
  return data;
}
