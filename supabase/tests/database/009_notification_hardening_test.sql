-- Task 7B hardening (revised by 7D.2): a notification has exactly one intended recipient or fails closed.
begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('91000000-0000-4000-8000-000000000001', 'synthetic-hardening-a@ours.invalid', 'infinity', false, false),
  ('91000000-0000-4000-8000-000000000002', 'synthetic-hardening-b@ours.invalid', 'infinity', false, false),
  ('91000000-0000-4000-8000-000000000003', 'synthetic-hardening-c@ours.invalid', 'infinity', false, false),
  ('91000000-0000-4000-8000-000000000004', 'synthetic-hardening-other@ours.invalid', 'infinity', false, false);

insert into public.couples (id, display_name)
values
  ('91000000-0000-4000-8000-000000000010', 'Synthetic Three Member Couple'),
  ('91000000-0000-4000-8000-000000000020', 'Synthetic One Member Couple'),
  ('91000000-0000-4000-8000-000000000030', 'Synthetic Other Couple');

insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000001', 'Synthetic A', 0),
  ('91000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000002', 'Synthetic B', 1),
  ('91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000003', 'Synthetic C', 0),
  ('91000000-0000-4000-8000-000000000022', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000004', 'Synthetic D', 1);

insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('91000000-0000-4000-8000-000000000013', '91000000-0000-4000-8000-000000000010', 'Synthetic Three Category', '91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000014'),
  ('91000000-0000-4000-8000-000000000023', '91000000-0000-4000-8000-000000000020', 'Synthetic One Category', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000024');

select pg_temp.act_as('91000000-0000-4000-8000-000000000001');
create temporary table three_member_item as
select (public.create_item(
  '91000000-0000-4000-8000-000000000015',
  'Synthetic Three Member Draft',
  'Synthetic notification hardening only.',
  '91000000-0000-4000-8000-000000000013',
  null,
  null
)).*;
grant select on three_member_item to authenticated;
reset role;

select pg_temp.act_as('91000000-0000-4000-8000-000000000003');
create temporary table one_member_item as
select (public.create_item(
  '91000000-0000-4000-8000-000000000025',
  'Synthetic One Member Draft',
  'Synthetic notification hardening only.',
  '91000000-0000-4000-8000-000000000023',
  null,
  null
)).*;
grant select on one_member_item to authenticated;
reset role;

-- Misprovision the first couple after the draft exists.
insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values ('91000000-0000-4000-8000-000000000005', 'synthetic-hardening-third@ours.invalid', 'infinity', false, false);
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values ('91000000-0000-4000-8000-000000000019', '91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000005', 'Synthetic Third', 2);

select pg_temp.act_as('91000000-0000-4000-8000-000000000001');
select throws_ok(
  format('select public.submit_item(%L)', (select id from three_member_item)),
  'P0001',
  'notification requires exactly two couple members',
  'a three-member provisioning mistake fails the share closed'
);
reset role;
select is((select status::text from public.items where id = (select id from three_member_item)), 'draft', 'the failed three-member share remains a draft');
select is((select count(*) from public.notification_outbox where couple_id = '91000000-0000-4000-8000-000000000010'), 0::bigint, 'the failed three-member share notifies nobody');

-- Misprovision the second couple down to one member after the draft exists.
delete from public.item_responses where item_id = (select id from one_member_item) and member_id = '91000000-0000-4000-8000-000000000022';
delete from public.members where id = '91000000-0000-4000-8000-000000000022';

select pg_temp.act_as('91000000-0000-4000-8000-000000000003');
select throws_ok(
  format('select public.submit_item(%L)', (select id from one_member_item)),
  'P0001',
  'notification requires exactly two couple members',
  'a one-member provisioning mistake fails the share closed'
);
reset role;
select is((select status::text from public.items where id = (select id from one_member_item)), 'draft', 'the failed one-member share remains a draft');
select is((select count(*) from public.notification_outbox where couple_id = '91000000-0000-4000-8000-000000000020'), 0::bigint, 'the failed one-member share notifies nobody');

-- Existing composite foreign keys reject an event actor outside the event's couple before enqueueing.
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values ('91000000-0000-4000-8000-000000000031', '91000000-0000-4000-8000-000000000030', '91000000-0000-4000-8000-000000000004', 'Synthetic Other', 0);
select throws_ok(
  format(
    'insert into public.activity_events (couple_id, actor_member_id, event_type, item_id) values (%L, %L, %L, %L)',
    '91000000-0000-4000-8000-000000000010',
    '91000000-0000-4000-8000-000000000031',
    'item_created',
    (select id from three_member_item)
  ),
  '23503',
  null,
  'an actor outside the event couple is rejected before notification enqueueing'
);
select is(
  (
    select count(*)
    from public.notification_outbox
    where couple_id in ('91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000020')
  ),
  0::bigint,
  'invalid actor state leaves the hardening fixtures out of the outbox'
);

select * from finish();
rollback;
