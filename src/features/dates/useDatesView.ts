import { toReflect, upNext, type DateRow } from "../../domain/dates";
import { useMember } from "../auth/currentMemberContext";
import { useIdeaInbox } from "../palette/useIdeaInbox";
import { useDates, useInboxMemories } from "../palette/queries";

export type DateView = { date: DateRow; title: string; partnerReflected: boolean };

/** Up next and what's waiting for my reflection, with titles from the inbox. Empty until loaded. */
export function useDatesView(): { upNext: DateView[]; toReflect: DateView[]; ready: boolean } {
  const member = useMember();
  const inbox = useIdeaInbox();
  const dates = useDates();
  const memories = useInboxMemories();
  if (inbox.status !== "ready" || !dates.data || !memories.data) return { upNext: [], toReflect: [], ready: false };
  const titles = new Map(inbox.entries.map((entry) => [entry.item.id, entry.item.title]));
  const reflections = memories.data.map((memory) => ({ draw_id: memory.draw_id, author_member_id: memory.by }));
  const now = new Date();
  // Only dates whose idea is still open (an archived idea drops out of the inbox).
  const visible = dates.data.filter((date) => titles.has(date.item_id));
  const view = (date: DateRow): DateView => ({
    date,
    title: titles.get(date.item_id) ?? "",
    partnerReflected: reflections.some((memory) => memory.draw_id === date.id && memory.author_member_id !== member.id),
  });
  return {
    upNext: upNext(visible, now).map(view),
    toReflect: toReflect(visible, reflections, member.id, now).map(view),
    ready: true,
  };
}
