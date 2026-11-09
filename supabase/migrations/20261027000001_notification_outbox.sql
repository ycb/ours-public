-- Task 7B: one content-free email per shared idea.
--
-- notification_outbox holds only ids, a kind, timestamps and counters. It has no free-text
-- column, so a title, description or message can never be queued for email (pgTAP pins the
-- column list). Rows are written by a trigger on activity_events and delivered by a worker
-- running as service_role (locally scripts/notify-worker.mjs; later a scheduled Edge Function).
-- Members have no access to the outbox at all.

create type public.notification_kind as enum ('idea_shared');

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id),
  recipient_member_id uuid not null,
  kind public.notification_kind not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error_code text,
  constraint notification_outbox_recipient_fkey foreign key (recipient_member_id, couple_id)
    references public.members (id, couple_id),
  -- A deleted idea never emails.
  constraint notification_outbox_item_fkey foreign key (item_id, couple_id)
    references public.items (id, couple_id) on delete cascade,
  -- One email per share, ever.
  constraint notification_outbox_once unique (recipient_member_id, kind, item_id),
  constraint notification_outbox_attempts_check check (attempts between 0 and 100),
  -- A short machine code, never provider text (which could echo addresses or content).
  constraint notification_outbox_error_code_check check (
    last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,40}$'
  )
);

create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where sent_at is null;
create index notification_outbox_couple_id_idx on public.notification_outbox (couple_id);
create index notification_outbox_item_id_idx on public.notification_outbox (item_id);

alter table public.notification_outbox enable row level security;
-- No policies and no grants: only SECURITY DEFINER functions touch this table.
revoke all on table public.notification_outbox from public, anon, authenticated, service_role;

-- Enqueue on share. Drafts record no activity, so they never email; edits, replies and
-- re-shares record other event types (or none), so they never email either.
create or replace function public.enqueue_share_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type in ('item_created', 'item_remixed') and new.item_id is not null then
    insert into public.notification_outbox (couple_id, recipient_member_id, kind, item_id)
    select new.couple_id, m.id, 'idea_shared', new.item_id
    from public.members m
    where m.couple_id = new.couple_id
      and m.id <> new.actor_member_id
    on conflict on constraint notification_outbox_once do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_share_notification() from public, anon, authenticated;

create trigger activity_events_enqueue_share_notification
after insert on public.activity_events
for each row execute function public.enqueue_share_notification();

-- ---------- Delivery (service_role only) ----------

-- Hands out pending notifications: unsent, under five attempts, and unclaimed or claimed more
-- than ten minutes ago (a worker that died mid-send). Concurrent workers never share a row.
create or replace function public.claim_notifications(p_limit integer)
returns table (id uuid, kind public.notification_kind, item_id uuid, recipient_email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select o.id
    from public.notification_outbox o
    where o.sent_at is null
      and o.attempts < 5
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '10 minutes')
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ),
  claimed as (
    update public.notification_outbox o
    set claimed_at = pg_catalog.now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id, o.kind, o.item_id, o.recipient_member_id
  )
  select c.id, c.kind, c.item_id, u.email::text
  from claimed c
  join public.members m on m.id = c.recipient_member_id
  join auth.users u on u.id = m.auth_user_id
  where u.email is not null;
end;
$$;

create or replace function public.mark_notification_sent(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set sent_at = pg_catalog.now(), last_error_code = null
  where id = p_id and sent_at is null;
$$;

create or replace function public.mark_notification_failed(p_id uuid, p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set claimed_at = null, last_error_code = p_code
  where id = p_id and sent_at is null;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.mark_notification_sent(uuid) to service_role;
grant execute on function public.mark_notification_failed(uuid, text) to service_role;
