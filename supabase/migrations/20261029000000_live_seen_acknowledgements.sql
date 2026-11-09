-- A live acknowledgement is an exact event/member fact, not a timestamp inference.
create table public.activity_event_acknowledgements (
  couple_id uuid not null references public.couples (id),
  activity_event_id uuid not null,
  member_id uuid not null,
  acknowledged_at timestamptz not null default clock_timestamp(),
  primary key (activity_event_id, member_id),
  constraint activity_event_ack_event_fkey foreign key (activity_event_id, couple_id)
    references public.activity_events (id, couple_id) on delete cascade,
  constraint activity_event_ack_member_fkey foreign key (member_id, couple_id)
    references public.members (id, couple_id) on delete cascade
);
create index activity_event_ack_member_id_idx
  on public.activity_event_acknowledgements (member_id);
create index activity_event_ack_couple_id_idx
  on public.activity_event_acknowledgements (couple_id);
alter table public.activity_event_acknowledgements enable row level security;
revoke all on table public.activity_event_acknowledgements from public, anon, authenticated;

create function public.mark_item_seen_through_events(
  p_item_id uuid,
  p_activity_event_ids uuid[]
)
returns public.item_views
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  viewed_at timestamptz;
  supplied_count integer;
  matched_count integer;
  result public.item_views;
begin
  supplied_count := coalesce(cardinality(p_activity_event_ids), 0);
  if supplied_count = 0 then raise exception 'activity events required'; end if;
  if supplied_count <> (
    select count(distinct supplied.id)
    from unnest(p_activity_event_ids) as supplied(id)
  ) then
    raise exception 'unique activity events required';
  end if;

  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform 1 from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
    and (i.status = 'submitted' or i.creator_member_id = actor.id);
  if not found then raise exception 'visible item required'; end if;

  select count(*)
  into matched_count
  from public.activity_events as e
  where e.id = any(p_activity_event_ids)
    and e.item_id = p_item_id
    and e.couple_id = actor.couple_id;
  if matched_count <> supplied_count then raise exception 'visible activity events required'; end if;

  insert into public.activity_event_acknowledgements (couple_id, activity_event_id, member_id)
  select actor.couple_id, e.id, actor.id
  from public.activity_events as e
  where e.id = any(p_activity_event_ids)
    and e.item_id = p_item_id
    and e.couple_id = actor.couple_id
  on conflict (activity_event_id, member_id) do nothing;

  viewed_at := clock_timestamp();
  insert into public.item_views (couple_id, item_id, member_id, first_seen_at, last_seen_at)
  values (actor.couple_id, p_item_id, actor.id, viewed_at, viewed_at)
  on conflict (item_id, member_id) do update
    set last_seen_at = greatest(public.item_views.last_seen_at, excluded.last_seen_at)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.mark_item_seen_through_events(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_item_seen_through_events(uuid, uuid[]) to authenticated;
