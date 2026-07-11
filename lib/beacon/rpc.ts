import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CalMemo,
  type Channel,
  type Profile,
  toChannelPayload,
} from "./types";

/**
 * supabase/schema.sql の RPC 群を型付きで呼ぶ薄いラッパー。
 * 設計原則（schema.sql 冒頭コメント）:
 *   - パスコード検証はすべてサーバー側 RPC。書込 RPC は毎回 p_pass を要求する。
 *   - 横断検索・一覧・レコメンドAPIは絶対に作らない（異性紹介事業の回避）。
 *
 * エラーは Postgres の raise exception がそのまま code/message で返る。
 * 代表例: 'taken'（ハンドル重複） / 'locked'（5回失敗で15分ロック） /
 *         'auth'（パスコード不一致） / 'bad recovery code' / 'pass too short'。
 */

type DB = SupabaseClient;

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---- 認証 ----

/** アカウント作成。成功時は復旧コード（平文）を一度だけ返す。必ず控えさせること。 */
export async function createAccount(
  db: DB,
  handle: string,
  pass: string,
): Promise<string> {
  return unwrap(
    await db.rpc("create_account", { p_handle: handle, p_pass: pass }),
  ) as string;
}

/** ログイン検証。true のときのみ成功。以降の書込は毎回 pass を渡す。 */
export async function verifyLogin(
  db: DB,
  handle: string,
  pass: string,
): Promise<boolean> {
  return unwrap(
    await db.rpc("verify_login", { p_handle: handle, p_pass: pass }),
  ) as boolean;
}

/** 復旧コードでパスコード再設定。 */
export async function resetPass(
  db: DB,
  handle: string,
  recoveryCode: string,
  newPass: string,
): Promise<void> {
  unwrap(
    await db.rpc("reset_pass", {
      p_handle: handle,
      p_rc: recoveryCode,
      p_new: newPass,
    }),
  );
}

/** 復旧コードを再発行し、新しい平文コードを返す（要パスコード）。古い復旧コードは無効になる。 */
export async function reissueRecovery(
  db: DB,
  handle: string,
  pass: string,
): Promise<string> {
  return unwrap(
    await db.rpc("reissue_recovery", { p_handle: handle, p_pass: pass }),
  ) as string;
}

/** 自分のフォロー先ハンドル一覧をサーバーから取得（要パスコード）。 */
export async function getMyFollows(
  db: DB,
  handle: string,
  pass: string,
): Promise<string[]> {
  const rows = (unwrap(
    await db.rpc("get_my_follows", { p_handle: handle, p_pass: pass }),
  ) ?? []) as { target: string }[];
  return rows.map((r) => r.target);
}

/** 自分のフォロー先ハンドル一覧をサーバーへ保存（差し替え・要パスコード）。 */
export async function saveMyFollows(
  db: DB,
  handle: string,
  pass: string,
  targets: string[],
): Promise<void> {
  unwrap(
    await db.rpc("save_my_follows", {
      p_handle: handle,
      p_pass: pass,
      p_targets: targets,
    }),
  );
}

/** 退会（アカウント削除）。 */
export async function deleteAccount(
  db: DB,
  handle: string,
  pass: string,
): Promise<void> {
  unwrap(await db.rpc("delete_account", { p_handle: handle, p_pass: pass }));
}

// ---- プロフィール ----

export async function updateProfile(
  db: DB,
  handle: string,
  pass: string,
  p: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_url" | "bn_url"> & {
    status?: string;
  },
): Promise<void> {
  unwrap(
    await db.rpc("update_profile", {
      p_handle: handle,
      p_pass: pass,
      p_name: p.name,
      p_bio: p.bio,
      p_emoji: p.emoji,
      p_theme: p.theme,
      p_av: p.av_url,
      p_bn: p.bn_url,
      p_status: p.status ?? null,
    }),
  );
}

// ---- チャンネル（リンク）----

/** 並び順込みで全リンクを差し替え保存。 */
export async function saveChannels(
  db: DB,
  handle: string,
  pass: string,
  channels: Channel[],
): Promise<void> {
  unwrap(
    await db.rpc("save_channels", {
      p_handle: handle,
      p_pass: pass,
      p_channels: channels.map(toChannelPayload),
    }),
  );
}

// ---- カレンダー ----

/** 1 日分のメモを保存。pub=true で公開、false で非公開。memo が空なら削除。 */
export async function saveCal(
  db: DB,
  handle: string,
  pass: string,
  date: string,
  memo: string,
  pub: boolean,
): Promise<void> {
  unwrap(
    await db.rpc("save_cal", {
      p_handle: handle,
      p_pass: pass,
      p_date: date,
      p_memo: memo,
      p_pub: pub,
    }),
  );
}

/** 自分の非公開カレンダーを取得（要パスコード）。 */
export async function getPrivateCal(
  db: DB,
  handle: string,
  pass: string,
): Promise<CalMemo[]> {
  return (unwrap(
    await db.rpc("get_private_cal", { p_handle: handle, p_pass: pass }),
  ) ?? []) as CalMemo[];
}

// ---- クリック数（本人だけが見られる簡易アナリティクス）----

/** 公開ページで訪問者がリンクを踏んだら +1（fire-and-forget）。 */
export async function bumpClick(
  db: DB,
  handle: string,
  url: string,
): Promise<void> {
  await db.rpc("bump_click", { p_handle: handle, p_url: url });
}

/** 本人のクリック数を url→回数 の map で取得（要パスコード）。 */
export async function getClicks(
  db: DB,
  handle: string,
  pass: string,
): Promise<Record<string, number>> {
  const rows = (unwrap(
    await db.rpc("get_clicks", { p_handle: handle, p_pass: pass }),
  ) ?? []) as { url: string; n: number }[];
  const map: Record<string, number> = {};
  rows.forEach((r) => (map[r.url] = Number(r.n)));
  return map;
}

// ---- 公開読み取り（列挙防止のため security definer RPC 経由。直接 select は不可）----

export interface PublicPage {
  profile: Profile;
  channels: Channel[];
  cal: CalMemo[]; // 公開カレンダーのみ
}

/**
 * 公開ページ1件分（プロフィール＋リンク＋公開カレンダー）を取得。存在しなければ null。
 * profiles/channels/cal_public への直接 select は許可されておらず、必ずこの
 * ハンドル指定 RPC 経由で読む（anon キーによる全ユーザー列挙を防ぐ）。
 */
export async function getPublicPage(
  db: DB,
  handle: string,
): Promise<PublicPage | null> {
  const data = unwrap(
    await db.rpc("get_public_page", { p_handle: handle }),
  ) as PublicPage | null;
  if (!data || !data.profile) return null;
  return {
    profile: data.profile,
    channels: data.channels ?? [],
    cal: data.cal ?? [],
  };
}
