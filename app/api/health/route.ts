import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "via-mi", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
