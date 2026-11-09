#!/usr/bin/env node
/**
 * Local-only email worker (Task 7B). Delivers notification_outbox rows to the local stack's
 * Mailpit test inbox; nothing leaves the machine.
 *
 * - Reads the API URL and service-role key from `npx supabase status -o env` (never prints keys).
 * - Refuses to run against anything except 127.0.0.1 / localhost, and only sends to the local
 *   SMTP catcher (OURS_SMTP_PORT, default 54425 — see [local_smtp] smtp_port in config.toml).
 * - Every email is content-free (scripts/lib/notify.mjs). Logs only counts.
 *
 * Usage: npm run notify:worker          (polls every 10 s; Ctrl-C to stop)
 *        npm run notify:worker -- --once
 * Env:   OURS_APP_URL (default http://localhost:5173), OURS_SMTP_PORT (default 54425)
 */
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { deliverBatch, deliverReminders, localSmtpTransportOptions } from "./lib/notify.mjs";

const POLL_MS = 10_000;
const appUrl = process.env.OURS_APP_URL || "http://localhost:5173";
const smtpPort = Number(process.env.OURS_SMTP_PORT || 54425);
const once = process.argv.includes("--once");

function fail(message, error) {
  // Codes only: database and SMTP errors can echo addresses.
  const detail = error ? ` (code ${error.code ?? "?"})` : "";
  console.error(`notify-worker: ${message}${detail}`);
  process.exit(1);
}

function readStatus() {
  let output;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    fail("Local Supabase is not running. Start it with `npx supabase start`.");
  }
  const env = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const status = readStatus();
const apiUrl = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!apiUrl || !serviceKey) fail("Could not read API_URL and the service key from `supabase status`.");
const isLocal = (url) => ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
if (!isLocal(apiUrl) || !isLocal(appUrl)) fail("Refusing to run against a non-local project or app URL.");

const db = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const mail = nodemailer.createTransport(localSmtpTransportOptions(smtpPort));

const rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Object.assign(new Error(fn), { code: error.code });
  return data;
};

async function tick() {
  const result = await deliverBatch({
    claim: () => rpc("claim_notifications", { p_limit: 20 }).then((rows) => rows ?? []),
    send: ({ to, subject, text, messageId }) =>
      mail.sendMail({ from: "Ours <notifications@ours.localhost>", to, subject, text, messageId }),
    markSent: (id) => rpc("mark_notification_sent", { p_id: id }),
    markFailed: (id, code) => rpc("mark_notification_failed", { p_id: id, p_code: code }),
    appUrl,
  });
  if (result.claimed > 0) {
    const unrecorded = result.unrecorded > 0 ? `, ${result.unrecorded} not recorded (retried after the claim expires)` : "";
    console.log(`notify-worker: ${result.sent} sent, ${result.failed} failed${unrecorded}`);
  }
  // Reflection reminders (QA 2026-11-03), after the outbox, like the production function.
  const reminders = await deliverReminders({
    claim: () => rpc("claim_reflection_reminders", { p_limit: 20 }).then((rows) => rows ?? []),
    send: ({ to, subject, text, messageId }) =>
      mail.sendMail({ from: "Ours <notifications@ours.localhost>", to, subject, text, messageId }),
    markSent: (drawId, memberId) => rpc("mark_reflection_reminder_sent", { p_draw_id: drawId, p_member_id: memberId }),
    markFailed: (drawId, memberId, code) =>
      rpc("mark_reflection_reminder_failed", { p_draw_id: drawId, p_member_id: memberId, p_code: code }),
    appUrl,
  });
  if (reminders.claimed > 0) console.log(`notify-worker: reminders ${reminders.sent} sent, ${reminders.failed} failed`);
}

async function run() {
  console.log(`notify-worker: delivering to the local test inbox (SMTP port ${smtpPort})${once ? " once" : ", every 10 s"}`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error(`notify-worker: batch failed (code ${error.code ?? "?"})`);
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

await run();
