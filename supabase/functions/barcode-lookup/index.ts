// barcode-lookup: barcode → shared `foods` row.
//
//   GET  /functions/v1/barcode-lookup?barcode=5449000000996
//   POST /functions/v1/barcode-lookup   { "barcode": "5449000000996" }
//
// Looks in `foods` first (catalogue import + earlier lookups). On a miss it asks
// Open Food Facts, stores the product as a shared `off:<barcode>` row and returns
// it. Response and error codes: README.md next to this file.

import { corsHeaders, error, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import {
  BARCODE_PATTERN,
  barcodeCandidates,
  OFF_FIELDS,
  type OffProduct,
  toFood,
} from "./off.ts";

const FOOD_COLUMNS =
  "id,origin,name,brand,barcode,basis,kcal,protein,carbs,fat,fiber," +
  "kcal_estimated,serving_name,serving_grams,missing_fields";

// OFF asks API clients to identify themselves with a User-Agent.
const OFF_USER_AGENT = "CalorieTrackerStudentProject/0.1 (Edge Function)";
const OFF_TIMEOUT_MS = 8000;

async function readBarcode(req: Request): Promise<string | null> {
  if (req.method === "GET") {
    return new URL(req.url).searchParams.get("barcode");
  }
  try {
    const body = await req.json();
    return typeof body?.barcode === "string" ? body.barcode : null;
  } catch {
    return null;
  }
}

async function fetchOff(
  barcode: string,
): Promise<{ product: OffProduct } | "not_found" | "unavailable"> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`,
    {
      headers: { "User-Agent": OFF_USER_AGENT },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    },
  ).catch(() => null);
  if (!res) return "unavailable";
  if (res.status === 404) {
    await res.body?.cancel();
    return "not_found";
  }
  if (!res.ok) {
    await res.body?.cancel();
    return "unavailable";
  }
  const body = await res.json().catch(() => null);
  if (!body || body.status !== 1 || !body.product) return "not_found";
  return { product: body.product as OffProduct };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return error(405, "method_not_allowed", "Use GET or POST.");
  }

  const user = await requireUser(req);
  if (!user) return error(401, "unauthorized", "Sign in first.");

  const barcode = (await readBarcode(req))?.trim() ?? "";
  if (!BARCODE_PATTERN.test(barcode)) {
    return error(400, "bad_barcode", "A barcode is 8 to 14 digits.");
  }

  const db = adminClient();
  const candidates = barcodeCandidates(barcode);

  // 1. Already in the shared catalogue?
  const cached = await db
    .from("foods")
    .select(FOOD_COLUMNS)
    .is("owner_id", null)
    .in("barcode", candidates)
    .limit(1)
    .maybeSingle();
  if (cached.error) {
    console.error("foods lookup failed", cached.error);
    return error(500, "db_error", "Could not read the food catalogue.");
  }
  if (cached.data) return json({ food: cached.data, source: "cache" });

  // 2. A cache miss costs one OFF lookup against the user's daily cap.
  const quota = await db.rpc("consume_barcode_lookup", { p_user: user.id });
  if (quota.error) {
    // Don't block scanning if the counter itself fails; just log it.
    console.error("consume_barcode_lookup failed", quota.error);
  } else if (quota.data === false) {
    return error(
      429,
      "barcode_limit",
      "You've looked up a lot of new products today. Try again tomorrow, or photograph the label.",
    );
  }

  // 3. Ask Open Food Facts, trying each form of the barcode.
  let found: { product: OffProduct; code: string } | null = null;
  for (const code of candidates) {
    const result = await fetchOff(code);
    if (result === "unavailable") {
      return error(
        502,
        "off_unavailable",
        "Open Food Facts did not answer. Try again, or enter the food by hand.",
      );
    }
    if (result !== "not_found") {
      found = { product: result.product, code };
      break;
    }
  }
  if (!found) {
    return error(404, "not_found", "No product with this barcode.");
  }

  const food = toFood(found.product, found.code);
  if ("reason" in food) {
    return error(
      422,
      "no_usable_nutrition",
      `Open Food Facts has this product but it can't be used (${food.reason}). Photograph the label instead.`,
    );
  }

  // 4. Cache it as a shared row. ignoreDuplicates covers two users scanning the
  // same new product at once; we then read back whichever row won.
  const saved = await db
    .from("foods")
    .upsert({ ...food, owner_id: null }, {
      onConflict: "id",
      ignoreDuplicates: true,
    });
  if (saved.error) {
    console.error("foods upsert failed", saved.error);
    // Still useful to the user even if caching failed.
    return json({ food, source: "off" });
  }
  const stored = await db.from("foods").select(FOOD_COLUMNS).eq("id", food.id)
    .maybeSingle();
  return json({ food: stored.data ?? food, source: "off" });
});
