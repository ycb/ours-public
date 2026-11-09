begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
create extension if not exists pgrowlocks with schema extensions;

select plan(294);

-- These checks run against the seeded synthetic couple and act as its seeded auth users.
-- `npm run dev:accounts` re-points those members at local sign-in accounts, which a
-- `migration up` (unlike `db reset`) keeps. Restore the seed mapping inside this
-- transaction (rolled back at the end) so the suite passes whatever local data exists.
update public.members set auth_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-0000000000a0';
update public.members set auth_user_id = '00000000-0000-4000-8000-0000000000b2'
where id = '00000000-0000-4000-8000-0000000000b0';

select has_table('public', table_name, format('public.%I exists', table_name))
from unnest(array[
  'couples',
  'members',
  'categories',
  'items',
  'item_revisions',
  'item_responses',
  'comments',
  'roulette_draws',
  'memories',
  'activity_events'
]) as application_tables(table_name);

select has_type('public', type_name, format('public.%I exists', type_name))
from unnest(array[
  'interest',
  'roulette_decision',
  'draw_outcome',
  'memory_next_time',
  'activity_event_type'
]) as application_types(type_name);

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_catalog.pg_enum e
   join pg_catalog.pg_type t on t.oid = e.enumtypid
   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'interest'),
  array['low', 'curious', 'into_it', 'very_into_it']::text[],
  'interest has the expected labels in order'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_catalog.pg_enum e
   join pg_catalog.pg_type t on t.oid = e.enumtypid
   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'roulette_decision'),
  array['pending', 'ready', 'not_now']::text[],
  'roulette_decision has the expected labels in order'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_catalog.pg_enum e
   join pg_catalog.pg_type t on t.oid = e.enumtypid
   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'draw_outcome'),
  array['accepted', 'deferred']::text[],
  'draw_outcome has the expected labels in order'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_catalog.pg_enum e
   join pg_catalog.pg_type t on t.oid = e.enumtypid
   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'memory_next_time'),
  array['repeat', 'refine']::text[],
  'memory_next_time has the expected labels in order'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_catalog.pg_enum e
   join pg_catalog.pg_type t on t.oid = e.enumtypid
   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'activity_event_type'),
  array[
    'item_created',
    'item_edited',
    'item_remixed',
    'response_changed',
    'roulette_decision_changed',
    'item_became_eligible',
    'comment_added',
    'draw_accepted',
    'draw_deferred',
    'memory_added',
    'item_declined', -- added by interaction model v2
    'item_passed' -- Not for us (QA 2026-11-03)
  ]::text[],
  'activity_event_type has the expected labels in order'
);

select has_column(
  'public',
  table_name,
  column_name,
  format('public.%I.%I exists', table_name, column_name)
)
from (values
  ('couples', 'id'), ('couples', 'display_name'), ('couples', 'created_at'),
  ('members', 'id'), ('members', 'couple_id'), ('members', 'auth_user_id'),
  ('members', 'display_name'), ('members', 'sort_order'), ('members', 'created_at'),
  ('categories', 'id'), ('categories', 'couple_id'), ('categories', 'name'),
  ('categories', 'sort_order'), ('categories', 'created_by_member_id'),
  ('categories', 'request_id'), ('categories', 'created_at'), ('categories', 'archived_at'),
  ('items', 'id'), ('items', 'couple_id'), ('items', 'creator_member_id'),
  ('items', 'category_id'), ('items', 'source_item_id'), ('items', 'source_memory_id'),
  ('items', 'request_id'), ('items', 'title'), ('items', 'description'),
  ('items', 'created_at'), ('items', 'updated_at'), ('items', 'archived_at'),
  ('item_revisions', 'id'), ('item_revisions', 'couple_id'),
  ('item_revisions', 'item_id'), ('item_revisions', 'revision_number'),
  ('item_revisions', 'editor_member_id'), ('item_revisions', 'title'),
  ('item_revisions', 'description'), ('item_revisions', 'category_id'),
  ('item_revisions', 'created_at'),
  ('item_responses', 'id'), ('item_responses', 'couple_id'),
  ('item_responses', 'item_id'), ('item_responses', 'member_id'),
  ('item_responses', 'interest'), ('item_responses', 'is_favorite'),
  ('item_responses', 'roulette_decision'), ('item_responses', 'created_at'),
  ('item_responses', 'updated_at'),
  ('comments', 'id'), ('comments', 'couple_id'), ('comments', 'item_id'),
  ('comments', 'author_member_id'), ('comments', 'body'), ('comments', 'request_id'),
  ('comments', 'created_at'),
  ('roulette_draws', 'id'), ('roulette_draws', 'couple_id'),
  ('roulette_draws', 'item_id'), ('roulette_draws', 'drawn_by_member_id'),
  ('roulette_draws', 'filter_category_id'), ('roulette_draws', 'outcome'),
  ('roulette_draws', 'request_id'), ('roulette_draws', 'created_at'),
  ('memories', 'id'), ('memories', 'couple_id'), ('memories', 'item_id'),
  ('memories', 'draw_id'), ('memories', 'author_member_id'), ('memories', 'body'),
  ('memories', 'highlight'), ('memories', 'next_time'), ('memories', 'refinement'),
  ('memories', 'request_id'), ('memories', 'created_at'),
  ('activity_events', 'id'), ('activity_events', 'couple_id'),
  ('activity_events', 'actor_member_id'), ('activity_events', 'event_type'),
  ('activity_events', 'item_id'), ('activity_events', 'comment_id'),
  ('activity_events', 'draw_id'), ('activity_events', 'memory_id'),
  ('activity_events', 'metadata'), ('activity_events', 'created_at')
) as required_columns(table_name, column_name);

select is(
  format_type(a.atttypid, a.atttypmod),
  expected_type,
  format('public.%I.%I has type %s', table_name, column_name, expected_type)
)
from (values
  ('couples', 'id', 'uuid'),
  ('couples', 'created_at', 'timestamp with time zone'),
  ('members', 'couple_id', 'uuid'),
  ('members', 'auth_user_id', 'uuid'),
  ('members', 'sort_order', 'smallint'),
  ('categories', 'sort_order', 'integer'),
  ('categories', 'request_id', 'uuid'),
  ('categories', 'archived_at', 'timestamp with time zone'),
  ('items', 'title', 'text'),
  ('items', 'updated_at', 'timestamp with time zone'),
  ('item_revisions', 'revision_number', 'integer'),
  ('item_responses', 'interest', 'interest'),
  ('item_responses', 'is_favorite', 'boolean'),
  ('item_responses', 'roulette_decision', 'roulette_decision'),
  ('comments', 'request_id', 'uuid'),
  ('roulette_draws', 'outcome', 'draw_outcome'),
  ('memories', 'next_time', 'memory_next_time'),
  ('activity_events', 'event_type', 'activity_event_type'),
  ('activity_events', 'metadata', 'jsonb')
) as expected_columns(table_name, column_name, expected_type)
join pg_catalog.pg_class c on c.relname = table_name
join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_catalog.pg_attribute a on a.attrelid = c.oid
  and a.attname = column_name
  and a.attnum > 0
  and not a.attisdropped;

select ok(
  a.attnotnull,
  format('public.%I.%I is not null', table_name, column_name)
)
from (values
  ('couples', 'id'), ('couples', 'display_name'), ('couples', 'created_at'),
  ('members', 'couple_id'), ('members', 'auth_user_id'),
  ('categories', 'created_by_member_id'), ('categories', 'request_id'),
  ('items', 'creator_member_id'), ('items', 'category_id'), ('items', 'request_id'),
  ('item_revisions', 'item_id'), ('item_revisions', 'revision_number'),
  ('item_responses', 'item_id'), ('item_responses', 'member_id'),
  ('item_responses', 'is_favorite'), ('item_responses', 'roulette_decision'),
  ('comments', 'request_id'), ('roulette_draws', 'request_id'),
  ('memories', 'request_id'), ('activity_events', 'metadata')
) as expected_not_null(table_name, column_name)
join pg_catalog.pg_class c on c.relname = table_name
join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_catalog.pg_attribute a on a.attrelid = c.oid
  and a.attname = column_name
  and a.attnum > 0
  and not a.attisdropped;

select is(
  pg_get_expr(d.adbin, d.adrelid),
  expected_default,
  format('public.%I.%I has default %s', table_name, column_name, expected_default)
)
from (values
  ('couples', 'id', 'gen_random_uuid()'),
  ('couples', 'created_at', 'now()'),
  ('members', 'id', 'gen_random_uuid()'),
  ('members', 'created_at', 'now()'),
  ('categories', 'id', 'gen_random_uuid()'),
  ('categories', 'sort_order', '0'),
  ('categories', 'created_at', 'now()'),
  ('items', 'id', 'gen_random_uuid()'),
  ('items', 'created_at', 'now()'),
  ('items', 'updated_at', 'now()'),
  ('item_revisions', 'id', 'gen_random_uuid()'),
  ('item_responses', 'id', 'gen_random_uuid()'),
  ('item_responses', 'is_favorite', 'false'),
  ('item_responses', 'roulette_decision', '''pending''::roulette_decision'),
  ('item_responses', 'updated_at', 'now()'),
  ('comments', 'id', 'gen_random_uuid()'),
  ('roulette_draws', 'id', 'gen_random_uuid()'),
  ('memories', 'id', 'gen_random_uuid()'),
  ('activity_events', 'id', 'gen_random_uuid()'),
  ('activity_events', 'metadata', '''{}''::jsonb')
) as expected_defaults(table_name, column_name, expected_default)
join pg_catalog.pg_class c on c.relname = table_name
join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_catalog.pg_attribute a on a.attrelid = c.oid
  and a.attname = column_name
  and a.attnum > 0
  and not a.attisdropped
join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum;

select col_is_pk(
  'public',
  table_name,
  'id',
  format('public.%I.id is the primary key', table_name)
)
from unnest(array[
  'couples', 'members', 'categories', 'items', 'item_revisions',
  'item_responses', 'comments', 'roulette_draws', 'memories', 'activity_events'
]) as primary_keys(table_name);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'members'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (auth_user_id)'
  ),
  'members has a unique auth identity'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'item_responses'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (item_id, member_id)'
  ),
  'each member has exactly one response per item'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = table_name
      and c.conname = constraint_name
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) = expected_definition
  ),
  format('%s is the named same-couple foreign key on public.%I', constraint_name, table_name)
)
from (values
  ('categories', 'categories_creator_fkey', 'FOREIGN KEY (created_by_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('items', 'items_creator_fkey', 'FOREIGN KEY (creator_member_id, couple_id) REFERENCES members(id, couple_id) DEFERRABLE INITIALLY DEFERRED'),
  ('items', 'items_category_fkey', 'FOREIGN KEY (category_id, couple_id) REFERENCES categories(id, couple_id)'),
  ('items', 'items_source_item_fkey', 'FOREIGN KEY (source_item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('items', 'items_source_memory_fkey', 'FOREIGN KEY (source_memory_id, couple_id) REFERENCES memories(id, couple_id)'),
  ('item_revisions', 'item_revisions_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('item_revisions', 'item_revisions_editor_fkey', 'FOREIGN KEY (editor_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('item_revisions', 'item_revisions_category_fkey', 'FOREIGN KEY (category_id, couple_id) REFERENCES categories(id, couple_id)'),
  ('item_responses', 'item_responses_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('item_responses', 'item_responses_member_fkey', 'FOREIGN KEY (member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('comments', 'comments_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('comments', 'comments_author_fkey', 'FOREIGN KEY (author_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('roulette_draws', 'roulette_draws_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('roulette_draws', 'roulette_draws_actor_fkey', 'FOREIGN KEY (drawn_by_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('roulette_draws', 'roulette_draws_filter_category_fkey', 'FOREIGN KEY (filter_category_id, couple_id) REFERENCES categories(id, couple_id)'),
  ('memories', 'memories_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('memories', 'memories_draw_fkey', 'FOREIGN KEY (draw_id, couple_id) REFERENCES roulette_draws(id, couple_id)'),
  ('memories', 'memories_author_fkey', 'FOREIGN KEY (author_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('activity_events', 'activity_events_actor_fkey', 'FOREIGN KEY (actor_member_id, couple_id) REFERENCES members(id, couple_id)'),
  ('activity_events', 'activity_events_item_fkey', 'FOREIGN KEY (item_id, couple_id) REFERENCES items(id, couple_id)'),
  ('activity_events', 'activity_events_comment_fkey', 'FOREIGN KEY (comment_id, couple_id) REFERENCES comments(id, couple_id)'),
  ('activity_events', 'activity_events_draw_fkey', 'FOREIGN KEY (draw_id, couple_id) REFERENCES roulette_draws(id, couple_id)'),
  ('activity_events', 'activity_events_memory_fkey', 'FOREIGN KEY (memory_id, couple_id) REFERENCES memories(id, couple_id)')
) as same_couple_fks(table_name, constraint_name, expected_definition);

select is(
  row(c.condeferrable, c.condeferred)::text,
  row(expected_deferred, expected_deferred)::text,
  format('%s has the intended lock-order deferral', c.conname)
)
from (values
  ('items_couple_id_fkey', true),
  ('items_creator_fkey', true),
  ('items_category_fkey', false),
  ('items_source_item_fkey', false),
  ('items_source_memory_fkey', false)
) as expected_item_fks(constraint_name, expected_deferred)
join pg_catalog.pg_constraint c on c.conname = constraint_name
join pg_catalog.pg_class r on r.oid = c.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname = 'items';

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = table_name
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = expected_definition
  ),
  format('public.%I has per-actor request-id uniqueness', table_name)
)
from (values
  ('categories', 'UNIQUE (created_by_member_id, request_id)'),
  ('items', 'UNIQUE (creator_member_id, request_id)'),
  ('comments', 'UNIQUE (author_member_id, request_id)'),
  ('roulette_draws', 'UNIQUE (drawn_by_member_id, request_id)'),
  ('memories', 'UNIQUE (author_member_id, request_id)')
) as request_id_constraints(table_name, expected_definition);

select ok(
  i.indisunique
    and pg_get_indexdef(i.indexrelid) like '%(couple_id, lower(name))%'
    and pg_get_expr(i.indpred, i.indrelid) = '(archived_at IS NULL)',
  'categories_active_name_key is a case-insensitive unique index for active categories only'
)
from pg_catalog.pg_index i
join pg_catalog.pg_class x on x.oid = i.indexrelid
join pg_catalog.pg_namespace n on n.oid = x.relnamespace
where n.nspname = 'public' and x.relname = 'categories_active_name_key';

select ok(
  to_regclass(format('public.%I', index_name)) is not null,
  format('intended index public.%I exists', index_name)
)
from unnest(array[
  'members_couple_id_idx',
  'categories_couple_id_idx',
  'categories_active_name_key',
  'items_couple_id_idx',
  'items_category_id_idx',
  'items_source_item_id_idx',
  'items_source_memory_id_idx',
  'item_revisions_couple_id_idx',
  'item_revisions_editor_member_id_idx',
  'item_revisions_category_id_idx',
  'item_responses_couple_id_idx',
  'item_responses_member_id_idx',
  'comments_couple_id_idx',
  'comments_item_id_idx',
  'roulette_draws_couple_id_idx',
  'roulette_draws_item_id_idx',
  'roulette_draws_filter_category_id_idx',
  'memories_couple_id_idx',
  'memories_item_id_idx',
  'memories_draw_id_idx',
  'activity_events_couple_id_idx',
  'activity_events_actor_member_id_idx',
  'activity_events_item_id_idx',
  'activity_events_comment_id_idx',
  'activity_events_draw_id_idx',
  'activity_events_memory_id_idx',
  'items_library_updated_idx',
  'item_responses_eligibility_idx',
  'activity_events_feed_idx'
]) as intended_indexes(index_name);

select is(
  (
    select count(*)
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'members', 'categories', 'items', 'item_revisions', 'item_responses',
        'comments', 'roulette_draws', 'memories', 'activity_events'
      ])
      and c.contype = 'f'
      and not exists (
        select 1
        from pg_catalog.pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indkey[0] = c.conkey[1]
      )
  ),
  0::bigint,
  'every foreign key has a supporting index'
);

select ok(c.relrowsecurity, format('RLS is enabled on public.%I', c.relname))
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'couples', 'members', 'categories', 'items', 'item_revisions',
    'item_responses', 'comments', 'roulette_draws', 'memories', 'activity_events'
  ]);

select ok(
  not has_function_privilege(role_name, function_name, 'execute'),
  format('%s cannot execute trigger-only function %s', role_name, function_name)
)
from unnest(array['anon', 'authenticated']) as browser_roles(role_name)
cross join unnest(array[
  'public.item_after_insert()',
  'public.item_before_update()',
  'public.maintain_item_response_updated_at()',
  'public.reject_item_revision_mutation()'
]) as trigger_functions(function_name);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

insert into public.categories (
  id, couple_id, name, created_by_member_id, request_id
) values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000c0',
  'Synthetic Category',
  '00000000-0000-4000-8000-0000000000a0',
  '10000000-0000-4000-8000-000000000002'
);

select throws_ok(
  $$insert into public.categories (
      couple_id, name, created_by_member_id, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      'synthetic category',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000020'
    )$$,
  '23505',
  null,
  'active category names are unique case-insensitively within a couple'
);

update public.categories
set archived_at = clock_timestamp()
where id = '10000000-0000-4000-8000-000000000001';

select lives_ok(
  $$insert into public.categories (
      id, couple_id, name, created_by_member_id, request_id
    ) values (
      '10000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-0000000000c0',
      'synthetic category',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000022'
    )$$,
  'an archived category name may be reused'
);

select throws_ok(
  $$insert into public.categories (
      couple_id, name, created_by_member_id, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      'Synthetic Request Replay',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000022'
    )$$,
  '23505',
  null,
  'a category request id cannot be reused by the same actor'
);

select lives_ok(
  $$insert into public.items (
      id, couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '10000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-0000000000c0',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000021',
      '10000000-0000-4000-8000-000000000004',
      'Synthetic Item',
      'Synthetic description.'
    )$$,
  'an authenticated member can create an item for a two-member couple'
);

select is(
  (select count(*) from public.item_revisions
   where item_id = '10000000-0000-4000-8000-000000000003'),
  1::bigint,
  'item creation produces revision 1'
);
select is(
  (select count(*) from public.item_responses
   where item_id = '10000000-0000-4000-8000-000000000003'
     and roulette_decision = 'pending'),
  2::bigint,
  'item creation produces exactly two pending responses'
);

select is(
  (select array_agg(member_id order by member_id)
   from public.item_responses
   where item_id = '10000000-0000-4000-8000-000000000003'),
  array[
    '00000000-0000-4000-8000-0000000000a0'::uuid,
    '00000000-0000-4000-8000-0000000000b0'::uuid
  ],
  'item creation initializes responses for the captured couple members'
);

select is(
  (
    select count(*)
    from extensions.pgrowlocks('public.members') as locked_members
    join public.members m on m.ctid = locked_members.locked_row
    where m.id = any(array[
        '00000000-0000-4000-8000-0000000000a0'::uuid,
        '00000000-0000-4000-8000-0000000000b0'::uuid
      ])
      and 'For Update' = any(locked_members.modes)
  ),
  2::bigint,
  'item initialization holds both captured member rows for update'
);

select is(
  (select row(title, description, category_id)::text
   from public.item_revisions
   where item_id = '10000000-0000-4000-8000-000000000003'
     and revision_number = 1),
  row(
    'Synthetic Item',
    'Synthetic description.',
    '10000000-0000-4000-8000-000000000021'::uuid
  )::text,
  'revision 1 captures the initial item content'
);

select ok(
  (select created_at = updated_at
   from public.items
   where id = '10000000-0000-4000-8000-000000000003'),
  'a new item starts with matching created and updated timestamps'
);

select throws_ok(
  $$insert into public.items (
      couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000021',
      '10000000-0000-4000-8000-000000000004',
      'Synthetic Item Replay',
      'Synthetic replay description.'
    )$$,
  '23505',
  null,
  'an item request id cannot be reused by the same actor'
);

update public.items
set title = title
where id = '10000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from public.item_revisions
   where item_id = '10000000-0000-4000-8000-000000000003'),
  1::bigint,
  'a no-op item update does not create a revision'
);

update public.items
set title = 'Synthetic Item Revised'
where id = '10000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from public.item_revisions
   where item_id = '10000000-0000-4000-8000-000000000003'),
  2::bigint,
  'a meaningful item update creates the next revision'
);
select is(
  (select editor_member_id from public.item_revisions
   where item_id = '10000000-0000-4000-8000-000000000003'
     and revision_number = 2),
  '00000000-0000-4000-8000-0000000000a0'::uuid,
  'the revision editor is derived from the authenticated member'
);
select ok(
  (select updated_at > created_at
   from public.items
   where id = '10000000-0000-4000-8000-000000000003'),
  'a meaningful item update advances updated_at'
);

select ok(
  (select r.created_at >= i.created_at
   from public.item_revisions r
   join public.items i on i.id = r.item_id
   where r.item_id = '10000000-0000-4000-8000-000000000003'
     and r.revision_number = 2),
  'a new revision records its own creation timestamp'
);

select lives_ok(
  $$update public.item_responses
    set interest = 'curious'
    where item_id = '10000000-0000-4000-8000-000000000003'
      and member_id = '00000000-0000-4000-8000-0000000000a0'$$,
  'a response can change its mutable answer fields'
);
select ok(
  (select updated_at > created_at
   from public.item_responses
   where item_id = '10000000-0000-4000-8000-000000000003'
     and member_id = '00000000-0000-4000-8000-0000000000a0'),
  'a meaningful response update advances updated_at'
);

select throws_ok(
  $$update public.item_revisions
    set title = 'Synthetic Tamper'
    where item_id = '10000000-0000-4000-8000-000000000003'
      and revision_number = 1$$,
  'P0001',
  'item revisions are immutable',
  'direct revision updates are rejected'
);
select throws_ok(
  $$delete from public.item_revisions
    where item_id = '10000000-0000-4000-8000-000000000003'
      and revision_number = 1$$,
  'P0001',
  'item revisions are immutable',
  'direct revision deletes are rejected'
);

insert into public.comments (
  id, couple_id, item_id, author_member_id, body, request_id
) values (
  '10000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-0000000000c0',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-0000000000a0',
  'Synthetic comment.',
  '10000000-0000-4000-8000-000000000031'
);
select throws_ok(
  $$insert into public.comments (
      couple_id, item_id, author_member_id, body, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-0000000000a0',
      'Synthetic replay comment.',
      '10000000-0000-4000-8000-000000000031'
    )$$,
  '23505',
  null,
  'a comment request id cannot be reused by the same actor'
);

insert into public.roulette_draws (
  id, couple_id, item_id, drawn_by_member_id, outcome, request_id
) values (
  '10000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-0000000000c0',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-0000000000a0',
  'accepted',
  '10000000-0000-4000-8000-000000000033'
);
select throws_ok(
  $$insert into public.roulette_draws (
      couple_id, item_id, drawn_by_member_id, outcome, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-0000000000a0',
      'deferred',
      '10000000-0000-4000-8000-000000000033'
    )$$,
  '23505',
  null,
  'a Roulette outcome request id cannot be reused by the same actor'
);

insert into public.memories (
  id, couple_id, item_id, draw_id, author_member_id, body, request_id
) values (
  '10000000-0000-4000-8000-000000000034',
  '00000000-0000-4000-8000-0000000000c0',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-0000000000a0',
  'Synthetic memory.',
  '10000000-0000-4000-8000-000000000035'
);
select throws_ok(
  $$insert into public.memories (
      couple_id, item_id, draw_id, author_member_id, body, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000032',
      '00000000-0000-4000-8000-0000000000a0',
      'Synthetic replay memory.',
      '10000000-0000-4000-8000-000000000035'
    )$$,
  '23505',
  null,
  'a memory request id cannot be reused by the same actor'
);

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values (
  '10000000-0000-4000-8000-000000000010',
  'infinity',
  false,
  false
);
insert into public.couples (id, display_name)
values ('10000000-0000-4000-8000-000000000011', 'Synthetic One-Member Couple');
insert into public.members (
  id, couple_id, auth_user_id, display_name, sort_order
) values (
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000010',
  'Synthetic Solo Member',
  0
);
insert into public.categories (
  id, couple_id, name, created_by_member_id, request_id
) values (
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000011',
  'Synthetic Solo Category',
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000014'
);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000010',
  true
);
select throws_ok(
  $$insert into public.items (
      couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000015',
      'Synthetic Invalid Item',
      'Synthetic invalid description.'
    )$$,
  'P0001',
  'item creation requires exactly two couple members',
  'item creation fails unless the couple has exactly two members'
);

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values ('10000000-0000-4000-8000-000000000016', 'infinity', false, false);
insert into public.members (
  id, couple_id, auth_user_id, display_name, sort_order
) values (
  '10000000-0000-4000-8000-000000000017',
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000016',
  'Synthetic Solo Partner',
  1
);
select lives_ok(
  $$insert into public.items (
      id, couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '10000000-0000-4000-8000-000000000018',
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000019',
      'Synthetic Other Couple Item',
      'Synthetic other-couple description.'
    )$$,
  'the second synthetic couple can create an item after it has two members'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);
select throws_ok(
  $$insert into public.categories (
      couple_id, name, created_by_member_id, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      'Synthetic Cross-Couple Category',
      '10000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000040'
    )$$,
  '23503',
  null,
  'a category creator must belong to the category couple'
);
select throws_ok(
  $$insert into public.items (
      couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000041',
      'Synthetic Cross-Couple Item',
      'Synthetic cross-couple description.'
    )$$,
  '23503',
  null,
  'an item category must belong to the item couple'
);
select throws_ok(
  $$insert into public.comments (
      couple_id, item_id, author_member_id, body, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000012',
      'Synthetic cross-couple comment.',
      '10000000-0000-4000-8000-000000000042'
    )$$,
  '23503',
  null,
  'a comment author must belong to the comment couple'
);
select throws_ok(
  $$insert into public.roulette_draws (
      couple_id, item_id, drawn_by_member_id, outcome, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000012',
      'accepted',
      '10000000-0000-4000-8000-000000000043'
    )$$,
  '23503',
  null,
  'a draw actor must belong to the draw couple'
);
select throws_ok(
  $$insert into public.memories (
      couple_id, item_id, author_member_id, body, request_id
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000012',
      'Synthetic cross-couple memory.',
      '10000000-0000-4000-8000-000000000044'
    )$$,
  '23503',
  null,
  'a memory author must belong to the memory couple'
);
select throws_ok(
  $$insert into public.activity_events (
      couple_id, actor_member_id, event_type
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '10000000-0000-4000-8000-000000000012',
      'item_created'
    )$$,
  '23503',
  null,
  'an activity actor must belong to the activity couple'
);

insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
values ('20000000-0000-4000-8000-000000000005', 'infinity', false, false);
insert into public.members (
  id, couple_id, auth_user_id, display_name, sort_order
) values (
  '20000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-0000000000c0',
  '20000000-0000-4000-8000-000000000005',
  'Synthetic Third Member',
  2
);
select throws_ok(
  $$insert into public.items (
      couple_id, creator_member_id, category_id, request_id, title, description
    ) values (
      '00000000-0000-4000-8000-0000000000c0',
      '00000000-0000-4000-8000-0000000000a0',
      '10000000-0000-4000-8000-000000000021',
      '20000000-0000-4000-8000-000000000007',
      'Synthetic Three-Member Item',
      'Synthetic invalid description.'
    )$$,
  'P0001',
  'item creation requires exactly two couple members',
  'item creation rejects a couple with three members'
);
delete from public.members
where id = '20000000-0000-4000-8000-000000000006';

select is(
  extensions.dblink_connect(
    'membership_race',
    format(
      'host=%s port=%s dbname=%s user=postgres password=postgres sslmode=disable',
      inet_server_addr(),
      inet_server_port(),
      current_database()
    )
  ),
  'OK',
  'the concurrency regression opens an independent database session'
);
select is(
  extensions.dblink_exec(
    'membership_race',
    $$set lock_timeout = '250ms'$$
  ),
  'SET',
  'the independent session uses a bounded lock wait'
);
select throws_ok(
  $$select extensions.dblink_exec(
      'membership_race',
      'insert into auth.users (id, banned_until, is_sso_user, is_anonymous)
       values (
         ''20000000-0000-4000-8000-000000000008'',
         ''infinity'',
         false,
         false
       );
       insert into public.members (
         couple_id, auth_user_id, display_name, sort_order
       ) values (
         ''00000000-0000-4000-8000-0000000000c0'',
         ''20000000-0000-4000-8000-000000000008'',
         ''Synthetic Concurrent Member'',
         3
       )'
    )$$,
  '55P03',
  'canceling statement due to lock timeout',
  'a concurrent membership insert waits until item initialization commits'
);
select throws_ok(
  $$select extensions.dblink_exec(
      'membership_race',
      'delete from public.members
       where id = ''00000000-0000-4000-8000-0000000000a0'''
    )$$,
  '55P03',
  'canceling statement due to lock timeout',
  'a concurrent membership delete waits until item initialization commits'
);
select throws_ok(
  $$select extensions.dblink_exec(
      'membership_race',
      'update public.members
       set couple_id = ''10000000-0000-4000-8000-000000000011'', sort_order = 2
       where id = ''00000000-0000-4000-8000-0000000000b0'''
    )$$,
  '55P03',
  'canceling statement due to lock timeout',
  'a concurrent membership reassignment waits until item initialization commits'
);
select is(
  extensions.dblink_disconnect('membership_race'),
  'OK',
  'the independent database session disconnects cleanly'
);

select * from finish();
rollback;
