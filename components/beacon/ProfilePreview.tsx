"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";
import { LegalFooter } from "./LegalFooter";
import { getPublicPage } from "@/lib/beacon/rpc";
import { createClient } from "@/lib/supabase/client";
import { toSnapshot, type FollowSnapshot } from "@/lib/beacon/follows";

/**
 * フォロー相手/検索結果をアプリ内で開くプレビュー（公開ページ /@handle へ遷移しない）。
 * まず手元のスナップショットを即表示し、裏で最新を取得して差し替える
 * （stale-while-revalidate）。遷移が無いので固まらず、戻るとフォロー一覧に戻る。
 */
function snapToCard(snap: FollowSnapshot): PublicCardData {
  return {
    handle: snap.handle,
    profile: {
      name: snap.name,
      bio: snap.bio ?? "",
      emoji: snap.emoji,
      theme: snap.theme,
      av_theme: snap.av_theme ?? 0,
      av_url: snap.av_url,
      bn_url: snap.bn_url,
      status: snap.status ?? "",
      content: snap.content,
    },
    channels: snap.channels,
    pubcal: snap.pubcal,
  };
}

export function ProfilePreview({
  initial,
  following,
  onClose,
  onToggleFollow,
  onRefreshed,
}: {
  initial: FollowSnapshot;
  following: boolean;
  onClose: () => void;
  onToggleFollow: (snap: FollowSnapshot) => void;
  /** 最新取得後にフォロー中スナップショットを更新するための通知（null=削除済み）。 */
  onRefreshed?: (handle: string, snap: FollowSnapshot | null) => void;
}) {
  const handle = initial.handle;
  const [snap, setSnap] = useState<FollowSnapshot>(initial);
  const [deleted, setDeleted] = useState(false);

  // 右スワイプで閉じる（右方向のドラッグ）。iOSの「戻る」ジェスチャと同じ向き。
  // しきい値未満で離したら元位置へスナップして戻す。
  const drag = useRef({ startX: 0, startY: 0, active: false });
  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const CLOSE_THRESHOLD = 80;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    drag.current = { startX: t.clientX, startY: t.clientY, active: true };
    setSnapping(false);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!drag.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.current.startX;
    const dy = t.clientY - drag.current.startY;
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
      setDragX(0); // 左方向・縦方向は無視（通常スクロールを邪魔しない）
      return;
    }
    setDragX(dx);
  }
  function onTouchEnd() {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dragX > CLOSE_THRESHOLD) {
      onClose();
      return;
    }
    setSnapping(true);
    requestAnimationFrame(() => setDragX(0));
  }

  const dragStyle: CSSProperties | undefined =
    dragX > 0
      ? {
          transform: `translateX(${dragX}px)`,
          opacity: Math.max(0.4, 1 - dragX / 420),
          transition: snapping ? "transform .22s ease, opacity .22s ease" : "none",
        }
      : snapping
        ? { transition: "transform .22s ease, opacity .22s ease" }
        : undefined;

  // 表示中は背景スクロールを止める。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escで閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 裏で最新を取得して差し替える。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await getPublicPage(createClient(), handle);
        if (cancelled) return;
        if (!page) {
          setDeleted(true);
          onRefreshed?.(handle, null);
          return;
        }
        const fresh = toSnapshot(page.profile, page.channels, page.cal);
        setSnap(fresh);
        onRefreshed?.(handle, fresh);
      } catch {
        /* 取得失敗時はキャッシュ表示のまま */
      }
    })();
    return () => { cancelled = true; };
    // onRefreshed は毎回同一である必要はない（handle 単位で一度だけ取得する）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  return (
    <div
      className="previewOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={`@${handle} のプロフィール`}
      style={dragStyle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTransitionEnd={() => { if (dragX === 0) setSnapping(false); }}
    >
      <main className="wrap" style={{ paddingTop: 8, paddingBottom: 40 }}>
        <div className="top">
          <span className="logo" aria-hidden="true">via-mi</span>
          <button type="button" className="publicBack" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            戻る
          </button>
        </div>
        {deleted ? (
          <div className="previewDeleted">このページは削除されました。</div>
        ) : (
          <>
            <PublicProfileCard
              data={snapToCard(snap)}
              trackHandle={handle}
              actions={
                <button
                  type="button"
                  className={`pill followAction ${following ? "line" : "solid"}`}
                  onClick={() => onToggleFollow(snap)}
                >
                  {following ? "フォロー中" : "フォローする"}
                </button>
              }
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
          </>
        )}
      </main>
    </div>
  );
}
