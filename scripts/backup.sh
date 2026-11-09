#!/usr/bin/env bash
# Ours: an encrypted backup of the hosted database (schema + data, including the two Auth users).
#
#   scripts/backup.sh                 writes to ~/Documents/ours-backups/
#   scripts/backup.sh /some/folder    writes there (never inside the repository)
#
# - Needs: the repo linked to the project (`npx supabase link`), Docker running (the Supabase CLI
#   dumps through a container), and the database password when asked.
# - The dump is encrypted with a passphrase you choose (AES-256, openssl, built into macOS) as it is
#   written: the plain SQL exists only in a private temporary folder and is deleted at the end.
# - Restore: see docs/alpha-backup.md.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="${1:-$HOME/Documents/ours-backups}"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"

case "$out_dir/" in
  "$repo_root"/*|"$(dirname "$repo_root")"/ours/*)
    echo "backup: keep backups outside the repository (e.g. ~/Documents/ours-backups)." >&2
    exit 1
    ;;
esac

command -v openssl >/dev/null || { echo "backup: openssl is required." >&2; exit 1; }

stamp="$(date +%Y-%m-%d-%H%M)"
target="$out_dir/ours-$stamp.tar.enc"
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT

cd "$repo_root"
echo "backup: dumping schema and data (the CLI may ask for the database password)…"
npx supabase db dump --linked -f "$work/schema.sql" >/dev/null
npx supabase db dump --linked --data-only --schema public,auth -f "$work/data.sql" >/dev/null

echo "backup: choose a passphrase (you need it to restore; it is not stored anywhere):"
tar -C "$work" -cf - schema.sql data.sql | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -out "$target"
chmod 600 "$target"

echo "backup: saved $(basename "$target") ($(du -h "$target" | cut -f1)) in $out_dir"
