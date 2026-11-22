// Manages the sign-up allowlist (migration 20261122140000). Only emails on the
// list can create an account. Keep real addresses out of the repo: pass them
// on the command line.
//
//   deno run --allow-net --allow-env --env-file=supabase/.env.shared \
//     supabase/scripts/allow-signup.ts add someone@example.com [note]
//   ... remove someone@example.com
//   ... list

import { createClient } from "npm:@supabase/supabase-js@2";

const [command, rawEmail, ...noteParts] = Deno.args;
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file).",
  );
  Deno.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const email = rawEmail?.trim().toLowerCase();

if (command === "list") {
  const { data, error } = await db.from("signup_allowlist").select(
    "email,note,created_at",
  ).order("created_at");
  if (error) throw error;
  for (const r of data) {
    console.log(`${r.email}\t${r.note ?? ""}\t${r.created_at}`);
  }
  console.log(`${data.length} allowed (${url})`);
} else if (command === "add" && email) {
  const { error } = await db.from("signup_allowlist").upsert({
    email,
    note: noteParts.join(" ") || null,
  });
  if (error) throw error;
  console.log(`Allowed ${email} on ${url}`);
} else if (command === "remove" && email) {
  const { error } = await db.from("signup_allowlist").delete().eq(
    "email",
    email,
  );
  if (error) throw error;
  console.log(
    `Removed ${email} from the allowlist on ${url} (an existing account keeps working).`,
  );
} else {
  console.error(
    "Usage: allow-signup.ts add <email> [note] | remove <email> | list",
  );
  Deno.exit(1);
}
