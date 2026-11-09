create function public.create_category(p_request_id uuid, p_name text)
returns public.categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.categories;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then
    raise exception 'authenticated member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'create_category:' || actor.id::text || ':' || p_request_id::text,
      0
    )
  );

  select c.* into result
  from public.categories as c
  where c.created_by_member_id = actor.id
    and c.request_id = p_request_id;
  if found then
    return result;
  end if;

  insert into public.categories (couple_id, name, created_by_member_id, request_id)
  values (actor.couple_id, p_name, actor.id, p_request_id)
  on conflict (created_by_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select c.* into result
    from public.categories as c
    where c.created_by_member_id = actor.id
      and c.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.create_item(
  p_request_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_source_item_id uuid default null,
  p_source_memory_id uuid default null
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
  source_memory_item_id uuid;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then
    raise exception 'authenticated member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'create_item:' || actor.id::text || ':' || p_request_id::text,
      0
    )
  );

  select i.* into result
  from public.items as i
  where i.creator_member_id = actor.id
    and i.request_id = p_request_id;
  if found then
    return result;
  end if;

  if not exists (
    select 1 from public.categories as c
    where c.id = p_category_id
      and c.couple_id = actor.couple_id
      and c.archived_at is null
  ) then
    raise exception 'active category in current couple required';
  end if;

  if p_source_item_id is not null and not exists (
    select 1 from public.items as i
    where i.id = p_source_item_id
      and i.couple_id = actor.couple_id
  ) then
    raise exception 'source item in current couple required';
  end if;

  if p_source_memory_id is not null then
    select m.item_id into source_memory_item_id
    from public.memories as m
    where m.id = p_source_memory_id
      and m.couple_id = actor.couple_id;
    if not found then
      raise exception 'source memory in current couple required';
    end if;
    if p_source_item_id is not null
      and source_memory_item_id is distinct from p_source_item_id then
      raise exception 'source memory must belong to source item';
    end if;
  end if;

  insert into public.items (
    couple_id, creator_member_id, category_id, source_item_id,
    source_memory_id, request_id, title, description
  ) values (
    actor.couple_id, actor.id, p_category_id, p_source_item_id,
    p_source_memory_id, p_request_id, p_title, p_description
  )
  on conflict (creator_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select i.* into result
    from public.items as i
    where i.creator_member_id = actor.id
      and i.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.update_item(
  p_item_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then
    raise exception 'authenticated member required';
  end if;

  select i.* into result
  from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
    and i.creator_member_id = actor.id;
  if not found then
    raise exception 'item creator required';
  end if;

  if row(result.title, result.description, result.category_id)
    is not distinct from row(p_title, p_description, p_category_id) then
    return result;
  end if;

  if not exists (
    select 1 from public.categories as c
    where c.id = p_category_id
      and c.couple_id = actor.couple_id
      and c.archived_at is null
  ) then
    raise exception 'active category in current couple required';
  end if;

  update public.items as i
  set title = p_title,
      description = p_description,
      category_id = p_category_id
  where i.id = result.id
  returning i.* into result;
  return result;
end;
$$;

create function public.archive_item(p_item_id uuid)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.items;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then
    raise exception 'authenticated member required';
  end if;

  select i.* into result
  from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
    and i.creator_member_id = actor.id;
  if not found then
    raise exception 'item creator required';
  end if;

  if result.archived_at is not null then
    return result;
  end if;

  update public.items as i
  set archived_at = clock_timestamp()
  where i.id = result.id
  returning i.* into result;
  return result;
end;
$$;

create function public.set_item_interest(p_item_id uuid, p_interest public.interest)
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

  update public.item_responses as r
  set interest = p_interest
  where r.item_id = p_item_id
    and r.member_id = actor.id
    and r.couple_id = actor.couple_id
    and r.interest is distinct from p_interest
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id
      and r.member_id = actor.id
      and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

create function public.set_item_favorite(p_item_id uuid, p_favorite boolean)
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

  update public.item_responses as r
  set is_favorite = p_favorite
  where r.item_id = p_item_id
    and r.member_id = actor.id
    and r.couple_id = actor.couple_id
    and r.is_favorite is distinct from p_favorite
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id
      and r.member_id = actor.id
      and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

create function public.set_roulette_decision(
  p_item_id uuid,
  p_decision public.roulette_decision
)
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

  perform 1
  from public.items as i
  where i.id = p_item_id
    and i.couple_id = actor.couple_id
  for update;
  if not found then raise exception 'owned item response required'; end if;

  update public.item_responses as r
  set roulette_decision = p_decision
  where r.item_id = p_item_id
    and r.member_id = actor.id
    and r.couple_id = actor.couple_id
    and r.roulette_decision is distinct from p_decision
  returning r.* into result;

  if not found then
    select r.* into result from public.item_responses as r
    where r.item_id = p_item_id
      and r.member_id = actor.id
      and r.couple_id = actor.couple_id;
  end if;
  if result.id is null then raise exception 'owned item response required'; end if;
  return result;
end;
$$;

create function public.add_comment(p_request_id uuid, p_item_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.comments;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'add_comment:' || actor.id::text || ':' || p_request_id::text,
      0
    )
  );

  select c.* into result from public.comments as c
  where c.author_member_id = actor.id and c.request_id = p_request_id;
  if found then return result; end if;

  if not exists (
    select 1 from public.items as i
    where i.id = p_item_id and i.couple_id = actor.couple_id
  ) then
    raise exception 'item in current couple required';
  end if;

  insert into public.comments (couple_id, item_id, author_member_id, body, request_id)
  values (actor.couple_id, p_item_id, actor.id, p_body, p_request_id)
  on conflict (author_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select c.* into result from public.comments as c
    where c.author_member_id = actor.id and c.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.add_memory(
  p_request_id uuid,
  p_item_id uuid,
  p_draw_id uuid,
  p_body text,
  p_highlight text,
  p_next_time public.memory_next_time,
  p_refinement text
)
returns public.memories
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members;
  result public.memories;
begin
  select * into actor from public.get_current_member();
  if actor.id is null then raise exception 'authenticated member required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'add_memory:' || actor.id::text || ':' || p_request_id::text,
      0
    )
  );

  select m.* into result from public.memories as m
  where m.author_member_id = actor.id and m.request_id = p_request_id;
  if found then return result; end if;

  if not exists (
    select 1 from public.items as i
    where i.id = p_item_id and i.couple_id = actor.couple_id
  ) then
    raise exception 'item in current couple required';
  end if;

  if p_draw_id is not null and not exists (
    select 1 from public.roulette_draws as d
    where d.id = p_draw_id
      and d.couple_id = actor.couple_id
      and d.item_id = p_item_id
      and d.outcome = 'accepted'
  ) then
    raise exception 'accepted draw for current item required';
  end if;

  insert into public.memories (
    couple_id, item_id, draw_id, author_member_id, body,
    highlight, next_time, refinement, request_id
  ) values (
    actor.couple_id, p_item_id, p_draw_id, actor.id, p_body,
    p_highlight, p_next_time, p_refinement, p_request_id
  )
  on conflict (author_member_id, request_id) do nothing
  returning * into result;
  if result.id is null then
    select m.* into result from public.memories as m
    where m.author_member_id = actor.id and m.request_id = p_request_id;
  end if;
  return result;
end;
$$;

create function public.record_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (
      couple_id, actor_member_id, event_type, item_id
    ) values (
      new.couple_id,
      new.creator_member_id,
      case when new.source_item_id is not null or new.source_memory_id is not null
        then 'item_remixed'::public.activity_event_type
        else 'item_created'::public.activity_event_type
      end,
      new.id
    );
  elsif row(new.title, new.description, new.category_id)
    is distinct from row(old.title, old.description, old.category_id) then
    insert into public.activity_events (
      couple_id, actor_member_id, event_type, item_id
    ) values (
      new.couple_id, public.current_member_id(), 'item_edited', new.id
    );
  end if;
  return new;
end;
$$;

create trigger items_activity_after_insert
after insert on public.items
for each row execute function public.record_item_activity();
create trigger items_activity_after_update
after update on public.items
for each row execute function public.record_item_activity();

create function public.record_response_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.activity_event_type;
begin
  if new.roulette_decision is distinct from old.roulette_decision then
    if new.roulette_decision = 'ready'
      and exists (
        select 1 from public.items as i
        where i.id = new.item_id and i.archived_at is null
      )
      and (
        select count(*) from public.item_responses as r
        where r.item_id = new.item_id and r.roulette_decision = 'ready'
      ) = 2 then
      selected_event := 'item_became_eligible';
    else
      selected_event := 'roulette_decision_changed';
    end if;
  elsif row(new.interest, new.is_favorite)
    is distinct from row(old.interest, old.is_favorite) then
    selected_event := 'response_changed';
  else
    return new;
  end if;

  insert into public.activity_events (
    couple_id, actor_member_id, event_type, item_id
  ) values (
    new.couple_id, new.member_id, selected_event, new.item_id
  );
  return new;
end;
$$;

create trigger item_responses_activity_after_update
after update on public.item_responses
for each row execute function public.record_response_activity();

create function public.record_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_events (
    couple_id, actor_member_id, event_type, item_id, comment_id
  ) values (
    new.couple_id, new.author_member_id, 'comment_added', new.item_id, new.id
  );
  return new;
end;
$$;

create trigger comments_activity_after_insert
after insert on public.comments
for each row execute function public.record_comment_activity();

create function public.record_memory_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_events (
    couple_id, actor_member_id, event_type, item_id, draw_id, memory_id
  ) values (
    new.couple_id, new.author_member_id, 'memory_added', new.item_id, new.draw_id, new.id
  );
  return new;
end;
$$;

create trigger memories_activity_after_insert
after insert on public.memories
for each row execute function public.record_memory_activity();

revoke all on function public.create_category(uuid, text) from public, anon, authenticated;
revoke all on function public.create_item(uuid, text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_item(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.archive_item(uuid) from public, anon, authenticated;
revoke all on function public.set_item_interest(uuid, public.interest) from public, anon, authenticated;
revoke all on function public.set_item_favorite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_roulette_decision(uuid, public.roulette_decision) from public, anon, authenticated;
revoke all on function public.add_comment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.add_memory(uuid, uuid, uuid, text, text, public.memory_next_time, text) from public, anon, authenticated;
revoke all on function public.record_item_activity() from public, anon, authenticated;
revoke all on function public.record_response_activity() from public, anon, authenticated;
revoke all on function public.record_comment_activity() from public, anon, authenticated;
revoke all on function public.record_memory_activity() from public, anon, authenticated;

grant execute on function public.create_category(uuid, text) to authenticated;
grant execute on function public.create_item(uuid, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.update_item(uuid, text, text, uuid) to authenticated;
grant execute on function public.archive_item(uuid) to authenticated;
grant execute on function public.set_item_interest(uuid, public.interest) to authenticated;
grant execute on function public.set_item_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_roulette_decision(uuid, public.roulette_decision) to authenticated;
grant execute on function public.add_comment(uuid, uuid, text) to authenticated;
grant execute on function public.add_memory(uuid, uuid, uuid, text, text, public.memory_next_time, text) to authenticated;
