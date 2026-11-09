/**
 * Content-free notification email (Tasks 7B, 7D.4). Pure: no I/O, no content inputs.
 * Shared by the local worker (scripts/notify-worker.mjs, via scripts/lib/notify.mjs) and the
 * production Edge Function (supabase/functions/notify), so both send exactly the same words.
 * The only things an email may say are which kind of thing happened and where to open Ours.
 */

// One email per claimed delivery. Batching happens in Postgres; the worker never sees which
// events a digest covers, how many there are, or what they are about.
const MESSAGES = {
  idea_shared: {
    subject: "Something new is waiting in Ours",
    body: (link) => `Your partner shared something with you.\n\nOpen Ours to see it: ${link}\n`,
  },
  activity_digest: {
    subject: "There are updates waiting in Ours",
    body: (link) => `Open Ours to see them: ${link}\n`,
  },
  // QA 2026-11-03: once per person per date, after it. Never the idea's name.
  reflection_reminder: {
    subject: "A moment to look back on, in Ours",
    body: (link) => `Open Ours to see it: ${link}\n`,
  },
};

export function renderNotification(kind, appUrl) {
  const message = Object.hasOwn(MESSAGES, kind) ? MESSAGES[kind] : undefined;
  if (!message) throw new Error("unknown notification kind");
  const link = `${String(appUrl).replace(/\/+$/, "")}/ideas`;
  return { subject: message.subject, text: message.body(link) };
}

/** Stable across retries and derived only from the content-free outbox id. */
export function notificationMessageId(outboxId) {
  return `<${outboxId}@ours.localhost>`;
}

/** Short codes only: provider messages can echo addresses or anything else. */
export function errorCode(error) {
  // The Resend sender (./resend.mjs) already throws with a short code.
  if (error && ["resend_rejected", "resend_unavailable"].includes(error.code)) return error.code;
  if (error && ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ESOCKET", "ECONNECTION"].includes(error.code)) {
    return "smtp_unavailable";
  }
  if (error && typeof error.responseCode === "number") return "smtp_rejected";
  return "send_failed";
}

/**
 * Claims a batch, attempts each delivery, and records the outcome. Logs nothing itself.
 *
 * A send that succeeded is never marked failed, even if recording it fails: that would release
 * the claim and email the same batch again. The unrecorded claim instead expires after ten minutes
 * and is reclaimed, which rechecks seen state (rare duplicates are the accepted at-least-once cost).
 * A failure to record anything never stops the rest of the batch.
 */
export async function deliverBatch({ claim, send, markSent, markFailed, appUrl }) {
  const rows = await claim();
  let sent = 0;
  let failed = 0;
  let unrecorded = 0;
  for (const row of rows) {
    let delivered = false;
    try {
      const { subject, text } = renderNotification(row.kind, appUrl);
      await send({
        to: row.recipient_email,
        subject,
        text,
        messageId: notificationMessageId(row.id),
        outboxId: row.id,
      });
      delivered = true;
      sent += 1;
      await markSent(row.id);
    } catch (error) {
      if (delivered) {
        unrecorded += 1;
        continue;
      }
      failed += 1;
      try {
        await markFailed(row.id, errorCode(error));
      } catch {
        unrecorded += 1;
      }
    }
  }
  return { claimed: rows.length, sent, failed, unrecorded };
}

/**
 * Reflection reminders (QA 2026-11-03): the same rules as deliverBatch, keyed by (date, person).
 * A send that succeeded is never marked failed; a failure is recorded by short code only.
 */
export async function deliverReminders({ claim, send, markSent, markFailed, appUrl }) {
  const rows = await claim();
  let sent = 0;
  let failed = 0;
  let unrecorded = 0;
  const { subject, text } = renderNotification("reflection_reminder", appUrl);
  for (const row of rows) {
    let delivered = false;
    try {
      await send({
        to: row.recipient_email,
        subject,
        text,
        outboxId: `reminder-${row.draw_id}-${row.member_id}`,
        messageId: `<reminder-${row.draw_id}-${row.member_id}@ours.localhost>`,
      });
      delivered = true;
      sent += 1;
      await markSent(row.draw_id, row.member_id);
    } catch (error) {
      if (delivered) {
        unrecorded += 1;
        continue;
      }
      failed += 1;
      try {
        await markFailed(row.draw_id, row.member_id, errorCode(error));
      } catch {
        unrecorded += 1;
      }
    }
  }
  return { claimed: rows.length, sent, failed, unrecorded };
}
