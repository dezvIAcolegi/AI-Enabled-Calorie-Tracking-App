import mealPhoto from '../../../../contracts/fixtures/meal-photo.response.json';
import type { MealResponse } from '@/api';

import { friendlyDbError, mealTotals, mealTypeFor, saveMealPayload } from '../meals';

// Hoisted above the imports by babel-jest.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const items = (mealPhoto as MealResponse).items;

describe('saveMealPayload', () => {
  it('adds macros from macros.ts to every item', () => {
    const { meal, items: out } = saveMealPayload({ mealType: 'breakfast', source: 'photo', items });
    expect(meal).toEqual({ meal_type: 'breakfast', source: 'photo' });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      name: 'scrambled eggs',
      food_id: 'fdc:173424',
      grams: 120,
      confidence: 0.72,
      per_100g: { kcal: 148, protein: 10, carbs: 1.6, fat: 11 },
      macros: {
        kcal: 177.6,
        protein: 12,
        carbs: expect.closeTo(1.92, 9),
        fat: expect.closeTo(13.2, 9),
      },
    });
    expect(out[0]).not.toHaveProperty('candidates');
  });

  it('passes id, time, note and photo only when set', () => {
    const at = new Date('2026-11-22T08:00:00Z');
    const { meal } = saveMealPayload({
      id: 'm1',
      mealType: 'lunch',
      source: 'text',
      eatenAt: at,
      note: '  hi ',
      photoPath: 'u/p.jpg',
      items,
    });
    expect(meal).toEqual({
      id: 'm1',
      meal_type: 'lunch',
      source: 'text',
      eaten_at: at.toISOString(),
      note: 'hi',
      photo_path: 'u/p.jpg',
    });
  });
});

it('picks a meal type from the hour', () => {
  const at = (h: number) => new Date(2026, 10, 22, h);
  expect([7, 12, 19, 23, 16].map((h) => mealTypeFor(at(h)))).toEqual([
    'breakfast',
    'lunch',
    'dinner',
    'snack',
    'snack',
  ]);
});

it('sums a saved meal', () => {
  const t = mealTotals({
    id: 'm',
    eaten_at: '',
    meal_type: 'snack',
    source: 'manual',
    note: null,
    photo_path: null,
    meal_items: [
      { id: 'a', name: 'a', grams: 1, kcal: 10, protein: 1, carbs: 2, fat: 3 },
      { id: 'b', name: 'b', grams: 1, kcal: 5, protein: 1, carbs: 1, fat: 1 },
    ],
  });
  expect(t).toEqual({ kcal: 15, protein: 2, carbs: 3, fat: 4 });
});

it('explains a missing save_meal', () => {
  expect(friendlyDbError('Could not find the function public.save_meal(items, meal)')).toMatch(
    /not available/,
  );
});
