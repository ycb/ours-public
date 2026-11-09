-- QA 8 (2026-10-30): Plan's one pill row filters by category and ♥ Favorites, and the deck must
-- honour both. A favorite of either partner counts. The old one-argument signature is dropped so
-- calls never resolve to an ambiguous overload; draw_roulette(x) still works via the default.

drop function public.draw_roulette(uuid);

create function public.draw_roulette(p_filter_category_id uuid default null, p_favorites_only boolean default false)
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
    -- OU411: the selected category was archived (or is not this couple's).
    raise exception using errcode = 'OU411', message = 'active category in current couple required';
  end if;

  return query
  select i.*
  from public.items as i
  where i.couple_id = actor_couple_id
    and i.status = 'submitted'
    and i.archived_at is null
    and (p_filter_category_id is null or i.category_id = p_filter_category_id)
    and (
      not coalesce(p_favorites_only, false)
      or exists (select 1 from public.item_responses as r where r.item_id = i.id and r.is_favorite)
    )
    and (select count(*) from public.members as m where m.couple_id = actor_couple_id) = 2
    and (select count(*) from public.item_responses as r where r.item_id = i.id) = 2
    and (select count(*) from public.item_responses as r where r.item_id = i.id and r.roulette_decision = 'ready') = 2
  order by random()
  limit 1;
end;
$$;

revoke all on function public.draw_roulette(uuid, boolean) from public, anon, authenticated;
grant execute on function public.draw_roulette(uuid, boolean) to authenticated;
