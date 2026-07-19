import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "avatars";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const configured = (Deno.env.get("BEACON_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...configured,
  ]);
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

async function removeAccountImages(
  admin: ReturnType<typeof createClient>,
  handle: string,
): Promise<number> {
  let removed = 0;

  // Uploads are stored directly below avatars/{handle}/. Always list offset 0:
  // after each removal the next batch moves to the beginning.
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await admin.storage.from(BUCKET).list(handle, {
      limit: PAGE_SIZE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    const paths = (data ?? [])
      .filter((item) => item.id && item.name)
      .map((item) => `${handle}/${item.name}`);
    if (paths.length === 0) return removed;

    const { error: removeError } = await admin.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) throw removeError;
    removed += paths.length;
  }

  throw new Error("too many stored images");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "method" }, 405);

  const origin = request.headers.get("origin") ?? "";
  if (corsHeaders(request)["Access-Control-Allow-Origin"] !== origin) {
    return json(request, { error: "origin" }, 403);
  }

  let body: { handle?: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid body" }, 400);
  }

  const handle = (body.handle ?? "").toLowerCase();
  const secret = body.secret ?? "";
  if (!/^[a-z0-9_]{3,20}$/.test(handle) || !secret) {
    return json(request, { error: "invalid input" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json(request, { error: "configuration" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: authError } = await admin.rpc(
    "verify_app_session",
    { p_handle: handle, p_token: secret },
  );
  if (authError || allowed !== true) {
    return json(request, { error: "auth" }, 401);
  }

  let filesRemoved = 0;
  try {
    // Keep the account recoverable when Storage deletion fails. The database
    // account is removed only after every owned image has been deleted.
    filesRemoved = await removeAccountImages(admin, handle);
  } catch (error) {
    console.error("account image deletion failed", { handle, error });
    return json(request, { error: "image deletion failed" }, 502);
  }

  const { error: deleteError } = await admin.rpc("delete_account", {
    p_handle: handle,
    p_pass: secret,
  });
  if (deleteError) {
    console.error("account deletion failed", { handle, error: deleteError });
    return json(request, { error: "account deletion failed" }, 500);
  }

  return json(request, { deleted: true, filesRemoved });
});
