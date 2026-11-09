-- QA (Peter, 2026-10-30): "Not now" becomes Later, part of aligning, and its note is optional.
-- decline_item no longer requires a reason. With one, it is posted as before (a reason-flagged
-- message); without one, nothing is posted and the item_declined event carries no comment. Moving
-- an idea that is already Later with no note again is a no-op. Signature and grants unchanged.

create or replace function public.decline_item(p_request_id uuid, p_item_id uuid, p_reason text)
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

  perform 1
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id
    and i.status = 'submitted' and i.archived_at is null
  for update;
  if not found then raise exception 'submitted item required'; end if;

  -- Already Later: a retry (or a second tap) changes nothing and records nothing.
  select r.* into result from public.item_responses as r
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id;
  if result.id is null then raise exception 'owned item response required'; end if;
  if result.roulette_decision = 'not_now' and reason = '' then return result; end if;

  perform pg_catalog.set_config('ours.suppress_activity', 'on', true);
  update public.item_responses as r
  set roulette_decision = 'not_now'
  where r.item_id = p_item_id and r.member_id = actor.id and r.couple_id = actor.couple_id
  returning r.* into result;
  if result.id is null then raise exception 'owned item response required'; end if;

  -- The note is optional; when there is one it starts the conversation about it.
  if reason <> '' then
    insert into public.comments (couple_id, item_id, author_member_id, body, request_id, kind)
    values (actor.couple_id, p_item_id, actor.id, reason, p_request_id, 'not_now_reason')
    returning * into reason_comment;
  end if;
  perform pg_catalog.set_config('ours.suppress_activity', 'off', true);

  insert into public.activity_events (couple_id, actor_member_id, event_type, item_id, comment_id)
  values (actor.couple_id, actor.id, 'item_declined', p_item_id, reason_comment.id);
  return result;
end;
$$;
