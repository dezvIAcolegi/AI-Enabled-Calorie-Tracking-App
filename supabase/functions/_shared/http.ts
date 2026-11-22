// Response helpers shared by the Edge Functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Error body: `{ "error": "<code>", "message": "<for humans>" }`. */
export function error(status: number, code: string, message: string) {
  return json({ error: code, message }, status);
}
