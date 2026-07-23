import { TYPES } from "./constants";

/**
 * URL から リンク種別を推定する（litlink より速い「貼るだけ」体験のため）。
 * ホスト名で判定し、未知なら "other"。メールは mailto: か素の "a@b" を検出。
 */

const HOST_RULES: [RegExp, string][] = [
  [/(^|\.)x\.com$/i, "x"],
  [/(^|\.)twitter\.com$/i, "x"],
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)tiktok\.com$/i, "tiktok"],
  [/(^|\.)youtube\.com$/i, "youtube"],
  [/(^|\.)youtu\.be$/i, "youtube"],
  [/(^|\.)line\.me$/i, "line"],
  [/(^|\.)lin\.ee$/i, "line"],
  [/(^|\.)discord\.(gg|com)$/i, "discord"],
  [/(^|\.)twitch\.tv$/i, "twitch"],
  [/(^|\.)bsky\.app$/i, "bluesky"],
  [/(^|\.)pixiv\.net$/i, "pixiv"],
  [/(^|\.)booth\.pm$/i, "booth"],
  [/(^|\.)note\.com$/i, "note"],
  [/(^|\.)maps\.google\.[a-z.]+$/i, "map"],
  [/(^|\.)goo\.gl$/i, "map"],
  [/(^|\.)maps\.app\.goo\.gl$/i, "map"],
];

/** 種別キーを返す。判定できなければ "other"。 */
export function detectType(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "other";
  // メール
  if (/^mailto:/i.test(s)) return "mail";
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(s)) return "mail";

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : "https://" + s);
  } catch {
    return "other";
  }
  const { hostname, pathname } = url;
  // google.com 単体は検索・ドライブ等と衝突するため、/maps 配下のみ地図として扱う。
  if (/(^|\.)google\.[a-z.]+$/i.test(hostname) && /^\/maps(\/|$)/i.test(pathname)) {
    return "map";
  }
  for (const [re, type] of HOST_RULES) {
    if (re.test(hostname) && (type === "other" || type in TYPES)) return type;
  }
  return "other";
}
