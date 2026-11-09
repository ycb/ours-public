-- Task 9: add_memory checked only that the idea was in the caller's couple, so a partner who
-- learned a draft's id could attach a memory to the author's private draft (and learn it exists).
-- A memory now requires a submitted idea. Fixes forward; signature and grants are unchanged.

create or replace function public.add_memory(
  p_request_id uuid,
  p_item_id uuid,
  p_draw_id uuid,
  p_body text,
  p_highlight text,
  p_next_time public.memory_next_time,
  p_refinement text
)
returns public.memories
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.memories;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'add_memory:' || actor.id::text || ':' || p_request_id::text,
      0
    )
  );

  select m.* into result from public.memories as m
  where m.author_member_id = actor.id and m.request_id = p_request_id;
  if found then return result; end if;

  -- A memory belongs to a shared idea. A draft is visible only to its author and has not been
  -- tried together; refusing it with the cross-couple message reveals nothing about its existence.
  if not exists (
    select 1 from public.items as i
    where i.id = p_item_id and i.couple_id = actor.couple_id and i.status = 'submitted'
  ) then
    raise exception 'item in current couple required';
  end if;

  if p_draw_id is not null and not exists (
    select 1 from public.roulette_draws as d
    where d.id = p_draw_id
      and d.couple_id = actor.couple_id
      and d.item_id = p_item_id
      and d.outcome = 'accepted'
  ) then
    raise exception 'accepted draw for current item required';
  end if;

  insert into public.memories (
    couple_id, item_id, draw_id, author_member_id, body,
    highlight, next_time, refinement, request_id
  ) values (
    actor.couple_id, p_item_id, p_draw_id, actor.id, p_body,
    p_highlight, p_next_time, p_refinement, p_request_id
  )
  on conflict (author_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select m.* into result from public.memories as m
    where m.author_member_id = actor.id and m.request_id = p_request_id;
  end if;
  return result;
end;
$$;
