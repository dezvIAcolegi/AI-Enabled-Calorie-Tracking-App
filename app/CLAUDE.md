# /app (Role 1: Mobile app, owner Mihai)

Expo (React Native, TypeScript), Expo Router, expo-camera for photos and barcodes. Must run in Expo Go on Android and iOS. English UI.

## Scope

Screens: login, today's log (macro totals vs targets), meal scan (photo or text) → editable ingredient list (change grams, remove, add) with live recalculation → save, barcode scanner, label review (ask the user to fill in fields the label endpoint couldn't read), product library, recipes, history.

- Talk only to Supabase and the AI service, never to Gemini, FDC or Open Food Facts directly.
- Call the AI service over HTTPS with the user's Supabase access token. Use the types in `contracts/ts/api.ts`.
- Barcodes go through the Supabase Edge Function `barcode-lookup`.
- Resize photos before upload (Gemini free-tier limits).
- Build against the deployed FastAPI stubs and Supabase seed data until real endpoints are live (see `docs/STATUS.md`).
- Recalculate macros with `contracts/ts/macros.ts`. Don't write your own.
- Show per-item confidence. Offer common portions (1 egg, 1 slice) and the top-3 alternative matches.

## May not touch

`/supabase`, `/ai`, `/eval`, `/contracts`.

## Board

You post as `@mihairusu05` (app). Rules are in the root `CLAUDE.md`.

- **Watch for:** endpoints going from stub to live (Sebi, Lucas), changes to tables, RLS or `barcode-lookup` (Kevin), new AI service URLs, and contract `PROPOSAL`s.
- **`NEED` to:**
  - Kevin for tables, columns, RLS, storage or Edge Functions.
  - Sebi for `/meal/*` behaviour.
  - Lucas for `/label/read`, `/foods/search`, `macros.ts`, the AI service URL or auth.
- **`DONE` when:** a screen works end to end, so the owner of the backend or AI part can test their piece in the app. Tag that owner.

## Commands

Node 22 (Linux, via nvm). Run from `/app`:

| Command             | What                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `npm install`       | Install deps (`npx expo install <pkg>` to add one, so versions match the SDK)          |
| `npx expo start`    | Dev server; scan the QR code with Expo Go. Add `--tunnel` if the phone can't reach WSL |
| `npm test`          | Jest: logic tests plus screen tests with React Native Testing Library (`src/app/__tests__`; v14 needs `await render` / `await fireEvent`) |
| `npm run lint`      | ESLint (CI runs this)                                                                  |
| `npm run typecheck` | `tsc --noEmit`, includes `../contracts/ts` (CI runs this)                              |
| `npm run format`    | Prettier                                                                               |

Copy `.env.example` to `.env`. With `EXPO_PUBLIC_AI_URL` empty the app answers from `contracts/fixtures` (no network); with Supabase vars empty the sign-in gate is off.

## Layout

- `src/app/`: Expo Router routes. `(auth)/sign-in`; `(tabs)/` Today, Scan, Library, Recipes, History; `profile`; `capture?mode=meal|label|barcode`; `meal/edit` (ingredient editor), `meal/search`, `meal/text`; `label/review`; `product/barcode`, `product/log`; `library/add|pick|[id]`; `recipe/edit|[id]`; `history/[day]`.
- `src/api/`: one typed function per AI endpoint (`index.ts`), fetch + token + timeouts + error kinds (`client.ts`), fixture mocks (`mocks.ts`), `warmUp()` for the sleeping free host.
- `src/api/types.ts`: aliases of the generated `contracts/ts/api.ts` (`components['schemas']`); never hand-write a contract shape. `contract-check.ts` fails `tsc` if the generated `Macros`/`IngredientItem` stop fitting `macros.ts`.
- `src/data/`: Supabase access (meals via `save_meal`, foods/products, barcode-lookup, recipes, profile, delete-account). With no Supabase env, each falls back to a device-only store (`local*.ts`) so every flow can be demoed.
- `src/features/`: pure logic with tests (`meal/editor.ts`, `meal/portions.ts`, `label/form.ts`, `history/days.ts`) plus small cross-screen stores (`draft.ts`, `pick.ts`, `product/active.ts`).
- `metro.config.js` watches `../contracts` so `@contracts/macros` and the fixtures bundle.

## Rules learned from teammates

- `/label/read`: an unreadable nutrient may come back as `0` **and** be listed in `flagged` (or as `null` once `LabelMacros` lands). Flagged fields start empty and are required; never save a flagged 0.
- 429 `detail`: `daily_scan_cap` (30 AI scans/user/day, `scan_quota()`) vs `model_quota` (shared Gemini quota); messages in `api/client.ts`.
- `save_meal` rejects macros that don't equal `per_100g × grams / 100`: always send `macrosFor()` output, never rounded values.
- Show "Data from Open Food Facts" wherever barcode results appear (ODbL).
