// Pure state for the ingredient editor. No React here, so it's unit-tested directly.
import { macrosFor, sumMacros, type Nutrients } from '@contracts/macros';

import type { Candidate, IngredientItem, MealWarning } from '@/api';

/** Same bounds as meal_items.grams in the DB. */
export const MIN_GRAMS = 0.1;
export const MAX_GRAMS = 5000;
/** Below this the item is shown as "check this". */
export const LOW_CONFIDENCE = 0.5;

export type EditorItem = IngredientItem & {
  /** Stable React key; survives edits and switching matches. */
  key: string;
  /** Added by the user (search) rather than detected by the AI. */
  manual: boolean;
};

export type EditorState = {
  items: EditorItem[];
  warnings: MealWarning[];
};

export type EditorAction =
  | { type: 'setGrams'; key: string; grams: number }
  | { type: 'remove'; key: string }
  | { type: 'switchCandidate'; key: string; foodId: string }
  | { type: 'add'; candidate: Candidate; grams: number }
  | { type: 'rename'; key: string; name: string };

let seq = 0;
const newKey = () => `item-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function clampGrams(g: number): number {
  if (!Number.isFinite(g)) return MIN_GRAMS;
  return Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, g));
}

/** "12,5" (Romanian keyboards) and "12.5" both work. Null when it isn't a usable number. */
export function parseGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= MIN_GRAMS && n <= MAX_GRAMS ? n : null;
}

export function initEditor(items: IngredientItem[], warnings: MealWarning[] = []): EditorState {
  return {
    items: items.map((i) => ({
      ...i,
      candidates: [...i.candidates],
      key: newKey(),
      manual: false,
    })),
    warnings,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setGrams':
      return mapItem(state, action.key, (i) => ({ ...i, grams: clampGrams(action.grams) }));
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.key !== action.key) };
    case 'rename': {
      const name = action.name.trim();
      return name ? mapItem(state, action.key, (i) => ({ ...i, name })) : state;
    }
    case 'switchCandidate':
      return mapItem(state, action.key, (i) => {
        const chosen = i.candidates.find((c) => c.food_id === action.foodId);
        if (!chosen) return i;
        // Keep the contract invariant: food_id/per_100g == candidates[0].
        const rest = i.candidates.filter((c) => c.food_id !== action.foodId);
        return {
          ...i,
          food_id: chosen.food_id,
          per_100g: chosen.per_100g,
          candidates: [chosen, ...rest],
        };
      });
    case 'add': {
      const c = action.candidate;
      const item: EditorItem = {
        key: newKey(),
        manual: true,
        name: c.name,
        food_id: c.food_id,
        per_100g: c.per_100g,
        grams: clampGrams(action.grams),
        confidence: 1, // the user picked it
        candidates: [c],
      };
      return { ...state, items: [...state.items, item] };
    }
  }
}

function mapItem(state: EditorState, key: string, f: (i: EditorItem) => EditorItem): EditorState {
  return { ...state, items: state.items.map((i) => (i.key === key ? f(i) : i)) };
}

export const itemMacros = (i: EditorItem): Nutrients => macrosFor(i.per_100g, i.grams);
export const totals = (s: EditorState): Nutrients => sumMacros(s.items);

/** What the user should be told about this result, in plain words. */
export function warningText(w: MealWarning | string): string {
  switch (w) {
    case 'no_food_detected':
      return 'No food was found. Add items with search, or try another photo.';
    case 'image_unclear':
      return 'The photo was unclear, so these are rough guesses. Check each item.';
    case 'mixed_dish':
      return 'Mixed dish: ingredients and grams are estimates. Adjust them if you can.';
    case 'text_unclear':
      return 'Part of your description could not be understood. Add anything that is missing.';
    case 'unmatched_food': // proposed by meal-ai (board, 22 Nov)
      return "Some foods couldn't be matched. Add them with + Add food.";
    default: // a value newer than this build: still tell the user something
      return 'Check these items carefully before saving.';
  }
}
