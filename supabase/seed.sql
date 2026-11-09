-- Synthetic seed only. Auth token columns are '' rather than NULL because GoTrue's admin
-- user listing fails on NULL token strings ("Database error finding users").
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  banned_until,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated',
    'authenticated',
    'synthetic-partner-a@ours.invalid',
    null,
    '{"provider":"email","providers":[]}'::jsonb,
    '{}'::jsonb,
    'infinity',
    '',
    '',
    '',
    '',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated',
    'authenticated',
    'synthetic-partner-b@ours.invalid',
    null,
    '{"provider":"email","providers":[]}'::jsonb,
    '{}'::jsonb,
    'infinity',
    '',
    '',
    '',
    '',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  );

insert into public.couples (id, display_name, created_at)
values (
  '00000000-0000-4000-8000-0000000000c0',
  'Synthetic Couple',
  '2026-01-01 00:00:00+00'
);

insert into public.members (
  id,
  couple_id,
  auth_user_id,
  display_name,
  sort_order,
  created_at
) values
  (
    '00000000-0000-4000-8000-0000000000a0',
    '00000000-0000-4000-8000-0000000000c0',
    '00000000-0000-4000-8000-0000000000a1',
    'Synthetic Partner A',
    0,
    '2026-01-01 00:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-0000000000b0',
    '00000000-0000-4000-8000-0000000000c0',
    '00000000-0000-4000-8000-0000000000b2',
    'Synthetic Partner B',
    1,
    '2026-01-01 00:00:00+00'
  );
