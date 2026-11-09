/**
 * Task 10: the complete synthetic personal-alpha loop, on the local stack only, in real browsers.
 * share → respond → both in → deal → accept → when → we did it → reflect → expand, then identity switching and
 * cross-couple isolation. The content-free email check is e2e/notifications.spec.ts (step 14).
 *
 * Preconditions: `npx supabase db reset && npm run dev:accounts`. Names carry a per-run suffix, so
 * this spec does not need an empty couple; notifications.spec.ts (which does) runs first.
 */
import { expect, test, type Page } from "@playwright/test";
import { COUPLE_B, provisionCoupleB, removeCoupleB } from "./fixtures";
import { PARTNER_A, PARTNER_B, idFromUrl, newIdea, signIn, signInOn, sql, uuid } from "./local";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const run = Date.now().toString(36);
const CATEGORY = `Synthetic Loop Category ${run}`;
const ITEM = `Synthetic Item A ${run}`;
const DRAFT = `Synthetic Private Draft A ${run}`;
const MEMORY = `Synthetic Memory A ${run}`;
const RELATED = `Synthetic Related A ${run}`;


const decisions = (itemId: string) =>
  Object.fromEntries(
    sql<{ member_id: string; roulette_decision: string }>(
      `select member_id, roulette_decision from public.item_responses where item_id = '${uuid(itemId)}'`,
    ).map((row) => [row.member_id, row.roulette_decision]),
  );
const draws = (itemId: string) =>
  sql<{ id: string; outcome: string; drawn_by_member_id: string }>(
    `select id, outcome, drawn_by_member_id from public.roulette_draws where item_id = '${uuid(itemId)}'`,
  );

test.beforeAll(provisionCoupleB);
test.afterAll(removeCoupleB);

test("the synthetic loop: share, agree, spin, remember, expand, switch identity, stay isolated", async ({ browser }) => {
  let a!: Page, b!: Page, outsider!: Page;
  let itemId = "", draftId = "", relatedId = "";
  let memory: { id: string; draw_id: string }[] = [];
  await test.step("1–2. Partner A signs in, creates a category and shares Synthetic Item A; keeps a private draft.", async () => {
    a = await signIn(browser, PARTNER_A);
    itemId = await newIdea(a, ITEM, { category: CATEGORY, newCategory: true, share: true });
    draftId = await newIdea(a, DRAFT, { category: CATEGORY, share: false });
  });

  await test.step("3–4. A rates and favorites it; sharing was A's yes, and that alone is not agreement.", async () => {
    await a.goto(`/ideas/${itemId}`);
    await a.getByRole("radiogroup", { name: "How into it?" }).getByText("Into it", { exact: true }).click();
    await a.getByRole("button", { name: "Favorite" }).click();
    await expect(a.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
    expect(decisions(itemId)).toEqual({ [PARTNER_A.memberId]: "ready", [PARTNER_B.memberId]: "pending" });
    await a.goto("/plan");
    await expect(a.locator("main")).not.toContainText(ITEM);
  });

  await test.step("5. Partner B, in a separate browser, sees it, responds, and is in.", async () => {
    b = await signIn(browser, PARTNER_B);
    await expect(b.getByRole("list", { name: "Ideas" }).getByText(ITEM)).toBeVisible();
    await expect(b.locator("main")).not.toContainText(DRAFT);
    await b.goto(`/ideas/${itemId}`);
    await b.getByRole("radiogroup", { name: "How into it?" }).getByText("Curious", { exact: true }).click();
    await b.getByRole("button", { name: "I'm in" }).click();
    await expect.poll(() => decisions(itemId)[PARTNER_B.memberId]).toBe("ready");
  });

  await test.step("6. It is agreed: it moves to Plan.", async () => {
    await a.goto("/plan");
    await expect(a.getByRole("list", { name: "Agreed ideas" }).getByText(ITEM)).toBeVisible();
  });

  await test.step("7. Deal a card (within this run's category); Deal another records nothing.", async () => {
    await a.getByRole("group", { name: "Filter ideas" }).getByRole("button", { name: CATEGORY }).click();
    await a.getByRole("button", { name: "Deal a card" }).click();
    await expect(a.getByRole("heading", { level: 2, name: ITEM })).toBeVisible();
    await a.getByRole("button", { name: "Deal another" }).click();
    await a.getByRole("button", { name: "Deal a card" }).click();
    await expect(a.getByRole("heading", { level: 2, name: ITEM })).toBeVisible();
    expect(draws(itemId)).toEqual([]);
  });

  await test.step("8. Let's do it records exactly one draw, attributed to A.", async () => {
    await a.getByRole("button", { name: "Let's do it" }).click();
    await expect(a.getByText("It's a date.")).toBeVisible();
    await expect.poll(() => draws(itemId).length).toBe(1);
    expect(draws(itemId)[0]).toMatchObject({ outcome: "accepted", drawn_by_member_id: PARTNER_A.memberId });
  });

  await test.step("9. A plans it for tonight, they do it, and A reflects: a memory linked to that draw.", async () => {
    // QA 2026-11-03: the accepted pick asks When?; reflecting happens after We did it.
    await a.getByRole("group", { name: "When?" }).getByRole("button", { name: "Tonight" }).click();
    await expect(a.getByRole("group", { name: "When?" }).getByRole("button", { name: "Tonight" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => sql(`select planned_when from public.roulette_draws where item_id = '${itemId}'`)).toEqual([{ planned_when: "tonight" }]);
    await a.goto("/plan");
    await a.getByRole("button", { name: `Up next: ${ITEM}, Tonight` }).click();
    await a.getByRole("dialog", { name: ITEM }).getByRole("button", { name: "We did it" }).click();
    await expect(a.getByRole("button", { name: /Up next:/ })).toHaveCount(0);
    await a.goto(`/ideas/${itemId}`);
    await a.getByRole("button", { name: "How was it? Add yours" }).click();
    const sheet = a.getByRole("dialog", { name: `How was ${ITEM}?` });
    await sheet.getByLabel("What did you enjoy?").fill(MEMORY);
    await sheet.getByRole("button", { name: `Share with ${PARTNER_B.name}` }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => sql(`select 1 from public.memories where item_id = '${itemId}'`).length).toBe(1);
    memory = sql<{ id: string; draw_id: string }>(
      `select id, draw_id from public.memories where item_id = '${itemId}'`,
    );
    expect(memory).toEqual([{ id: expect.stringMatching(UUID), draw_id: draws(itemId)[0].id }]);
  });

  await test.step("10. A creates a related idea from the memory; it keeps both lineage links.", async () => {
    await a.goto(`/ideas/${itemId}`);
    const memories = a.getByRole("list", { name: "Memories" });
    await expect(memories.getByText(MEMORY)).toBeVisible();
    await memories.getByRole("button", { name: "Create a related idea" }).click();
    await expect(a.getByRole("heading", { name: "A related idea" })).toBeVisible();
    await a.getByLabel("Title", { exact: true }).fill(RELATED);
    await a.getByRole("button", { name: "Save draft" }).click();
    await a.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
    relatedId = idFromUrl(a);
    expect(
      sql(`select source_item_id, source_memory_id, status from public.items where id = '${relatedId}'`),
    ).toEqual([{ source_item_id: itemId, source_memory_id: memory[0].id, status: "draft" }]);
  });

  await test.step("11. A signs out: the private screen and its cached data are gone before B signs in here.", async () => {
    // An idea opens as a modal sheet that covers the header, so sign out from A's private
    // drafts list instead: still a screen showing the draft.
    await a.goto("/ideas?view=drafts");
    await expect(a.getByRole("list", { name: "Ideas" }).getByText(DRAFT)).toBeVisible();
    await a.getByRole("button", { name: "Account" }).click();
    await a.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(a.getByLabel("Email")).toBeVisible();
    await expect(a.locator("body")).not.toContainText(DRAFT);
    await signInOn(a, PARTNER_B);
  });

  await test.step("12. Back and refresh never bring A's private draft back for B.", async () => {
    for (const step of ["back", "reload"] as const) {
      if (step === "back") await a.goBack();
      else await a.reload();
      await expect(a.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await expect(a.locator("body")).not.toContainText(DRAFT);
      await expect(a.locator("body")).not.toContainText(RELATED);
    }
    await a.goto(`/ideas/${draftId}`);
    await expect(a.getByText("This idea isn't available")).toBeVisible();
  });

  await test.step("13. Another couple cannot reach Couple A's idea by a guessed URL, and sees none of it.", async () => {
    outsider = await signIn(browser, COUPLE_B.partners[0]);
    await outsider.goto(`/ideas/${itemId}`);
    await expect(outsider.getByText("This idea isn't available")).toBeVisible();
    await expect(outsider.locator("body")).not.toContainText(ITEM);
    await outsider.goto("/ideas");
    await expect(outsider.locator("main")).not.toContainText(ITEM);
    await outsider.goto("/plan");
    await expect(outsider.locator("main")).not.toContainText(ITEM);
    await outsider.goto(`/ideas/${draftId}`);
    await expect(outsider.getByText("This idea isn't available")).toBeVisible();
  });
});
