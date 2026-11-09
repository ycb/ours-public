-- QA 2026-11-03 (dates and reflections, decided with Peter):
-- 1. A pick becomes a date: an optional when (tonight / weekend / sometime), when to ask how it
--    was (worked out on the phone, in local time), "we did it", "not anymore", and whether it was
--    dealt from the deck or chosen directly (Plan this).
-- 2. A reflection is a memory linked to its date. Two questions: what you enjoyed (body) and what to
--    change (refinement). Either is enough.
-- 3. At most one reminder email per person per date, claimed only by the email sender.

alter table public.roulette_draws
  add column source text not null default 'deck',
  add column planned_when text,
  add column reflect_after timestamptz,
  add column done_at timestamptz,
  add column cancelled_at timestamptz,
  add constraint roulette_draws_source_check check (source in ('deck', 'chosen')),
  add constraint roulette_draws_planned_when_check check (planned_when in ('tonight', 'weekend', 'sometime')),
  add constraint roulette_draws_open_check check (done_at is null or cancelled_at is null);

alter table public.memories drop constraint memories_body_check;
alter table public.memories add constraint memories_body_check check (
  body = btrim(body)
  and char_length(body) <= 4000
  and (char_length(body) >= 1 or refinement is not null)
);

create function public.date_when_check(p_when text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_when is null or p_when not in ('tonight', 'weekend', 'sometime') then
    raise exception using errcode = '22023', message = 'when must be tonight, weekend or sometime';
  end if;
end;
$$;

-- An open date of the caller's couple: accepted, not done, not called off.
create function public.open_date_for_actor(p_draw_id uuid)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.roulette_draws;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;
  select d.* into result from public.roulette_draws as d
  where d.id = p_draw_id and d.couple_id = actor.couple_id and d.outcome = 'accepted'
    and d.done_at is null and d.cancelled_at is null
  for no key update;
  if not found then raise exception 'open date required'; end if;
  return result;
end;
$$;

-- Plan this: choose an agreed idea directly, with the same checks as a dealt pick.
create function public.plan_item(p_request_id uuid, p_item_id uuid, p_when text, p_reflect_after timestamptz)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked public.roulette_draws;
begin
  perform public.date_when_check(p_when);
  select * into picked from public.record_roulette_outcome(p_request_id, p_item_id, null, 'accepted');
  if picked.done_at is not null or picked.cancelled_at is not null then return picked; end if;
  update public.roulette_draws as d
  set source = 'chosen',
      planned_when = p_when,
      reflect_after = case when p_when = 'sometime' then null else p_reflect_after end
  where d.id = picked.id
  returning d.* into picked;
  return picked;
end;
$$;

create function public.set_draw_when(p_draw_id uuid, p_when text, p_reflect_after timestamptz)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.roulette_draws;
begin
  perform public.date_when_check(p_when);
  perform public.open_date_for_actor(p_draw_id);
  update public.roulette_draws as d
  set planned_when = p_when,
      reflect_after = case when p_when = 'sometime' then null else p_reflect_after end
  where d.id = p_draw_id
  returning d.* into result;
  return result;
end;
$$;

create function public.mark_draw_done(p_draw_id uuid)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.roulette_draws;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;
  update public.roulette_draws as d
  set done_at = coalesce(d.done_at, pg_catalog.now())
  where d.id = p_draw_id and d.couple_id = actor.couple_id and d.outcome = 'accepted' and d.cancelled_at is null
  returning d.* into result;
  if result.id is null then raise exception 'open date required'; end if;
  return result;
end;
$$;

create function public.cancel_draw(p_draw_id uuid)
returns public.roulette_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.roulette_draws;
begin
  perform public.open_date_for_actor(p_draw_id);
  update public.roulette_draws as d
  set cancelled_at = pg_catalog.now()
  where d.id = p_draw_id
  returning d.* into result;
  return result;
end;
$$;

-- ---------- Reflection reminders (one per person per date) ----------
create table public.reflection_reminders (
  draw_id uuid not null,
  member_id uuid not null,
  couple_id uuid not null references public.couples (id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  suppressed_at timestamptz,
  attempts integer not null default 0,
  last_error_code text,
  primary key (draw_id, member_id),
  constraint reflection_reminders_draw_fkey foreign key (draw_id, couple_id)
    references public.roulette_draws (id, couple_id) on delete cascade,
  constraint reflection_reminders_member_fkey foreign key (member_id, couple_id)
    references public.members (id, couple_id),
  constraint reflection_reminders_attempts_check check (attempts between 0 and 100),
  constraint reflection_reminders_error_code_check check (
    last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,40}$'
  )
);
alter table public.reflection_reminders enable row level security;
revoke all on table public.reflection_reminders from public, anon, authenticated;
create index reflection_reminders_couple_id_idx on public.reflection_reminders (couple_id);
create index reflection_reminders_member_id_idx on public.reflection_reminders (member_id, couple_id);

create function public.claim_reflection_reminders(p_limit integer)
returns table (draw_id uuid, member_id uuid, recipient_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked text[];
begin
  -- Due: an accepted, not-called-off date whose ask-time has passed (reflect_after, or 12 hours
  -- after "we did it"), for each partner who hasn't reflected on it yet.
  insert into public.reflection_reminders (draw_id, member_id, couple_id)
  select d.id, m.id, d.couple_id
  from public.roulette_draws as d
  join public.members as m on m.couple_id = d.couple_id
  where d.outcome = 'accepted'
    and d.cancelled_at is null
    and coalesce(d.reflect_after, d.done_at + interval '12 hours') <= pg_catalog.now()
    and coalesce(d.reflect_after, d.done_at + interval '12 hours') > pg_catalog.now() - interval '14 days'
    and not exists (
      select 1 from public.memories as mem where mem.draw_id = d.id and mem.author_member_id = m.id
    )
  on conflict on constraint reflection_reminders_pkey do nothing;

  -- Reflected (or called off) since: done without email.
  update public.reflection_reminders as r
  set suppressed_at = pg_catalog.now(), claimed_at = null
  where r.sent_at is null and r.suppressed_at is null
    and (
      exists (select 1 from public.memories as mem where mem.draw_id = r.draw_id and mem.author_member_id = r.member_id)
      or exists (select 1 from public.roulette_draws as d where d.id = r.draw_id and d.cancelled_at is not null)
    );

  select pg_catalog.array_agg(due.draw_id::text || ':' || due.member_id::text) into picked
  from (
    select r.draw_id, r.member_id
    from public.reflection_reminders as r
    where r.sent_at is null and r.suppressed_at is null and r.attempts < 5
      and (r.claimed_at is null or r.claimed_at < pg_catalog.now() - interval '10 minutes')
    order by r.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ) as due;
  if picked is null then return; end if;

  return query
  with claimed as (
    update public.reflection_reminders as r
    set claimed_at = pg_catalog.now(), attempts = r.attempts + 1
    where (r.draw_id::text || ':' || r.member_id::text) = any(picked)
    returning r.draw_id, r.member_id
  )
  select c.draw_id, c.member_id, u.email::text
  from claimed as c
  join public.members as m on m.id = c.member_id
  join auth.users as u on u.id = m.auth_user_id;
end;
$$;

create function public.mark_reflection_reminder_sent(p_draw_id uuid, p_member_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reflection_reminders
  set sent_at = coalesce(sent_at, pg_catalog.now()), claimed_at = null
  where draw_id = p_draw_id and member_id = p_member_id and suppressed_at is null;
$$;

create function public.mark_reflection_reminder_failed(p_draw_id uuid, p_member_id uuid, p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reflection_reminders
  set claimed_at = null,
      last_error_code = case when p_code ~ '^[a-z0-9_]{1,40}$' then p_code else 'send_failed' end
  where draw_id = p_draw_id and member_id = p_member_id and sent_at is null and suppressed_at is null;
$$;

revoke all on function public.date_when_check(text) from public, anon, authenticated;
revoke all on function public.open_date_for_actor(uuid) from public, anon, authenticated;
revoke all on function public.plan_item(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_draw_when(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_draw_done(uuid) from public, anon, authenticated;
revoke all on function public.cancel_draw(uuid) from public, anon, authenticated;
revoke all on function public.claim_reflection_reminders(integer) from public, anon, authenticated;
revoke all on function public.mark_reflection_reminder_sent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_reflection_reminder_failed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.plan_item(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.set_draw_when(uuid, text, timestamptz) to authenticated;
grant execute on function public.mark_draw_done(uuid) to authenticated;
grant execute on function public.cancel_draw(uuid) to authenticated;
grant execute on function public.claim_reflection_reminders(integer) to service_role;
grant execute on function public.mark_reflection_reminder_sent(uuid, uuid) to service_role;
grant execute on function public.mark_reflection_reminder_failed(uuid, uuid, text) to service_role;
