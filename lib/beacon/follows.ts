import type { CalMemo, Channel, Profile } from "./types";
import type { PublicPageCore } from "./rpc";
import { HEADING_TYPE } from "./constants";
import { normalizeProfileContent, type ProfileContent } from "./profile-content";

/**
 * 表示用スナップショットは端末localStorageに置き、ログイン中はハンドルだけを
 * 本人専用RPCでサーバー同期する。横断一覧・検索APIは作らない。
 */

const K_FOLLOWS_PREFIX = "via-mi:follows:v1:";
/** ログイン中ハンドルの控え（方式a: パスコードは保存せずハンドルのみ）。 */
export const K_HANDLE = "via-mi:handle:v1";

export interface FollowSnapshot {
  handle: string;
  name: string;
  bio?: string;
  status?: string;
  status_at?: string | null;
  emoji: string;
  theme: number;
  av_theme?: number;
  av_url: string;
  bn_url: string;
  color_theme?: string;
  tags?: string[];
  content?: ProfileContent;
  channels: Pick<Channel, "type" | "url" | "label" | "descr" | "status">[];
  pubcal: CalMemo[];
  updated: number; // このスナップショットを端末で取得した時刻（フォロー/更新時）
  pageUpdated?: string | null; // 相手がページを最後に更新した時刻（accounts.updated_at）
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
    bio: profile.bio,
    status: profile.status ?? "",
    status_at: profile.status_at ?? null,
    emoji: profile.emoji,
    theme: profile.theme,
    av_theme: profile.av_theme ?? 0,
    av_url: profile.av_url,
    bn_url: profile.bn_url,
    color_theme: profile.color_theme ?? "sky",
    tags: profile.tags ?? [],
    content: normalizeProfileContent(profile.content),
    channels: channels.map((c) => ({
      type: c.type,
      url: c.url,
      label: c.label,
      descr: c.descr,
      status: c.status,
    })),
    pubcal,
    updated: Date.now(),
    pageUpdated: profile.updated_at ?? null,
  };
}

function ownerKey(owner?: string | null): string {
  return K_FOLLOWS_PREFIX + (owner?.toLowerCase() || "guest");
}

export function loadFollows(owner?: string | null): FollowSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const key = ownerKey(owner);
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as FollowSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function replaceFollows(
  owner: string | null | undefined,
  list: FollowSnapshot[],
): FollowSnapshot[] {
  try {
    window.localStorage.setItem(ownerKey(owner), JSON.stringify(list));
  } catch {
    /* ストレージ不可でも致命的でないため無視 */
  }
  return list;
}

export function isFollowing(handle: string, owner?: string | null): boolean {
  return loadFollows(owner).some((f) => f.handle === handle.toLowerCase());
}

/** 追加（既にいれば先頭へ更新）。更新後の一覧を返す。 */
export function addFollow(
  snap: FollowSnapshot,
  owner?: string | null,
): FollowSnapshot[] {
  const list = loadFollows(owner).filter((f) => f.handle !== snap.handle);
  list.unshift(snap);
  return replaceFollows(owner, list);
}

export function removeFollow(
  handle: string,
  owner?: string | null,
): FollowSnapshot[] {
  const list = loadFollows(owner).filter((f) => f.handle !== handle.toLowerCase());
  return replaceFollows(owner, list);
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

function snapshotSignature(snapshot: FollowSnapshot): string {
  return JSON.stringify({
    name: snapshot.name,
    bio: snapshot.bio ?? "",
    status: snapshot.status ?? "",
    status_at: snapshot.status_at ?? null,
    emoji: snapshot.emoji,
    theme: snapshot.theme,
    av_theme: snapshot.av_theme ?? 0,
    av_url: snapshot.av_url,
    bn_url: snapshot.bn_url,
    color_theme: snapshot.color_theme ?? "sky",
    content: normalizeProfileContent(snapshot.content),
    channels: snapshot.channels.map((channel) => ({
      type: channel.type,
      url: channel.url,
      label: channel.label,
      descr: channel.descr,
      status: channel.status,
    })),
    pubcal: snapshot.pubcal.map((memo) => ({ d: memo.d, memo: memo.memo })),
  });
}

/** スナップショットと現在ページを比較して差分状態を返す。page=null は削除ずみ。 */
export function diffFollow(
  snap: FollowSnapshot,
  page: PublicPageCore | null,
): FollowStatus {
  if (!page) return { state: "deleted", addedLive: 0 };
  const snapLive = liveUrlSet(snap.channels);
  const curLive = liveUrlSet(page.channels);
  const added = [...curLive].filter((u) => !snapLive.has(u));
  const fresh = toSnapshot(page.profile, page.channels, page.cal);
  if (added.length) return { state: "new", addedLive: added.length, fresh };
  if (snapshotSignature(snap) !== snapshotSignature(fresh))
    return { state: "changed", addedLive: 0, fresh };
  return { state: "same", addedLive: 0, fresh };
}
