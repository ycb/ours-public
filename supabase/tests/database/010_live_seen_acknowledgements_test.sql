-- Task 7D.1: a live acknowledgement advances only through the presented event snapshot.
begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('92000000-0000-4000-8000-000000000001', 'synthetic-watermark-a@ours.invalid', 'infinity', false, false),
  ('92000000-0000-4000-8000-000000000002', 'synthetic-watermark-b@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('92000000-0000-4000-8000-000000000010', 'Synthetic Watermark Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000001', 'Synthetic Watermark A', 0),
  ('92000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000002', 'Synthetic Watermark B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('92000000-0000-4000-8000-000000000013', '92000000-0000-4000-8000-000000000010', 'Synthetic Watermark Category', '92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000014');

select pg_temp.act_as('92000000-0000-4000-8000-000000000001');
create temporary table watermark_item as
select (public.create_item(
  '92000000-0000-4000-8000-000000000020',
  'Synthetic Watermark Idea',
  'Synthetic event-watermark verification only.',
  '92000000-0000-4000-8000-000000000013',
  null,
  null
)).*;
grant select on watermark_item to authenticated;
select public.submit_item((select id from watermark_item));
reset role;

insert into public.activity_events (id, couple_id, actor_member_id, event_type, item_id, created_at)
values
  ('92000000-0000-4000-8000-000000000101', '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000011', 'item_edited', (select id from watermark_item), '2026-10-29 08:00:00-07'),
  ('92000000-0000-4000-8000-000000000102', '92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000011', 'comment_added', (select id from watermark_item), '2026-10-29 08:00:00-07');

select pg_temp.act_as('92000000-0000-4000-8000-000000000002');

select ok(
  (public.mark_item_seen_through_events(
    (select id from watermark_item),
    array['92000000-0000-4000-8000-000000000101'::uuid]
  )).last_seen_at is not null,
  'acknowledging snapshot A updates the in-app item view'
);
reset role;
select is(
  (select count(*) from public.activity_event_acknowledgements
   where activity_event_id = '92000000-0000-4000-8000-000000000101'
     and member_id = '92000000-0000-4000-8000-000000000012'),
  1::bigint,
  'snapshot A records A exactly'
);
select is(
  (select count(*) from public.activity_event_acknowledgements
   where activity_event_id = '92000000-0000-4000-8000-000000000102'
     and member_id = '92000000-0000-4000-8000-000000000012'),
  0::bigint,
  'snapshot A cannot acknowledge equal-timestamp event B'
);
select pg_temp.act_as('92000000-0000-4000-8000-000000000002');
select public.mark_item_seen_through_events(
  (select id from watermark_item),
  array['92000000-0000-4000-8000-000000000102'::uuid]
);
reset role;
select is(
  (select count(*) from public.activity_event_acknowledgements
   where activity_event_id in (
     '92000000-0000-4000-8000-000000000101',
     '92000000-0000-4000-8000-000000000102'
   ) and member_id = '92000000-0000-4000-8000-000000000012'),
  2::bigint,
  'acknowledging B records B without changing A'
);
select pg_temp.act_as('92000000-0000-4000-8000-000000000002');
select public.mark_item_seen_through_events(
  (select id from watermark_item),
  array['92000000-0000-4000-8000-000000000101'::uuid]
);
reset role;
select is(
  (select count(*) from public.activity_event_acknowledgements
   where member_id = '92000000-0000-4000-8000-000000000012'),
  2::bigint,
  'replaying snapshot A is idempotent'
);
select pg_temp.act_as('92000000-0000-4000-8000-000000000002');
select throws_ok(
  format(
    'select public.mark_item_seen_through_events(%L, array[%L::uuid, %L::uuid])',
    (select id from watermark_item),
    '92000000-0000-4000-8000-000000000101',
    '92000000-0000-4000-8000-000000000199'
  ),
  'P0001',
  'visible activity events required',
  'every supplied event id must belong to the visible item and current couple'
);
select throws_ok(
  format(
    'select public.mark_item_seen_through_events(%L, array[%L::uuid, %L::uuid])',
    (select id from watermark_item),
    '92000000-0000-4000-8000-000000000101',
    '92000000-0000-4000-8000-000000000101'
  ),
  'P0001',
  'unique activity events required',
  'duplicate event ids are rejected rather than changing snapshot cardinality'
);
select throws_ok(
  format('select public.mark_item_seen_through_events(%L, array[]::uuid[])', (select id from watermark_item)),
  'P0001',
  'activity events required',
  'an empty live snapshot cannot advance seen state'
);

reset role;
select ok(
  has_function_privilege('authenticated', 'public.mark_item_seen_through_events(uuid,uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.mark_item_seen_through_events(uuid,uuid[])', 'execute'),
  'only authenticated users can execute the live watermark function'
);
select ok(
  not has_table_privilege('authenticated', 'public.activity_event_acknowledgements', 'select')
    and not has_table_privilege('authenticated', 'public.activity_event_acknowledgements', 'insert')
    and not has_table_privilege('authenticated', 'public.activity_event_acknowledgements', 'update')
    and not has_table_privilege('authenticated', 'public.activity_event_acknowledgements', 'delete'),
  'the acknowledgement table has no browser privileges'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.activity_event_acknowledgements'::regclass),
  'the acknowledgement table has RLS enabled'
);
select ok(
  p.prosecdef and p.proconfig @> array['search_path=""'],
  'the live watermark function is security definer with an empty search_path'
)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'mark_item_seen_through_events';
select is(
  (select count(*) from public.item_views where item_id = (select id from watermark_item)),
  1::bigint,
  'live acknowledgement keeps one view row per member and item'
);
select is(
  (select array_agg(column_name::text order by ordinal_position)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'activity_event_acknowledgements'),
  array['couple_id', 'activity_event_id', 'member_id', 'acknowledged_at'],
  'acknowledgements contain identifiers and a timestamp only'
);
select is(
  (select count(*) from pg_catalog.pg_constraint
   where conrelid = 'public.activity_event_acknowledgements'::regclass
     and contype = 'f'),
  3::bigint,
  'acknowledgements pin the couple, event, and member relationships'
);

select * from finish();
rollback;
