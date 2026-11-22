// Hands a food picked on the search screen back to whoever opened it.
import type { Candidate } from '@/api';

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
