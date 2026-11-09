begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('40000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('40000000-0000-4000-8000-000000000002', 'infinity', false, false),
  ('40000000-0000-4000-8000-000000000003', 'infinity', false, false),
  ('40000000-0000-4000-8000-000000000004', 'infinity', false, false),
  ('40000000-0000-4000-8000-000000000005', 'infinity', false, false);

insert into public.couples (id, display_name)
values
  ('40000000-0000-4000-8000-000000000010', 'Synthetic Couple A'),
  ('40000000-0000-4000-8000-000000000020', 'Synthetic Couple B');

insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 'Synthetic A One', 0),
  ('40000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002', 'Synthetic A Two', 1),
  ('40000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000003', 'Synthetic B One', 0),
  ('40000000-0000-4000-8000-000000000022', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000004', 'Synthetic B Two', 1);

insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('40000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000010', 'Synthetic Category A', '40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000014'),
  ('40000000-0000-4000-8000-000000000023', '40000000-0000-4000-8000-000000000020', 'Synthetic Category B', '40000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000024');

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
insert into public.items (id, couple_id, creator_member_id, category_id, request_id, title, description)
values ('40000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000016', 'Synthetic Item A', 'Synthetic description A.');

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
insert into public.items (id, couple_id, creator_member_id, category_id, request_id, title, description)
values ('40000000-0000-4000-8000-000000000025', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000023', '40000000-0000-4000-8000-000000000026', 'Synthetic Item B', 'Synthetic description B.');

insert into public.comments (id, couple_id, item_id, author_member_id, body, request_id)
values
  ('40000000-0000-4000-8000-000000000017', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000011', 'Synthetic comment A.', '40000000-0000-4000-8000-000000000018'),
  ('40000000-0000-4000-8000-000000000027', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000025', '40000000-0000-4000-8000-000000000021', 'Synthetic comment B.', '40000000-0000-4000-8000-000000000028');
insert into public.roulette_draws (id, couple_id, item_id, drawn_by_member_id, outcome, request_id)
values
  ('40000000-0000-4000-8000-000000000034', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000011', 'accepted', '40000000-0000-4000-8000-000000000035'),
  ('40000000-0000-4000-8000-000000000036', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000025', '40000000-0000-4000-8000-000000000021', 'accepted', '40000000-0000-4000-8000-000000000037');
insert into public.memories (id, couple_id, item_id, draw_id, author_member_id, body, request_id)
values
  ('40000000-0000-4000-8000-000000000038', '40000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000034', '40000000-0000-4000-8000-000000000011', 'Synthetic memory A.', '40000000-0000-4000-8000-000000000039'),
  ('40000000-0000-4000-8000-00000000003a', '40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000025', '40000000-0000-4000-8000-000000000036', '40000000-0000-4000-8000-000000000021', 'Synthetic memory B.', '40000000-0000-4000-8000-00000000003b');

set local role anon;
select throws_ok(
  $$select * from public.couples$$,
  '42501', null,
  'anonymous users have no application-table read privilege'
);
select throws_ok(
  $$insert into public.categories (couple_id, name, created_by_member_id, request_id)
    values ('40000000-0000-4000-8000-000000000010', 'Synthetic Forgery', '40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000030')$$,
  '42501', null,
  'anonymous users cannot write application tables'
);
select throws_ok(
  $$select public.create_category('40000000-0000-4000-8000-000000000031', 'Synthetic Anonymous')$$,
  '42501', null,
  'anonymous users cannot execute write functions'
);
reset role;

select ok(
  not has_table_privilege('anon', format('public.%I', table_name), privilege_name),
  format('anon lacks %s on public.%I', privilege_name, table_name)
)
from unnest(array[
  'couples', 'members', 'categories', 'items', 'item_revisions',
  'item_responses', 'comments', 'roulette_draws', 'memories', 'activity_events'
]) as application_tables(table_name)
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege_name);

select ok(
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'),
  format('authenticated receives RLS-protected SELECT on public.%I', table_name)
)
from unnest(array[
  'couples', 'members', 'categories', 'items', 'item_revisions',
  'item_responses', 'comments', 'roulette_draws', 'memories', 'activity_events'
]) as application_tables(table_name);

select ok(
  not has_table_privilege('authenticated', format('public.%I', table_name), privilege_name),
  format('authenticated lacks direct %s on public.%I', privilege_name, table_name)
)
from unnest(array[
  'couples', 'members', 'categories', 'items', 'item_revisions',
  'item_responses', 'comments', 'roulette_draws', 'memories', 'activity_events'
]) as application_tables(table_name)
cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege_name);

select ok(
  has_function_privilege('authenticated', function_name, 'EXECUTE'),
  format('authenticated can execute user-facing function %s', function_name)
)
from unnest(array[
  'public.current_member_id()',
  'public.get_current_member()',
  'public.is_current_couple(uuid)',
  'public.create_category(uuid,text)',
  'public.create_item(uuid,text,text,uuid,uuid,uuid)',
  'public.update_item(uuid,text,text,uuid,timestamptz)',
  'public.archive_item(uuid)',
  'public.set_item_interest(uuid,public.interest)',
  'public.set_item_favorite(uuid,boolean)',
  'public.set_roulette_decision(uuid,public.roulette_decision)',
  'public.add_comment(uuid,uuid,text)',
  'public.add_memory(uuid,uuid,uuid,text,text,public.memory_next_time,text)'
]) as user_functions(function_name);

select ok(
  not has_function_privilege('anon', function_name, 'EXECUTE'),
  format('anon cannot execute function %s', function_name)
)
from unnest(array[
  'public.current_member_id()',
  'public.get_current_member()',
  'public.is_current_couple(uuid)',
  'public.create_category(uuid,text)',
  'public.create_item(uuid,text,text,uuid,uuid,uuid)',
  'public.update_item(uuid,text,text,uuid,timestamptz)',
  'public.archive_item(uuid)',
  'public.set_item_interest(uuid,public.interest)',
  'public.set_item_favorite(uuid,boolean)',
  'public.set_roulette_decision(uuid,public.roulette_decision)',
  'public.add_comment(uuid,uuid,text)',
  'public.add_memory(uuid,uuid,uuid,text,text,public.memory_next_time,text)',
  'public.item_after_insert()',
  'public.item_before_update()',
  'public.maintain_item_response_updated_at()',
  'public.reject_item_revision_mutation()',
  'public.record_item_activity()',
  'public.record_response_activity()',
  'public.record_comment_activity()',
  'public.record_memory_activity()'
]) as protected_functions(function_name);

select ok(
  not has_function_privilege('authenticated', function_name, 'EXECUTE'),
  format('authenticated cannot execute trigger-only function %s', function_name)
)
from unnest(array[
  'public.item_after_insert()',
  'public.item_before_update()',
  'public.maintain_item_response_updated_at()',
  'public.reject_item_revision_mutation()',
  'public.record_item_activity()',
  'public.record_response_activity()',
  'public.record_comment_activity()',
  'public.record_memory_activity()'
]) as trigger_functions(function_name);

select ok(
  p.prosecdef and p.proconfig @> array['search_path=""'],
  format('security-definer function public.%I has an empty search_path', p.proname)
)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'current_member_id', 'get_current_member', 'is_current_couple',
    'create_category', 'create_item', 'update_item', 'archive_item',
    'set_item_interest', 'set_item_favorite', 'set_roulette_decision',
    'add_comment', 'add_memory', 'item_after_insert', 'item_before_update',
    'maintain_item_response_updated_at', 'reject_item_revision_mutation',
    'record_item_activity', 'record_response_activity',
    'record_comment_activity', 'record_memory_activity'
  ]);

select ok(
  not exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  format('PUBLIC has no execute privilege on public.%I', p.proname)
)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'current_member_id', 'get_current_member', 'is_current_couple',
    'create_category', 'create_item', 'update_item', 'archive_item',
    'set_item_interest', 'set_item_favorite', 'set_roulette_decision',
    'add_comment', 'add_memory', 'item_after_insert', 'item_before_update',
    'maintain_item_response_updated_at', 'reject_item_revision_mutation',
    'record_item_activity', 'record_response_activity',
    'record_comment_activity', 'record_memory_activity'
  ]);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(public.current_member_id(), '40000000-0000-4000-8000-000000000011'::uuid, 'current_member_id derives the authenticated member');
select is((public.get_current_member()).id, '40000000-0000-4000-8000-000000000011'::uuid, 'get_current_member returns only the directly mapped member');
select ok(public.is_current_couple('40000000-0000-4000-8000-000000000010'), 'the caller belongs to Couple A');
select ok(not public.is_current_couple('40000000-0000-4000-8000-000000000020'), 'the caller does not belong to Couple B');

select is((select count(*) from public.couples), 1::bigint, 'Couple A sees only its couple');
select is((select count(*) from public.members), 2::bigint, 'Couple A sees only its members');
select is((select count(*) from public.categories), 1::bigint, 'Couple A sees only its categories');
select is((select count(*) from public.items), 1::bigint, 'Couple A sees only its items');
select is((select count(*) from public.item_revisions), 1::bigint, 'Couple A sees only its revisions');
select is((select count(*) from public.item_responses), 2::bigint, 'Couple A sees only its responses');
select is((select count(*) from public.comments), 1::bigint, 'Couple A sees only its comments');
select is((select count(*) from public.roulette_draws), 1::bigint, 'Couple A sees only its draws');
select is((select count(*) from public.memories), 1::bigint, 'Couple A sees only its memories');
select ok((select count(*) from public.activity_events) >= 1, 'Couple A sees its generated activity only');
select is((select count(*) from public.items where id = '40000000-0000-4000-8000-000000000025'), 0::bigint, 'a guessed Couple B item UUID returns no row');
select is((select count(*) from public.activity_events where couple_id = '40000000-0000-4000-8000-000000000020'), 0::bigint, 'Couple A cannot read Couple B activity');

select throws_ok(
  $$update public.items set title = 'Synthetic Tamper' where id = '40000000-0000-4000-8000-000000000025'$$,
  '42501', null,
  'authenticated users have no direct update privilege'
);
select throws_ok(
  $$insert into public.comments (couple_id, item_id, author_member_id, body, request_id)
    values ('40000000-0000-4000-8000-000000000020', '40000000-0000-4000-8000-000000000025', '40000000-0000-4000-8000-000000000011', 'Synthetic cross-couple body.', '40000000-0000-4000-8000-000000000032')$$,
  '42501', null,
  'authenticated users have no direct insert privilege'
);
reset role;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select is(public.current_member_id(), null::uuid, 'an authenticated user without one member mapping fails closed');
select is((select count(*) from public.couples), 0::bigint, 'an unmapped authenticated user sees no couples');
select is((select count(*) from public.members), 0::bigint, 'an unmapped authenticated user sees no members');
select is((select count(*) from public.items), 0::bigint, 'an unmapped authenticated user sees no items');
select is((select count(*) from public.activity_events), 0::bigint, 'an unmapped authenticated user sees no activity');
select throws_ok(
  $$select public.create_category('40000000-0000-4000-8000-000000000033', 'Synthetic Unmapped')$$,
  'P0001', 'authenticated member required',
  'an unmapped authenticated user cannot write through functions'
);
reset role;

select * from finish();
rollback;
