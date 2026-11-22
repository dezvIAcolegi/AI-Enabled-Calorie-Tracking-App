import type { Nutrients } from '@contracts/macros';

import { mealTotals, type MealRow } from '@/data/meals';

export type DayTotals = { key: string; date: Date; totals: Nutrients; meals: number };

/** yyyy-mm-dd of the local day. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseDayKey(k: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === k ? d : null;
}

/** The `n` local days ending with `end` (oldest first), each with its totals; empty days included. */
export function dailyTotals(meals: MealRow[], end: Date, n: number): DayTotals[] {
  const days: DayTotals[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    days.push({
      key: dayKey(d),
      date: d,
      totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      meals: 0,
    });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const m of meals) {
    const day = byKey.get(dayKey(new Date(m.eaten_at)));
    if (!day) continue;
    const x = mealTotals(m);
    day.totals = {
      kcal: day.totals.kcal + x.kcal,
      protein: day.totals.protein + x.protein,
      carbs: day.totals.carbs + x.carbs,
      fat: day.totals.fat + x.fat,
    };
    day.meals += 1;
  }
  return days;
}

/** Average over days that have at least one meal (empty days would drag it down). */
export function averageOfLogged(days: DayTotals[]): Nutrients | null {
  const logged = days.filter((d) => d.meals > 0);
  if (!logged.length) return null;
  const s = logged.reduce(
    (a, d) => ({
      kcal: a.kcal + d.totals.kcal,
      protein: a.protein + d.totals.protein,
      carbs: a.carbs + d.totals.carbs,
      fat: a.fat + d.totals.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const n = logged.length;
  return { kcal: s.kcal / n, protein: s.protein / n, carbs: s.carbs / n, fat: s.fat / n };
}

/** kcal from each macro, as shares of the total (4/4/9). */
export function macroShares(m: Nutrients) {
  const p = m.protein * 4,
    c = m.carbs * 4,
    f = m.fat * 9;
  const t = p + c + f;
  return t ? { protein: p / t, carbs: c / t, fat: f / t } : { protein: 0, carbs: 0, fat: 0 };
}
