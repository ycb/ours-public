import type { DateRow, DateWhen } from "../../domain/dates";
import { reflectAfter } from "../../domain/dates";
import { toOperationError } from "../../lib/errors";
import type { OursSupabaseClient } from "../../lib/supabase";

const DATE_FIELDS = "id, item_id, drawn_by_member_id, source, planned_when, reflect_after, done_at, cancelled_at, created_at";

/** Every accepted pick of ours, as a date. Ids, times and whens only. */
export async function listDates(client: OursSupabaseClient): Promise<DateRow[]> {
  const { data, error } = await client.from("roulette_draws").select(DATE_FIELDS).eq("outcome", "accepted");
  if (error) throw toOperationError("list_dates", error);
  return (data ?? []) as DateRow[];
}

const askAt = (when: DateWhen) => reflectAfter(when, new Date())?.toISOString() ?? null;

/** Plan this: choose an agreed idea directly. One request id per attempt, so a retry plans once. */
export async function planItem(client: OursSupabaseClient, input: { requestId: string; itemId: string; when: DateWhen }) {
  const { data, error } = await client.rpc("plan_item", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_when: input.when,
    p_reflect_after: askAt(input.when) as string,
  });
  if (error || !data) throw toOperationError("plan_item", error);
  return data;
}

export async function setDrawWhen(client: OursSupabaseClient, drawId: string, when: DateWhen) {
  const { data, error } = await client.rpc("set_draw_when", {
    p_draw_id: drawId,
    p_when: when,
    p_reflect_after: askAt(when) as string,
  });
  if (error || !data) throw toOperationError("set_draw_when", error);
  return data;
}

export async function markDrawDone(client: OursSupabaseClient, drawId: string) {
  const { data, error } = await client.rpc("mark_draw_done", { p_draw_id: drawId });
  if (error || !data) throw toOperationError("mark_draw_done", error);
  return data;
}

export async function cancelDraw(client: OursSupabaseClient, drawId: string) {
  const { data, error } = await client.rpc("cancel_draw", { p_draw_id: drawId });
  if (error || !data) throw toOperationError("cancel_draw", error);
  return data;
}
