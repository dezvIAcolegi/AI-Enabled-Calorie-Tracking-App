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

## Rules

- Change the schema only with a new migration, then copy it here (`check-contracts-sync.ts --write`). Never edit an applied migration.
- Shared catalogue rows are written only server-side (catalogue import, `barcode-lookup`). Users can only create `label`/`user` foods they own.
- Attribution: Open Food Facts data is ODbL ("Data from Open Food Facts"), CIQUAL is Licence Ouverte (ANSES), USDA is public domain.
