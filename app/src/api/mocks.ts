// Answers from contracts/fixtures when EXPO_PUBLIC_AI_URL is empty, so screens can be
// built and demoed with no backend. A short delay keeps loading states visible.
import foodsSearch from '../../../contracts/fixtures/foods-search.response.json';
import labelRead from '../../../contracts/fixtures/label-read.response.json';
import mealPhoto from '../../../contracts/fixtures/meal-photo.response.json';
import mealText from '../../../contracts/fixtures/meal-text.response.json';
import type { FoodsSearchResponse, LabelResult, MealResponse } from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
// structuredClone so screens that mutate a result can't corrupt the shared fixture.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const mocks = {
  async mealPhoto(): Promise<MealResponse> {
    await delay(900);
    return clone(mealPhoto as MealResponse);
  },
  async mealText(): Promise<MealResponse> {
    await delay(600);
    return clone(mealText as MealResponse);
  },
  async labelRead(): Promise<LabelResult> {
    await delay(900);
    return clone(labelRead as LabelResult);
  },
  async foodsSearch(q: string): Promise<FoodsSearchResponse> {
    await delay(250);
    const needle = q.trim().toLowerCase();
    // The stub ignores q; filtering here makes the mock search feel real in the UI.
    return clone(foodsSearch as FoodsSearchResponse).filter((c) =>
      c.name.toLowerCase().includes(needle),
    );
  },
};
