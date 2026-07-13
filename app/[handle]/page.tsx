import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
 * React cache でリクエスト単位にメモ化し RPC 往復を1回にまとめる。
 */

type Params = { handle: string };

const loadPage = cache(async (handle: string) => {
  const db = await createClient();
  return getPublicPage(db, handle);
});

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
  if (!handle) return { title: "my-IDeal", robots: NOINDEX };

  const page = await loadPage(handle);
  if (!page) return { title: "my-IDeal", robots: NOINDEX };
  const { profile } = page;

  const title = `${profile.name || handle} · my-IDeal`;
  const description = profile.bio || "my-IDeal のプロフィール";
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
        <Link className="logo" href="/" aria-label="ホームへ戻る">
          my-IDeal<span className="dot">.</span>
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
        actions={<FollowButton snapshot={snapshot} />}
        trackHandle={handle}
      />
      <LegalFooter />
    </main>
    <PublicBottomNav />
    </>
  );
}
