import {
  deriveViewerStage,
  hasUnreadMessages,
  isUuid,
  type LibraryItem,
  type ViewerStage,
} from "./model";

/**
 * The Ideas inbox (v2 Final IA): one row per idea with its latest activity, plus the
 * Ideas / Drafts views and Plan's agreed list. Pure functions; no I/O.
 */

export type ActivityRevision = { editor_member_id: string; revision_number: number; created_at: string };
export type ActivityMessage = {
  author_member_id: string;
  body: string;
  kind: "message" | "not_now_reason";
  created_at: string;
};
/** What happened last: an event only. Where each partner stands is `standing()`. */
export type Activity = { at: string; line: string };

const DAY = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/** Compact time for a row: now · 45m · 5h · Sat · Feb 20. */
export function formatRelative(iso: string, now: Date): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 7 * DAY) return weekday.format(at);
  return monthDay.format(at);
}

/** just now · 45m ago · 5h ago · on Sat · on Feb 20 */
export function formatAgo(iso: string, now: Date): string {
  const short = formatRelative(iso, now);
  if (short === "now") return "just now";
  return /^\d+[mh]$/.test(short) ? `${short} ago` : `on ${short}`;
}

/** today · yesterday · Feb 20 */
export function formatDay(iso: string, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return monthDay.format(new Date(iso));
}

const preview = (body: string) => body.replace(/\s+/g, " ").trim();
export function latestActivity(input: {
  item: LibraryItem;
  revisions: readonly ActivityRevision[];
  messages: readonly ActivityMessage[];
  me: string;
  partnerName: string;
  stage: ViewerStage;
  now: Date;
  /** Accepted picks (Let's do it) and memories: what Plan rows talk about. */
  picks?: readonly Moment[];
  memories?: readonly Moment[];
}): Activity {
  const { item, me, partnerName: partner, stage } = input;
  const who = (memberId: string) => (memberId === me ? "You" : partner);
  const mineItem = item.creator_member_id === me;

  if (stage === "ready") {
    // On Plan the useful line is what happened since you agreed: the latest pick, memory or message.
    const moments = [
      ...(input.picks ?? []).map((pick) => ({ at: pick.at, line: `${who(pick.by)} picked it` })),
      ...(input.memories ?? []).map((memory) => ({ at: memory.at, line: `${who(memory.by)} added a memory` })),
      ...input.messages
        .filter((message) => message.kind === "message")
        .map((message) => ({ at: message.created_at, line: `${who(message.author_member_id)}: ${preview(message.body)}` })),
    ].sort((left, right) => right.at.localeCompare(left.at));
    return moments[0] ?? { at: item.submitted_at ?? item.updated_at, line: "Not picked yet" };
  }

  if (stage === "draft") {
    return { at: item.updated_at, line: `Only you · edited ${formatDay(item.updated_at, input.now)}` };
  }

  if (stage === "not_now") {
    // Later is for talking it over: show the latest word on it, the note included.
    const latestWord = [...input.messages].sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (latestWord) {
      const body = preview(latestWord.body);
      return {
        at: latestWord.created_at,
        line: `${who(latestWord.author_member_id)}: ${latestWord.kind === "not_now_reason" ? `"${body}"` : body}`,
      };
    }
    return { at: item.updated_at, line: "You both chose Later" };
  }

  type Event =
    | { kind: "share"; at: string }
    | { kind: "edit"; at: string; by: string }
    | { kind: "message"; at: string; by: string; body: string };
  const events: Event[] = [];
  events.push({ kind: "share", at: item.submitted_at ?? item.created_at });
  for (const revision of input.revisions) {
    if (revision.revision_number > 1) events.push({ kind: "edit", at: revision.created_at, by: revision.editor_member_id });
  }
  for (const message of input.messages) {
    if (message.kind === "message") {
      events.push({ kind: "message", at: message.created_at, by: message.author_member_id, body: message.body });
    }
  }
  // Latest wins; on a tie, a message beats an edit beats the share.
  const rank = { share: 0, edit: 1, message: 2 } as const;
  const latest = events.sort((left, right) => right.at.localeCompare(left.at) || rank[right.kind] - rank[left.kind])[0];

  if (latest.kind === "message") return { at: latest.at, line: `${who(latest.by)}: ${preview(latest.body)}` };
  if (latest.kind === "edit") {
    if (latest.by === me) return { at: latest.at, line: "You edited this" };
    return { at: latest.at, line: mineItem ? `${partner} edited your wording` : `${partner} edited this` };
  }
  return { at: latest.at, line: `${who(item.creator_member_id)} shared this` };
}

// ---- Where each partner stands (the row's third line) ----

const RATING: Record<string, string> = {
  low: "low interest",
  curious: "curious",
  into_it: "into it",
  very_into_it: "very into it",
};
/** Short phrases, so line 3 needs no names (line 2 already names the person) and fits a phone. */
const THEIR_ANSWER: Record<string, string> = { pending: "They haven't decided", ready: "They're in", not_now: "They suggest Later" };
const MY_ANSWER: Record<string, string> = { pending: "Your turn", ready: "You're in", not_now: "You suggested Later" };

export type StandingPerson = {
  /** Who this is: each person keeps one color everywhere (see personClass). */
  memberId: string;
  mine: boolean;
  /** Drives the mark: filled (in), hollow (pending), struck (hold). */
  state: "in" | "pending" | "hold";
  answer: string;
  /** My answer is needed: shown as the accent "Your turn" pill. */
  turn: boolean;
  rating: string | null;
  favorite: boolean;
};
export type Standing = { kind: "both"; people: StandingPerson[] } | { kind: "agreed" } | { kind: "none" };

/** Them, then me: answer, rating, favorite. Agreed collapses to "Both in"; drafts have none. */
export function standing(entry: InboxEntry, me: string): Standing {
  if (entry.stage === "draft") return { kind: "none" };
  if (entry.stage === "ready") return { kind: "agreed" };
  const person = (mine: boolean): StandingPerson | null => {
    const response = entry.item.responses.find((row) => (row.member_id === me) === mine);
    if (!response) return null;
    const turn = mine && entry.yourTurn;
    return {
      memberId: response.member_id,
      mine,
      state: response.roulette_decision === "ready" ? "in" : response.roulette_decision === "not_now" ? "hold" : "pending",
      answer: turn
        ? "Your turn"
        : entry.stage === "not_now"
          ? mine ? "You chose Later" : "They chose Later"
          : (mine ? MY_ANSWER : THEIR_ANSWER)[response.roulette_decision],
      turn,
      rating: response.interest ? RATING[response.interest] : null,
      favorite: response.is_favorite,
    };
  };
  return { kind: "both", people: [person(false), person(true)].filter((row): row is StandingPerson => row !== null) };
}

export type InboxEntry = {
  item: LibraryItem;
  stage: ViewerStage;
  /** Something new I haven't opened: an idea from my partner, or a partner message since my last visit. */
  unread: boolean;
  /** My answer is needed (new from my partner, or my decision is pending). Pinned to the top. */
  yourTurn: boolean;
  activity: Activity;
};

export type InboxMessage = ActivityMessage & { item_id: string };
/** Someone did something at a time: an accepted pick, or a memory. No content. */
export type Moment = { by: string; at: string };
export type InboxMoment = Moment & { item_id: string };
export type InboxRevision = ActivityRevision & { item_id: string };

/** Active ideas, decorated for the viewer, newest activity first. */
export function buildInbox(input: {
  items: readonly LibraryItem[];
  views: readonly { item_id: string; last_seen_at: string }[];
  messages: readonly InboxMessage[];
  revisions: readonly InboxRevision[];
  picks?: readonly InboxMoment[];
  memories?: readonly InboxMoment[];
  me: string;
  partnerName: string;
  now: Date;
}): InboxEntry[] {
  const seenAt = new Map(input.views.map((view) => [view.item_id, view.last_seen_at]));
  const group = <T extends { item_id: string }>(rows: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(row.item_id, [...(map.get(row.item_id) ?? []), row]);
    return map;
  };
  const messages = group(input.messages);
  const revisions = group(input.revisions);
  const picks = group(input.picks ?? []);
  const memories = group(input.memories ?? []);

  return input.items
    .filter((item) => item.archived_at === null)
    .map((item) => {
      const seen = seenAt.get(item.id) ?? null;
      const stage = deriveViewerStage({
        status: item.status,
        creatorId: item.creator_member_id,
        responses: item.responses,
        memberId: input.me,
        seenAt: seen,
      });
      const itemMessages = messages.get(item.id) ?? [];
      const unread = stage === "new" || (stage !== "draft" && hasUnreadMessages(itemMessages, input.me, seen));
      return {
        item,
        stage,
        unread,
        yourTurn: stage === "new" || stage === "needs_decision",
        activity: latestActivity({
          item,
          revisions: revisions.get(item.id) ?? [],
          messages: itemMessages,
          me: input.me,
          partnerName: input.partnerName,
          stage,
          now: input.now,
          picks: picks.get(item.id) ?? [],
          memories: memories.get(item.id) ?? [],
        }),
      };
    })
    .sort(byActivity);
}

// ---- Views and Refine ----

export type IdeaView = "ideas" | "later" | "drafts";

/** Anything else (including the retired "respond") falls back to Ideas. */
export function parseIdeaView(params: URLSearchParams): IdeaView {
  const view = params.get("view");
  // Old links with ?notnow=1 (the retired "Include ideas on hold" filter) open Later.
  if (view === "later" || (!view && params.get("notnow") === "1")) return "later";
  return view === "drafts" ? "drafts" : "ideas";
}

export type IdeaFilters = {
  category?: string;
  /** A favorite of either of you (QA 8: the per-partner and interest filters are retired). */
  favorites?: boolean;
};

/** Only uuids and known flags survive; anything else (including text) is dropped. */
export function parseIdeaFilters(params: URLSearchParams): IdeaFilters {
  const filters: IdeaFilters = {};
  const category = params.get("category");
  if (isUuid(category)) filters.category = category;
  // "1" now; "both" and a member id are older links that still mean favorites.
  const favorite = params.get("favorite");
  if (favorite === "1" || favorite === "both" || isUuid(favorite)) filters.favorites = true;
  return filters;
}

export function serializeIdeaFilters(filters: IdeaFilters, view: IdeaView): URLSearchParams {
  const params = new URLSearchParams();
  if (view !== "ideas") params.set("view", view);
  if (filters.category) params.set("category", filters.category);
  if (filters.favorites) params.set("favorite", "1");
  return params;
}

export const activeFilterCount = (filters: IdeaFilters) =>
  [filters.category, filters.favorites].filter(Boolean).length;

function matches(entry: InboxEntry, filters: IdeaFilters): boolean {
  const { item } = entry;
  if (filters.category && item.category_id !== filters.category) return false;
  if (filters.favorites && !item.responses.some((row) => row.is_favorite)) return false;
  return true;
}

/**
 * The pills worth offering for a list: categories that hold something in it, and ♥ Favorites once
 * something is a favorite. Whatever is already chosen stays, so it can always be seen and cleared.
 */
export function filterOptions<C extends { id: string }>(
  entries: readonly InboxEntry[],
  categories: readonly C[],
  filters: IdeaFilters,
): { categories: C[]; favorites: boolean } {
  const used = new Set(entries.map((entry) => entry.item.category_id));
  return {
    categories: categories.filter((category) => used.has(category.id) || category.id === filters.category),
    favorites: Boolean(filters.favorites) || entries.some((entry) => entry.item.responses.some((row) => row.is_favorite)),
  };
}

const byActivity = (left: InboxEntry, right: InboxEntry) =>
  right.activity.at.localeCompare(left.activity.at) || right.item.id.localeCompare(left.item.id);

/** Every view lists the most recent activity first; in Ideas, my turn is pinned above the rest. */
export function selectIdeaView(
  entries: readonly InboxEntry[],
  view: IdeaView | "agreed",
  filters: IdeaFilters,
): InboxEntry[] {
  const picked = pick(entries, view, filters).sort(byActivity);
  if (view !== "ideas") return picked;
  return [...picked.filter((entry) => entry.yourTurn), ...picked.filter((entry) => !entry.yourTurn)];
}

/** How many ideas each view holds, unfiltered; agreed ideas live in Plan. */
export function viewCounts(entries: readonly InboxEntry[]): Record<IdeaView | "agreed", number> {
  return {
    ideas: pick(entries, "ideas", {}).length,
    later: pick(entries, "later", {}).length,
    drafts: pick(entries, "drafts", {}).length,
    agreed: pick(entries, "agreed", {}).length,
  };
}

/** Which tabs get a dot: Ideas for my turn or anything unread there; Plan for unread agreed ideas. */
export function tabAttention(entries: readonly InboxEntry[]): { ideas: boolean; plan: boolean } {
  return {
    ideas: entries.some((entry) => entry.stage !== "draft" && entry.stage !== "ready" && (entry.yourTurn || entry.unread)),
    plan: entries.some((entry) => entry.stage === "ready" && entry.unread),
  };
}

function pick(entries: readonly InboxEntry[], view: IdeaView | "agreed", filters: IdeaFilters): InboxEntry[] {
  switch (view) {
    case "drafts":
      return entries.filter((entry) => entry.stage === "draft");
    case "agreed":
      return entries.filter((entry) => entry.stage === "ready" && matches(entry, filters));
    case "later":
      // Parked to talk over: still open, never in Plan until you're both in again.
      return entries.filter((entry) => entry.stage === "not_now" && matches(entry, filters));
    case "ideas":
      return entries.filter(
        (entry) => entry.stage !== "draft" && entry.stage !== "ready" && entry.stage !== "not_now" && matches(entry, filters),
      );
  }
}
