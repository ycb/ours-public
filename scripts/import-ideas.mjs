#!/usr/bin/env node
/**
 * Local-only: import one person's ideas, as drafts, from a plain-text file kept OUTSIDE the repo.
 *
 *   node scripts/import-ideas.mjs <file>            dry run: counts only, writes nothing
 *   node scripts/import-ideas.mjs <file> --commit   signs in as the author and creates drafts
 *
 * - Each person runs it with their own file and their own sign-in, so every idea is theirs and
 *   private (a draft) until they share it from My drafts.
 * - The file format is described in scripts/lib/import.mjs: plain text (drafts only), or .json with
 *   sharing, the partner's "I'm in", comments and Later. JSON that needs the partner asks for the
 *   partner's sign-in too, so their answers and comments are theirs.
 * - It never prints titles, descriptions, emails or passwords; errors name entries by number.
 * - Re-running is safe: each entry has a stable request id, so nothing is created twice.
 * - URL and publishable key come from .env.production.local (the hosted project). Add --local to
 *   use .env.local instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { IMPORT_CATEGORY, importCategoryRequestId, importRequestId, parseImport, parseImportJson, summarize } from "./lib/import.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const commit = args.includes("--commit");
const local = args.includes("--local");
const file = args.find((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(`import: ${message}`);
  process.exit(1);
}

if (!file) fail("usage: node scripts/import-ideas.mjs <file outside the repo> [--commit] [--local]");
const path = resolve(file);
// The main checkout and every worktree live under the repo's parent checkout; refuse both.
const guarded = [repoRoot, resolve(repoRoot, "..", "..")].filter((dir) => existsSync(resolve(dir, ".git")));
if (guarded.some((dir) => path === dir || path.startsWith(dir + sep))) {
  fail("keep the file outside the repository (for example in ~/Documents), so it can never be committed.");
}
if (!existsSync(path)) fail("file not found.");

const raw = readFileSync(path, "utf8");
const parsed = path.endsWith(".json")
  ? parseImportJson(raw)
  : (({ entries, problems }) => ({
      entries: entries.map((entry) => ({ ...entry, share: false, partner: null, comments: [], later: null })),
      problems,
    }))(parseImport(raw));
const needsPartner = parsed.entries.some(
  (entry) => entry.partner || entry.later?.by === "partner" || entry.comments.some((comment) => comment.by === "partner"),
);
console.log(summarize(parsed));
for (const problem of parsed.problems) console.log(`  skipped ${problem}`);
if (!commit) {
  console.log("Dry run: nothing was written. Add --commit to import.");
  process.exit(0);
}
if (parsed.entries.length === 0) process.exit(0);

function readEnv(name) {
  const envPath = resolve(repoRoot, name);
  if (!existsSync(envPath)) fail(`${name} not found.`);
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}
const env = readEnv(local ? ".env.local" : ".env.production.local");
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) fail("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.");
if (key.startsWith("sb_secret_")) fail("that is a secret key; use the publishable key.");

function ask(question, { hidden = false } = {}) {
  return new Promise((done) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (hidden) {
      // Echo nothing while the password is typed.
      rl._writeToOutput = (text) => {
        if (text.includes(question)) stdout.write(text);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write("\n");
      done(answer.trim());
    });
  });
}

const target = new URL(url).host;
console.log(`Importing into ${target} as drafts.`);
async function signIn(who) {
  const email = await ask(`${who} Ours email: `);
  const password = await ask(`${who} Ours password: `, { hidden: true });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) fail(`${who} sign-in failed (status ${signedIn.error.status ?? "?"}).`);
  const member = await client.rpc("get_current_member");
  const row = Array.isArray(member.data) ? member.data[0] : member.data;
  if (member.error || !row?.id) fail(`${who} account isn't linked to a couple.`);
  return { client, member: row };
}

const author = await signIn("Author's");
const partner = needsPartner ? await signIn("Partner's") : null;
if (partner && (partner.member.id === author.member.id || partner.member.couple_id !== author.member.couple_id)) {
  fail("the partner must be the other person in the same couple.");
}
const as = (by) => (by === "partner" ? partner.client : author.client);
const client = author.client;
const memberId = author.member.id;

try {
  const existing = await client.from("categories").select("id").eq("name", IMPORT_CATEGORY).is("archived_at", null).limit(1);
  if (existing.error) fail(`could not read categories (code ${existing.error.code ?? "?"}).`);
  let categoryId = existing.data[0]?.id;
  if (!categoryId) {
    const created = await client.rpc("create_category", { p_request_id: importCategoryRequestId(memberId), p_name: IMPORT_CATEGORY });
    if (created.error || !created.data) fail(`could not create the "${IMPORT_CATEGORY}" category (code ${created.error?.code ?? "?"}).`);
    categoryId = created.data.id;
  }

  let drafts = 0;
  let shared = 0;
  const failures = [];
  for (const [index, entry] of parsed.entries.entries()) {
    const step = async (label, call) => {
      const result = await call();
      if (result.error) throw new Error(`${label} (code ${result.error.code ?? "?"})`);
      return result.data;
    };
    try {
      const itemRequest = importRequestId(entry);
      const item = await step("create", () =>
        client.rpc("create_item", {
          p_request_id: itemRequest,
          p_title: entry.title,
          p_description: entry.description,
          p_category_id: categoryId,
        }),
      );
      if (entry.share) {
        await step("share", () => client.rpc("submit_item", { p_item_id: item.id }));
        if (entry.partner === "in") {
          await step("partner in", () => partner.client.rpc("set_roulette_decision", { p_item_id: item.id, p_decision: "ready" }));
        }
        for (const [n, comment] of entry.comments.entries()) {
          await step(`comment ${n + 1}`, () =>
            as(comment.by).rpc("add_comment", {
              p_request_id: importRequestId({ title: `${itemRequest}:comment:${n}`, description: comment.body }),
              p_item_id: item.id,
              p_body: comment.body,
            }),
          );
        }
        if (entry.later) {
          await step("later", () =>
            as(entry.later.by).rpc("decline_item", {
              p_request_id: importRequestId({ title: `${itemRequest}:later`, description: entry.later.note }),
              p_item_id: item.id,
              p_reason: entry.later.note,
            }),
          );
        }
        shared += 1;
      } else {
        drafts += 1;
      }
    } catch (error) {
      failures.push(`entry ${index + 1}: ${error.message}`);
    }
  }
  console.log(`${shared} shared, ${drafts} in My drafts, all under "${IMPORT_CATEGORY}". Re-running is safe.`);
  if (failures.length) {
    console.log(`${failures.length} failed: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await author.client.auth.signOut();
  if (partner) await partner.client.auth.signOut();
}
