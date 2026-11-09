import { describe, expect, it, vi } from "vitest";
import { handleNotifyRequest, resendSender } from "../../supabase/functions/_shared/resend.mjs";
import { errorCode } from "./notify.mjs";

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ id: "re_synthetic" }), { status: 200 }));

describe("resendSender", () => {
  it("sends plain text from the configured address, keyed by the outbox id so a retry never sends twice", async () => {
    const fetch = okFetch();
    const send = resendSender({ apiKey: "re_test_synthetic", from: "Ours <ours@example.invalid>", fetch });
    await send({ to: "synthetic@example.invalid", subject: "S", text: "T", outboxId: "00000000-0000-4000-8000-000000000001" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_synthetic",
      "Content-Type": "application/json",
      "Idempotency-Key": "ours-outbox-00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.parse(init.body)).toEqual({ from: "Ours <ours@example.invalid>", to: ["synthetic@example.invalid"], subject: "S", text: "T" });
  });

  it("turns failures into short codes, never provider text", async () => {
    const rejected = resendSender({ apiKey: "k", from: "f", fetch: vi.fn(async () => new Response('{"message":"synthetic@example.invalid is bad"}', { status: 422 })) });
    const busy = resendSender({ apiKey: "k", from: "f", fetch: vi.fn(async () => new Response("{}", { status: 429 })) });
    const down = resendSender({ apiKey: "k", from: "f", fetch: vi.fn(async () => { throw new TypeError("network"); }) });
    const args = { to: "synthetic@example.invalid", subject: "S", text: "T", outboxId: "x" };
    await expect(rejected(args)).rejects.toMatchObject({ code: "resend_rejected" });
    await expect(busy(args)).rejects.toMatchObject({ code: "resend_unavailable" });
    await expect(down(args)).rejects.toMatchObject({ code: "resend_unavailable" });
    for (const send of [rejected, busy, down]) {
      const error = await send(args).catch((caught) => caught);
      expect(errorCode(error)).toBe(error.code);
      expect(String(error.message)).not.toMatch(/example\.invalid/);
    }
  });
});

describe("handleNotifyRequest", () => {
  const deps = (overrides = {}) => ({
    secret: "synthetic-cron-secret",
    deliver: vi.fn(async () => ({ claimed: 2, sent: 2, failed: 0, unrecorded: 0 })),
    ...overrides,
  });
  const request = (secret) =>
    new Request("https://example.invalid/functions/v1/notify", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-ours-cron-secret": secret },
    });

  it("refuses a caller without the cron secret, and sends nothing", async () => {
    const d = deps();
    expect((await handleNotifyRequest(request(undefined), d)).status).toBe(401);
    expect((await handleNotifyRequest(request("wrong"), d)).status).toBe(401);
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    const d = deps({ secret: "" });
    expect((await handleNotifyRequest(request(""), d)).status).toBe(401);
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("delivers one batch for the scheduler and reports counts only", async () => {
    const d = deps();
    const response = await handleNotifyRequest(request("synthetic-cron-secret"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 2, sent: 2, failed: 0, unrecorded: 0 });
  });

  it("reports a failed batch by code only", async () => {
    const d = deps({ deliver: vi.fn(async () => { throw Object.assign(new Error("synthetic@example.invalid"), { code: "PGRST301" }); }) });
    const response = await handleNotifyRequest(request("synthetic-cron-secret"), d);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "PGRST301" });
  });
});
