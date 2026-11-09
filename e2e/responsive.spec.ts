/**
 * Task 10 Step 4: phone and desktop layout, keyboard use, focus visibility and reduced motion, on
 * the local stack with synthetic data. Screenshots go only to Playwright's ignored output folder
 * (test-results/) for human review; nothing here is committed.
 *
 * Colour contrast is reviewed by eye from those screenshots; there is no automated check.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PARTNER_A, PARTNER_B, newIdea, signIn, signInOn, sql } from "./local";

const run = Date.now().toString(36);
const CATEGORY = `Synthetic Layout Category ${run}`;
const AGREED = `Synthetic Layout Agreed ${run}`;

const VIEWPORTS = [
  { name: "phone-320", width: 320, height: 640 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;

let agreedId = "";

test.beforeAll(async ({ browser }) => {
  const a = await signIn(browser, PARTNER_A);
  agreedId = await newIdea(a, AGREED, { category: CATEGORY, newCategory: true, share: true });
  const b = await signIn(browser, PARTNER_B);
  await b.goto(`/ideas/${agreedId}`);
  await b.getByRole("button", { name: "I'm in" }).click();
  await expect
    .poll(() => sql(`select 1 from public.item_responses where item_id = '${agreedId}' and roulette_decision = 'ready'`).length)
    .toBe(2);
  await a.context().close();
  await b.context().close();
});

async function noHorizontalOverflow(page: Page, where: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${where} scrolls sideways`).toBeLessThanOrEqual(innerWidth);
}

async function signedIn(browser: Browser, viewport: { width: number; height: number }, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  await page.goto("/ideas");
  await signInOn(page, PARTNER_A);
  return page;
}

for (const viewport of VIEWPORTS) {
  test(`every screen fits ${viewport.name} without sideways scrolling`, async ({ browser }, testInfo) => {
    const signedOut = await (await browser.newContext({ viewport })).newPage();
    await signedOut.goto("/ideas");
    await expect(signedOut.getByLabel("Email")).toBeVisible();
    await noHorizontalOverflow(signedOut, "sign-in");
    await signedOut.screenshot({ path: testInfo.outputPath(`sign-in-${viewport.name}.png`), fullPage: true });

    const page = await signedIn(browser, viewport);
    const screens: Array<{ name: string; open: () => Promise<void> }> = [
      { name: "ideas", open: async () => void (await page.goto("/ideas")) },
      { name: "new-idea", open: async () => void (await page.goto("/ideas/new")) },
      {
        name: "idea-detail",
        open: async () => {
          await page.goto(`/ideas/${agreedId}`);
          await expect(page.getByLabel("Title", { exact: true })).toHaveValue(AGREED);
        },
      },
      {
        name: "memory-composer",
        open: async () => {
          await page.getByRole("button", { name: "Add a memory" }).click();
          await expect(page.getByLabel("What did you enjoy?")).toBeVisible();
        },
      },
      { name: "plan", open: async () => void (await page.goto("/plan")) },
      {
        name: "spin-result",
        open: async () => {
          await page.getByRole("group", { name: "Filter ideas" }).getByRole("button", { name: CATEGORY }).click();
          await page.getByRole("button", { name: "Deal a card" }).click();
          await expect(page.getByRole("heading", { level: 2, name: AGREED })).toBeVisible();
        },
      },
    ];
    for (const screen of screens) {
      await screen.open();
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await noHorizontalOverflow(page, screen.name);
      await page.screenshot({ path: testInfo.outputPath(`${screen.name}-${viewport.name}.png`), fullPage: true });
    }
  });
}

test("the reveal-style toggle never touches the account button", async ({ browser }) => {
  for (const viewport of VIEWPORTS) {
    const page = await signedIn(browser, viewport);
    await page.goto("/plan");
    const toggle = await page.getByRole("group", { name: "Reveal style" }).boundingBox();
    const account = await page.getByRole("button", { name: /account/i }).first().boundingBox();
    expect(toggle && account, `${viewport.name}: both are on screen`).toBeTruthy();
    const apartX = toggle!.x >= account!.x + account!.width || account!.x >= toggle!.x + toggle!.width;
    const apartY = toggle!.y >= account!.y + account!.height + 8 || account!.y >= toggle!.y + toggle!.height + 8;
    expect(apartX || apartY, `${viewport.name}: at least 8 px between them`).toBe(true);
    await page.context().close();
  }
});

test("Dealing works from the keyboard alone, with visible focus", async ({ browser }) => {
  const page = await signedIn(browser, VIEWPORTS[1]);
  await page.goto("/plan");
  await page.getByRole("group", { name: "Filter ideas" }).getByRole("button", { name: CATEGORY }).click();
  const spin = page.getByRole("button", { name: "Deal a card" });
  for (let presses = 0; presses < 40 && !(await spin.evaluate((element) => element === document.activeElement)); presses += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(spin, "Tab reaches the deck").toBeFocused();
  const ring = await spin.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle !== "none" && style.outlineWidth !== "0px", shadow: style.boxShadow !== "none" };
  });
  expect(ring.outline || ring.shadow, "the focused control shows a focus indicator").toBe(true);
  await page.keyboard.press("Enter");
  const result = page.getByRole("heading", { level: 2, name: AGREED });
  await expect(result).toBeVisible();
  await expect(result, "the result takes focus so it is announced").toBeFocused();
  // Nothing is recorded by the keyboard spin either.
  expect(sql(`select 1 from public.roulette_draws where item_id = '${agreedId}'`)).toEqual([]);
});

test("reduced motion removes the result reveal and never hides the controls", async ({ browser }) => {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    const page = await signedIn(browser, VIEWPORTS[0], reducedMotion);
    await page.goto("/plan");
    await page.getByRole("group", { name: "Filter ideas" }).getByRole("button", { name: CATEGORY }).click();
    await page.getByRole("button", { name: "Deal a card" }).click();
    await expect(page.getByRole("heading", { level: 2, name: AGREED })).toBeVisible();
    await expect(page.locator(".roulette-result-motion")).toHaveCount(reducedMotion === "reduce" ? 0 : 1);
    for (const name of ["Let's do it", "Deal another"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
      await expect(page.getByRole("button", { name })).toBeEnabled();
    }
    await page.context().close();
  }
});
