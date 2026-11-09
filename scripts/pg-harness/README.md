# Docker-free pgTAP harness

Fallback for agents (e.g. Claude in a cloud workspace) that cannot run Docker and therefore cannot run
`npx supabase test db`. It creates a throwaway Postgres 17 database, applies `supabase_shim.sql`
(roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`, the `extensions` schema,
and Supabase-style default privileges that expose new public objects so migrations must revoke them),
then applies every migration, the seed, and each `supabase/tests/database/*.sql` file.

```bash
scripts/pg-harness/run.sh .
```

It is an emulation. Record evidence from it as "Docker-free harness" and re-run the real Supabase
stack before any real-content readiness decision.
