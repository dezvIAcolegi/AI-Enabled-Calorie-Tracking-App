# barcode-lookup

Barcode → one shared `foods` row (per 100 g, or per 100 ml when `basis` is `ml`). Owner: Kevin.

It looks in `foods` first (catalogue import plus earlier lookups). On a miss it asks Open Food Facts, stores the product as a shared `off:<barcode>` row, and returns it, so every later scan of that product is a cache hit. A 12-digit UPC-A and its 13-digit EAN form (leading `0`) count as the same barcode.

## Calling it from the app

Requires a signed-in user. `supabase-js` sends the token for you:

```ts
const { data, error } = await supabase.functions.invoke("barcode-lookup", {
  body: { barcode: "5449000000996" },
});
// data.food is a foods row; build the ingredient item from it:
// { name: food.name, food_id: food.id, grams: food.serving_grams ?? 100,
//   confidence: 1, per_100g: { kcal: food.kcal, protein: food.protein,
//   carbs: food.carbs, fat: food.fat } }
```

`GET /functions/v1/barcode-lookup?barcode=…` works too.

To keep the product in the user's library, insert `{ food_id: food.id }` into `products` as usual.

## Response

`200`:

```json
{
  "source": "cache",
  "food": {
    "id": "off:5449000000996", "origin": "off", "name": "Coca-Cola Original",
    "brand": "COCA-COLA SERVICES SA/NV", "barcode": "5449000000996", "basis": "ml",
    "kcal": 44, "protein": 0, "carbs": 10.9, "fat": 0, "fiber": 0,
    "kcal_estimated": false, "serving_name": "1 portion (330 ml)", "serving_grams": 330,
    "missing_fields": ["fiber"]
  }
}
```

`source` is `cache` (already in our database) or `off` (just fetched). `missing_fields` lists values Open Food Facts didn't have; they are stored as 0, so the app can ask the user to check them. `kcal_estimated` is true when kcal was computed as 4·protein + 4·carbs + 9·fat.

Errors are `{ "error": "<code>", "message": "<for humans>" }`:

| Status | `error` | Meaning / what the app should do |
|---|---|---|
| 400 | `bad_barcode` | Not 8–14 digits |
| 401 | `unauthorized` | No signed-in user |
| 404 | `not_found` | Unknown product: offer the label photo or manual entry |
| 422 | `no_usable_nutrition` | OFF knows the product but has no usable nutrition: offer the label photo |
| 502 | `off_unavailable` | OFF timed out or failed: retry, or manual entry |
| 500 | `db_error` | Our side; check the function logs |

## Development

Pure mapping code is in `off.ts` with unit tests in `off_test.ts` (CI runs them):

```sh
deno test --allow-env --allow-read supabase/functions/barcode-lookup/
supabase functions deploy barcode-lookup --use-api   # dev first, then shared
```

The hosted runtime provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; no extra secrets are needed. The service key is used only to write shared `foods` rows, which users can't write under RLS.

Data from Open Food Facts is ODbL: show "Data from Open Food Facts" wherever barcode results appear.
