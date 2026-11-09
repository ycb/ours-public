create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

-- A killed concurrency run can leave its committed dblink fixture behind.
-- Remove only the fixed synthetic 830... scope before the transactional suite starts.
begin;
delete from public.notification_outbox where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.activity_event_acknowledgements where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.activity_events where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.comments where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.item_views where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.roulette_draws where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.item_responses where couple_id = '83000000-0000-4000-8000-000000000010';
alter table public.item_revisions disable trigger item_revisions_reject_mutation;
delete from public.item_revisions where couple_id = '83000000-0000-4000-8000-000000000010';
alter table public.item_revisions enable trigger item_revisions_reject_mutation;
delete from public.items where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.categories where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.members where couple_id = '83000000-0000-4000-8000-000000000010';
delete from public.couples where id = '83000000-0000-4000-8000-000000000010';
delete from auth.users where id in ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002');
commit;

begin;
select no_plan();

-- n separate spins. (An uncorrelated function in a lateral join runs once, not n times.)
create function pg_temp.spins(p_category uuid, n integer) returns setof uuid language plpgsql as $$
begin
  for attempt in 1..n loop
    return query select d.id from public.draw_roulette(p_category) as d;
  end loop;
end;
$$;
grant execute on function pg_temp.spins(uuid, integer) to authenticated;

-- Live lock-manager state (pg_stat_activity is a per-transaction snapshot; pg_blocking_pids is not).
create function pg_temp.waits_on_lock(backend integer) returns boolean language plpgsql as $$
begin
  for attempt in 1..100 loop
    if pg_catalog.cardinality(pg_catalog.pg_blocking_pids(backend)) > 0 then return true; end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('82000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('82000000-0000-4000-8000-000000000002', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('82000000-0000-4000-8000-000000000010', 'Synthetic Roulette Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000001', 'Synthetic Spinner', 0),
  ('82000000-0000-4000-8000-000000000012', '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000002', 'Synthetic Partner', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('82000000-0000-4000-8000-000000000013', '82000000-0000-4000-8000-000000000010', 'Synthetic Eligible', '82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000014'),
  ('82000000-0000-4000-8000-000000000015', '82000000-0000-4000-8000-000000000010', 'Synthetic Empty', '82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000016');

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
set local role authenticated;

create temporary table roulette_item as
select (public.create_item('82000000-0000-4000-8000-000000000020', 'Synthetic Roulette Idea', 'Synthetic description.', '82000000-0000-4000-8000-000000000013', null, null)).*;
grant select on roulette_item to authenticated;
select public.submit_item((select id from roulette_item));

select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'one Ready decision is not eligible');
select public.set_roulette_decision((select id from roulette_item), 'pending');
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'zero Ready decisions are not eligible');
select public.set_roulette_decision((select id from roulette_item), 'ready');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_roulette_decision((select id from roulette_item), 'ready');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.draw_roulette(null)), 1::bigint, 'two Ready decisions are eligible');
select is((select count(*) from public.draw_roulette('82000000-0000-4000-8000-000000000013')), 1::bigint, 'matching category returns the candidate');
select is((select count(*) from public.draw_roulette('82000000-0000-4000-8000-000000000015')), 0::bigint, 'empty category does not broaden');

-- QA 8: ♥ Favorites narrows the deck to a favorite of either partner, with or without a category.
select is((select count(*) from public.draw_roulette(null, true)), 0::bigint, 'favorites only: an unfavorited idea is not drawn');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_item_favorite((select id from roulette_item), true);
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.draw_roulette(null, true)), 1::bigint, 'favorites only: a partner''s favorite counts');
select is((select count(*) from public.draw_roulette('82000000-0000-4000-8000-000000000013', true)), 1::bigint, 'favorites only within a matching category');
select is((select count(*) from public.draw_roulette('82000000-0000-4000-8000-000000000015', true)), 0::bigint, 'favorites only never broadens a category');
select is((select count(*) from public.draw_roulette(null, false)), 1::bigint, 'favorites off draws as before');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_item_favorite((select id from roulette_item), false);
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.draw_roulette(null, true)), 0::bigint, 'favorites only: unfavoriting removes it');
select is(
  (select count(*) from pg_proc where proname = 'draw_roulette' and pronamespace = 'public'::regnamespace),
  1::bigint, 'draw_roulette has one signature (no ambiguous overload)'
);
select is((select count(*) from public.roulette_draws), 0::bigint, 'drawing a candidate persists nothing');
select enum_has_labels('public', 'draw_outcome', array['accepted', 'deferred'], 'an outcome is only accepted or deferred');
select throws_ok($$select 'rejected'::public.draw_outcome$$, '22P02', null, 'there is no rejected outcome');
select columns_are(
  'public', 'roulette_draws',
  array['id', 'couple_id', 'item_id', 'drawn_by_member_id', 'filter_category_id', 'outcome', 'request_id', 'created_at',
        'source', 'planned_when', 'reflect_after', 'done_at', 'cancelled_at'],
  'a draw has no score, rank or spin-again column (the date columns are QA 2026-11-03)'
);

-- Review: a filtered spin never returns another category's agreed idea.
reset role;
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('82000000-0000-4000-8000-000000000018', '82000000-0000-4000-8000-000000000010', 'Synthetic Second', '82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000019');
set local role authenticated;
create temporary table second_item as
select (public.create_item('82000000-0000-4000-8000-000000000025', 'Synthetic Second Idea', 'Synthetic description.', '82000000-0000-4000-8000-000000000018', null, null)).*;
grant select on second_item to authenticated;
select public.submit_item((select id from second_item));
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_roulette_decision((select id from second_item), 'ready');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from pg_temp.spins('82000000-0000-4000-8000-000000000013', 25) as id where id = (select id from second_item)),
  0::bigint,
  'a category spin never returns an agreed idea from another category'
);
select is(
  (select count(distinct id) from pg_temp.spins(null, 40) as id),
  2::bigint,
  'an unfiltered spin draws from both'
);
reset role;
update public.items set archived_at = now() where id = (select id from second_item);
set local role authenticated;

-- Review: exactly two members, even when the extra member has no response row.
reset role;
insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values ('82000000-0000-4000-8000-000000000004', 'infinity', false, false);
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values ('82000000-0000-4000-8000-000000000027', '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000004', 'Synthetic Unresponded', 3);
set local role authenticated;
select is((select count(*) from public.item_responses where item_id = (select id from roulette_item)), 2::bigint, 'the idea still has exactly two Ready responses');
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'a third member with no response still closes the pool');
select throws_ok(
  format($$select public.record_roulette_outcome('82000000-0000-4000-8000-000000000060', %L, null, 'accepted')$$, (select id from roulette_item)),
  'OU410', 'roulette candidate unavailable', 'and blocks recording'
);
reset role;
delete from public.members where id = '82000000-0000-4000-8000-000000000027';
delete from auth.users where id = '82000000-0000-4000-8000-000000000004';
set local role authenticated;

-- Review: the real Not now, edit-reset and archive paths remove eligibility.
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.decline_item('82000000-0000-4000-8000-000000000061', (select id from roulette_item), 'Synthetic roulette reason');
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'Not now through decline_item removes the idea');
select public.set_roulette_decision((select id from roulette_item), 'ready');
select is((select count(*) from public.draw_roulette(null)), 1::bigint, 'and I''m in brings it back');
select public.update_item((select id from roulette_item), 'Synthetic Roulette Idea', 'Synthetic description, co-edited.', '82000000-0000-4000-8000-000000000013');
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'an edit that asks the author again removes the idea');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select public.set_roulette_decision((select id from roulette_item), 'ready');
select is((select count(*) from public.draw_roulette(null)), 1::bigint, 'until the author is in again');
select public.archive_item((select id from roulette_item));
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'archive_item removes the idea');
reset role;
update public.items set archived_at = null where id = (select id from roulette_item);
set local role authenticated;

reset role;
create temporary table missing_response as
select * from public.item_responses where item_id = (select id from roulette_item) and member_id = '82000000-0000-4000-8000-000000000012';
delete from public.item_responses where id = (select id from missing_response);
set local role authenticated;
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'a missing response fails closed');
reset role;
insert into public.item_responses select * from missing_response;

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values ('82000000-0000-4000-8000-000000000003', 'infinity', false, false);
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values ('82000000-0000-4000-8000-000000000017', '82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000003', 'Synthetic Extra', 2);
insert into public.item_responses (couple_id, item_id, member_id, roulette_decision)
values ('82000000-0000-4000-8000-000000000010', (select id from roulette_item), '82000000-0000-4000-8000-000000000017', 'ready');
set local role authenticated;
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'excess responses and members fail closed');
reset role;
delete from public.item_responses where member_id = '82000000-0000-4000-8000-000000000017';
delete from public.members where id = '82000000-0000-4000-8000-000000000017';
delete from auth.users where id = '82000000-0000-4000-8000-000000000003';

update public.item_responses set roulette_decision = 'not_now'
where item_id = (select id from roulette_item) and member_id = '82000000-0000-4000-8000-000000000012';
set local role authenticated;
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'Not now removes a candidate immediately');
reset role;
update public.item_responses set roulette_decision = 'ready'
where item_id = (select id from roulette_item) and member_id = '82000000-0000-4000-8000-000000000012';
set local role authenticated;

create temporary table accepted_draw as
select (public.record_roulette_outcome('82000000-0000-4000-8000-000000000021', (select id from roulette_item), null, 'accepted')).*;
grant select on accepted_draw to authenticated;
select is((select outcome::text from accepted_draw), 'accepted', 'Accept records an accepted draw');
select is((select drawn_by_member_id from accepted_draw), '82000000-0000-4000-8000-000000000011'::uuid, 'the actor is derived from auth');
select is((select count(*) from public.activity_events where draw_id = (select id from accepted_draw) and event_type = 'draw_accepted'), 1::bigint, 'Accept records one content-free activity event');
reset role;
select is(
  (select count(*) from public.notification_outbox_events l join public.activity_events e on e.id = l.activity_event_id where e.draw_id = (select id from accepted_draw)),
  0::bigint,
  'a recorded draw never queues an email'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_roulette_decision((select id from roulette_item), 'pending');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select is((public.record_roulette_outcome('82000000-0000-4000-8000-000000000021', (select id from roulette_item), null, 'accepted')).id, (select id from accepted_draw), 'an idempotent retry returns the original after revocation');
select throws_ok(
  format($$select public.record_roulette_outcome('82000000-0000-4000-8000-000000000022', %L, null, 'deferred')$$, (select id from roulette_item)),
  'OU410', 'roulette candidate unavailable', 'a new outcome rejects a stale candidate'
);
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select public.set_roulette_decision((select id from roulette_item), 'ready');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format($$select public.record_roulette_outcome('82000000-0000-4000-8000-000000000024', %L, '82000000-0000-4000-8000-000000000015', 'accepted')$$, (select id from roulette_item)),
  'OU410', 'roulette candidate unavailable', 'recording rechecks category membership'
);
select is((public.record_roulette_outcome('82000000-0000-4000-8000-000000000023', (select id from roulette_item), '82000000-0000-4000-8000-000000000013', 'deferred')).outcome::text, 'deferred', 'Leave for later records a deferred draw');
select is((select count(*) from public.activity_events where event_type = 'draw_deferred' and item_id = (select id from roulette_item)), 1::bigint, 'defer records one activity event');

reset role;
update public.items set archived_at = now() where id = (select id from roulette_item);
set local role authenticated;
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'archiving removes a candidate immediately');
reset role;
update public.items set archived_at = null where id = (select id from roulette_item);

update public.categories set archived_at = now() where id = '82000000-0000-4000-8000-000000000015';
set local role authenticated;
select throws_ok(
  $$select public.draw_roulette('82000000-0000-4000-8000-000000000015')$$,
  'OU411', 'active category in current couple required', 'an archived category is rejected with its own code'
);
reset role;

-- A second synthetic couple proves tenant isolation and the one-member fail-closed case.
insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('82000000-0000-4000-8000-000000000031', 'infinity', false, false),
  ('82000000-0000-4000-8000-000000000032', 'infinity', false, false);
insert into public.couples (id, display_name) values ('82000000-0000-4000-8000-000000000030', 'Synthetic Foreign Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order) values
  ('82000000-0000-4000-8000-000000000033', '82000000-0000-4000-8000-000000000030', '82000000-0000-4000-8000-000000000031', 'Synthetic Foreign A', 0),
  ('82000000-0000-4000-8000-000000000034', '82000000-0000-4000-8000-000000000030', '82000000-0000-4000-8000-000000000032', 'Synthetic Foreign B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('82000000-0000-4000-8000-000000000035', '82000000-0000-4000-8000-000000000030', 'Synthetic Foreign Category', '82000000-0000-4000-8000-000000000033', '82000000-0000-4000-8000-000000000036');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000031', true);
set local role authenticated;
create temporary table foreign_item as
select (public.create_item('82000000-0000-4000-8000-000000000038', 'Synthetic Foreign Idea', 'Synthetic foreign description.', '82000000-0000-4000-8000-000000000035', null, null)).*;
grant select on foreign_item to authenticated;
select public.submit_item((select id from foreign_item));
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000032', true);
select public.set_roulette_decision((select id from foreign_item), 'ready');
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.draw_roulette('82000000-0000-4000-8000-000000000035')$$,
  'OU411', 'active category in current couple required', 'a foreign category is rejected with the same code'
);
select is(
  (select count(*) from pg_temp.spins(null, 20) as id where id = (select id from foreign_item)),
  0::bigint,
  'an unfiltered spin never returns another couple''s agreed idea'
);
select throws_ok(
  format($$select public.record_roulette_outcome('82000000-0000-4000-8000-000000000039', %L, null, 'accepted')$$, (select id from foreign_item)),
  'OU410', 'roulette candidate unavailable', 'a foreign item cannot be recorded'
);
reset role;
delete from public.item_responses where item_id = (select id from foreign_item) and member_id = '82000000-0000-4000-8000-000000000034';
delete from public.activity_events where actor_member_id = '82000000-0000-4000-8000-000000000034';
delete from public.notification_outbox where recipient_member_id = '82000000-0000-4000-8000-000000000034';
delete from public.members where id = '82000000-0000-4000-8000-000000000034';
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000031', true);
set local role authenticated;
select is((select count(*) from public.draw_roulette(null)), 0::bigint, 'a one-member couple fails closed');
reset role;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);

-- A committed dblink fixture proves recording waits for an in-flight revocation, then rejects it.
select is(extensions.dblink_connect('roulette_setup', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())), 'OK', 'race setup connects');
select is(extensions.dblink_connect('roulette_revoke', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())), 'OK', 'revoker connects');
select is(extensions.dblink_connect('roulette_record', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())), 'OK', 'recorder connects');
select extensions.dblink_exec('roulette_setup', $setup$
  insert into auth.users (id, banned_until, is_sso_user, is_anonymous) values
    ('83000000-0000-4000-8000-000000000001','infinity',false,false),
    ('83000000-0000-4000-8000-000000000002','infinity',false,false);
  insert into public.couples (id,display_name) values ('83000000-0000-4000-8000-000000000010','Synthetic Race Couple');
  insert into public.members (id,couple_id,auth_user_id,display_name,sort_order) values
    ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000010','83000000-0000-4000-8000-000000000001','Synthetic Race A',0),
    ('83000000-0000-4000-8000-000000000012','83000000-0000-4000-8000-000000000010','83000000-0000-4000-8000-000000000002','Synthetic Race B',1);
  insert into public.categories (id,couple_id,name,created_by_member_id,request_id) values
    ('83000000-0000-4000-8000-000000000013','83000000-0000-4000-8000-000000000010','Synthetic Race Category','83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000014')
$setup$);
select extensions.dblink_exec('roulette_setup', 'begin');
select extensions.dblink_exec('roulette_setup', 'set local role authenticated');
select extensions.dblink_exec('roulette_setup', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001'$$);
select extensions.dblink_exec('roulette_setup', $create$do $$declare target uuid; begin
  select id into target from public.create_item('83000000-0000-4000-8000-000000000020','Synthetic Race Idea','Synthetic race description.','83000000-0000-4000-8000-000000000013',null,null);
  perform public.submit_item(target);
end$$$create$);
select extensions.dblink_exec('roulette_setup', 'commit');
select extensions.dblink_exec('roulette_setup', 'begin');
select extensions.dblink_exec('roulette_setup', 'set local role authenticated');
select extensions.dblink_exec('roulette_setup', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002'$$);
select extensions.dblink_exec('roulette_setup', $ready$do $$begin
  perform public.set_roulette_decision((select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),'ready');
end$$$ready$);
select extensions.dblink_exec('roulette_setup', 'commit');

create temporary table race_record_pid as select pid from extensions.dblink('roulette_record', 'select pg_backend_pid()') as p(pid integer);
select extensions.dblink_exec('roulette_record', $fn$create function pg_temp.try_record() returns text language plpgsql as $$begin
  perform public.record_roulette_outcome('83000000-0000-4000-8000-000000000021',(select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),null,'accepted');
  return 'recorded';
exception when sqlstate 'OU410' then return sqlstate;
end$$$fn$);
select extensions.dblink_exec('roulette_revoke', 'begin');
select extensions.dblink_exec('roulette_revoke', 'set local role authenticated');
select extensions.dblink_exec('roulette_revoke', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002'$$);
select is((select count(*) from extensions.dblink('roulette_revoke', $q$select (public.set_roulette_decision((select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),'pending')).id$q$) as r(id uuid)), 1::bigint, 'revocation holds the item lock');
select extensions.dblink_exec('roulette_record', 'begin');
select extensions.dblink_exec('roulette_record', 'set local role authenticated');
select extensions.dblink_exec('roulette_record', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001'$$);
select is(extensions.dblink_send_query('roulette_record', 'select pg_temp.try_record()'), 1, 'recording starts while revocation is open');
select ok(pg_temp.waits_on_lock((select pid from race_record_pid)), 'recording waits on the item lock');
select is(extensions.dblink_exec('roulette_revoke', 'commit'), 'COMMIT', 'revocation commits');
select is((select result from extensions.dblink_get_result('roulette_record') as r(result text)), 'OU410', 'recording rechecks and rejects the revoked candidate');
select is((select count(*) from extensions.dblink_get_result('roulette_record') as r(result text)), 0::bigint, 'recorder result is drained');
select is(extensions.dblink_exec('roulette_record', 'commit'), 'COMMIT', 'recorder commits');

-- Review regression: a recorder must not need a lock that foreign-key checks conflict with.
-- Holding KEY SHARE on the couple (as any insert's FK check does) used to make the recorder wait
-- while holding the item, and a partner's reply then deadlocked against it.
select extensions.dblink_exec('roulette_setup', 'begin');
select extensions.dblink_exec('roulette_setup', 'set local role authenticated');
select extensions.dblink_exec('roulette_setup', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002'$$);
select extensions.dblink_exec('roulette_setup', $ready$do $$begin
  perform public.set_roulette_decision((select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),'ready');
end$$$ready$);
select extensions.dblink_exec('roulette_setup', 'commit');
select extensions.dblink_exec('roulette_record', $fn$create function pg_temp.try_record_beside_fk() returns text language plpgsql as $$begin
  perform public.record_roulette_outcome('83000000-0000-4000-8000-000000000022',(select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),null,'accepted');
  return 'recorded';
exception when lock_not_available then return 'lock_timeout';
end$$$fn$);
select extensions.dblink_exec('roulette_revoke', $fn$create function pg_temp.try_reply() returns text language plpgsql as $$begin
  perform public.add_comment('83000000-0000-4000-8000-000000000023',(select id from public.items where request_id = '83000000-0000-4000-8000-000000000020'),'Synthetic race reply');
  return 'replied';
exception when lock_not_available then return 'lock_timeout';
end$$$fn$);
select extensions.dblink_exec('roulette_setup', 'begin');
select is(
  (select count(*) from extensions.dblink('roulette_setup', $q$select 1 from public.couples where id = '83000000-0000-4000-8000-000000000010' for key share$q$) as r(x integer)),
  1::bigint, 'another write holds the foreign-key share lock on the couple'
);
select extensions.dblink_exec('roulette_record', 'begin');
select extensions.dblink_exec('roulette_record', $$set local lock_timeout = '2s'$$);
select extensions.dblink_exec('roulette_record', 'set local role authenticated');
select extensions.dblink_exec('roulette_record', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001'$$);
select is(
  (select result from extensions.dblink('roulette_record', 'select pg_temp.try_record_beside_fk()') as r(result text)),
  'recorded', 'recording does not wait on a foreign-key share lock'
);
select extensions.dblink_exec('roulette_revoke', 'begin');
select extensions.dblink_exec('roulette_revoke', $$set local lock_timeout = '2s'$$);
select extensions.dblink_exec('roulette_revoke', 'set local role authenticated');
select extensions.dblink_exec('roulette_revoke', $$set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002'$$);
create temporary table race_reply_pid as select pid from extensions.dblink('roulette_revoke', 'select pg_backend_pid()') as p(pid integer);
select is(extensions.dblink_send_query('roulette_revoke', 'select pg_temp.try_reply()'), 1, 'the partner replies on the idea meanwhile');
-- The reply's notification enqueue serializes on the couple behind the open recording, which
-- itself waits on nothing: ordered, not deadlocked.
select ok(pg_temp.waits_on_lock((select pid from race_reply_pid)), 'the reply waits its turn on the couple');
select is(extensions.dblink_exec('roulette_record', 'commit'), 'COMMIT', 'the recording commits');
select is((select result from extensions.dblink_get_result('roulette_revoke') as r(result text)), 'replied', 'then the reply completes');
select is((select count(*) from extensions.dblink_get_result('roulette_revoke') as r(result text)), 0::bigint, 'reply result is drained');
select is(extensions.dblink_exec('roulette_revoke', 'commit'), 'COMMIT', 'the reply commits');
select is(extensions.dblink_exec('roulette_setup', 'commit'), 'COMMIT', 'the other write commits');

select extensions.dblink_disconnect(conn) from unnest(array['roulette_setup','roulette_revoke','roulette_record']) as c(conn);

set local role authenticated;
select lives_ok($$select public.draw_roulette(null)$$, 'authenticated can execute draw');
reset role;
select ok(has_function_privilege('authenticated', 'public.draw_roulette(uuid,boolean)', 'execute'), 'authenticated can draw');
select ok(has_function_privilege('authenticated', 'public.record_roulette_outcome(uuid,uuid,uuid,public.draw_outcome)', 'execute'), 'authenticated can record');
select ok(not has_function_privilege('anon', 'public.draw_roulette(uuid,boolean)', 'execute'), 'anon cannot draw');
select ok(not has_function_privilege('anon', 'public.record_roulette_outcome(uuid,uuid,uuid,public.draw_outcome)', 'execute'), 'anon cannot record');
select ok(not has_function_privilege('public', 'public.draw_roulette(uuid,boolean)', 'execute'), 'PUBLIC cannot draw');
select ok(not has_function_privilege('public', 'public.record_roulette_outcome(uuid,uuid,uuid,public.draw_outcome)', 'execute'), 'PUBLIC cannot record outcomes');
set local role anon;
select throws_ok($$select public.draw_roulette(null)$$, '42501', null, 'anon execution of draw is denied');
select throws_ok(
  $$select public.record_roulette_outcome('82000000-0000-4000-8000-000000000040', '82000000-0000-4000-8000-000000000037', null, 'accepted')$$,
  '42501', null, 'anon execution of record is denied'
);
reset role;
select function_returns('public', 'record_roulette_outcome', array['uuid','uuid','uuid','draw_outcome'], 'roulette_draws', 'record returns a draw row');

reset role;
delete from public.notification_outbox where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.activity_event_acknowledgements where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.activity_events where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.comments where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.item_views where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.roulette_draws where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.item_responses where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
alter table public.item_revisions disable trigger item_revisions_reject_mutation;
delete from public.item_revisions where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
alter table public.item_revisions enable trigger item_revisions_reject_mutation;
delete from public.items where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.categories where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.members where couple_id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from public.couples where id in ('82000000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010');
delete from auth.users where id::text like '82000000-%' or id::text like '83000000-%';

select * from finish();
commit;
