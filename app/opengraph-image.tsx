import { ImageResponse } from "next/og";
import { COLORS } from "@/lib/beacon/constants";
import { getSiteUrl } from "@/lib/site";

/**
 * トップページ（サービス自体）の OGP 画像を動的生成。SNS/LINE でトップURLを
 * 共有したときのサムネイル。next/og はカスタムフォント未指定だと日本語が豆腐に
 * なるため、公開ページ用（[handle]/opengraph-image.tsx）と同様に英字中心にする。
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "via-mi — All your socials, one page.";

const siteHost = (() => {
  try {
    return new URL(getSiteUrl()).host;
  } catch {
    return "via-mi.com";
  }
})();

export default function Image() {
  const [g0, g1] = COLORS[0];

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
            borderRadius: 44,
            padding: "72px 96px",
            boxShadow: "0 20px 60px rgba(23,72,58,.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", fontSize: 108, fontWeight: 800 }}>
            <span style={{ color: "#0284C7" }}>via-mi</span>
            <span style={{ color: "#7DD3FC" }}>.</span>
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: "#17242B",
              marginTop: 24,
            }}
          >
            All your socials, one page.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#6E8580",
              marginTop: 36,
              backgroundColor: "#F4FAF8",
              padding: "14px 34px",
              borderRadius: 999,
            }}
          >
            {siteHost}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
