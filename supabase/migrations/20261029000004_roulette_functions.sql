create function public.draw_roulette(p_filter_category_id uuid default null)
returns setof public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_member_id();
  actor_couple_id uuid;
begin
  select m.couple_id into actor_couple_id
  from public.members as m
  where m.id = actor_id;

  if actor_couple_id is null then
    raise exception 'authenticated member required';
  end if;

  if p_filter_category_id is not null and not exists (
    select 1 from public.categories as c
    where c.id = p_filter_category_id
      and c.couple_id = actor_couple_id
      and c.archived_at is null
  ) then
    raise exception 'active category in current couple required';
  end if;

  return query
  select i.*
  from public.items as i
  where i.couple_id = actor_couple_id
    and i.status = 'submitted'
    and i.archived_at is null
    and (p_filter_category_id is null or i.category_id = p_filter_category_id)
    and (select count(*) from public.members as m where m.couple_id = actor_couple_id) = 2
    and (select count(*) from public.item_responses as r where r.item_id = i.id) = 2
    and (select count(*) from public.item_responses as r where r.item_id = i.id and r.roulette_decision = 'ready') = 2
  order by random()
  limit 1;
end;
$$;

create function public.record_roulette_outcome(
  p_request_id uuid,
  p_item_id uuid,
  p_filter_category_id uuid,
  p_outcome public.draw_outcome
)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_member_id();
  actor_couple_id uuid;
  target public.items;
  existing public.roulette_draws;
  inserted public.roulette_draws;
  member_count integer;
  response_count integer;
  ready_count integer;
begin
  select m.couple_id into actor_couple_id
  from public.members as m
  where m.id = actor_id;

  if actor_couple_id is null then
    raise exception 'authenticated member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );

  select d.* into existing
  from public.roulette_draws as d
  where d.drawn_by_member_id = actor_id and d.request_id = p_request_id;
  if found then
    return existing;
  end if;

  select i.* into target
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor_couple_id
  for update;

  if target.id is null or target.status <> 'submitted' or target.archived_at is not null then
    raise exception using errcode = 'OU410', message = 'roulette candidate unavailable';
  end if;

  perform 1 from public.couples as c where c.id = actor_couple_id for update;
  perform 1 from public.members as m where m.couple_id = actor_couple_id order by m.id for update;

  select count(*) into member_count from public.members as m where m.couple_id = actor_couple_id;
  select count(*), count(*) filter (where r.roulette_decision = 'ready')
    into response_count, ready_count
  from public.item_responses as r where r.item_id = target.id;

  if member_count <> 2 or response_count <> 2 or ready_count <> 2 then
    raise exception using errcode = 'OU410', message = 'roulette candidate unavailable';
  end if;

  if p_filter_category_id is not null and (
    target.category_id <> p_filter_category_id
    or not exists (
      select 1 from public.categories as c
      where c.id = p_filter_category_id
        and c.couple_id = actor_couple_id
        and c.archived_at is null
    )
  ) then
    raise exception using errcode = 'OU410', message = 'roulette candidate unavailable';
  end if;

  insert into public.roulette_draws (
    couple_id, item_id, drawn_by_member_id, filter_category_id, outcome, request_id
  ) values (
    actor_couple_id, target.id, actor_id, p_filter_category_id, p_outcome, p_request_id
  ) returning * into inserted;

  insert into public.activity_events (
    couple_id, actor_member_id, event_type, item_id, draw_id
  ) values (
    actor_couple_id,
    actor_id,
    case p_outcome when 'accepted' then 'draw_accepted'::public.activity_event_type else 'draw_deferred'::public.activity_event_type end,
    target.id,
    inserted.id
  );

  return inserted;
end;
$$;

revoke all on function public.draw_roulette(uuid) from public, anon, authenticated;
revoke all on function public.record_roulette_outcome(uuid, uuid, uuid, public.draw_outcome) from public, anon, authenticated;
grant execute on function public.draw_roulette(uuid) to authenticated;
grant execute on function public.record_roulette_outcome(uuid, uuid, uuid, public.draw_outcome) to authenticated;
