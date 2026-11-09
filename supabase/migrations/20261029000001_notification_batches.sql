-- Task 7D.2: the outbox holds delivery batches, not one row per event.
--
-- A delivery (notification_outbox row) is either a dedicated share (`idea_shared`, due five
-- minutes after the share) or a recipient's rolling digest (`activity_digest`, due one hour after
-- its first event). Which events a delivery covers lives in notification_outbox_events: ids only,
-- never content. A digest accepts events until it is sealed; claiming seals it, so a retry always
-- covers exactly what the first attempt covered, and an event after the seal opens the next digest.
--
-- Locking: every enqueue locks the couple, then its members in id order (unchanged from the
-- hardening migration), then the recipient's open digest FOR UPDATE. A claim locks delivery rows
-- with SKIP LOCKED, so it never waits on an enqueue; an enqueue that waits on a claim rechecks
-- sealed_at after the claim commits and opens a new digest instead of joining a sealed one.

-- ---------- Retire the per-item model ----------
drop trigger activity_events_enqueue_share_notification on public.activity_events;
drop function public.enqueue_share_notification();
-- Its result type names the enum being replaced and it returns item_id; recreated below.
drop function public.claim_notifications(integer);

alter table public.notification_outbox
  add constraint notification_outbox_id_couple_key unique (id, couple_id);

-- ---------- Delivery links ----------
create table public.notification_outbox_events (
  outbox_id uuid not null,
  couple_id uuid not null,
  activity_event_id uuid not null,
  suppressed_at timestamptz,
  constraint notification_outbox_events_pkey primary key (activity_event_id),
  constraint notification_outbox_events_outbox_fkey foreign key (outbox_id, couple_id)
    references public.notification_outbox (id, couple_id) on delete cascade,
  constraint notification_outbox_events_event_fkey foreign key (activity_event_id, couple_id)
    references public.activity_events (id, couple_id) on delete cascade
);

create index notification_outbox_events_outbox_idx on public.notification_outbox_events (outbox_id, couple_id);
create index notification_outbox_events_event_couple_idx on public.notification_outbox_events (activity_event_id, couple_id);

alter table public.notification_outbox_events enable row level security;
-- No policies and no grants: only SECURITY DEFINER functions touch this table.
revoke all on table public.notification_outbox_events from public, anon, authenticated, service_role;

-- ---------- Backfill: each existing share row links its one share event ----------
do $$
declare
  bad_count integer;
begin
  select count(*) into bad_count
  from public.notification_outbox o
  where (
    select count(*)
    from public.activity_events e
    where e.item_id = o.item_id
      and e.couple_id = o.couple_id
      and e.event_type in ('item_created', 'item_remixed')
  ) <> 1;

  if bad_count > 0 then
    raise exception 'notification backfill: % outbox rows do not match exactly one share event', bad_count;
  end if;

  insert into public.notification_outbox_events (outbox_id, couple_id, activity_event_id)
  select o.id, o.couple_id, e.id
  from public.notification_outbox o
  join public.activity_events e
    on e.item_id = o.item_id
   and e.couple_id = o.couple_id
   and e.event_type in ('item_created', 'item_remixed');
end;
$$;

alter table public.notification_outbox drop constraint notification_outbox_once;
alter table public.notification_outbox drop constraint notification_outbox_item_fkey;
drop index public.notification_outbox_item_id_idx;
drop index public.notification_outbox_pending_idx;
alter table public.notification_outbox drop column item_id;

-- ---------- Kinds: exactly a share or a digest ----------
-- A new type (not ALTER TYPE ... ADD VALUE) so the new label is usable in this transaction.
create type public.notification_kind_v2 as enum ('idea_shared', 'activity_digest');
alter table public.notification_outbox
  alter column kind type public.notification_kind_v2 using kind::text::public.notification_kind_v2;
drop type public.notification_kind;
alter type public.notification_kind_v2 rename to notification_kind;

-- ---------- Timing and sealing ----------
alter table public.notification_outbox
  add column not_before timestamptz,
  add column sealed_at timestamptz,
  add column suppressed_at timestamptz;

-- Existing rows are shares: their membership was always fixed.
update public.notification_outbox set not_before = created_at, sealed_at = created_at;

alter table public.notification_outbox
  alter column not_before set not null,
  add constraint notification_outbox_claim_requires_seal check (
    (claimed_at is null and sent_at is null) or sealed_at is not null
  ),
  add constraint notification_outbox_suppressed_check check (
    suppressed_at is null or (sent_at is null and sealed_at is not null)
  ),
  add constraint notification_outbox_share_sealed check (
    kind <> 'idea_shared' or sealed_at is not null
  );

create unique index notification_outbox_one_open_digest
  on public.notification_outbox (recipient_member_id)
  where kind = 'activity_digest' and sealed_at is null;
create index notification_outbox_due_idx
  on public.notification_outbox (not_before)
  where sent_at is null and suppressed_at is null;

-- ---------- Enqueue ----------
create function public.enqueue_activity_notification()
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

  perform 1
  from public.couples c
  where c.id = new.couple_id
  for update;

  if not found then
    raise exception 'notification couple does not exist';
  end if;

  for member_id in
    select m.id
    from public.members m
    where m.couple_id = new.couple_id
    order by m.id
    for update
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

revoke all on function public.enqueue_activity_notification() from public, anon, authenticated;

create trigger activity_events_enqueue_notification
after insert on public.activity_events
for each row execute function public.enqueue_activity_notification();

-- ---------- Delivery (service_role only) ----------

-- Hands out due deliveries: unsent, unsuppressed, under five attempts, and unclaimed or claimed
-- more than ten minutes ago. Claiming seals a digest. A delivery whose events have all gone (its
-- idea was deleted) is suppressed instead of returned. Concurrent workers never share a row.
create function public.claim_notifications(p_limit integer)
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

  update public.notification_outbox o
  set sealed_at = coalesce(o.sealed_at, pg_catalog.now()), suppressed_at = pg_catalog.now()
  where o.id = any(picked)
    and not exists (select 1 from public.notification_outbox_events l where l.outbox_id = o.id);

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
