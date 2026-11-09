-- Live updates: only the content-free activity_events table is published to Realtime.
-- Content tables must never be published (a Realtime payload would carry their columns).
begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
  'the supabase_realtime publication exists'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ),
  'activity_events is published to Realtime'
);

select is(
  (
    select array_agg(tablename::text order by tablename)
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  ),
  array['activity_events'],
  'no other public table (no content table) is published to Realtime'
);

-- Realtime checks each subscriber's RLS select policy, so the table must keep RLS on.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass),
  'activity_events keeps row level security for Realtime subscribers'
);

select * from finish();
rollback;
