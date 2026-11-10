-- Interaction model v2: lifecycle for shared items.
-- private drafts, submit = author Ready, co-editing with review reset and stale-save
-- protection, Not now with a required reason, per-member seen state, author delete.

-- ---------- Types and columns ----------
create type public.item_status as enum ('draft', 'submitted');
create type public.comment_kind as enum ('message', 'not_now_reason');
alter type public.activity_event_type add value if not exists 'item_declined';

-- Existing rows (and direct fixture inserts) are submitted; create_item writes drafts explicitly.
alter table public.items
  add column status public.item_status not null default 'submitted',
  add column submitted_at timestamptz;
update public.items set submitted_at = created_at where submitted_at is null;
alter table public.items
  add constraint items_status_submitted_at_check check (
    (status = 'draft' and submitted_at is null)
    or (status = 'submitted' and submitted_at is not null)
  );
alter table public.items alter column submitted_at set default null;

-- Fixtures that insert submitted rows directly get submitted_at automatically.
create function public.item_default_submitted_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := new.created_at;
  end if;
  return new;
end;
$$;
create trigger items_default_submitted_at
before insert on public.items
for each row execute function public.item_default_submitted_at();

alter table public.comments
  add column kind public.comment_kind not null default 'message';

create table public.item_views (
  couple_id uuid not null references public.couples (id),
  item_id uuid not null,
  member_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (item_id, member_id),
  constraint item_views_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id) on delete cascade,
  constraint item_views_member_fkey foreign key (member_id, couple_id)
    references public.members (id, couple_id)
);
create index item_views_member_id_idx on public.item_views (member_id);
create index item_views_couple_id_idx on public.item_views (couple_id);
alter table public.item_views enable row level security;
revoke all on table public.item_views from public, anon, authenticated;
grant select on table public.item_views to authenticated;

-- ---------- Visibility: drafts belong to their author ----------
create function public.can_read_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.items as i
    where i.id = target_item_id
      and public.is_current_couple(i.couple_id)
      and (i.status = 'submitted' or i.creator_member_id = public.current_member_id())
  );
$$;

drop policy items_select_current on public.items;
create policy items_select_current
on public.items for select to authenticated
using (
  public.is_current_couple(couple_id)
  and (status = 'submitted' or creator_member_id = (select public.current_member_id()))
);

drop policy item_revisions_select_current on public.item_revisions;
create policy item_revisions_select_current
on public.item_revisions for select to authenticated
using (public.is_current_couple(couple_id) and public.can_read_item(item_id));

drop policy item_responses_select_current on public.item_responses;
create policy item_responses_select_current
on public.item_responses for select to authenticated
using (public.is_current_couple(couple_id) and public.can_read_item(item_id));

drop policy comments_select_current on public.comments;
create policy comments_select_current
on public.comments for select to authenticated
using (public.is_current_couple(couple_id) and public.can_read_item(item_id));

drop policy activity_events_select_current on public.activity_events;
create policy activity_events_select_current
on public.activity_events for select to authenticated
using (
  public.is_current_couple(couple_id)
  and (item_id is null or public.can_read_item(item_id))
);

create policy item_views_select_own
on public.item_views for select to authenticated
using (member_id = (select public.current_member_id()));

-- ---------- Triggers ----------
-- Adds lifecycle immutability: no return to draft; submitted_at fixed once set.
create or replace function public.item_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_member_id uuid;
  next_revision_number integer;
  content_changed boolean;
  library_state_changed boolean;
begin
  if new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.creator_member_id is distinct from old.creator_member_id
    or new.source_item_id is distinct from old.source_item_id
    or new.source_memory_id is distinct from old.source_memory_id
    or new.request_id is distinct from old.request_id
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable item identity cannot be changed';
  end if;

  if old.status = 'submitted' and new.status = 'draft' then
    raise exception 'submitted items cannot return to draft';
  end if;
  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'submitted_at cannot be changed';
  end if;

  content_changed := row(new.title, new.description, new.category_id)
    is distinct from row(old.title, old.description, old.category_id);
  library_state_changed := content_changed
    or new.archived_at is distinct from old.archived_at
    or new.status is distinct from old.status;

  if library_state_changed then
    select m.id
    into authenticated_member_id
    from public.members as m
    where m.auth_user_id = auth.uid()
      and m.couple_id = old.couple_id;

    if authenticated_member_id is null then
      raise exception 'authenticated couple member required';
    end if;

    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  if content_changed then
    select coalesce(max(r.revision_number), 0) + 1
    into next_revision_number
    from public.item_revisions as r
    where r.item_id = old.id;

    insert into public.item_revisions (
      couple_id, item_id, revision_number, editor_member_id, title, description, category_id
    ) values (
      old.couple_id, old.id, next_revision_number, authenticated_member_id,
      new.title, new.description, new.category_id
    );
  end if;

  return new;
end;
$$;

-- Drafts record no activity. Submission records the item's creation (or remix) event.
create or replace function public.record_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creation_event public.activity_event_type;
begin
  creation_event := case
    when new.source_item_id is not null or new.source_memory_id is not null
      then 'item_remixed'::public.activity_event_type
    else 'item_created'::public.activity_event_type
  end;

  if tg_op = 'INSERT' then
    if new.status = 'submitted' then
      insert into public.activity_events (couple_id, actor_member_id, event_type, item_id)
      values (new.couple_id, new.creator_member_id, creation_event, new.id);
    end if;
  elsif old.status = 'draft' and new.status = 'submitted' then
    insert into public.activity_events (couple_id, actor_member_id, event_type, item_id)
    values (new.couple_id, new.creator_member_id, creation_event, new.id);
  elsif new.status = 'submitted'
    and row(new.title, new.description, new.category_id)
      is distinct from row(old.title, old.description, old.category_id) then
    insert into public.activity_events (couple_id, actor_member_id, event_type, item_id)
    values (new.couple_id, public.current_member_id(), 'item_edited', new.id);
  end if;
  return new;
end;
$$;

-- Functions set ours.suppress_activity when they record one combined event themselves.
create or replace function public.record_response_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.activity_event_type;
begin
  if coalesce(current_setting('ours.suppress_activity', true), '') = 'on' then
    return new;
  end if;
  if not exists (
    select 1 from public.items as i where i.id = new.item_id and i.status = 'submitted'
  ) then
    return new;
  end if;

  if new.roulette_decision is distinct from old.roulette_decision then
    if new.roulette_decision = 'ready'
      and exists (
        select 1 from public.items as i
        where i.id = new.item_id and i.archived_at is null
      )
      and (
        select count(*) from public.item_responses as r
        where r.item_id = new.item_id and r.roulette_decision = 'ready'
      ) = 2 then
      selected_event := 'item_became_eligible';
    else
      selected_event := 'roulette_decision_changed';
    end if;
  elsif row(new.interest, new.is_favorite)
    is distinct from row(old.interest, old.is_favorite) then
    selected_event := 'response_changed';
  else
    return new;
  end if;

  insert into public.activity_events (couple_id, actor_member_id, event_type, item_id)
  values (new.couple_id, new.member_id, selected_event, new.item_id);
  return new;
end;
$$;

create or replace function public.record_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ours.suppress_activity', true), '') = 'on' then
    return new;
  end if;
  insert into public.activity_events (couple_id, actor_member_id, event_type, item_id, comment_id)
  values (new.couple_id, new.author_member_id, 'comment_added', new.item_id, new.id);
  return new;
end;
$$;

-- Revisions stay immutable, except inside delete_item's purge.
create or replace function public.reject_item_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('ours.allow_item_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'item revisions are immutable';
end;
$$;

-- ---------- Write functions ----------
-- create_item: writes a draft; a remix source must be visible to the caller.
create or replace function public.create_item(
  p_request_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_source_item_id uuid default null,
  p_source_memory_id uuid default null
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
  source_memory_item_id uuid;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then
    raise exception 'authenticated member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('create_item:' || actor.id::text || ':' || p_request_id::text, 0)
  );

  select i.* into result
  from public.items as i
  where i.creator_member_id = actor.id and i.request_id = p_request_id;
  if found then
    return result;
  end if;

  if not exists (
    select 1 from public.categories as c
    where c.id = p_category_id and c.couple_id = actor.couple_id and c.archived_at is null
  ) then
    raise exception 'active category in current couple required';
  end if;

  if p_source_item_id is not null and not exists (
    select 1 from public.items as i
    where i.id = p_source_item_id
      and i.couple_id = actor.couple_id
      and (i.status = 'submitted' or i.creator_member_id = actor.id)
  ) then
    raise exception 'source item in current couple required';
  end if;

  if p_source_memory_id is not null then
    select m.item_id into source_memory_item_id
    from public.memories as m
    where m.id = p_source_memory_id and m.couple_id = actor.couple_id;
    if not found then
      raise exception 'source memory in current couple required';
    end if;
    if p_source_item_id is not null and source_memory_item_id is distinct from p_source_item_id then
      raise exception 'source memory must belong to source item';
    end if;
  end if;

  insert into public.items (
    couple_id, creator_member_id, category_id, source_item_id,
    source_memory_id, request_id, title, description, status, submitted_at
  ) values (
    actor.couple_id, actor.id, p_category_id, p_source_item_id,
    p_source_memory_id, p_request_id, p_title, p_description, 'draft', null
  )
  on conflict (creator_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select i.* into result
    from public.items as i
    where i.creator_member_id = actor.id and i.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.submit_item(p_item_id uuid)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  select i.* into result
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id and i.creator_member_id = actor.id
  for update;
  if not found then raise exception 'item author required'; end if;
  if result.archived_at is not null then raise exception 'archived items cannot be submitted'; end if;
  if result.status = 'submitted' then return result; end if;

  -- Submitting is the author's Ready. The submission event below stands for both changes.
  perform pg_catalog.set_config('ours.suppress_activity', 'on', true);
  update public.item_responses as r
  set roulette_decision = 'ready'
  where r.item_id = result.id and r.member_id = actor.id;
  perform pg_catalog.set_config('ours.suppress_activity', 'off', true);

  update public.items as i
  set status = 'submitted', submitted_at = clock_timestamp()
  where i.id = result.id
  returning i.* into result;
  return result;
end;
$$;

-- update_item: co-editing. Drafts: author only. Submitted: either partner. A meaningful
-- change returns the other partner's decision to pending ("Ready applies to a version").
drop function public.update_item(uuid, text, text, uuid);
create function public.update_item(
  p_item_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_expected_updated_at timestamptz default null
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  select i.* into result
  from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
    and (i.status = 'submitted' or i.creator_member_id = actor.id)
  for update;
  if not found then raise exception 'item in current couple required'; end if;
  if result.archived_at is not null then raise exception 'archived items cannot be edited'; end if;

  if p_expected_updated_at is not null and result.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'OU409', message = 'item changed since it was opened';
  end if;

  if row(result.title, result.description, result.category_id)
    is not distinct from row(p_title, p_description, p_category_id) then
    return result;
  end if;

  if not exists (
    select 1 from public.categories as c
    where c.id = p_category_id and c.couple_id = actor.couple_id and c.archived_at is null
  ) then
    raise exception 'active category in current couple required';
  end if;

  update public.items as i
  set title = p_title, description = p_description, category_id = p_category_id
  where i.id = result.id
  returning i.* into result;

  if result.status = 'submitted' then
    -- The item_edited event stands for this reset; don't attribute a decision change to the partner.
    perform pg_catalog.set_config('ours.suppress_activity', 'on', true);
    update public.item_responses as r
    set roulette_decision = 'pending'
    where r.item_id = result.id
      and r.member_id <> actor.id
      and r.roulette_decision <> 'pending';
    perform pg_catalog.set_config('ours.suppress_activity', 'off', true);
  end if;

  return result;
end;
$$;

-- Response setters and comments require a submitted item.
create or replace function public.set_item_interest(p_item_id uuid, p_interest public.interest)
returns public.item_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.item_responses;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.couple_id = actor.couple_id
  ) then
    raise exception 'owned item response required';
  end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.status = 'submitted'
  ) then
    raise exception 'submitted item required';
  end if;

  update public.item_responses as r
  set interest = p_interest
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id
    and r.interest is distinct from p_interest
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

create or replace function public.set_item_favorite(p_item_id uuid, p_favorite boolean)
returns public.item_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.item_responses;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.couple_id = actor.couple_id
  ) then
    raise exception 'owned item response required';
  end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.status = 'submitted'
  ) then
    raise exception 'submitted item required';
  end if;

  update public.item_responses as r
  set is_favorite = p_favorite
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id
    and r.is_favorite is distinct from p_favorite
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

-- Ready / pending only; Not now goes through decline_item with a reason.
create or replace function public.set_roulette_decision(
  p_item_id uuid,
  p_decision public.roulette_decision
)
returns public.item_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.item_responses;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;
  if p_decision = 'not_now' then raise exception 'not now requires a reason'; end if;

  perform 1
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id
  for update;
  if not found then raise exception 'owned item response required'; end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.status = 'submitted'
  ) then
    raise exception 'submitted item required';
  end if;

  update public.item_responses as r
  set roulette_decision = p_decision
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id
    and r.roulette_decision is distinct from p_decision
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

create function public.decline_item(p_request_id uuid, p_item_id uuid, p_reason text)
returns public.item_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  result public.item_responses;
  reason_comment public.comments;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('add_comment:' || actor.id::text || ':' || p_request_id::text, 0)
  );

  -- Idempotent retry: the reason already posted for this request wins.
  select c.* into reason_comment from public.comments as c
  where c.author_member_id = actor.id and c.request_id = p_request_id;
  if found then
    select r.* into result from public.item_responses as r
    where r.item_id = reason_comment.item_id and r.member_id = actor.id;
    return result;
  end if;

  if reason = '' then raise exception 'a reason is required'; end if;

  perform 1
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id
    and i.status = 'submitted' and i.archived_at is null
  for update;
  if not found then raise exception 'submitted item required'; end if;

  perform pg_catalog.set_config('ours.suppress_activity', 'on', true);
  update public.item_responses as r
  set roulette_decision = 'not_now'
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id
  returning r.* into result;
  if result.id is null then raise exception 'owned item response required'; end if;

  insert into public.comments (couple_id, item_id, author_member_id, body, request_id, kind)
  values (actor.couple_id, p_item_id, actor.id, reason, p_request_id, 'not_now_reason')
  returning * into reason_comment;
  perform pg_catalog.set_config('ours.suppress_activity', 'off', true);

  insert into public.activity_events (couple_id, actor_member_id, event_type, item_id, comment_id)
  values (actor.couple_id, actor.id, 'item_declined', p_item_id, reason_comment.id);
  return result;
end;
$$;

create or replace function public.add_comment(p_request_id uuid, p_item_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.comments;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('add_comment:' || actor.id::text || ':' || p_request_id::text, 0)
  );

  select c.* into result from public.comments as c
  where c.author_member_id = actor.id and c.request_id = p_request_id;
  if found then return result; end if;

  if not exists (
    select 1 from public.items as i
    where i.id = p_item_id and i.couple_id = actor.couple_id
  ) then
    raise exception 'item in current couple required';
  end if;
  if not exists (
    select 1 from public.items as i where i.id = p_item_id and i.status = 'submitted'
  ) then
    raise exception 'submitted item required';
  end if;

  insert into public.comments (couple_id, item_id, author_member_id, body, request_id)
  values (actor.couple_id, p_item_id, actor.id, p_body, p_request_id)
  on conflict (author_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select c.* into result from public.comments as c
    where c.author_member_id = actor.id and c.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.mark_item_seen(p_item_id uuid)
returns public.item_views
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  target public.items;
  result public.item_views;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  select i.* into target from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
    and (i.status = 'submitted' or i.creator_member_id = actor.id);
  if not found then raise exception 'visible item required'; end if;

  insert into public.item_views (couple_id, item_id, member_id, first_seen_at, last_seen_at)
  values (actor.couple_id, p_item_id, actor.id, clock_timestamp(), clock_timestamp())
  on conflict (item_id, member_id) do update set last_seen_at = clock_timestamp()
  returning * into result;
  return result;
end;
$$;

create function public.delete_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  target public.items;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  select i.* into target from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id and i.creator_member_id = actor.id
  for update;
  if not found then raise exception 'item author required'; end if;

  if exists (select 1 from public.memories as m where m.item_id = target.id)
    or exists (select 1 from public.roulette_draws as d where d.item_id = target.id)
    or exists (select 1 from public.items as i where i.source_item_id = target.id) then
    raise exception 'item has memories, draws, or remixes; archive it instead';
  end if;

  perform pg_catalog.set_config('ours.allow_item_purge', 'on', true);
  delete from public.activity_events as e where e.item_id = target.id;
  delete from public.comments as c where c.item_id = target.id;
  delete from public.item_views as v where v.item_id = target.id;
  delete from public.item_responses as r where r.item_id = target.id;
  delete from public.item_revisions as r where r.item_id = target.id;
  delete from public.items as i where i.id = target.id;
  perform pg_catalog.set_config('ours.allow_item_purge', 'off', true);
  return true;
end;
$$;

-- ---------- Privileges ----------
revoke all on function public.item_default_submitted_at() from public, anon, authenticated;
revoke all on function public.can_read_item(uuid) from public, anon, authenticated;
revoke all on function public.submit_item(uuid) from public, anon, authenticated;
revoke all on function public.update_item(uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.decline_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_item_seen(uuid) from public, anon, authenticated;
revoke all on function public.delete_item(uuid) from public, anon, authenticated;

-- can_read_item runs inside RLS policies, so the browser role needs execute on it.
grant execute on function public.can_read_item(uuid) to authenticated;
grant execute on function public.submit_item(uuid) to authenticated;
grant execute on function public.update_item(uuid, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.decline_item(uuid, uuid, text) to authenticated;
grant execute on function public.mark_item_seen(uuid) to authenticated;
grant execute on function public.delete_item(uuid) to authenticated;
