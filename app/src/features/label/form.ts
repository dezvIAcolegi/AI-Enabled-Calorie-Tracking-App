// Label review form: turns POST /label/read into editable text fields and back.
// Rule from Lucas (board, PR #11): an unreadable nutrient comes back as 0 AND is listed in
// `flagged`. So a flagged field starts EMPTY (never a silent 0) and must be filled in.
import type { LabelResult, Macros } from '@/api';

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

/** A label block where any single value may be unreadable (null), as in `LabelMacros` (PR #23). */
type LabelBlock = { [K in Nutrient]: number | null };
/** Accepts today's LabelResult and the nullable LabelMacros version. */
export type LabelInput = Omit<LabelResult, 'per_100g' | 'per_serving'> & {
  per_100g: LabelBlock | null;
  per_serving: LabelBlock | null;
};
export type FieldName = `per_100g.${Nutrient}` | 'serving_grams';

export type LabelForm = {
  name: string;
  brand: string;
  values: Record<FieldName, string>;
  /** Fields the reader flagged; they stay highlighted until the user edits them. */
  flagged: Set<FieldName>;
};

const FIELDS: FieldName[] = [...NUTRIENTS.map((n) => `per_100g.${n}` as const), 'serving_grams'];

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function formFromLabel(r: LabelInput): LabelForm {
  const flagged = new Set<FieldName>();
  const values = {} as Record<FieldName, string>;

  // Per nutrient: prefer per_100g; else scale per_serving by serving_grams; else unknown.
  const valueFor = (n: Nutrient): number | null => {
    const direct = r.per_100g?.[n];
    if (direct != null) return direct;
    const serving = r.per_serving?.[n];
    if (serving != null && r.serving_grams) return (serving * 100) / r.serving_grams;
    return null;
  };

  for (const n of NUTRIENTS) {
    const field = `per_100g.${n}` as const;
    const v = valueFor(n);
    const wasFlagged = r.flagged.includes(field) || r.flagged.includes(`per_serving.${n}`);
    if (v === null || wasFlagged) {
      values[field] = '';
      flagged.add(field);
    } else {
      values[field] = fmt(v);
    }
  }
  if (r.serving_grams == null || r.flagged.includes('serving_grams')) {
    values.serving_grams = r.serving_grams ? fmt(r.serving_grams) : '';
    if (r.flagged.includes('serving_grams')) flagged.add('serving_grams');
  } else {
    values.serving_grams = fmt(r.serving_grams);
  }
  // Anything else the reader flagged (e.g. a whole block) highlights every nutrient.
  if (r.flagged.some((f) => f === 'per_100g' || f === 'per_serving'))
    NUTRIENTS.forEach((n) => flagged.add(`per_100g.${n}`));
  return { name: '', brand: '', values, flagged };
}

export function setField(f: LabelForm, field: FieldName, text: string): LabelForm {
  const flagged = new Set(f.flagged);
  flagged.delete(field); // the user has looked at it
  return { ...f, values: { ...f.values, [field]: text }, flagged };
}

const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  return Number(t);
};

export type Validated =
  | { ok: true; per_100g: Macros; serving_grams: number | null; warnings: string[] }
  | { ok: false; errors: Partial<Record<FieldName | 'name', string>> };

export function validate(f: LabelForm): Validated {
  const errors: Partial<Record<FieldName | 'name', string>> = {};
  if (!f.name.trim()) errors.name = 'Give the product a name.';
  const m = {} as Macros;
  for (const n of NUTRIENTS) {
    const field = `per_100g.${n}` as const;
    const v = num(f.values[field]);
    const max = n === 'kcal' ? 900 : 100; // foods table checks
    if (v === null) errors[field] = 'Required';
    else if (v > max) errors[field] = `At most ${max}`;
    else m[n] = v;
  }
  let serving: number | null = null;
  if (f.values.serving_grams.trim()) {
    serving = num(f.values.serving_grams);
    if (serving === null || serving <= 0 || serving > 5000)
      errors.serving_grams = 'Between 1 and 5000 g';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (m.protein + m.carbs + m.fat > 105)
    return { ok: false, errors: { 'per_100g.fat': 'Protein + carbs + fat can’t exceed 100 g' } };
  const warnings: string[] = [];
  const check = kcalCheck(m);
  if (check) warnings.push(check);
  return { ok: true, per_100g: m, serving_grams: serving, warnings };
}

/** The team's label sanity check: kcal ≈ 4·protein + 4·carbs + 9·fat. Null when it fits. */
export function kcalCheck(m: Macros): string | null {
  const expected = 4 * m.protein + 4 * m.carbs + 9 * m.fat;
  // 15 % or 15 kcal, whichever is larger: fibre, alcohol and rounding on labels.
  if (Math.abs(m.kcal - expected) <= Math.max(15, expected * 0.15)) return null;
  return `Calories (${Math.round(m.kcal)}) don't match protein, carbs and fat (≈${Math.round(expected)} kcal). Check the numbers.`;
}

export const fieldLabel: Record<FieldName, string> = {
  'per_100g.kcal': 'Energy (kcal)',
  'per_100g.protein': 'Protein (g)',
  'per_100g.carbs': 'Carbohydrates (g)',
  'per_100g.fat': 'Fat (g)',
  serving_grams: 'Serving size (g)',
};

export const ALL_FIELDS = FIELDS;
