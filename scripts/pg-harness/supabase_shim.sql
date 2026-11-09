-- Minimal emulation of the Supabase platform objects the Ours migrations/tests rely on.
-- Not a substitute for `npx supabase test db`; used only when Docker is unavailable.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  banned_until timestamptz,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false,
  confirmation_token varchar(255),
  recovery_token varchar(255),
  email_change varchar(255),
  email_change_token_new varchar(255),
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Pessimistic stand-in for Supabase's default privileges: browser roles get everything so the
-- migrations' explicit revokes are exercised. service_role gets nothing, matching this
-- project's `auto_expose_new_tables = false` (verified on the real stack: 42501 on update).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- The real stack creates an empty supabase_realtime publication before migrations run.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
