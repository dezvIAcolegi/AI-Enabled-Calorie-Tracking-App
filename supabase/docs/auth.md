# Auth on the shared project

For Mihai (app) and anyone adding accounts. Owner: Kevin. Read from the shared project with `supabase config diff` on 22 Nov 2026.

## How people get an account

Sign-up is **invite-only** (`signup_allowlist`, see `contracts/db/README.md`). The shared project has email confirmation on, and Supabase's built-in mailer only delivers to members of the Supabase organisation, a few emails an hour. So, instead of self sign-up, Kevin creates accounts already confirmed:

```sh
deno run --allow-net --allow-env --env-file=supabase/.env.shared \
  supabase/scripts/allow-signup.ts invite someone@example.com "note"
```

It prints a temporary password to hand over privately. The person signs in and can change it in the app (`supabase.auth.updateUser({ password })`).

Test accounts on shared: `admin@caltracker.test`, `demo@caltracker.test` (reset with `supabase/seed/demo-user.ts`). Passwords are with Kevin.

## Settings on shared

| Setting | Value | Note |
|---|---|---|
| Email + password sign-in | on | What the app uses; works in Expo Go |
| Email confirmation | on | Accounts made with `invite` are pre-confirmed |
| Email OTP length | 8 digits | Only if the app adds code sign-in; local `config.toml` says 6 |
| Min. password length | 6 | |
| `site_url` | `http://localhost:3000` | Only used in email links; the app doesn't use links |
| MFA (TOTP) | enabled, unused | |
| Access token lifetime | 1 h, refreshed by supabase-js | Signed **ES256**, verified by the AI service via JWKS |
| Allowed sign-ups | allowlist only | A refused sign-up returns "Database error saving new user" |

`supabase config push` is **not** used for shared: it would overwrite every difference above with `config.toml`'s local-development values. Change hosted auth settings in the dashboard (Authentication → Sign In / Providers) and update this table.

## In the app (Expo)

```ts
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signOut();
const { data: { session } } = await supabase.auth.getSession(); // session.access_token → AI service
await supabase.auth.updateUser({ password: newPassword });
```

Sessions persist in AsyncStorage with auto-refresh while the app is in the foreground (`app/src/lib/supabase.ts`). No magic links or deep links are needed.
