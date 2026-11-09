/**
 * The local worker's view of notification email. The pure logic lives with the Edge Function
 * (supabase/functions/_shared/notify.mjs) so local and production send the same content-free words.
 */
export { deliverBatch, deliverReminders, errorCode, notificationMessageId, renderNotification } from "../../supabase/functions/_shared/notify.mjs";

/** Keep the SMTP handshake free of the local machine's user-derived hostname. */
export function localSmtpTransportOptions(port) {
  return {
    host: "127.0.0.1",
    port,
    secure: false,
    ignoreTLS: true,
    name: "ours.localhost",
  };
}

