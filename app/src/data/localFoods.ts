// Mock-mode (no Supabase) stand-ins for barcode-lookup and the product library.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BarcodeResult, FoodRow, Product } from './foods';

const KEY = 'mock-products-v1';

const COLA: FoodRow = {
  id: 'off:5449000000996',
  origin: 'off',
  name: 'Coca-Cola Original',
  brand: 'Coca-Cola',
  barcode: '5449000000996',
  basis: 'ml',
  kcal: 42,
  protein: 0,
  carbs: 10.6,
  fat: 0,
  fiber: 0,
  kcal_estimated: false,
  serving_name: '1 can (330 ml)',
  serving_grams: 330,
  missing_fields: ['fiber'],
};
const OATS: FoodRow = {
  id: 'off:5941234567890',
  origin: 'off',
  name: 'Fulgi de ovăz',
  brand: 'Demo',
  barcode: '5941234567890',
  basis: 'g',
  kcal: 389,
  protein: 13,
  carbs: 66,
  fat: 7,
  fiber: 10,
  kcal_estimated: false,
  serving_name: '40 g',
  serving_grams: 40,
  missing_fields: [],
};

/** Any barcode starting with 0000 is "not found", so the label flow can be demoed. */
export async function mockBarcode(code: string): Promise<BarcodeResult> {
  await new Promise((r) => setTimeout(r, 500));
  if (!/^\d{8,14}$/.test(code))
    return { ok: false, error: 'bad_barcode', message: 'A barcode is 8 to 14 digits.' };
  if (code.startsWith('0000'))
    return { ok: false, error: 'not_found', message: 'No product with this barcode.' };
  const food = code === COLA.barcode ? COLA : { ...OATS, id: `off:${code}`, barcode: code };
  return { ok: true, food, source: 'off' };
}

async function load(): Promise<Product[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Product[];
  } catch {
    return [];
  }
}
const save = (p: Product[]) => AsyncStorage.setItem(KEY, JSON.stringify(p));
const rand = () => Math.random().toString(36).slice(2);

export const localProducts = {
  list: load,
  async add(food: FoodRow, nickname?: string): Promise<Product> {
    const all = await load();
    const existing = all.find((p) => p.food_id === food.id);
    if (existing) return existing;
    const p: Product = {
      id: rand(),
      food_id: food.id,
      nickname: nickname?.trim() || null,
      last_used_at: null,
      food,
    };
    await save([p, ...all]);
    return p;
  },
  async rename(id: string, nickname: string) {
    await save(
      (await load()).map((p) => (p.id === id ? { ...p, nickname: nickname.trim() || null } : p)),
    );
  },
  async touch(id: string) {
    const now = new Date().toISOString();
    const all = (await load()).map((p) => (p.id === id ? { ...p, last_used_at: now } : p));
    await save(all.sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')));
  },
  async remove(id: string) {
    await save((await load()).filter((p) => p.id !== id));
  },
  async patchFood(foodId: string, patch: Record<string, unknown>) {
    await save(
      (await load()).map((p) =>
        p.food_id === foodId ? { ...p, food: { ...p.food, ...patch } as FoodRow } : p,
      ),
    );
  },
};
