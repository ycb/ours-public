-- QA 2026-11-03 (answers v3, decided with Peter):
-- 1. Both people answer the same way. The author starts In (sharing) and can change to Later or
--    Not for us after talking. decline_item already allowed the author; the app now offers it.
-- 2. Later is mutual: an idea is in Later only when both answers are Later (derived in the app).
--    Ideas that are in Later today were parked by one person under the old rule; both answers
--    become Later so they stay where they are.
-- 3. Not for us (pass_item): either person, with an optional note; it archives the idea.
-- 4. Edits: only a description change asks the other person again. Title and category edits keep
--    both answers.

create or replace function public.update_item(
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
  description_changed boolean;
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

  description_changed := result.description is distinct from p_description;

  update public.items as i
  set title = p_title, description = p_description, category_id = p_category_id
  where i.id = result.id
  returning i.* into result;

  if result.status = 'submitted' and description_changed then
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

create function public.pass_item(p_request_id uuid, p_item_id uuid, p_note text)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  note text := pg_catalog.btrim(coalesce(p_note, ''));
  result public.items;
  note_comment public.comments;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('add_comment:' || actor.id::text || ':' || p_request_id::text, 0)
  );

  select i.* into result
  from public.items as i
  where i.id = p_item_id and i.couple_id = actor.couple_id and i.status = 'submitted'
  for no key update;
  if not found then raise exception 'submitted item required'; end if;

  -- Already passed (a retry, or the other person got there first): nothing more to do.
  if result.archived_at is not null then return result; end if;

  if note <> '' then
    insert into public.comments (couple_id, item_id, author_member_id, body, request_id)
    values (actor.couple_id, p_item_id, actor.id, note, p_request_id)
    on conflict (author_member_id, request_id) do nothing
    returning * into note_comment;
  end if;

  update public.items as i
  set archived_at = clock_timestamp()
  where i.id = result.id
  returning i.* into result;

  insert into public.activity_events (couple_id, actor_member_id, event_type, item_id, comment_id)
  values (actor.couple_id, actor.id, 'item_passed', p_item_id, note_comment.id);
  return result;
end;
$$;

revoke all on function public.pass_item(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pass_item(uuid, uuid, text) to authenticated;

-- Keep today's Later ideas in Later under the mutual rule.
do $$
begin
  perform pg_catalog.set_config('ours.suppress_activity', 'on', true);
  update public.item_responses as r
  set roulette_decision = 'not_now'
  from public.items as i
  where i.id = r.item_id
    and i.status = 'submitted'
    and i.archived_at is null
    and r.roulette_decision <> 'not_now'
    and exists (
      select 1 from public.item_responses as other
      where other.item_id = r.item_id and other.roulette_decision = 'not_now'
    );
  perform pg_catalog.set_config('ours.suppress_activity', 'off', true);
end;
$$;
