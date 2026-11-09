/**
 * Dates and reflections (QA 2026-11-03). A pick becomes a date with an optional when; once it has
 * happened (We did it) or its ask-time has passed, each partner is asked how it was, once, until
 * they reflect. Pure and content-free: ids, times and whens only.
 */
export type DateWhen = "tonight" | "weekend" | "sometime";

export type DateRow = {
  id: string;
  item_id: string;
  drawn_by_member_id: string;
  source: "deck" | "chosen";
  planned_when: DateWhen | null;
  reflect_after: string | null;
  done_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

const WHEN_LABELS: Record<DateWhen, string> = { tonight: "Tonight", weekend: "This weekend", sometime: "Sometime" };
export const DATE_WHENS: readonly DateWhen[] = ["tonight", "weekend", "sometime"];
export const whenLabel = (when: DateWhen | null) => WHEN_LABELS[when ?? "sometime"];

/** When to ask how it was, in local time: 9 am the next day, or the Monday after the weekend. */
export function reflectAfter(when: DateWhen, now: Date): Date | null {
  if (when === "sometime") return null;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
  if (when === "tonight") {
    at.setDate(at.getDate() + 1);
    return at;
  }
  // getDay: 0 Sunday … 6 Saturday. Days until the next Monday, never today.
  const days = (8 - now.getDay()) % 7 || 7;
  at.setDate(at.getDate() + days);
  return at;
}

const dueAt = (row: DateRow) => row.reflect_after ?? row.done_at;
const isDue = (row: DateRow, now: Date) =>
  row.done_at !== null || (row.reflect_after !== null && new Date(row.reflect_after).getTime() <= now.getTime());

/** Dates still ahead: not done, not called off, and not yet past their ask-time. Newest first. */
export function upNext(rows: readonly DateRow[], now: Date): DateRow[] {
  return rows
    .filter((row) => row.cancelled_at === null && !isDue(row, now))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/** Dates I should be asked about: happened or due, not called off, and I haven't reflected. */
export function toReflect(
  rows: readonly DateRow[],
  memories: readonly { draw_id: string | null; author_member_id: string }[],
  me: string,
  now: Date,
): DateRow[] {
  const mine = new Set(memories.filter((memory) => memory.author_member_id === me).map((memory) => memory.draw_id));
  return rows
    .filter((row) => row.cancelled_at === null && isDue(row, now) && !mine.has(row.id))
    .sort((left, right) => (dueAt(right) ?? "").localeCompare(dueAt(left) ?? ""));
}
