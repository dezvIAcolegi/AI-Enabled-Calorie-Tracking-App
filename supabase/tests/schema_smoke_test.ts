// Integration test against the dev project: RLS isolation, consent rule and food
// search. Creates two throwaway users and deletes them (and their rows) at the end.
// Never run it against shared.
//
//   deno test --allow-net --allow-env --env-file=supabase/.env.dev supabase/tests/

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function makeUser(
  label: string,
): Promise<{ id: string; db: SupabaseClient }> {
  const email = `smoke-${label}-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await db.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, db };
}

Deno.test("schema smoke test on dev", async (t) => {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  try {
    await t.step(
      "a profile is created at sign-up and only its owner sees it",
      async () => {
        const own = await alice.db.from("profiles").select("id");
        assertEquals(own.data?.map((p) => p.id), [alice.id]);
      },
    );

    await t.step("anonymous callers read nothing", async () => {
      const { data } = await anon.from("foods").select("id").limit(1);
      assertEquals(data ?? [], []);
    });

    await t.step(
      "search ignores diacritics and finds Romanian foods",
      async () => {
        const { data, error } = await alice.db.rpc("search_foods", {
          query: "albus de ou",
          max_results: 5,
        });
        assertEquals(error, null);
        assert(
          data.some((f: { name: string }) => f.name === "Albuș de ou"),
          `got ${data.map((f: { name: string }) => f.name).join(", ")}`,
        );
      },
    );

    await t.step("barcode lookup finds a shared product", async () => {
      const { data } = await alice.db.from("foods").select("id, name").eq(
        "barcode",
        "5449000000460",
      );
      assertEquals(data?.[0]?.id, "off:5449000000460");
    });

    await t.step("users cannot write the shared catalogue", async () => {
      const { error } = await alice.db.from("foods").insert({
        id: "fdc:999999999",
        origin: "usda",
        name: "Fake",
        kcal: 1,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
      assert(error, "insert into the shared catalogue should fail");
    });

    await t.step("own label foods are private", async () => {
      const id = `label:${crypto.randomUUID()}`;
      const insert = await alice.db.from("foods").insert({
        id,
        origin: "label",
        name: "Smoke test yoghurt",
        kcal: 60,
        protein: 4,
        carbs: 5,
        fat: 2,
      });
      assertEquals(insert.error, null);
      const asBob = await bob.db.from("foods").select("id").eq("id", id);
      assertEquals(asBob.data, []);
    });

    await t.step("meals are isolated between users", async () => {
      const meal = await alice.db.from("meals").insert({ meal_type: "lunch" })
        .select("id")
        .single();
      assertEquals(meal.error, null);
      const item = await alice.db.from("meal_items").insert({
        meal_id: meal.data!.id,
        name: "scrambled eggs",
        grams: 120,
        kcal_100g: 148,
        protein_100g: 10,
        carbs_100g: 1.6,
        fat_100g: 11,
        kcal: 177.6,
        protein: 12,
        carbs: 1.92,
        fat: 13.2,
      });
      assertEquals(item.error, null);

      const bobReads = await bob.db.from("meals").select("id");
      assertEquals(bobReads.data, []);
      const bobUpdates = await bob.db.from("meals").update({ note: "hacked" })
        .eq(
          "id",
          meal.data!.id,
        ).select("id");
      assertEquals(bobUpdates.data, []);
      const bobInsertsForAlice = await bob.db.from("meals").insert({
        user_id: alice.id,
      });
      assert(
        bobInsertsForAlice.error,
        "inserting a row for another user should fail",
      );
    });

    await t.step("scans need consent", async () => {
      const scan = { kind: "meal_text", raw_output: { items: [] } };
      const before = await alice.db.from("scans").insert(scan);
      assert(before.error, "scan without consent should fail");
      await alice.db.from("profiles").update({ scan_consent: true }).eq(
        "id",
        alice.id,
      );
      const after = await alice.db.from("scans").insert(scan);
      assertEquals(after.error, null);
    });
  } finally {
    await admin.auth.admin.deleteUser(alice.id);
    await admin.auth.admin.deleteUser(bob.id);
  }

  await t.step("deleting a user deletes their rows", async () => {
    for (const table of ["profiles", "meals", "meal_items", "scans"]) {
      const column = table === "profiles" ? "id" : "user_id";
      const { count } = await admin.from(table).select("*", {
        count: "exact",
        head: true,
      })
        .eq(column, alice.id);
      assertEquals(count, 0, `${table} still has rows`);
    }
    const { count } = await admin.from("foods").select("*", {
      count: "exact",
      head: true,
    })
      .eq("owner_id", alice.id);
    assertEquals(count, 0, "foods still has rows");
  });
});
