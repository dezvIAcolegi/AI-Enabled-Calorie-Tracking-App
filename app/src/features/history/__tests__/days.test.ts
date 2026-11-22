import type { MealRow } from '@/data/meals';

import { averageOfLogged, dailyTotals, dayKey, macroShares, parseDayKey } from '../days';

// Hoisted above the imports by babel-jest.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const meal = (at: Date, kcal: number): MealRow => ({
  id: String(at.getTime()),
  eaten_at: at.toISOString(),
  meal_type: 'lunch',
  source: 'manual',
  note: null,
  photo_path: null,
  meal_items: [{ id: 'i', name: 'x', grams: 100, kcal, protein: 10, carbs: 20, fat: 5 }],
});

const end = new Date(2026, 10, 22, 15);

it('groups meals by local day, oldest first, with empty days', () => {
  const days = dailyTotals(
    [
      meal(new Date(2026, 10, 22, 8), 300),
      meal(new Date(2026, 10, 22, 20), 500),
      meal(new Date(2026, 10, 20, 12), 400),
      meal(new Date(2026, 10, 1), 999),
    ],
    end,
    7,
  );
  expect(days.map((d) => d.key)).toEqual([
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ]);
  expect(days[6]).toMatchObject({ meals: 2, totals: { kcal: 800, protein: 20 } });
  expect(days[4]!.totals.kcal).toBe(400);
  expect(days[0]!.meals).toBe(0);
});

it('averages only logged days', () => {
  const days = dailyTotals(
    [meal(new Date(2026, 10, 22, 8), 300), meal(new Date(2026, 10, 20, 12), 500)],
    end,
    7,
  );
  expect(averageOfLogged(days)!.kcal).toBe(400);
  expect(averageOfLogged(dailyTotals([], end, 7))).toBeNull();
});

it('round-trips day keys and rejects bad ones', () => {
  expect(dayKey(parseDayKey('2026-02-28')!)).toBe('2026-02-28');
  expect(parseDayKey('2026-02-30')).toBeNull();
  expect(parseDayKey('x')).toBeNull();
});

it('splits kcal by macro', () => {
  const s = macroShares({ kcal: 0, protein: 25, carbs: 50, fat: 0 });
  expect(s.protein).toBeCloseTo(1 / 3);
  expect(s.fat).toBe(0);
});
