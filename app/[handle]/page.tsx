import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPublicCal,
  getPublicChannels,
  getPublicProfile,
} from "@/lib/beacon/rpc";

/**
 * generateMetadata と PublicPage は同一リクエスト内で二度 profile を読む。
 * React cache でリクエスト単位にメモ化し、Supabase への往復を1回にまとめる。
 */
const loadProfile = cache(async (handle: string) => {
  const db = await createClient();
  return getPublicProfile(db, handle);
});
import { toSnapshot } from "@/lib/beacon/follows";
import {
  CreateYoursFooter,
  PublicProfileCard,
} from "@/components/beacon/PublicProfileCard";
import { FollowButton } from "@/components/beacon/FollowButton";

/**
 * 公開ページ /@{handle}。誰でも閲覧可能（profiles / channels / cal_public は
 * RLS で公開読み取り）。beacon.html の renderPublicFor を移植。
 * URL 規約は「先頭に @ を付ける」。@ なしのパスはここでは扱わない。
 */

type Params = { handle: string };

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

  const profile = await loadProfile(handle);
  if (!profile) return { title: "Beacon" };

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

  const profile = await loadProfile(handle);
  if (!profile) notFound();

  const db = await createClient();
  const [channels, cal] = await Promise.all([
    getPublicChannels(db, handle),
    getPublicCal(db, handle),
  ]);

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
