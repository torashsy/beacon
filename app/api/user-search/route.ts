import { NextRequest, NextResponse } from "next/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const HANDLE = /^[a-z0-9_]{3,20}$/;

export async function GET(request: NextRequest) {
  const handle = (request.nextUrl.searchParams.get("handle") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!HANDLE.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
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

  const page = await getPublicPage(await createClient(), handle);
  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
