// Full account + data deletion through Kevin's delete-account Edge Function (#9).
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirm: 'DELETE' },
  });
  if (error) {
    let message = 'Could not delete the account. Nothing was lost; try again.';
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { message?: string };
        if (body.message) message = `${body.message} You can safely try again.`;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  await supabase.auth.signOut(); // the session is invalid now; the auth gate shows sign-in
}
