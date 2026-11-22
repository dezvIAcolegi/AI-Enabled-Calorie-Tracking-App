# Status

Update this when you merge. Paste it into your Claude session at the start of each work block.
Newest entries first. Format: `YYYY-MM-DD · role · landed / contract change / blocked`.

## Phase 0 checklist (26 Oct–1 Nov)

- [x] Monorepo with `/app`, `/supabase`, `/ai`, `/eval`, `/contracts`, `/docs`
- [x] Root `CLAUDE.md` and one per folder
- [ ] DB schema, AI output JSON schemas and `openapi.yaml` agreed and merged
- [ ] FastAPI stubs returning fixed JSON deployed; DB seed data
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
- [ ] FastAPI hosting: Render free tier, Railway, or a university server?
- [ ] Romanian dishes not in FDC: closest generic match or a small custom food table? (after first meal-photo tests)
- [x] Who creates the GitHub repo and owns the Supabase project? Kevin (projects `calorie-dev`, `calorie-shared`, eu-west-1)
- [ ] One shared Gemini key on the backend, or one per developer for testing?
- [ ] Day and time of the weekly integration call

## Log

- 2026-11-22 · backend · **blocked:** Supabase `calorie-dev` and `calorie-shared` are paused (free tier, inactivity); nothing below is live on shared until Kevin restores them.
- 2026-11-22 · backend · contract change (#15): private `meal-photos` bucket, `save_meal(meal, items)`, daily scan cap 30/user/day (`scan_usage`, `consume_scan()`, `scan_quota()`), food-visibility RLS on products/recipe_items/meal_items. Demo seed `supabase/seed/demo-user.ts`.
- 2026-11-22 · backend · landed `barcode-lookup` (#8) and `delete-account` (#9) Edge Functions; app docs in each function's README.md.
- 2026-10-24 · all · Repo initialised with CLAUDE.md files and shared Claude Code plugin config.
