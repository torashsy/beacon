import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  if (process.env.PLAYWRIGHT_TEST === "1") {
    return NextResponse.json(
      {
        ok: true,
        service: "via-mi",
        revision,
        dependencies: { database: { ok: true, status: "skipped" } },
      },
      { headers },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        service: "via-mi",
        revision,
        dependencies: { database: { ok: false } },
      },
      { status: 503, headers },
    );
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase
      .rpc("get_public_page", { p_handle: "via_mi" })
      .abortSignal(controller.signal);

    const latencyMs = Math.round(performance.now() - startedAt);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          service: "via-mi",
          revision,
          dependencies: { database: { ok: false, latency_ms: latencyMs } },
        },
        { status: 503, headers },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        service: "via-mi",
        revision,
        dependencies: { database: { ok: true, latency_ms: latencyMs } },
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "via-mi",
        revision,
        dependencies: {
          database: {
            ok: false,
            latency_ms: Math.round(performance.now() - startedAt),
          },
        },
      },
      { status: 503, headers },
    );
  } finally {
    clearTimeout(timeout);
  }
}
