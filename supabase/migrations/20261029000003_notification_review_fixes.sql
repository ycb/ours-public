-- Task 7D review fixes (independent spec and code-quality reviews, 2026-10-29). Fixes forward
-- from 20261029000001/2, which are committed.
--
-- 1. Enqueue locks the couple and members FOR NO KEY UPDATE, not FOR UPDATE. Every insert's
--    foreign-key check already holds KEY SHARE on those rows; upgrading to FOR UPDATE let two
--    near-simultaneous actions (a reply and an "I'm in") deadlock, failing one person's action.
-- 2. Deleting activity events first locks their deliveries (BEFORE DELETE), so an idea delete
--    waits for a claim in progress instead of deadlocking with the claim's candidate updates.
-- 3. mark_notification_sent / _failed ignore a suppressed delivery (a worker finishing after a
--    stale reclaim found everything seen), instead of failing the suppression check.
-- 4. A recipient with no Auth email is suppressed with the code no_recipient_email at claim,
--    instead of being claimed five times and dying without a code.
-- 5. The due index leaves out deliveries that ran out of attempts.

-- ---------- 1. Enqueue lock modes ----------
create or replace function public.enqueue_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  member_ids uuid[] := array[]::uuid[];
  recipient_id uuid;
  delivery_id uuid;
  is_share boolean := new.event_type in ('item_created', 'item_remixed');
  is_digest boolean := new.event_type in ('item_edited', 'comment_added', 'item_declined', 'item_became_eligible');
begin
  if not (is_share or is_digest) or new.item_id is null then
    return new;
  end if;

  -- NO KEY UPDATE: still serializes enqueues (it conflicts with itself and with membership
  -- updates/deletes) but not with the KEY SHARE locks every foreign-key check already holds.
  perform 1
  from public.couples c
  where c.id = new.couple_id
  for no key update;

  if not found then
    raise exception 'notification couple does not exist';
  end if;

  for member_id in
    select m.id
    from public.members m
    where m.couple_id = new.couple_id
    order by m.id
    for no key update
  loop
    member_ids := pg_catalog.array_append(member_ids, member_id);
  end loop;

  if pg_catalog.cardinality(member_ids) is distinct from 2 then
    raise exception 'notification requires exactly two couple members';
  end if;

  if not (new.actor_member_id = any(member_ids)) then
    raise exception 'notification actor must be a couple member';
  end if;

  recipient_id := case
    when member_ids[1] = new.actor_member_id then member_ids[2]
    else member_ids[1]
  end;

  if is_share then
    insert into public.notification_outbox (couple_id, recipient_member_id, kind, not_before, sealed_at)
    values (new.couple_id, recipient_id, 'idea_shared', new.created_at + interval '5 minutes', pg_catalog.now())
    returning id into delivery_id;
  else
    -- Waits on a claim that holds this row; after it commits, the sealed_at recheck drops the row
    -- and this event opens the next digest instead.
    select o.id into delivery_id
    from public.notification_outbox o
    where o.recipient_member_id = recipient_id
      and o.kind = 'activity_digest'
      and o.sealed_at is null
    for update;

    if delivery_id is null then
      insert into public.notification_outbox (couple_id, recipient_member_id, kind, not_before)
      values (new.couple_id, recipient_id, 'activity_digest', new.created_at + interval '1 hour')
      returning id into delivery_id;
    end if;
  end if;

  insert into public.notification_outbox_events (outbox_id, couple_id, activity_event_id)
  values (delivery_id, new.couple_id, new.id);

  return new;
end;
$$;


-- ---------- 2. Deletes lock deliveries before their candidates ----------
create function public.lock_deliveries_before_event_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.notification_outbox o
  where o.id in (
    select l.outbox_id
    from public.notification_outbox_events l
    where l.activity_event_id = old.id
  )
  for update;
  return old;
end;
$$;

revoke all on function public.lock_deliveries_before_event_delete() from public, anon, authenticated;

create trigger activity_events_lock_deliveries_before_delete
before delete on public.activity_events
for each row execute function public.lock_deliveries_before_event_delete();

-- ---------- 3. Late bookkeeping never touches a suppressed delivery ----------
create or replace function public.mark_notification_sent(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set sent_at = pg_catalog.now(), last_error_code = null
  where id = p_id and sent_at is null and suppressed_at is null;
$$;

create or replace function public.mark_notification_failed(p_id uuid, p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set claimed_at = null, last_error_code = p_code
  where id = p_id and sent_at is null and suppressed_at is null;
$$;

-- ---------- 4. Claim: no address is recorded, not retried ----------
create or replace function public.claim_notifications(p_limit integer)
returns table (id uuid, kind public.notification_kind, recipient_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked uuid[];
begin
  select pg_catalog.array_agg(due.id) into picked
  from (
    select o.id
    from public.notification_outbox o
    where o.sent_at is null
      and o.suppressed_at is null
      and o.not_before <= pg_catalog.now()
      and o.attempts < 5
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '10 minutes')
    order by o.not_before, o.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ) due;

  if picked is null then
    return;
  end if;

  -- No address to send to: record it and stop, instead of burning attempts and dying silently.
  update public.notification_outbox o
  set sealed_at = coalesce(o.sealed_at, pg_catalog.now()),
      claimed_at = null,
      suppressed_at = pg_catalog.now(),
      last_error_code = 'no_recipient_email'
  where o.id = any(picked)
    and not exists (
      select 1
      from public.members m
      join auth.users u on u.id = m.auth_user_id
      where m.id = o.recipient_member_id
        and u.email is not null
    );

  -- Seen by the recipient: an exact acknowledgement, never a timestamp inference.
  update public.notification_outbox_events l
  set suppressed_at = pg_catalog.now()
  from public.notification_outbox o
  where o.id = l.outbox_id
    and o.id = any(picked)
    and l.suppressed_at is null
    and exists (
      select 1
      from public.activity_event_acknowledgements a
      where a.activity_event_id = l.activity_event_id
        and a.member_id = o.recipient_member_id
    );

  -- Nothing unseen left (all seen, or the idea was deleted): complete without email.
  update public.notification_outbox o
  set sealed_at = coalesce(o.sealed_at, pg_catalog.now()),
      claimed_at = null,
      suppressed_at = pg_catalog.now()
  where o.id = any(picked)
    and o.suppressed_at is null
    and not exists (
      select 1
      from public.notification_outbox_events l
      where l.outbox_id = o.id
        and l.suppressed_at is null
    );

  return query
  with claimed as (
    update public.notification_outbox o
    set sealed_at = coalesce(o.sealed_at, pg_catalog.now()),
        claimed_at = pg_catalog.now(),
        attempts = o.attempts + 1
    where o.id = any(picked)
      and o.suppressed_at is null
    returning o.id, o.kind, o.recipient_member_id
  )
  select c.id, c.kind, u.email::text
  from claimed c
  join public.members m on m.id = c.recipient_member_id
  join auth.users u on u.id = m.auth_user_id
  where u.email is not null;
end;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.mark_notification_sent(uuid) to service_role;
grant execute on function public.mark_notification_failed(uuid, text) to service_role;

-- ---------- 5. Due index ----------
drop index public.notification_outbox_due_idx;
create index notification_outbox_due_idx
  on public.notification_outbox (not_before)
  where sent_at is null and suppressed_at is null and attempts < 5;
