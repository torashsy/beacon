import type { CalMemo, Channel, Profile } from "./types";

/**
 * フォロー中一覧は「端末ローカル(localStorage)」だけに置く。
 * サーバーには保存しない（beacon.html と同じ挙動 / 横断一覧APIを作らない法的制約）。
 * 各エントリは公開ページを開いた時点のスナップショット。
 */

const K_FOLLOWS = "beacon:myfollows:v1";
/** ログイン中ハンドルの控え（方式a: パスコードは保存せずハンドルのみ）。 */
export const K_HANDLE = "beacon:handle:v1";

export interface FollowSnapshot {
  handle: string;
  name: string;
  emoji: string;
  theme: number;
  av_url: string;
  bn_url: string;
  channels: Pick<Channel, "type" | "url" | "label" | "descr" | "status">[];
  pubcal: CalMemo[];
  updated: number;
}

/** 公開プロフィール＋リンク＋公開カレンダーからスナップショットを作る。 */
export function toSnapshot(
  profile: Profile,
  channels: Channel[],
  pubcal: CalMemo[],
): FollowSnapshot {
  return {
    handle: profile.handle,
    name: profile.name,
    emoji: profile.emoji,
    theme: profile.theme,
    av_url: profile.av_url,
    bn_url: profile.bn_url,
    channels: channels.map((c) => ({
      type: c.type,
      url: c.url,
      label: c.label,
      descr: c.descr,
      status: c.status,
    })),
    pubcal,
    updated: Date.now(),
  };
}

export function loadFollows(): FollowSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(K_FOLLOWS);
    return raw ? (JSON.parse(raw) as FollowSnapshot[]) : [];
  } catch {
    return [];
  }
}

function persist(list: FollowSnapshot[]): void {
  try {
    window.localStorage.setItem(K_FOLLOWS, JSON.stringify(list));
  } catch {
    /* ストレージ不可でも致命的でないため無視 */
  }
}

export function isFollowing(handle: string): boolean {
  return loadFollows().some((f) => f.handle === handle.toLowerCase());
}

/** 追加（既にいれば先頭へ更新）。更新後の一覧を返す。 */
export function addFollow(snap: FollowSnapshot): FollowSnapshot[] {
  const list = loadFollows().filter((f) => f.handle !== snap.handle);
  list.unshift(snap);
  persist(list);
  return list;
}

export function removeFollow(handle: string): FollowSnapshot[] {
  const list = loadFollows().filter((f) => f.handle !== handle.toLowerCase());
  persist(list);
  return list;
}
