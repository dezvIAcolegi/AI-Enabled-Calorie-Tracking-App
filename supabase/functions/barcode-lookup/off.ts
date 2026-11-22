// Turns an Open Food Facts product into a `foods` row. Pure functions only, so
// they can be unit-tested without the network or a database.

export const BARCODE_PATTERN = /^[0-9]{8,14}$/;

export type FoodRow = {
  id: string;
  origin: "off";
  name: string;
  brand: string | null;
  barcode: string;
  basis: "g" | "ml";
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  kcal_estimated: boolean;
  serving_name: string | null;
  serving_grams: number | null;
  missing_fields: string[];
};

// The subset of an OFF v2 product we read. Every field may be missing.
export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_ro?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity_unit?: string;
  serving_quantity_unit?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

// Fields to request from OFF, so responses stay small.
export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "product_name_ro",
  "generic_name",
  "brands",
  "quantity",
  "product_quantity_unit",
  "serving_quantity_unit",
  "serving_size",
  "serving_quantity",
  "nutriments",
].join(",");

/**
 * The barcode as typed plus the forms OFF or our catalogue may store it under:
 * a 12-digit UPC-A is the same product as its 13-digit EAN with a leading 0.
 */
export function barcodeCandidates(barcode: string): string[] {
  const out = [barcode];
  if (barcode.length === 12) out.push(`0${barcode}`);
  if (barcode.length === 13 && barcode.startsWith("0")) {
    out.push(barcode.slice(1));
  }
  return out;
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * True when the product is a liquid sold by volume, so its `_100g` values are
 * really per 100 ml. OFF doesn't always return every unit field, so any one
 * of them saying ml/cl/l is enough.
 */
export function isLiquid(product: OffProduct): boolean {
  const units = [product.product_quantity_unit, product.serving_quantity_unit]
    .map((u) => u?.trim().toLowerCase());
  if (units.some((u) => u === "ml" || u === "cl" || u === "l")) return true;
  return /\d\s*(ml|cl|l)\b/i.test(product.quantity ?? "");
}

/**
 * Maps an OFF product to a shared `foods` row, or returns the reason it can't
 * be stored. The row satisfies every check on `public.foods`.
 */
export function toFood(
  product: OffProduct,
  barcode: string,
): FoodRow | { reason: string } {
  if (!BARCODE_PATTERN.test(barcode)) return { reason: "bad barcode" };

  const name = clean(product.product_name, 300) ??
    clean(product.product_name_en, 300) ??
    clean(product.product_name_ro, 300) ??
    clean(product.generic_name, 300);
  if (!name) return { reason: "product has no name" };

  const n = product.nutriments ?? {};
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const fiber = num(n.fiber_100g);
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
    if (kj !== null) kcal = kj / 4.184;
  }

  const missing: string[] = [];
  if (protein === null) missing.push("protein");
  if (carbs === null) missing.push("carbs");
  if (fat === null) missing.push("fat");
  if (fiber === null) missing.push("fiber");

  // Without kcal and without all three macros there is nothing to log.
  if (kcal === null && (protein === null || carbs === null || fat === null)) {
    return { reason: "product has no nutrition data" };
  }

  let kcalEstimated = false;
  if (kcal === null) {
    kcal = 4 * protein! + 4 * carbs! + 9 * fat!;
    kcalEstimated = true;
    missing.push("kcal");
  }

  const row: FoodRow = {
    id: `off:${barcode}`,
    origin: "off",
    name,
    brand: clean(product.brands?.split(",")[0], 200),
    barcode,
    basis: isLiquid(product) ? "ml" : "g",
    kcal: round2(kcal),
    protein: round2(protein ?? 0),
    carbs: round2(carbs ?? 0),
    fat: round2(fat ?? 0),
    fiber: round2(fiber ?? 0),
    kcal_estimated: kcalEstimated,
    serving_name: null,
    serving_grams: null,
    missing_fields: missing,
  };

  if (row.kcal > 900) return { reason: `kcal ${row.kcal} > 900 per 100 g` };
  if ([row.protein, row.carbs, row.fat, row.fiber].some((v) => v > 100)) {
    return { reason: "a macro is above 100 g per 100 g" };
  }
  if (row.protein + row.carbs + row.fat + row.fiber > 105) {
    return { reason: "macros add up to more than 100 g" };
  }

  // The column keeps 2 decimals, so a tiny serving would round to 0.
  const servingGrams = num(product.serving_quantity);
  if (servingGrams !== null) {
    const g = round2(servingGrams);
    if (g > 0 && g <= 5000) {
      row.serving_grams = g;
      row.serving_name = clean(product.serving_size, 100);
    }
  }

  return row;
}
