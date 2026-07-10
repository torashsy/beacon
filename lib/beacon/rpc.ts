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
  p: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_url" | "bn_url">,
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

// ---- 公開読み取り（RPC ではなく RLS 経由の select）----

/** 公開プロフィール取得。存在しなければ null。 */
export async function getPublicProfile(
  db: DB,
  handle: string,
): Promise<Profile | null> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/** 公開リンク一覧（position 昇順、live/dead 両方。表示側で status を判定）。 */
export async function getPublicChannels(
  db: DB,
  handle: string,
): Promise<Channel[]> {
  const { data, error } = await db
    .from("channels")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Channel[]) ?? [];
}

/** 公開カレンダー（cal_public のみ）。 */
export async function getPublicCal(
  db: DB,
  handle: string,
): Promise<CalMemo[]> {
  const { data, error } = await db
    .from("cal_public")
    .select("d, memo")
    .eq("handle", handle.toLowerCase())
    .order("d", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CalMemo[]) ?? [];
}
