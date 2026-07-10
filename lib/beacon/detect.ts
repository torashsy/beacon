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
  [/(^|\.)lit\.link$/i, "litlink"],
  [/(^|\.)note\.com$/i, "other"],
];

/** 種別キーを返す。判定できなければ "other"。 */
export function detectType(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "other";
  // メール
  if (/^mailto:/i.test(s)) return "mail";
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(s)) return "mail";

  let host = "";
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : "https://" + s)
      .hostname;
  } catch {
    return "other";
  }
  for (const [re, type] of HOST_RULES) {
    if (re.test(host) && (type === "other" || type in TYPES)) return type;
  }
  return "other";
}
