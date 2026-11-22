// Integration test against the dev project for migration
// 20261122130000_photos_meal_saving_scan_cap: save_meal, the macro-rule check,
// meal-photos isolation, the daily scan cap and food-visibility rules.
// Creates two throwaway users and deletes them at the end. Never run on shared.
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
  const email = `meals-${label}-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  // Sign-up is allowlisted (migration 20261122140000); allow just this address.
  const allow = await admin.from("signup_allowlist").insert({ email });
  if (allow.error) throw allow.error;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await admin.from("signup_allowlist").delete().eq("email", email);
  if (error) throw error;
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await db.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, db };
}

const per100 = { kcal: 148, protein: 10, carbs: 1.6, fat: 11 };
const macrosFor = (p: typeof per100, grams: number) => ({
  kcal: (p.kcal * grams) / 100,
  protein: (p.protein * grams) / 100,
  carbs: (p.carbs * grams) / 100,
  fat: (p.fat * grams) / 100,
});
const item = (grams: number, extra: Record<string, unknown> = {}) => ({
  name: "scrambled eggs",
  food_id: "manual:does-not-exist",
  grams,
  confidence: 0.72,
  per_100g: per100,
  macros: macrosFor(per100, grams),
  ...extra,
});

Deno.test("meals, photos and scan cap on dev", async (t) => {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");

  try {
    let mealId = "";

    await t.step("save_meal writes a meal and its items", async () => {
      const { data, error } = await alice.db.rpc("save_meal", {
        meal: { meal_type: "breakfast", source: "photo" },
        items: [item(120), item(33.3)],
      });
      assertEquals(error, null);
      mealId = data as string;
      const items = await alice.db.from("meal_items").select(
        "grams,kcal,food_id,position",
      ).eq("meal_id", mealId).order("position");
      assertEquals(items.data?.length, 2);
      assertEquals(Number(items.data![0].kcal), 177.6);
      // Unknown food ids are kept as a snapshot with food_id null.
      assertEquals(items.data![0].food_id, null);
    });

    await t.step("editing replaces the items", async () => {
      const { error } = await alice.db.rpc("save_meal", {
        meal: { id: mealId, note: "edited" },
        items: [item(200)],
      });
      assertEquals(error, null);
      const items = await alice.db.from("meal_items").select("grams").eq(
        "meal_id",
        mealId,
      );
      assertEquals(items.data?.map((i) => Number(i.grams)), [200]);
    });

    await t.step("totals that break the macro rule are rejected", async () => {
      const { error } = await alice.db.rpc("save_meal", {
        meal: {},
        items: [
          item(100, { macros: { ...macrosFor(per100, 100), kcal: 999 } }),
        ],
      });
      assert(error, "expected the check constraint to fail");
      // All or nothing: no half-saved meal.
      const meals = await alice.db.from("meals").select("id");
      assertEquals(meals.data?.length, 1);
    });

    await t.step("bob can't edit alice's meal", async () => {
      const { error } = await bob.db.rpc("save_meal", {
        meal: { id: mealId },
        items: [item(1)],
      });
      assert(error);
    });

    await t.step("photos are private per user", async () => {
      const path = `${alice.id}/${crypto.randomUUID()}.jpg`;
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
      const up = await alice.db.storage.from("meal-photos").upload(
        path,
        bytes,
        {
          contentType: "image/jpeg",
        },
      );
      assertEquals(up.error, null);
      const bobRead = await bob.db.storage.from("meal-photos").download(path);
      assert(bobRead.error, "bob must not read alice's photo");
      const bobUp = await bob.db.storage.from("meal-photos").upload(
        `${alice.id}/intruder.jpg`,
        bytes,
        { contentType: "image/jpeg" },
      );
      assert(bobUp.error, "bob must not write into alice's folder");
      const badPath = await alice.db.from("meals").update({
        photo_path: `${bob.id}/x.jpg`,
      }).eq("id", mealId);
      assert(badPath.error, "photo_path must be in the owner's folder");
    });

    await t.step(
      "scan cap counts per user and stops at the limit",
      async () => {
        const quota = await alice.db.rpc("scan_quota");
        assertEquals(quota.data, { allowed: true, used: 0, limit: 30 });
        for (let i = 1; i <= 30; i++) {
          const { data } = await alice.db.rpc("consume_scan");
          assertEquals(data, { allowed: true, used: i, limit: 30 });
        }
        const over = await alice.db.rpc("consume_scan");
        assertEquals(over.data, { allowed: false, used: 30, limit: 30 });
        const bobQuota = await bob.db.rpc("scan_quota");
        assertEquals(bobQuota.data?.used, 0);
        const write = await alice.db.from("scan_usage").update({ count: 0 }).eq(
          "user_id",
          alice.id,
        ).select();
        assertEquals(write.data ?? [], [], "users can't reset their counter");
      },
    );

    await t.step("users can't reference foods they can't see", async () => {
      const foodId = `label:${crypto.randomUUID()}`;
      const made = await alice.db.from("foods").insert({
        id: foodId,
        origin: "label",
        name: "Alice's label food",
        kcal: 100,
        protein: 1,
        carbs: 1,
        fat: 1,
      });
      assertEquals(made.error, null);
      const lib = await bob.db.from("products").insert({ food_id: foodId });
      assert(lib.error, "bob must not add alice's food to his library");
      const recipe = await bob.db.from("recipes").insert({ name: "r" }).select(
        "id",
      ).single();
      const ri = await bob.db.from("recipe_items").insert({
        recipe_id: recipe.data!.id,
        food_id: foodId,
        grams: 10,
      });
      assert(ri.error, "bob must not use alice's food in a recipe");
    });
  } finally {
    for (const u of [alice, bob]) {
      const files = await admin.storage.from("meal-photos").list(u.id);
      if (files.data?.length) {
        await admin.storage.from("meal-photos").remove(
          files.data.map((f) => `${u.id}/${f.name}`),
        );
      }
      await admin.auth.admin.deleteUser(u.id);
    }
  }
});
