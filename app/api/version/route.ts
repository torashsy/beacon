import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
