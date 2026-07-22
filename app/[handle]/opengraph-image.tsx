import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { COLORS, HEADING_TYPE, typeMeta } from "@/lib/beacon/constants";
import { profileQrTheme } from "@/lib/beacon/brand-qr";
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
  let avatarUrl = "";
  let colorTheme: unknown = "sky";
  let followerCount = 0;
  let linkCount = 0;

  if (handle) {
    try {
      const db = await createClient();
      const page = await getPublicPage(db, handle);
      if (page) {
        theme = page.profile.theme ?? 0;
        avatarUrl = page.profile.av_url ?? "";
        colorTheme = page.profile.color_theme;
        followerCount = page.follower_count;
        linkCount = page.channels.filter(
          (c) => c.type !== HEADING_TYPE && c.status === "live",
        ).length;
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
  const shareTheme = profileQrTheme(colorTheme);

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
          backgroundColor: shareTheme.accent,
          backgroundImage: `linear-gradient(135deg, ${shareTheme.accent}, ${shareTheme.accent2})`,
        }}
      >
        <div
          style={{
            display: "flex",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#ffffff",
          borderRadius: 40,
          width: 1020,
          minHeight: 390,
          padding: "58px 68px",
          boxShadow: "0 20px 60px rgba(23,72,58,.18)",
        }}
      >
        <div
          style={{
            width: 210,
            height: 210,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
            borderRadius: 999,
            border: "10px solid #fff",
            backgroundColor: g0,
            backgroundImage: `linear-gradient(135deg, ${g0}, ${g1})`,
            boxShadow: "0 12px 34px rgba(20,35,45,.18)",
            color: "#fff",
            fontSize: 92,
            fontWeight: 850,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" width="210" height="210" style={{ objectFit: "cover" }} />
          ) : (
            (handle?.[0] ?? "v").toUpperCase()
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 62, flex: 1 }}>
          <div style={{ fontSize: 62, fontWeight: 850, color: shareTheme.text }}>
            {`@${handle ?? "via_mi"}`}
          </div>
          {platforms.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize: 27,
                fontWeight: 700,
                color: shareTheme.module,
                marginTop: 18,
              }}
            >
              {platforms.join("  /  ")}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 28,
              fontSize: 25,
              color: "#52636c",
              marginTop: 30,
            }}
          >
            <span style={{ fontWeight: 750 }}>{`${linkCount} links`}</span>
            <span style={{ fontWeight: 750 }}>{`${followerCount} followers`}</span>
          </div>
          <div style={{ fontSize: 23, color: "#75858d", marginTop: 20 }}>
            {`${siteHost}/@${handle ?? ""}`}
          </div>
        </div>
      </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 44,
            fontSize: 40,
            fontWeight: 800,
            color: shareTheme.module,
          }}
        >
          <span>via-mi</span>
          <span style={{ color: shareTheme.text }}>.</span>
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
