// Supabase Auth errors in plain words.
export function authMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'Wrong email or password.';
  // Sign-up allowlist (backend #31): the auth.users trigger refuses unknown emails.
  if (/database error saving new user/i.test(raw))
    return 'This app is invite-only for now. Ask the team to add your email, or use the demo account.';
  if (/email not confirmed/i.test(raw))
    return 'Confirm your email first: check your inbox for the link.';
  if (/already registered|already exists/i.test(raw))
    return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(raw)) return 'Use a password of at least 6 characters.';
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Wait a minute and try again.';
  if (/network|fetch/i.test(raw)) return 'Could not reach the server. Check your connection.';
  return raw;
}
