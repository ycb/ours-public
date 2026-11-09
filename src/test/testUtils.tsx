import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AppProviders } from "../app/AppProviders";
import { appRoutes } from "../app/routes";
import { createQueryClient } from "../lib/queryClient";
import type { OursSupabaseClient } from "../lib/supabase";

export const SYNTHETIC_COUPLE_ID = "00000000-0000-4000-8000-0000000000c0";

export const PARTNER_A = {
  userId: "00000000-0000-4000-8000-0000000000a1",
  email: "synthetic-partner-a@ours.invalid",
  member: {
    id: "00000000-0000-4000-8000-0000000000a0",
    couple_id: SYNTHETIC_COUPLE_ID,
    auth_user_id: "00000000-0000-4000-8000-0000000000a1",
    display_name: "Synthetic Partner A",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00+00:00",
  },
};

export const PARTNER_B = {
  userId: "00000000-0000-4000-8000-0000000000b2",
  email: "synthetic-partner-b@ours.invalid",
  member: {
    id: "00000000-0000-4000-8000-0000000000b0",
    couple_id: SYNTHETIC_COUPLE_ID,
    auth_user_id: "00000000-0000-4000-8000-0000000000b2",
    display_name: "Synthetic Partner B",
    sort_order: 1,
    created_at: "2026-01-01T00:00:00+00:00",
  },
};

type SyntheticPartner = typeof PARTNER_A;
type AuthListener = (event: string, session: FakeSession | null) => void;
type FakeSession = { access_token: string; user: { id: string; email: string } };

const sessionFor = (partner: SyntheticPartner): FakeSession => ({
  access_token: `synthetic-token-${partner.userId}`,
  user: { id: partner.userId, email: partner.email },
});

type Row = Record<string, unknown>;

export type FakeDb = {
  categories: Row[];
  members: Row[];
  items: Row[];
  item_responses: Row[];
  item_revisions: Row[];
  comments: Row[];
  memories: Row[];
  roulette_draws: Row[];
  activity_events: Row[];
  activity_event_acknowledgements: Row[];
  item_views: Row[];
};

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type FailureMode = "error" | "ambiguous" | "stale";

let fakeClock = Date.parse("2026-02-01T00:00:00Z");
const nextTimestamp = () => new Date((fakeClock += 60_000)).toISOString();
let fakeIdCounter = 0;
/** Valid hex uuids; the prefix (c=category, i=item, …) maps to a hex digit so ids stay readable. */
const ID_PREFIX: Record<string, string> = { c: "c", i: "1", r: "2", v: "3", e: "e", m: "4" };
const nextId = (prefix: string) =>
  `00000000-0000-4000-8000-${ID_PREFIX[prefix] ?? "f"}${String(++fakeIdCounter).padStart(11, "0")}`;

export function syntheticCategory(id: string, name: string, sortOrder = 0): Row {
  return {
    id,
    couple_id: SYNTHETIC_COUPLE_ID,
    name,
    sort_order: sortOrder,
    created_by_member_id: PARTNER_A.member.id,
    request_id: id,
    created_at: "2026-01-01T00:00:00+00:00",
    archived_at: null,
  };
}

/**
 * A minimal in-memory stand-in for the Supabase browser client. It models only what the UI
 * uses: auth, get_current_member(), RLS-scoped reads, and the idempotent create functions.
 * `members` maps auth user id -> what get_current_member() returns for that user.
 */
export function createFakeSupabase(options: {
  signedInAs?: SyntheticPartner;
  accounts?: Array<{ partner: SyntheticPartner; password: string }>;
  members?: Record<string, unknown>;
  db?: Partial<FakeDb>;
} = {}) {
  let session: FakeSession | null = options.signedInAs ? sessionFor(options.signedInAs) : null;
  const listeners = new Set<AuthListener>();
  const accounts = options.accounts ?? [];
  const members: Record<string, unknown> = options.members ?? {
    [PARTNER_A.userId]: PARTNER_A.member,
    [PARTNER_B.userId]: PARTNER_B.member,
  };
  const db: FakeDb = {
    categories: options.db?.categories ?? [],
    members: options.db?.members ?? [PARTNER_A.member, PARTNER_B.member],
    items: options.db?.items ?? [],
    item_responses: options.db?.item_responses ?? [],
    item_revisions: options.db?.item_revisions ?? [],
    comments: options.db?.comments ?? [],
    memories: options.db?.memories ?? [],
    roulette_draws: options.db?.roulette_draws ?? [],
    activity_events: options.db?.activity_events ?? [],
    activity_event_acknowledgements: options.db?.activity_event_acknowledgements ?? [],
    item_views: options.db?.item_views ?? [],
  };
  /** Mirrors the v2 RLS: drafts are visible only to their author. */
  const canRead = (actor: Row | undefined, itemId: unknown) => {
    const item = db.items.find((row) => row.id === itemId);
    return Boolean(actor && item && (item.status !== "draft" || item.creator_member_id === actor.id));
  };
  const isSubmitted = (itemId: unknown) =>
    db.items.find((row) => row.id === itemId)?.status === "submitted";
  const recordEvent = (actor: Row, event_type: string, extra: Row = {}) =>
    db.activity_events.push({
      id: nextId("e"),
      couple_id: SYNTHETIC_COUPLE_ID,
      actor_member_id: actor.id,
      event_type,
      created_at: nextTimestamp(),
      ...extra,
    });
  const ownResponse = (actor: Row, itemId: unknown) =>
    db.item_responses.find((row) => row.item_id === itemId && row.member_id === actor.id);
  const setResponseField = (field: string, eventType: string) => (args: Row) => {
    const actor = currentMember();
    if (!actor) return { data: null, error: { message: "authenticated member required" } };
    const response = ownResponse(actor, args.p_item_id);
    if (!response) return { data: null, error: { message: "owned item response required" } };
    const ownDraft =
      field === "interest" && db.items.find((row) => row.id === args.p_item_id)?.creator_member_id === actor.id;
    if (!isSubmitted(args.p_item_id) && !ownDraft) return { data: null, error: { message: "submitted item required" } };
    if (field === "roulette_decision" && args.p_decision === "not_now") {
      return { data: null, error: { message: "not now requires a reason" } };
    }
    const value = args[{ interest: "p_interest", is_favorite: "p_favorite", roulette_decision: "p_decision" }[field]!];
    if (response[field] !== value) {
      response[field] = value;
      response.updated_at = nextTimestamp();
      if (isSubmitted(args.p_item_id)) recordEvent(actor, eventType, { item_id: args.p_item_id });
    }
    return { data: { ...response }, error: null };
  };
  const failures = new Map<string, FailureMode[]>();
  const rpcGates = new Map<string, Array<Promise<void>>>();
  const emit = (event: string) => listeners.forEach((listener) => listener(event, session));
  const currentMember = () => {
    const userId = session?.user.id;
    return (userId ? members[userId] : undefined) as Row | undefined;
  };

  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((listener: AuthListener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      const account = accounts.find(
        (candidate) => candidate.partner.email === email && candidate.password === password,
      );
      if (!account) {
        return {
          data: { session: null, user: null },
          error: { name: "AuthApiError", status: 400, message: "Invalid login credentials" },
        };
      }
      session = sessionFor(account.partner);
      emit("SIGNED_IN");
      return { data: { session, user: session.user }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    }),
  };

  /** Mirrors the SQL category checks: an active category in the caller's couple. */
  const activeCategory = (actor: Row, categoryId: unknown) =>
    db.categories.some(
      (row) => row.id === categoryId && (row.couple_id ?? SYNTHETIC_COUPLE_ID) === actor.couple_id && !row.archived_at,
    );

  /** An accepted, open (not done, not called off) date of the caller's couple. */
  const openDate = (drawId: unknown) => {
    const actor = currentMember();
    return db.roulette_draws.find(
      (draw) => draw.id === drawId && draw.couple_id === actor?.couple_id && draw.outcome === "accepted" && !draw.done_at && !draw.cancelled_at,
    );
  };
  const handlers: Record<string, (args: Row) => RpcResult> = {
    get_current_member: () => ({ data: currentMember() ?? null, error: null }),
    create_category: (args) => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const existing = db.categories.find(
        (row) => row.created_by_member_id === actor.id && row.request_id === args.p_request_id,
      );
      if (existing) return { data: existing, error: null };
      const name = String(args.p_name);
      if (
        db.categories.some(
          (row) => row.archived_at === null && String(row.name).toLowerCase() === name.toLowerCase(),
        )
      ) {
        return { data: null, error: { message: "duplicate key value", code: "23505" } };
      }
      const row = {
        ...syntheticCategory(nextId("c"), name, db.categories.length),
        created_by_member_id: actor.id,
        request_id: args.p_request_id,
      };
      db.categories.push(row);
      return { data: row, error: null };
    },
    create_item: (args) => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const existing = db.items.find(
        (row) => row.creator_member_id === actor.id && row.request_id === args.p_request_id,
      );
      if (existing) return { data: existing, error: null };
      if (!db.categories.some((row) => row.id === args.p_category_id && row.archived_at === null)) {
        return { data: null, error: { message: "active category in current couple required" } };
      }
      if (args.p_source_item_id && !canRead(actor, args.p_source_item_id)) {
        return { data: null, error: { message: "source item in current couple required" } };
      }
      const now = nextTimestamp();
      const row = {
        id: nextId("i"),
        couple_id: SYNTHETIC_COUPLE_ID,
        creator_member_id: actor.id,
        category_id: args.p_category_id,
        source_item_id: args.p_source_item_id ?? null,
        source_memory_id: args.p_source_memory_id ?? null,
        request_id: args.p_request_id,
        title: args.p_title,
        description: args.p_description,
        created_at: now,
        updated_at: now,
        archived_at: null,
        status: "draft",
        submitted_at: null,
      };
      db.items.push(row);
      db.item_revisions.push({
        id: nextId("v"),
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: row.id,
        revision_number: 1,
        editor_member_id: actor.id,
        title: row.title,
        description: row.description,
        category_id: row.category_id,
        created_at: now,
      });
      // Drafts record no activity; submit_item records the creation event.
      for (const member of db.members) {
        db.item_responses.push({
          id: nextId("r"),
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: row.id,
          member_id: member.id,
          interest: null,
          is_favorite: false,
          roulette_decision: "pending",
          created_at: now,
          updated_at: now,
        });
      }
      return { data: row, error: null };
    },
  };

  Object.assign(handlers, {
    draw_roulette: (args: Row): RpcResult => {
      const actor = currentMember();
      if (actor && args.p_filter_category_id && !activeCategory(actor, args.p_filter_category_id)) {
        return { data: null, error: { message: "active category in current couple required", code: "OU411" } };
      }
      if (!actor || db.members.filter((row) => row.couple_id === actor.couple_id).length !== 2) {
        return { data: [], error: null };
      }
      const eligible = db.items.filter((item) => {
        const responses = db.item_responses.filter((row) => row.item_id === item.id);
        return item.couple_id === actor.couple_id && item.status === "submitted" && item.archived_at === null &&
          (!args.p_filter_category_id || item.category_id === args.p_filter_category_id) &&
          (!args.p_favorites_only || responses.some((row) => row.is_favorite)) &&
          responses.length === 2 && responses.every((row) => row.roulette_decision === "ready");
      });
      return { data: eligible.slice(0, 1).map((row) => ({ ...row })), error: null };
    },
    record_roulette_outcome: (args: Row): RpcResult => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const prior = db.roulette_draws.find(
        (row) => row.drawn_by_member_id === actor.id && row.request_id === args.p_request_id,
      );
      if (prior) return { data: { ...prior }, error: null };
      const item = db.items.find((row) => row.id === args.p_item_id && row.couple_id === actor.couple_id);
      const responses = db.item_responses.filter((row) => row.item_id === item?.id);
      if (!item || item.status !== "submitted" || item.archived_at !== null ||
          db.members.filter((row) => row.couple_id === actor.couple_id).length !== 2 ||
          responses.length !== 2 || !responses.every((row) => row.roulette_decision === "ready") ||
          (args.p_filter_category_id &&
            (item.category_id !== args.p_filter_category_id || !activeCategory(actor, args.p_filter_category_id)))) {
        return { data: null, error: { message: "roulette candidate unavailable", code: "OU410" } };
      }
      const row = {
        id: nextId("d"), couple_id: actor.couple_id, item_id: item.id,
        drawn_by_member_id: actor.id, filter_category_id: args.p_filter_category_id ?? null,
        outcome: args.p_outcome, request_id: args.p_request_id, created_at: nextTimestamp(),
        // Mirrors 20261103000003: a pick is a date.
        source: "deck", planned_when: null, reflect_after: null, done_at: null, cancelled_at: null,
      };
      db.roulette_draws.push(row);
      recordEvent(actor, args.p_outcome === "accepted" ? "draw_accepted" : "draw_deferred", { item_id: item.id, draw_id: row.id });
      return { data: { ...row }, error: null };
    },
    // ---- Dates (mirrors 20261103000003) ----
    plan_item: (args: Row): RpcResult => {
      if (!["tonight", "weekend", "sometime"].includes(String(args.p_when))) {
        return { data: null, error: { message: "when must be tonight, weekend or sometime", code: "22023" } };
      }
      const picked = handlers.record_roulette_outcome({ ...args, p_filter_category_id: null, p_outcome: "accepted" });
      if (picked.error || !picked.data) return picked;
      const row = db.roulette_draws.find((draw) => draw.id === (picked.data as Row).id)!;
      Object.assign(row, {
        source: "chosen",
        planned_when: args.p_when,
        reflect_after: args.p_when === "sometime" ? null : (args.p_reflect_after ?? null),
      });
      return { data: { ...row }, error: null };
    },
    set_draw_when: (args: Row): RpcResult => {
      const row = openDate(args.p_draw_id);
      if (!row) return { data: null, error: { message: "open date required" } };
      Object.assign(row, { planned_when: args.p_when, reflect_after: args.p_when === "sometime" ? null : (args.p_reflect_after ?? null) });
      return { data: { ...row }, error: null };
    },
    mark_draw_done: (args: Row): RpcResult => {
      const actor = currentMember();
      const row = db.roulette_draws.find((draw) => draw.id === args.p_draw_id && draw.couple_id === actor?.couple_id && draw.outcome === "accepted" && !draw.cancelled_at);
      if (!row) return { data: null, error: { message: "open date required" } };
      row.done_at ??= nextTimestamp();
      return { data: { ...row }, error: null };
    },
    cancel_draw: (args: Row): RpcResult => {
      const row = openDate(args.p_draw_id);
      if (!row) return { data: null, error: { message: "open date required" } };
      row.cancelled_at = nextTimestamp();
      return { data: { ...row }, error: null };
    },
    set_item_interest: setResponseField("interest", "response_changed"),
    set_item_favorite: setResponseField("is_favorite", "response_changed"),
    set_roulette_decision: setResponseField("roulette_decision", "roulette_decision_changed"),
    /** Mirrors add_memory: a shared idea in the caller's couple; a draw must be an accepted one for it. */
    add_memory: (args: Row): RpcResult => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const prior = db.memories.find((row) => row.author_member_id === actor.id && row.request_id === args.p_request_id);
      if (prior) return { data: { ...prior }, error: null };
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!item || item.status !== "submitted") return { data: null, error: { message: "item in current couple required" } };
      if (
        args.p_draw_id &&
        !db.roulette_draws.some((row) => row.id === args.p_draw_id && row.item_id === item.id && row.outcome === "accepted")
      ) {
        return { data: null, error: { message: "accepted draw for current item required" } };
      }
      const body = String(args.p_body ?? "");
      // Mirrors 20261103000003: what you enjoyed, or what to change; either is enough.
      if ((!body && !args.p_refinement) || body !== body.trim() || Array.from(body).length > 4000) {
        return { data: null, error: { message: "memories_body_check", code: "23514" } };
      }
      const memory = {
        id: nextId("m"),
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: item.id,
        draw_id: args.p_draw_id ?? null,
        author_member_id: actor.id,
        body,
        highlight: args.p_highlight ?? null,
        next_time: args.p_next_time ?? null,
        refinement: args.p_refinement ?? null,
        request_id: args.p_request_id,
        created_at: nextTimestamp(),
      };
      db.memories.push(memory);
      recordEvent(actor, "memory_added", { item_id: item.id, draw_id: memory.draw_id, memory_id: memory.id });
      return { data: { ...memory }, error: null };
    },
    add_comment: (args: Row): RpcResult => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const existing = db.comments.find(
        (row) => row.author_member_id === actor.id && row.request_id === args.p_request_id,
      );
      if (existing) return { data: existing, error: null };
      if (!db.items.some((row) => row.id === args.p_item_id)) {
        return { data: null, error: { message: "item in current couple required" } };
      }
      if (!isSubmitted(args.p_item_id)) return { data: null, error: { message: "submitted item required" } };
      const row = {
        id: nextId("m"),
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: args.p_item_id,
        author_member_id: actor.id,
        body: args.p_body,
        request_id: args.p_request_id,
        kind: "message",
        created_at: nextTimestamp(),
      };
      db.comments.push(row);
      recordEvent(actor, "comment_added", { item_id: args.p_item_id, comment_id: row.id });
      return { data: row, error: null };
    },
    update_item: (args: Row): RpcResult => {
      const actor = currentMember();
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!actor || !item || !canRead(actor, item.id)) {
        return { data: null, error: { message: "item in current couple required" } };
      }
      if (item.archived_at) return { data: null, error: { message: "archived items cannot be edited" } };
      if (args.p_expected_updated_at && args.p_expected_updated_at !== item.updated_at) {
        return { data: null, error: { message: "item changed since it was opened", code: "OU409" } };
      }
      const changed =
        item.title !== args.p_title ||
        item.description !== args.p_description ||
        item.category_id !== args.p_category_id;
      const descriptionChanged = item.description !== args.p_description;
      if (changed) {
        Object.assign(item, {
          title: args.p_title,
          description: args.p_description,
          category_id: args.p_category_id,
          updated_at: nextTimestamp(),
        });
        db.item_revisions.push({
          id: nextId("v"),
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: item.id,
          revision_number: db.item_revisions.filter((row) => row.item_id === item.id).length + 1,
          editor_member_id: actor.id,
          title: item.title,
          description: item.description,
          category_id: item.category_id,
          created_at: item.updated_at,
        });
        if (item.status === "submitted") {
          recordEvent(actor, "item_edited", { item_id: item.id });
          // Mirrors 20261103000001: only a description change asks the other partner again.
          if (descriptionChanged) {
            for (const response of db.item_responses) {
              if (response.item_id === item.id && response.member_id !== actor.id) {
                response.roulette_decision = "pending";
              }
            }
          }
        }
      }
      return { data: { ...item }, error: null };
    },
    archive_item: (args: Row): RpcResult => {
      const actor = currentMember();
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!actor || !item || item.creator_member_id !== actor.id) {
        return { data: null, error: { message: "item creator required" } };
      }
      if (item.archived_at === null) item.archived_at = nextTimestamp();
      return { data: { ...item }, error: null };
    },
    submit_item: (args: Row): RpcResult => {
      const actor = currentMember();
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!actor || !item || item.creator_member_id !== actor.id) {
        return { data: null, error: { message: "item author required" } };
      }
      if (item.status !== "submitted") {
        const now = nextTimestamp();
        Object.assign(item, { status: "submitted", submitted_at: now, updated_at: now });
        const own = ownResponse(actor, item.id);
        if (own) own.roulette_decision = "ready";
        recordEvent(actor, item.source_item_id ? "item_remixed" : "item_created", { item_id: item.id });
      }
      return { data: { ...item }, error: null };
    },
    pass_item: (args: Row): RpcResult => {
      // Mirrors 20261103000001: either person; optional note; archives the idea.
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!item || !isSubmitted(item.id) || !canRead(actor, item.id)) {
        return { data: null, error: { message: "submitted item required" } };
      }
      if (item.archived_at) return { data: { ...item }, error: null };
      const note = String(args.p_note ?? "").trim();
      let commentId: string | null = null;
      if (note) {
        const comment = {
          id: nextId("m"),
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: item.id,
          author_member_id: actor.id,
          body: note,
          request_id: args.p_request_id,
          kind: "message",
          created_at: nextTimestamp(),
        };
        db.comments.push(comment);
        commentId = comment.id;
      }
      item.archived_at = nextTimestamp();
      recordEvent(actor, "item_passed", { item_id: item.id, comment_id: commentId });
      return { data: { ...item }, error: null };
    },
    decline_item: (args: Row): RpcResult => {
      const actor = currentMember();
      if (!actor) return { data: null, error: { message: "authenticated member required" } };
      const prior = db.comments.find(
        (row) => row.author_member_id === actor.id && row.request_id === args.p_request_id,
      );
      if (prior) return { data: { ...ownResponse(actor, prior.item_id) }, error: null };
      // Mirrors 20261030000003: the note is optional; without one nothing is posted.
      const reason = String(args.p_reason ?? "").trim();
      if (!isSubmitted(args.p_item_id)) return { data: null, error: { message: "submitted item required" } };
      const response = ownResponse(actor, args.p_item_id);
      if (!response) return { data: null, error: { message: "owned item response required" } };
      if (!reason) {
        if (response.roulette_decision !== "not_now") {
          response.roulette_decision = "not_now";
          recordEvent(actor, "item_declined", { item_id: args.p_item_id, comment_id: null });
        }
        return { data: { ...response }, error: null };
      }
      response.roulette_decision = "not_now";
      const comment = {
        id: nextId("m"),
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: args.p_item_id,
        author_member_id: actor.id,
        body: reason,
        request_id: args.p_request_id,
        kind: "not_now_reason",
        created_at: nextTimestamp(),
      };
      db.comments.push(comment);
      recordEvent(actor, "item_declined", { item_id: args.p_item_id, comment_id: comment.id });
      return { data: { ...response }, error: null };
    },
    mark_item_seen: (args: Row): RpcResult => {
      const actor = currentMember();
      if (!actor || !canRead(actor, args.p_item_id)) {
        return { data: null, error: { message: "visible item required" } };
      }
      const now = nextTimestamp();
      let view = db.item_views.find((row) => row.item_id === args.p_item_id && row.member_id === actor.id);
      if (view) view.last_seen_at = now;
      else {
        view = { couple_id: SYNTHETIC_COUPLE_ID, item_id: args.p_item_id, member_id: actor.id, first_seen_at: now, last_seen_at: now };
        db.item_views.push(view);
      }
      return { data: { ...view }, error: null };
    },
    mark_item_seen_through_events: (args: Row): RpcResult => {
      const actor = currentMember();
      const eventIds = Array.isArray(args.p_activity_event_ids) ? args.p_activity_event_ids : [];
      const uniqueIds = new Set(eventIds);
      if (!actor || !canRead(actor, args.p_item_id) || eventIds.length === 0 || uniqueIds.size !== eventIds.length) {
        return { data: null, error: { message: "visible activity events required" } };
      }
      const events = db.activity_events.filter(
        (row) =>
          uniqueIds.has(row.id) &&
          row.item_id === args.p_item_id &&
          row.couple_id === actor.couple_id,
      );
      if (events.length !== eventIds.length) {
        return { data: null, error: { message: "visible activity events required" } };
      }
      for (const event of events) {
        if (
          !db.activity_event_acknowledgements.some(
            (row) => row.activity_event_id === event.id && row.member_id === actor.id,
          )
        ) {
          db.activity_event_acknowledgements.push({
            couple_id: SYNTHETIC_COUPLE_ID,
            activity_event_id: event.id,
            member_id: actor.id,
            acknowledged_at: nextTimestamp(),
          });
        }
      }
      const now = nextTimestamp();
      let view = db.item_views.find((row) => row.item_id === args.p_item_id && row.member_id === actor.id);
      if (view) view.last_seen_at = now;
      else {
        view = {
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: args.p_item_id,
          member_id: actor.id,
          first_seen_at: now,
          last_seen_at: now,
        };
        db.item_views.push(view);
      }
      return { data: { ...view }, error: null };
    },
    delete_item: (args: Row): RpcResult => {
      const actor = currentMember();
      const item = db.items.find((row) => row.id === args.p_item_id);
      if (!actor || !item || item.creator_member_id !== actor.id) {
        return { data: null, error: { message: "item author required" } };
      }
      if (
        db.memories.some((row) => row.item_id === item.id) ||
        db.roulette_draws.some((row) => row.item_id === item.id) ||
        db.items.some((row) => row.source_item_id === item.id)
      ) {
        return { data: null, error: { message: "item has memories, draws, or remixes; archive it instead", code: "OU423" } };
      }
      for (const table of ["activity_events", "comments", "item_views", "item_responses", "item_revisions"] as const) {
        db[table] = db[table].filter((row) => row.item_id !== item.id);
      }
      db.items = db.items.filter((row) => row.id !== item.id);
      return { data: true, error: null };
    },
  });

  const rpc = vi.fn(async (fn: string, args: Row = {}): Promise<RpcResult> => {
    const gate = rpcGates.get(fn)?.shift();
    if (gate) await gate;
    const handler = handlers[fn];
    if (!handler) {
      return { data: null, error: { message: "unexpected rpc in test", code: "TEST" } };
    }
    const mode = failures.get(fn)?.shift();
    if (mode === "error") {
      return { data: null, error: { message: "TypeError: Failed to fetch" } };
    }
    if (mode === "stale") {
      return { data: null, error: { message: "roulette candidate unavailable", code: "OU410" } };
    }
    const result = handler(args);
    if (mode === "ambiguous") {
      // The write committed, but the response never reached the browser.
      return { data: null, error: { message: "TypeError: Failed to fetch" } };
    }
    return result;
  });

  const from = vi.fn((table: keyof FakeDb) => {
    const predicates: Array<(row: Row) => boolean> = [];
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (column: string, value: unknown) => {
        predicates.push((row) => row[column] === value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        predicates.push((row) => row[column] === value);
        return builder;
      },
      then: <T,>(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => T) => {
        // failNext(`from:${table}`, "error") fails the next read of that table, like a dropped request.
        if (failures.get(`from:${table}`)?.shift()) {
          return Promise.resolve(resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }));
        }
        const actor = currentMember();
        let visible = actor ? (db[table] ?? []) : [];
        if (table === "items") visible = visible.filter((row) => canRead(actor, row.id));
        else if (["item_responses", "item_revisions", "comments", "activity_events"].includes(table)) {
          visible = visible.filter((row) => row.item_id == null || canRead(actor, row.item_id));
        } else if (table === "item_views") visible = visible.filter((row) => row.member_id === actor?.id);
        return Promise.resolve(
          resolve({
            data: visible
              .filter((row) => predicates.every((predicate) => predicate(row)))
              .map((row) => ({ ...row })),
            error: null,
          }),
        );
      },
    };
    return builder;
  });

  /** Make the next call(s) to an RPC fail. "ambiguous" commits the write, then reports failure. */
  const failNext = (fn: string, ...modes: FailureMode[]) => {
    failures.set(fn, [...(failures.get(fn) ?? []), ...modes]);
  };

  /** Pause the next matching RPC until `release()`; useful for observing an in-flight UI state. */
  const deferNextRpc = (fn: string) => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    rpcGates.set(fn, [...(rpcGates.get(fn) ?? []), promise]);
    return { release };
  };

  /** Realtime: records subscriptions; `emitRealtime` fires INSERT listeners for a table. */
  type Listener = { filter: Row; callback: (payload: unknown) => void };
  const channels: Array<{ name: string; listeners: Listener[]; removed: boolean }> = [];
  const channel = vi.fn((name: string) => {
    const entry = { name, listeners: [] as Listener[], removed: false };
    channels.push(entry);
    const api = {
      on: (_type: string, filter: Row, callback: (payload: unknown) => void) => {
        entry.listeners.push({ filter, callback });
        return api;
      },
      subscribe: () => api,
      entry,
    };
    return api;
  });
  const removeChannel = vi.fn(async (api: { entry: { removed: boolean } }) => {
    api.entry.removed = true;
    return "ok";
  });
  const emitRealtime = (table: string, record: Row = {}) => {
    if (table === "activity_events" && !db.activity_events.some((row) => row.id === record.id)) {
      db.activity_events.push({ ...record });
    }
    for (const entry of channels) {
      if (entry.removed) continue;
      for (const listener of entry.listeners) {
        if (listener.filter.table === table && listener.filter.event === "INSERT") {
          listener.callback({ eventType: "INSERT", table, new: record });
        }
      }
    }
  };

  const client = { auth, rpc, from, channel, removeChannel } as unknown as OursSupabaseClient;
  return { client, auth, rpc, from, db, failNext, deferNextRpc, channel, channels, removeChannel, emitRealtime };
}

/** Seeds one active item with revision 1 and two pending responses. */
export function seedItem(
  db: Partial<FakeDb>,
  overrides: Partial<{
    id: string;
    title: string;
    description: string;
    categoryId: string;
    creatorId: string;
    sourceItemId: string | null;
    archivedAt: string | null;
    status: "draft" | "submitted";
    responses: Partial<Record<string, Row>>;
  }> = {},
) {
  const id = overrides.id ?? "00000000-0000-4000-8000-000000000001";
  const categoryId = overrides.categoryId ?? "00000000-0000-4000-8000-00000000c001";
  const creatorId = overrides.creatorId ?? PARTNER_A.member.id;
  const created = "2026-01-10T12:00:00Z";
  db.categories ??= [];
  if (!db.categories.some((row) => row.id === categoryId)) {
    db.categories.push(syntheticCategory(categoryId, "Synthetic Category"));
  }
  db.items ??= [];
  db.items.push({
    id,
    couple_id: SYNTHETIC_COUPLE_ID,
    creator_member_id: creatorId,
    category_id: categoryId,
    source_item_id: overrides.sourceItemId ?? null,
    source_memory_id: null,
    request_id: id,
    title: overrides.title ?? "Synthetic Item A",
    description: overrides.description ?? "Synthetic description A",
    created_at: created,
    updated_at: created,
    archived_at: overrides.archivedAt ?? null,
    status: overrides.status ?? "submitted",
    submitted_at: (overrides.status ?? "submitted") === "submitted" ? created : null,
  });
  db.item_revisions ??= [];
  db.item_revisions.push({
    id: `${id.slice(0, -4)}r001`,
    couple_id: SYNTHETIC_COUPLE_ID,
    item_id: id,
    revision_number: 1,
    editor_member_id: creatorId,
    title: overrides.title ?? "Synthetic Item A",
    description: overrides.description ?? "Synthetic description A",
    category_id: categoryId,
    created_at: created,
  });
  db.item_responses ??= [];
  for (const member of [PARTNER_A.member, PARTNER_B.member]) {
    db.item_responses.push({
      id: `${id.slice(0, -4)}${member.id.slice(-4)}`,
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: id,
      member_id: member.id,
      interest: null,
      is_favorite: false,
      roulette_decision: "pending",
      created_at: created,
      updated_at: created,
      ...overrides.responses?.[member.id],
    });
  }
  return id;
}

export function renderApp(
  client: OursSupabaseClient,
  { route = "/", queryClient = createQueryClient() }: { route?: string; queryClient?: QueryClient } = {},
) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });
  const view = render(
    <AppProviders client={client} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, queryClient, router };
}
