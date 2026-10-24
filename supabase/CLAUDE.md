# /supabase (Role 2: Backend & data, owner Kevin)

Supabase in the **EU region**: Postgres, Auth, Storage, RLS, Edge Functions. Kevin also owns the schema in `/contracts/db`, the GitHub repo and CI.

| Path | Contents |
|---|---|
| `migrations/` | Tables `profiles`, `foods`, `products`, `recipes`, `recipe_items`, `meals`, `meal_items`, `scans` |
| `functions/barcode-lookup/` | Edge Function: Open Food Facts lookup, cached into `foods`/`products` |
| `functions/_shared/` | Code shared between Edge Functions |

## Scope

- RLS on **every** table so each user sees only their own rows. Photos in private buckets.
- Auth, meal saving (with the macro snapshot from `contracts/ts/macros.ts`), rate limits (including the per-user daily scan cap), account and full data deletion. `scans` rows are kept only with user consent.
- **Week 1:** seed data so the app can be built before real data exists.

## May not touch

`/app`, `/ai`, `/eval`, and `/contracts` other than `contracts/db` (still via an all-four PR).

## Working without Docker

Nothing runs locally. There are two hosted projects: **dev** (Kevin's sandbox: push and test here first, reset freely) and **shared** (the team's: only merged changes). Never use `supabase start`, `functions serve`, `db diff`, `db dump`, `test db` or `--local`; they need Docker. Use the dashboard SQL Editor, Advisors and Logs for one-off checks.

## Conventions

- Every schema change is a **new** migration (`supabase migration new <name>`). Never edit an applied migration or change the hosted DB by hand.
- `contracts/db` holds an identical copy of every migration. Run the sync script with `--write` after adding one; CI fails if they differ.
- Every new table gets RLS and a test proving another user can't touch its rows.
- Check which project is linked before `db push`. `db reset --linked` only ever on dev.

## Commands

| Task | Command |
|---|---|
| Log in (once) | `supabase login` |
| Point the CLI at dev / shared | `supabase link --project-ref <dev-ref>` / `<shared-ref>` |
| New migration | `supabase migration new <name>` |
| Copy migrations into `contracts/db` | `deno run --allow-read --allow-write supabase/scripts/check-contracts-sync.ts --write` |
| Check the copy (as CI does) | `deno run --allow-read supabase/scripts/check-contracts-sync.ts` |
| Apply migrations to the linked project | `supabase db push` |
| Applied migrations on the linked project | `supabase migration list` |
| Wipe and rebuild (**dev only**) | `supabase db reset --linked` |
| Deploy a function | `supabase functions deploy <name> --use-api` |
| Set a function secret | `supabase secrets set KEY=value` |
| Format and lint, as CI does | `deno fmt --check supabase/scripts` and `deno lint supabase/scripts` |

Env files: copy `supabase/.env.example` to `.env.dev` and `.env.shared` (git-ignored).
