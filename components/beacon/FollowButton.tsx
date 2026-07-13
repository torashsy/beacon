"use client";

import { useEffect, useState } from "react";
import {
  addFollow,
  type FollowSnapshot,
  isFollowing,
  removeFollow,
} from "@/lib/beacon/follows";
import { loadStoredSession } from "@/lib/beacon/session";
import { saveMyFollows } from "@/lib/beacon/rpc";
import { createClient } from "@/lib/supabase/client";

/**
 * 公開ページ /@{handle} 上のフォローボタン（クライアント島）。
 * フォロー表示は端末ローカル(localStorage)のスナップショットで、ログイン中はIDだけをサーバーにも
 * 何も送らない・横断一覧APIも呼ばない（法的制約と beacon.html の挙動に一致）。
 * スナップショットはサーバーが描画済みの公開データを props で受け取る。
 */
export function FollowButton({ snapshot }: { snapshot: FollowSnapshot }) {
  const [followed, setFollowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const owner = loadStoredSession()?.handle ?? null;
      setFollowed(isFollowing(snapshot.handle, owner));
    };
    refresh();
    setReady(true);
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [snapshot.handle]);

  function toggle() {
    const saved = loadStoredSession();
    const owner = saved?.handle ?? null;
    let next: FollowSnapshot[];
    if (followed) {
      next = removeFollow(snapshot.handle, owner);
      setFollowed(false);
    } else {
      // 追跡時点の鮮度を持たせて保存
      next = addFollow({ ...snapshot, updated: Date.now() }, owner);
      setFollowed(true);
    }
    if (saved) {
      void saveMyFollows(
        createClient(),
        saved.handle,
        saved.token,
        next.map((item) => item.handle),
      ).catch(() => {});
    }
  }

  return (
    <button
      className={`pill followAction ${followed ? "line" : "solid"}`}
      onClick={toggle}
      // ハイドレーション完了までは押下不可（SSRと初期状態を一致させる）
      disabled={!ready}
    >
      {followed ? "フォロー中" : "フォローする"}
    </button>
  );
}
