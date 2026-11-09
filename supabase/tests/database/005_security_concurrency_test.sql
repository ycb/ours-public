create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select no_plan();

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('60000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('60000000-0000-4000-8000-000000000002', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('60000000-0000-4000-8000-000000000010', 'Synthetic Security Concurrency Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('60000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000001', 'Synthetic Concurrent Actor One', 0),
  ('60000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000002', 'Synthetic Concurrent Actor Two', 1);

select is(
  extensions.dblink_connect(
    'security_writer_a',
    format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())
  ),
  'OK',
  'the first security writer opens an independent session'
);
select is(
  extensions.dblink_connect(
    'security_writer_b',
    format('host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable', inet_server_addr(), inet_server_port(), current_database())
  ),
  'OK',
  'the second security writer opens an independent session'
);

select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the category retry transaction');
select is(extensions.dblink_exec('security_writer_b', 'begin'), 'BEGIN', 'writer B begins the category retry transaction');
select is(extensions.dblink_exec('security_writer_a', 'set local role authenticated'), 'SET', 'writer A assumes authenticated');
select is(extensions.dblink_exec('security_writer_b', 'set local role authenticated'), 'SET', 'writer B assumes authenticated');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A selects its actor');
select is(extensions.dblink_exec('security_writer_b', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer B selects the same actor');
select ok(
  (select id is not null from extensions.dblink(
    'security_writer_a',
    $$select (public.create_category('60000000-0000-4000-8000-000000000020', 'Synthetic Concurrent Category')).id$$
  ) as result(id uuid)),
  'writer A creates the category while retaining the transaction'
);
select is(
  extensions.dblink_send_query(
    'security_writer_b',
    $$select (public.create_category('60000000-0000-4000-8000-000000000020', '')).id$$
  ),
  1,
  'writer B starts the same category request concurrently'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('security_writer_b'), 1, 'the concurrent category retry waits for the first transaction');
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits the category');
select is(
  (select id from extensions.dblink_get_result('security_writer_b') as result(id uuid)),
  (select id from public.categories where request_id = '60000000-0000-4000-8000-000000000020'),
  'the concurrent category retry returns the durable winner'
);
select is((select count(*) from extensions.dblink_get_result('security_writer_b') as result(id uuid)), 0::bigint, 'writer B drains the category result stream');
select is(extensions.dblink_exec('security_writer_b', 'commit'), 'COMMIT', 'writer B commits its category retry');

select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the item retry transaction');
select is(extensions.dblink_exec('security_writer_b', 'begin'), 'BEGIN', 'writer B begins the item retry transaction');
select is(extensions.dblink_exec('security_writer_a', 'set local role authenticated'), 'SET', 'writer A reassumes authenticated');
select is(extensions.dblink_exec('security_writer_b', 'set local role authenticated'), 'SET', 'writer B reassumes authenticated');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A reselects its actor');
select is(extensions.dblink_exec('security_writer_b', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer B reselects the same actor');
select ok(
  (select id is not null from extensions.dblink(
    'security_writer_a',
    format(
      $$select (public.create_item('60000000-0000-4000-8000-000000000021', 'Synthetic Concurrent Item', 'Synthetic concurrent description.', %L, null, null)).id$$,
      (select id from public.categories where request_id = '60000000-0000-4000-8000-000000000020')
    )
  ) as result(id uuid)),
  'writer A creates the item while retaining the transaction'
);
select is(
  extensions.dblink_send_query(
    'security_writer_b',
    format(
      $$select (public.create_item('60000000-0000-4000-8000-000000000021', 'Synthetic Changed Retry', 'Synthetic changed retry.', %L, null, null)).id$$,
      '60000000-0000-4000-8000-000000000099'::uuid
    )
  ),
  1,
  'writer B starts the same item request concurrently'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('security_writer_b'), 1, 'the concurrent item retry waits for the first transaction');
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits the item');
select is(
  (select id from extensions.dblink_get_result('security_writer_b') as result(id uuid)),
  (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021'),
  'the concurrent item retry returns the durable winner'
);
select is((select count(*) from extensions.dblink_get_result('security_writer_b') as result(id uuid)), 0::bigint, 'writer B drains the item result stream');
select is(extensions.dblink_exec('security_writer_b', 'commit'), 'COMMIT', 'writer B commits its item retry');

-- Interaction model v2: create_item writes drafts. Promote through a committed connection
-- (not this session, whose open transaction would hold the row lock) and without
-- submit_item's author-Ready side effect, so the concurrent Ready checks below are unchanged.
select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the promotion');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A selects the author for promotion');
select is(
  extensions.dblink_exec('security_writer_a', $$update public.items set status = 'submitted', submitted_at = clock_timestamp() where request_id = '60000000-0000-4000-8000-000000000021'$$),
  'UPDATE 1', 'writer A promotes the draft'
);
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits the promotion');

select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the comment retry transaction');
select is(extensions.dblink_exec('security_writer_b', 'begin'), 'BEGIN', 'writer B begins the comment retry transaction');
select is(extensions.dblink_exec('security_writer_a', 'set local role authenticated'), 'SET', 'writer A authenticates for the comment');
select is(extensions.dblink_exec('security_writer_b', 'set local role authenticated'), 'SET', 'writer B authenticates for the comment');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A selects its comment actor');
select is(extensions.dblink_exec('security_writer_b', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer B selects the same comment actor');
select ok(
  (select id is not null from extensions.dblink(
    'security_writer_a',
    format(
      $$select (public.add_comment('60000000-0000-4000-8000-000000000022', %L, 'Synthetic concurrent comment.')).id$$,
      (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021')
    )
  ) as result(id uuid)),
  'writer A creates the comment while retaining the transaction'
);
select is(
  extensions.dblink_send_query(
    'security_writer_b',
    format(
      $$select (public.add_comment('60000000-0000-4000-8000-000000000022', %L, '')).id$$,
      '60000000-0000-4000-8000-000000000099'::uuid
    )
  ),
  1,
  'writer B starts the same comment request concurrently'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('security_writer_b'), 1, 'the concurrent comment retry waits for the first transaction');
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits the comment');
select is(
  (select id from extensions.dblink_get_result('security_writer_b') as result(id uuid)),
  (select id from public.comments where request_id = '60000000-0000-4000-8000-000000000022'),
  'the concurrent comment retry returns the durable winner'
);
select is((select count(*) from extensions.dblink_get_result('security_writer_b') as result(id uuid)), 0::bigint, 'writer B drains the comment result stream');
select is(extensions.dblink_exec('security_writer_b', 'commit'), 'COMMIT', 'writer B commits its comment retry');

select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the memory retry transaction');
select is(extensions.dblink_exec('security_writer_b', 'begin'), 'BEGIN', 'writer B begins the memory retry transaction');
select is(extensions.dblink_exec('security_writer_a', 'set local role authenticated'), 'SET', 'writer A authenticates for the memory');
select is(extensions.dblink_exec('security_writer_b', 'set local role authenticated'), 'SET', 'writer B authenticates for the memory');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A selects its memory actor');
select is(extensions.dblink_exec('security_writer_b', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer B selects the same memory actor');
select ok(
  (select id is not null from extensions.dblink(
    'security_writer_a',
    format(
      $$select (public.add_memory('60000000-0000-4000-8000-000000000023', %L, null, 'Synthetic concurrent memory.', null, null, null)).id$$,
      (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021')
    )
  ) as result(id uuid)),
  'writer A creates the memory while retaining the transaction'
);
select is(
  extensions.dblink_send_query(
    'security_writer_b',
    format(
      $$select (public.add_memory('60000000-0000-4000-8000-000000000023', %L, null, '', null, null, null)).id$$,
      '60000000-0000-4000-8000-000000000099'::uuid
    )
  ),
  1,
  'writer B starts the same memory request concurrently'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('security_writer_b'), 1, 'the concurrent memory retry waits for the first transaction');
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits the memory');
select is(
  (select id from extensions.dblink_get_result('security_writer_b') as result(id uuid)),
  (select id from public.memories where request_id = '60000000-0000-4000-8000-000000000023'),
  'the concurrent memory retry returns the durable winner'
);
select is((select count(*) from extensions.dblink_get_result('security_writer_b') as result(id uuid)), 0::bigint, 'writer B drains the memory result stream');
select is(extensions.dblink_exec('security_writer_b', 'commit'), 'COMMIT', 'writer B commits its memory retry');

select is(extensions.dblink_exec('security_writer_a', 'begin'), 'BEGIN', 'writer A begins the Ready transaction');
select is(extensions.dblink_exec('security_writer_b', 'begin'), 'BEGIN', 'writer B begins the Ready transaction');
select is(extensions.dblink_exec('security_writer_a', 'set local role authenticated'), 'SET', 'writer A authenticates for Ready');
select is(extensions.dblink_exec('security_writer_b', 'set local role authenticated'), 'SET', 'writer B authenticates for Ready');
select is(extensions.dblink_exec('security_writer_a', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000001'$$), 'SET', 'writer A selects the first partner');
select is(extensions.dblink_exec('security_writer_b', $$set local request.jwt.claim.sub = '60000000-0000-4000-8000-000000000002'$$), 'SET', 'writer B selects the second partner');
select ok(
  (select id is not null from extensions.dblink(
    'security_writer_a',
    format(
      $$select (public.set_roulette_decision(%L, 'ready')).id$$,
      (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021')
    )
  ) as result(id uuid)),
  'writer A records Ready while retaining the transaction'
);
select is(
  extensions.dblink_send_query(
    'security_writer_b',
    format(
      $$select (public.set_roulette_decision(%L, 'ready')).id$$,
      (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021')
    )
  ),
  1,
  'writer B starts the other Ready mutation concurrently'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('security_writer_b'), 1, 'the second Ready mutation waits at item serialization');
select is(extensions.dblink_exec('security_writer_a', 'commit'), 'COMMIT', 'writer A commits Ready');
select ok(
  (select id is not null from extensions.dblink_get_result('security_writer_b') as result(id uuid)),
  'writer B completes Ready after the first commit'
);
select is((select count(*) from extensions.dblink_get_result('security_writer_b') as result(id uuid)), 0::bigint, 'writer B drains the Ready result stream');
select is(extensions.dblink_exec('security_writer_b', 'commit'), 'COMMIT', 'writer B commits Ready');
select is(
  (select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021') and event_type = 'roulette_decision_changed'),
  1::bigint,
  'concurrent Ready changes retain exactly one decision-changed event'
);
select is(
  (select count(*) from public.activity_events where item_id = (select id from public.items where request_id = '60000000-0000-4000-8000-000000000021') and event_type = 'item_became_eligible'),
  1::bigint,
  'concurrent Ready changes produce exactly one eligibility event'
);

select is(extensions.dblink_disconnect('security_writer_a'), 'OK', 'writer A disconnects cleanly');
select is(extensions.dblink_disconnect('security_writer_b'), 'OK', 'writer B disconnects cleanly');

begin;
delete from public.notification_outbox where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.activity_events where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.memories where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.comments where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.item_responses where couple_id = '60000000-0000-4000-8000-000000000010';
alter table public.item_revisions disable trigger item_revisions_reject_mutation;
delete from public.item_revisions where couple_id = '60000000-0000-4000-8000-000000000010';
alter table public.item_revisions enable trigger item_revisions_reject_mutation;
delete from public.items where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.categories where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.members where couple_id = '60000000-0000-4000-8000-000000000010';
delete from public.couples where id = '60000000-0000-4000-8000-000000000010';
delete from auth.users where id in ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002');
commit;

select * from finish();
