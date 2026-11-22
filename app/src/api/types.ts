/**
 * TEMPORARY. Delete this file as soon as `contracts/ts/api.ts` exists.
 *
 * `contracts/openapi.yaml` and its generated `contracts/ts/api.ts` have not been
 * written yet (see the NEED posted to @LucasKing4546 on board issue #5). Until they
 * land, these types are a hand-written mirror of the JSON schemas in `/contracts/ai`,
 * which ARE agreed contracts:
 *
 *   Macros, FoodId, Candidate, IngredientItem  <- contracts/ai/ingredient-item.schema.json
 *   MealResponse, MealWarning                  <- contracts/ai/meal-response.schema.json
 *   LabelResult                                <- contracts/ai/label-result.schema.json
 *   FoodsSearchResponse                        <- contracts/ai/foods-search-response.schema.json
 *
 * Request shapes come from the FastAPI stubs in /ai (multipart `image` for the two
 * photo endpoints, JSON `{ text }` for /meal/text, `?q=` for /foods/search). Those are
 * the part NOT covered by a contract and the part most likely to drift — treat them as
 * provisional until openapi.yaml exists.
 *
 * Do not add app-only fields here. App state belongs in src/features, not in a
 * mirror of a contract.
 */

/** Food entry id, prefixed by source. Pattern: ^(fdc|off|label|manual):.+$ */
export type FoodId = string;

export type FoodSource = 'fdc' | 'off' | 'label' | 'manual';

/** Nutrition per 100 g. Structurally identical to `Nutrients` in contracts/ts/macros.ts. */
export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** One possible food-entry match for a detected food. */
export type Candidate = {
  food_id: FoodId;
  /** Name in the source database, e.g. "Egg, whole, cooked, scrambled". */
  name: string;
  per_100g: Macros;
};

/**
 * One food in a meal. `food_id` and `per_100g` always equal `candidates[0]`;
 * switching match means replacing both from the chosen candidate.
 */
export type IngredientItem = {
  /** Name as detected by the model, e.g. "scrambled eggs". Shown to the user. */
  name: string;
  food_id: FoodId;
  /** Estimated portion in grams, > 0. The user can edit it. */
  grams: number;
  /** 0..1, how sure the AI is about detection and portion. */
  confidence: number;
  per_100g: Macros;
  /** 1..3 entries, best first. */
  candidates: Candidate[];
};

export type MealWarning = 'no_food_detected' | 'image_unclear' | 'mixed_dish' | 'text_unclear';

/** Response of POST /meal/photo and POST /meal/text. */
export type MealResponse = {
  items: IngredientItem[];
  warnings: MealWarning[];
};

/** Response of POST /label/read. Unreadable values are null and named in `flagged`. */
export type LabelResult = {
  per_100g: Macros | null;
  per_serving: Macros | null;
  serving_grams: number | null;
  /** Dotted field names that were unreadable or failed a check, e.g. "per_100g.fat". */
  flagged: string[];
};

/** Response of GET /foods/search. Best match first; empty when nothing matches. */
export type FoodsSearchResponse = Candidate[];

/** Request body of POST /meal/text. */
export type MealTextRequest = {
  /** 1..500 characters. */
  text: string;
};

/** The source prefix of a food id, or null when the id is malformed. */
export function foodSource(foodId: FoodId): FoodSource | null {
  const prefix = foodId.split(':', 1)[0];
  switch (prefix) {
    case 'fdc':
    case 'off':
    case 'label':
    case 'manual':
      return prefix;
    default:
      return null;
  }
}
