// セキュリティ用のサニタイズ。ユーザー入力を href に流す前に必ず通す。

/**
 * リンクURLを安全なスキームに限定する。
 * React は要素の href スキームを検証しないため、javascript: / data: / vbscript:
 * などをそのまま流すと公開ページ訪問者に対する保存型XSSになる。
 *
 * - http(s) / mailto / tel はそのまま許可
 * - スキームの無い入力（bare domain や path）は https:// を補う
 * - それ以外（危険なスキームや protocol-relative //host）は "#" に無害化
 */
export function safeUrl(raw: string): string {
  const u = (raw ?? "").trim();
  if (!u) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  // スキーム区切りの ':' を含まず、英数字で始まるものだけ bare とみなして https 補完
  if (/^[a-z0-9]/i.test(u) && !u.includes(":")) return "https://" + u;
  return "#";
}
