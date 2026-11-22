import { router } from 'expo-router';

import { itemsFromMeal, type MealRow } from '@/data/meals';
import { setDraft } from '@/features/meal/draft';

/** Reopen a saved meal in the ingredient editor; saving replaces it (save_meal with id). */
export function editMeal(m: MealRow) {
  setDraft({
    result: { items: itemsFromMeal(m), warnings: [] },
    source: m.source,
    existing: {
      id: m.id,
      mealType: m.meal_type,
      eatenAt: m.eaten_at,
      photoPath: m.photo_path,
      note: m.note,
    },
  });
  router.push('/meal/edit');
}
