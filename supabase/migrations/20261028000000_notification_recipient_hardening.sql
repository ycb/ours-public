-- Task 7B hardening: one share creates one outbox intent for exactly one partner.
--
-- The couple row serializes membership-sensitive writes. Member rows are then locked in
-- deterministic id order. A malformed couple fails closed instead of notifying zero or many
-- recipients. Delivery remains retryable and therefore at-least-once; that is a worker concern.

-- PostgreSQL runs same-kind triggers alphabetically. Preserve the established item initializer
-- as the first AFTER INSERT guard, so malformed direct fixture/admin inserts keep failing with
-- the item-creation error before activity (and therefore notification) work begins.
drop trigger items_activity_after_insert on public.items;
create trigger items_record_activity_after_insert
after insert on public.items
for each row execute function public.record_item_activity();

create or replace function public.enqueue_share_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  member_ids uuid[] := array[]::uuid[];
  recipient_id uuid;
begin
  if new.event_type in ('item_created', 'item_remixed') and new.item_id is not null then
    perform 1
    from public.couples c
    where c.id = new.couple_id
    for update;

    if not found then
      raise exception 'share notification couple does not exist';
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
      raise exception 'share notification requires exactly two couple members';
    end if;

    if not (new.actor_member_id = any(member_ids)) then
      raise exception 'share notification actor must be a couple member';
    end if;

    recipient_id := case
      when member_ids[1] = new.actor_member_id then member_ids[2]
      else member_ids[1]
    end;

    insert into public.notification_outbox (couple_id, recipient_member_id, kind, item_id)
    values (new.couple_id, recipient_id, 'idea_shared', new.item_id)
    on conflict on constraint notification_outbox_once do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_share_notification() from public, anon, authenticated;
