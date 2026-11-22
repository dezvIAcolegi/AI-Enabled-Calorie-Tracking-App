// The meal being edited, shared between the Scan screen (which fills it) and the editor.
// A tiny external store instead of a state library (no new dependency).
import { useSyncExternalStore } from 'react';

import type { MealResponse } from '@/api';
import type { MealType } from '@/data/meals';

export type MealSource = 'photo' | 'text' | 'barcode' | 'label' | 'recipe' | 'manual';

export type MealDraft = {
  /** Changes on every new draft, so the editor resets. */
  id: number;
  result: MealResponse;
  source: MealSource;
  /** Local resized photo, uploaded to meal-photos on save. */
  photoUri?: string;
  /** Raw AI output, kept for the scans table when the user has consented. */
  raw?: MealResponse;
  /** Set when editing a saved meal: save_meal replaces it instead of adding one. */
  existing?: {
    id: string;
    mealType: MealType;
    eatenAt: string;
    photoPath: string | null;
    note: string | null;
  };
};

let draft: MealDraft | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

export function setDraft(next: Omit<MealDraft, 'id'> | null) {
  draft = next ? { ...next, id: nextId++ } : null;
  listeners.forEach((l) => l());
}

export const getDraft = () => draft;

export function useDraft(): MealDraft | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
  );
}
