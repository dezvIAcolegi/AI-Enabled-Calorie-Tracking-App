-- Withdrawing scan consent in one call, and a daily cap on Open Food Facts
-- lookups per user. Explained for the team in contracts/db/README.md.

-- ─── withdraw_scan_consent ───────────────────────────────────────────────────
-- Turns consent off and deletes every stored scan (raw AI output + corrections)
-- of the caller, atomically. Returns how many scans were deleted. Meals and
-- photos are kept; only the AI training data goes.

create function public.withdraw_scan_consent()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.profiles
    set scan_consent = false, scan_consent_at = null
    where id = (select auth.uid());
  delete from public.scans where user_id = (select auth.uid());
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.withdraw_scan_consent() from public, anon;
grant execute on function public.withdraw_scan_consent() to authenticated, service_role;

-- ─── barcode lookups: daily cap on Open Food Facts calls ────────────────────
-- Only cache misses count (a barcode already in foods is free). Keeps one user
-- from hammering OFF through our function. Counted by the barcode-lookup Edge
-- Function with the service role; users can read their own counter.

create table public.barcode_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.barcode_usage enable row level security;
create policy "barcode_usage: read own" on public.barcode_usage
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.barcode_usage from anon, authenticated;
grant select on public.barcode_usage to authenticated;
grant all on public.barcode_usage to service_role;

-- Change the cap with a new migration that replaces this function.
create function public.daily_barcode_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100 $$;

-- Counts one OFF lookup for p_user (UTC day). true while under the cap.
create function public.consume_barcode_lookup(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  insert into public.barcode_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < public.daily_barcode_limit()
  returning u.count into v_used;
  return v_used is not null;
end;
$$;

revoke execute on function public.daily_barcode_limit() from public, anon;
revoke execute on function public.consume_barcode_lookup(uuid) from public, anon, authenticated;
grant execute on function public.daily_barcode_limit() to authenticated, service_role;
grant execute on function public.consume_barcode_lookup(uuid) to service_role;
