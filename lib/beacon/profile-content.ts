export interface ProfilePhoto {
  id: string;
  url: string;
}

// ---- メモ（写真の下に表示する自由記述。iOSメモ風にブロック=行/段落単位で書式を持つ）----

/** ブロック数の上限。サーバー側 update_profile_content と一致させる。 */
export const MEMO_MAX_BLOCKS = 20;
/** 1ブロックの最大文字数。 */
export const MEMO_MAX_BLOCK_LENGTH = 300;
/** 全ブロック合計の最大文字数。 */
export const MEMO_MAX_TOTAL = 2000;

export type MemoAlign = "left" | "center" | "right";
/** 文字色。空文字は既定色（テーマの本文色）。HTMLではなくキーで持ち、表示側でCSSに対応付ける。 */
export const MEMO_COLORS = ["", "red", "orange", "green", "blue", "purple"] as const;
export type MemoColor = (typeof MEMO_COLORS)[number];

export interface MemoBlock {
  id: string;
  text: string;
  heading: boolean; // 見出し
  bold: boolean;
  underline: boolean;
  align: MemoAlign;
  color: MemoColor;
}

export interface ProfileContent {
  photos: ProfilePhoto[];
  /** 写真の下に表示するメモ（行/段落ブロックの配列）。 */
  memo: MemoBlock[];
}

export const EMPTY_PROFILE_CONTENT: ProfileContent = { photos: [], memo: [] };

export function emptyMemoBlock(id: string): MemoBlock {
  return { id, text: "", heading: false, bold: false, underline: false, align: "left", color: "" };
}

function idOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length <= 100 && value ? value : fallback;
}

function normalizeAlign(value: unknown): MemoAlign {
  return value === "center" || value === "right" ? value : "left";
}

function normalizeColor(value: unknown): MemoColor {
  return (MEMO_COLORS as readonly string[]).includes(value as string) ? (value as MemoColor) : "";
}

/**
 * メモを安全なブロック配列へ丸める。
 * - 旧データ（memo が文字列）は1ブロックへ移行する。
 * - ブロック数・文字数の上限を強制し、合計上限も守る。
 */
function normalizeMemo(raw: unknown): MemoBlock[] {
  let blocks: MemoBlock[] = [];
  if (Array.isArray(raw)) {
    blocks = raw.slice(0, MEMO_MAX_BLOCKS).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const b = item as Record<string, unknown>;
      const text = typeof b.text === "string" ? b.text.slice(0, MEMO_MAX_BLOCK_LENGTH) : "";
      return [{
        id: idOf(b.id, `memo-${index}`),
        text,
        heading: b.heading === true,
        bold: b.bold === true,
        underline: b.underline === true,
        align: normalizeAlign(b.align),
        color: normalizeColor(b.color),
      }];
    });
  } else if (typeof raw === "string" && raw.trim()) {
    // 旧: 単一文字列のメモ → 1ブロックへ移行
    blocks = [{ ...emptyMemoBlock("memo-0"), text: raw.slice(0, MEMO_MAX_BLOCK_LENGTH) }];
  }
  // 合計文字数の上限を後ろから削って守る
  let total = 0;
  const capped: MemoBlock[] = [];
  for (const b of blocks) {
    if (total + b.text.length > MEMO_MAX_TOTAL) break;
    total += b.text.length;
    capped.push(b);
  }
  return capped;
}

/** DBの旧データや壊れたJSONも安全な公開表示用データへ丸める。 */
export function normalizeProfileContent(value: unknown): ProfileContent {
  const source = value && typeof value === "object"
    ? value as { photos?: unknown; memo?: unknown }
    : {};
  const photos = Array.isArray(source.photos)
    ? source.photos.slice(0, 5).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const photo = item as { id?: unknown; url?: unknown };
        if (typeof photo.url !== "string" || !/^https?:\/\//i.test(photo.url) || photo.url.length > 2000) return [];
        return [{ id: idOf(photo.id, `photo-${index}`), url: photo.url }];
      })
    : [];
  return { photos, memo: normalizeMemo(source.memo) };
}

/** 表示に出す非空ブロックだけを返す（末尾の空行などを除外）。 */
export function visibleMemoBlocks(memo: MemoBlock[]): MemoBlock[] {
  return memo.filter((b) => b.text.trim() !== "");
}
