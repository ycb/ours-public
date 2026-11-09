import { describe, expect, it, vi } from "vitest";
import { deliverBatch, errorCode, localSmtpTransportOptions, notificationMessageId, renderNotification } from "./notify.mjs";

describe("renderNotification", () => {
  it("says only that something is waiting, with a link", () => {
    expect(renderNotification("idea_shared", "http://localhost:5173")).toEqual({
      subject: "Something new is waiting in Ours",
      text: "Your partner shared something with you.\n\nOpen Ours to see it: http://localhost:5173/ideas\n",
    });
  });

  it("says only that updates are waiting, with a link, for a digest", () => {
    expect(renderNotification("activity_digest", "http://localhost:5173/")).toEqual({
      subject: "There are updates waiting in Ours",
      text: "Open Ours to see them: http://localhost:5173/ideas\n",
    });
  });

  it("names no event, count, idea or person in any template", () => {
    for (const kind of ["idea_shared", "activity_digest"]) {
      const { subject, text } = renderNotification(kind, "http://localhost:5173");
      expect(`${subject}\n${text}`.replace("http://localhost:5173/ideas", "LINK")).not.toMatch(/\d|edit|repl|comment|declin|not now|agree|both|idea\b|categor/i);
    }
  });

  it("takes no content: its only inputs are the kind and the app URL", () => {
    expect(renderNotification.length).toBe(2);
  });

  it("refuses unknown kinds rather than sending something generic", () => {
    expect(() => renderNotification("something_else", "http://localhost:5173")).toThrow("unknown notification kind");
  });
});

describe("notificationMessageId", () => {
  it("uses only the outbox id and a fixed local domain", () => {
    expect(notificationMessageId("6c162c42-38c9-4e07-932a-9f33068d6af8")).toBe(
      "<6c162c42-38c9-4e07-932a-9f33068d6af8@ours.localhost>",
    );
  });
});

describe("errorCode", () => {
  it("maps failures to short codes and never to provider text", () => {
    expect(errorCode({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:54425" })).toBe("smtp_unavailable");
    expect(errorCode({ responseCode: 550, message: "550 mailbox someone@example.com unavailable" })).toBe("smtp_rejected");
    expect(errorCode(new Error("anything at all"))).toBe("send_failed");
  });
});

describe("localSmtpTransportOptions", () => {
  it("uses a generic SMTP client name so message headers never expose the Mac hostname", () => {
    expect(localSmtpTransportOptions(54425)).toEqual({
      host: "127.0.0.1",
      port: 54425,
      secure: false,
      ignoreTLS: true,
      name: "ours.localhost",
    });
  });
});

describe("deliverBatch", () => {
  const rows = [
    { id: "n1", kind: "idea_shared", recipient_email: "b@example.com" },
    { id: "n2", kind: "idea_shared", recipient_email: "b@example.com" },
  ];
  const digest = { id: "d1", kind: "activity_digest", recipient_email: "a@example.com" };
  const noop = () => vi.fn(async () => {});

  it("sends each claimed notification once and marks it sent", async () => {
    const send = vi.fn(async () => {});
    const markSent = vi.fn(async () => {});
    const markFailed = vi.fn(async () => {});
    const result = await deliverBatch({ claim: async () => rows, send, markSent, markFailed, appUrl: "http://localhost:5173" });
    expect(result).toEqual({ claimed: 2, sent: 2, failed: 0, unrecorded: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual({
      to: "b@example.com",
      subject: "Something new is waiting in Ours",
      text: expect.stringContaining("/ideas"),
      messageId: "<n1@ours.localhost>",
      outboxId: "n1",
    });
    expect(markSent.mock.calls.map(([id]) => id)).toEqual(["n1", "n2"]);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("does not let idea or person content influence the raw message inputs", async () => {
    const send = vi.fn(async () => {});
    const contentBearingRow = {
      ...rows[0],
      title: "Synthetic Secret Title",
      description: "Synthetic private description",
      message: "Synthetic private message",
      person_name: "Synthetic Person",
    };

    await deliverBatch({
      claim: async () => [contentBearingRow],
      send,
      markSent: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
      appUrl: "http://localhost:5173",
    });

    expect(send).toHaveBeenCalledWith({
      to: "b@example.com",
      subject: "Something new is waiting in Ours",
      text: "Your partner shared something with you.\n\nOpen Ours to see it: http://localhost:5173/ideas\n",
      messageId: "<n1@ours.localhost>",
      outboxId: "n1",
    });
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/Synthetic Secret|private description|private message|Synthetic Person/);
  });

  it("sends one email per claimed digest, never aggregating rows", async () => {
    const send = vi.fn(async () => {});
    const second = { ...digest, id: "d2" };
    const result = await deliverBatch({ claim: async () => [digest, second], send, markSent: noop(), markFailed: noop(), appUrl: "http://localhost:5173" });
    expect(result).toEqual({ claimed: 2, sent: 2, failed: 0, unrecorded: 0 });
    expect(send.mock.calls.map(([message]) => message)).toEqual([
      { to: "a@example.com", subject: "There are updates waiting in Ours", text: "Open Ours to see them: http://localhost:5173/ideas\n", messageId: "<d1@ours.localhost>", outboxId: "d1" },
      { to: "a@example.com", subject: "There are updates waiting in Ours", text: "Open Ours to see them: http://localhost:5173/ideas\n", messageId: "<d2@ours.localhost>", outboxId: "d2" },
    ]);
  });

  it("ignores candidate details even if a digest row carried them", async () => {
    const send = vi.fn(async () => {});
    const contentBearingDigest = {
      ...digest,
      event_types: ["comment_added", "item_edited"],
      item_ids: ["11111111-1111-4111-8111-111111111111"],
      count: 3,
      body: "Synthetic private reply",
      person_name: "Synthetic Person",
    };
    await deliverBatch({ claim: async () => [contentBearingDigest], send, markSent: noop(), markFailed: noop(), appUrl: "http://localhost:5173" });
    expect(send).toHaveBeenCalledWith({
      to: "a@example.com",
      subject: "There are updates waiting in Ours",
      text: "Open Ours to see them: http://localhost:5173/ideas\n",
      messageId: "<d1@ours.localhost>",
      outboxId: "d1",
    });
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/comment_added|item_edited|11111111|private reply|Synthetic Person|\b3\b/);
  });

  it("sends an identical message, with the same Message-ID, when a delivery is retried", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }))
      .mockResolvedValueOnce(undefined);
    const markSent = noop();
    const markFailed = noop();
    const first = await deliverBatch({ claim: async () => [digest], send, markSent, markFailed, appUrl: "http://localhost:5173" });
    const retry = await deliverBatch({ claim: async () => [digest], send, markSent, markFailed, appUrl: "http://localhost:5173" });
    expect(first).toEqual({ claimed: 1, sent: 0, failed: 1, unrecorded: 0 });
    expect(retry).toEqual({ claimed: 1, sent: 1, failed: 0, unrecorded: 0 });
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    expect(send.mock.calls[1][0].messageId).toBe("<d1@ours.localhost>");
    expect(markFailed).toHaveBeenCalledWith("d1", "smtp_unavailable");
    expect(markSent).toHaveBeenCalledWith("d1");
  });

  it("fails an unknown kind with a code instead of sending generic mail, and keeps going", async () => {
    const send = vi.fn(async () => {});
    const markSent = noop();
    const markFailed = noop();
    const result = await deliverBatch({
      claim: async () => [{ ...digest, id: "x1", kind: "item_edited" }, digest],
      send,
      markSent,
      markFailed,
      appUrl: "http://localhost:5173",
    });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, unrecorded: 0 });
    expect(markFailed).toHaveBeenCalledWith("x1", "send_failed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledWith("d1");
  });

  it("never marks a sent email failed when only recording the send fails (no duplicate on retry)", async () => {
    const send = vi.fn(async () => {});
    const markSent = vi.fn().mockRejectedValueOnce(Object.assign(new Error("markSent"), { code: "PGRST000" })).mockResolvedValue(undefined);
    const markFailed = noop();
    const result = await deliverBatch({ claim: async () => rows, send, markSent, markFailed, appUrl: "http://localhost:5173" });
    expect(result).toEqual({ claimed: 2, sent: 2, failed: 0, unrecorded: 1 });
    expect(markFailed).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps going when recording a failure fails", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }))
      .mockResolvedValueOnce(undefined);
    const markSent = noop();
    const markFailed = vi.fn().mockRejectedValue(Object.assign(new Error("markFailed"), { code: "PGRST000" }));
    const result = await deliverBatch({ claim: async () => rows, send, markSent, markFailed, appUrl: "http://localhost:5173" });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, unrecorded: 1 });
    expect(markSent).toHaveBeenCalledWith("n2");
  });

  it("refuses prototype keys as kinds", () => {
    for (const kind of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(() => renderNotification(kind, "http://localhost:5173")).toThrow("unknown notification kind");
    }
  });

  it("records a code for a failed send and keeps going", async () => {
    const send = vi.fn(async ({ to }) => {
      if (send.mock.calls.length === 1) throw Object.assign(new Error(`refused ${to}`), { code: "ECONNREFUSED" });
    });
    const markSent = vi.fn(async () => {});
    const markFailed = vi.fn(async () => {});
    const result = await deliverBatch({ claim: async () => rows, send, markSent, markFailed, appUrl: "http://localhost:5173" });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, unrecorded: 0 });
    expect(markFailed).toHaveBeenCalledWith("n1", "smtp_unavailable");
    expect(markSent).toHaveBeenCalledWith("n2");
  });
});
