import { sumMacros } from '@contracts/macros';

import { mocks } from '../mocks';
import { foodSource, type IngredientItem } from '../types';

const FOOD_ID = /^(fdc|off|label|manual):.+$/;

function expectValidItem(item: IngredientItem) {
  expect(item.name.length).toBeGreaterThan(0);
  expect(item.food_id).toMatch(FOOD_ID);
  expect(item.grams).toBeGreaterThan(0);
  expect(item.confidence).toBeGreaterThanOrEqual(0);
  expect(item.confidence).toBeLessThanOrEqual(1);
  expect(item.candidates.length).toBeGreaterThanOrEqual(1);
  expect(item.candidates.length).toBeLessThanOrEqual(3);
  // Contract: food_id and per_100g always equal candidates[0].
  expect(item.candidates[0]!.food_id).toBe(item.food_id);
  expect(item.candidates[0]!.per_100g).toEqual(item.per_100g);
}

describe('mocks follow contracts/ai', () => {
  jest.useFakeTimers();
  const run = async <T>(p: Promise<T>) => {
    jest.runAllTimers();
    return p;
  };

  it('meal photo items are valid ingredient items', async () => {
    const res = await run(mocks.mealPhoto());
    expect(res.items.length).toBeGreaterThan(0);
    res.items.forEach(expectValidItem);
    expect(res.warnings).toEqual([]);
  });

  it('meal text items are valid ingredient items', async () => {
    const res = await run(mocks.mealText());
    res.items.forEach(expectValidItem);
  });

  it('meal totals come from macros.ts', async () => {
    const res = await run(mocks.mealPhoto());
    const total = sumMacros(res.items);
    // 120 g eggs @148 + 30 g toast @293 + 60 g tomatoes @18
    expect(total.kcal).toBeCloseTo(177.6 + 87.9 + 10.8, 6);
  });

  it('returns a fresh copy each call', async () => {
    const a = await run(mocks.mealPhoto());
    a.items[0]!.grams = 999;
    const b = await run(mocks.mealPhoto());
    expect(b.items[0]!.grams).toBe(120);
  });

  it('label result has nullable values and a flagged list', async () => {
    const res = await run(mocks.labelRead());
    expect(Array.isArray(res.flagged)).toBe(true);
    expect(res.serving_grams === null || res.serving_grams > 0).toBe(true);
  });

  it('food search filters by query', async () => {
    expect((await run(mocks.foodsSearch('fried'))).map((c) => c.food_id)).toEqual(['fdc:173423']);
    expect(await run(mocks.foodsSearch('zzz'))).toEqual([]);
  });
});

describe('foodSource', () => {
  it('reads the prefix', () => {
    expect(foodSource('fdc:173424')).toBe('fdc');
    expect(foodSource('label:abc')).toBe('label');
    expect(foodSource('usda:1')).toBeNull();
  });
});
