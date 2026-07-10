import type { Channel, Profile } from "@/lib/beacon/types";

// クライアントアプリ内で共有する型と小さなユーティリティ。

/** セッション。パスコードはメモリ保持のみ（方式a）。localStorage には保存しない。 */
export interface Session {
  handle: string;
  pass: string;
}

/** dkey(YYYY-MM-DD) → メモと公開フラグ。 */
export type CalMap = Record<string, { memo: string; pub: boolean }>;

/** ログイン中ユーザーの編集対象データ。 */
export interface Me {
  profile: Profile;
  channels: Channel[]; // 各要素は React key 用に id を必ず持たせる
  cal: CalMap;
  calLoaded: boolean;
}

export type View = "auth" | "profile" | "follows" | "howto" | "public";
export type ToastFn = (msg: string) => void;

/** Postgres の raise exception メッセージを日本語に対応づける。 */
export function authErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (m.includes("taken")) return "このIDは使われています";
  if (m.includes("locked")) return "試行回数が多すぎます。約15分後にお試しください";
  if (m.includes("bad recovery")) return "IDまたは復旧コードが違います";
  if (m.includes("pass too short")) return "パスコードは6文字以上にしてください";
  if (m.includes("auth")) return "IDまたはパスコードが違います";
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
