// Device-only meal store used when Supabase isn't configured (mock mode), so the whole
// scan → edit → save → Today flow can be demoed with no backend.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MealRow } from './meals';

const KEY = 'mock-meals-v1';

async function load(): Promise<MealRow[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as MealRow[];
  } catch {
    return [];
  }
}

const store = (rows: MealRow[]) => AsyncStorage.setItem(KEY, JSON.stringify(rows));

export const localMeals = {
  async upsert(row: MealRow): Promise<string> {
    const rows = (await load()).filter((r) => r.id !== row.id);
    await store([row, ...rows]);
    return row.id;
  },
  async between(from: Date, to: Date): Promise<MealRow[]> {
    return (await load())
      .filter((r) => {
        const t = new Date(r.eaten_at).getTime();
        return t >= from.getTime() && t < to.getTime();
      })
      .sort((a, b) => b.eaten_at.localeCompare(a.eaten_at));
  },
  async get(id: string): Promise<MealRow | null> {
    return (await load()).find((r) => r.id === id) ?? null;
  },
  async remove(id: string): Promise<void> {
    await store((await load()).filter((r) => r.id !== id));
  },
};
