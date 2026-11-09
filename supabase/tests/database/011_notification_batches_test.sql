-- Task 7D.2: the outbox holds delivery batches, not one row per event.
-- Runs outside a single transaction (like 005) so independent sessions can see committed
-- synthetic fixtures; everything it creates is removed at the end.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select no_plan();

-- A run that died part-way leaves committed fixtures behind; remove them first.
begin;
delete from public.notification_outbox where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.activity_event_acknowledgements where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.activity_events where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.comments where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.item_views where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.item_responses where couple_id = 'b1000000-0000-4000-8000-000000000010';
alter table public.item_revisions disable trigger item_revisions_reject_mutation;
delete from public.item_revisions where couple_id = 'b1000000-0000-4000-8000-000000000010';
alter table public.item_revisions enable trigger item_revisions_reject_mutation;
delete from public.items where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.categories where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.members where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.couples where id = 'b1000000-0000-4000-8000-000000000010';
delete from auth.users where id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
commit;

-- Session-level helpers (each autocommit statement is its own transaction).
create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  execute 'set role authenticated';
end;
$$;
create function pg_temp.act_as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role service_role';
end;
$$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'reset role';
end;
$$;
-- Links for one delivery row.
create function pg_temp.links(p_outbox uuid) returns bigint language sql as $$
  select count(*) from public.notification_outbox_events where outbox_id = p_outbox;
$$;
-- The single unsealed digest for a recipient (null when none).
create function pg_temp.open_digest(p_member uuid) returns uuid language sql as $$
  select id from public.notification_outbox
  where recipient_member_id = p_member and kind::text = 'activity_digest' and sealed_at is null;
$$;
create function pg_temp.waits_on_lock(p_conn text) returns boolean language plpgsql as $$
declare
  backend integer := (select pid from pg_temp.pids where conn = p_conn);
begin
  for attempt in 1..100 loop
    if pg_catalog.cardinality(pg_catalog.pg_blocking_pids(backend)) > 0 then
      return true;
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  return false;
end;
$$;
create function pg_temp.make_due(p_outbox uuid) returns void language sql as $$
  update public.notification_outbox set not_before = now() - interval '1 minute' where id = p_outbox;
$$;

-- ---------- Schema: delivery identity plus content-free event links ----------
select enum_has_labels('public', 'notification_kind', array['idea_shared', 'activity_digest'], 'deliveries are either a share or a digest');
select columns_are(
  'public', 'notification_outbox',
  array['id', 'couple_id', 'recipient_member_id', 'kind', 'created_at', 'not_before', 'claimed_at', 'sealed_at', 'sent_at', 'suppressed_at', 'attempts', 'last_error_code'],
  'a delivery has ids, a kind, timestamps and counters only, and no longer names one item'
);
select columns_are(
  'public', 'notification_outbox_events',
  array['outbox_id', 'couple_id', 'activity_event_id', 'suppressed_at'],
  'a delivery link has ids and a timestamp only'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notification_outbox_events'::regclass),
  'delivery links have row level security on'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox_events', 'select')
  and not has_table_privilege('anon', 'public.notification_outbox_events', 'select')
  and not has_table_privilege('authenticated', 'public.notification_outbox_events', 'insert'),
  'members and anonymous users have no access to delivery links'
);
select is(
  pg_get_function_result('public.claim_notifications(integer)'::regprocedure),
  'TABLE(id uuid, kind notification_kind, recipient_email text)',
  'a claim returns only the delivery id, its generic kind, and the address'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'execute'),
  'members still cannot claim deliveries'
);

-- ---------- Fixtures (committed, synthetic) ----------
insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('b1000000-0000-4000-8000-000000000001', 'synthetic-batch-a@ours.invalid', 'infinity', false, false),
  ('b1000000-0000-4000-8000-000000000002', 'synthetic-batch-b@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('b1000000-0000-4000-8000-000000000010', 'Synthetic Batch Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('b1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000010', 'b1000000-0000-4000-8000-000000000001', 'Synthetic Batch A', 0),
  ('b1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000010', 'b1000000-0000-4000-8000-000000000002', 'Synthetic Batch B', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('b1000000-0000-4000-8000-000000000013', 'b1000000-0000-4000-8000-000000000010', 'Synthetic Batch Category', 'b1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000014');

-- A's draft: drafts are silent.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.create_item('b1000000-0000-4000-8000-000000000020', 'Synthetic Batch One', 'Synthetic batch description.', 'b1000000-0000-4000-8000-000000000013', null, null);
select pg_temp.as_owner();
create temporary table fx as
select
  (select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000020') as item_one;
grant select on fx to public;
select is((select count(*) from public.notification_outbox where couple_id = 'b1000000-0000-4000-8000-000000000010'), 0::bigint, 'a draft creates no delivery');

-- ---------- Share: a dedicated delivery, due after five minutes ----------
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.submit_item((select item_one from fx));
select pg_temp.as_owner();
create temporary table share_row as
select o.*, e.id as event_id, e.created_at as event_at
from public.notification_outbox o
join public.notification_outbox_events l on l.outbox_id = o.id
join public.activity_events e on e.id = l.activity_event_id
where o.couple_id = 'b1000000-0000-4000-8000-000000000010' and o.kind::text = 'idea_shared';
grant select on share_row to public;
select is((select count(*) from share_row), 1::bigint, 'a share creates one share delivery with one link');
select is((select recipient_member_id from share_row), 'b1000000-0000-4000-8000-000000000012'::uuid, 'the share goes to the other partner');
select is((select not_before - event_at from share_row), interval '5 minutes', 'a share is due five minutes after the event');
select is(
  (select e.event_type::text from public.activity_events e where e.id = (select event_id from share_row)),
  'item_created',
  'the share links its creation event'
);

-- ---------- Digest: edits, replies, holds and agreement join one rolling batch ----------
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.update_item((select item_one from fx), 'Synthetic Batch One Edited', 'Synthetic batch description.', 'b1000000-0000-4000-8000-000000000013');
select pg_temp.as_owner();
select ok(pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') is not null, 'an edit opens a digest for the partner');
select is(
  (
    select o.not_before - e.created_at
    from public.notification_outbox o
    join public.notification_outbox_events l on l.outbox_id = o.id
    join public.activity_events e on e.id = l.activity_event_id
    where o.id = pg_temp.open_digest('b1000000-0000-4000-8000-000000000012')
  ),
  interval '1 hour',
  'a digest is due one hour after its first event'
);

select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.add_comment('b1000000-0000-4000-8000-000000000030', (select item_one from fx), 'Synthetic batch reply from A');
select pg_temp.as_owner();
select is(pg_temp.links(pg_temp.open_digest('b1000000-0000-4000-8000-000000000012')), 2::bigint, 'a later event joins the same open digest');
select is(
  (select count(*) from public.notification_outbox where recipient_member_id = 'b1000000-0000-4000-8000-000000000012' and kind::text = 'activity_digest'),
  1::bigint,
  'the partner still has one digest'
);

-- B replies and puts it on hold: those go to A's own digest.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.add_comment('b1000000-0000-4000-8000-000000000031', (select item_one from fx), 'Synthetic batch reply from B');
select public.decline_item('b1000000-0000-4000-8000-000000000032', (select item_one from fx), 'Synthetic batch reason');
select pg_temp.as_owner();
select is(pg_temp.links(pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')), 2::bigint, 'a reply and a hold join the author''s digest as two candidates');
select is(
  (
    select array_agg(e.event_type::text order by e.event_type::text)
    from public.notification_outbox_events l
    join public.activity_events e on e.id = l.activity_event_id
    where l.outbox_id = pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')
  ),
  array['comment_added', 'item_declined'],
  'a hold contributes one item_declined candidate, not a second reply'
);

-- Interest and favorite changes stay silent.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.set_item_interest((select item_one from fx), 'curious');
select public.set_item_favorite((select item_one from fx), true);
select pg_temp.as_owner();
select is(pg_temp.links(pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')), 2::bigint, 'interest and favorite changes enqueue nothing');

-- Agreement: B moves from hold to In; both are in.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.set_roulette_decision((select item_one from fx), 'ready');
select pg_temp.as_owner();
select is(pg_temp.links(pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')), 3::bigint, 'agreement joins the digest');
select is(
  (select count(*) from public.notification_outbox_events l join public.activity_events e on e.id = l.activity_event_id
   where e.couple_id = 'b1000000-0000-4000-8000-000000000010' and e.event_type::text not in ('item_created', 'item_remixed', 'item_edited', 'comment_added', 'item_declined', 'item_became_eligible')),
  0::bigint,
  'no other event type is ever linked'
);
select is(
  (select count(*) from public.activity_events e where e.couple_id = 'b1000000-0000-4000-8000-000000000010' and e.event_type::text in ('item_created', 'item_remixed', 'item_edited', 'comment_added', 'item_declined', 'item_became_eligible')),
  (select count(*) from public.notification_outbox_events where couple_id = 'b1000000-0000-4000-8000-000000000010'),
  'every qualifying event is linked exactly once'
);

-- ---------- Constraints ----------
select throws_ok(
  format(
    'insert into public.notification_outbox_events (outbox_id, couple_id, activity_event_id) values (%L, %L, %L)',
    pg_temp.open_digest('b1000000-0000-4000-8000-000000000011'),
    'b1000000-0000-4000-8000-000000000010',
    (select event_id from share_row)
  ),
  '23505', null,
  'an event can belong to only one delivery'
);
select throws_ok(
  $$insert into public.notification_outbox (couple_id, recipient_member_id, kind, not_before)
    values ('b1000000-0000-4000-8000-000000000010', 'b1000000-0000-4000-8000-000000000011', 'activity_digest', now())$$,
  '23505', null,
  'a recipient has at most one unsealed digest'
);
select throws_ok(
  format(
    'insert into public.notification_outbox_events (outbox_id, couple_id, activity_event_id) values (%L, %L, %L)',
    pg_temp.open_digest('b1000000-0000-4000-8000-000000000011'),
    '00000000-0000-4000-8000-0000000000c0',
    (select id from public.activity_events where couple_id = 'b1000000-0000-4000-8000-000000000010' and event_type::text = 'response_changed' limit 1)
  ),
  '23503', null,
  'a link must stay inside its delivery''s couple'
);
select throws_ok(
  format('update public.notification_outbox set claimed_at = now() where id = %L', pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')),
  '23514', null,
  'a delivery cannot be claimed without being sealed'
);

-- ---------- Sealing: a claimed digest never changes; new events open the next one ----------
create temporary table digest_a as select pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') as id;
grant select on digest_a to public;
select pg_temp.make_due((select id from digest_a));
select pg_temp.act_as_service();
create temporary table claim_a as select * from public.claim_notifications(10);
grant select on claim_a to public;
select pg_temp.as_owner();
select is((select count(*) from claim_a where id = (select id from digest_a)), 1::bigint, 'a due digest is claimed');
select is((select kind::text from claim_a where id = (select id from digest_a)), 'activity_digest', 'with its generic kind');
select ok((select sealed_at is not null from public.notification_outbox where id = (select id from digest_a)), 'claiming seals the digest');
select is((select count(*) from claim_a where id = (select id from share_row)), 0::bigint, 'a share that is not yet due is not claimed');

select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.add_comment('b1000000-0000-4000-8000-000000000033', (select item_one from fx), 'Synthetic batch after seal');
select pg_temp.as_owner();
select is(pg_temp.links((select id from digest_a)), 2::bigint, 'a sealed digest keeps its membership');
select ok(
  pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') is not null
  and pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') <> (select id from digest_a),
  'an event after the seal opens the next digest'
);
create temporary table digest_b as select pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') as id;
grant select on digest_b to public;
select is(pg_temp.links((select id from digest_b)), 1::bigint, 'the next digest holds only the new event');

-- Fail and retry A: it stays sealed, is claimable again, and never merges with B.
select pg_temp.act_as_service();
select public.mark_notification_failed((select id from digest_a), 'smtp_unavailable');
select pg_temp.as_owner();
select ok((select sealed_at is not null and claimed_at is null from public.notification_outbox where id = (select id from digest_a)), 'a failed digest releases its claim but stays sealed');
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.add_comment('b1000000-0000-4000-8000-000000000034', (select item_one from fx), 'Synthetic batch during retry');
select pg_temp.as_owner();
select is(pg_temp.links((select id from digest_a)), 2::bigint, 'a failed digest does not reopen');
select is(pg_temp.links((select id from digest_b)), 2::bigint, 'events during the retry join the next digest');
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10) where id = (select id from digest_a)), 1::bigint, 'the failed digest is claimed again');
select public.mark_notification_sent((select id from digest_a));
select pg_temp.as_owner();
select is(pg_temp.links((select id from digest_a)), 2::bigint, 'the retried digest still has its original membership');

-- ---------- Deleting an idea empties its deliveries; an empty delivery never sends ----------
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.create_item('b1000000-0000-4000-8000-000000000040', 'Synthetic Batch Doomed', 'Synthetic doomed description.', 'b1000000-0000-4000-8000-000000000013', null, null);
select public.submit_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000040'));
select pg_temp.as_owner();
create temporary table doomed_share as
select l.outbox_id as id
from public.notification_outbox_events l
join public.activity_events e on e.id = l.activity_event_id
where e.item_id = (select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000040');
grant select on doomed_share to public;
select is(pg_temp.links((select id from doomed_share)), 1::bigint, 'the doomed idea''s share is linked');
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.delete_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000040'));
select pg_temp.as_owner();
select is(pg_temp.links((select id from doomed_share)), 0::bigint, 'deleting the idea removes its candidate');
select pg_temp.make_due((select id from doomed_share));
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10) where id = (select id from doomed_share)), 0::bigint, 'an empty delivery is never returned');
select pg_temp.as_owner();
select ok((select suppressed_at is not null and sent_at is null from public.notification_outbox where id = (select id from doomed_share)), 'an empty delivery is suppressed instead of sent');

-- ---------- Concurrency: enqueue vs claim, and concurrent enqueues ----------
select is(
  extensions.dblink_connect('batch_claimer', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())),
  'OK', 'the claimer opens an independent session'
);
select is(
  extensions.dblink_connect('batch_writer', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())),
  'OK', 'the writer opens an independent session'
);
select is(
  extensions.dblink_connect('batch_writer_two', format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())),
  'OK', 'a second writer opens an independent session'
);
select extensions.dblink_exec(conn, $$set lock_timeout = '5s'$$) from unnest(array['batch_claimer', 'batch_writer', 'batch_writer_two']) as conns(conn);
create temporary table pids as
select conn, (select pid from extensions.dblink(conn, 'select pg_backend_pid()') as p(pid integer)) as pid
from unnest(array['batch_claimer', 'batch_writer', 'batch_writer_two']) as conns(conn);

-- (1) Claim seals digest B first; a concurrent event must wait, then open digest C.
select pg_temp.make_due((select id from digest_b));
select is(extensions.dblink_exec('batch_claimer', 'begin'), 'BEGIN', 'the claimer begins');
select is(extensions.dblink_exec('batch_claimer', 'set local role service_role'), 'SET', 'the claimer assumes service_role');
select is(
  (select count(*) from extensions.dblink('batch_claimer', 'select id from public.claim_notifications(10)') as claimed(id uuid) where id = (select id from digest_b)),
  1::bigint,
  'the claimer seals digest B and holds it'
);
select is(extensions.dblink_exec('batch_writer', 'begin'), 'BEGIN', 'the writer begins');
select is(extensions.dblink_exec('batch_writer', 'set local role authenticated'), 'SET', 'the writer assumes authenticated');
select is(extensions.dblink_exec('batch_writer', $$set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001'$$), 'SET', 'the writer acts as A');
select is(
  extensions.dblink_send_query('batch_writer', format($q$select (public.add_comment('b1000000-0000-4000-8000-000000000035', %L, 'Synthetic concurrent reply')).id$q$, (select item_one from fx))),
  1, 'the writer sends a reply while B is claimed'
);
select ok(pg_temp.waits_on_lock('batch_writer'), 'the reply waits for the claimed digest');
select is(extensions.dblink_exec('batch_claimer', 'commit'), 'COMMIT', 'the claimer commits the sealed claim');
select ok((select count(*) from extensions.dblink_get_result('batch_writer') as result(id uuid)) = 1, 'the reply completes after the claim');
select is((select count(*) from extensions.dblink_get_result('batch_writer') as result(id uuid)), 0::bigint, 'the writer drains its result stream');
select is(extensions.dblink_exec('batch_writer', 'commit'), 'COMMIT', 'the writer commits');
select is(pg_temp.links((select id from digest_b)), 2::bigint, 'the claimed digest did not gain the concurrent event');
create temporary table digest_c as select pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') as id;
grant select on digest_c to public;
select ok((select id from digest_c) is not null and (select id from digest_c) <> (select id from digest_b), 'the concurrent event opened digest C');
select is(pg_temp.links((select id from digest_c)), 1::bigint, 'digest C holds exactly the concurrent event');

-- (2) An event joins digest C first and holds it; a concurrent claim skips it without waiting.
select pg_temp.make_due((select id from digest_c));
select is(extensions.dblink_exec('batch_writer', 'begin'), 'BEGIN', 'the writer begins again');
select is(extensions.dblink_exec('batch_writer', 'set local role authenticated'), 'SET', 'the writer reassumes authenticated');
select is(extensions.dblink_exec('batch_writer', $$set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001'$$), 'SET', 'the writer acts as A again');
select ok(
  (select count(*) from extensions.dblink('batch_writer', format($q$select (public.add_comment('b1000000-0000-4000-8000-000000000036', %L, 'Synthetic held reply')).id$q$, (select item_one from fx))) as r(id uuid)) = 1,
  'the writer links a reply into digest C and holds the transaction'
);
select is(extensions.dblink_exec('batch_claimer', 'begin'), 'BEGIN', 'the claimer begins again');
select is(extensions.dblink_exec('batch_claimer', 'set local role service_role'), 'SET', 'the claimer reassumes service_role');
select is(
  (select count(*) from extensions.dblink('batch_claimer', 'select id from public.claim_notifications(10)') as claimed(id uuid) where id = (select id from digest_c)),
  0::bigint,
  'a claim skips the digest an enqueue is holding, without waiting'
);
select is(extensions.dblink_exec('batch_claimer', 'commit'), 'COMMIT', 'the claimer ends without sealing C');
select is(extensions.dblink_exec('batch_writer', 'commit'), 'COMMIT', 'the writer commits the reply into C');
select is(pg_temp.links((select id from digest_c)), 2::bigint, 'the held event joined digest C before any seal');
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10) where id = (select id from digest_c)), 1::bigint, 'digest C is claimed afterwards with both events');
select public.mark_notification_sent((select id from digest_c));
select pg_temp.as_owner();

-- (3) Two concurrent events for the same recipient: one open digest, unique links, no deadlock.
select is(extensions.dblink_exec('batch_writer', 'begin'), 'BEGIN', 'writer one begins');
select is(extensions.dblink_exec('batch_writer_two', 'begin'), 'BEGIN', 'writer two begins');
select extensions.dblink_exec(conn, 'set local role authenticated') from unnest(array['batch_writer', 'batch_writer_two']) as conns(conn);
select extensions.dblink_exec(conn, $$set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001'$$) from unnest(array['batch_writer', 'batch_writer_two']) as conns(conn);
select ok(
  (select count(*) from extensions.dblink('batch_writer', format($q$select (public.add_comment('b1000000-0000-4000-8000-000000000037', %L, 'Synthetic writer one')).id$q$, (select item_one from fx))) as r(id uuid)) = 1,
  'writer one enqueues first'
);
select is(
  extensions.dblink_send_query('batch_writer_two', format($q$select (public.add_comment('b1000000-0000-4000-8000-000000000038', %L, 'Synthetic writer two')).id$q$, (select item_one from fx))),
  1, 'writer two enqueues concurrently'
);
select ok(pg_temp.waits_on_lock('batch_writer_two'), 'writer two waits on the couple lock');
select is(extensions.dblink_exec('batch_writer', 'commit'), 'COMMIT', 'writer one commits');
select ok((select count(*) from extensions.dblink_get_result('batch_writer_two') as result(id uuid)) = 1, 'writer two completes');
select is((select count(*) from extensions.dblink_get_result('batch_writer_two') as result(id uuid)), 0::bigint, 'writer two drains its result stream');
select is(extensions.dblink_exec('batch_writer_two', 'commit'), 'COMMIT', 'writer two commits');
select is(
  (select count(*) from public.notification_outbox where recipient_member_id = 'b1000000-0000-4000-8000-000000000012' and kind::text = 'activity_digest' and sealed_at is null),
  1::bigint,
  'concurrent events share one open digest'
);
select is(pg_temp.links(pg_temp.open_digest('b1000000-0000-4000-8000-000000000012')), 2::bigint, 'and each concurrent event is linked once');

-- An idea that (4) replies on and (5) deletes, so neither leaves a candidate behind.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.create_item('b1000000-0000-4000-8000-000000000060', 'Synthetic Batch Doomed Two', 'Synthetic doomed description.', 'b1000000-0000-4000-8000-000000000013', null, null);
select public.submit_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000060'));
select pg_temp.as_owner();
create temporary table doomed_two as
select i.id as item_id, l.outbox_id
from public.items i
join public.activity_events e on e.item_id = i.id
join public.notification_outbox_events l on l.activity_event_id = e.id
where i.request_id = 'b1000000-0000-4000-8000-000000000060' and e.event_type::text = 'item_created';
grant select on doomed_two to public;

-- (4) Review fix: every insert's foreign-key check holds a key-share lock on the couple and members.
-- An enqueue must not need a lock that conflicts with it, or two near-simultaneous actions deadlock.
select is(extensions.dblink_exec('batch_claimer', 'begin'), 'BEGIN', 'a key-share holder begins');
select is(
  (select count(*) from extensions.dblink('batch_claimer', $q$select 1 from public.couples where id = 'b1000000-0000-4000-8000-000000000010' for key share$q$) as r(x integer)),
  1::bigint, 'it holds a key-share lock on the couple, as any foreign-key check does'
);
select is(
  (select count(*) from extensions.dblink('batch_claimer', $q$select 1 from public.members where couple_id = 'b1000000-0000-4000-8000-000000000010' for key share$q$) as r(x integer)),
  2::bigint, 'and on both members'
);
select is(extensions.dblink_exec('batch_writer', 'begin'), 'BEGIN', 'a writer begins beside it');
select is(extensions.dblink_exec('batch_writer', $$set local lock_timeout = '2s'$$), 'SET', 'with a short lock timeout');
select is(extensions.dblink_exec('batch_writer', 'set local role authenticated'), 'SET', 'the writer assumes authenticated');
select is(extensions.dblink_exec('batch_writer', $$set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001'$$), 'SET', 'the writer acts as A');
select lives_ok(
  format(
    'select * from extensions.dblink(%L, %L) as r(id uuid)',
    'batch_writer',
    format($q$select (public.add_comment('b1000000-0000-4000-8000-000000000039', %L, 'Synthetic reply beside a key-share holder')).id$q$, (select item_id from doomed_two))
  ),
  'an enqueue does not wait on foreign-key share locks'
);
select extensions.dblink_exec('batch_writer', 'commit');
select is(extensions.dblink_exec('batch_claimer', 'commit'), 'COMMIT', 'the key-share holder ends');

-- (5) Review fix: deleting an idea locks its deliveries before its candidates, so it waits for a
-- claim in progress instead of deadlocking with the claim's candidate updates.
select is(extensions.dblink_exec('batch_claimer', 'begin'), 'BEGIN', 'a claimer begins');
select is(
  (select count(*) from extensions.dblink('batch_claimer', format('select id from public.notification_outbox where id = %L for update', (select outbox_id from doomed_two))) as r(id uuid)),
  1::bigint, 'it holds the doomed share''s delivery, as a claim does'
);
select is(extensions.dblink_exec('batch_writer', 'begin'), 'BEGIN', 'the author begins a delete');
select is(extensions.dblink_exec('batch_writer', 'set local role authenticated'), 'SET', 'the author assumes authenticated');
select is(extensions.dblink_exec('batch_writer', $$set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001'$$), 'SET', 'the author acts as A');
select is(extensions.dblink_send_query('batch_writer', format('select public.delete_item(%L)::text', (select item_id from doomed_two))), 1, 'the author deletes the idea');
select ok(pg_temp.waits_on_lock('batch_writer'), 'the delete waits for the claimed delivery');
select is(pg_temp.links((select outbox_id from doomed_two)), 1::bigint, 'and has not touched its candidate yet');
select is(extensions.dblink_exec('batch_claimer', 'commit'), 'COMMIT', 'the claim ends');
select is((select count(*) from extensions.dblink_get_result('batch_writer') as r(x text)), 1::bigint, 'the delete then completes');
select is((select count(*) from extensions.dblink_get_result('batch_writer') as r(x text)), 0::bigint, 'the author drains the result stream');
select is(extensions.dblink_exec('batch_writer', 'commit'), 'COMMIT', 'the delete commits');
select is(pg_temp.links((select outbox_id from doomed_two)), 0::bigint, 'the deleted idea''s candidate is gone');

select extensions.dblink_disconnect(conn) from unnest(array['batch_claimer', 'batch_writer', 'batch_writer_two']) as conns(conn);

-- ---------- 7D.3: claim-time revalidation against exact acknowledgements ----------
-- A second idea, so a digest can span two ideas.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.create_item('b1000000-0000-4000-8000-000000000050', 'Synthetic Batch Two', 'Synthetic second description.', 'b1000000-0000-4000-8000-000000000013', null, null);
select public.submit_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000050'));
select public.update_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000050'), 'Synthetic Batch Two Edited', 'Synthetic second description.', 'b1000000-0000-4000-8000-000000000013');
select pg_temp.as_owner();
create temporary table seen_fx as
select
  (select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000050') as item_two,
  (
    select l.outbox_id
    from public.notification_outbox_events l
    join public.activity_events e on e.id = l.activity_event_id
    where e.item_id = (select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000050')
      and e.event_type::text = 'item_created'
  ) as share_two,
  (
    select e.id
    from public.activity_events e
    where e.item_id = (select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000050')
      and e.event_type::text = 'item_created'
  ) as share_two_event,
  pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') as partial_digest,
  pg_temp.open_digest('b1000000-0000-4000-8000-000000000011') as seen_digest,
  (
    select array_agg(l.activity_event_id)
    from public.notification_outbox_events l
    join public.activity_events e on e.id = l.activity_event_id
    where l.outbox_id = pg_temp.open_digest('b1000000-0000-4000-8000-000000000012')
      and e.item_id = (select item_one from fx)
  ) as partial_seen_events,
  (
    select array_agg(l.activity_event_id)
    from public.notification_outbox_events l
    where l.outbox_id = pg_temp.open_digest('b1000000-0000-4000-8000-000000000011')
  ) as author_digest_events;
grant select on seen_fx to public;

select is(pg_temp.links((select partial_digest from seen_fx)), 3::bigint, 'the partner''s digest spans two ideas (two replies on one, an edit on the other)');
select is(cardinality((select partial_seen_events from seen_fx)), 2, 'two of its events belong to the first idea');
select is(cardinality((select author_digest_events from seen_fx)), 3, 'the author''s digest has three events');

-- B opens idea one (seeing its share and both replies); A opens their digest's idea.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.mark_item_seen_through_events((select item_one from fx), array[(select event_id from share_row)]);
select public.mark_item_seen_through_events((select item_one from fx), (select partial_seen_events from seen_fx));
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.mark_item_seen_through_events((select item_one from fx), (select author_digest_events from seen_fx));
-- The author viewing their own share is not the recipient seeing it.
select public.mark_item_seen_through_events((select item_two from seen_fx), array[(select share_two_event from seen_fx)]);
select pg_temp.as_owner();

select pg_temp.make_due((select id from share_row));
select pg_temp.make_due((select share_two from seen_fx));
select pg_temp.make_due((select partial_digest from seen_fx));
select pg_temp.make_due((select seen_digest from seen_fx));
select pg_temp.act_as_service();
create temporary table seen_claim as select * from public.claim_notifications(50);
select pg_temp.as_owner();

select is((select count(*) from seen_claim where id = (select id from share_row)), 0::bigint, 'a share seen during its grace period is not sent');
select ok(
  (select suppressed_at is not null and sealed_at is not null and sent_at is null and claimed_at is null from public.notification_outbox where id = (select id from share_row)),
  'it is suppressed, not claimed'
);
select ok(
  (select bool_and(suppressed_at is not null) from public.notification_outbox_events where outbox_id = (select id from share_row)),
  'its seen candidate is timestamped as suppressed'
);
select is((select count(*) from seen_claim where id = (select share_two from seen_fx)), 1::bigint, 'an unseen due share is sent, even after its author viewed it');
select is((select kind::text from seen_claim where id = (select share_two from seen_fx)), 'idea_shared', 'with its generic kind only');

select is((select count(*) from seen_claim where id = (select seen_digest from seen_fx)), 0::bigint, 'an entirely seen digest is not sent');
select ok((select suppressed_at is not null from public.notification_outbox where id = (select seen_digest from seen_fx)), 'it is suppressed');
select is(
  (select count(*) from public.notification_outbox_events where outbox_id = (select seen_digest from seen_fx) and suppressed_at is null),
  0::bigint,
  'every candidate in it is timestamped'
);

select is((select count(*) from seen_claim where id = (select partial_digest from seen_fx)), 1::bigint, 'a partially seen digest is still sent once');
select is(
  (select count(*) from public.notification_outbox_events where outbox_id = (select partial_digest from seen_fx) and suppressed_at is not null),
  2::bigint,
  'its seen candidates are timestamped'
);
select is(
  (
    select array_agg(e.item_id)
    from public.notification_outbox_events l
    join public.activity_events e on e.id = l.activity_event_id
    where l.outbox_id = (select partial_digest from seen_fx) and l.suppressed_at is null
  ),
  array[(select item_two from seen_fx)],
  'the unseen remainder is the other idea''s edit'
);
select ok((select sealed_at is not null and suppressed_at is null from public.notification_outbox where id = (select partial_digest from seen_fx)), 'the partial digest is sealed and live');

-- Retry rechecks: seeing the remainder before a retry suppresses the whole delivery.
select pg_temp.act_as_service();
select public.mark_notification_failed((select partial_digest from seen_fx), 'smtp_unavailable');
select pg_temp.as_owner();
create temporary table remainder as
select array_agg(l.activity_event_id) as events
from public.notification_outbox_events l
where l.outbox_id = (select partial_digest from seen_fx) and l.suppressed_at is null;
grant select on remainder to public;
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.mark_item_seen_through_events((select item_two from seen_fx), (select events from remainder));
select pg_temp.as_owner();
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(50) where id = (select partial_digest from seen_fx)), 0::bigint, 'a retry whose remainder was seen sends nothing');
select pg_temp.as_owner();
select ok((select suppressed_at is not null and sent_at is null from public.notification_outbox where id = (select partial_digest from seen_fx)), 'and the delivery is suppressed');

-- A new event after the claim still opens the next digest window.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000001');
select public.add_comment('b1000000-0000-4000-8000-000000000051', (select item_two from seen_fx), 'Synthetic reply after revalidation');
select pg_temp.as_owner();
select ok(
  pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') is not null
  and pg_temp.open_digest('b1000000-0000-4000-8000-000000000012') <> (select partial_digest from seen_fx),
  'an event after a claimed digest opens the next one'
);
select is(pg_temp.links((select partial_digest from seen_fx)), 3::bigint, 'the claimed digest never gains it');

-- ---------- Review fixes: delivery bookkeeping ----------
-- A worker that finishes after its delivery was suppressed (a stale reclaim found it seen) records nothing.
select pg_temp.make_due((select outbox_id from doomed_two));
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(50) where id = (select outbox_id from doomed_two)), 0::bigint, 'the emptied delivery is suppressed at claim');
select lives_ok(format('select public.mark_notification_sent(%L)', (select outbox_id from doomed_two)), 'a late "sent" for a suppressed delivery does not fail');
select lives_ok(format($q$select public.mark_notification_failed(%L, 'smtp_unavailable')$q$, (select outbox_id from doomed_two)), 'nor does a late "failed"');
select pg_temp.as_owner();
select ok(
  (select sent_at is null and suppressed_at is not null and last_error_code is null from public.notification_outbox where id = (select outbox_id from doomed_two)),
  'a suppressed delivery stays suppressed and unannotated'
);

-- A recipient with no address is recorded, not retried until it silently dies.
select pg_temp.act_as('b1000000-0000-4000-8000-000000000002');
select public.create_item('b1000000-0000-4000-8000-000000000061', 'Synthetic Batch No Address', 'Synthetic no-address description.', 'b1000000-0000-4000-8000-000000000013', null, null);
select public.submit_item((select id from public.items where request_id = 'b1000000-0000-4000-8000-000000000061'));
select pg_temp.as_owner();
create temporary table no_address as
select l.outbox_id as id
from public.items i
join public.activity_events e on e.item_id = i.id
join public.notification_outbox_events l on l.activity_event_id = e.id
where i.request_id = 'b1000000-0000-4000-8000-000000000061';
grant select on no_address to public;
update auth.users set email = null where id = 'b1000000-0000-4000-8000-000000000001';
select pg_temp.make_due((select id from no_address));
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(50) where id = (select id from no_address)), 0::bigint, 'a delivery to a recipient with no address is not returned');
select pg_temp.as_owner();
select ok(
  (select suppressed_at is not null and sent_at is null and attempts = 0 and last_error_code = 'no_recipient_email' from public.notification_outbox where id = (select id from no_address)),
  'it is suppressed with a code instead of burning attempts'
);
update auth.users set email = 'synthetic-batch-a@ours.invalid' where id = 'b1000000-0000-4000-8000-000000000001';

-- Index and boundary pins.
select ok(
  pg_get_indexdef('public.notification_outbox_one_open_digest'::regclass) ~ 'UNIQUE INDEX .* \(recipient_member_id\) WHERE .*activity_digest.*sealed_at IS NULL',
  'one unsealed digest per recipient is enforced by a partial unique index'
);
select ok(
  pg_get_indexdef('public.notification_outbox_due_idx'::regclass) ~ 'attempts < 5',
  'the due index leaves out deliveries that ran out of attempts'
);
insert into public.activity_events (id, couple_id, actor_member_id, event_type)
values ('b1000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000a0', 'response_changed');
select throws_ok(
  format(
    'insert into public.notification_outbox_events (outbox_id, couple_id, activity_event_id) values (%L, %L, %L)',
    (select id from no_address),
    'b1000000-0000-4000-8000-000000000010',
    'b1000000-0000-4000-8000-0000000000e0'
  ),
  '23503', null,
  'a delivery cannot link an event from another couple'
);
delete from public.activity_events where id = 'b1000000-0000-4000-8000-0000000000e0';

-- ---------- Cleanup ----------
begin;
delete from public.notification_outbox where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.activity_event_acknowledgements where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.activity_events where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.comments where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.item_views where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.item_responses where couple_id = 'b1000000-0000-4000-8000-000000000010';
alter table public.item_revisions disable trigger item_revisions_reject_mutation;
delete from public.item_revisions where couple_id = 'b1000000-0000-4000-8000-000000000010';
alter table public.item_revisions enable trigger item_revisions_reject_mutation;
delete from public.items where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.categories where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.members where couple_id = 'b1000000-0000-4000-8000-000000000010';
delete from public.couples where id = 'b1000000-0000-4000-8000-000000000010';
delete from auth.users where id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
commit;

select is((select count(*) from public.notification_outbox where couple_id = 'b1000000-0000-4000-8000-000000000010'), 0::bigint, 'cleanup leaves no synthetic deliveries');

select * from finish();
