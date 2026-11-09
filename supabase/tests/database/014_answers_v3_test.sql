-- QA 2026-11-03 (answers v3): either person, author included, can choose Later or Not for us;
-- Not for us archives the idea (optional note); only a description change asks the other
-- person again.
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
  ('a1400000-0000-4000-8000-000000000001', 'synthetic-v3-a@ours.invalid', 'infinity', false, false),
  ('a1400000-0000-4000-8000-000000000002', 'synthetic-v3-b@ours.invalid', 'infinity', false, false),
  ('a1400000-0000-4000-8000-000000000003', 'synthetic-v3-other@ours.invalid', 'infinity', false, false),
  ('a1400000-0000-4000-8000-000000000004', 'synthetic-v3-other-b@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values
  ('a1400000-0000-4000-8000-000000000010', 'Synthetic V3 Couple'),
  ('a1400000-0000-4000-8000-000000000030', 'Synthetic V3 Other Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('a1400000-0000-4000-8000-000000000011', 'a1400000-0000-4000-8000-000000000010', 'a1400000-0000-4000-8000-000000000001', 'Synthetic V3 A', 0),
  ('a1400000-0000-4000-8000-000000000012', 'a1400000-0000-4000-8000-000000000010', 'a1400000-0000-4000-8000-000000000002', 'Synthetic V3 B', 1),
  ('a1400000-0000-4000-8000-000000000031', 'a1400000-0000-4000-8000-000000000030', 'a1400000-0000-4000-8000-000000000003', 'Synthetic V3 Other', 0),
  ('a1400000-0000-4000-8000-000000000032', 'a1400000-0000-4000-8000-000000000030', 'a1400000-0000-4000-8000-000000000004', 'Synthetic V3 Other B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('a1400000-0000-4000-8000-000000000013', 'a1400000-0000-4000-8000-000000000010', 'Synthetic V3 One', 'a1400000-0000-4000-8000-000000000011', 'a1400000-0000-4000-8000-000000000014'),
  ('a1400000-0000-4000-8000-000000000015', 'a1400000-0000-4000-8000-000000000010', 'Synthetic V3 Two', 'a1400000-0000-4000-8000-000000000011', 'a1400000-0000-4000-8000-000000000016');

-- A shares four ideas; B is in on the first.
select pg_temp.act_as('a1400000-0000-4000-8000-000000000001');
create temporary table fx as
select
  (public.create_item('a1400000-0000-4000-8000-000000000020', 'Synthetic V3 Edited', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', null, null)).id as edited,
  (public.create_item('a1400000-0000-4000-8000-000000000021', 'Synthetic V3 Later', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', null, null)).id as later,
  (public.create_item('a1400000-0000-4000-8000-000000000022', 'Synthetic V3 Passed', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', null, null)).id as passed,
  (public.create_item('a1400000-0000-4000-8000-000000000023', 'Synthetic V3 Author Passed', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', null, null)).id as author_passed,
  (public.create_item('a1400000-0000-4000-8000-000000000024', 'Synthetic V3 Draft', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', null, null)).id as draft;
grant select on fx to authenticated;
select public.submit_item((select edited from fx));
select public.submit_item((select later from fx));
select public.submit_item((select passed from fx));
select public.submit_item((select author_passed from fx));
reset role;
select pg_temp.act_as('a1400000-0000-4000-8000-000000000002');
select public.set_roulette_decision((select edited from fx), 'ready');
reset role;

create function pg_temp.decision(item uuid, member uuid) returns text language sql as $$
  select r.roulette_decision::text from public.item_responses r where r.item_id = item and r.member_id = member
$$;
create function pg_temp.updated_at(item uuid) returns timestamptz language sql as $$
  select i.updated_at from public.items i where i.id = item
$$;

-- ---------- Edits: only the description asks the other person again ----------
select pg_temp.act_as('a1400000-0000-4000-8000-000000000001');
select public.update_item((select edited from fx), 'Synthetic V3 Renamed', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000013', pg_temp.updated_at((select edited from fx)));
select is(pg_temp.decision((select edited from fx), 'a1400000-0000-4000-8000-000000000012'), 'ready', 'a title-only edit keeps the partner in');
select public.update_item((select edited from fx), 'Synthetic V3 Renamed', 'Synthetic description.', 'a1400000-0000-4000-8000-000000000015', pg_temp.updated_at((select edited from fx)));
select is(pg_temp.decision((select edited from fx), 'a1400000-0000-4000-8000-000000000012'), 'ready', 'a category-only edit keeps the partner in');
select is(pg_temp.decision((select edited from fx), 'a1400000-0000-4000-8000-000000000011'), 'ready', 'and keeps the editor in');
select public.update_item((select edited from fx), 'Synthetic V3 Renamed', 'Synthetic changed description.', 'a1400000-0000-4000-8000-000000000015', pg_temp.updated_at((select edited from fx)));
select is(pg_temp.decision((select edited from fx), 'a1400000-0000-4000-8000-000000000012'), 'pending', 'a description change asks the partner again');
reset role;

-- ---------- Later: the author can choose it too ----------
select pg_temp.act_as('a1400000-0000-4000-8000-000000000001');
select lives_ok(
  format($$select public.decline_item('a1400000-0000-4000-8000-000000000060', %L, '')$$, (select later from fx)),
  'the author can choose Later on their own shared idea'
);
select is(pg_temp.decision((select later from fx), 'a1400000-0000-4000-8000-000000000011'), 'not_now', 'the author''s answer is Later');
select is(pg_temp.decision((select later from fx), 'a1400000-0000-4000-8000-000000000012'), 'pending', 'the partner''s answer is untouched (Later is mutual)');
reset role;

-- ---------- Not for us ----------
select pg_temp.act_as('a1400000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.pass_item('a1400000-0000-4000-8000-000000000061', %L, '')$$, (select draft from fx)),
  'P0001', 'submitted item required',
  'the partner cannot pass on the author''s private draft'
);
select lives_ok(
  format($$select public.pass_item('a1400000-0000-4000-8000-000000000062', %L, '  Synthetic not for me.  ')$$, (select passed from fx)),
  'the partner can say Not for us, with a note'
);
reset role;
select isnt((select archived_at from public.items where id = (select passed from fx)), null, 'Not for us archives the idea for both');
select is(
  (select array_agg(c.body) from public.comments c where c.item_id = (select passed from fx)),
  array['Synthetic not for me.'],
  'the note is posted once, trimmed, in the chat'
);
select is(
  (select array_agg(e.actor_member_id::text) from public.activity_events e where e.item_id = (select passed from fx) and e.event_type = 'item_passed'),
  array['a1400000-0000-4000-8000-000000000012'],
  'one item_passed event, by the person who passed'
);
select pg_temp.act_as('a1400000-0000-4000-8000-000000000002');
select lives_ok(
  format($$select public.pass_item('a1400000-0000-4000-8000-000000000062', %L, 'Synthetic not for me.')$$, (select passed from fx)),
  'a retry of the same request is harmless'
);
reset role;
select is((select count(*) from public.comments c where c.item_id = (select passed from fx)), 1::bigint, 'and posts nothing twice');
select is((select count(*) from public.activity_events e where e.item_id = (select passed from fx) and e.event_type = 'item_passed'), 1::bigint, 'or records it twice');

select pg_temp.act_as('a1400000-0000-4000-8000-000000000001');
select lives_ok(
  format($$select public.pass_item('a1400000-0000-4000-8000-000000000063', %L, null)$$, (select author_passed from fx)),
  'the author can say Not for us, without a note'
);
reset role;
select isnt((select archived_at from public.items where id = (select author_passed from fx)), null, 'that archives it too');
select is((select count(*) from public.comments c where c.item_id = (select author_passed from fx)), 0::bigint, 'with no note, nothing is posted');

select pg_temp.act_as('a1400000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.pass_item('a1400000-0000-4000-8000-000000000064', %L, '')$$, (select edited from fx)),
  'P0001', 'submitted item required',
  'another couple cannot pass on this couple''s idea'
);
reset role;
select is((select archived_at from public.items where id = (select edited from fx)), null, 'and it stays open');

select ok(has_function_privilege('authenticated', 'public.pass_item(uuid,uuid,text)', 'execute'), 'authenticated can pass');
select ok(not has_function_privilege('anon', 'public.pass_item(uuid,uuid,text)', 'execute'), 'anon cannot pass');
select ok(not has_function_privilege('public', 'public.pass_item(uuid,uuid,text)', 'execute'), 'PUBLIC cannot pass');

select * from finish();
rollback;
