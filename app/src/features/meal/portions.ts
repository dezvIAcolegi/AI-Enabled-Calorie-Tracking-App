// Common portions so the user can tap "1 egg" instead of typing grams (team plan, risk table).
// App-side heuristics matched on the item and food names; there is no portion contract.
export type Portion = { label: string; grams: number };

type Rule = { match: RegExp; unit: string; grams: number };

// Order matters: first match wins. Grams are typical edible weights (USDA household measures).
const RULES: Rule[] = [
  { match: /\begg|\bou(ă|a)?\b/i, unit: 'egg', grams: 50 },
  { match: /\b(bread|toast|pâine|paine)/i, unit: 'slice', grams: 30 },
  { match: /\bbanana/i, unit: 'banana', grams: 118 },
  { match: /\bapple|\bmăr/i, unit: 'apple', grams: 182 },
  { match: /\borange/i, unit: 'orange', grams: 131 },
  { match: /\bcherry tomato/i, unit: 'cherry tomato', grams: 17 },
  { match: /\btomato|\broșie/i, unit: 'tomato', grams: 123 },
  { match: /\b(rice|pasta|orez|paste)\b/i, unit: 'cup cooked', grams: 158 },
  { match: /\bcheese|\bbrânz/i, unit: 'slice', grams: 20 },
  { match: /\bmilk|\blapte|\byogh?urt|\biaurt/i, unit: 'cup', grams: 245 },
  { match: /\b(chicken breast|piept de pui)/i, unit: 'breast', grams: 172 },
  { match: /\bpotato|\bcartof/i, unit: 'potato', grams: 173 },
  { match: /\b(butter|unt|oil|ulei)\b/i, unit: 'tbsp', grams: 14 },
  { match: /\b(sugar|zahăr)\b/i, unit: 'tsp', grams: 4 },
  { match: /\b(sarmale|sarma)\b/i, unit: 'sarma', grams: 70 },
  { match: /\bmici\b/i, unit: 'mic', grams: 60 },
  { match: /\b(soup|ciorb|supă)/i, unit: 'bowl', grams: 300 },
];

/** Up to 3 portion choices for an item: ½, 1 and 2 of its unit. Empty when nothing matches. */
export function portionsFor(...names: string[]): Portion[] {
  const text = names.join(' ');
  const rule = RULES.find((r) => r.match.test(text));
  if (!rule) return [];
  return [
    { label: `½ ${rule.unit}`, grams: rule.grams / 2 },
    { label: `1 ${rule.unit}`, grams: rule.grams },
    { label: `2 ${rule.unit}`, grams: rule.grams * 2 },
  ];
}
