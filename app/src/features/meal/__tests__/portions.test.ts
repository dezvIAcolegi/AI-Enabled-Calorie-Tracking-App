import { portionsFor } from '../portions';

it('offers egg portions', () => {
  expect(
    portionsFor('scrambled eggs', 'Egg, whole, cooked, scrambled').map((p) => p.grams),
  ).toEqual([25, 50, 100]);
});
it('prefers cherry tomato over tomato', () => {
  expect(portionsFor('cherry tomatoes')[1]).toEqual({ label: '1 cherry tomato', grams: 17 });
});
it('knows Romanian dishes', () => {
  expect(portionsFor('sarmale')[1]?.grams).toBe(70);
});
it('returns nothing for unknown foods', () => {
  expect(portionsFor('quinoa salad')).toEqual([]);
});
it('reads Romanian egg and bread', () => {
  expect(portionsFor('ouă fierte')[1]?.label).toBe('1 egg');
  expect(portionsFor('pâine')[1]?.label).toBe('1 slice');
});
