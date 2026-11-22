// The food being logged or added on the product screens (set before navigating there).
import type { FoodRow } from '@/data/foods';

let food: FoodRow | null = null;
export const setActiveFood = (f: FoodRow | null) => {
  food = f;
};
export const getActiveFood = () => food;
