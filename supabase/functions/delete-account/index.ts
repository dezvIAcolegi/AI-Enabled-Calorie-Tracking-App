// delete-account: permanently deletes the signed-in user and all their data.
//
//   POST /functions/v1/delete-account   { "confirm": "DELETE" }
//
// 1. Removes the user's files from every private bucket (`<user id>/...`).
//    Storage objects don't cascade from auth.users, so this runs first.
// 2. Deletes the auth user. Every user table (profiles, foods they own,
//    products, recipes, meals, meal_items, scans, scan_usage) cascades from it.
// Response and errors: README.md next to this file.

import { corsHeaders, error, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Buckets keyed by user id. Add new private buckets here.
const USER_BUCKETS = ["meal-photos"];
const PAGE = 1000;

/** Every object path under `prefix`, walking sub-folders. */
async function listAll(
  db: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0;; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
    });
    if (error) throw error;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders come back with a null id.
      if (entry.id === null) paths.push(...await listAll(db, bucket, path));
      else paths.push(path);
    }
    if (data.length < PAGE) return paths;
  }
}

async function removeUserFiles(db: SupabaseClient, userId: string) {
  let removed = 0;
  for (const bucket of USER_BUCKETS) {
    let paths: string[];
    try {
      paths = await listAll(db, bucket, userId);
    } catch (e) {
      // A bucket that doesn't exist yet holds nothing to delete.
      if (String((e as Error).message).includes("not found")) continue;
      throw e;
    }
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await db.storage.from(bucket).remove(
        paths.slice(i, i + PAGE),
      );
      if (error) throw error;
    }
    removed += paths.length;
  }
  return removed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return error(405, "method_not_allowed", "Use POST.");
  }

  const user = await requireUser(req);
  if (!user) return error(401, "unauthorized", "Sign in first.");

  const body = await req.json().catch(() => null);
  if (body?.confirm !== "DELETE") {
    return error(
      400,
      "confirmation_required",
      'Send { "confirm": "DELETE" } to delete the account and all its data.',
    );
  }

  const db = adminClient();
  let files: number;
  try {
    files = await removeUserFiles(db, user.id);
  } catch (e) {
    console.error("removing files failed", e);
    return error(
      500,
      "storage_error",
      "Could not delete your photos. Nothing else was deleted; try again.",
    );
  }

  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("deleteUser failed", deleteError);
    return error(
      500,
      "delete_failed",
      "Your photos were deleted but the account was not. Try again.",
    );
  }

  return json({ deleted: true, files_removed: files });
});
