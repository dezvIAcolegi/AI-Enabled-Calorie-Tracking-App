// AI service types, generated from contracts/openapi.yaml into contracts/ts/api.ts (#23).
// Only aliases live here; never redefine a contract shape by hand.
import type { components } from '@contracts/api';

type S = components['schemas'];

export type Macros = S['Macros'];
export type Candidate = S['Candidate'];
export type IngredientItem = S['IngredientItem'];
export type MealResponse = S['MealResponse'];
export type MealWarning = MealResponse['warnings'][number];
export type MealTextRequest = S['MealTextRequest'];
export type FoodsSearchResponse = Candidate[];
/** Like Macros, but a single unreadable value is null (and listed in `flagged`). */
export type LabelMacros = S['LabelMacros'];
export type LabelResult = S['LabelResult'];
/** Body of every documented error: 401, 413, 415, 429, 502, 503. */
export type ErrorResponse = S['ErrorResponse'];

/** Food entry id, prefixed by source. Pattern: ^(fdc|off|label|manual):.+$ */
export type FoodId = string;
export type FoodSource = 'fdc' | 'off' | 'label' | 'manual';

/** The source prefix of a food id, or null when the id is malformed. */
export function foodSource(foodId: FoodId): FoodSource | null {
  const prefix = foodId.split(':', 1)[0];
  return prefix === 'fdc' || prefix === 'off' || prefix === 'label' || prefix === 'manual'
    ? prefix
    : null;
}
