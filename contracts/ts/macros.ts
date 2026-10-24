// The one macro rule: macros = per_100g × grams / 100.
// Python twin: ai/app/nutrition/macros.py. Change both together.
// Rounding: never here. Round only when displaying (kcal to 0 decimals, grams to 1).

export type Nutrients = { kcal: number; protein: number; carbs: number; fat: number };
export type MacroItem = { per_100g: Nutrients; grams: number };

export function macrosFor(per100g: Nutrients, grams: number): Nutrients {
  return {
    kcal: (per100g.kcal * grams) / 100,
    protein: (per100g.protein * grams) / 100,
    carbs: (per100g.carbs * grams) / 100,
    fat: (per100g.fat * grams) / 100,
  };
}

export function sumMacros(items: MacroItem[]): Nutrients {
  const total: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    const m = macrosFor(item.per_100g, item.grams);
    total.kcal += m.kcal;
    total.protein += m.protein;
    total.carbs += m.carbs;
    total.fat += m.fat;
  }
  return total;
}
