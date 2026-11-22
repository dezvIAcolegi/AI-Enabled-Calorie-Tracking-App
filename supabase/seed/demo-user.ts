// Creates (or resets) a demo account with a week of realistic meals, a small
// product library and one recipe, so the app has something to show before
// real data exists. Foods are picked from the catalogue by search, so it works
// on any project that has the catalogue imported.
//
//   DEMO_PASSWORD=... deno run --allow-net --allow-env \
//     --env-file=supabase/.env.dev supabase/seed/demo-user.ts [email]
//
// email defaults to demo@caltracker.test and must start with "demo": the
// account is deleted and recreated on every run. Needs migration
// 20261122130000 (save_meal).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type Food = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};
type Portion = [query: string, grams: number];
type MealPlan = {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  hour: number;
  source: "photo" | "text" | "barcode" | "manual";
  items: Portion[];
};

// Same rule as contracts/ts/macros.ts (macrosFor). Kept inline because this
// script runs under Deno outside the app; the database checks the result.
const macrosFor = (f: Food, grams: number) => ({
  kcal: (f.kcal * grams) / 100,
  protein: (f.protein * grams) / 100,
  carbs: (f.carbs * grams) / 100,
  fat: (f.fat * grams) / 100,
});

const DAY_PLANS: MealPlan[][] = [
  [
    {
      meal_type: "breakfast",
      hour: 8,
      source: "photo",
      items: [["ou fiert", 120], ["paine integrala", 60], ["rosii", 80]],
    },
    {
      meal_type: "lunch",
      hour: 13,
      source: "photo",
      items: [["ciorba de perisoare", 350], ["paine alba", 40]],
    },
    {
      meal_type: "snack",
      hour: 17,
      source: "barcode",
      items: [["iaurt", 140]],
    },
    {
      meal_type: "dinner",
      hour: 20,
      source: "text",
      items: [["piept de pui", 150], ["orez fiert", 180], ["salata verde", 60]],
    },
  ],
  [
    {
      meal_type: "breakfast",
      hour: 8,
      source: "manual",
      items: [["fulgi de ovaz", 60], ["lapte", 200], ["banana", 110]],
    },
    {
      meal_type: "lunch",
      hour: 13,
      source: "photo",
      items: [["sarmale", 300], ["smantana", 40], ["mamaliga", 150]],
    },
    {
      meal_type: "dinner",
      hour: 19,
      source: "text",
      items: [["branza telemea", 80], ["rosii", 120], ["paine integrala", 50]],
    },
  ],
  [
    {
      meal_type: "breakfast",
      hour: 9,
      source: "photo",
      items: [["omleta", 150], ["castravete", 100]],
    },
    {
      meal_type: "lunch",
      hour: 14,
      source: "photo",
      items: [["paste", 220], ["sos de rosii", 100], ["parmezan", 15]],
    },
    { meal_type: "snack", hour: 16, source: "manual", items: [["mar", 180]] },
    {
      meal_type: "dinner",
      hour: 20,
      source: "text",
      items: [["somon", 140], ["cartofi fierti", 200]],
    },
  ],
];

async function findFood(db: SupabaseClient, query: string): Promise<Food> {
  const { data, error } = await db.rpc("search_foods", {
    query,
    max_results: 1,
  });
  if (error) throw error;
  if (!data?.length) throw new Error(`no catalogue food matches "${query}"`);
  return data[0] as Food;
}

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const password = Deno.env.get("DEMO_PASSWORD");
const email = Deno.args[0] ?? "demo@caltracker.test";

if (!url || !anonKey || !serviceKey || !password) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (--env-file) and DEMO_PASSWORD.",
  );
  Deno.exit(1);
}
if (!email.startsWith("demo")) {
  console.error(
    "The demo email must start with 'demo': it is reset on every run.",
  );
  Deno.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// Reset: delete the old demo account (its rows cascade), then recreate it.
for (let page = 1;; page++) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) throw error;
  const old = data.users.find((u) => u.email === email);
  if (old) {
    const files = await admin.storage.from("meal-photos").list(old.id);
    if (files.data?.length) {
      await admin.storage.from("meal-photos").remove(
        files.data.map((f) => `${old.id}/${f.name}`),
      );
    }
    await admin.auth.admin.deleteUser(old.id);
    console.log(`Deleted the previous ${email}.`);
    break;
  }
  if (data.users.length < 200) break;
}

const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error) throw created.error;

// Everything below runs as the demo user, so RLS and save_meal apply as in the app.
const db = createClient(url, anonKey, { auth: { persistSession: false } });
const signIn = await db.auth.signInWithPassword({ email, password });
if (signIn.error) throw signIn.error;

const profile = await db.from("profiles").update({
  display_name: "Demo",
  kcal_target: 2200,
  protein_target: 130,
  carbs_target: 250,
  fat_target: 75,
}).eq("id", created.data.user.id);
if (profile.error) throw profile.error;

const cache = new Map<string, Food>();
const food = async (q: string) => {
  if (!cache.has(q)) cache.set(q, await findFood(db, q));
  return cache.get(q)!;
};

// A week of meals, cycling through the day plans; today is day 0.
let meals = 0;
for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
  for (const plan of DAY_PLANS[daysAgo % DAY_PLANS.length]) {
    const eatenAt = new Date();
    eatenAt.setDate(eatenAt.getDate() - daysAgo);
    eatenAt.setHours(plan.hour, 0, 0, 0);
    if (eatenAt > new Date()) continue; // no meals in the future today

    const items = [];
    for (const [query, grams] of plan.items) {
      const f = await food(query);
      const per_100g = {
        kcal: f.kcal,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
      };
      items.push({
        name: f.name,
        food_id: f.id,
        grams,
        confidence: plan.source === "photo" ? 0.8 : 1,
        per_100g,
        macros: macrosFor(f, grams),
      });
    }
    const { error } = await db.rpc("save_meal", {
      meal: {
        eaten_at: eatenAt.toISOString(),
        meal_type: plan.meal_type,
        source: plan.source,
      },
      items,
    });
    if (error) throw error;
    meals++;
  }
}

// Product library: a few foods the user "saved".
for (const q of ["iaurt", "lapte", "paine integrala", "branza telemea"]) {
  const { error } = await db.from("products").upsert(
    { food_id: (await food(q)).id, last_used_at: new Date().toISOString() },
    { onConflict: "user_id,food_id" },
  );
  if (error) throw error;
}

// One recipe.
const recipe = await db.from("recipes").insert({
  name: "Omletă cu legume",
  servings: 2,
}).select("id").single();
if (recipe.error) throw recipe.error;
const recipeItems: Portion[] = [["ou", 180], ["ardei gras", 100], [
  "rosii",
  100,
], ["ulei de floarea soarelui", 10]];
for (const [i, [q, grams]] of recipeItems.entries()) {
  const { error } = await db.from("recipe_items").insert({
    recipe_id: recipe.data.id,
    food_id: (await food(q)).id,
    grams,
    position: i,
  });
  if (error) throw error;
}

console.log(
  `Demo account ${email}: ${meals} meals over 7 days, 4 products, 1 recipe. Foods used:`,
);
for (const [q, f] of cache) {
  console.log(`  ${q.padEnd(26)} → ${f.id}  ${f.name}`);
}
