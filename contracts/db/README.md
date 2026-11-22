# contracts/db: the database schema

Every `.sql` file here is an identical copy of a migration in `supabase/migrations` (CI checks this). Code against these files. Owner: Kevin. Changes need a PR approved by all four. How the AI service uses `foods`: `supabase/docs/foods-for-ai-service.md`.

## Tables

| Table | Who sees it | What it holds |
|---|---|---|
| `foods` | Every signed-in user reads shared rows (`owner_id` null) plus their own | The food catalogue (~104k rows: USDA, Open Food Facts, CIQUAL, Romanian generic foods) plus foods users create from label photos or by hand. All values per 100 g (or 100 ml when `basis = 'ml'`) |
| `products` | Owner only | A user's library: one row per saved food (`food_id`, optional `nickname`, `last_used_at`) |
| `meals` | Owner only | `eaten_at`, `meal_type` (breakfast/lunch/dinner/snack), `source` (photo/text/barcode/label/recipe/manual), `photo_path`, `note` |
| `meal_items` | Owner only | The **snapshot** saved with a meal: `name`, `food_id`, `grams`, `confidence`, per-100 g `kcal_100g`/`protein_100g`/`carbs_100g`/`fat_100g`, and totals `kcal`/`protein`/`carbs`/`fat` computed with `contracts/ts/macros.ts` |
| `recipes`, `recipe_items` | Owner only | A recipe and its foods with grams |
| `scans` | Owner only | Raw AI output + the user's corrected version. Insert only works when `profiles.scan_consent` is true |
| `profiles` | Owner only | Daily targets, `timezone`, `scan_consent`. Created automatically at sign-up |
| `signup_allowlist` | Service role only | Emails allowed to create an account |
| `barcode_usage` | Owner reads; only `barcode-lookup` writes | Open Food Facts lookups per user per day |
| `scan_usage` | Owner reads; only `consume_scan()` writes | AI scans used per user per day (`day` in the user's timezone) |

Every user table has `user_id`, which defaults to the caller (`auth.uid()`), so inserts from the app can leave it out. Deleting a user deletes all their rows.

## Food ids

The contract prefixes, with `origin` recording where a food came from:

| `id` | `origin` | Example |
|---|---|---|
| `fdc:<FDC id>` | `usda` | `fdc:169831` |
| `off:<barcode>` | `off` | `off:5449000000460` |
| `manual:ciqual-<id>` | `ciqual` | `manual:ciqual-12112` |
| `manual:ro-<slug>` | `ro` | `manual:ro-albus` |
| `manual:<uuid>` | `user` | a food a user typed in |
| `label:<uuid>` | `label` | a food from a label photo |

`foods.barcode` is unique among shared rows. Each food also has `serving_name` / `serving_grams` when known (e.g. *1 albuș* = 33 g), `fiber`, `kcal_estimated` and `missing_fields`.

## Search

`search_foods(query text, max_results int default 20)` returns `foods` rows. It ignores case and diacritics ("albus" finds *Albuș de ou*), ranks the user's own foods first and generic foods above packaged ones, and only returns rows the caller may see. Call it with `supabase.rpc('search_foods', { query: 'lapte', max_results: 10 })` or `POST /rest/v1/rpc/search_foods`.

## Meal photos (Storage)

Private bucket `meal-photos`. Upload to `<user id>/<uuid>.jpg`; users can only read and write their own folder. JPEG/PNG/WebP/HEIC, max 5 MB, but resize to ~1024 px before upload. Store the path (not a URL) in `meals.photo_path`, which must start with the owner's id. Show it with `createSignedUrl(path, 3600)`.

```ts
const path = `${user.id}/${crypto.randomUUID()}.jpg`;
await supabase.storage.from("meal-photos").upload(path, jpegBytes, { contentType: "image/jpeg" });
```

## Saving a meal

`save_meal(meal jsonb, items jsonb) → uuid` writes a meal and all its items in one transaction (all or nothing). Pass `meal.id` to edit an existing meal: its fields are updated and its items replaced.

```ts
import { macrosFor } from "../contracts/ts/macros";
const { data: mealId, error } = await supabase.rpc("save_meal", {
  meal: { meal_type: "lunch", source: "photo", photo_path: path },
  items: items.map((it) => ({ ...it, macros: macrosFor(it.per_100g, it.grams) })),
});
```

Each item is an ingredient item (`name`, `food_id`, `grams`, `confidence`, `per_100g`) plus `macros` from `macrosFor`. Extra fields such as `candidates` are ignored. A `food_id` the user can't see is stored as null; the snapshot keeps the name and values. The database rejects totals that don't match `per_100g × grams / 100` (2-decimal rounding allowed), so always use `macrosFor`. Max 50 items.

## Daily scan cap

Each user gets **30 AI scans per day** (photo, text or label), counted in their profile timezone. This keeps the team inside the Gemini free tier.

- **AI service:** before every Gemini call, `POST /rest/v1/rpc/consume_scan` with the user's token (no body). It returns `{ "allowed": true, "used": 4, "limit": 30 }` and counts the scan. When `allowed` is false, skip Gemini and answer **429**. Cached results don't need to consume a scan.
- **App:** `supabase.rpc("scan_quota")` returns the same shape without counting, for "26 scans left today".

Users can read `scan_usage` but never write it. The cap is `daily_scan_limit()`; change it with a new migration.

## Withdrawing consent

`supabase.rpc("withdraw_scan_consent")` turns `scan_consent` off and deletes all of the user's `scans` rows in one transaction; it returns how many were deleted. Meals and photos stay. To give consent, update `profiles` (`scan_consent: true, scan_consent_at: now`).

## Barcode lookups

`barcode-lookup` allows **100 new products per user per day** (cache misses that go to Open Food Facts; barcodes already in `foods` are free). Over the cap it returns **429** `barcode_limit`. Counter: `barcode_usage` (read-only for users); the cap is `daily_barcode_limit()`.

## Who can sign up

Only emails on the **sign-up allowlist** can create an account (the free Gemini tier can't serve users in the EEA outside the team). Anyone else gets an error from `signUp` ("Database error saving new user"); the app should show "This app is invite-only for now". Existing accounts are unaffected.

Kevin adds team members with `supabase/scripts/allow-signup.ts add <email>` (service key; emails never go in the repo). The demo seed and the dev tests add their own addresses.

## Rules

- Change the schema only with a new migration, then copy it here (`check-contracts-sync.ts --write`). Never edit an applied migration.
- Shared catalogue rows are written only server-side (catalogue import, `barcode-lookup`). Users can only create `label`/`user` foods they own.
- `products`, `recipe_items` and `meal_items` can only reference foods the user can see (shared or their own).
- Attribution: Open Food Facts data is ODbL ("Data from Open Food Facts"), CIQUAL is Licence Ouverte (ANSES), USDA is public domain.
