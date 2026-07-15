import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { COLORS, HEADING_TYPE, typeMeta } from "@/lib/beacon/constants";
import { getSiteUrl } from "@/lib/site";

/**
 * 公開ページの OGP 画像を動的生成（SNSシェア時に映えるブランドカード）。
 * next/og はカスタムフォント未指定だと日本語が豆腐になるため、画像側は
 * @handle・プラットフォーム名（英字）・URL・ブランドの英字中心にして安定表示。
 * 日本語の名前/自己紹介は metadata の title/description 側で伝わる。
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "via-mi profile";

const siteHost = (() => {
  try {
    return new URL(getSiteUrl()).host;
  } catch {
    return "localhost:3000";
  }
})();

function normalizeHandle(raw: string): string | null {
  const d = decodeURIComponent(raw);
  if (!d.startsWith("@")) return null;
  const h = d.slice(1).toLowerCase();
  return /^[a-z0-9_]{1,30}$/.test(h) ? h : null;
}

// 英字ラベルに寄せる（豆腐回避）。日本語ラベルは英語へ。
const LATIN: Record<string, string> = { support: "Support", other: "Link" };
function latinLabel(type: string): string {
  return LATIN[type] ?? typeMeta(type).lb;
}

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const handle = normalizeHandle((await params).handle);
  const [c0, c1] = COLORS[0];
  let theme = 0;
  let platforms: string[] = [];

  if (handle) {
    try {
      const db = await createClient();
      const page = await getPublicPage(db, handle);
      if (page) {
        theme = page.profile.theme ?? 0;
        platforms = page.channels
          .filter((c) => c.type !== HEADING_TYPE && c.status === "live")
          .map((c) => latinLabel(c.type))
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 5);
      }
    } catch {
      /* フォールバック（デフォルト表示） */
    }
  }
  const [g0, g1] = COLORS[theme] ?? [c0, c1];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: g0,
          backgroundImage: `linear-gradient(135deg, ${g0}, ${g1})`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderRadius: 40,
            padding: "56px 80px",
            boxShadow: "0 20px 60px rgba(23,72,58,.18)",
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 800, color: "#17242B" }}>
            {`@${handle ?? "via_mi"}`}
          </div>
          {platforms.length > 0 && (
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: "#0284C7",
                marginTop: 20,
              }}
            >
              {platforms.join("  ·  ")}
            </div>
          )}
          <div
            style={{
              fontSize: 26,
              color: "#6E8580",
              marginTop: 28,
              backgroundColor: "#F4FAF8",
              padding: "12px 28px",
              borderRadius: 999,
            }}
          >
            {`${siteHost}/@${handle ?? ""}`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 44,
            fontSize: 40,
            fontWeight: 800,
            color: "#0284C7",
          }}
        >
          <span>via-mi</span>
          <span style={{ color: "#7DD3FC" }}>.</span>
          <span
            style={{ fontSize: 26, fontWeight: 600, color: "#17242B", marginLeft: 18 }}
          >
            All your socials, one page.
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
