/**
 * README screenshots, from a fresh local stack with synthetic demo content. Not part of
 * `npm run test:e2e`; run it alone with `npm run screenshots` after
 * `npx supabase db reset && npm run dev:accounts`. Writes docs/screenshots/*.png at phone size.
 *
 * Everything here is invented: two synthetic partners renamed Alex and Sam in the local database,
 * and made-up date ideas.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { COUPLE_ID, PARTNER_A, PARTNER_B, PASSWORD, idFromUrl, psql, sql } from "./local";

const ALEX = { ...PARTNER_A, name: "Alex" };
const SAM = { ...PARTNER_B, name: "Sam" };
const OUT = "docs/screenshots";
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

const HIKE = "Sunrise hike to the lookout";
const COOK = "Cook a cuisine neither of us has tried";
const DANCE = "Beginner dance class";
const PHONES = "A weekend with our phones off";
const LETTERS = "Letters to open in a year";
const STARS = "Stargazing at the reservoir";

async function phone(browser: Browser, who: { email: string }) {
  const page = await (await browser.newContext(PHONE)).newPage();
  await page.goto("/ideas");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  return page;
}

async function share(
  page: Page,
  to: string,
  idea: { title: string; description: string; category: string; newCategory?: boolean; rating?: string },
) {
  await page.goto("/ideas/new");
  await page.getByLabel("Title", { exact: true }).fill(idea.title);
  await page.getByLabel(/^Description/).fill(idea.description);
  if (idea.newCategory) {
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Category name").fill(idea.category);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByLabel("Category", { exact: true })).not.toHaveValue("");
  } else {
    await page.getByLabel("Category", { exact: true }).selectOption({ label: idea.category });
  }
  if (idea.rating) await page.getByRole("radiogroup", { name: "How into it are you?" }).getByText(idea.rating, { exact: true }).click();
  await page.getByRole("button", { name: `Share with ${to}` }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  return idFromUrl(page);
}

const decision = (itemId: string, memberId: string) =>
  sql<{ d: string }>(`select roulette_decision::text as d from public.item_responses where item_id = '${itemId}' and member_id = '${memberId}'`)[0]?.d;

async function imIn(page: Page, itemId: string, memberId: string, rating?: string) {
  await page.goto(`/ideas/${itemId}`);
  await page.getByRole("button", { name: "I'm in" }).click();
  await expect.poll(() => decision(itemId, memberId)).toBe("ready");
  if (rating) await page.getByRole("radiogroup", { name: "How into it?" }).getByText(rating, { exact: true }).click();
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("README screenshots", async ({ browser }) => {
  expect(sql(`select 1 from public.items where couple_id = '${COUPLE_ID}'`), "run `npx supabase db reset && npm run dev:accounts` first").toHaveLength(0);
  psql(`update public.members set display_name = 'Alex' where id = '${ALEX.memberId}'`);
  psql(`update public.members set display_name = 'Sam' where id = '${SAM.memberId}'`);

  const alex = await phone(browser, ALEX);
  const sam = await phone(browser, SAM);

  // ---------- Ideas from both of them ----------
  const hike = await share(alex, SAM.name, {
    title: HIKE,
    description: "Thermos of coffee, leave by 5:30, breakfast at the diner on the way back.",
    category: "Outdoors",
    newCategory: true,
    rating: "Very",
  });
  const cook = await share(alex, SAM.name, {
    title: COOK,
    description: "Pick a country at random, shop for it together, cook with music on.",
    category: "At home",
    newCategory: true,
    rating: "Into it",
  });
  const dance = await share(alex, SAM.name, {
    title: DANCE,
    description: "Salsa or swing, somewhere nobody knows us.",
    category: "Out",
    newCategory: true,
    rating: "Curious",
  });
  const stars = await share(alex, SAM.name, {
    title: STARS,
    description: "Blankets, a thermos, and the app that names the constellations.",
    category: "Outdoors",
    rating: "Into it",
  });
  const phones = await share(sam, ALEX.name, {
    title: PHONES,
    description: "Phones in a drawer from Friday night to Sunday evening. Books, walks, long breakfasts.",
    category: "At home",
    rating: "Very",
  });
  const letters = await share(sam, ALEX.name, {
    title: LETTERS,
    description: "Write each other a letter tonight, seal them, and open them next November.",
    category: "At home",
    rating: "Into it",
  });

  // ---------- Answers ----------
  await imIn(sam, hike, SAM.memberId, "Into it");
  await imIn(sam, cook, SAM.memberId, "Very");
  await imIn(alex, letters, ALEX.memberId, "Very");
  await sam.goto(`/ideas/${dance}`);
  await sam.getByRole("button", { name: "Maybe later" }).click();
  await sam.getByLabel(/Anything you.d want to talk about first\?/).fill("Yes, once work calms down. Spring?");
  await sam.getByRole("button", { name: "Suggest Later" }).click();
  await expect.poll(() => decision(dance, SAM.memberId)).toBe("not_now");
  void phones;
  void stars;

  // ---------- A date that happened, and Sam's reflection ----------
  await alex.goto(`/ideas/${cook}`);
  await alex.getByRole("button", { name: "Plan this" }).click();
  await alex.getByRole("group", { name: "When?" }).getByRole("button", { name: "Tonight" }).click();
  await expect(alex.getByText("Up next · Tonight")).toBeVisible();
  await sam.goto("/plan");
  await sam.getByRole("button", { name: `Up next: ${COOK}, Tonight` }).click();
  await sam.getByRole("dialog", { name: COOK }).getByRole("button", { name: "We did it" }).click();
  await expect(sam.getByRole("button", { name: /Up next:/ })).toHaveCount(0);
  await sam.goto(`/ideas/${cook}`);
  await sam.getByRole("button", { name: "How was it? Add yours" }).click();
  const samSheet = sam.getByRole("dialog", { name: `How was ${COOK}?` });
  await samSheet.getByLabel("What did you enjoy?").fill("Dancing around the kitchen while the dumplings steamed.");
  await samSheet.getByLabel("Anything to change or improve for next time?").fill("Start earlier. We ate at ten.");
  await samSheet.getByRole("button", { name: `Share with ${ALEX.name}` }).click();
  await expect(samSheet).toHaveCount(0);

  await alex.goto(`/ideas/${cook}`);
  await alex.getByRole("button", { name: "How was it? Add yours" }).click();
  const alexSheet = alex.getByRole("dialog", { name: `How was ${COOK}?` });
  await expect(alexSheet.getByText("Start earlier. We ate at ten.")).toBeVisible();
  await alexSheet.getByLabel("What did you enjoy?").fill("Getting lost in a market neither of us knew.");
  await shot(alex, "06-reflect");
  await alexSheet.getByRole("button", { name: `Share with ${SAM.name}` }).click();
  await expect(alexSheet).toHaveCount(0);

  // ---------- Plan: deal a card, make it a date ----------
  await alex.goto("/plan");
  await alex.getByRole("group", { name: "Filter ideas" }).getByRole("button", { name: "Outdoors" }).click();
  await alex.getByRole("button", { name: "Deal a card" }).click();
  await expect(alex.getByRole("heading", { level: 2, name: HIKE })).toBeVisible();
  await shot(alex, "03-card");
  await alex.getByRole("button", { name: "Let's do it" }).click();
  await alex.getByRole("group", { name: "When?" }).getByRole("button", { name: "This weekend" }).click();
  await expect(alex.getByRole("group", { name: "When?" }).getByRole("button", { name: "This weekend" })).toHaveAttribute("aria-pressed", "true");
  await shot(alex, "04-date");

  await alex.goto("/plan");
  await expect(alex.getByRole("button", { name: `Up next: ${HIKE}, This weekend` })).toBeVisible();
  await shot(alex, "02-plan");

  // ---------- Ideas and one idea, as Alex ----------
  await alex.goto("/ideas");
  await expect(alex.getByRole("list", { name: "Ideas" }).getByText(PHONES)).toBeVisible();
  await shot(alex, "01-ideas");
  await alex.goto(`/ideas/${letters}`);
  await expect(alex.getByText("Plan this")).toBeVisible();
  await shot(alex, "05-idea");
});
