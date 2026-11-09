import type { InboxMoment } from "../../domain/inbox";
import type { Interest, LibraryItem, RouletteDecision } from "../../domain/model";
import { toOperationError } from "../../lib/errors";
import type { OursSupabaseClient } from "../../lib/supabase";
import type { Tables } from "../../types/database";

/**
 * Palette reads use RLS-scoped selects; every write goes through a narrow database function
 * that derives actor and couple itself. Callers never pass member or couple ids for attribution.
 */

export type Category = Pick<Tables<"categories">, "id" | "name" | "sort_order">;
export type PartnerSummary = Pick<Tables<"members">, "id" | "display_name" | "sort_order">;
export type Item = Tables<"items">;

export async function listCategories(client: OursSupabaseClient): Promise<Category[]> {
  const { data, error } = await client
    .from("categories")
    .select("id, name, sort_order")
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  if (error) throw toOperationError("list_categories", error);
  return [...(data ?? [])].sort(
    (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name),
  );
}

export async function createCategory(
  client: OursSupabaseClient,
  input: { requestId: string; name: string },
): Promise<Category> {
  const { data, error } = await client.rpc("create_category", {
    p_request_id: input.requestId,
    p_name: input.name.trim(),
  });
  if (error || !data) throw toOperationError("create_category", error);
  return { id: data.id, name: data.name, sort_order: data.sort_order };
}

export async function listPartners(client: OursSupabaseClient): Promise<PartnerSummary[]> {
  const { data, error } = await client
    .from("members")
    .select("id, display_name, sort_order")
    .order("sort_order");
  if (error) throw toOperationError("list_partners", error);
  return [...(data ?? [])].sort((left, right) => left.sort_order - right.sort_order);
}

export async function listLibraryItems(client: OursSupabaseClient): Promise<LibraryItem[]> {
  const [items, responses] = await Promise.all([
    client
      .from("items")
      .select("id, title, category_id, creator_member_id, created_at, updated_at, archived_at, status, submitted_at")
      .is("archived_at", null),
    client.from("item_responses").select("item_id, member_id, interest, is_favorite, roulette_decision"),
  ]);
  if (items.error) throw toOperationError("list_items", items.error);
  if (responses.error) throw toOperationError("list_item_responses", responses.error);

  const byItem = new Map<string, LibraryItem["responses"]>();
  for (const response of responses.data ?? []) {
    const list = byItem.get(response.item_id) ?? [];
    list.push({
      member_id: response.member_id,
      interest: response.interest as Interest | null,
      is_favorite: response.is_favorite,
      roulette_decision: response.roulette_decision as RouletteDecision,
    });
    byItem.set(response.item_id, list);
  }

  return (items.data ?? []).map((item) => ({ ...item, responses: byItem.get(item.id) ?? [] }));
}

export type CreateItemInput = {
  requestId: string;
  title: string;
  description: string;
  categoryId: string;
  sourceItemId?: string | null;
  sourceMemoryId?: string | null;
};

export async function createItem(client: OursSupabaseClient, input: CreateItemInput): Promise<Item> {
  const { data, error } = await client.rpc("create_item", {
    p_request_id: input.requestId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category_id: input.categoryId,
    ...(input.sourceItemId ? { p_source_item_id: input.sourceItemId } : {}),
    ...(input.sourceMemoryId ? { p_source_memory_id: input.sourceMemoryId } : {}),
  });
  if (error || !data) throw toOperationError("create_item", error);
  return data;
}

export async function updateItem(
  client: OursSupabaseClient,
  input: {
    itemId: string;
    title: string;
    description: string;
    categoryId: string;
    /** The updated_at the editor loaded. A newer server version rejects the save (OU409). */
    expectedUpdatedAt?: string | null;
  },
): Promise<Item> {
  const { data, error } = await client.rpc("update_item", {
    p_item_id: input.itemId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category_id: input.categoryId,
    ...(input.expectedUpdatedAt ? { p_expected_updated_at: input.expectedUpdatedAt } : {}),
  });
  if (error || !data) throw toOperationError("update_item", error);
  return data;
}

const hasCode = (error: unknown, code: string) =>
  error instanceof Error && "code" in error && (error as { code: unknown }).code === code;

/** A co-edit saved from an older version than the server's (update_item, OU409). */
export const isStaleEdit = (error: unknown) => hasCode(error, "OU409");

/** delete_item refused because memories, draws, or remixes depend on the item (OU423). */
export const isDeleteRefused = (error: unknown) => hasCode(error, "OU423");

/** Shares a draft with the partner. Sharing is the author's Ready. */
export async function submitItem(client: OursSupabaseClient, itemId: string): Promise<Item> {
  const { data, error } = await client.rpc("submit_item", { p_item_id: itemId });
  if (error || !data) throw toOperationError("submit_item", error);
  return data;
}

/** Permanent. Refused by the database when memories, draws, or remixes depend on the item. */
export async function deleteItem(client: OursSupabaseClient, itemId: string): Promise<void> {
  const { data, error } = await client.rpc("delete_item", { p_item_id: itemId });
  if (error || !data) throw toOperationError("delete_item", error);
}

export async function archiveItem(client: OursSupabaseClient, itemId: string): Promise<Item> {
  const { data, error } = await client.rpc("archive_item", { p_item_id: itemId });
  if (error || !data) throw toOperationError("archive_item", error);
  return data;
}

// ---- Task 6: item detail, responses, comments, history ----

export type ItemDetail = Pick<
  Tables<"items">,
  | "id"
  | "title"
  | "description"
  | "category_id"
  | "creator_member_id"
  | "source_item_id"
  | "source_memory_id"
  | "created_at"
  | "updated_at"
  | "archived_at"
  | "status"
  | "submitted_at"
>;
export type ItemLink = Pick<Tables<"items">, "id" | "title" | "archived_at">;
export type ItemResponse = Pick<
  Tables<"item_responses">,
  "id" | "member_id" | "interest" | "is_favorite" | "roulette_decision" | "updated_at"
>;
export type Comment = Pick<Tables<"comments">, "id" | "author_member_id" | "body" | "created_at" | "kind">;
export type Revision = Pick<
  Tables<"item_revisions">,
  "id" | "revision_number" | "editor_member_id" | "title" | "description" | "category_id" | "created_at"
>;
export type Memory = Pick<
  Tables<"memories">,
  "id" | "author_member_id" | "body" | "highlight" | "next_time" | "refinement" | "draw_id" | "created_at"
>;

export type ItemDetailBundle = {
  item: ItemDetail;
  responses: ItemResponse[];
  source: ItemLink | null;
  remixes: ItemLink[];
};

const ITEM_DETAIL_FIELDS =
  "id, title, description, category_id, creator_member_id, source_item_id, source_memory_id, created_at, updated_at, archived_at, status, submitted_at";

/** Returns null when the item does not exist or RLS hides it; callers render a neutral not-found. */
export async function getItemDetail(client: OursSupabaseClient, itemId: string): Promise<ItemDetailBundle | null> {
  const [items, responses, remixes] = await Promise.all([
    client.from("items").select(ITEM_DETAIL_FIELDS).eq("id", itemId).limit(1),
    client
      .from("item_responses")
      .select("id, member_id, interest, is_favorite, roulette_decision, updated_at")
      .eq("item_id", itemId),
    client.from("items").select("id, title, archived_at").eq("source_item_id", itemId),
  ]);
  if (items.error) throw toOperationError("get_item", items.error);
  if (responses.error) throw toOperationError("get_item_responses", responses.error);
  if (remixes.error) throw toOperationError("get_item_remixes", remixes.error);

  const item = items.data?.[0];
  if (!item) return null;

  let source: ItemLink | null = null;
  if (item.source_item_id) {
    const sourceRows = await client
      .from("items")
      .select("id, title, archived_at")
      .eq("id", item.source_item_id)
      .limit(1);
    if (sourceRows.error) throw toOperationError("get_item_source", sourceRows.error);
    source = sourceRows.data?.[0] ?? null;
  }

  return { item, responses: responses.data ?? [], source, remixes: remixes.data ?? [] };
}

export async function listComments(client: OursSupabaseClient, itemId: string): Promise<Comment[]> {
  const { data, error } = await client
    .from("comments")
    .select("id, author_member_id, body, created_at, kind")
    .eq("item_id", itemId)
    .order("created_at");
  if (error) throw toOperationError("list_comments", error);
  return [...(data ?? [])].sort(
    (left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  );
}

export async function listRevisions(client: OursSupabaseClient, itemId: string): Promise<Revision[]> {
  const { data, error } = await client
    .from("item_revisions")
    .select("id, revision_number, editor_member_id, title, description, category_id, created_at")
    .eq("item_id", itemId)
    .order("revision_number");
  if (error) throw toOperationError("list_revisions", error);
  return [...(data ?? [])].sort((left, right) => right.revision_number - left.revision_number);
}

export async function listItemMemories(client: OursSupabaseClient, itemId: string): Promise<Memory[]> {
  const { data, error } = await client
    .from("memories")
    .select("id, author_member_id, body, highlight, next_time, refinement, draw_id, created_at")
    .eq("item_id", itemId)
    .order("created_at");
  if (error) throw toOperationError("list_memories", error);
  return [...(data ?? [])].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/** Each response signal has its own function so one can never overwrite another. */
export async function setInterest(client: OursSupabaseClient, itemId: string, interest: Interest | null) {
  const { data, error } = await client.rpc("set_item_interest", {
    p_item_id: itemId,
    p_interest: interest as Interest,
  });
  if (error || !data) throw toOperationError("set_item_interest", error);
  return data;
}

export async function setFavorite(client: OursSupabaseClient, itemId: string, favorite: boolean) {
  const { data, error } = await client.rpc("set_item_favorite", { p_item_id: itemId, p_favorite: favorite });
  if (error || !data) throw toOperationError("set_item_favorite", error);
  return data;
}

export async function setRouletteDecision(
  client: OursSupabaseClient,
  itemId: string,
  decision: RouletteDecision,
) {
  const { data, error } = await client.rpc("set_roulette_decision", { p_item_id: itemId, p_decision: decision });
  if (error || !data) throw toOperationError("set_roulette_decision", error);
  return data;
}

export async function addComment(
  client: OursSupabaseClient,
  input: { requestId: string; itemId: string; body: string },
): Promise<Comment> {
  const { data, error } = await client.rpc("add_comment", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_body: input.body.trim(),
  });
  if (error || !data) throw toOperationError("add_comment", error);
  return data;
}

/** Moves an idea to Later. An optional note is posted into its conversation; none, nothing is posted. */
/** Not for us: archives the idea for both of you, with an optional note in the chat. */
export async function passItem(
  client: OursSupabaseClient,
  input: { requestId: string; itemId: string; note: string },
): Promise<Item> {
  const { data, error } = await client.rpc("pass_item", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_note: input.note.trim(),
  });
  if (error || !data) throw toOperationError("pass_item", error);
  return data;
}

export async function declineItem(
  client: OursSupabaseClient,
  input: { requestId: string; itemId: string; reason: string },
): Promise<ItemResponse> {
  const { data, error } = await client.rpc("decline_item", {
    p_request_id: input.requestId,
    p_item_id: input.itemId,
    p_reason: input.reason.trim(),
  });
  if (error || !data) throw toOperationError("decline_item", error);
  return data;
}

export type ItemView = Pick<Tables<"item_views">, "item_id" | "first_seen_at" | "last_seen_at">;

/** RLS returns only the caller's own rows. */
export async function listMyItemViews(client: OursSupabaseClient): Promise<ItemView[]> {
  const { data, error } = await client.from("item_views").select("item_id, first_seen_at, last_seen_at");
  if (error) throw toOperationError("list_item_views", error);
  return data ?? [];
}

export async function markItemSeen(client: OursSupabaseClient, itemId: string): Promise<ItemView> {
  const { data, error } = await client.rpc("mark_item_seen", { p_item_id: itemId });
  if (error || !data) throw toOperationError("mark_item_seen", error);
  return data;
}

export async function listItemActivityEventIds(client: OursSupabaseClient, itemId: string): Promise<string[]> {
  const { data, error } = await client.from("activity_events").select("id").eq("item_id", itemId);
  if (error) throw toOperationError("list_item_activity_event_ids", error);
  return (data ?? []).map((event) => event.id);
}

export async function markItemSeenThroughEvents(
  client: OursSupabaseClient,
  itemId: string,
  activityEventIds: string[],
): Promise<ItemView> {
  const { data, error } = await client.rpc("mark_item_seen_through_events", {
    p_item_id: itemId,
    p_activity_event_ids: activityEventIds,
  });
  if (error || !data) throw toOperationError("mark_item_seen_through_events", error);
  return data;
}

export type InboxMessage = {
  item_id: string;
  author_member_id: string;
  body: string;
  kind: "message" | "not_now_reason";
  created_at: string;
};

/** Every visible message, for unread state and each row's latest-activity line. */
export async function listInboxMessages(client: OursSupabaseClient): Promise<InboxMessage[]> {
  const { data, error } = await client.from("comments").select("item_id, author_member_id, body, kind, created_at");
  if (error) throw toOperationError("list_inbox_messages", error);
  return (data ?? []).map((row) => ({ ...row, kind: row.kind === "not_now_reason" ? "not_now_reason" : "message" }));
}

/** Accepted picks (who said Let's do it, and when), for Plan rows. No content. */
export async function listInboxPicks(client: OursSupabaseClient): Promise<InboxMoment[]> {
  const { data, error } = await client
    .from("roulette_draws")
    .select("item_id, drawn_by_member_id, created_at")
    .eq("outcome", "accepted");
  if (error) throw toOperationError("list_inbox_picks", error);
  return (data ?? []).map((row) => ({ item_id: row.item_id, by: row.drawn_by_member_id, at: row.created_at }));
}

/** Who added a memory, to which date, and when (no content): Plan rows and who still owes a reflection. */
export async function listInboxMemories(
  client: OursSupabaseClient,
): Promise<Array<InboxMoment & { draw_id: string | null }>> {
  const { data, error } = await client.from("memories").select("item_id, draw_id, author_member_id, created_at");
  if (error) throw toOperationError("list_inbox_memories", error);
  return (data ?? []).map((row) => ({ item_id: row.item_id, draw_id: row.draw_id, by: row.author_member_id, at: row.created_at }));
}

export type RevisionStamp = Pick<Tables<"item_revisions">, "item_id" | "editor_member_id" | "revision_number" | "created_at">;

/** Who edited what, and when (no content), for "Alex edited your wording". */
export async function listRevisionStamps(client: OursSupabaseClient): Promise<RevisionStamp[]> {
  const { data, error } = await client
    .from("item_revisions")
    .select("item_id, editor_member_id, revision_number, created_at");
  if (error) throw toOperationError("list_revision_stamps", error);
  return data ?? [];
}
