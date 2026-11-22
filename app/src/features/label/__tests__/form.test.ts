import labelRead from '../../../../../contracts/fixtures/label-read.response.json';
import type { LabelResult } from '@/api';

import { formFromLabel, kcalCheck, setField, validate } from '../form';

const clean = labelRead as LabelResult;

it('fills every field from a clean read', () => {
  const f = formFromLabel(clean);
  expect(f.values).toEqual({
    'per_100g.kcal': '389',
    'per_100g.protein': '13',
    'per_100g.carbs': '66',
    'per_100g.fat': '7',
    serving_grams: '40',
  });
  expect(f.flagged.size).toBe(0);
});

it('never shows a flagged 0 as a value (PR #11 behaviour)', () => {
  const r: LabelResult = {
    ...clean,
    per_100g: { ...clean.per_100g!, fat: 0 },
    flagged: ['per_100g.fat'],
  };
  const f = formFromLabel(r);
  expect(f.values['per_100g.fat']).toBe('');
  expect([...f.flagged]).toEqual(['per_100g.fat']);
  expect(validate({ ...f, name: 'Oats' })).toMatchObject({
    ok: false,
    errors: { 'per_100g.fat': 'Required' },
  });
});

it('derives per 100 g from per serving when only that was readable', () => {
  const r: LabelResult = {
    per_100g: null,
    per_serving: { kcal: 156, protein: 5.2, carbs: 26.4, fat: 2.8 },
    serving_grams: 40,
    flagged: [],
  };
  expect(formFromLabel(r).values['per_100g.kcal']).toBe('390');
});

it('flags everything when nothing was readable', () => {
  const r: LabelResult = {
    per_100g: null,
    per_serving: null,
    serving_grams: null,
    flagged: ['per_100g', 'per_serving', 'serving_grams'],
  };
  const f = formFromLabel(r);
  expect(f.flagged.size).toBe(5);
  expect(f.values.serving_grams).toBe('');
});

it('editing a field clears its highlight', () => {
  const r: LabelResult = { ...clean, flagged: ['per_100g.fat'] };
  const f = setField(formFromLabel(r), 'per_100g.fat', '7,5');
  expect(f.flagged.has('per_100g.fat')).toBe(false);
  const v = validate({ ...f, name: 'Oats' });
  expect(v).toMatchObject({ ok: true, per_100g: { fat: 7.5 }, serving_grams: 40 });
});

it('requires a name and enforces DB limits', () => {
  const f = formFromLabel(clean);
  expect(validate(f)).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  expect(validate(setField({ ...f, name: 'x' }, 'per_100g.kcal', '950'))).toMatchObject({
    ok: false,
    errors: { 'per_100g.kcal': 'At most 900' },
  });
});

it('warns when calories do not add up (4/4/9)', () => {
  expect(kcalCheck({ kcal: 389, protein: 13, carbs: 66, fat: 7 })).toBeNull();
  expect(kcalCheck({ kcal: 100, protein: 13, carbs: 66, fat: 7 })).toMatch(/don't match/);
  const v = validate(setField({ ...formFromLabel(clean), name: 'x' }, 'per_100g.kcal', '100'));
  expect(v).toMatchObject({ ok: true, warnings: [expect.stringMatching(/don't match/)] });
});
