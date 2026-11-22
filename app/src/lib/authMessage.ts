// Supabase Auth errors in plain words.
export function authMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(raw))
    return 'Confirm your email first: check your inbox for the link.';
  if (/already registered|already exists/i.test(raw))
    return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(raw)) return 'Use a password of at least 6 characters.';
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Wait a minute and try again.';
  if (/network|fetch/i.test(raw)) return 'Could not reach the server. Check your connection.';
  return raw;
}
