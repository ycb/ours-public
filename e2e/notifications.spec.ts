/**
 * Task 7D.5: the unseen-activity email loop, end to end, on the local stack only.
 *
 * Two synthetic partners act through the real app in separate browser contexts; the local worker
 * delivers to Mailpit. The only privileged write is backdating synthetic `not_before` timestamps
 * (e2e/local.ts makeDue) so the run does not wait five minutes or an hour.
 *
 * Preconditions: `npx supabase db reset && npm run dev:accounts` (a clean, seeded local stack).
 * Run: `npx playwright test e2e/notifications.spec.ts`
 */
import { hostname } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import {
  APP_URL,
  COUPLE_ID,
  PARTNER_A,
  PARTNER_B,
  body,
  clearMailpit,
  headers,
  mailpitRaw,
  makeDue,
  runWorkerOnce,
  signIn,
  sql,
  until,
} from "./local";

const CATEGORY = "Synthetic Notify Category";
const SEEN = { title: "Synthetic Seen Share", description: "Synthetic seen description." };
const UNSEEN = { title: "Synthetic Unseen Share", description: "Synthetic unseen description." };
const EDITED_TITLE = "Synthetic Seen Share Edited";
const EDITED_DESCRIPTION = "Synthetic unseen description, co-edited.";
const LIVE_REPLY = "Synthetic live reply from A";
const B_REPLY = "Synthetic reply from B";
const HOLD_REASON = "Synthetic hold reason";

const SHARE_TEXT = "Your partner shared something with you.";
const DIGEST_TEXT = "Open Ours to see them:";

const one = <T>(rows: T[]): T => {
  expect(rows).toHaveLength(1);
  return rows[0];
};
const shareDelivery = (itemId: string) =>
  one(
    sql<{ id: string }>(`
      select o.id from public.notification_outbox o
      join public.notification_outbox_events l on l.outbox_id = o.id
      join public.activity_events e on e.id = l.activity_event_id
      where e.item_id = '${itemId}' and o.kind = 'idea_shared'`),
  ).id;
const openDigest = (memberId: string) =>
  one(
    sql<{ id: string }>(`
      select id from public.notification_outbox
      where recipient_member_id = '${memberId}' and kind = 'activity_digest' and sealed_at is null`),
  ).id;
const event = (itemId: string, type: string, actor: string) =>
  one(
    sql<{ id: string }>(`
      select id from public.activity_events
      where item_id = '${itemId}' and event_type = '${type}' and actor_member_id = '${actor}'
      order by created_at desc limit 1`),
  ).id;
const hasEvent = (itemId: string, type: string, actor: string) =>
  sql(`select 1 from public.activity_events where item_id = '${itemId}' and event_type = '${type}' and actor_member_id = '${actor}'`)
    .length > 0;
const acknowledged = (eventId: string, memberId: string) =>
  sql(`select 1 from public.activity_event_acknowledgements where activity_event_id = '${eventId}' and member_id = '${memberId}'`)
    .length === 1;
const delivery = (id: string) =>
  one(
    sql<{ sealed: boolean; suppressed: boolean; sent: boolean; live: number; seen: number }>(`
      select o.sealed_at is not null as sealed, o.suppressed_at is not null as suppressed, o.sent_at is not null as sent,
        (select count(*) from public.notification_outbox_events l where l.outbox_id = o.id and l.suppressed_at is null)::int as live,
        (select count(*) from public.notification_outbox_events l where l.outbox_id = o.id and l.suppressed_at is not null)::int as seen
      from public.notification_outbox o where o.id = '${id}'`),
  );

async function shareIdea(page: Page, idea: { title: string; description: string }, newCategory: boolean) {
  await page.goto("/ideas/new");
  await page.getByLabel("Title", { exact: true }).fill(idea.title);
  await page.getByLabel(/^Description/).fill(idea.description);
  if (newCategory) {
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Category name").fill(CATEGORY);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByLabel("Category", { exact: true })).not.toHaveValue("");
  } else {
    await page.getByLabel("Category", { exact: true }).selectOption({ label: CATEGORY });
  }
  await page.getByRole("button", { name: `Share with ${PARTNER_B.name}` }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  // The id comes from the page URL and is interpolated into local SQL: accept only a UUID.
  const itemId = new URL(page.url()).pathname.split("/").pop() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(itemId)) throw new Error("unexpected idea id");
  // Leave the idea so this browser cannot acknowledge later activity on it.
  await page.goto("/ideas");
  return itemId;
}

async function openIdea(page: Page, itemId: string) {
  await page.goto(`/ideas/${itemId}`);
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
}

async function sendMessage(page: Page, partnerName: string, text: string) {
  await page.getByLabel(`Message to ${partnerName}`).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("unseen activity becomes generic email; seen activity does not", async ({ browser }) => {
  // ---------- Preconditions: a clean local stack ----------
  expect(sql(`select 1 from public.items where couple_id = '${COUPLE_ID}'`), "run `npx supabase db reset && npm run dev:accounts` first").toHaveLength(0);
  expect(sql(`select 1 from public.notification_outbox`), "the outbox starts empty").toHaveLength(0);
  await clearMailpit();

  const a = await signIn(browser, PARTNER_A);
  const b = await signIn(browser, PARTNER_B);

  // ---------- Shares: one seen inside the grace period, one unseen ----------
  const seenId = await shareIdea(a, SEEN, true);
  const unseenId = await shareIdea(a, UNSEEN, false);
  const seenShare = shareDelivery(seenId);
  const unseenShare = shareDelivery(unseenId);

  await openIdea(b, seenId);
  await until("B's view acknowledges the seen share", () => acknowledged(event(seenId, "item_created", PARTNER_A.memberId), PARTNER_B.memberId));
  await b.goto("/ideas");

  makeDue([seenShare, unseenShare]);
  runWorkerOnce();
  expect(delivery(seenShare)).toMatchObject({ sealed: true, suppressed: true, sent: false, live: 0, seen: 1 });
  expect(delivery(unseenShare)).toMatchObject({ sealed: true, suppressed: false, sent: true, live: 1 });
  expect(await mailpitRaw(), "only the unseen share was emailed").toHaveLength(1);

  // ---------- Live: an open, visible idea receives a reply and advances seen state ----------
  await openIdea(b, unseenId);
  await openIdea(a, unseenId);
  await sendMessage(a, PARTNER_B.name, LIVE_REPLY);
  await expect(b.getByRole("list", { name: "Messages" }).getByText(LIVE_REPLY), "the reply appears for B without a refresh").toBeVisible();
  await until("B's live view acknowledges the reply", () =>
    hasEvent(unseenId, "comment_added", PARTNER_A.memberId) && acknowledged(event(unseenId, "comment_added", PARTNER_A.memberId), PARTNER_B.memberId),
  );

  // A edits the other idea (B's digest gets a second candidate), then leaves.
  await openIdea(a, seenId);
  await a.getByLabel("Title", { exact: true }).fill(EDITED_TITLE);
  await a.getByLabel("Title", { exact: true }).press("Enter");
  await expect(a.getByText("Saved", { exact: true })).toBeVisible();
  await a.goto("/ideas");

  // ---------- B's reply, agreement, co-edit and hold all go to A's one digest ----------
  await sendMessage(b, PARTNER_A.name, B_REPLY);
  await until("B's reply is recorded", () => hasEvent(unseenId, "comment_added", PARTNER_B.memberId));
  await b.getByRole("button", { name: "I'm in" }).click();
  await until("both are in", () => hasEvent(unseenId, "item_became_eligible", PARTNER_B.memberId));
  await b.getByLabel("Description", { exact: true }).fill(EDITED_DESCRIPTION);
  await b.getByLabel("Description", { exact: true }).press("Tab");
  await expect(b.getByText(`${PARTNER_A.name} will be asked again`)).toBeVisible();
  await expect(b.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 });
  await until("B's edit is recorded", () => hasEvent(unseenId, "item_edited", PARTNER_B.memberId));

  // Opening the edited idea is how B sees A's edit; then B suggests Later, with a note.
  await openIdea(b, seenId);
  await until("B sees A's edit", () => acknowledged(event(seenId, "item_edited", PARTNER_A.memberId), PARTNER_B.memberId));
  await b.getByRole("button", { name: "Maybe later" }).click();
  await b.getByLabel(/Anything you.d want to talk about first\?/).fill(HOLD_REASON);
  // A is in, so B's Later is a suggestion until A agrees (Later is mutual, QA 2026-11-03).
  await b.getByRole("button", { name: "Suggest Later" }).click();
  await until("the hold is recorded", () => hasEvent(seenId, "item_declined", PARTNER_B.memberId));
  await b.goto("/ideas");

  const digestToA = openDigest(PARTNER_A.memberId);
  const digestToB = openDigest(PARTNER_B.memberId);
  expect(delivery(digestToA), "four events across two ideas share one digest").toMatchObject({ live: 4 });
  expect(delivery(digestToB)).toMatchObject({ live: 2 });

  // A sees only the hold (one idea of two) before the digest is due.
  await openIdea(a, seenId);
  await until("A sees the hold", () => acknowledged(event(seenId, "item_declined", PARTNER_B.memberId), PARTNER_A.memberId));
  await a.goto("/ideas");

  makeDue([digestToA, digestToB]);
  runWorkerOnce();
  expect(delivery(digestToB), "an entirely seen digest sends nothing").toMatchObject({ suppressed: true, sent: false, live: 0, seen: 2 });
  expect(delivery(digestToA), "a partly seen digest sends once for the unseen remainder").toMatchObject({
    suppressed: false,
    sent: true,
    live: 3,
    seen: 1,
  });

  // ---------- Raw messages: generic, addressed correctly, no content or private identifiers ----------
  const raws = await mailpitRaw();
  expect(raws).toHaveLength(2);
  const expected = new Map([
    [`<${unseenShare}@ours.localhost>`, { to: PARTNER_B.email, subject: "Something new is waiting in Ours", text: SHARE_TEXT }],
    [`<${digestToA}@ours.localhost>`, { to: PARTNER_A.email, subject: "There are updates waiting in Ours", text: DIGEST_TEXT }],
  ]);
  const ids = sql<{ id: string }>(`
    select id from public.items where couple_id = '${COUPLE_ID}'
    union all select id from public.activity_events where couple_id = '${COUPLE_ID}'
    union all select id from public.comments where couple_id = '${COUPLE_ID}'
    union all select id from public.categories where couple_id = '${COUPLE_ID}'
    union all select id from public.members where couple_id = '${COUPLE_ID}'
    union all select auth_user_id from public.members where couple_id = '${COUPLE_ID}'`).map((row) => row.id);
  const forbidden = [
    SEEN.title,
    SEEN.description,
    UNSEEN.title,
    UNSEEN.description,
    EDITED_TITLE,
    EDITED_DESCRIPTION,
    LIVE_REPLY,
    B_REPLY,
    HOLD_REASON,
    CATEGORY,
    PARTNER_A.name,
    PARTNER_B.name,
    COUPLE_ID,
    ...ids,
  ];
  const machine = hostname().split(".")[0];

  for (const raw of raws) {
    const head = headers(raw);
    const want = expected.get(head["message-id"]);
    expect(want, `unexpected Message-ID ${head["message-id"]}`).toBeDefined();
    expected.delete(head["message-id"]);
    expect(head.to).toContain(want!.to);
    expect(head.to).not.toContain(want!.to === PARTNER_A.email ? PARTNER_B.email : PARTNER_A.email);
    expect(head.from).toMatch(/^"?Ours"? <notifications@ours\.localhost>$/);
    expect(head.subject).toBe(want!.subject);
    expect(head._all, "the SMTP greeting is the generic client name").toMatch(/^Received: from ours\.localhost/im);
    const text = body(raw);
    expect(text).toContain(want!.text);
    expect(text).toContain(`${APP_URL}/ideas`);
    expect(text).not.toMatch(/\/ideas\/[0-9a-f-]{36}/);
    for (const value of forbidden) expect(raw, "no content or private id in the raw message").not.toContain(value);
    if (machine.length > 2 && machine !== "localhost") expect(raw.toLowerCase()).not.toContain(machine.toLowerCase());
    expect(raw, "no keys or tokens").not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role/);
  }
  expect(expected.size, "both expected messages arrived").toBe(0);
});
