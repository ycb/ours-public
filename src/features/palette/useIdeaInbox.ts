import { buildInbox, tabAttention, viewCounts, type InboxEntry } from "../../domain/inbox";
import { useMember } from "../auth/currentMemberContext";
import type { Category, PartnerSummary } from "./api";
import {
  useCategories,
  useInboxMemories,
  useInboxMessages,
  useInboxPicks,
  useLibraryItems,
  useMyItemViews,
  usePartners,
  useRevisionStamps,
} from "./queries";

export type IdeaInbox =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      entries: InboxEntry[];
      /** Which bottom tabs get a dot. */
      attention: { ideas: boolean; plan: boolean };
      /** How many ideas each view holds (agreed ones are Plan's). */
      counts: ReturnType<typeof viewCounts>;
      partners: PartnerSummary[];
      partnerName: string;
      categories: Category[];
      nameOf: (memberId: string) => string;
      categoryName: (categoryId: string) => string;
    };

/** One decorated view of every idea, shared by the Ideas tab, the nav dot, and Plan. */
export function useIdeaInbox(): IdeaInbox {
  const member = useMember();
  const items = useLibraryItems();
  const partners = usePartners();
  const categories = useCategories();
  const views = useMyItemViews();
  const messages = useInboxMessages();
  const revisions = useRevisionStamps();
  const picks = useInboxPicks();
  const memories = useInboxMemories();
  const queries = [items, partners, categories, views, messages, revisions, picks, memories];

  // Only a query with nothing to show is an error. A failed background refetch keeps its last
  // data, so Plan (and Spin's in-memory result) stays on screen instead of being swapped out.
  if (queries.some((query) => query.isError && query.data === undefined)) {
    return { status: "error", retry: () => queries.forEach((query) => void query.refetch()) };
  }
  if (!items.data || !partners.data || !categories.data || !views.data || !messages.data || !revisions.data || !picks.data || !memories.data) {
    return { status: "pending" };
  }

  const partnerName = partners.data.find((partner) => partner.id !== member.id)?.display_name ?? "your partner";
  const entries = buildInbox({
    items: items.data,
    views: views.data,
    messages: messages.data,
    revisions: revisions.data,
    picks: picks.data,
    memories: memories.data,
    me: member.id,
    partnerName,
    now: new Date(),
  });
  const partnerData = partners.data;
  const categoryData = categories.data;
  return {
    status: "ready",
    entries,
    attention: tabAttention(entries),
    counts: viewCounts(entries),
    partners: partnerData,
    partnerName,
    categories: categoryData,
    nameOf: (memberId) =>
      memberId === member.id ? "You" : (partnerData.find((partner) => partner.id === memberId)?.display_name ?? "Partner"),
    categoryName: (categoryId) =>
      categoryData.find((category) => category.id === categoryId)?.name ?? "Archived category",
  };
}
