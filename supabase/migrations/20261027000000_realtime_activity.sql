-- Live updates (2026-10-26). Clients subscribe to INSERTs on activity_events as a
-- "something changed" signal, then refetch through their normal RLS-scoped queries.
--
-- Only activity_events is published: its metadata check guarantees it never carries titles,
-- descriptions, messages, or other content, and Realtime applies the table's RLS select policy
-- to every subscriber, so a member only ever hears about their own couple.
-- Content tables (items, comments, revisions, memories, ...) must never be added here.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end
$$;
