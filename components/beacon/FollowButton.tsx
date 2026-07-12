"use client";

import { useEffect, useState } from "react";
import {
  addFollow,
  type FollowSnapshot,
  isFollowing,
  removeFollow,
} from "@/lib/beacon/follows";

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
    setFollowed(isFollowing(snapshot.handle));
    setReady(true);
  }, [snapshot.handle]);

  function toggle() {
    if (followed) {
      removeFollow(snapshot.handle);
      setFollowed(false);
    } else {
      // 追跡時点の鮮度を持たせて保存
      addFollow({ ...snapshot, updated: Date.now() });
      setFollowed(true);
    }
  }

  return (
    <button
      className={followed ? "pill line" : "pill solid"}
      onClick={toggle}
      // ハイドレーション完了までは押下不可（SSRと初期状態を一致させる）
      disabled={!ready}
    >
      {followed ? "フォロー中" : "フォローする"}
    </button>
  );
}
