import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * 運営用の管理バックエンド。ブラウザには service_role を出さない方針のため、
 * 管理操作はこの Edge Function に集約する（他の関数と同じく Verify JWT off）。
 *
 * 認証: 呼び出し側は「自分の via-mi セッショントークン（bst_...）」と handle を送る。
 *   1) verify_app_session でトークンが本物か確認し、
 *   2) その handle が ADMIN_HANDLES（このFunctionのSecret、カンマ区切り）に含まれるか確認する。
 * どちらも満たすときだけ管理操作を実行する。ADMIN_HANDLES に無い一般ユーザーは 403。
 */

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

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const REPORT_STATUSES = new Set(["new", "reviewing", "resolved", "rejected"]);
const AVATAR_BUCKET = "avatars";

async function removeAccountImages(
  admin: ReturnType<typeof createClient>,
  handle: string,
): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await admin.storage.from(AVATAR_BUCKET).list(handle, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const paths = (data ?? [])
      .filter((item) => item.id && item.name)
      .map((item) => `${handle}/${item.name}`);
    if (paths.length === 0) return removed;
    const { error: removeError } = await admin.storage.from(AVATAR_BUCKET).remove(paths);
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

  let body: {
    handle?: string;
    token?: string;
    action?: string;
    params?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid body" }, 400);
  }

  const handle = (body.handle ?? "").toLowerCase();
  const token = body.token ?? "";
  const action = body.action ?? "";
  const params = body.params ?? {};
  if (!HANDLE_RE.test(handle) || !token) {
    return json(request, { error: "invalid input" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(request, { error: "configuration" }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) セッショントークンが本物か
  const { data: sessionOk, error: authError } = await admin.rpc(
    "verify_app_session",
    { p_handle: handle, p_token: token },
  );
  if (authError || sessionOk !== true) {
    return json(request, { error: "auth" }, 401);
  }
  // 2) 管理者許可リストに含まれるか
  const admins = new Set(
    (Deno.env.get("ADMIN_HANDLES") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!admins.has(handle)) {
    return json(request, { error: "forbidden" }, 403);
  }

  try {
    if (action === "list_accounts") {
      const q = typeof params.q === "string" ? params.q.toLowerCase().replace(/[^a-z0-9_]/g, "") : "";
      const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
      let query = admin
        .from("accounts")
        .select("handle, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (q) query = query.ilike("handle", `${q}%`);
      const { data: accounts, error } = await query;
      if (error) throw error;
      const handles = (accounts ?? []).map((a) => a.handle as string);
      const modMap = new Map<string, { suspended: boolean; reason: string }>();
      if (handles.length) {
        const { data: mods } = await admin
          .from("account_moderation")
          .select("handle, suspended, reason")
          .in("handle", handles);
        for (const m of mods ?? []) {
          modMap.set(m.handle as string, {
            suspended: Boolean(m.suspended),
            reason: (m.reason as string) ?? "",
          });
        }
      }
      const rows = (accounts ?? []).map((a) => ({
        handle: a.handle,
        created_at: a.created_at,
        suspended: modMap.get(a.handle as string)?.suspended ?? false,
        reason: modMap.get(a.handle as string)?.reason ?? "",
      }));
      return json(request, { accounts: rows });
    }

    if (action === "set_suspension") {
      const target = String(params.target ?? "").toLowerCase();
      const suspended = Boolean(params.suspended);
      const reason = String(params.reason ?? "").slice(0, 500);
      if (!HANDLE_RE.test(target)) return json(request, { error: "invalid target" }, 400);
      const { error } = await admin.rpc("set_account_suspension", {
        p_handle: target,
        p_suspended: suspended,
        p_reason: reason,
      });
      if (error) throw error;
      return json(request, { ok: true });
    }

    if (action === "delete_account") {
      const target = String(params.target ?? "").toLowerCase();
      if (!HANDLE_RE.test(target)) return json(request, { error: "invalid target" }, 400);
      if (target === handle) return json(request, { error: "cannot delete self" }, 400);

      const filesRemoved = await removeAccountImages(admin, target);
      const { data: deleted, error } = await admin.rpc("admin_delete_account", {
        p_handle: target,
      });
      if (error) throw error;
      if (deleted !== true) return json(request, { error: "not found" }, 404);
      return json(request, { deleted: true, filesRemoved });
    }

    if (action === "list_reports") {
      const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
      let query = admin
        .from("contact_submissions")
        .select("id, category, message, page_url, email, status, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (typeof params.status === "string" && REPORT_STATUSES.has(params.status)) {
        query = query.eq("status", params.status);
      }
      const { data: reports, error } = await query;
      if (error) throw error;
      return json(request, { reports: reports ?? [] });
    }

    if (action === "set_report_status") {
      const id = String(params.id ?? "");
      const status = String(params.status ?? "");
      const note = String(params.note ?? "").slice(0, 500);
      if (!REPORT_STATUSES.has(status)) return json(request, { error: "invalid status" }, 400);
      const { error } = await admin.rpc("set_contact_status", {
        p_id: id,
        p_status: status,
        p_note: note,
      });
      if (error) throw error;
      return json(request, { ok: true });
    }

    return json(request, { error: "unknown action" }, 400);
  } catch (error) {
    console.error("admin action failed", { action, error });
    return json(request, { error: "action failed" }, 500);
  }
});
