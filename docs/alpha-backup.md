# Backups (alpha)

The hosted project is on Supabase's Free plan, which takes no backups for you. `scripts/backup.sh`
makes an encrypted backup on demand. Run it from a Mac that has Docker and the linked repo
(the MacBook Air):

```bash
scripts/backup.sh
```

It writes `~/Documents/ours-backups/ours-<date>.tar.enc`. It refuses to write inside the
repository, and asks for:

- the database password, if the CLI needs it;
- a passphrase for the encryption, which isn't stored anywhere. Keep it in your password manager.

The encrypted file holds two SQL files:

- `schema.sql`: the database structure.
- `data.sql`: the data in the `public` and `auth` schemas, including the two accounts.

Real personal content lives in this file, so keep it on encrypted storage, never in the repo, a
chat or a shared folder. Delete old backups you don't need.

## Restore (into a fresh or disposable project)

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ours-<date>.tar.enc | tar -xf - -C <private folder>
```

Then load `schema.sql` and `data.sql` into the target database with `psql`, using its connection
string. Restore into a disposable project first, to check it before relying on it.

**Status:** the script exists, but no restore has been tested yet.
