/**
 * Local-only helpers for browser checks. Everything here refuses to touch anything except the
 * local Supabase stack, its Mailpit test inbox, and the synthetic seeded partners.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";

export const MAILPIT = "http://127.0.0.1:54424";
export const APP_URL = "http://localhost:5173";
export const PASSWORD = process.env.OURS_DEV_PASSWORD || "ours-local-synthetic";
export const PARTNER_A = { memberId: "00000000-0000-4000-8000-0000000000a0", email: "partner-a@example.com", name: "Synthetic Partner A" };
export const PARTNER_B = { memberId: "00000000-0000-4000-8000-0000000000b0", email: "partner-b@example.com", name: "Synthetic Partner B" };
export const COUPLE_ID = "00000000-0000-4000-8000-0000000000c0";

const projectId = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error("Could not read project_id from supabase/config.toml.");

/** Runs SQL as the local database owner inside the local Supabase container; returns rows as JSON. */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  return JSON.parse(psql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t`).trim()) as T[];
}

/** Runs a statement (including writes) as the local database owner; returns psql's raw output. */
export function psql(statement: string) {
  return execFileSync(
    "docker",
    ["exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", statement],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** Only synthetic not_before backdating is allowed; nothing else in app data is touched. */
export function makeDue(outboxIds: string[]) {
  for (const id of outboxIds) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("unexpected outbox id");
  }
  // A data-modifying statement cannot sit inside sql()'s JSON wrapper, so it runs on its own.
  const output = psql(`
    update public.notification_outbox
    set not_before = now() - interval '1 minute'
    where id = any(array[${outboxIds.map((id) => `'${id}'::uuid`).join(", ")}])
      and couple_id = '${COUPLE_ID}'`);
  expect(output.trim(), "every outbox id was backdated").toBe(`UPDATE ${outboxIds.length}`);
}

/** One worker pass against the local stack and local SMTP (the worker itself refuses anything else). */
export function runWorkerOnce() {
  return execFileSync("node", ["scripts/notify-worker.mjs", "--once"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OURS_APP_URL: APP_URL },
  });
}

export async function clearMailpit() {
  const response = await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  expect(response.ok, "Mailpit is reachable on the local stack").toBe(true);
}

type MailpitSummary = { ID: string };
export async function mailpitRaw(): Promise<string[]> {
  const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=100`)).json()) as { messages: MailpitSummary[] };
  return Promise.all(list.messages.map(async (message) => (await fetch(`${MAILPIT}/api/v1/message/${message.ID}/raw`)).text()));
}

/** Headers of a raw RFC 5322 message, unfolded, keyed by lower-case name (last one wins). */
export function headers(raw: string) {
  const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  const result: Record<string, string> = {};
  const all: string[] = [];
  for (const line of head.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      result[match[1].toLowerCase()] = match[2];
      all.push(line);
    }
  }
  return { ...result, _all: all.join("\n") } as Record<string, string>;
}

export function body(raw: string) {
  return raw.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/=\r?\n/g, "");
}

export async function signIn(browser: Browser, partner: { email: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/ideas");
  await signInOn(page, partner);
  return page;
}

/** Signs in on a page that is showing the sign-in form (fresh, or after Sign out). */
export async function signInOn(page: Page, partner: { email: string }) {
  await page.getByLabel("Email").fill(partner.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

/** Polls a SQL condition (the live acknowledgement is written asynchronously after a refetch). */
export async function until(description: string, check: () => boolean, timeoutMs = 15_000) {
  await expect.poll(check, { message: description, timeout: timeoutMs, intervals: [250, 500, 1000] }).toBe(true);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids from the page are interpolated into local SQL: accept only a UUID. */
export function uuid(value: string) {
  if (!UUID.test(value)) throw new Error("unexpected id");
  return value;
}

export const idFromUrl = (page: Page) => uuid(new URL(page.url()).pathname.split("/").pop() ?? "");

/** Partner A's new-idea flow: shares with Partner B, or saves a draft. Returns the idea id. */
export async function newIdea(
  page: Page,
  title: string,
  { category, newCategory = false, share }: { category: string; newCategory?: boolean; share: boolean },
) {
  await page.goto("/ideas/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel(/^Description/).fill(`${title}: synthetic description.`);
  if (newCategory) {
    await page.getByRole("button", { name: "New category" }).click();
    await page.getByLabel("Category name").fill(category);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByLabel("Category", { exact: true })).not.toHaveValue("");
  } else {
    await page.getByLabel("Category", { exact: true }).selectOption({ label: category });
  }
  await page.getByRole("button", { name: share ? `Share with ${PARTNER_B.name}` : "Save draft" }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  return idFromUrl(page);
}
