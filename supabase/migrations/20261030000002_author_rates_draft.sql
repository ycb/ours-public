-- QA (Peter, 2026-10-30): the author can say how into an idea they are while writing it,
-- before sharing. set_item_interest now also accepts the caller's own draft. The partner still
-- cannot touch a draft, favorites and decisions still wait for submission, and a draft rating
-- records no activity. Fixes forward; signature and grants are unchanged.

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
  -- The author may rate their own draft before sharing; anyone else waits for submission.
  -- (record_response_activity records nothing for a draft, so this stays private.)
  if not exists (
    select 1 from public.items as i
    where i.id = p_item_id
      and (i.status = 'submitted' or i.creator_member_id = actor.id)
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
