-- Sign-up limited to invited emails (team, demo and test accounts).
-- The free Gemini tier can't serve users in the EEA outside the team, so nobody
-- else may create an account. Existing users are unaffected.
-- Explained for the team in contracts/db/README.md.

-- Only the service role reads or writes this table (supabase/scripts/allow-signup.ts).
-- Team emails live in the database, never in the repo.
create table public.signup_allowlist (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

alter table public.signup_allowlist enable row level security;
revoke all on public.signup_allowlist from anon, authenticated;
grant all on public.signup_allowlist to service_role;

-- Runs for every new auth user, whether from the app's sign-up or the admin
-- API, so tests and seeds add their address to the list first.
create function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.signup_allowlist a where a.email = lower(new.email)
  ) then
    raise exception 'sign-up is limited to invited accounts'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_signup_allowlist() from public, anon, authenticated;

create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();
