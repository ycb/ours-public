import { describe, expect, it, vi } from "vitest";
import { deliverReminders, renderNotification } from "../../supabase/functions/_shared/notify.mjs";
import { handleNotifyRequest } from "../../supabase/functions/_shared/resend.mjs";

describe("reflection reminders (QA 2026-11-03)", () => {
  it("say nothing about the idea: only that there is a moment to look back on, and where", () => {
    expect(renderNotification("reflection_reminder", "https://ours.example.invalid/")).toEqual({
      subject: "A moment to look back on, in Ours",
      text: "Open Ours to see it: https://ours.example.invalid/ideas\n",
    });
  });

  it("send one email per claimed reminder and mark each sent", async () => {
    const send = vi.fn(async () => undefined);
    const markSent = vi.fn(async () => undefined);
    const result = await deliverReminders({
      claim: async () => [
        { draw_id: "d1", member_id: "m1", recipient_email: "a@example.invalid" },
        { draw_id: "d2", member_id: "m2", recipient_email: "b@example.invalid" },
      ],
      send,
      markSent,
      markFailed: vi.fn(),
      appUrl: "https://ours.example.invalid",
    });
    expect(result).toEqual({ claimed: 2, sent: 2, failed: 0, unrecorded: 0 });
    expect(send.mock.calls.map(([args]) => [args.to, args.subject, args.outboxId])).toEqual([
      ["a@example.invalid", "A moment to look back on, in Ours", "reminder-d1-m1"],
      ["b@example.invalid", "A moment to look back on, in Ours", "reminder-d2-m2"],
    ]);
    expect(markSent.mock.calls).toEqual([["d1", "m1"], ["d2", "m2"]]);
  });

  it("record a failure by code, and never mark a sent email failed", async () => {
    const markFailed = vi.fn(async () => undefined);
    const result = await deliverReminders({
      claim: async () => [
        { draw_id: "d1", member_id: "m1", recipient_email: "a@example.invalid" },
        { draw_id: "d2", member_id: "m2", recipient_email: "b@example.invalid" },
      ],
      send: vi.fn(async ({ to }) => {
        if (to.startsWith("a")) throw Object.assign(new Error("a@example.invalid"), { code: "resend_rejected" });
      }),
      markSent: vi.fn(async () => {
        throw new Error("record failed");
      }),
      markFailed,
      appUrl: "https://ours.example.invalid",
    });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, unrecorded: 1 });
    expect(markFailed.mock.calls).toEqual([["d1", "m1", "resend_rejected"]]);
  });

  it("the scheduled function runs reminders after the outbox, and reports both", async () => {
    const response = await handleNotifyRequest(
      new Request("https://example.invalid", { method: "POST", headers: { "x-ours-cron-secret": "s" } }),
      {
        secret: "s",
        deliver: async () => ({ claimed: 1, sent: 1, failed: 0, unrecorded: 0 }),
        deliverReminders: async () => ({ claimed: 1, sent: 1, failed: 0, unrecorded: 0 }),
      },
    );
    expect(await response.json()).toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
      unrecorded: 0,
      reminders: { claimed: 1, sent: 1, failed: 0, unrecorded: 0 },
    });
  });
});
