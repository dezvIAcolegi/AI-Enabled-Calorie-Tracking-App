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

| Command | What |
|---|---|
| `npm install` | Install deps (`npx expo install <pkg>` to add one, so versions match the SDK) |
| `npx expo start` | Dev server; scan the QR code with Expo Go. Add `--tunnel` if the phone can't reach WSL |
| `npm test` | Jest unit tests (`src/**/__tests__`) |
| `npm run lint` | ESLint (CI runs this) |
| `npm run typecheck` | `tsc --noEmit`, includes `../contracts/ts` (CI runs this) |
| `npm run format` | Prettier |

Copy `.env.example` to `.env`. With `EXPO_PUBLIC_AI_URL` empty the app answers from `contracts/fixtures` (no network); with Supabase vars empty the sign-in gate is off.

## Layout

- `src/app/`: Expo Router routes. `(auth)/` sign-in, `(tabs)/` Today, Scan, Library, Recipes, History; `profile` is pushed from Today.
- `src/api/`: one typed function per AI endpoint (`index.ts`), fetch + token + timeouts + error kinds (`client.ts`), fixture mocks (`mocks.ts`).
- `src/api/types.ts` + `contract-check.ts`: **temporary** mirror of `contracts/ai/*.schema.json` until `contracts/ts/api.ts` exists; delete both then. `contract-check.ts` fails `tsc` if they drift from `macros.ts`.
- `src/lib/`: env, Supabase client, auth context, photo resize (1024 px JPEG).
- `metro.config.js` watches `../contracts` so `@contracts/macros` and the fixtures bundle.
