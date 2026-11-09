create type public.interest as enum (
  'low',
  'curious',
  'into_it',
  'very_into_it'
);

create type public.roulette_decision as enum (
  'pending',
  'ready',
  'not_now'
);

create type public.draw_outcome as enum (
  'accepted',
  'deferred'
);

create type public.memory_next_time as enum (
  'repeat',
  'refine'
);

create type public.activity_event_type as enum (
  'item_created',
  'item_edited',
  'item_remixed',
  'response_changed',
  'roulette_decision_changed',
  'item_became_eligible',
  'comment_added',
  'draw_accepted',
  'draw_deferred',
  'memory_added'
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint couples_display_name_check check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 80
  )
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  auth_user_id uuid not null unique references auth.users (id),
  display_name text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint members_display_name_check check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 80
  ),
  constraint members_sort_order_check check (sort_order >= 0),
  unique (couple_id, sort_order),
  unique (id, couple_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  name text not null,
  sort_order integer not null default 0,
  created_by_member_id uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint categories_name_check check (
    name = btrim(name)
    and char_length(name) between 1 and 80
  ),
  constraint categories_creator_fkey foreign key (created_by_member_id, couple_id)
    references public.members (id, couple_id),
  unique (created_by_member_id, request_id),
  unique (id, couple_id)
);

create unique index categories_active_name_key
  on public.categories (couple_id, lower(name))
  where archived_at is null;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id)
    deferrable initially deferred,
  creator_member_id uuid not null,
  category_id uuid not null,
  source_item_id uuid,
  source_memory_id uuid,
  request_id uuid not null,
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint items_title_check check (
    title = btrim(title)
    and char_length(title) between 1 and 120
  ),
  constraint items_description_check check (
    description = btrim(description)
    and char_length(description) between 1 and 4000
  ),
  constraint items_source_item_check check (source_item_id is distinct from id),
  constraint items_creator_fkey foreign key (creator_member_id, couple_id)
    references public.members (id, couple_id) deferrable initially deferred,
  constraint items_category_fkey foreign key (category_id, couple_id)
    references public.categories (id, couple_id),
  constraint items_source_item_fkey foreign key (source_item_id, couple_id)
    references public.items (id, couple_id),
  unique (creator_member_id, request_id),
  unique (id, couple_id)
);

create table public.item_revisions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  revision_number integer not null,
  editor_member_id uuid not null,
  title text not null,
  description text not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  constraint item_revisions_revision_number_check check (revision_number > 0),
  constraint item_revisions_title_check check (
    title = btrim(title)
    and char_length(title) between 1 and 120
  ),
  constraint item_revisions_description_check check (
    description = btrim(description)
    and char_length(description) between 1 and 4000
  ),
  constraint item_revisions_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint item_revisions_editor_fkey foreign key (editor_member_id, couple_id)
    references public.members (id, couple_id),
  constraint item_revisions_category_fkey foreign key (category_id, couple_id)
    references public.categories (id, couple_id),
  unique (item_id, revision_number),
  unique (id, couple_id)
);

create table public.item_responses (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  member_id uuid not null,
  interest public.interest,
  is_favorite boolean not null default false,
  roulette_decision public.roulette_decision not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_responses_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint item_responses_member_fkey foreign key (member_id, couple_id)
    references public.members (id, couple_id),
  unique (item_id, member_id),
  unique (id, couple_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  author_member_id uuid not null,
  body text not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint comments_body_check check (
    body = btrim(body)
    and char_length(body) between 1 and 2000
  ),
  constraint comments_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint comments_author_fkey foreign key (author_member_id, couple_id)
    references public.members (id, couple_id),
  unique (author_member_id, request_id),
  unique (id, couple_id)
);

create table public.roulette_draws (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  drawn_by_member_id uuid not null,
  filter_category_id uuid,
  outcome public.draw_outcome not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint roulette_draws_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint roulette_draws_actor_fkey foreign key (drawn_by_member_id, couple_id)
    references public.members (id, couple_id),
  constraint roulette_draws_filter_category_fkey foreign key (filter_category_id, couple_id)
    references public.categories (id, couple_id),
  unique (drawn_by_member_id, request_id),
  unique (id, couple_id)
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  draw_id uuid,
  author_member_id uuid not null,
  body text not null,
  highlight text,
  next_time public.memory_next_time,
  refinement text,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint memories_body_check check (
    body = btrim(body)
    and char_length(body) between 1 and 4000
  ),
  constraint memories_highlight_check check (
    highlight is null
    or (highlight = btrim(highlight) and char_length(highlight) between 1 and 1000)
  ),
  constraint memories_refinement_check check (
    refinement is null
    or (refinement = btrim(refinement) and char_length(refinement) between 1 and 1000)
  ),
  constraint memories_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint memories_draw_fkey foreign key (draw_id, couple_id)
    references public.roulette_draws (id, couple_id),
  constraint memories_author_fkey foreign key (author_member_id, couple_id)
    references public.members (id, couple_id),
  unique (author_member_id, request_id),
  unique (id, couple_id)
);

alter table public.items
  add constraint items_source_memory_fkey foreign key (source_memory_id, couple_id)
  references public.memories (id, couple_id);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  actor_member_id uuid not null,
  event_type public.activity_event_type not null,
  item_id uuid,
  comment_id uuid,
  draw_id uuid,
  memory_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and not (metadata ?| array[
      'title', 'description', 'body', 'highlight', 'refinement',
      'email', 'password', 'secret', 'token'
    ])
  ),
  constraint activity_events_actor_fkey foreign key (actor_member_id, couple_id)
    references public.members (id, couple_id),
  constraint activity_events_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id),
  constraint activity_events_comment_fkey foreign key (comment_id, couple_id)
    references public.comments (id, couple_id),
  constraint activity_events_draw_fkey foreign key (draw_id, couple_id)
    references public.roulette_draws (id, couple_id),
  constraint activity_events_memory_fkey foreign key (memory_id, couple_id)
    references public.memories (id, couple_id),
  unique (id, couple_id)
);

create index members_couple_id_idx on public.members (couple_id);
create index categories_couple_id_idx on public.categories (couple_id);
create index items_couple_id_idx on public.items (couple_id);
create index items_category_id_idx on public.items (category_id);
create index items_source_item_id_idx on public.items (source_item_id)
  where source_item_id is not null;
create index items_source_memory_id_idx on public.items (source_memory_id)
  where source_memory_id is not null;
create index item_revisions_couple_id_idx on public.item_revisions (couple_id);
create index item_revisions_editor_member_id_idx
  on public.item_revisions (editor_member_id);
create index item_revisions_category_id_idx on public.item_revisions (category_id);
create index item_responses_couple_id_idx on public.item_responses (couple_id);
create index item_responses_member_id_idx on public.item_responses (member_id);
create index comments_couple_id_idx on public.comments (couple_id);
create index comments_item_id_idx on public.comments (item_id);
create index roulette_draws_couple_id_idx on public.roulette_draws (couple_id);
create index roulette_draws_item_id_idx on public.roulette_draws (item_id);
create index roulette_draws_filter_category_id_idx
  on public.roulette_draws (filter_category_id)
  where filter_category_id is not null;
create index memories_couple_id_idx on public.memories (couple_id);
create index memories_item_id_idx on public.memories (item_id);
create index memories_draw_id_idx on public.memories (draw_id)
  where draw_id is not null;
create index activity_events_couple_id_idx on public.activity_events (couple_id);
create index activity_events_actor_member_id_idx
  on public.activity_events (actor_member_id);
create index activity_events_item_id_idx on public.activity_events (item_id)
  where item_id is not null;
create index activity_events_comment_id_idx on public.activity_events (comment_id)
  where comment_id is not null;
create index activity_events_draw_id_idx on public.activity_events (draw_id)
  where draw_id is not null;
create index activity_events_memory_id_idx on public.activity_events (memory_id)
  where memory_id is not null;

create index items_library_updated_idx
  on public.items (couple_id, updated_at desc)
  where archived_at is null;
create index item_responses_eligibility_idx
  on public.item_responses (couple_id, item_id, roulette_decision);
create index activity_events_feed_idx
  on public.activity_events (couple_id, created_at desc);

alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_revisions enable row level security;
alter table public.item_responses enable row level security;
alter table public.comments enable row level security;
alter table public.roulette_draws enable row level security;
alter table public.memories enable row level security;
alter table public.activity_events enable row level security;

revoke all on table
  public.couples,
  public.members,
  public.categories,
  public.items,
  public.item_revisions,
  public.item_responses,
  public.comments,
  public.roulette_draws,
  public.memories,
  public.activity_events
from anon, authenticated;
