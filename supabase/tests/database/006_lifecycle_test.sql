-- Interaction model v2: drafts, submit, co-editing, decline with reason, seen state, delete.
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('70000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('70000000-0000-4000-8000-000000000002', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('70000000-0000-4000-8000-000000000010', 'Synthetic Lifecycle Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000001', 'Synthetic Author', 0),
  ('70000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000002', 'Synthetic Partner', 1);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('70000000-0000-4000-8000-000000000013', '70000000-0000-4000-8000-000000000010', 'Synthetic Lifecycle Category', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000014'),
  ('70000000-0000-4000-8000-000000000015', '70000000-0000-4000-8000-000000000010', 'Synthetic Second Category', '70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000016');

-- Helpers to act as a member (inside the test transaction only).
create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.act_as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

-- ---------- Drafts are private ----------
select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
create temporary table draft as
select (public.create_item('70000000-0000-4000-8000-000000000020', 'Synthetic Draft', 'Synthetic draft description.', '70000000-0000-4000-8000-000000000013', null, null)).*;
grant select on draft to authenticated;

select is((select status::text from draft), 'draft', 'create_item creates a draft');
select ok((select submitted_at is null from draft), 'a draft has no submitted_at');
select is((select count(*) from public.items where id = (select id from draft)), 1::bigint, 'the author sees their draft');
select is((select count(*) from public.activity_events where item_id = (select id from draft)), 0::bigint, 'creating a draft records no activity');

select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select is((select count(*) from public.items where id = (select id from draft)), 0::bigint, 'the partner cannot see the draft');
select is((select count(*) from public.item_responses where item_id = (select id from draft)), 0::bigint, 'the partner cannot see draft responses');
select is((select count(*) from public.item_revisions where item_id = (select id from draft)), 0::bigint, 'the partner cannot see draft revisions');
select throws_ok(format($$select public.submit_item(%L)$$, (select id from draft)), 'P0001', 'item author required', 'the partner cannot submit the author''s draft');
select throws_ok(format($$select public.update_item(%L, 'Synthetic Tamper', 'Synthetic tamper.', %L)$$, (select id from draft), '70000000-0000-4000-8000-000000000013'), 'P0001', 'item in current couple required', 'the partner cannot edit a draft');
select throws_ok(format($$select public.add_comment('70000000-0000-4000-8000-000000000021', %L, 'Synthetic peek')$$, (select id from draft)), 'P0001', 'submitted item required', 'nobody can comment on a draft');
select throws_ok(format($$select public.set_roulette_decision(%L, 'ready')$$, (select id from draft)), 'P0001', 'submitted item required', 'the partner cannot decide on a draft');
select throws_ok(format($$select public.set_item_interest(%L, 'curious')$$, (select id from draft)), 'P0001', 'submitted item required', 'the partner cannot rate the author''s draft');
select throws_ok(format($$select public.mark_item_seen(%L)$$, (select id from draft)), 'P0001', 'visible item required', 'the partner cannot mark a draft seen');
select throws_ok(
  format($$select public.create_item('70000000-0000-4000-8000-000000000022', 'Synthetic Remix Peek', 'Synthetic remix peek.', '70000000-0000-4000-8000-000000000013', %L, null)$$, (select id from draft)),
  'P0001', 'source item in current couple required',
  'the partner cannot remix an unseen draft'
);

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
-- The author can say how into it they are before sharing (Peter, 2026-10-30); other answers wait.
select is(
  (public.set_item_interest((select id from draft), 'very_into_it')).interest::text,
  'very_into_it',
  'the author can rate their own draft'
);
select throws_ok(format($$select public.set_item_favorite(%L, true)$$, (select id from draft)), 'P0001', 'submitted item required', 'favorites still wait for sharing');
select is(
  (public.update_item((select id from draft), 'Synthetic Draft Revised', 'Synthetic draft description.', '70000000-0000-4000-8000-000000000013')).title,
  'Synthetic Draft Revised',
  'the author can edit their draft'
);
select is((select count(*) from public.activity_events where item_id = (select id from draft)), 0::bigint, 'editing a draft records no activity');

-- ---------- Submit ----------
select is((public.submit_item((select id from draft))).status::text, 'submitted', 'the author submits the draft');
select ok((select submitted_at is not null from public.items where id = (select id from draft)), 'submit stamps submitted_at');
select is(
  (select roulette_decision::text from public.item_responses where item_id = (select id from draft) and member_id = '70000000-0000-4000-8000-000000000011'),
  'ready', 'submitting is the author''s Ready'
);
select is(
  (select roulette_decision::text from public.item_responses where item_id = (select id from draft) and member_id = '70000000-0000-4000-8000-000000000012'),
  'pending', 'the partner starts pending'
);
select is(
  (select array_agg(event_type::text order by created_at) from public.activity_events where item_id = (select id from draft)),
  array['item_created'], 'submit records exactly one item_created event'
);
select public.submit_item((select id from draft));
select is((select count(*) from public.activity_events where item_id = (select id from draft)), 1::bigint, 'submitting again is a no-op');

select pg_temp.act_as_owner();
select throws_ok(
  format($$update public.items set status = 'draft', submitted_at = null where id = %L$$, (select id from draft)),
  'P0001', 'submitted items cannot return to draft',
  'a submitted item cannot be withdrawn to draft'
);

-- ---------- Seen state ----------
select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select is((select count(*) from public.items where id = (select id from draft)), 1::bigint, 'the partner sees the submitted item');
select ok((public.mark_item_seen((select id from draft))).first_seen_at is not null, 'the partner marks it seen');
create temporary table first_view as select last_seen_at from public.item_views where item_id = (select id from draft);
grant select on first_view to authenticated;
select pg_sleep(0.01);
select public.mark_item_seen((select id from draft));
select ok(
  (select last_seen_at > (select last_seen_at from first_view) from public.item_views where item_id = (select id from draft)),
  'marking seen again advances last_seen_at'
);
select is((select count(*) from public.item_views where item_id = (select id from draft)), 1::bigint, 'one view row per member and item');
select throws_ok(
  format($$insert into public.item_views (couple_id, item_id, member_id, first_seen_at, last_seen_at) values ('70000000-0000-4000-8000-000000000010', %L, '70000000-0000-4000-8000-000000000011', now(), now())$$, (select id from draft)),
  '42501', null, 'views cannot be written directly'
);
select is((select count(*) from public.activity_events where item_id = (select id from draft)), 1::bigint, 'viewing records no activity');

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
select is((select count(*) from public.item_views where item_id = (select id from draft)), 0::bigint, 'a member cannot see the other''s view rows');

-- ---------- Co-editing ----------
select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select public.set_roulette_decision((select id from draft), 'ready');
select is(
  (select count(*) from public.item_responses where item_id = (select id from draft) and roulette_decision = 'ready'),
  2::bigint, 'both ready: ready for plan'
);
create temporary table events_before_coedit as select id from public.activity_events where item_id = (select id from draft);
grant select on events_before_coedit to authenticated;
select is(
  (public.update_item((select id from draft), 'Synthetic Partner Rewrite', 'Synthetic partner rewrite description.', '70000000-0000-4000-8000-000000000013')).title,
  'Synthetic Partner Rewrite', 'the partner can edit a submitted item'
);
select is(
  (select editor_member_id from public.item_revisions where item_id = (select id from draft) order by revision_number desc limit 1),
  '70000000-0000-4000-8000-000000000012'::uuid, 'the revision records the partner as editor'
);
select is(
  (select roulette_decision::text from public.item_responses where item_id = (select id from draft) and member_id = '70000000-0000-4000-8000-000000000011'),
  'pending', 'a description edit returns the other partner to review'
);
select is(
  (select roulette_decision::text from public.item_responses where item_id = (select id from draft) and member_id = '70000000-0000-4000-8000-000000000012'),
  'ready', 'the editor keeps their own decision'
);
select is(
  (select array_agg(event_type::text) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_coedit)),
  array['item_edited'], 'a co-edit records one item_edited event and no decision event'
);
select is(
  (select actor_member_id from public.activity_events where item_id = (select id from draft) and event_type = 'item_edited'),
  '70000000-0000-4000-8000-000000000012'::uuid, 'the edit event is attributed to the editor'
);
select public.update_item((select id from draft), 'Synthetic Partner Rewrite', 'Synthetic partner rewrite description.', '70000000-0000-4000-8000-000000000013');
select is((select count(*) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_coedit)), 1::bigint, 'a no-op co-edit changes nothing');

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
select public.set_roulette_decision((select id from draft), 'ready');
select public.update_item((select id from draft), 'Synthetic Partner Rewrite', 'Synthetic partner rewrite description.', '70000000-0000-4000-8000-000000000015');
select is(
  (select roulette_decision::text from public.item_responses where item_id = (select id from draft) and member_id = '70000000-0000-4000-8000-000000000012'),
  'ready', 'a category-only change keeps the other partner''s answer (QA 2026-11-03)'
);
select throws_ok(
  format($$select public.update_item(%L, 'Synthetic Stale', 'Synthetic stale.', '70000000-0000-4000-8000-000000000013', '2000-01-01 00:00:00+00')$$, (select id from draft)),
  'OU409', 'item changed since it was opened',
  'a save from a stale version is rejected'
);
select is(
  (public.update_item(
    (select id from draft), 'Synthetic Fresh Save', 'Synthetic partner rewrite description.', '70000000-0000-4000-8000-000000000015',
    (select updated_at from public.items where id = (select id from draft))
  )).title,
  'Synthetic Fresh Save', 'a save from the current version succeeds'
);

-- ---------- Decline with a reason ----------
select pg_temp.act_as('70000000-0000-4000-8000-000000000002');
select throws_ok(format($$select public.set_roulette_decision(%L, 'not_now')$$, (select id from draft)), 'P0001', 'not now requires a reason', 'Not now must go through decline_item');
create temporary table events_before_decline as select id from public.activity_events where item_id = (select id from draft);
grant select on events_before_decline to authenticated;
select is(
  (public.decline_item('70000000-0000-4000-8000-000000000030', (select id from draft), 'Synthetic reason.')).roulette_decision::text,
  'not_now', 'decline sets Not now'
);
select is(
  (select kind::text || ':' || body from public.comments where item_id = (select id from draft) and author_member_id = '70000000-0000-4000-8000-000000000012'),
  'not_now_reason:Synthetic reason.', 'the reason is posted as a reason-flagged message'
);
select is(
  (select array_agg(event_type::text) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_decline)),
  array['item_declined'], 'decline records exactly one item_declined event'
);
select public.decline_item('70000000-0000-4000-8000-000000000030', (select id from draft), 'Synthetic reason.');
select is((select count(*) from public.comments where item_id = (select id from draft)), 1::bigint, 'retrying a decline creates no duplicate reason');
select is((select count(*) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_decline)), 1::bigint, 'retrying a decline creates no duplicate event');
select is((select kind::text from public.comments where item_id = (select id from draft)), 'not_now_reason', 'reason kind persists');
select is((public.set_roulette_decision((select id from draft), 'pending')).roulette_decision::text, 'pending', 'the decliner can move it back to review');
select is((public.set_roulette_decision((select id from draft), 'ready')).roulette_decision::text, 'ready', 'the decliner can move it to Ready');

-- Later with no note (Peter, 2026-10-30): the note is optional; nothing is posted without one.
create temporary table events_before_later as select id from public.activity_events where item_id = (select id from draft);
grant select on events_before_later to authenticated;
select is(
  (public.decline_item('70000000-0000-4000-8000-000000000039', (select id from draft), '   ')).roulette_decision::text,
  'not_now', 'Later works with no note'
);
select is((select count(*) from public.comments where item_id = (select id from draft)), 1::bigint, 'and posts nothing to the chat');
select is(
  (select array_agg(event_type::text || ':' || (comment_id is null)::text) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_later)),
  array['item_declined:true'], 'it records one item_declined event, with no message'
);
select public.decline_item('70000000-0000-4000-8000-000000000039', (select id from draft), null);
select is((select count(*) from public.activity_events where item_id = (select id from draft) and id not in (select id from events_before_later)), 1::bigint, 'retrying Later with no note adds nothing');
select is((public.set_roulette_decision((select id from draft), 'ready')).roulette_decision::text, 'ready', 'and I''m in brings it back');
select is(
  (public.add_comment('70000000-0000-4000-8000-000000000031', (select id from draft), 'Synthetic chat')).kind::text,
  'message', 'ordinary comments are messages'
);

-- ---------- Delete ----------
select throws_ok(format($$select public.delete_item(%L)$$, (select id from draft)), 'P0001', 'item author required', 'the partner cannot delete');

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
create temporary table doomed as
select (public.create_item('70000000-0000-4000-8000-000000000040', 'Synthetic Doomed', 'Synthetic doomed.', '70000000-0000-4000-8000-000000000013', null, null)).id;
grant select on doomed to authenticated;
select public.submit_item((select id from doomed));
select public.add_comment('70000000-0000-4000-8000-000000000041', (select id from doomed), 'Synthetic note');
select public.mark_item_seen((select id from doomed));
select public.update_item((select id from doomed), 'Synthetic Doomed Two', 'Synthetic doomed.', '70000000-0000-4000-8000-000000000013');
select ok(public.delete_item((select id from doomed)), 'the author deletes a submitted item');
select is((select count(*) from public.items where id = (select id from doomed)), 0::bigint, 'the item is gone');
select pg_temp.act_as_owner();
select is((select count(*) from public.item_responses where item_id = (select id from doomed)), 0::bigint, 'its responses are gone');
select is((select count(*) from public.item_revisions where item_id = (select id from doomed)), 0::bigint, 'its revisions are gone');
select is((select count(*) from public.comments where item_id = (select id from doomed)), 0::bigint, 'its comments are gone');
select is((select count(*) from public.item_views where item_id = (select id from doomed)), 0::bigint, 'its view rows are gone');
select is((select count(*) from public.activity_events where item_id = (select id from doomed)), 0::bigint, 'its activity is gone');
select throws_ok(
  $$update public.item_revisions set title = 'Synthetic tamper' where item_id = (select id from draft)$$,
  'P0001', 'item revisions are immutable',
  'revisions stay immutable outside delete_item'
);

select pg_temp.act_as('70000000-0000-4000-8000-000000000001');
create temporary table referenced as
select (public.create_item('70000000-0000-4000-8000-000000000050', 'Synthetic Referenced', 'Synthetic referenced.', '70000000-0000-4000-8000-000000000013', null, null)).id;
grant select on referenced to authenticated;
select public.submit_item((select id from referenced));
select public.create_item('70000000-0000-4000-8000-000000000051', 'Synthetic Child', 'Synthetic child.', '70000000-0000-4000-8000-000000000013', (select id from referenced), null);
select throws_ok(
  format($$select public.delete_item(%L)$$, (select id from referenced)),
  'OU423', 'item has memories, draws, or remixes; archive it instead',
  'delete refuses an item other records depend on'
);
create temporary table draft_to_delete as
select (public.create_item('70000000-0000-4000-8000-000000000060', 'Synthetic Throwaway', 'Synthetic throwaway.', '70000000-0000-4000-8000-000000000013', null, null)).id;
grant select on draft_to_delete to authenticated;
select ok(public.delete_item((select id from draft_to_delete)), 'the author can delete a draft');

-- ---------- Privileges ----------
select pg_temp.act_as_owner();
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.item_views'::regclass),
  'item_views has RLS enabled'
);
select ok(
  not has_function_privilege('anon', format('public.%s', fn), 'execute'),
  format('anon cannot execute %s', fn)
)
from unnest(array[
  'submit_item(uuid)', 'mark_item_seen(uuid)', 'decline_item(uuid,uuid,text)', 'delete_item(uuid)',
  'update_item(uuid,text,text,uuid,timestamptz)', 'can_read_item(uuid)'
]) as fn;
select ok(
  has_function_privilege('authenticated', format('public.%s', fn), 'execute'),
  format('authenticated can execute %s', fn)
)
from unnest(array[
  'submit_item(uuid)', 'mark_item_seen(uuid)', 'decline_item(uuid,uuid,text)', 'delete_item(uuid)',
  'update_item(uuid,text,text,uuid,timestamptz)'
]) as fn;
select ok(
  not has_table_privilege('authenticated', 'public.item_views', 'insert')
    and not has_table_privilege('authenticated', 'public.item_views', 'update')
    and not has_table_privilege('authenticated', 'public.item_views', 'delete'),
  'authenticated has no direct write on item_views'
);

select * from finish();
rollback;
