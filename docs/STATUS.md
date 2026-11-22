# Status

Update this when you merge. Paste it into your Claude session at the start of each work block.
Newest entries first. Format: `YYYY-MM-DD · role · landed / contract change / blocked`.

## Phase 0 checklist (26 Oct–1 Nov)

- [x] Monorepo with `/app`, `/supabase`, `/ai`, `/eval`, `/contracts`, `/docs`
- [x] Root `CLAUDE.md` and one per folder
- [x] DB schema, AI output JSON schemas and `openapi.yaml` agreed and merged (`openapi.yaml` + `ts/api.ts` in #23)
- [ ] FastAPI stubs returning fixed JSON deployed; DB seed data (DB seed: done on shared, catalogue + demo account)
- [ ] CI and branch protection on (CI runs on every PR; `main` is **not** protected yet, Kevin to enable a required `ci-ok` check)
- [ ] Everyone runs the app on their phone against the stubs

## Decided (24 Oct)

- Expo + Supabase (EU) + Python FastAPI AI service
- Roles: Mihai (1, app), Kevin (2, backend), Sebi (3, meal AI), Lucas (4, label AI & nutrition)
- Gemini Flash via the free Gemini API (AI Studio key), chosen over self-hosting
- Test on Android and iOS; English UI; Romanian and English labels

## Still open

- [ ] A1–A5: dates and what each asks for, to pin the phases
- [ ] iOS: who has an iPhone to test with Expo Go?
- [x] FastAPI hosting: Render free tier, Frankfurt (agreed 4/4 on the board). Live at https://calorie-ai-t1r0.onrender.com (`ai/render.yaml`, #34), with its own Gemini key in a separate Google project
- [ ] Romanian dishes not in FDC: closest generic match or a small custom food table? (after first meal-photo tests)
- [x] Who creates the GitHub repo and owns the Supabase project? Kevin (projects `calorie-dev`, `calorie-shared`, eu-west-1)
- [ ] One shared Gemini key on the backend, or one per developer for testing?
- [ ] Day and time of the weekly integration call

## Log

- 2026-11-22 · label-ai · landed: AI service deployed on Render (#34), auto-redeploys on merges touching `ai/`. Live end-to-end test with the demo account passes: ES256 token accepted, `/foods/search` returns catalogue foods ("albus de ou" → *Albuș de ou*), `/label/read` reads a Romanian label exactly in 3.7 s (cached repeat 0.2 s), `scan_quota` 0 → 1 with the repeat not counted. Next: label test set in `/eval/label`.
- 2026-11-22 · label-ai · contract change (#23): `contracts/openapi.yaml` + generated `contracts/ts/api.ts`; `/label/read` uses a label-only `LabelMacros` with nullable values (unreadable → `null` + `flagged`); 401/413/415/429/502/503 documented as `{ detail }`, 429 is `daily_scan_cap` or `model_quota`.
- 2026-11-22 · label-ai · landed: `/label/read` calls `consume_scan` before Gemini (#19); `ai/scripts/check_openapi.py` for CI (#14); `test_auth` fakes the meal pipeline (#27).
- 2026-11-22 · label-ai · landed (#11): real `POST /label/read` (Gemini Flash-lite, EXIF rotate + resize to 1600 px, kJ→kcal, per-100 g derived from per-serving labels, `checks.py` flags, cached by photo hash).
- 2026-11-22 · label-ai · landed (#10): real `GET /foods/search` on Supabase `search_foods` with the caller's token (FDC API dropped); in-process `search_foods` / `get_food` for `meal/`; 5-min cache.
- 2026-11-22 · label-ai · landed (#7): Supabase access-token check (JWKS, ES256/RS256) on every AI route except `/health`; meal router mounted.

- 2026-11-22 · app · **blocked:** live end-to-end test needs Supabase restored (Kevin), the AI service URL (Lucas, Render) and real `/meal/*` routes (Sebi). Until then the app runs in device-only mock mode (empty `app/.env`).
- 2026-11-22 · app · landed (#22): History (weekly macro chart, 28 days, day view), Recipes (build from library/search, log a portion as scaled ingredients), readable 429 `daily_scan_cap`/`model_quota` and 413/415/502/503 messages.
- 2026-11-22 · app · landed (#17): ingredient editor (live totals from `macros.ts`, top-3 matches, portions, confidence), meal photo/text, barcode via `barcode-lookup`, label review (flagged fields required), library, Today, profile (targets, scan consent, delete account), email sign-in. Saves through `save_meal` + `meal-photos`.
- 2026-11-22 · app · landed (#12): Expo SDK 58 app in `/app`, typed `api/` layer (temporary `app/src/api/types.ts` until `contracts/ts/api.ts` merges), navigation, fixture mocks.
- 2026-11-22 · backend · **live on shared:** Supabase restored; all 4 migrations applied, `barcode-lookup` + `delete-account` deployed, 104,010-food catalogue copied from dev, demo account seeded. Integration suites pass on dev and shared. Access tokens are ES256. Sign-up is invite-only (`allow-signup.ts invite`); see `supabase/docs/auth.md`.
- 2026-11-22 · backend · contract change (#36): `withdraw_scan_consent()`; `barcode-lookup` capped at 100 uncached products/user/day (429 `barcode_limit`, table `barcode_usage`).
- 2026-11-22 · backend · contract change (#38): generated `contracts/ts/database.ts` (`supabase/scripts/gen-db-types.sh`).
- 2026-11-22 · backend · landed: deploy workflow `deploy-supabase.yml` (#37, skips until repo secrets are set); auth `invite` + `supabase/docs/auth.md` (#40); demo seed fix (#35); sign-up allowlist (#31); CI runs app Jest tests (#33).
- 2026-11-22 · backend · contract change (#15): private `meal-photos` bucket, `save_meal(meal, items)`, daily scan cap 30/user/day (`scan_usage`, `consume_scan()`, `scan_quota()`), food-visibility RLS on products/recipe_items/meal_items. Demo seed `supabase/seed/demo-user.ts`.
- 2026-11-22 · backend · landed `barcode-lookup` (#8) and `delete-account` (#9) Edge Functions; app docs in each function's README.md.
- 2026-10-24 · all · Repo initialised with CLAUDE.md files and shared Claude Code plugin config.
