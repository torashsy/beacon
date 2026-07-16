import type { Channel, Profile } from "@/lib/beacon/types";

// クライアントアプリ内で共有する型と小さなユーティリティ。

/** アプリ用の失効可能なセッショントークン。 */
export interface Session {
  handle: string;
  pass: string;
}

/** dkey(YYYY-MM-DD) → メモと公開フラグ。 */
export type CalMap = Record<string, { memo: string; pub: boolean }>;

/** ログイン中ユーザーの編集対象データ。 */
export interface Me {
  profile: Profile;
  followerCount: number;
  channels: Channel[]; // 各要素は React key 用に id を必ず持たせる
  cal: CalMap;
  calLoaded: boolean;
  clicks: Record<string, number>; // URL → クリック数（本人だけが取得可能）
  passkeyLinked: boolean;
  recoveryVerified: boolean;
  recoveryKind: "email" | "phone" | "email+phone" | null;
  recoveryEmailMasked: string | null;
  recoveryPhoneMasked: string | null;
}

export type View = "auth" | "profile" | "follows" | "howto" | "public";
export type ToastFn = (msg: string) => void;

/** Postgres の raise exception メッセージを日本語に対応づける。 */
export function authErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  const name = String((e as { name?: string })?.name ?? "");
  if (m.includes("taken")) return "このIDは使われています";
  if (m.includes("passkey already linked")) return "このIDはすでにパスキーへ移行済みです";
  if (m.includes("not supported") || name === "NotSupportedError") return "この端末はパスキーに対応していません";
  if (m.includes("cancel") || m.includes("NotAllowedError") || name === "NotAllowedError") return "パスキーの操作を中止しました";
  if (m.includes("not allowed")) return "IDまたは現在のパスコードが違います";
  if (m.includes("phone provider") || m.includes("Unsupported phone")) return "電話認証は現在利用できません。メールをお使いください";
  if (m.includes("otp_expired") || m.includes("Token has expired")) return "確認コードが違うか、期限が切れています";
  if (m.includes("locked")) return "試行回数が多すぎます。約15分後にお試しください";
  if (m.includes("bad recovery")) return "IDまたは復旧コードが違います";
  if (m.includes("pass too short")) return "パスコードは10文字以上にしてください";
  if (m.includes("pass too long")) return "パスコードは72バイト以内にしてください";
  if (m.includes("auth")) return "ログインを確認できませんでした";
  return "通信に失敗しました。しばらくして再度お試しください";
}

/** 空プロフィール（作成直後などのフォールバック）。 */
export function emptyProfile(handle: string): Profile {
  return {
    handle,
    name: "",
    bio: "",
    emoji: "🙂",
    theme: 0,
    av_theme: 0,
    av_url: "",
    bn_url: "",
  };
}

/** 各チャンネルに React key 用の id を保証する。 */
export function ensureIds(channels: Channel[]): Channel[] {
  return channels.map((c) => ({ ...c, id: c.id ?? cryptoId() }));
}

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}
