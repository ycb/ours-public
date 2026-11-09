#!/usr/bin/env bash
# Docker-free database test fallback. Authoritative check remains `npx supabase test db`.
# Usage: scripts/pg-harness/run.sh <project-dir>
# Requires Postgres 17 server binaries plus pgTAP, dblink, and pgrowlocks (e.g. Debian/Ubuntu:
# postgresql-17 postgresql-17-pgtap). Resets a throwaway cluster on 127.0.0.1:${PGPORT:-54422}.
set -euo pipefail
PROJ=$(cd "${1:?project dir}" && pwd); H=$(cd "$(dirname "$0")" && pwd)
PGBIN=${PGBIN:-/usr/lib/postgresql/17/bin}; DATA=${PGHARNESS_DATA:-/tmp/ours-pg-harness}
export PGHOST=127.0.0.1 PGPORT=${PGPORT:-54422} PGUSER=postgres PGPASSWORD=postgres
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
if [ ! -d "$DATA" ]; then
  mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
  as_pg "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
fi
if ! as_pg "$PGBIN/pg_ctl -D $DATA status" >/dev/null 2>&1; then
  as_pg "$PGBIN/pg_ctl -D $DATA -l $DATA.log -o '-p $PGPORT -c listen_addresses=127.0.0.1' -w start" >/dev/null
fi
psql -qX -d postgres -c "alter user postgres password 'postgres'" >/dev/null
psql -qX -d postgres -c "drop database if exists ours_test with (force)" -c "create database ours_test" 2>/dev/null >/dev/null
export PGDATABASE=ours_test
psql -qX -v ON_ERROR_STOP=1 -f "$H/supabase_shim.sql" >/dev/null
psql -qX -c 'alter database ours_test set search_path = "$user", public, extensions' >/dev/null
for f in "$PROJ"/supabase/migrations/*.sql; do
  psql -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }
done
[ -f "$PROJ/supabase/seed.sql" ] && psql -qX -v ON_ERROR_STOP=1 -f "$PROJ/supabase/seed.sql" >/dev/null
fail=0; sum=0
for t in "$PROJ"/supabase/tests/database/*.sql; do
  out=$(psql -X -At -v ON_ERROR_STOP=1 -f "$t" 2>&1) || true
  ran=$(grep -cE '^(not )?ok ' <<<"$out" || true); bad=$(grep -cE '^not ok ' <<<"$out" || true)
  plan=$(grep -oE '^1\.\.[0-9]+' <<<"$out" | head -1 || true); plan=${plan#1..}
  if [ "$bad" != 0 ] || [ "$ran" != "$plan" ] || grep -qE 'ERROR|Looks like' <<<"$out"; then
    fail=1; echo "FAIL $(basename "$t"): $ran ran of ${plan:-?}, $bad failed"
    grep -E "^not ok|ERROR|^# " <<<"$out" | head -40 || true
  else echo "ok   $(basename "$t"): $ran/$plan"; sum=$((sum+ran)); fi
done
[ $fail = 0 ] && echo "ALL PASS: $sum assertions"
exit $fail
