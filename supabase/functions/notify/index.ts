// Production email sender (QA 2026-11-03). Called once a minute by pg_cron through pg_net with the
// cron secret; claims due notifications and sends each through Resend. Logs and returns counts only.
//
// Secrets (set with `npx supabase secrets set`, never committed):
//   RESEND_API_KEY   a sending-only key restricted to the Ours domain
//   OURS_FROM        e.g. "Ours <ours@yourdomain>"
//   OURS_APP_URL     e.g. "https://ours.yourdomain"
//   OURS_CRON_SECRET a long random string, also stored in Vault for the cron job
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import { deliverBatch, deliverReminders } from "../_shared/notify.mjs";
import { handleNotifyRequest, resendSender } from "../_shared/resend.mjs";

const env = (name: string) => Deno.env.get(name) ?? "";

Deno.serve((request: Request) =>
  handleNotifyRequest(request, {
    secret: env("OURS_CRON_SECRET"),
    deliver: async () => {
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const rpc = async (fn: string, args: Record<string, unknown>) => {
        const { data, error } = await db.rpc(fn, args);
        if (error) throw Object.assign(new Error(fn), { code: error.code });
        return data;
      };
      const result = await deliverBatch({
        claim: () => rpc("claim_notifications", { p_limit: 20 }).then((rows) => rows ?? []),
        send: resendSender({ apiKey: env("RESEND_API_KEY"), from: env("OURS_FROM") }),
        markSent: (id: string) => rpc("mark_notification_sent", { p_id: id }),
        markFailed: (id: string, code: string) => rpc("mark_notification_failed", { p_id: id, p_code: code }),
        appUrl: env("OURS_APP_URL"),
      });
      if (result.claimed > 0) console.log(`notify: ${result.sent} sent, ${result.failed} failed, ${result.unrecorded} unrecorded`);
      return result;
    },
    deliverReminders: async () => {
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const rpc = async (fn: string, args: Record<string, unknown>) => {
        const { data, error } = await db.rpc(fn, args);
        if (error) throw Object.assign(new Error(fn), { code: error.code });
        return data;
      };
      const result = await deliverReminders({
        claim: () => rpc("claim_reflection_reminders", { p_limit: 20 }).then((rows) => rows ?? []),
        send: resendSender({ apiKey: env("RESEND_API_KEY"), from: env("OURS_FROM") }),
        markSent: (drawId: string, memberId: string) => rpc("mark_reflection_reminder_sent", { p_draw_id: drawId, p_member_id: memberId }),
        markFailed: (drawId: string, memberId: string, code: string) =>
          rpc("mark_reflection_reminder_failed", { p_draw_id: drawId, p_member_id: memberId, p_code: code }),
        appUrl: env("OURS_APP_URL"),
      });
      if (result.claimed > 0) console.log(`notify: reminders ${result.sent} sent, ${result.failed} failed, ${result.unrecorded} unrecorded`);
      return result;
    },
  })
);
