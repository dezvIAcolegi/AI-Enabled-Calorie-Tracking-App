// EXPO_PUBLIC_* vars are inlined at build time, so they must be read with literal names.
export const env = {
  aiUrl: (process.env.EXPO_PUBLIC_AI_URL ?? '').replace(/\/+$/, ''),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const hasSupabase = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';
/**
 * api/ answers from contracts/fixtures when there's no AI URL, or no Supabase to sign in
 * with: every real AI call needs the user's access token, so it would only ever fail.
 */
export const useAiMocks = env.aiUrl === '' || !hasSupabase;
