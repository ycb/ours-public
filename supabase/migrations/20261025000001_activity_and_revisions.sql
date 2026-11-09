create function public.item_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_member_id uuid;
  captured_member_ids uuid[];
begin
  perform 1
  from public.couples as c
  where c.id = new.couple_id
  for update;

  if not found then
    raise exception 'item couple does not exist';
  end if;

  select
    array_agg(locked_members.id order by locked_members.id),
    (array_agg(locked_members.id order by locked_members.id)
      filter (where locked_members.auth_user_id = auth.uid()))[1]
  into captured_member_ids, authenticated_member_id
  from (
    select m.id, m.auth_user_id
    from public.members as m
    where m.couple_id = new.couple_id
    order by m.id
    for update
  ) as locked_members;

  if authenticated_member_id is null then
    raise exception 'authenticated member required';
  end if;

  if authenticated_member_id <> new.creator_member_id then
    raise exception 'item creator must be the authenticated member';
  end if;

  if coalesce(cardinality(captured_member_ids), 0) <> 2 then
    raise exception 'item creation requires exactly two couple members';
  end if;

  insert into public.item_revisions (
    couple_id,
    item_id,
    revision_number,
    editor_member_id,
    title,
    description,
    category_id
  ) values (
    new.couple_id,
    new.id,
    1,
    authenticated_member_id,
    new.title,
    new.description,
    new.category_id
  );

  insert into public.item_responses (couple_id, item_id, member_id)
  select new.couple_id, new.id, captured_member_id
  from unnest(captured_member_ids) as captured_members(captured_member_id);

  return new;
end;
$$;

create trigger items_after_insert
after insert on public.items
for each row execute function public.item_after_insert();

create function public.item_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_member_id uuid;
  next_revision_number integer;
  content_changed boolean;
  library_state_changed boolean;
begin
  if new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.creator_member_id is distinct from old.creator_member_id
    or new.source_item_id is distinct from old.source_item_id
    or new.source_memory_id is distinct from old.source_memory_id
    or new.request_id is distinct from old.request_id
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable item identity cannot be changed';
  end if;

  content_changed := row(new.title, new.description, new.category_id)
    is distinct from row(old.title, old.description, old.category_id);
  library_state_changed := content_changed
    or new.archived_at is distinct from old.archived_at;

  if library_state_changed then
    select m.id
    into authenticated_member_id
    from public.members as m
    where m.auth_user_id = auth.uid()
      and m.couple_id = old.couple_id;

    if authenticated_member_id is null then
      raise exception 'authenticated couple member required';
    end if;

    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  if content_changed then
    select coalesce(max(r.revision_number), 0) + 1
    into next_revision_number
    from public.item_revisions as r
    where r.item_id = old.id;

    insert into public.item_revisions (
      couple_id,
      item_id,
      revision_number,
      editor_member_id,
      title,
      description,
      category_id
    ) values (
      old.couple_id,
      old.id,
      next_revision_number,
      authenticated_member_id,
      new.title,
      new.description,
      new.category_id
    );
  end if;

  return new;
end;
$$;

create trigger items_before_update
before update on public.items
for each row execute function public.item_before_update();

create function public.maintain_item_response_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.item_id is distinct from old.item_id
    or new.member_id is distinct from old.member_id
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable response identity cannot be changed';
  end if;

  if row(new.interest, new.is_favorite, new.roulette_decision)
    is distinct from row(old.interest, old.is_favorite, old.roulette_decision) then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

create trigger item_responses_before_update
before update on public.item_responses
for each row execute function public.maintain_item_response_updated_at();

create function public.reject_item_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'item revisions are immutable';
end;
$$;

create trigger item_revisions_reject_mutation
before update or delete on public.item_revisions
for each row execute function public.reject_item_revision_mutation();

revoke all on function public.item_after_insert() from public, anon, authenticated;
revoke all on function public.item_before_update() from public, anon, authenticated;
revoke all on function public.maintain_item_response_updated_at() from public, anon, authenticated;
revoke all on function public.reject_item_revision_mutation() from public, anon, authenticated;
