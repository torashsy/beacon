import { createClient } from "npm:@supabase/supabase-js@2";

const SYNTHETIC_DOMAIN = "passkey.via-mi.invalid";

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
    headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method" }, 405);

  const origin = request.headers.get("origin") ?? "";
  if (corsHeaders(request)["Access-Control-Allow-Origin"] !== origin) {
    return json(request, { error: "origin" }, 403);
  }

  let body: { handle?: string; legacySecret?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid body" }, 400);
  }
  const handle = (body.handle ?? "").trim().toLowerCase();
  const legacySecret = body.legacySecret ?? null;
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return json(request, { error: "invalid handle" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(request, { error: "configuration" }, 500);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const { error: allowedError } = await admin.rpc("authorize_passkey_signup", {
    p_handle: handle,
    p_ip: ip,
    p_legacy_secret: legacySecret,
  });
  if (allowedError) {
    const message = allowedError.message;
    const status = message.includes("too many") ? 429 : message.includes("taken") ? 409 : 401;
    return json(request, { error: message.includes("taken") ? "taken" : "not allowed" }, status);
  }

  const email = `vm_${crypto.randomUUID().replaceAll("-", "")}@${SYNTHETIC_DOMAIN}`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: randomSecret(),
    options: {
      data: { requested_handle: handle, via_mi_synthetic: true },
      redirectTo: "https://via-mi.com",
    },
  });
  if (error || !data?.properties?.hashed_token) {
    return json(request, { error: "bootstrap failed" }, 500);
  }
  return json(request, { tokenHash: data.properties.hashed_token });
});

