import type { Enums } from "../types/database";

export type Interest = Enums<"interest">;
export type RouletteDecision = Enums<"roulette_decision">;
export type RouletteState = RouletteDecision;

/** Database CHECK bounds (see core_schema migration). */
export const ITEM_LIMITS = { title: 120, description: 4000 } as const;
export const CATEGORY_NAME_LIMIT = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export const INTEREST_VALUES: readonly Interest[] = ["low", "curious", "into_it", "very_into_it"];
export const ROULETTE_DECISIONS: readonly RouletteDecision[] = ["pending", "ready", "not_now"];

/**
 * Derived, never stored. Ready only when exactly two partners are both ready; "not now" from
 * either partner wins over pending.
 */
export function deriveRouletteState(decisions: readonly RouletteDecision[]): RouletteState {
  if (decisions.length !== 2) return "pending";
  // Later is mutual (QA 2026-11-03): one person's Later is a suggestion, not a move.
  if (decisions.every((decision) => decision === "not_now")) return "not_now";
  if (decisions.every((decision) => decision === "ready")) return "ready";
  return "pending";
}

export type LibraryResponse = {
  member_id: string;
  interest: Interest | null;
  is_favorite: boolean;
  roulette_decision: RouletteDecision;
};

export type ItemStatus = Enums<"item_status">;

export type LibraryItem = {
  id: string;
  title: string;
  status?: ItemStatus;
  submitted_at?: string | null;
  category_id: string;
  creator_member_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  responses: LibraryResponse[];
};

export type InterestFilter = { memberId: string; value: Interest | "unrated" };

export type ItemDraft = { title: string; description: string; categoryId: string };
export type DraftError = "required" | "too_long";
export type DraftErrors = Partial<Record<keyof ItemDraft, DraftError>>;

/** Postgres char_length counts code points; String#length counts UTF-16 units. */
export const charLength = (value: string) => Array.from(value).length;

export function validateItemDraft(draft: ItemDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (!title) errors.title = "required";
  else if (charLength(title) > ITEM_LIMITS.title) errors.title = "too_long";
  // Quick add (QA 2026-11-03): a title is enough; details can come later.
  if (charLength(description) > ITEM_LIMITS.description) errors.description = "too_long";
  if (!isUuid(draft.categoryId)) errors.categoryId = "required";
  return errors;
}

// ---- Interaction model v2: per-viewer stage, unread messages, library views ----

/**
 * Where an idea stands for the person looking at it.
 * draft: mine, unshared · new: theirs, never opened · needs_decision: my decision is pending
 * (including after my partner edited my item) · waiting: I'm ready, my partner isn't ·
 * ready: both ready · not_now: both chose Later.
 */
export type ViewerStage = "draft" | "new" | "needs_decision" | "waiting" | "ready" | "not_now";

export function deriveViewerStage(input: {
  status: ItemStatus | undefined;
  creatorId: string;
  responses: readonly Pick<LibraryResponse, "member_id" | "roulette_decision">[];
  memberId: string;
  /** My last visit to this item, or null if I've never opened it. */
  seenAt: string | null;
}): ViewerStage {
  if (input.status === "draft") return "draft";
  const decisions = input.responses.map((response) => response.roulette_decision);
  const overall = deriveRouletteState(decisions);
  if (overall === "not_now") return "not_now";
  if (overall === "ready") return "ready";
  const mine = input.responses.find((response) => response.member_id === input.memberId);
  if (!mine || mine.roulette_decision === "pending") {
    return input.creatorId !== input.memberId && input.seenAt === null ? "new" : "needs_decision";
  }
  // My partner suggested Later and I haven't: answering that is my turn.
  const theirs = input.responses.find((response) => response.member_id !== input.memberId);
  if (theirs?.roulette_decision === "not_now" && mine.roulette_decision !== "not_now") return "needs_decision";
  return "waiting";
}

export type MessageStampLike = { item_id: string; author_member_id: string; created_at: string };

export function hasUnreadMessages(
  stamps: readonly MessageStampLike[],
  memberId: string,
  seenAt: string | null,
): boolean {
  return stamps.some(
    (stamp) => stamp.author_member_id !== memberId && (seenAt === null || stamp.created_at > seenAt),
  );
}
