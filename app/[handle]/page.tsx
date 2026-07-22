import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { toSnapshot } from "@/lib/beacon/follows";
import {
  PublicProfileCard,
} from "@/components/beacon/PublicProfileCard";
import { FollowButton } from "@/components/beacon/FollowButton";
import { LegalFooter } from "@/components/beacon/LegalFooter";
import { PublicBackButton } from "@/components/beacon/PublicBackButton";
import { PublicBottomNav } from "@/components/beacon/PublicBottomNav";

/**
 * 公開ページ /@{handle}。誰でも閲覧可能だが、列挙防止のため必ずハンドル指定の
 * get_public_page RPC 経由で1件だけ読む（テーブルへの直接 select は不可）。
 * URL 規約は「先頭に @ を付ける」。@ なしのパスはここでは扱わない。
 *
 * generateMetadata と PublicPage は同一リクエストで2回呼ばれるため、
 * React cache でリクエスト単位にメモ化し RPC 往復を1回にまとめる。さらに
 * unstable_cache でリクエストをまたいで短時間キャッシュし、閲覧のたびに
 * DB を引かないようにする（公開情報なので数十秒のずれは許容）。
 * cookie 非依存の createPublicClient を使うことで unstable_cache 内から呼べる。
 */

type Params = { handle: string };

/** 公開ページのキャッシュ保持秒数（この間はDBを引かずにキャッシュを返す）。 */
const PUBLIC_PAGE_TTL = 60;

const loadPage = cache((handle: string) =>
  unstable_cache(
    () => getPublicPage(createPublicClient(), handle),
    ["public-page", handle],
    { revalidate: PUBLIC_PAGE_TTL, tags: [`public-page:${handle}`] },
  )(),
);

/** URL セグメント（例 "@torashsy"）から先頭 @ を外す。@ なしは null。 */
function normalizeHandleParam(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("@")) return null;
  const h = decoded.slice(1).toLowerCase();
  return /^[a-z0-9_]{1,30}$/.test(h) ? h : null;
}

// 公開ページは「検索されない・URLを知る人だけが見られる」が核の約束のため、
// 検索エンジンには索引付けさせない（noindex）。robots.txt では disallow せず
// クロール自体は許可することで、クローラーがこの noindex を確実に読める
// ようにする（app/robots.ts のコメント参照）。
const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const handle = normalizeHandleParam((await params).handle);
  if (!handle) return { title: "via-mi", robots: NOINDEX };

  const page = await loadPage(handle);
  if (!page) return { title: "via-mi", robots: NOINDEX };
  const { profile } = page;

  const title = profile.name
    ? `${profile.name}（@${handle}） | via-mi`
    : `@${handle} | via-mi`;
  const description = profile.bio.replace(/\s+/g, " ").trim().slice(0, 160)
    || `@${handle}のリンクや予定をまとめたvia-miプロフィール`;
  return {
    title,
    description,
    robots: NOINDEX,
    alternates: { canonical: `/@${handle}` },
    // OGP画像は opengraph-image.tsx が動的生成（ブランドカード）
    openGraph: { title, description, type: "profile", url: `/@${handle}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const handle = normalizeHandleParam((await params).handle);
  if (!handle) notFound();

  const page = await loadPage(handle);
  if (!page) notFound();
  const { profile, channels, cal } = page;

  const snapshot = toSnapshot(profile, channels, cal);

  return (
    <>
    <main className="wrap" style={{ paddingTop: 8, paddingBottom: 40 }}>
      <div className="top">
        <Link className="logo" href="/" aria-label="via-mi ホーム">
          via-mi
        </Link>
        <PublicBackButton />
      </div>
      <PublicProfileCard
        data={{
          handle,
          followerCount: page.follower_count,
          profile,
          channels,
          pubcal: cal,
        }}
        trackHandle={handle}
        actions={<FollowButton snapshot={snapshot} />}
      />
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <Link
          href={`/contact?category=report&page=${encodeURIComponent(`https://via-mi.com/@${handle}`)}`}
          className="reportLink"
        >
          このページを通報
        </Link>
      </div>
      <LegalFooter />
    </main>
    <PublicBottomNav />
    </>
  );
}
