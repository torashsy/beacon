import type { MetadataRoute } from "next";

/**
 * トップ（ランディング）はクロール許可、公開プロフィール(/@handle)は
 * per-page の noindex メタタグ（app/[handle]/page.tsx）で除外する。
 * ここで /@ 以下を disallow しないのは、disallow するとクローラーが
 * noindex タグ自体を読めず、外部リンク経由で発見された URL が
 * 「情報なし」のままインデックスに残ってしまうことがあるため
 * （確実に除外するには「クロールは許可し、noindexで明示する」方が安全）。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
  };
}
