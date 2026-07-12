import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "avatars";
const ALLOWED_KINDS = new Set(["av", "bn", "thumb"]);

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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
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

  let body: { handle?: string; secret?: string; kind?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid body" }, 400);
  }

  const handle = (body.handle ?? "").toLowerCase();
  const secret = body.secret ?? "";
  const kind = body.kind ?? "";
  if (!/^[a-z0-9_]{3,20}$/.test(handle) || !ALLOWED_KINDS.has(kind) || !secret) {
    return json(request, { error: "invalid input" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(request, { error: "configuration" }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: authError } = await admin.rpc(
    "authorize_avatar_upload",
    { p_handle: handle, p_pass: secret },
  );
  if (authError || allowed !== true) {
    const limited = authError?.message?.includes("upload rate limit");
    return json(request, { error: limited ? "rate limit" : "auth" }, limited ? 429 : 401);
  }

  const path = `${handle}/${kind}-${crypto.randomUUID()}.jpg`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return json(request, { error: "signing failed" }, 500);

  return json(request, { path, token: data.token });
});
