import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPublicCal,
  getPublicChannels,
  getPublicProfile,
} from "@/lib/beacon/rpc";

/**
 * 公開ページ /@{handle}。誰でも閲覧可能（RLS で公開読み取り）。
 * URL 規約は「先頭に @ を付ける」。@ なしのパスはここでは扱わない。
 *
 * ★スタブ: 表示は reference/beacon.html の renderPublicFor を移植する。
 *   末尾に「あなたも無料で作る」導線（→ "/"）を必ず入れること。
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

  const db = await createClient();
  const profile = await getPublicProfile(db, handle);
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

  const db = await createClient();
  const profile = await getPublicProfile(db, handle);
  if (!profile) notFound();

  const [channels, cal] = await Promise.all([
    getPublicChannels(db, handle),
    getPublicCal(db, handle),
  ]);
  const liveChannels = channels.filter((c) => c.status === "live");

  return (
    <main className="wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22 }}>
        {profile.emoji} {profile.name || `@${handle}`}
      </h1>
      {profile.bio && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          {profile.bio}
        </p>
      )}

      {/* ★リンク一覧・カレンダーの見た目は beacon.html を移植 */}
      <ul style={{ listStyle: "none", marginTop: 16, display: "grid", gap: 8 }}>
        {liveChannels.map((c) => (
          <li key={c.id ?? c.url}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.label || c.url}
            </a>
          </li>
        ))}
      </ul>

      <p style={{ color: "var(--faint)", fontSize: 12, marginTop: 16 }}>
        公開メモ {cal.length} 件（表示は未実装スタブ）
      </p>

      <footer style={{ marginTop: 32 }}>
        <a href="/" style={{ color: "var(--emd)", fontWeight: 700 }}>
          あなたも無料で作る →
        </a>
      </footer>
    </main>
  );
}
