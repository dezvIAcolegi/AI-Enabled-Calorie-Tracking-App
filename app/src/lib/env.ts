// EXPO_PUBLIC_* vars are inlined at build time, so they must be read with literal names.
export const env = {
  aiUrl: (process.env.EXPO_PUBLIC_AI_URL ?? '').replace(/\/+$/, ''),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

/** No AI URL configured: api/ answers from contracts/fixtures instead of the network. */
export const useAiMocks = env.aiUrl === '';
export const hasSupabase = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';
