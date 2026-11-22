// Supabase clients for Edge Functions. The hosted runtime sets SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY automatically.

import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2";

const url = () => Deno.env.get("SUPABASE_URL")!;

/**
 * The signed-in user behind the request, or null. The gateway already checks
 * the JWT signature, but the anon key is a valid JWT too, so this confirms a
 * real user sent it.
 */
export async function requireUser(req: Request): Promise<User | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const client = createClient(url(), Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

/** Service-role client: bypasses RLS. Only for writing shared rows. */
export function adminClient(): SupabaseClient {
  return createClient(url(), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}
