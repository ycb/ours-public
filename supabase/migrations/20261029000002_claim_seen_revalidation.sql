-- Task 7D.3: revalidate seen state when claiming.
--
-- Immediately before a delivery is handed to the worker, every candidate the recipient has
-- acknowledged (an exact activity_event_acknowledgements row for that event and recipient) is
-- timestamped suppressed. A delivery with no unsuppressed candidate left is itself suppressed and
-- never returned. The check reruns on every claim, including retries, so a retry only ever covers
-- less. The race between this check and SMTP acceptance is accepted (see the cadence design).
--
-- Fixes forward from 20261029000001, which is committed. The return shape is unchanged.

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
grant execute on function public.claim_notifications(integer) to service_role;
