/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  images: {
    // Supabase Storage の公開URL（アバター/バナー）を next/image で使う場合に許可
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost }]
      : [],
  },
  async headers() {
    // 基本的なセキュリティヘッダ（全ルート）。
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // 公開プロフィールは「検索されない」が核の約束のため、metadata の
        // noindex に加えヘッダーでも二重に索引拒否する。
        // /[handle] は単一セグメントなので繰り返しマッチャーは不要（"@" の
        // 直後に "*" 付き繰り返しパラメータを置くと path-to-regexp が
        // prefix/suffix を解決できずビルドエラーになるため単純な named param にする）。
        source: "/@:handle",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
