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

/** 旧アカウント互換用。新規登録では使用しない。 */
export async function createAccount(
  db: DB,
  handle: string,
  pass: string,
): Promise<string> {
  return unwrap(
    await db.rpc("create_account", { p_handle: handle, p_pass: pass }),
  ) as string;
}

/** 旧アカウント移行用のログイン検証。 */
export async function verifyLogin(
  db: DB,
  handle: string,
  pass: string,
): Promise<boolean> {
  return unwrap(
    await db.rpc("verify_login", { p_handle: handle, p_pass: pass }),
  ) as boolean;
}

/**
 * セッショントークンを発行（要認証）。以後の全RPCに pass の代わりに渡せる。
 * 期限は30日スライド。パスコード再設定で全セッションが失効する。
 */
export async function createSession(
  db: DB,
  handle: string,
  pass: string,
): Promise<string> {
  return unwrap(
    await db.rpc("create_session", { p_handle: handle, p_pass: pass }),
  ) as string;
}

/** セッショントークンを失効させる（ログアウト時）。 */
export async function deleteSession(
  db: DB,
  handle: string,
  token: string,
): Promise<void> {
  unwrap(await db.rpc("delete_session", { p_handle: handle, p_token: token }));
}

/** 復旧コードでパスコード再設定。 */
export async function resetPass(
  db: DB,
  handle: string,
  recoveryCode: string,
  newPass: string,
): Promise<void> {
  // reset_pass は boolean を返す（誤りカウンタの更新を確実にコミットさせるため、
  // 誤りを例外にせず false で返す設計。詳細は launch-hardening-migration.sql）。
  const ok = unwrap(
    await db.rpc("reset_pass", {
      p_handle: handle,
      p_rc: recoveryCode,
      p_new: newPass,
    }),
  ) as boolean;
  if (!ok) throw new Error("bad recovery code");
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
  p: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_theme" | "av_url" | "bn_url"> & {
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
      p_av_theme: p.av_theme,
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

export interface PublicPage {
  profile: Profile;
  channels: Channel[];
  cal: CalMemo[]; // 公開カレンダーのみ
  follower_count: number;
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
  const [pageResult, countResult] = await Promise.all([
    db.rpc("get_public_page", { p_handle: handle }),
    db.rpc("get_follower_count", { p_handle: handle }),
  ]);
  const data = unwrap(pageResult) as PublicPage | null;
  if (!data || !data.profile) return null;
  return {
    profile: data.profile,
    channels: data.channels ?? [],
    cal: data.cal ?? [],
    follower_count: countResult.error ? 0 : Number(countResult.data ?? 0),
  };
}
