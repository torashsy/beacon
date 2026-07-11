import { safeUrl } from "./safe";

/**
 * リンクURLとして保存してよいかを検証する。壊れた/空のURLがそのまま保存され
 * 公開ページで死にリンクになるのを防ぐ（safeUrl はXSS対策の無害化だけで
 * 形式検証はしないため、こちらは別途フォーム側で使う）。
 */
export function isValidLinkUrl(raw: string): boolean {
  const u = safeUrl(raw);
  if (u === "#") return false;
  if (/^mailto:|^tel:/i.test(u)) return true;
  try {
    const parsed = new URL(u);
    return parsed.hostname.includes(".") || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}
