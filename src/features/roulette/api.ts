import type { Tables } from "../../types/database";
import { OperationError, toOperationError } from "../../lib/errors";
import type { OursSupabaseClient } from "../../lib/supabase";

export type RouletteCandidate = Pick<Tables<"items">, "id" | "title" | "description" | "category_id">;
export type RouletteDraw = Tables<"roulette_draws">;
export type RouletteOutcome = "accepted" | "deferred";

export async function drawRoulette(client: OursSupabaseClient, categoryId: string | null, favoritesOnly = false) {
  const { data, error } = await client.rpc("draw_roulette", {
    p_filter_category_id: categoryId as string,
    p_favorites_only: favoritesOnly,
  });
  if (error) throw toOperationError("draw_roulette", error);
  return (data?.[0] ?? null) as RouletteCandidate | null;
}

export async function recordRouletteOutcome(
  client: OursSupabaseClient,
  input: { requestId: string; itemId: string; categoryId: string | null; outcome: RouletteOutcome },
) {
  const { data, error } = await client.rpc("record_roulette_outcome", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_filter_category_id: input.categoryId as string,
    p_outcome: input.outcome,
  });
  if (error || !data) throw toOperationError("record_roulette_outcome", error);
  return data;
}

export const isUnavailableCandidate = (error: unknown) =>
  error instanceof OperationError && error.code === "OU410";

/** The category being spun from was archived (or is no longer this couple's). */
export const isUnavailableCategory = (error: unknown) =>
  error instanceof OperationError && error.code === "OU411";
