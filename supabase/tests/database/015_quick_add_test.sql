-- QA 2026-11-03 (quick add): a title is enough. The description may be empty (never null, never
-- untrimmed), on the idea and in its edit history.
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
  ('a1500000-0000-4000-8000-000000000001', 'synthetic-quick-a@ours.invalid', 'infinity', false, false),
  ('a1500000-0000-4000-8000-000000000002', 'synthetic-quick-b@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name) values ('a1500000-0000-4000-8000-000000000010', 'Synthetic Quick Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('a1500000-0000-4000-8000-000000000011', 'a1500000-0000-4000-8000-000000000010', 'a1500000-0000-4000-8000-000000000001', 'Synthetic Quick A', 0),
  ('a1500000-0000-4000-8000-000000000012', 'a1500000-0000-4000-8000-000000000010', 'a1500000-0000-4000-8000-000000000002', 'Synthetic Quick B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('a1500000-0000-4000-8000-000000000013', 'a1500000-0000-4000-8000-000000000010', 'Synthetic Quick Category', 'a1500000-0000-4000-8000-000000000011', 'a1500000-0000-4000-8000-000000000014');

select pg_temp.act_as('a1500000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.create_item('a1500000-0000-4000-8000-000000000020', 'Synthetic title only', '', 'a1500000-0000-4000-8000-000000000013', null, null)$$,
  'an idea can be created with a title alone'
);
create temporary table fx as select id from public.items where request_id = 'a1500000-0000-4000-8000-000000000020';
grant select on fx to authenticated;
select is((select description from public.items where id = (select id from fx)), '', 'its description is empty, not null');
select is((select description from public.item_revisions where item_id = (select id from fx) order by revision_number limit 1), '', 'and so is its first revision');
select lives_ok(
  format($$select public.update_item(%L, 'Synthetic title only', 'Synthetic details added later.', 'a1500000-0000-4000-8000-000000000013')$$, (select id from fx)),
  'details can be added later'
);
select lives_ok(
  format($$select public.update_item(%L, 'Synthetic title only', '', 'a1500000-0000-4000-8000-000000000013')$$, (select id from fx)),
  'and removed again'
);
select throws_ok(
  $$select public.create_item('a1500000-0000-4000-8000-000000000021', 'Synthetic padded', '  ', 'a1500000-0000-4000-8000-000000000013', null, null)$$,
  '23514', null,
  'whitespace is still not a description (the app trims first)'
);
select throws_ok(
  $$select public.create_item('a1500000-0000-4000-8000-000000000022', '', '', 'a1500000-0000-4000-8000-000000000013', null, null)$$,
  '23514', null,
  'a title is still required'
);
reset role;

select * from finish();
rollback;
