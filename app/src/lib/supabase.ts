import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@contracts/database';
import { AppState } from 'react-native';

import { env, hasSupabase } from './env';

// Placeholder URL keeps createClient from throwing when .env is empty; calls then fail
// with a network error that the UI shows, instead of crashing at import time.
// Typed with the generated schema (contracts/ts/database.ts, #38): table and RPC calls are
// checked against the real database.
export const supabase = createClient<Database>(
  hasSupabase ? env.supabaseUrl : 'http://localhost:54321',
  hasSupabase ? env.supabaseAnonKey : 'missing-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase's RN recommendation).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** The current user's access token, sent to the AI service on every request. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
