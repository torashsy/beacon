import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!teamId) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const appId = `${teamId}.com.viami.app`;
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appId],
            components: [{ "/": "/*", comment: "Open via-mi links in the app" }],
          },
        ],
      },
      webcredentials: { apps: [appId] },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "Content-Type": "application/json",
      },
    },
  );
}
