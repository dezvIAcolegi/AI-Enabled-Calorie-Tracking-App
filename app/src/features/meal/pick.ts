// Hands a food picked on the search screen back to whoever opened it.
import type { Candidate } from '@/api';
import type { FoodRow } from '@/data/foods';

type Handler = (c: Candidate, grams: number) => void;
let handler: Handler | null = null;

export function onFoodPicked(h: Handler) {
  handler = h;
}

export function pickFood(c: Candidate, grams: number): boolean {
  const h = handler;
  handler = null;
  if (!h) return false;
  h(c, grams);
  return true;
}

// Library picker hands back the full foods row (no refetch needed).

type RowHandler = (f: FoodRow) => void;
let rowHandler: RowHandler | null = null;

export function onFoodRowPicked(h: RowHandler) {
  rowHandler = h;
}

export function pickFoodRow(f: FoodRow): boolean {
  const h = rowHandler;
  rowHandler = null;
  if (!h) return false;
  h(f);
  return true;
}
