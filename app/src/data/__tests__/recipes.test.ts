import type { FoodRow } from '../foods';
import {
  itemsForPortion,
  perServing,
  recipeGrams,
  recipeTotals,
  validateRecipe,
  type Recipe,
} from '../recipes';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const food = (id: string, kcal: number, protein: number, carbs: number, fat: number): FoodRow => ({
  id,
  origin: 'usda',
  name: id,
  brand: null,
  barcode: null,
  basis: 'g',
  kcal,
  protein,
  carbs,
  fat,
  fiber: 0,
  kcal_estimated: false,
  serving_name: null,
  serving_grams: null,
  missing_fields: [],
});

const r: Recipe = {
  id: 'r',
  name: 'Omlet',
  servings: 2,
  note: null,
  items: [
    { id: 'a', food: food('fdc:egg', 148, 10, 1.6, 11), grams: 200 },
    { id: 'b', food: food('fdc:milk', 61, 3.2, 4.8, 3.3), grams: 100 },
  ],
};

it('totals and per serving come from macros.ts', () => {
  expect(recipeTotals(r).kcal).toBeCloseTo(296 + 61, 6);
  expect(perServing(r).kcal).toBeCloseTo((296 + 61) / 2, 6);
  expect(recipeGrams(r)).toBe(300);
});

it('scales ingredients for a portion', () => {
  const items = itemsForPortion(r, 1);
  expect(items.map((i) => i.grams)).toEqual([100, 50]);
  expect(items[0]).toMatchObject({
    food_id: 'fdc:egg',
    confidence: 1,
    candidates: [{ food_id: 'fdc:egg' }],
  });
  expect(itemsForPortion(r, 1.5).map((i) => i.grams)).toEqual([150, 75]);
});

it('validates', () => {
  expect(validateRecipe({ name: ' ', servings: 1, items: [] })).toMatch(/name/);
  expect(validateRecipe({ name: 'x', servings: 0, items: [] })).toMatch(/Servings/);
  expect(validateRecipe({ name: 'x', servings: 1, items: [] })).toMatch(/ingredient/);
  expect(
    validateRecipe({ name: 'x', servings: 1, items: [{ food: r.items[0]!.food, grams: 0 }] }),
  ).toMatch(/0\.1/);
  expect(
    validateRecipe({ name: 'x', servings: 1, items: [{ food: r.items[0]!.food, grams: 10 }] }),
  ).toBeNull();
});
