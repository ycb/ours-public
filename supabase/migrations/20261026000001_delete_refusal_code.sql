-- Give delete_item's dependency refusal its own SQLSTATE so the browser can explain it
-- without reading error message text (the UI only carries content-free error codes).
create or replace function public.delete_item(p_item_id uuid)
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
    raise exception using
      errcode = 'OU423',
      message = 'item has memories, draws, or remixes; archive it instead';
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

revoke all on function public.delete_item(uuid) from public, anon, authenticated;
grant execute on function public.delete_item(uuid) to authenticated;
