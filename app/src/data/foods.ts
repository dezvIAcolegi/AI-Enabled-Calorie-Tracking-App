// foods rows, barcode-lookup (Kevin's Edge Function, PR #8) and the product library.
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Candidate, Macros } from '@/api';
import { hasSupabase } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import { localProducts, mockBarcode } from './localFoods';

/** A row of public.foods. Values are per 100 g (or per 100 ml when basis is 'ml'). */
export type FoodRow = {
  id: string;
  origin: 'usda' | 'off' | 'ciqual' | 'ro' | 'label' | 'user';
  name: string;
  brand: string | null;
  barcode: string | null;
  basis: 'g' | 'ml';
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  kcal_estimated: boolean;
  serving_name: string | null;
  serving_grams: number | null;
  missing_fields: string[];
};

export const FOOD_COLUMNS =
  'id,origin,name,brand,barcode,basis,kcal,protein,carbs,fat,fiber,kcal_estimated,serving_name,serving_grams,missing_fields';

export const per100 = (f: Pick<FoodRow, 'kcal' | 'protein' | 'carbs' | 'fat'>): Macros => ({
  kcal: Number(f.kcal),
  protein: Number(f.protein),
  carbs: Number(f.carbs),
  fat: Number(f.fat),
});

export const foodLabel = (f: Pick<FoodRow, 'name' | 'brand'>) =>
  f.brand ? `${f.name} (${f.brand})` : f.name;

export const toCandidate = (f: FoodRow): Candidate => ({
  food_id: f.id,
  name: foodLabel(f),
  per_100g: per100(f),
});

// ─── barcode-lookup ──────────────────────────────────────────────────────────

export type BarcodeError =
  | 'bad_barcode'
  | 'unauthorized'
  | 'not_found'
  | 'no_usable_nutrition'
  | 'off_unavailable'
  | 'db_error'
  | 'network';

export type BarcodeResult =
  | { ok: true; food: FoodRow; source: 'cache' | 'off' }
  | { ok: false; error: BarcodeError; message: string };

export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  if (!hasSupabase) return mockBarcode(barcode);
  const { data, error } = await supabase.functions.invoke('barcode-lookup', { body: { barcode } });
  if (!error) {
    const d = data as { food: FoodRow; source: 'cache' | 'off' };
    return { ok: true, food: d.food, source: d.source };
  }
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: BarcodeError; message?: string };
      return {
        ok: false,
        error: body.error ?? 'db_error',
        message: body.message ?? 'Lookup failed.',
      };
    } catch {
      return { ok: false, error: 'db_error', message: 'Lookup failed.' };
    }
  }
  return {
    ok: false,
    error: 'network',
    message: 'Could not reach the server. Check your connection.',
  };
}

/** Lookup failures where the right next step is photographing the label. */
export const offerLabel = (e: BarcodeError) => e === 'not_found' || e === 'no_usable_nutrition';

// ─── user's own foods (label / manual) ───────────────────────────────────────

export type NewFood = {
  origin: 'label' | 'user';
  name: string;
  brand?: string;
  barcode?: string;
  per_100g: Macros;
  serving_grams?: number | null;
  serving_name?: string;
  missing_fields?: string[];
};

/** id prefix the DB requires for each origin (foods_prefix_matches_origin). */
export const idFor = (origin: NewFood['origin'], uuid: string) =>
  `${origin === 'label' ? 'label' : 'manual'}:${uuid}`;

export function newFoodRow(f: NewFood, uuid: string): FoodRow {
  return {
    id: idFor(f.origin, uuid),
    origin: f.origin,
    name: f.name.trim(),
    brand: f.brand?.trim() || null,
    barcode: f.barcode && /^\d{8,14}$/.test(f.barcode) ? f.barcode : null,
    basis: 'g',
    ...f.per_100g,
    fiber: 0,
    kcal_estimated: false,
    serving_name: f.serving_name?.trim() || null,
    serving_grams: f.serving_grams ?? null,
    missing_fields: f.missing_fields ?? [],
  };
}

export async function createFood(f: NewFood): Promise<FoodRow> {
  const row = newFoodRow(f, uuid());
  if (!hasSupabase) return row;
  const { data, error } = await supabase.from('foods').insert(row).select(FOOD_COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as unknown as FoodRow;
}

export async function updateFood(id: string, f: Partial<NewFood>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (f.name !== undefined) patch.name = f.name.trim();
  if (f.brand !== undefined) patch.brand = f.brand.trim() || null;
  if (f.per_100g) Object.assign(patch, f.per_100g);
  if (f.serving_grams !== undefined) patch.serving_grams = f.serving_grams;
  if (f.missing_fields) patch.missing_fields = f.missing_fields;
  if (!hasSupabase) return localProducts.patchFood(id, patch);
  const { error } = await supabase.from('foods').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * The foods row behind a search result. Search results normally come from our own catalogue;
 * if the id isn't there (e.g. an FDC id the import skipped), keep a personal copy instead.
 */
export async function foodForCandidate(c: Candidate): Promise<FoodRow> {
  if (hasSupabase) {
    const { data } = await supabase
      .from('foods')
      .select(FOOD_COLUMNS)
      .eq('id', c.food_id)
      .maybeSingle();
    if (data) return data as unknown as FoodRow;
    return createFood({ origin: 'user', name: c.name, per_100g: c.per_100g });
  }
  const origin = c.food_id.split(':')[0] === 'off' ? 'off' : 'usda';
  return {
    ...newFoodRow({ origin: 'user', name: c.name, per_100g: c.per_100g }, 'x'),
    id: c.food_id,
    origin,
  };
}

// ─── products: the user's library ────────────────────────────────────────────

export type Product = {
  id: string;
  food_id: string;
  nickname: string | null;
  last_used_at: string | null;
  food: FoodRow;
};

export const productName = (p: Product) => p.nickname || foodLabel(p.food);
/** User-owned foods (label/manual) can be edited; shared ones (OFF, USDA) can't. */
export const editableFood = (f: FoodRow) => f.origin === 'label' || f.origin === 'user';

export async function listProducts(): Promise<Product[]> {
  if (!hasSupabase) return localProducts.list();
  const { data, error } = await supabase
    .from('products')
    .select(`id, food_id, nickname, last_used_at, food:foods(${FOOD_COLUMNS})`)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Product[];
}

/** Adds a food to the library; returns the existing product if it's already there. */
export async function addProduct(food: FoodRow, nickname?: string): Promise<Product> {
  if (!hasSupabase) return localProducts.add(food, nickname);
  const { data, error } = await supabase
    .from('products')
    .upsert(
      { food_id: food.id, nickname: nickname?.trim() || null },
      { onConflict: 'user_id,food_id' },
    )
    .select(`id, food_id, nickname, last_used_at, food:foods(${FOOD_COLUMNS})`)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Product;
}

export async function renameProduct(id: string, nickname: string): Promise<void> {
  if (!hasSupabase) return localProducts.rename(id, nickname);
  const { error } = await supabase
    .from('products')
    .update({ nickname: nickname.trim() || null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function touchProduct(id: string): Promise<void> {
  if (!hasSupabase) return localProducts.touch(id);
  await supabase.from('products').update({ last_used_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteProduct(id: string): Promise<void> {
  if (!hasSupabase) return localProducts.remove(id);
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Case- and accent-insensitive filter for the library search box. */
export function matchesQuery(p: Product, q: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = norm(q.trim());
  if (!needle) return true;
  return norm(
    [p.nickname, p.food.name, p.food.brand, p.food.barcode].filter(Boolean).join(' '),
  ).includes(needle);
}

export function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
