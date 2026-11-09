#!/usr/bin/env node
/**
 * Local-only: make the two seeded synthetic partners able to sign in.
 *
 * - Reads URLs and keys from `npx supabase status -o env` (never prints keys).
 * - Refuses to run against anything except 127.0.0.1 / localhost.
 * - Creates (or re-passwords) two Auth users and points the seeded member rows at them.
 *   The mapping runs as the local database owner via `docker exec` because, with
 *   auto_expose_new_tables = false, no API role (not even service_role) can write public tables.
 * - Writes VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY to .env.local (gitignored).
 *
 * Re-run after every `npx supabase db reset`, which restores the seed mapping.
 * Usage: npm run dev:accounts   (optional: OURS_DEV_PASSWORD=... to choose the password)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PARTNERS = [
  { memberId: "00000000-0000-4000-8000-0000000000a0", email: "partner-a@example.com", label: "Synthetic Partner A" },
  { memberId: "00000000-0000-4000-8000-0000000000b0", email: "partner-b@example.com", label: "Synthetic Partner B" },
];
const PASSWORD = process.env.OURS_DEV_PASSWORD || "ours-local-synthetic";

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

function fail(message, error) {
  // Status and code only: Auth error messages can echo emails.
  const detail = error ? ` (status ${error.status ?? "?"}, code ${error.code ?? "?"})` : "";
  console.error(`dev-accounts: ${message}${detail}`);
  process.exit(1);
}

const status = readStatus();
const apiUrl = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
const browserKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!apiUrl || !serviceKey || !browserKey) fail("Could not read API_URL and keys from `supabase status`.");

const host = new URL(apiUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") fail("Refusing to touch a non-local Supabase project.");

const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(email) {
  for (let page = 1; page < 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("Could not list local Auth users. If this persists, run `npx supabase db reset` first.", error);
    const found = data.users.find((user) => user.email === email);
    if (found || data.users.length < 200) return found ?? null;
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const configToml = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = configToml.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) fail("Could not read project_id from supabase/config.toml.");

function mapMember(memberId, authUserId, email) {
  if (!UUID.test(memberId) || !UUID.test(authUserId)) fail("Unexpected id format.");
  const sql = `update public.members set auth_user_id = '${authUserId}' where id = '${memberId}' returning id;`;
  let output;
  try {
    output = execFileSync(
      "docker",
      ["exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    fail(`Could not map ${email} to the seeded member (is the local stack running?).`);
  }
  if (!output.includes(memberId)) fail(`Seeded member for ${email} not found. Run \`npx supabase db reset\` first.`);
}

for (const partner of PARTNERS) {
  // Create first: after `db reset` this needs no user listing at all.
  let user = null;
  const created = await admin.auth.admin.createUser({ email: partner.email, password: PASSWORD, email_confirm: true });
  if (created.data?.user) {
    user = created.data.user;
  } else if (created.error && (created.error.code === "email_exists" || created.error.status === 422)) {
    user = await findUserByEmail(partner.email);
    if (!user) fail(`${partner.email} exists but could not be found.`);
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, ban_duration: "none" });
    if (error) fail(`Could not reset the password for ${partner.email}.`, error);
  } else {
    fail(`Could not create ${partner.email}.`, created.error);
  }

  mapMember(partner.memberId, user.id, partner.email);
}

// .env.local: set only the two browser values, keep anything else the developer added.
const envPath = new URL("../.env.local", import.meta.url);
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const kept = existing
  .split("\n")
  .filter((line) => line && !/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(line));
writeFileSync(envPath, [...kept, `VITE_SUPABASE_URL=${apiUrl}`, `VITE_SUPABASE_PUBLISHABLE_KEY=${browserKey}`, ""].join("\n"));

console.log("Local synthetic sign-ins are ready (local stack only):\n");
for (const partner of PARTNERS) console.log(`  ${partner.label.padEnd(20)} ${partner.email}  /  ${PASSWORD}`);
console.log("\n.env.local updated. Start the app with `npm run dev` and open the URL it prints.");
console.log("Use a second browser or a private window to sign in as the other partner.");
