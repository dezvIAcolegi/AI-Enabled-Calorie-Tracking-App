-- Meal photos bucket, atomic meal saving, the per-user daily scan cap, and a
-- fix so users can only reference foods they can see.
-- Explained for the team in contracts/db/README.md.

-- ─── meal-photos: private bucket, one folder per user ───────────────────────
-- Path: <user id>/<anything>.jpg. Resize before upload (the app sends ~1024 px
-- JPEGs); the 5 MB cap is a backstop, not a target.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos', 'meal-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "meal-photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal-photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal-photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'meal-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'meal-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal-photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A meal can only point at a photo in its owner's folder.
alter table public.meals
  add constraint meals_photo_in_own_folder
  check (photo_path is null or photo_path like user_id::text || '/%') not valid;

-- ─── meal_items: totals must follow the macro rule ──────────────────────────
-- The app computes totals with contracts/ts/macros.ts (per_100g × grams / 100).
-- This only guards against a wrong or stale snapshot; it doesn't compute
-- anything. The slack covers storing grams, per-100 g values and totals at
-- 2 decimals (each term is 2× the worst-case rounding error):
--   totals ±0.005 → 0.01; per_100g ±0.005 × grams/100 → grams/10000;
--   grams ±0.005 × per_100g/100 → per_100g/10000.

alter table public.meal_items
  add constraint meal_items_totals_follow_macro_rule check (
    abs(kcal - kcal_100g * grams / 100) <= 0.01 + grams / 10000 + kcal_100g / 10000
    and abs(protein - protein_100g * grams / 100) <= 0.01 + grams / 10000 + protein_100g / 10000
    and abs(carbs - carbs_100g * grams / 100) <= 0.01 + grams / 10000 + carbs_100g / 10000
    and abs(fat - fat_100g * grams / 100) <= 0.01 + grams / 10000 + fat_100g / 10000
  ) not valid;

-- ─── save_meal: a meal and its items in one transaction ─────────────────────
-- meal:  { "id"?: uuid, "eaten_at"?, "meal_type"?, "source"?, "photo_path"?, "note"? }
--        With "id" it replaces that meal's fields and all its items (editing).
-- items: [ { "name", "food_id", "grams", "confidence"?,
--            "per_100g": { "kcal", "protein", "carbs", "fat" },
--            "macros":   { "kcal", "protein", "carbs", "fat" } } ]
--        "macros" is macrosFor(per_100g, grams) from contracts/ts/macros.ts.
--        A food_id the caller can't see (or that doesn't exist) is saved as null;
--        the snapshot keeps the name and values.
-- Runs as the caller, so RLS applies. Returns the meal id.

create function public.save_meal(meal jsonb, items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meal_id uuid := (meal ->> 'id')::uuid;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 50 then
    raise exception 'a meal has at most 50 items' using errcode = '22023';
  end if;

  if v_meal_id is null then
    insert into public.meals (eaten_at, meal_type, source, photo_path, note)
    values (
      coalesce((meal ->> 'eaten_at')::timestamptz, now()),
      coalesce(meal ->> 'meal_type', 'snack'),
      coalesce(meal ->> 'source', 'manual'),
      meal ->> 'photo_path',
      meal ->> 'note'
    )
    returning id into v_meal_id;
  else
    update public.meals m set
      eaten_at = coalesce((meal ->> 'eaten_at')::timestamptz, m.eaten_at),
      meal_type = coalesce(meal ->> 'meal_type', m.meal_type),
      source = coalesce(meal ->> 'source', m.source),
      photo_path = case when meal ? 'photo_path' then meal ->> 'photo_path' else m.photo_path end,
      note = case when meal ? 'note' then meal ->> 'note' else m.note end
    where m.id = v_meal_id;
    if not found then
      raise exception 'meal % not found', v_meal_id using errcode = 'P0002';
    end if;
    delete from public.meal_items mi where mi.meal_id = v_meal_id;
  end if;

  insert into public.meal_items (
    meal_id, food_id, name, grams, confidence,
    kcal_100g, protein_100g, carbs_100g, fat_100g,
    kcal, protein, carbs, fat, position
  )
  select
    v_meal_id,
    (select f.id from public.foods f where f.id = i ->> 'food_id'),
    i ->> 'name',
    (i ->> 'grams')::numeric,
    (i ->> 'confidence')::numeric,
    (i -> 'per_100g' ->> 'kcal')::numeric,
    (i -> 'per_100g' ->> 'protein')::numeric,
    (i -> 'per_100g' ->> 'carbs')::numeric,
    (i -> 'per_100g' ->> 'fat')::numeric,
    (i -> 'macros' ->> 'kcal')::numeric,
    (i -> 'macros' ->> 'protein')::numeric,
    (i -> 'macros' ->> 'carbs')::numeric,
    (i -> 'macros' ->> 'fat')::numeric,
    (t.ord - 1)::smallint
  from jsonb_array_elements(items) with ordinality as t(i, ord);

  return v_meal_id;
end;
$$;

revoke execute on function public.save_meal(jsonb, jsonb) from public, anon;
grant execute on function public.save_meal(jsonb, jsonb) to authenticated, service_role;

-- ─── daily scan cap ──────────────────────────────────────────────────────────
-- Keeps the team inside the Gemini free tier. The AI service calls
-- consume_scan() with the user's token before every Gemini call and refuses
-- the request when "allowed" is false. Days are in the user's timezone.
-- Users can read their counter but never write it.

create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.scan_usage enable row level security;
create policy "scan_usage: read own" on public.scan_usage
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.scan_usage from anon, authenticated;
grant select on public.scan_usage to authenticated;
grant all on public.scan_usage to service_role;

-- Change the cap with a new migration that replaces this function.
create function public.daily_scan_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30 $$;

-- The caller's "today" in their profile timezone (Europe/Bucharest if unset or invalid).
create function public.user_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select tz.name
       from public.profiles p
       join pg_catalog.pg_timezone_names tz on tz.name = p.timezone
      where p.id = (select auth.uid())),
    'Europe/Bucharest'))::date
$$;

-- { "allowed": bool, "used": int, "limit": int }. Counts one scan when allowed.
create function public.consume_scan()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := public.daily_scan_limit();
  v_used integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.scan_usage as u (user_id, day, count)
  values (v_uid, public.user_today(), 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < v_limit
  returning u.count into v_used;

  if v_used is null then
    return jsonb_build_object('allowed', false, 'used', v_limit, 'limit', v_limit);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
end;
$$;

-- Same shape, without counting a scan. For the app's "12 scans left today".
create function public.scan_quota()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', coalesce(u.count, 0) < public.daily_scan_limit(),
    'used', coalesce(u.count, 0),
    'limit', public.daily_scan_limit())
  from (select 1) one
  left join public.scan_usage u
    on u.user_id = (select auth.uid()) and u.day = public.user_today()
$$;

revoke execute on function public.daily_scan_limit() from public, anon;
revoke execute on function public.user_today() from public, anon;
revoke execute on function public.consume_scan() from public, anon;
revoke execute on function public.scan_quota() from public, anon;
grant execute on function public.daily_scan_limit(), public.user_today(),
  public.consume_scan(), public.scan_quota() to authenticated, service_role;

-- ─── only reference foods you can see ───────────────────────────────────────
-- Foreign keys ignore RLS, so a user who knew another user's label:<uuid> could
-- put it in their recipe or library. Besides leaking that the food exists, a
-- recipe_items reference would block the owner's account deletion.

drop policy "recipe_items: insert own" on public.recipe_items;
drop policy "recipe_items: update own" on public.recipe_items;
create policy "recipe_items: insert own" on public.recipe_items
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.foods f where f.id = food_id));
create policy "recipe_items: update own" on public.recipe_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.foods f where f.id = food_id));

drop policy "products: insert own" on public.products;
drop policy "products: update own" on public.products;
create policy "products: insert own" on public.products
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.foods f where f.id = food_id));
create policy "products: update own" on public.products
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.foods f where f.id = food_id));

drop policy "meal_items: insert own" on public.meal_items;
drop policy "meal_items: update own" on public.meal_items;
create policy "meal_items: insert own" on public.meal_items
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and (food_id is null
                   or exists (select 1 from public.foods f where f.id = food_id)));
create policy "meal_items: update own" on public.meal_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (food_id is null
                   or exists (select 1 from public.foods f where f.id = food_id)));
