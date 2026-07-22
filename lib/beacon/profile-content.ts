export interface ProfilePhoto {
  id: string;
  url: string;
}

/** メモの最大文字数。サーバー側 update_profile_content の上限と一致させる。 */
export const MEMO_MAX_LENGTH = 800;

export interface ProfileContent {
  photos: ProfilePhoto[];
  /** 写真の下に表示する自由記述メモ（最大 MEMO_MAX_LENGTH 文字）。 */
  memo: string;
}

export const EMPTY_PROFILE_CONTENT: ProfileContent = { photos: [], memo: "" };

function idOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length <= 100 && value ? value : fallback;
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
  const memo = typeof source.memo === "string" ? source.memo.slice(0, MEMO_MAX_LENGTH) : "";
  return { photos, memo };
}
