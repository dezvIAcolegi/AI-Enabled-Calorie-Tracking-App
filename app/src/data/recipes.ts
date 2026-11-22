// recipes + recipe_items. A logged portion becomes a meal of the scaled ingredients,
// so every meal_items snapshot still comes from macros.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sumMacros, type Nutrients } from '@contracts/macros';

import type { IngredientItem } from '@/api';
import { hasSupabase } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import { FOOD_COLUMNS, foodLabel, per100, uuid, type FoodRow } from './foods';

export type RecipeItem = { id: string; food: FoodRow; grams: number };
export type Recipe = {
  id: string;
  name: string;
  servings: number;
  note: string | null;
  items: RecipeItem[];
};
export type RecipeInput = {
  id?: string;
  name: string;
  servings: number;
  note?: string;
  items: { food: FoodRow; grams: number }[];
};

const KEY = 'mock-recipes-v1';

export const recipeTotals = (r: Pick<Recipe, 'items'>): Nutrients =>
  sumMacros(r.items.map((i) => ({ per_100g: per100(i.food), grams: i.grams })));

export const recipeGrams = (r: Pick<Recipe, 'items'>) => r.items.reduce((s, i) => s + i.grams, 0);

export function perServing(r: Pick<Recipe, 'items' | 'servings'>): Nutrients {
  const t = recipeTotals(r);
  const n = r.servings || 1;
  return { kcal: t.kcal / n, protein: t.protein / n, carbs: t.carbs / n, fat: t.fat / n };
}

/** Ingredient items for `portions` servings (e.g. 1.5), ready for save_meal. */
export function itemsForPortion(r: Recipe, portions: number): IngredientItem[] {
  const f = portions / (r.servings || 1);
  return r.items
    .map((i) => ({ food: i.food, grams: Math.round(i.grams * f * 10) / 10 }))
    .filter((i) => i.grams > 0)
    .map(({ food, grams }) => {
      const c = { food_id: food.id, name: foodLabel(food), per_100g: per100(food) };
      return {
        name: foodLabel(food),
        food_id: food.id,
        grams,
        confidence: 1,
        per_100g: c.per_100g,
        candidates: [c],
      };
    });
}

export function validateRecipe(r: RecipeInput): string | null {
  if (!r.name.trim()) return 'Give the recipe a name.';
  if (r.name.trim().length > 200) return 'The name is too long.';
  if (!(r.servings > 0 && r.servings <= 999)) return 'Servings must be more than 0.';
  if (r.items.length === 0) return 'Add at least one ingredient.';
  if (r.items.some((i) => !(i.grams > 0 && i.grams <= 5000)))
    return 'Each ingredient needs 0.1–5000 g.';
  return null;
}

async function loadLocal(): Promise<Recipe[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Recipe[];
  } catch {
    return [];
  }
}

export async function listRecipes(): Promise<Recipe[]> {
  if (!hasSupabase) return loadLocal();
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `id, name, servings, note, recipe_items(id, grams, position, food:foods(${FOOD_COLUMNS}))`,
    )
    .order('updated_at', { ascending: false })
    .order('position', { referencedTable: 'recipe_items' });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    name: string;
    servings: number;
    note: string | null;
    recipe_items: { id: string; grams: number; food: FoodRow | null }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    servings: Number(r.servings),
    note: r.note,
    // A food the user can no longer see drops out rather than breaking the recipe.
    items: r.recipe_items
      .filter((i) => i.food)
      .map((i) => ({ id: i.id, grams: Number(i.grams), food: i.food! })),
  }));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  return (await listRecipes()).find((r) => r.id === id) ?? null;
}

export async function saveRecipe(input: RecipeInput): Promise<string> {
  const err = validateRecipe(input);
  if (err) throw new Error(err);
  const name = input.name.trim();
  const note = input.note?.trim() || null;
  if (!hasSupabase) {
    const id = input.id ?? uuid();
    const all = (await loadLocal()).filter((r) => r.id !== id);
    const recipe: Recipe = {
      id,
      name,
      servings: input.servings,
      note,
      items: input.items.map((i) => ({ id: uuid(), ...i })),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify([recipe, ...all]));
    return id;
  }
  // No transactional RPC for recipes: write the recipe, then replace its items.
  let id = input.id;
  if (id) {
    const { error } = await supabase
      .from('recipes')
      .update({ name, servings: input.servings, note })
      .eq('id', id);
    if (error) throw new Error(error.message);
    const del = await supabase.from('recipe_items').delete().eq('recipe_id', id);
    if (del.error) throw new Error(del.error.message);
  } else {
    const { data, error } = await supabase
      .from('recipes')
      .insert({ name, servings: input.servings, note })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  const rows = input.items.map((i, n) => ({
    recipe_id: id,
    food_id: i.food.id,
    grams: i.grams,
    position: n,
  }));
  const { error } = await supabase.from('recipe_items').insert(rows);
  if (error) throw new Error(error.message);
  return id!;
}

export async function deleteRecipe(id: string): Promise<void> {
  if (!hasSupabase) {
    await AsyncStorage.setItem(KEY, JSON.stringify((await loadLocal()).filter((r) => r.id !== id)));
    return;
  }
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
