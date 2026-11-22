// Saving and reading meals. Uses save_meal(meal, items) and the meal-photos bucket from
// Kevin's proposal (supabase/photos-meals-scan-cap, agreed on board #5, 22 Nov).
import { macrosFor, type Nutrients } from '@contracts/macros';

import type { IngredientItem, MealResponse } from '@/api';
import type { MealSource } from '@/features/meal/draft';
import { hasSupabase } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import { uuid } from './foods';
import { localMeals } from './local';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type SaveMealInput = {
  id?: string;
  mealType: MealType;
  source: MealSource;
  eatenAt?: Date;
  note?: string;
  photoPath?: string;
  items: IngredientItem[];
};

type SaveMealItem = {
  name: string;
  food_id: string;
  grams: number;
  confidence?: number;
  per_100g: Nutrients;
  macros: Nutrients;
};

/** The exact JSON save_meal expects. macros come from macros.ts, never computed here. */
export function saveMealPayload(input: SaveMealInput) {
  const meal: Record<string, string> = { meal_type: input.mealType, source: input.source };
  if (input.id) meal.id = input.id;
  if (input.eatenAt) meal.eaten_at = input.eatenAt.toISOString();
  if (input.note?.trim()) meal.note = input.note.trim();
  if (input.photoPath) meal.photo_path = input.photoPath;
  const items: SaveMealItem[] = input.items.map((i) => ({
    name: i.name,
    food_id: i.food_id,
    grams: i.grams,
    confidence: i.confidence,
    per_100g: i.per_100g,
    macros: macrosFor(i.per_100g, i.grams),
  }));
  return { meal, items };
}

/** Default meal type from the time of day. */
export function mealTypeFor(d: Date): MealType {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

export async function saveMeal(input: SaveMealInput): Promise<string> {
  if (input.items.length === 0) throw new Error('Add at least one item before saving.');
  if (!hasSupabase) return localMeals.upsert(localRow(input));
  const { data, error } = await supabase.rpc('save_meal', saveMealPayload(input));
  if (error) throw new Error(friendlyDbError(error.message));
  return data as string;
}

/** Upload a resized local photo to meal-photos/<uid>/<uuid>.jpg; returns the storage path. */
export async function uploadMealPhoto(localUri: string): Promise<string> {
  if (!hasSupabase) return localUri; // mock mode keeps the local file
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Please sign in again.');
  const path = `${u.user.id}/${uuid()}.jpg`;
  const body = await (await fetch(localUri)).arrayBuffer();
  const { error } = await supabase.storage
    .from('meal-photos')
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

/** Keep the raw AI output next to the user's correction, only with consent. Never throws. */
export async function recordScan(opts: {
  kind: 'meal_photo' | 'meal_text' | 'label';
  raw: unknown;
  corrected: unknown;
  mealId?: string;
}): Promise<void> {
  if (!hasSupabase) return;
  try {
    const { data: p } = await supabase.from('profiles').select('scan_consent').single();
    if (!p?.scan_consent) return;
    await supabase.from('scans').insert({
      kind: opts.kind,
      raw_output: opts.raw,
      corrected: opts.corrected,
      meal_id: opts.mealId ?? null,
    });
  } catch {
    // Evaluation data is optional; never block the user's save on it.
  }
}

export type MealRow = {
  id: string;
  eaten_at: string;
  meal_type: MealType;
  source: MealSource;
  note: string | null;
  photo_path: string | null;
  meal_items: {
    id: string;
    name: string;
    grams: number;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
};

/** Meals with eaten_at in [from, to), newest first. Values are the saved snapshot. */
export async function mealsBetween(from: Date, to: Date): Promise<MealRow[]> {
  if (!hasSupabase) return localMeals.between(from, to);
  const { data, error } = await supabase
    .from('meals')
    .select(
      'id, eaten_at, meal_type, source, note, photo_path, meal_items(id, name, grams, kcal, protein, carbs, fat, position)',
    )
    .gte('eaten_at', from.toISOString())
    .lt('eaten_at', to.toISOString())
    .order('eaten_at', { ascending: false })
    .order('position', { referencedTable: 'meal_items' });
  if (error) throw new Error(friendlyDbError(error.message));
  // numeric columns arrive as strings from PostgREST; normalise.
  return (data ?? []).map((m) => ({
    ...(m as unknown as MealRow),
    meal_items: (m.meal_items ?? []).map((i) => ({
      ...i,
      grams: Number(i.grams),
      kcal: Number(i.kcal),
      protein: Number(i.protein),
      carbs: Number(i.carbs),
      fat: Number(i.fat),
    })),
  }));
}

export async function deleteMeal(id: string): Promise<void> {
  if (!hasSupabase) return localMeals.remove(id);
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw new Error(friendlyDbError(error.message));
}

/** Totals of a saved meal, from its snapshot. */
export function mealTotals(m: MealRow): Nutrients {
  return m.meal_items.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      protein: t.protein + i.protein,
      carbs: t.carbs + i.carbs,
      fat: t.fat + i.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function friendlyDbError(msg: string): string {
  if (/save_meal/.test(msg) && /(not find|does not exist|PGRST202)/i.test(msg))
    return 'Saving is not available on the server yet.';
  if (/JWT|not signed in|permission denied/i.test(msg)) return 'Please sign in again.';
  if (/Failed to fetch|Network request failed/i.test(msg))
    return 'Could not reach the server. Check your connection.';
  return msg;
}

function localRow(input: SaveMealInput): MealRow {
  const { items } = saveMealPayload(input);
  return {
    id: input.id ?? uuid(),
    eaten_at: (input.eatenAt ?? new Date()).toISOString(),
    meal_type: input.mealType,
    source: input.source,
    note: input.note?.trim() || null,
    photo_path: input.photoPath ?? null,
    meal_items: items.map((i, n) => ({ id: `${n}`, name: i.name, grams: i.grams, ...i.macros })),
  };
}

export type { MealResponse };
