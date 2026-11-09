-- Task 7B (revised by 7D.2): one content-free email per shared idea, via a delivery row
-- whose event links (notification_outbox_events) name the share.
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('80000000-0000-4000-8000-000000000001', 'synthetic-author@ours.invalid', 'infinity', false, false),
  ('80000000-0000-4000-8000-000000000002', 'synthetic-partner@ours.invalid', 'infinity', false, false),
  ('80000000-0000-4000-8000-000000000003', 'synthetic-outsider@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values
  ('80000000-0000-4000-8000-000000000010', 'Synthetic Outbox Couple'),
  ('80000000-0000-4000-8000-000000000030', 'Synthetic Other Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000001', 'Synthetic Author', 0),
  ('80000000-0000-4000-8000-000000000012', '80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000002', 'Synthetic Partner', 1),
  ('80000000-0000-4000-8000-000000000031', '80000000-0000-4000-8000-000000000030', '80000000-0000-4000-8000-000000000003', 'Synthetic Outsider', 0);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('80000000-0000-4000-8000-000000000013', '80000000-0000-4000-8000-000000000010', 'Synthetic Outbox Category', '80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000014');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.act_as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role service_role';
end;
$$;
-- Share deliveries whose link names one of this item's events.
create function pg_temp.shares_for(p_item uuid) returns bigint language sql as $$
  select count(*)
  from public.notification_outbox o
  join public.notification_outbox_events l on l.outbox_id = o.id
  join public.activity_events e on e.id = l.activity_event_id
  where e.item_id = p_item and o.kind::text = 'idea_shared';
$$;
create function pg_temp.share_delivery(p_item uuid) returns uuid language sql as $$
  select o.id
  from public.notification_outbox o
  join public.notification_outbox_events l on l.outbox_id = o.id
  join public.activity_events e on e.id = l.activity_event_id
  where e.item_id = p_item and o.kind::text = 'idea_shared';
$$;

-- ---------- Shape: no free text, ever ----------
select columns_are(
  'public', 'notification_outbox',
  array['id', 'couple_id', 'recipient_member_id', 'kind', 'created_at', 'not_before', 'claimed_at', 'sealed_at', 'sent_at', 'suppressed_at', 'attempts', 'last_error_code'],
  'the outbox has only ids, a kind, timestamps and counters (no title, body or message column)'
);
select col_type_is('public', 'notification_outbox', 'last_error_code', 'text', 'errors are stored as a code');
select has_check('public', 'notification_outbox', 'the error code is constrained');
select enum_has_labels('public', 'notification_kind', array['idea_shared', 'activity_digest'], 'deliveries are a share or a digest');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass),
  'the outbox has row level security on'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'select')
  and not has_table_privilege('anon', 'public.notification_outbox', 'select'),
  'members and anonymous users have no table access to the outbox'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'execute')
  and not has_function_privilege('anon', 'public.claim_notifications(integer)', 'execute'),
  'members cannot claim notifications'
);
select ok(
  has_function_privilege('service_role', 'public.claim_notifications(integer)', 'execute')
  and has_function_privilege('service_role', 'public.mark_notification_sent(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.mark_notification_failed(uuid, text)', 'execute'),
  'only the delivery role runs the delivery functions'
);

-- ---------- Drafts never email; sharing emails the partner once ----------
select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
create temporary table shared as
select (public.create_item('80000000-0000-4000-8000-000000000020', 'Synthetic Shared', 'Synthetic shared description.', '80000000-0000-4000-8000-000000000013', null, null)).*;
grant select on shared to authenticated, service_role;
reset role;
select is((select count(*) from public.notification_outbox where couple_id = '80000000-0000-4000-8000-000000000010'), 0::bigint, 'a draft enqueues nothing');

select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
select public.submit_item((select id from shared));
reset role;
select is(
  pg_temp.shares_for((select id from shared)),
  1::bigint,
  'sharing enqueues exactly one notification'
);
select is(
  (select recipient_member_id from public.notification_outbox where id = pg_temp.share_delivery((select id from shared))),
  '80000000-0000-4000-8000-000000000012'::uuid,
  'it goes to the partner, not the author'
);
select is(
  (select count(*) from public.notification_outbox where couple_id = '80000000-0000-4000-8000-000000000010'),
  1::bigint,
  'and nothing else is queued'
);

select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
select public.submit_item((select id from shared));
select public.update_item((select id from shared), 'Synthetic Shared Edited', 'Synthetic shared description.', '80000000-0000-4000-8000-000000000013');
select pg_temp.act_as('80000000-0000-4000-8000-000000000002');
select public.add_comment('80000000-0000-4000-8000-000000000021', (select id from shared), 'Synthetic reply');
select public.update_item((select id from shared), 'Synthetic Shared Co-edited', 'Synthetic shared description.', '80000000-0000-4000-8000-000000000013');
reset role;
select is(
  pg_temp.shares_for((select id from shared)),
  1::bigint,
  're-sharing, editing, co-editing and replying never send a second share email'
);
select is(
  (select count(*) from public.notification_outbox where couple_id = '80000000-0000-4000-8000-000000000010' and kind::text = 'activity_digest'),
  2::bigint,
  'edits and replies go to each partner''s digest instead (7D.2)'
);

-- Members can't see the outbox even through RLS.
select pg_temp.act_as('80000000-0000-4000-8000-000000000002');
select throws_ok('select count(*) from public.notification_outbox', '42501', null, 'the recipient cannot read the outbox');
reset role;

-- ---------- Delivery ----------
-- Shares are due five minutes after the share; make this one due now. Digests stay an hour out.
update public.notification_outbox set not_before = now() - interval '1 minute' where id = pg_temp.share_delivery((select id from shared));
select pg_temp.act_as_service();
create temporary table claimed as select * from public.claim_notifications(10);
reset role;
select is((select count(*) from claimed), 1::bigint, 'the worker claims the pending notification');
select is((select recipient_email from claimed), 'synthetic-partner@ours.invalid', 'the claim carries the recipient''s address');
select is((select kind::text from claimed), 'idea_shared', 'and the kind');
select ok((select claimed_at is not null from public.notification_outbox where id = (select id from claimed)), 'claiming stamps claimed_at');
select is((select attempts from public.notification_outbox where id = (select id from claimed)), 1, 'claiming counts an attempt');

select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10)), 0::bigint, 'a fresh claim is not handed out twice');
select public.mark_notification_failed((select id from claimed), 'smtp_unavailable');
reset role;
select is(
  (select last_error_code from public.notification_outbox where id = (select id from claimed)),
  'smtp_unavailable',
  'a failure records a code'
);
select ok((select claimed_at is null and sent_at is null from public.notification_outbox where id = (select id from claimed)), 'a failure releases the claim for a retry');

select pg_temp.act_as_service();
select throws_ok(
  format($$select public.mark_notification_failed(%L, 'Free text with a title in it')$$, (select id from claimed)),
  '23514', null,
  'an error code cannot be free text'
);
select is((select count(*) from public.claim_notifications(10)), 1::bigint, 'a failed notification is claimed again');
select public.mark_notification_sent((select id from claimed));
select is((select count(*) from public.claim_notifications(10)), 0::bigint, 'a sent notification is never claimed again');
reset role;
select ok((select sent_at is not null from public.notification_outbox where id = (select id from claimed)), 'sending stamps sent_at');

-- A stale claim (worker died mid-send) is handed out again; five attempts is the limit.
update public.notification_outbox set sent_at = null, claimed_at = now() - interval '11 minutes' where id = (select id from claimed);
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10)), 1::bigint, 'a stale claim is re-claimed');
reset role;
update public.notification_outbox set claimed_at = null, attempts = 5 where id = (select id from claimed);
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10)), 0::bigint, 'after five attempts a notification is no longer retried');
reset role;

-- ---------- Deleting an idea removes its pending email ----------
select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
create temporary table doomed as
select (public.create_item('80000000-0000-4000-8000-000000000022', 'Synthetic Doomed', 'Synthetic doomed description.', '80000000-0000-4000-8000-000000000013', null, null)).*;
grant select on doomed to authenticated;
select public.submit_item((select id from doomed));
reset role;
select is(pg_temp.shares_for((select id from doomed)), 1::bigint, 'the second share enqueues its own email');
create temporary table doomed_delivery as select pg_temp.share_delivery((select id from doomed)) as id;
grant select on doomed_delivery to authenticated, service_role;
select pg_temp.act_as('80000000-0000-4000-8000-000000000001');
select public.delete_item((select id from doomed));
reset role;
select is(
  (select count(*) from public.notification_outbox_events where outbox_id = (select id from doomed_delivery)),
  0::bigint,
  'deleting the idea removes its notification candidate'
);
update public.notification_outbox set not_before = now() - interval '1 minute' where id = (select id from doomed_delivery);
select pg_temp.act_as_service();
select is((select count(*) from public.claim_notifications(10) where id = (select id from doomed_delivery)), 0::bigint, 'the emptied delivery is never sent');
reset role;
select ok((select suppressed_at is not null from public.notification_outbox where id = (select id from doomed_delivery)), 'it is suppressed instead');

select * from finish();
rollback;
