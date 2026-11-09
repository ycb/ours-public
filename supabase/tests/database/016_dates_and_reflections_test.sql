-- QA 2026-11-03 (dates and reflections): a pick becomes a date (when, done, not anymore, dealt or
-- chosen), a reflection is a memory with either answer, and each person gets at most one reminder
-- email per date, claimed only by the service role.
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

insert into auth.users (id, email, banned_until, is_sso_user, is_anonymous)
values
  ('a1600000-0000-4000-8000-000000000001', 'synthetic-date-a@ours.invalid', 'infinity', false, false),
  ('a1600000-0000-4000-8000-000000000002', 'synthetic-date-b@ours.invalid', 'infinity', false, false),
  ('a1600000-0000-4000-8000-000000000003', 'synthetic-date-other@ours.invalid', 'infinity', false, false);
insert into public.couples (id, display_name)
values ('a1600000-0000-4000-8000-000000000010', 'Synthetic Date Couple'), ('a1600000-0000-4000-8000-000000000030', 'Synthetic Other Couple');
insert into public.members (id, couple_id, auth_user_id, display_name, sort_order)
values
  ('a1600000-0000-4000-8000-000000000011', 'a1600000-0000-4000-8000-000000000010', 'a1600000-0000-4000-8000-000000000001', 'Synthetic Date A', 0),
  ('a1600000-0000-4000-8000-000000000012', 'a1600000-0000-4000-8000-000000000010', 'a1600000-0000-4000-8000-000000000002', 'Synthetic Date B', 1),
  ('a1600000-0000-4000-8000-000000000031', 'a1600000-0000-4000-8000-000000000030', 'a1600000-0000-4000-8000-000000000003', 'Synthetic Other', 0);
insert into public.categories (id, couple_id, name, created_by_member_id, request_id)
values ('a1600000-0000-4000-8000-000000000013', 'a1600000-0000-4000-8000-000000000010', 'Synthetic Date Category', 'a1600000-0000-4000-8000-000000000011', 'a1600000-0000-4000-8000-000000000014');

-- Two agreed ideas and one A hasn't agreed to.
select pg_temp.act_as('a1600000-0000-4000-8000-000000000001');
create temporary table fx as
select
  (public.create_item('a1600000-0000-4000-8000-000000000020', 'Synthetic Date One', 'Synthetic.', 'a1600000-0000-4000-8000-000000000013', null, null)).id as one,
  (public.create_item('a1600000-0000-4000-8000-000000000021', 'Synthetic Date Two', 'Synthetic.', 'a1600000-0000-4000-8000-000000000013', null, null)).id as two,
  (public.create_item('a1600000-0000-4000-8000-000000000022', 'Synthetic Date Pending', 'Synthetic.', 'a1600000-0000-4000-8000-000000000013', null, null)).id as pending;
grant select on fx to authenticated;
select public.submit_item((select one from fx));
select public.submit_item((select two from fx));
select public.submit_item((select pending from fx));
reset role;
select pg_temp.act_as('a1600000-0000-4000-8000-000000000002');
select public.set_roulette_decision((select one from fx), 'ready');
select public.set_roulette_decision((select two from fx), 'ready');
reset role;

-- ---------- Plan this: choosing directly ----------
select pg_temp.act_as('a1600000-0000-4000-8000-000000000002');
create temporary table planned as
select * from public.plan_item('a1600000-0000-4000-8000-000000000040', (select one from fx), 'tonight', now() + interval '12 hours');
grant select on planned to authenticated;
select is((select source from planned), 'chosen', 'Plan this records a chosen (not dealt) pick');
select is((select outcome::text from planned), 'accepted', 'as an accepted pick');
select is((select planned_when from planned), 'tonight', 'with its when');
select isnt((select reflect_after from planned), null, 'and when to ask how it was');
select is(
  (select id from public.plan_item('a1600000-0000-4000-8000-000000000040', (select one from fx), 'tonight', now() + interval '12 hours')),
  (select id from planned), 'a retry returns the same pick'
);
select throws_ok(
  format($$select public.plan_item('a1600000-0000-4000-8000-000000000041', %L, 'tonight', null)$$, (select pending from fx)),
  'OU410', 'roulette candidate unavailable', 'only an agreed idea can be planned'
);
select throws_ok(
  format($$select public.plan_item('a1600000-0000-4000-8000-000000000042', %L, 'someday', null)$$, (select two from fx)),
  '22023', null, 'when is tonight, weekend or sometime'
);
reset role;

-- A dealt pick (Let's do it) gets its when afterwards, from either partner.
select pg_temp.act_as('a1600000-0000-4000-8000-000000000001');
create temporary table dealt as
select * from public.record_roulette_outcome('a1600000-0000-4000-8000-000000000043', (select two from fx), null, 'accepted');
grant select on dealt to authenticated;
select is((select source from dealt), 'deck', 'a dealt pick is from the deck');
select is((select planned_when from dealt), null, 'with no when yet');
reset role;
select pg_temp.act_as('a1600000-0000-4000-8000-000000000002');
select is((public.set_draw_when((select id from dealt), 'weekend', now() + interval '3 days')).planned_when, 'weekend', 'either partner can set when');
select is((public.set_draw_when((select id from dealt), 'sometime', now())).reflect_after, null, 'sometime has no reflect-after time');
reset role;

-- ---------- We did it / Not anymore ----------
select pg_temp.act_as('a1600000-0000-4000-8000-000000000001');
select isnt((public.mark_draw_done((select id from planned))).done_at, null, 'We did it marks it done');
select throws_ok(
  format($$select public.cancel_draw(%L)$$, (select id from planned)),
  'P0001', 'open date required', 'a done date can''t be called off'
);
select isnt((public.cancel_draw((select id from dealt))).cancelled_at, null, 'Not anymore calls off an open date');
select throws_ok(
  format($$select public.set_draw_when(%L, 'tonight', null)$$, (select id from dealt)),
  'P0001', 'open date required', 'and it can''t be rescheduled after that'
);
reset role;
select pg_temp.act_as('a1600000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.mark_draw_done(%L)$$, (select id from planned)),
  'P0001', 'open date required', 'another couple can''t touch it'
);
reset role;

-- ---------- Reflections: a memory with either answer ----------
select pg_temp.act_as('a1600000-0000-4000-8000-000000000002');
select lives_ok(
  format($$select public.add_memory('a1600000-0000-4000-8000-000000000050', %L, %L, '', null, null, 'Synthetic slower next time.')$$, (select one from fx), (select id from planned)),
  'a reflection can be only "next time"'
);
select throws_ok(
  format($$select public.add_memory('a1600000-0000-4000-8000-000000000051', %L, %L, '', null, null, null)$$, (select one from fx), (select id from planned)),
  '23514', null, 'but not empty'
);
reset role;

-- ---------- One reminder email per person per date ----------
-- B reflected on "one"; A has not. "two" was called off. Make "one" due.
update public.roulette_draws set reflect_after = now() - interval '1 minute' where id = (select id from planned);
select is(
  (select count(*) from public.claim_reflection_reminders(10)), 1::bigint,
  'only the person who hasn''t reflected is reminded, and never for a called-off date'
);
select is(
  (select member_id from public.reflection_reminders where draw_id = (select id from planned)),
  'a1600000-0000-4000-8000-000000000011'::uuid, 'that is A'
);
select is((select recipient_email from public.claim_reflection_reminders(10) limit 1), null, 'a claimed reminder isn''t claimed again');
select public.mark_reflection_reminder_sent((select id from planned), 'a1600000-0000-4000-8000-000000000011');
update public.reflection_reminders set claimed_at = now() - interval '1 hour' where draw_id = (select id from planned);
select is((select count(*) from public.claim_reflection_reminders(10)), 0::bigint, 'once sent, never again for that date');

select ok(not has_function_privilege('authenticated', 'public.claim_reflection_reminders(integer)', 'execute'), 'browsers can''t claim reminders');
select ok(has_function_privilege('service_role', 'public.claim_reflection_reminders(integer)', 'execute'), 'the email sender can');
select ok(not has_table_privilege('authenticated', 'public.reflection_reminders', 'select'), 'browsers can''t read reminders');
select ok(has_function_privilege('authenticated', 'public.plan_item(uuid,uuid,text,timestamptz)', 'execute'), 'partners can plan');
select ok(not has_function_privilege('anon', 'public.plan_item(uuid,uuid,text,timestamptz)', 'execute'), 'anon can''t');

select * from finish();
rollback;
