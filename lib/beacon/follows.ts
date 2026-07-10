import type { CalMemo, Channel, Profile } from "./types";
import type { PublicPage } from "./rpc";
import { HEADING_TYPE } from "./constants";

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

// ---- 変化検知（フォロー時のスナップショット vs 現在の公開ページ）----

export type FollowDiffState =
  | "loading"
  | "same"
  | "new"
  | "changed"
  | "deleted";

export interface FollowStatus {
  state: FollowDiffState;
  addedLive: number; // 増えた有効リンク数
  fresh?: FollowSnapshot; // 取得した最新（「最新にする」で採用）
}

function liveUrlSet(
  channels: { type: string; url: string; status: string }[],
): Set<string> {
  return new Set(
    channels
      .filter((c) => c.type !== HEADING_TYPE && c.status === "live")
      .map((c) => c.url),
  );
}

/** スナップショットと現在ページを比較して差分状態を返す。page=null は削除ずみ。 */
export function diffFollow(
  snap: FollowSnapshot,
  page: PublicPage | null,
): FollowStatus {
  if (!page) return { state: "deleted", addedLive: 0 };
  const snapLive = liveUrlSet(snap.channels);
  const curLive = liveUrlSet(page.channels);
  const added = [...curLive].filter((u) => !snapLive.has(u));
  const removed = [...snapLive].filter((u) => !curLive.has(u));
  const nameChanged = (page.profile.name || "") !== (snap.name || "");
  const fresh = toSnapshot(page.profile, page.channels, page.cal);
  if (added.length) return { state: "new", addedLive: added.length, fresh };
  if (removed.length || nameChanged)
    return { state: "changed", addedLive: 0, fresh };
  return { state: "same", addedLive: 0, fresh };
}
