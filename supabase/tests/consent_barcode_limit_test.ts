// Integration test against the dev project for migration
// 20261122150000_consent_withdrawal_barcode_limit and the barcode-lookup cap.
// Creates one throwaway user and deletes it at the end. Never run on shared.
//
//   deno test --allow-net --allow-env --env-file=supabase/.env.dev supabase/tests/

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.test("consent withdrawal and barcode cap on dev", async (t) => {
  const email = `consent-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  await admin.from("signup_allowlist").insert({ email });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await admin.from("signup_allowlist").delete().eq("email", email);
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const token = signIn.data.session!.access_token;

  const lookup = async (barcode: string) => {
    const r = await fetch(`${url}/functions/v1/barcode-lookup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ barcode }),
    });
    return [r.status, await r.json()] as const;
  };

  try {
    await t.step(
      "withdraw_scan_consent deletes scans and turns consent off",
      async () => {
        await db.from("profiles").update({
          scan_consent: true,
          scan_consent_at: new Date().toISOString(),
        }).eq("id", uid);
        const ins = await db.from("scans").insert([
          { kind: "meal_text", raw_output: { items: [] } },
          { kind: "label", raw_output: { flagged: [] } },
        ]);
        assertEquals(ins.error, null);
        const { data, error } = await db.rpc("withdraw_scan_consent");
        assertEquals(error, null);
        assertEquals(data, 2);
        const left = await db.from("scans").select("id");
        assertEquals(left.data, []);
        const p = await db.from("profiles").select("scan_consent").single();
        assertEquals(p.data?.scan_consent, false);
      },
    );

    await t.step("users can't count barcode lookups themselves", async () => {
      const { error } = await db.rpc("consume_barcode_lookup", {
        p_user: uid,
      });
      assert(error, "consume_barcode_lookup must be service-role only");
      const w = await db.from("barcode_usage").insert({
        user_id: uid,
        day: "2026-01-01",
        count: 0,
      });
      assert(w.error, "users can't write barcode_usage");
    });

    await t.step(
      "over the cap, new products get 429 but cached ones work",
      async () => {
        const today = new Date().toISOString().slice(0, 10);
        const set = await admin.from("barcode_usage").upsert({
          user_id: uid,
          day: today,
          count: 100,
        });
        assertEquals(set.error, null);
        // A barcode that isn't in foods: refused before Open Food Facts is called.
        const [status, body] = await lookup("0000000000017");
        assertEquals([status, body.error], [429, "barcode_limit"]);
        // A barcode already in the catalogue is free.
        const cachedFood = await admin.from("foods").select("barcode").is(
          "owner_id",
          null,
        ).not("barcode", "is", null).limit(1).single();
        const [s2, b2] = await lookup(cachedFood.data!.barcode);
        assertEquals([s2, b2.source], [200, "cache"]);
      },
    );
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});
