import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "my-IDeal", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
