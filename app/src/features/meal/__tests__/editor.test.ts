import mealPhoto from '../../../../../contracts/fixtures/meal-photo.response.json';
import type { MealResponse } from '@/api';

import {
  warningText,
  editorReducer,
  initEditor,
  itemMacros,
  MAX_GRAMS,
  MIN_GRAMS,
  parseGrams,
  totals,
} from '../editor';

const fixture = mealPhoto as MealResponse;
const start = () => initEditor(fixture.items, fixture.warnings);

describe('editor', () => {
  it('starts from the AI result with stable keys', () => {
    const s = start();
    expect(s.items.map((i) => i.name)).toEqual(['scrambled eggs', 'toast', 'cherry tomatoes']);
    expect(new Set(s.items.map((i) => i.key)).size).toBe(3);
    expect(totals(s).kcal).toBeCloseTo(177.6 + 87.9 + 10.8, 6);
  });

  it('does not mutate the API result', () => {
    const copy = JSON.parse(JSON.stringify(fixture));
    const s = start();
    editorReducer(s, { type: 'switchCandidate', key: s.items[0]!.key, foodId: 'fdc:173423' });
    expect(fixture).toEqual(copy);
  });

  it('recalculates live when grams change', () => {
    let s = start();
    const eggs = s.items[0]!;
    s = editorReducer(s, { type: 'setGrams', key: eggs.key, grams: 200 });
    expect(itemMacros(s.items[0]!).kcal).toBeCloseTo(296, 6);
    expect(totals(s).kcal).toBeCloseTo(296 + 87.9 + 10.8, 6);
  });

  it('clamps grams to the DB bounds', () => {
    let s = start();
    const k = s.items[0]!.key;
    s = editorReducer(s, { type: 'setGrams', key: k, grams: 0 });
    expect(s.items[0]!.grams).toBe(MIN_GRAMS);
    s = editorReducer(s, { type: 'setGrams', key: k, grams: 99999 });
    expect(s.items[0]!.grams).toBe(MAX_GRAMS);
  });

  it('removes an item', () => {
    let s = start();
    s = editorReducer(s, { type: 'remove', key: s.items[1]!.key });
    expect(s.items.map((i) => i.name)).toEqual(['scrambled eggs', 'cherry tomatoes']);
  });

  it('switching a match keeps food_id/per_100g equal to candidates[0]', () => {
    let s = start();
    const eggs = s.items[0]!;
    s = editorReducer(s, { type: 'switchCandidate', key: eggs.key, foodId: 'fdc:173423' });
    const it = s.items[0]!;
    expect(it.food_id).toBe('fdc:173423');
    expect(it.per_100g.kcal).toBe(196);
    expect(it.candidates[0]!.food_id).toBe('fdc:173423');
    expect(it.candidates).toHaveLength(3);
    expect(it.key).toBe(eggs.key);
    expect(it.grams).toBe(120);
  });

  it('ignores an unknown candidate', () => {
    const s = start();
    const next = editorReducer(s, { type: 'switchCandidate', key: s.items[0]!.key, foodId: 'x:1' });
    expect(next.items[0]).toEqual(s.items[0]);
  });

  it('adds a searched food as a manual, fully confident item', () => {
    let s = start();
    s = editorReducer(s, {
      type: 'add',
      candidate: {
        food_id: 'fdc:1',
        name: 'Rice',
        per_100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      },
      grams: 150,
    });
    const added = s.items[3]!;
    expect(added).toMatchObject({ manual: true, confidence: 1, grams: 150, food_id: 'fdc:1' });
    expect(itemMacros(added).kcal).toBeCloseTo(195, 6);
  });

  it('ignores an empty rename', () => {
    const s = start();
    expect(editorReducer(s, { type: 'rename', key: s.items[0]!.key, name: '  ' })).toBe(s);
  });
});

describe('parseGrams', () => {
  it.each([
    ['120', 120],
    ['12,5', 12.5],
    ['12.5', 12.5],
    [' 80 ', 80],
    ['.5', 0.5],
  ])('%s -> %s', (t, n) => expect(parseGrams(t)).toBe(n));

  it.each(['', 'abc', '-5', '0', '6000', '1e3', '12,5,1'])('rejects %p', (t) =>
    expect(parseGrams(t)).toBeNull(),
  );
});

describe('warningText', () => {
  it('explains known warnings and survives unknown ones', () => {
    expect(warningText('mixed_dish')).toMatch(/estimates/);
    expect(warningText('unmatched_food')).toMatch(/Add food/);
    expect(warningText('brand_new_value')).toMatch(/Check these items/);
  });
});
