import { NextRequest, NextResponse } from "next/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { takeRateLimit } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase/server";

const HANDLE = /^[a-z0-9_]{3,20}$/;

export async function GET(request: NextRequest) {
  const tag = (request.nextUrl.searchParams.get("tag") ?? "")
    .trim()
    .replace(/^#+/, "")
    .toLocaleLowerCase("ja-JP");
  const handle = (request.nextUrl.searchParams.get("handle") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!tag && !HANDLE.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }
  if (tag && (!/^[\p{L}\p{N}_]{1,20}$/u.test(tag))) {
    return NextResponse.json({ error: "invalid_tag" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "unknown";
  const rate = takeRateLimit(`user-search:${key}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) },
      },
    );
  }

  // 公開検索はログインcookieに依存させず、常に全公開プロフィールを対象にする。
  const db = createPublicClient();
  if (tag) {
    const { data, error } = await db.rpc("search_profiles_by_tag", {
      p_tag: tag,
      p_limit: 20,
    });
    if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 });
    return NextResponse.json(data ?? [], {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-RateLimit-Remaining": String(rate.remaining),
      },
    });
  }

  const page = await getPublicPage(db, handle);
  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
