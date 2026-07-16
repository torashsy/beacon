import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import webpush from "npm:web-push@3.6.7";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method" }, 405);
  const origin = request.headers.get("origin") ?? "";
  if (corsHeaders(request)["Access-Control-Allow-Origin"] !== origin) {
    return json(request, { error: "origin" }, 403);
  }

  let body: { handle?: string; secret?: string };
  try { body = await request.json(); }
  catch { return json(request, { error: "invalid body" }, 400); }
  const handle = (body.handle ?? "").trim().toLowerCase();
  const secret = body.secret ?? "";
  if (!/^[a-z0-9_]{3,20}$/.test(handle) || !secret) {
    return json(request, { error: "invalid input" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!url || !serviceKey || !publicKey || !privateKey) {
    return json(request, { error: "configuration" }, 500);
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: valid, error: authError } = await admin.rpc("verify_app_session", {
    p_handle: handle,
    p_token: secret,
  });
  if (authError || valid !== true) return json(request, { error: "auth" }, 401);

  const { data: claimed, error: claimError } = await admin.rpc("claim_push_delivery", {
    p_target: handle,
  });
  if (claimError) return json(request, { error: "delivery state" }, 500);
  if (claimed !== true) {
    return json(request, { sent: 0, deduplicated: true });
  }

  const { data: subscriptions, error: subscriptionError } = await admin.rpc("get_push_targets", {
    p_target: handle,
  });
  if (subscriptionError) return json(request, { error: "subscriptions" }, 500);
  if (!subscriptions?.length) return json(request, { sent: 0 });

  const { data: profile } = await admin.from("profiles").select("name").eq("handle", handle).maybeSingle();
  const displayName = profile?.name?.trim() || `@${handle}`;
  const payload = JSON.stringify({
    handle,
    body: `${displayName}さんがページを更新しました`,
  });
  webpush.setVapidDetails("https://via-mi.com/contact", publicKey, privateKey);

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) stale.push(subscription.endpoint);
    }
  }));
  if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
  return json(request, { sent });
});
