/**
 * Local-only fixture: a second synthetic couple ("Couple B") with exactly two login-capable
 * members, to prove one couple can never reach the other's ideas. Auth users are created through
 * the local Auth admin API with the local service key read from `supabase status` (never printed or
 * stored); couple and member rows go in through local SQL. Teardown removes only these fixed ids.
 */
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, psql, sql } from "./local";

export const COUPLE_B = {
  coupleId: "e2e00000-0000-4000-8000-0000000000c0",
  partners: [
    { memberId: "e2e00000-0000-4000-8000-0000000000a0", email: "synthetic-couple-b-1@ours.invalid", name: "Synthetic Couple B One" },
    { memberId: "e2e00000-0000-4000-8000-0000000000b0", email: "synthetic-couple-b-2@ours.invalid", name: "Synthetic Couple B Two" },
  ],
} as const;

function localAdmin() {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  const apiUrl = env.API_URL;
  const serviceKey = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
  if (!apiUrl || !serviceKey) throw new Error("Could not read the local API URL and service key.");
  if (!["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("Refusing a non-local Supabase project.");
  return createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Looked up with local SQL, not the Auth admin list: listing returns 500 on a freshly reset stack
 * (seeded Auth rows the admin API can't serialize), which is why dev-accounts avoids it too.
 */
function authUserIds() {
  const emails = COUPLE_B.partners.map((partner) => `'${partner.email}'`).join(", ");
  return sql<{ id: string }>(`select id from auth.users where email in (${emails})`).map((row) => row.id);
}

/** Removes Couple B. It never has ideas, so only members, the couple and the users exist. */
export async function removeCoupleB() {
  const admin = localAdmin();
  psql(`
    delete from public.members where couple_id = '${COUPLE_B.coupleId}';
    delete from public.couples where id = '${COUPLE_B.coupleId}';`);
  for (const id of authUserIds()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`Could not remove a synthetic Couple B user (status ${error.status ?? "?"}).`);
  }
}

export async function provisionCoupleB() {
  await removeCoupleB();
  const admin = localAdmin();
  const userIds: string[] = [];
  for (const partner of COUPLE_B.partners) {
    const { data, error } = await admin.auth.admin.createUser({ email: partner.email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create a synthetic Couple B user (status ${error?.status ?? "?"}).`);
    if (!/^[0-9a-f-]{36}$/.test(data.user.id)) throw new Error("unexpected user id");
    userIds.push(data.user.id);
  }
  psql(`
    insert into public.couples (id, display_name) values ('${COUPLE_B.coupleId}', 'Synthetic Couple B');
    insert into public.members (id, couple_id, auth_user_id, display_name, sort_order) values
      ('${COUPLE_B.partners[0].memberId}', '${COUPLE_B.coupleId}', '${userIds[0]}', '${COUPLE_B.partners[0].name}', 0),
      ('${COUPLE_B.partners[1].memberId}', '${COUPLE_B.coupleId}', '${userIds[1]}', '${COUPLE_B.partners[1].name}', 1);`);
  const members = sql<{ n: number }>(`select count(*)::int as n from public.members where couple_id = '${COUPLE_B.coupleId}'`);
  if (members[0]?.n !== 2) throw new Error("Couple B must have exactly two members.");
}
