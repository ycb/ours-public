import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "../../lib/supabaseContext";
import { isUuid } from "../../domain/model";
import {
  getItemDetail,
  listCategories,
  listComments,
  listItemMemories,
  listLibraryItems,
  listInboxMessages,
  listInboxMemories,
  listInboxPicks,
  listMyItemViews,
  listPartners,
  listRevisionStamps,
  listRevisions,
} from "./api";
import { listDates } from "../dates/api";
import { paletteKeys } from "./keys";

/**
 * Safety net under live updates (useLiveUpdates): the inbox also refetches every 30 s while the
 * tab is visible, covering anything that records no activity event (e.g. a permanent delete).
 */
const INBOX_POLL = { refetchInterval: 30_000, refetchIntervalInBackground: false } as const;

export function useCategories() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.categories(), queryFn: () => listCategories(client) });
}

export function usePartners() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.members(), queryFn: () => listPartners(client) });
}

export function useLibraryItems() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.items(), queryFn: () => listLibraryItems(client), ...INBOX_POLL });
}

export function useItemDetail(itemId: string | undefined) {
  const client = useSupabase();
  const valid = isUuid(itemId);
  return useQuery({
    queryKey: paletteKeys.item(valid ? itemId : "invalid"),
    enabled: valid,
    queryFn: () => getItemDetail(client, itemId as string),
  });
}

export function useComments(itemId: string) {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.comments(itemId), queryFn: () => listComments(client, itemId) });
}

export function useRevisions(itemId: string) {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.revisions(itemId), queryFn: () => listRevisions(client, itemId) });
}

export function useItemMemories(itemId: string) {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.memories(itemId), queryFn: () => listItemMemories(client, itemId) });
}

export function useMyItemViews() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.views(), queryFn: () => listMyItemViews(client), ...INBOX_POLL });
}

export function useInboxMessages() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.inboxMessages(), queryFn: () => listInboxMessages(client), ...INBOX_POLL });
}

export function useInboxPicks() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.inboxPicks(), queryFn: () => listInboxPicks(client), ...INBOX_POLL });
}

export function useInboxMemories() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.inboxMemories(), queryFn: () => listInboxMemories(client), ...INBOX_POLL });
}

export function useDates() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.dates(), queryFn: () => listDates(client), ...INBOX_POLL });
}

export function useRevisionStamps() {
  const client = useSupabase();
  return useQuery({ queryKey: paletteKeys.revisionStamps(), queryFn: () => listRevisionStamps(client), ...INBOX_POLL });
}
