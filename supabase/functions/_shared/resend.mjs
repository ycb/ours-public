/**
 * Production delivery through Resend (QA 2026-11-03). Pure apart from the injected fetch, so the
 * same code runs in the Edge Function and under vitest.
 *
 * - Plain text only; the words come from ./notify.mjs and are content-free.
 * - The outbox id is the Resend idempotency key: if a send succeeded but recording it failed, the
 *   reclaimed retry is swallowed by Resend instead of emailing twice (within Resend's window).
 * - Errors carry short codes only; provider responses can echo addresses.
 */
export function resendSender({ apiKey, from, fetch: fetchImpl = fetch }) {
  return async ({ to, subject, text, outboxId }) => {
    let response;
    try {
      response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `ours-outbox-${outboxId}`,
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
    } catch {
      throw Object.assign(new Error("resend unavailable"), { code: "resend_unavailable" });
    }
    if (response.ok) return;
    const code = response.status === 429 || response.status >= 500 ? "resend_unavailable" : "resend_rejected";
    throw Object.assign(new Error(`resend ${response.status}`), { code });
  };
}

/** Constant-time comparison, so the secret can't be guessed a character at a time. */
function sameSecret(given, expected) {
  if (typeof given !== "string" || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

/**
 * The scheduler calls this once a minute with the cron secret; anyone else gets 401 and nothing
 * happens. One batch per call; the response carries counts or a short code, nothing else.
 */
export async function handleNotifyRequest(request, { secret, deliver, deliverReminders }) {
  if (!sameSecret(request.headers.get("x-ours-cron-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await deliver();
    // Reflection reminders (QA 2026-11-03) go out after the outbox, in the same scheduled call.
    return Response.json(deliverReminders ? { ...result, reminders: await deliverReminders() } : result);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Za-z0-9_]{1,40}$/.test(error.code) ? error.code : "batch_failed";
    return Response.json({ error: code }, { status: 500 });
  }
}
