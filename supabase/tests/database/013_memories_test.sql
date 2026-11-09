-- Task 9: memories attach only to a shared idea the caller can see, stay content-free in
-- activity, never email, and can seed a related idea with lineage.
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('a9000000-0000-4000-8000-000000000001', 'synthetic-memory-a@ours.invalid', 'infinity', false, false),
  ('a9000000-0000-4000-8000-000000000002', 'synthetic-memory-b@ours.invalid', 'infinity', false, false),
  ('a9000000-0000-4000-8000-000000000003', 'synthetic-memory-other@ours.invalid', 'infinity', false, false),
  ('a9000000-0000-4000-8000-000000000004', 'synthetic-memory-other-b@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values
  ('a9000000-0000-4000-8000-000000000010', 'Synthetic Memory Couple'),
  ('a9000000-0000-4000-8000-000000000030', 'Synthetic Memory Other Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('a9000000-0000-4000-8000-000000000011', 'a9000000-0000-4000-8000-000000000010', 'a9000000-0000-4000-8000-000000000001', 'Synthetic Memory A', 0),
  ('a9000000-0000-4000-8000-000000000012', 'a9000000-0000-4000-8000-000000000010', 'a9000000-0000-4000-8000-000000000002', 'Synthetic Memory B', 1),
  ('a9000000-0000-4000-8000-000000000031', 'a9000000-0000-4000-8000-000000000030', 'a9000000-0000-4000-8000-000000000003', 'Synthetic Memory Other', 0),
  ('a9000000-0000-4000-8000-000000000032', 'a9000000-0000-4000-8000-000000000030', 'a9000000-0000-4000-8000-000000000004', 'Synthetic Memory Other B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('a9000000-0000-4000-8000-000000000013', 'a9000000-0000-4000-8000-000000000010', 'Synthetic Memory Category', 'a9000000-0000-4000-8000-000000000011', 'a9000000-0000-4000-8000-000000000014'),
  ('a9000000-0000-4000-8000-000000000033', 'a9000000-0000-4000-8000-000000000030', 'Synthetic Memory Other Category', 'a9000000-0000-4000-8000-000000000031', 'a9000000-0000-4000-8000-000000000034');

select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
create temporary table fx as
select
  (public.create_item('a9000000-0000-4000-8000-000000000020', 'Synthetic Memory Shared', 'Synthetic shared description.', 'a9000000-0000-4000-8000-000000000013', null, null)).id as shared,
  (public.create_item('a9000000-0000-4000-8000-000000000021', 'Synthetic Memory Draft', 'Synthetic draft description.', 'a9000000-0000-4000-8000-000000000013', null, null)).id as draft,
  (public.create_item('a9000000-0000-4000-8000-000000000022', 'Synthetic Memory Other Shared', 'Synthetic other description.', 'a9000000-0000-4000-8000-000000000013', null, null)).id as other_shared;
grant select on fx to authenticated;
select public.submit_item((select shared from fx));
select public.submit_item((select other_shared from fx));
reset role;

select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
create temporary table other_fx as
select (public.create_item('a9000000-0000-4000-8000-000000000040', 'Synthetic Memory Foreign', 'Synthetic foreign description.', 'a9000000-0000-4000-8000-000000000033', null, null)).id as foreign_item;
grant select on other_fx to authenticated;
select public.submit_item((select foreign_item from other_fx));
reset role;

-- ---------- Where a memory can go ----------
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000050', %L, null, 'Synthetic peek.', null, null, null)$$, (select draft from fx)),
  'P0001', 'item in current couple required',
  'a partner cannot attach a memory to the author''s private draft'
);
select throws_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000051', %L, null, 'Synthetic foreign.', null, null, null)$$, (select foreign_item from other_fx)),
  'P0001', 'item in current couple required',
  'nor to another couple''s idea, with the same message'
);
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select throws_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000052', %L, null, 'Synthetic own draft.', null, null, null)$$, (select draft from fx)),
  'P0001', 'item in current couple required',
  'a draft has nothing to remember yet, even for its author'
);
reset role;
select is((select count(*) from public.memories where couple_id = 'a9000000-0000-4000-8000-000000000010'), 0::bigint, 'none of those stored anything');

-- ---------- A memory on a shared idea ----------
select pg_temp.act_as('a9000000-0000-4000-8000-000000000002');
create temporary table memory as
select * from public.add_memory('a9000000-0000-4000-8000-000000000053', (select shared from fx), null, 'Synthetic memory body.', 'Synthetic highlight.', 'refine', 'Synthetic refinement.');
grant select on memory to authenticated;
reset role;
select is((select author_member_id from memory), 'a9000000-0000-4000-8000-000000000012'::uuid, 'either partner can add a memory; the author is derived');
select is((select next_time::text from memory), 'refine', 'next time is stored');
select enum_has_labels('public', 'memory_next_time', array['repeat', 'refine'], 'next time is repeat or refine, or left empty');
select is(
  (select metadata from public.activity_events where memory_id = (select id from memory) and event_type = 'memory_added'),
  '{}'::jsonb,
  'one memory_added event, carrying no content'
);
select is(
  (select count(*) from public.notification_outbox_events l join public.activity_events e on e.id = l.activity_event_id where e.memory_id = (select id from memory)),
  0::bigint,
  'a memory never emails'
);

select pg_temp.act_as('a9000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000054', %L, null, 'Synthetic minimal memory.', null, null, null)$$, (select shared from fx)),
  'only the body is required'
);
select throws_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000055', %L, null, '', null, null, null)$$, (select shared from fx)),
  '23514', null,
  'an empty body is refused'
);
select throws_ok(
  format($$select public.add_memory('a9000000-0000-4000-8000-000000000056', %L, null, %L, null, null, null)$$, (select shared from fx), repeat('x', 4001)),
  '23514', null,
  'an over-long body is refused'
);

-- ---------- A related idea from a memory ----------
select is(
  (select row(source_item_id, source_memory_id, status::text) from public.create_item('a9000000-0000-4000-8000-000000000057', 'Synthetic Related', 'Synthetic related description.', 'a9000000-0000-4000-8000-000000000013', (select shared from fx), (select id from memory))),
  (select row((select shared from fx), (select id from memory), 'draft'::text)),
  'a related idea keeps both lineage links and starts as a draft'
);
select throws_ok(
  format(
    $$select public.create_item('a9000000-0000-4000-8000-000000000058', 'Synthetic Mismatch', 'Synthetic mismatch description.', 'a9000000-0000-4000-8000-000000000013', %L, %L)$$,
    (select other_shared from fx), (select id from memory)
  ),
  'P0001', 'source memory must belong to source item',
  'a memory cannot seed an idea claimed to come from a different source'
);
reset role;
select pg_temp.act_as('a9000000-0000-4000-8000-000000000003');
select throws_ok(
  format(
    $$select public.create_item('a9000000-0000-4000-8000-000000000059', 'Synthetic Foreign Related', 'Synthetic description.', 'a9000000-0000-4000-8000-000000000033', null, %L)$$,
    (select id from memory)
  ),
  'P0001', 'source memory in current couple required',
  'another couple cannot seed from this couple''s memory'
);
select is((select count(*) from public.memories where couple_id = 'a9000000-0000-4000-8000-000000000010'), 0::bigint, 'and cannot read it');
reset role;

select * from finish();
rollback;
