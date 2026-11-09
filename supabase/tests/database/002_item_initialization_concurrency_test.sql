create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(15);

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values
  ('30000000-0000-4000-8000-000000000001', 'infinity', false, false),
  ('30000000-0000-4000-8000-000000000002', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('30000000-0000-4000-8000-000000000003', 'Synthetic Concurrency Couple');
insert into public.members (
  id, couple_id, auth_user_id, display_name, sort_order
) values
  (
    '30000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'Synthetic Concurrent Partner A',
    0
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    'Synthetic Concurrent Partner B',
    1
  );
insert into public.categories (
  id, couple_id, name, created_by_member_id, request_id
) values (
  '30000000-0000-4000-8000-000000000006',
  '30000000-0000-4000-8000-000000000003',
  'Synthetic Concurrent Category',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000007'
);

select is(
  extensions.dblink_connect(
    'item_writer_a',
    format(
      'host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable',
      inet_server_addr(),
      inet_server_port(),
      current_database()
    )
  ),
  'OK',
  'the first item writer opens an independent session'
);
select is(
  extensions.dblink_connect(
    'item_writer_b',
    format(
      'host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable',
      inet_server_addr(),
      inet_server_port(),
      current_database()
    )
  ),
  'OK',
  'the second item writer opens an independent session'
);
select is(extensions.dblink_exec('item_writer_a', 'begin'), 'BEGIN', 'writer A starts');
select is(extensions.dblink_exec('item_writer_b', 'begin'), 'BEGIN', 'writer B starts');
select is(
  extensions.dblink_exec(
    'item_writer_a',
    $$set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001'$$
  ),
  'SET',
  'writer A selects the synthetic actor'
);
select is(
  extensions.dblink_exec(
    'item_writer_b',
    $$set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001'$$
  ),
  'SET',
  'writer B selects the synthetic actor'
);
select is(
  extensions.dblink_exec(
    'item_writer_a',
    $$insert into public.items (
        id, couple_id, creator_member_id, category_id, request_id, title, description
      ) values (
        '30000000-0000-4000-8000-000000000008',
        '30000000-0000-4000-8000-000000000003',
        '30000000-0000-4000-8000-000000000004',
        '30000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000009',
        'Synthetic Concurrent Item A',
        'Synthetic concurrent description A.'
      )$$
  ),
  'INSERT 0 1',
  'writer A initializes an item while retaining its transaction locks'
);
select is(
  extensions.dblink_send_query(
    'item_writer_b',
    $$insert into public.items (
        id, couple_id, creator_member_id, category_id, request_id, title, description
      ) values (
        '30000000-0000-4000-8000-000000000010',
        '30000000-0000-4000-8000-000000000003',
        '30000000-0000-4000-8000-000000000004',
        '30000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000011',
        'Synthetic Concurrent Item B',
        'Synthetic concurrent description B.'
      ) returning id$$
  ),
  1,
  'writer B starts item initialization asynchronously'
);
select pg_sleep(0.1);
select is(
  extensions.dblink_is_busy('item_writer_b'),
  1,
  'writer B waits at the shared couple serialization boundary'
);
select is(
  extensions.dblink_exec('item_writer_a', 'rollback'),
  'ROLLBACK',
  'writer A releases the serialization lock'
);
select is(
  (select id from extensions.dblink_get_result('item_writer_b') as result(id uuid)),
  '30000000-0000-4000-8000-000000000010'::uuid,
  'writer B completes after writer A releases the lock without a deadlock'
);
select is(
  (select count(*) from extensions.dblink_get_result('item_writer_b') as result(id uuid)),
  0::bigint,
  'writer B drains its asynchronous result stream'
);
select is(
  extensions.dblink_exec('item_writer_b', 'rollback'),
  'ROLLBACK',
  'writer B rolls back its synthetic item'
);
select is(
  extensions.dblink_disconnect('item_writer_a'),
  'OK',
  'writer A disconnects cleanly'
);
select is(
  extensions.dblink_disconnect('item_writer_b'),
  'OK',
  'writer B disconnects cleanly'
);

delete from public.categories where id = '30000000-0000-4000-8000-000000000006';
delete from public.members where couple_id = '30000000-0000-4000-8000-000000000003';
delete from public.couples where id = '30000000-0000-4000-8000-000000000003';
delete from auth.users where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002'
);

select * from finish();
