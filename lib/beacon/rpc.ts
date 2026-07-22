import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CalMemo,
  type Channel,
  type Profile,
  toChannelPayload,
} from "./types";
import type { ProfileContent } from "./profile-content";

/**
 * supabase/schema.sql の RPC 群を型付きで呼ぶ薄いラッパー。
 * 設計原則:
 *   - Supabase Authがパスキーを検証し、書込RPCは毎回失効可能なアプリセッション
 *     （'bst_' 始まり）を検証する。
 *   - 横断検索・一覧・レコメンドAPIは絶対に作らない（異性紹介事業の回避）。
 *
 * エラーは Postgres の raise exception がそのまま code/message で返る。
 * 代表例: 'taken'（ハンドル重複） / 'auth'（認証不成立） /
 *         'passkey already linked'（移行済み）。
 */

type DB = SupabaseClient;

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---- 認証 ----

export interface PasskeyAppSession {
  handle: string;
  token: string;
}

export interface AccountSecurity {
  passkey_linked: boolean;
  recovery_verified: boolean;
  recovery_kind: "email" | null;
  recovery_email_masked: string | null;
}

/** Supabase Authのパスキー登録後にアプリ用アカウントとセッションを確定する。 */
export async function finalizePasskeyAccount(
  db: DB,
  handle: string,
): Promise<PasskeyAppSession> {
  return unwrap(
    await db.rpc("finalize_passkey_account", {
      p_handle: handle,
      p_legacy_secret: null,
    }),
  ) as PasskeyAppSession;
}

/** パスキーで成立したSupabase Authセッションからアプリ用トークンを発行する。 */
export async function createPasskeySession(db: DB): Promise<PasskeyAppSession> {
  return unwrap(await db.rpc("create_passkey_session")) as PasskeyAppSession;
}

/** 保存済みアプリセッションはトークン形式だけを受け付けて検証する。 */
export async function verifyAppSession(db: DB, handle: string, token: string): Promise<boolean> {
  return Boolean(unwrap(await db.rpc("verify_app_session", { p_handle: handle, p_token: token })));
}

export async function getAccountSecurity(
  db: DB,
  handle: string,
  secret: string,
): Promise<AccountSecurity> {
  return unwrap(await db.rpc("get_account_security", { p_handle: handle, p_secret: secret })) as AccountSecurity;
}

export type RecoveryStatus = Pick<
  AccountSecurity,
  "recovery_verified" | "recovery_kind" | "recovery_email_masked"
>;

export async function syncRecoveryStatus(db: DB): Promise<RecoveryStatus> {
  return unwrap(await db.rpc("sync_recovery_status")) as RecoveryStatus;
}

/** セッショントークンを失効させる（ログアウト時）。 */
export async function deleteSession(
  db: DB,
  handle: string,
  token: string,
): Promise<void> {
  unwrap(await db.rpc("delete_session", { p_handle: handle, p_token: token }));
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

/** フォロワー一覧の1件分（表示に必要な公開項目のみ）。 */
export interface FollowerRow {
  handle: string;
  name: string;
  emoji: string;
  av_url: string;
  av_theme: number;
}

/**
 * 自分をフォローしている相手の一覧をサーバーから取得（要パスコード）。
 * 本人だけが自分のフォロワーを閲覧できる。他人のフォロワー一覧・検索・おすすめは提供しない。
 */
export async function getMyFollowers(
  db: DB,
  handle: string,
  pass: string,
): Promise<FollowerRow[]> {
  const rows = (unwrap(
    await db.rpc("get_my_followers", { p_handle: handle, p_pass: pass }),
  ) ?? []) as Partial<FollowerRow>[];
  return rows.map((r) => ({
    handle: r.handle ?? "",
    name: r.name ?? "",
    emoji: r.emoji ?? "",
    av_url: r.av_url ?? "",
    av_theme: Number(r.av_theme ?? 0),
  }));
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
  const { data, error } = await db.functions.invoke("delete-account", {
    body: { handle, secret: pass },
  });
  if (error) throw new Error(error.message);
  if (data?.deleted !== true) {
    throw new Error(data?.error ?? "account deletion failed");
  }
}

// ---- プロフィール ----

export async function updateProfile(
  db: DB,
  handle: string,
  pass: string,
  p: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_theme" | "av_url" | "bn_url"> & {
    status?: string;
    color_theme?: string;
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
      p_av_theme: p.av_theme,
      p_color_theme: p.color_theme ?? "sky",
    }),
  );
}

export async function updateProfileContent(
  db: DB,
  handle: string,
  pass: string,
  content: ProfileContent,
): Promise<void> {
  unwrap(await db.rpc("update_profile_content", {
    p_handle: handle,
    p_pass: pass,
    p_content: content,
  }));
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

/** 1 日分のメモを保存（すべて公開）。memo が空なら削除。 */
export async function saveCal(
  db: DB,
  handle: string,
  pass: string,
  date: string,
  memo: string,
): Promise<void> {
  unwrap(
    await db.rpc("save_cal", {
      p_handle: handle,
      p_pass: pass,
      p_date: date,
      p_memo: memo,
    }),
  );
}

// ---- クリック数（本人だけが見られる簡易アナリティクス）----

/** 公開ページでリンクが開かれたら +1。遷移側では失敗を無視して呼ぶ。 */
export async function bumpClick(
  db: DB,
  handle: string,
  url: string,
): Promise<void> {
  await db.rpc("bump_click", { p_handle: handle, p_url: url });
}

/** 本人のリンク別クリック数を取得する。認証情報が必須。 */
export async function getClicks(
  db: DB,
  handle: string,
  pass: string,
): Promise<Record<string, number>> {
  const rows = (unwrap(
    await db.rpc("get_clicks", { p_handle: handle, p_pass: pass }),
  ) ?? []) as { url: string; n: number }[];
  return Object.fromEntries(rows.map((row) => [row.url, Number(row.n)]));
}

// ---- 公開読み取り（列挙防止のため security definer RPC 経由。直接 select は不可）----

export interface PublicPageCore {
  profile: Profile;
  channels: Channel[];
  cal: CalMemo[]; // 公開カレンダーのみ
}
export interface PublicPage extends PublicPageCore {
  follower_count: number;
}

/**
 * 公開ページ本体（プロフィール＋リンク＋公開カレンダー）だけを1RPCで取得。
 * フォロワー数を表示しない用途（フォロー更新チェック・一覧同期）向け。存在しなければ null。
 */
export async function getPublicPageCore(
  db: DB,
  handle: string,
): Promise<PublicPageCore | null> {
  const data = unwrap(await db.rpc("get_public_page", { p_handle: handle })) as PublicPage | null;
  if (!data || !data.profile) return null;
  return {
    profile: data.profile,
    channels: data.channels ?? [],
    cal: data.cal ?? [],
  };
}

/**
 * 公開ページ1件分＋フォロワー数を取得。存在しなければ null。
 * profiles/channels/cal_public への直接 select は許可されておらず、必ずこの
 * ハンドル指定 RPC 経由で読む（anon キーによる全ユーザー列挙を防ぐ）。
 */
export async function getPublicPage(
  db: DB,
  handle: string,
): Promise<PublicPage | null> {
  const [core, countResult] = await Promise.all([
    getPublicPageCore(db, handle),
    db.rpc("get_follower_count", { p_handle: handle }),
  ]);
  if (!core) return null;
  return {
    ...core,
    follower_count: countResult.error ? 0 : Number(countResult.data ?? 0),
  };
}
