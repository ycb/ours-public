begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('50000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('50000000-0000-4000-8000-000000000002', 'infinity', false, false),
  ('50000000-0000-4000-8000-000000000003', 'infinity', false, false),
  ('50000000-0000-4000-8000-000000000004', 'infinity', false, false);

insert into public.couples (id, display_name)
values
  ('50000000-0000-4000-8000-000000000010', 'Synthetic Actor Couple A'),
  ('50000000-0000-4000-8000-000000000020', 'Synthetic Actor Couple B');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('50000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000001', 'Synthetic Actor A One', 0),
  ('50000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000002', 'Synthetic Actor A Two', 1),
  ('50000000-0000-4000-8000-000000000021', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000003', 'Synthetic Actor B One', 0),
  ('50000000-0000-4000-8000-000000000022', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000004', 'Synthetic Actor B Two', 1);

insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values
  ('50000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000010', 'Synthetic Actor Category A', '50000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000014'),
  ('50000000-0000-4000-8000-000000000023', '50000000-0000-4000-8000-000000000020', 'Synthetic Actor Category B', '50000000-0000-4000-8000-000000000021', '50000000-0000-4000-8000-000000000024');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
insert into public.items (id, couple_id, creator_member_id, category_id, request_id, title, description)
values ('50000000-0000-4000-8000-000000000015', '50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000016', 'Synthetic Partner Item', 'Synthetic partner description.');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000003', true);
insert into public.items (id, couple_id, creator_member_id, category_id, request_id, title, description)
values ('50000000-0000-4000-8000-000000000025', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000021', '50000000-0000-4000-8000-000000000023', '50000000-0000-4000-8000-000000000026', 'Synthetic Foreign Item', 'Synthetic foreign description.');
insert into public.roulette_draws (id, couple_id, item_id, drawn_by_member_id, outcome, request_id)
values ('50000000-0000-4000-8000-000000000027', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000025', '50000000-0000-4000-8000-000000000021', 'accepted', '50000000-0000-4000-8000-000000000028');
insert into public.memories (id, couple_id, item_id, draw_id, author_member_id, body, request_id)
values ('50000000-0000-4000-8000-000000000029', '50000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000025', '50000000-0000-4000-8000-000000000027', '50000000-0000-4000-8000-000000000021', 'Synthetic foreign memory.', '50000000-0000-4000-8000-00000000002a');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (public.create_category('50000000-0000-4000-8000-000000000030', 'Synthetic New Category')).created_by_member_id,
  '50000000-0000-4000-8000-000000000011'::uuid,
  'create_category derives the actor'
);
select is(
  (public.create_category('50000000-0000-4000-8000-000000000030', 'Synthetic Changed Retry')).name,
  'Synthetic New Category',
  'create_category returns the authorized request row before revalidating mutable input'
);
select is((select count(*) from public.categories where request_id = '50000000-0000-4000-8000-000000000030'), 1::bigint, 'category retries deduplicate');

select is(
  (public.create_item('50000000-0000-4000-8000-000000000031', 'Synthetic New Item', 'Synthetic new description.', '50000000-0000-4000-8000-000000000013', null, null)).creator_member_id,
  '50000000-0000-4000-8000-000000000011'::uuid,
  'create_item derives the actor'
);
select is(
  (public.create_item('50000000-0000-4000-8000-000000000031', 'Synthetic Changed Retry', 'Synthetic changed retry.', '50000000-0000-4000-8000-000000000023', null, null)).title,
  'Synthetic New Item',
  'create_item returns the request row before current reference validation'
);
select is((select count(*) from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 1::bigint, 'item retries deduplicate');

-- Interaction model v2: create_item now writes drafts. Promote directly (without
-- submit_item's author-Ready side effect) so the response-signal assertions below stay
-- independent of submission. Submission itself is covered by 006_lifecycle_test.sql.
reset role;
update public.items set status = 'submitted', submitted_at = clock_timestamp()
where request_id = '50000000-0000-4000-8000-000000000031';
set local role authenticated;

select throws_ok(
  $$select public.create_item('50000000-0000-4000-8000-000000000032', 'Synthetic Cross Category', 'Synthetic cross category.', '50000000-0000-4000-8000-000000000023', null, null)$$,
  'P0001', 'active category in current couple required',
  'create_item rejects a cross-couple category'
);
select throws_ok(
  $$select public.create_item('50000000-0000-4000-8000-000000000033', 'Synthetic Cross Lineage', 'Synthetic cross lineage.', '50000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000025', null)$$,
  'P0001', 'source item in current couple required',
  'create_item rejects cross-couple lineage'
);
select throws_ok(
  $$select public.create_item('50000000-0000-4000-8000-00000000002b', 'Synthetic Cross Memory', 'Synthetic cross memory.', '50000000-0000-4000-8000-000000000013', null, '50000000-0000-4000-8000-000000000029')$$,
  'P0001', 'source memory in current couple required',
  'create_item rejects a cross-couple source memory'
);
select throws_ok(
  $$select public.add_comment('50000000-0000-4000-8000-00000000002c', '50000000-0000-4000-8000-000000000025', 'Synthetic cross-couple comment.')$$,
  'P0001', 'item in current couple required',
  'add_comment rejects a cross-couple item'
);

-- Interaction model v2: partners co-edit submitted items (was: creator only).
select is(
  (public.update_item('50000000-0000-4000-8000-000000000015', 'Synthetic Partner Co-edit', 'Synthetic co-edit.', '50000000-0000-4000-8000-000000000013')).title,
  'Synthetic Partner Co-edit',
  'a partner can co-edit another member''s submitted item'
);
select throws_ok(
  $$select public.archive_item('50000000-0000-4000-8000-000000000015')$$,
  'P0001', 'item creator required',
  'a partner cannot archive another member''s item'
);

select public.set_item_interest((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), null);
select is(
  (select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')),
  1::bigint,
  'a null-to-null interest setter is a no-op beyond the item-created event'
);
select public.set_item_interest((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'curious');
select is((select interest from public.item_responses where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and member_id = '50000000-0000-4000-8000-000000000011'), 'curious'::public.interest, 'interest setter updates only the caller response');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'response_changed'), 1::bigint, 'meaningful interest change creates one response event');
select public.set_item_interest((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'curious');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'response_changed'), 1::bigint, 'repeating interest creates no event');
select is(
  (select interest from public.item_responses where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and member_id = '50000000-0000-4000-8000-000000000012'),
  null::public.interest,
  'an interest setter cannot change the partner response'
);
create temporary table response_noop_snapshot as
select updated_at
from public.item_responses
where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')
  and member_id = '50000000-0000-4000-8000-000000000011';
select public.set_item_interest((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'curious');
select is(
  (select r.updated_at from public.item_responses as r where r.item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and r.member_id = '50000000-0000-4000-8000-000000000011'),
  (select updated_at from response_noop_snapshot),
  'repeating interest does not touch updated_at'
);
select throws_ok(
  $$select public.set_item_interest('50000000-0000-4000-8000-000000000025', 'curious')$$,
  'P0001', 'owned item response required',
  'a response setter cannot target another couple'
);

select public.set_item_favorite((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), true);
select ok((select is_favorite from public.item_responses where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and member_id = '50000000-0000-4000-8000-000000000011'), 'favorite setter updates only the caller response');
create temporary table favorite_noop_snapshot as
select updated_at
from public.item_responses
where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')
  and member_id = '50000000-0000-4000-8000-000000000011';
select public.set_item_favorite((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), true);
select is(
  (select r.updated_at from public.item_responses as r where r.item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and r.member_id = '50000000-0000-4000-8000-000000000011'),
  (select updated_at from favorite_noop_snapshot),
  'repeating favorite does not touch updated_at'
);
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'response_changed'), 2::bigint, 'repeating favorite creates no response event');

select public.set_roulette_decision((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'ready');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'roulette_decision_changed'), 1::bigint, 'first ready creates a decision-changed event');
create temporary table roulette_noop_snapshot as
select updated_at
from public.item_responses
where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')
  and member_id = '50000000-0000-4000-8000-000000000011';
select public.set_roulette_decision((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'ready');
select is(
  (select r.updated_at from public.item_responses as r where r.item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and r.member_id = '50000000-0000-4000-8000-000000000011'),
  (select updated_at from roulette_noop_snapshot),
  'repeating Roulette decision does not touch updated_at'
);
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'roulette_decision_changed'), 1::bigint, 'repeating Roulette decision creates no event');
reset role;

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.set_roulette_decision((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'ready');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'item_became_eligible'), 1::bigint, 'second ready creates one eligibility event');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'roulette_decision_changed'), 1::bigint, 'second ready does not create another decision-changed event');
select is(
  (public.create_category('50000000-0000-4000-8000-000000000030', 'Synthetic Partner Request')).created_by_member_id,
  '50000000-0000-4000-8000-000000000012'::uuid,
  'a request UUID is scoped to its derived actor rather than exposing another actor row'
);
reset role;

insert into public.roulette_draws (id, couple_id, item_id, drawn_by_member_id, outcome, request_id)
values
  ('50000000-0000-4000-8000-000000000040', '50000000-0000-4000-8000-000000000010', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000011', 'accepted', '50000000-0000-4000-8000-000000000041'),
  ('50000000-0000-4000-8000-000000000042', '50000000-0000-4000-8000-000000000010', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000011', 'deferred', '50000000-0000-4000-8000-000000000043'),
  ('50000000-0000-4000-8000-000000000044', '50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000015', '50000000-0000-4000-8000-000000000011', 'accepted', '50000000-0000-4000-8000-000000000045');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (public.add_comment('50000000-0000-4000-8000-000000000034', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'Synthetic new comment.')).author_member_id,
  '50000000-0000-4000-8000-000000000011'::uuid,
  'add_comment derives the author'
);
select is(
  (public.add_comment('50000000-0000-4000-8000-000000000034', '50000000-0000-4000-8000-000000000025', 'Synthetic changed retry.')).body,
  'Synthetic new comment.',
  'comment retries return before reference validation'
);
select is((select count(*) from public.comments where request_id = '50000000-0000-4000-8000-000000000034'), 1::bigint, 'comment retries deduplicate');
select is((select count(*) from public.activity_events where comment_id = (select id from public.comments where request_id = '50000000-0000-4000-8000-000000000034') and event_type = 'comment_added'), 1::bigint, 'comment creation produces exactly one event');

select is(
  (public.add_memory('50000000-0000-4000-8000-000000000035', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), null, 'Synthetic memory body.', 'Synthetic highlight.', 'repeat', null)).author_member_id,
  '50000000-0000-4000-8000-000000000011'::uuid,
  'add_memory derives the author'
);
select is(
  (public.add_memory('50000000-0000-4000-8000-000000000035', '50000000-0000-4000-8000-000000000025', null, 'Synthetic changed memory.', null, null, null)).body,
  'Synthetic memory body.',
  'memory retries return before reference validation'
);
select is((select count(*) from public.memories where request_id = '50000000-0000-4000-8000-000000000035'), 1::bigint, 'memory retries deduplicate');
select is((select count(*) from public.activity_events where memory_id = (select id from public.memories where request_id = '50000000-0000-4000-8000-000000000035') and event_type = 'memory_added'), 1::bigint, 'memory creation produces exactly one event');
select lives_ok(
  $$select public.add_memory('50000000-0000-4000-8000-000000000046', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000040', 'Synthetic accepted-draw memory.', null, null, null)$$,
  'add_memory accepts an accepted draw for the same item and couple'
);
select throws_ok(
  $$select public.add_memory('50000000-0000-4000-8000-000000000047', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000042', 'Synthetic deferred-draw memory.', null, null, null)$$,
  'P0001', 'accepted draw for current item required',
  'add_memory rejects a deferred draw'
);
select throws_ok(
  $$select public.add_memory('50000000-0000-4000-8000-000000000048', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000044', 'Synthetic mismatched-draw memory.', null, null, null)$$,
  'P0001', 'accepted draw for current item required',
  'add_memory rejects a draw for a different item'
);
select throws_ok(
  $$select public.add_memory('50000000-0000-4000-8000-000000000049', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), '50000000-0000-4000-8000-000000000027', 'Synthetic cross-draw memory.', null, null, null)$$,
  'P0001', 'accepted draw for current item required',
  'add_memory rejects a cross-couple draw'
);

select is(
  (public.create_item('50000000-0000-4000-8000-000000000036', 'Synthetic Remix', 'Synthetic remix description.', '50000000-0000-4000-8000-000000000013', (select item_id from public.memories where request_id = '50000000-0000-4000-8000-000000000035'), (select id from public.memories where request_id = '50000000-0000-4000-8000-000000000035'))).source_memory_id,
  (select id from public.memories where request_id = '50000000-0000-4000-8000-000000000035'),
  'create_item accepts matching same-couple memory lineage'
);
-- Interaction model v2: create_item now writes drafts. Promote directly (without
-- submit_item's author-Ready side effect) so the response-signal assertions below stay
-- independent of submission. Submission itself is covered by 006_lifecycle_test.sql.
reset role;
update public.items set status = 'submitted', submitted_at = clock_timestamp()
where request_id = '50000000-0000-4000-8000-000000000036';
set local role authenticated;
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000036') and event_type = 'item_remixed'), 1::bigint, 'a remix creates exactly one item_remixed event');
select throws_ok(
  $$select public.create_item('50000000-0000-4000-8000-000000000037', 'Synthetic Mismatched Remix', 'Synthetic mismatched remix.', '50000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000015', (select id from public.memories where request_id = '50000000-0000-4000-8000-000000000035'))$$,
  'P0001', 'source memory must belong to source item',
  'create_item rejects mismatched same-couple lineage'
);

select public.update_item((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'Synthetic New Item', 'Synthetic new description.', '50000000-0000-4000-8000-000000000013');
select is((select count(*) from public.item_revisions where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')), 1::bigint, 'no-op item update creates no revision');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'item_edited'), 0::bigint, 'no-op item update creates no edit event');
create temporary table item_noop_snapshot as
select updated_at
from public.items
where request_id = '50000000-0000-4000-8000-000000000031';
select public.update_item((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'Synthetic New Item', 'Synthetic new description.', '50000000-0000-4000-8000-000000000013');
select is(
  (select updated_at from public.items where request_id = '50000000-0000-4000-8000-000000000031'),
  (select updated_at from item_noop_snapshot),
  'a no-op item update does not touch updated_at'
);
select public.update_item((select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 'Synthetic Updated Item', 'Synthetic new description.', '50000000-0000-4000-8000-000000000013');
select is((select count(*) from public.item_revisions where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')), 2::bigint, 'meaningful item update creates one revision');
select is((select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031') and event_type = 'item_edited'), 1::bigint, 'meaningful item update creates one edit event');
create temporary table archive_event_snapshot as
select count(*) as event_count
from public.activity_events
where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000036');
select ok(
  (public.archive_item((select id from public.items where request_id = '50000000-0000-4000-8000-000000000036'))).archived_at is not null,
  'the creator can archive an item'
);
select is(
  (select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000036')),
  (select event_count from archive_event_snapshot),
  'archive creates no activity event because the event vocabulary has no archive value'
);
select ok(
  not exists (
    select 1 from public.activity_events
    where metadata ?| array['title', 'description', 'body', 'highlight', 'refinement', 'email', 'password', 'secret', 'token']
  ),
  'database-owned activity metadata contains no content or credentials'
);
select throws_ok(
  $$update public.items
    set creator_member_id = '50000000-0000-4000-8000-000000000012',
        couple_id = '50000000-0000-4000-8000-000000000020',
        source_item_id = '50000000-0000-4000-8000-000000000015',
        created_at = clock_timestamp()
    where request_id = '50000000-0000-4000-8000-000000000031'$$,
  '42501', null,
  'authenticated callers cannot mutate item identity, lineage, or creation time directly'
);
select throws_ok(
  $$update public.item_responses
    set member_id = '50000000-0000-4000-8000-000000000012',
        item_id = '50000000-0000-4000-8000-000000000015',
        couple_id = '50000000-0000-4000-8000-000000000020'
    where item_id = (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031')
      and member_id = '50000000-0000-4000-8000-000000000011'$$,
  '42501', null,
  'authenticated callers cannot mutate response identity directly'
);

select throws_ok(
  $$insert into public.activity_events (couple_id, actor_member_id, event_type)
    values ('50000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000011', 'response_changed')$$,
  '42501', null,
  'authenticated users cannot insert activity directly'
);
select throws_ok(
  $$insert into public.item_revisions (couple_id, item_id, revision_number, editor_member_id, title, description, category_id)
    values ('50000000-0000-4000-8000-000000000010', (select id from public.items where request_id = '50000000-0000-4000-8000-000000000031'), 99, '50000000-0000-4000-8000-000000000011', 'Synthetic Forged Revision', 'Synthetic forged revision.', '50000000-0000-4000-8000-000000000013')$$,
  '42501', null,
  'authenticated users cannot insert revisions directly'
);
select throws_ok(
  $$select public.item_after_insert()$$,
  '42501', null,
  'authenticated users cannot execute trigger-only functions'
);
reset role;

select * from finish();
rollback;
