-- Initial schema: shared food catalogue, user library, meals, recipes, scans, profiles.
-- RLS is on for every table: users only ever see their own rows, plus the shared catalogue.
-- Explained for the team in contracts/db/README.md.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Lower-case and strip diacritics, so "albus" finds "Albuș de ou".
create function public.normalize_search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, '')))
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  kcal_target integer check (kcal_target between 800 and 10000),
  protein_target numeric(6, 1) check (protein_target between 0 and 1000),
  carbs_target numeric(6, 1) check (carbs_target between 0 and 2000),
  fat_target numeric(6, 1) check (fat_target between 0 and 1000),
  timezone text not null default 'Europe/Bucharest',
  scan_consent boolean not null default false,
  scan_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── foods: shared catalogue + foods users create ───────────────────────────
-- Shared rows (owner_id null) come from the catalogue import or barcode-lookup.
-- id prefixes follow the contract: fdc (USDA), off (Open Food Facts),
-- manual (CIQUAL, Romanian generic foods, user-entered), label (label photos).

create table public.foods (
  id text primary key check (id ~ '^(fdc|off|label|manual):[A-Za-z0-9._-]{1,64}$'),
  origin text not null check (origin in ('usda', 'off', 'ciqual', 'ro', 'label', 'user')),
  name text not null check (char_length(name) between 1 and 300),
  brand text check (char_length(brand) <= 200),
  barcode text check (barcode ~ '^[0-9]{8,14}$'),
  basis text not null default 'g' check (basis in ('g', 'ml')),
  kcal numeric(6, 2) not null check (kcal between 0 and 900),
  protein numeric(5, 2) not null check (protein between 0 and 100),
  carbs numeric(5, 2) not null check (carbs between 0 and 100),
  fat numeric(5, 2) not null check (fat between 0 and 100),
  fiber numeric(5, 2) not null default 0 check (fiber between 0 and 100),
  kcal_estimated boolean not null default false,
  serving_name text check (char_length(serving_name) <= 100),
  serving_grams numeric(7, 2) check (serving_grams > 0 and serving_grams <= 5000),
  missing_fields text[] not null default '{}',
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade,
  search_text text generated always as (
    public.normalize_search_text(name || ' ' || coalesce(brand, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foods_macros_fit_100g check (protein + carbs + fat + fiber <= 105),
  constraint foods_owner_matches_origin check (
    (origin in ('usda', 'off', 'ciqual', 'ro') and owner_id is null)
    or (origin in ('label', 'user') and owner_id is not null)
  ),
  constraint foods_prefix_matches_origin check (
    (origin = 'usda' and id like 'fdc:%')
    or (origin = 'off' and id like 'off:%')
    or (origin in ('ciqual', 'ro', 'user') and id like 'manual:%')
    or (origin = 'label' and id like 'label:%')
  )
);

create unique index foods_shared_barcode_key on public.foods (barcode)
  where owner_id is null and barcode is not null;
create index foods_owner_id_idx on public.foods (owner_id) where owner_id is not null;
create index foods_search_text_trgm_idx on public.foods
  using gin (search_text extensions.gin_trgm_ops);

-- ─── products: each user's library of saved foods ───────────────────────────

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id text not null references public.foods (id) on delete cascade,
  nickname text check (char_length(nickname) <= 100),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, food_id)
);

create index products_food_id_idx on public.products (food_id);

-- ─── recipes ─────────────────────────────────────────────────────────────────

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  servings numeric(5, 2) not null default 1 check (servings > 0),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index recipes_user_id_idx on public.recipes (user_id);

-- The composite key makes an item always belong to the same user as its recipe.
create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  user_id uuid not null default auth.uid(),
  food_id text not null references public.foods (id),
  grams numeric(7, 2) not null check (grams > 0 and grams <= 5000),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);

create index recipe_items_recipe_idx on public.recipe_items (recipe_id, user_id);
create index recipe_items_user_id_idx on public.recipe_items (user_id);
create index recipe_items_food_id_idx on public.recipe_items (food_id);

-- ─── meals ───────────────────────────────────────────────────────────────────

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at timestamptz not null default now(),
  meal_type text not null default 'snack'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  source text not null default 'manual'
    check (source in ('photo', 'text', 'barcode', 'label', 'recipe', 'manual')),
  photo_path text check (char_length(photo_path) <= 500),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index meals_user_eaten_at_idx on public.meals (user_id, eaten_at desc);

-- Snapshot at save time: per-100 g values and the totals computed with
-- contracts/ts/macros.ts, so later catalogue edits never change history.
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id uuid not null default auth.uid(),
  food_id text references public.foods (id) on delete set null,
  name text not null check (char_length(name) between 1 and 300),
  grams numeric(7, 2) not null check (grams > 0 and grams <= 5000),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  kcal_100g numeric(6, 2) not null check (kcal_100g >= 0),
  protein_100g numeric(5, 2) not null check (protein_100g >= 0),
  carbs_100g numeric(5, 2) not null check (carbs_100g >= 0),
  fat_100g numeric(5, 2) not null check (fat_100g >= 0),
  kcal numeric(8, 2) not null check (kcal >= 0),
  protein numeric(7, 2) not null check (protein >= 0),
  carbs numeric(7, 2) not null check (carbs >= 0),
  fat numeric(7, 2) not null check (fat >= 0),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade
);

create index meal_items_meal_idx on public.meal_items (meal_id, user_id);
create index meal_items_user_id_idx on public.meal_items (user_id);
create index meal_items_food_id_idx on public.meal_items (food_id);

-- ─── scans: raw AI output + the user's correction, only with consent ────────

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid,
  kind text not null check (kind in ('meal_photo', 'meal_text', 'label')),
  model text check (char_length(model) <= 100),
  raw_output jsonb not null,
  corrected jsonb,
  created_at timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals (id, user_id)
    on delete set null (meal_id)
);

create index scans_user_created_at_idx on public.scans (user_id, created_at desc);
create index scans_meal_idx on public.scans (meal_id, user_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger foods_set_updated_at before update on public.foods
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger meals_set_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

-- ─── food search (used by GET /foods/search and meal matching) ──────────────
-- Runs as the caller, so RLS limits results to the shared catalogue plus the
-- caller's own foods. The user's own foods rank first, then generic foods.

create function public.search_foods(query text, max_results integer default 20)
returns setof public.foods
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select public.normalize_search_text(query) as text)
  select f.*
  from public.foods f, q
  where char_length(q.text) >= 2
    and (q.text operator(extensions.<%) f.search_text
         or f.search_text like '%' || q.text || '%')
  order by
    (f.owner_id is not null) desc,
    (f.search_text like q.text || '%') desc,
    extensions.word_similarity(q.text, f.search_text) desc,
    (f.origin in ('ro', 'usda', 'ciqual')) desc,
    char_length(f.name)
  limit least(greatest(max_results, 1), 50)
$$;

-- ─── privileges ──────────────────────────────────────────────────────────────
-- Signed-in users go through RLS; anonymous callers get nothing.

revoke all on public.profiles, public.foods, public.products, public.recipes,
  public.recipe_items, public.meals, public.meal_items, public.scans from anon;
grant select, insert, update, delete on public.foods, public.products, public.recipes,
  public.recipe_items, public.meals, public.meal_items, public.scans to authenticated;
grant select, update on public.profiles to authenticated;
grant all on public.profiles, public.foods, public.products, public.recipes,
  public.recipe_items, public.meals, public.meal_items, public.scans to service_role;

revoke execute on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ─── row level security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.products enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.scans enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "foods: read shared and own" on public.foods
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "foods: create own label or manual foods" on public.foods
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and origin in ('label', 'user'));
create policy "foods: update own" on public.foods
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and origin in ('label', 'user'));
create policy "foods: delete own" on public.foods
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "products: read own" on public.products
  for select to authenticated using (user_id = (select auth.uid()));
create policy "products: insert own" on public.products
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "products: update own" on public.products
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "products: delete own" on public.products
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "recipes: read own" on public.recipes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recipes: insert own" on public.recipes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recipes: update own" on public.recipes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipes: delete own" on public.recipes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "recipe_items: read own" on public.recipe_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recipe_items: insert own" on public.recipe_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recipe_items: update own" on public.recipe_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipe_items: delete own" on public.recipe_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "meals: read own" on public.meals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "meals: insert own" on public.meals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meals: update own" on public.meals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meals: delete own" on public.meals
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "meal_items: read own" on public.meal_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "meal_items: insert own" on public.meal_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meal_items: update own" on public.meal_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_items: delete own" on public.meal_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "scans: read own" on public.scans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "scans: insert own with consent" on public.scans
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.scan_consent
    )
  );
create policy "scans: update own" on public.scans
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "scans: delete own" on public.scans
  for delete to authenticated using (user_id = (select auth.uid()));
