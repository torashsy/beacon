import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicPage } from "@/lib/beacon/rpc";
import { toSnapshot } from "@/lib/beacon/follows";
import {
  CreateYoursFooter,
  PublicProfileCard,
} from "@/components/beacon/PublicProfileCard";
import { FollowButton } from "@/components/beacon/FollowButton";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const handle = normalizeHandleParam((await params).handle);
  if (!handle) return { title: "Beacon" };

  const page = await loadPage(handle);
  if (!page) return { title: "Beacon" };
  const { profile } = page;

  const title = `${profile.name || handle} · Beacon`;
  const description = profile.bio || "Beacon のプロフィール";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: profile.bn_url ? [{ url: profile.bn_url }] : undefined,
      type: "profile",
    },
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
    <main className="wrap" style={{ paddingTop: 8, paddingBottom: 40 }}>
      <div className="top">
        <div className="logo">
          Beacon<span className="dot">.</span>
        </div>
      </div>
      <PublicProfileCard
        data={{
          handle,
          profile,
          channels,
          pubcal: cal,
        }}
        actions={<FollowButton snapshot={snapshot} />}
      />
      <CreateYoursFooter href="/" />
    </main>
  );
}
