# delete-account

Permanently deletes the signed-in user and **all** their data: photos in private buckets, then the auth user, from which every user table cascades (`profiles`, own `foods`, `products`, `recipes`, `recipe_items`, `meals`, `meal_items`, `scans`, `scan_usage`). Shared catalogue rows are kept. There is no undo. Owner: Kevin.

## Calling it from the app

Ask the user to confirm first, then:

```ts
const { data, error } = await supabase.functions.invoke("delete-account", {
  body: { confirm: "DELETE" },
});
if (!error) await supabase.auth.signOut(); // the session is now invalid
```

`200`: `{ "deleted": true, "files_removed": 3 }`

Errors are `{ "error": "<code>", "message": "<for humans>" }`:

| Status | `error` | Meaning |
|---|---|---|
| 400 | `confirmation_required` | Body wasn't `{ "confirm": "DELETE" }` |
| 401 | `unauthorized` | No signed-in user |
| 500 | `storage_error` | Photos couldn't be removed; nothing was deleted, safe to retry |
| 500 | `delete_failed` | Photos were removed but the user wasn't; safe to retry |

## Notes

- Photos are deleted first because storage objects don't cascade from `auth.users`. A retry after either error finishes the job.
- New private buckets keyed by user id must be added to `USER_BUCKETS` in `index.ts`.
- Deploy: `supabase functions deploy delete-account --use-api` (dev first). No secrets beyond the ones the runtime provides.
