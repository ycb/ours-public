revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

create function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(m.id))[1] end
  from public.members as m
  where m.auth_user_id = (select auth.uid());
$$;

create function public.get_current_member()
returns public.members
language sql
stable
security definer
set search_path = ''
as $$
  select m
  from public.members as m
  where m.auth_user_id = (select auth.uid());
$$;

create function public.is_current_couple(target_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as m
    where m.id = public.current_member_id()
      and m.couple_id = target_couple_id
  );
$$;

revoke all on function public.current_member_id() from public, anon, authenticated;
revoke all on function public.get_current_member() from public, anon, authenticated;
revoke all on function public.is_current_couple(uuid) from public, anon, authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.get_current_member() to authenticated;
grant execute on function public.is_current_couple(uuid) to authenticated;

create policy couples_select_current
on public.couples for select to authenticated
using (public.is_current_couple(id));

create policy members_select_current
on public.members for select to authenticated
using (public.is_current_couple(couple_id));

create policy categories_select_current
on public.categories for select to authenticated
using (public.is_current_couple(couple_id));

create policy items_select_current
on public.items for select to authenticated
using (public.is_current_couple(couple_id));

create policy item_revisions_select_current
on public.item_revisions for select to authenticated
using (public.is_current_couple(couple_id));

create policy item_responses_select_current
on public.item_responses for select to authenticated
using (public.is_current_couple(couple_id));

create policy comments_select_current
on public.comments for select to authenticated
using (public.is_current_couple(couple_id));

create policy roulette_draws_select_current
on public.roulette_draws for select to authenticated
using (public.is_current_couple(couple_id));

create policy memories_select_current
on public.memories for select to authenticated
using (public.is_current_couple(couple_id));

create policy activity_events_select_current
on public.activity_events for select to authenticated
using (public.is_current_couple(couple_id));

grant select on table
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
to authenticated;
