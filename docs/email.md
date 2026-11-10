# Production email

Ours emails are content-free. A shared idea sends "Something new is waiting in Ours", and later
activity sends "There are updates waiting in Ours". Each email links to the app, and the words come
from `supabase/functions/_shared/notify.mjs`.

**How it works.** Actions in the app queue rows in `notification_outbox`; batching and the delay
happen in Postgres. Once a minute, `pg_cron` calls the `notify` Edge Function through `pg_net`,
passing a cron secret. The function then:

1. Claims the due rows. Anything the recipient already saw in the app is skipped.
2. Sends each one through Resend, using the outbox id as the idempotency key.
3. Records the result, as a short code only.

The local worker (`npm run notify:worker`) runs the same logic against Mailpit.

Every value below in `<…>` is substituted in your terminal or the dashboard only. Never commit it,
and never paste it into a chat.

## 1. Resend

- Verify the sending domain under Domains.
- Under API Keys, create a key named `ours-production`, with **Sending access**, restricted to that
  domain. Copy it; it is shown only once.

## 2. Function secrets

Run these from the repo (linked to the project). `read -s` keeps each value out of the screen and
the shell history.

```bash
read -s RESEND_KEY
```

```bash
CRON_SECRET=$(openssl rand -hex 32)
```

```bash
npx supabase secrets set RESEND_API_KEY="$RESEND_KEY" OURS_CRON_SECRET="$CRON_SECRET" OURS_FROM="Ours <ours@<your domain>>" OURS_APP_URL="https://<your app subdomain>"
```

```bash
echo "$CRON_SECRET"
```

Copy the printed cron secret; it is needed once more, in step 4. Then close the terminal tab.

## 3. Deploy the function

```bash
npx supabase functions deploy notify --use-api
```

`--use-api` bundles on Supabase's side, so Docker isn't needed. `verify_jwt = false` comes from
`supabase/config.toml`: the function checks its own cron secret instead.

## 4. Schedule it (SQL Editor)

Enable the **pg_cron** and **pg_net** extensions (Database → Extensions). Then run the following,
substituting the cron secret and the project ref. Don't save the substituted query.

```sql
select vault.create_secret('<cron secret>', 'ours_cron_secret');

select cron.schedule(
  'ours-notify',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project ref>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ours-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ours_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 5. Optional: skip the backlog first

Rows queued before email existed would otherwise send once, as a single "updates waiting" email or
a stale "something new" email. To skip them, run this **before** step 4:

```sql
update public.notification_outbox
set sealed_at = coalesce(sealed_at, now()), suppressed_at = now(), last_error_code = 'backlog_skipped'
where sent_at is null and suppressed_at is null;
```

## Reflection reminders

The same scheduled call also sends at most one content-free reminder per person per date:
"A moment to look back on, in Ours". It goes out once the date's ask-time has passed and that
person hasn't reflected yet.

To deploy without the CLI, generate one file and paste it into **Edge Functions → notify → Code**:

```bash
node scripts/bundle-notify-function.mjs > ~/Documents/notify-function.ts
```

## 6. Check it

- Have one partner share a test idea, and don't open the app as the other. Within about a minute,
  the other gets "Something new is waiting in Ours".
- **Function logs** (Edge Functions → notify → Logs) show `notify: 1 sent, 0 failed, 0 unrecorded`.
- **Cron history:** `select status, return_message from cron.job_run_details order by start_time desc limit 5;`
- **Failures** show as short codes: `select last_error_code, count(*) from public.notification_outbox group by 1;`
  - `resend_rejected` usually means the From domain or the key is wrong.
  - `resend_unavailable` is retried, up to five attempts.

## Turning it off

```sql
select cron.unschedule('ours-notify');
```

Rows keep queueing, and nothing is lost. Before scheduling again, use step 5 to skip what built up.
