# First real deploy plan (2026-10-30)

**Goal:** The first couple uses the app on their phones tonight. The front end is on a static host subdomain; the data is on Peter's hosted Supabase project.

**Who runs what:** Peter runs every step that touches the hosted project or the static host. Agents never see credentials, Auth ids, or real content. Nothing in this file holds a real value. Substitute values in your terminal or the dashboard only, and never commit them.

## 0. Decide: this is the real-content gate, early

Task 11 (the readiness gate) is not built. Going live tonight means accepting these gaps on purpose (Peter's call):

| Gap | Tonight | Before relying on it |
| --- | --- | --- |
| No tested backup or restore (Free plan has no managed backups) | Accept. Take one manual dump (step 7) | Task 11, step 6 |
| No purge runbook | Accept. Deleting the project is the fallback | Task 11, step 5 |
| Email notifications aren't live: only a local worker exists, and no production sender | Accept. Live updates work while the app is open; tell each other in person | Scheduled Edge Function plus an email provider |
| `check:repo` / `check:bundle` aren't built | Run the manual bundle check (step 4) | Task 11, steps 1–2 |
| The importer isn't built | Add ideas by hand in the app | Task 11 follow-up |

If any of these is a deal-breaker, stop here: tonight then becomes a synthetic run on the hosted stack (steps 1–5 with test accounts).

> **Pasting commands:** macOS zsh doesn't treat `#` as a comment when you paste, so command blocks here carry no trailing comments. Notes are in the text around them.

## 1. Verify locally on the Mac (about 10 minutes)

```bash
cd ~/ours/.worktrees/personal-alpha-mvp
npx supabase db reset && npm run dev:accounts && npx supabase test db && npm run test:e2e
npx supabase gen types typescript --local > src/types/database.ts && git diff --stat src/types/database.ts
npm run lint && npm test && npm run build
```

Everything should pass before you go on.

## 2. Hosted Supabase: settings (dashboard)

1. **Authentication → Sign In / Providers:**
   - Turn **Allow new users to sign up** off.
   - Turn **anonymous sign-ins** off.
   - Leave email/password on.
2. **Authentication → URL Configuration:**
   - Set **Site URL** to `https://<sub>.<yourdomain>`, and add the same URL to **Redirect URLs**.
   - Use a discreet subdomain name: it shows in history and on the home screen.
3. **Authentication → Users → Add user** (twice): your email and your partner's, each with a strong password and **Auto Confirm** on. Copy both user ids somewhere private.
4. **Project Settings → API:** note the project URL and the **publishable** (anon) key. Never use the service-role or secret key in the browser.

## 3. Hosted Supabase: schema and the couple (checkpoint)

This is the explicit remote checkpoint: Peter runs it.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

`link` asks for the database password (Project Settings → Database; reset it there if needed), and macOS may ask for your Mac login password to let the CLI read its keychain token. The dry run should list every migration in `supabase/migrations/` and nothing else. Don't add `--include-seed`: no synthetic data goes up.

Then, in **SQL Editor**, run this one transaction with your values substituted (don't save the substituted query):

```sql
begin;
insert into public.couples (display_name) values ('<couple name>') returning id;   -- copy the id
insert into public.members (couple_id, auth_user_id, display_name, sort_order) values
  ('<couple id>', '<your auth user id>',    '<your name>',     0),
  ('<couple id>', '<partner auth user id>', '<partner name>',  1);
select count(*) from public.members where couple_id = '<couple id>';                -- expect 2
commit;
```

The display names are what each of you sees ("Alex shared this").

## 4. Build the front end

```bash
cat > .env.production.local <<'EOF'
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
EOF
npm run build
# Manual bundle check: none of these may appear in dist/
grep -rlE "sb_secret_[A-Za-z0-9_-]{10,}|service_role|SUPABASE_DB_PASSWORD" dist/ && echo "STOP: secret in bundle" || echo "bundle clean"
git status --short
```

`.env.production.local` must not appear in `git status` (`.gitignore` ignores `.env.*`).

## 5. Static host: subdomain and upload

1. In **cPanel → Domains**, create `<sub>.<yourdomain>` with its own document root (for example `public_html/<sub>`).
2. In **cPanel → SSL/TLS Status**, run **AutoSSL** for the subdomain and wait for a valid certificate.
3. Upload the **contents** of `dist/` (not the folder) to that document root, using File Manager (zip, upload, extract) or SFTP.
4. In the same folder, add an `.htaccess` file. It does three things:
   - Forces HTTPS.
   - Serves `index.html` for app routes, so `/ideas/…` and `/plan` survive a refresh.
   - Keeps the site out of search engines.

```apache
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]

<IfModule mod_headers.c>
  Header set X-Robots-Tag "noindex, nofollow"
  Header set Referrer-Policy "no-referrer"
  Header set X-Content-Type-Options "nosniff"
  <FilesMatch "index\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
```

To redeploy later, rebuild and re-upload `dist/`. Old asset files can stay; `index.html` points to the new ones.

## 6. Smoke test before your partner joins (about 10 minutes)

On your phone, at `https://<sub>.<yourdomain>`:

1. A wrong password shows the neutral error. Your password signs in, and the header shows your name.
2. **Isolation check:** in a private window, signed out, open the site. You see only the sign-in screen.
3. Create a throwaway idea titled "test", share it, then delete it from its page. That proves writes, two response rows and delete.
4. On a second device (or your partner's), sign in as your partner and confirm that device sees the right name.
5. **Live check:** you share an idea, and it appears on the other phone without a refresh. Then one of you says "I'm in", the other too, and it shows up on Plan.
6. Optional: Share → **Add to Home Screen** on both phones.

If anything fails, stop. Real content waits until it's fixed.

## 7. After the evening

- Take one manual backup, straight to encrypted storage outside the repo:

  ```bash
  npx supabase db dump --linked --data-only -f <encrypted-volume>/ours-<date>.sql
  ```

  Delete it when it's no longer needed.
- Note what felt off for the next QA round in `docs/plans/2026-10-30-qa-notes.md`, without real content.
- Afterwards, Task 11 makes this durable: the purge runbook, a tested restore, the content checkers, and email delivery.
