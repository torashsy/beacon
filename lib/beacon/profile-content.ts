export interface ProfilePhoto {
  id: string;
  url: string;
}

export interface ProfileContent {
  photos: ProfilePhoto[];
}

export const EMPTY_PROFILE_CONTENT: ProfileContent = { photos: [] };

function idOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length <= 100 && value ? value : fallback;
}

/** DBの旧データや壊れたJSONも安全な公開表示用データへ丸める。 */
export function normalizeProfileContent(value: unknown): ProfileContent {
  const source = value && typeof value === "object"
    ? value as { photos?: unknown }
    : {};
  const photos = Array.isArray(source.photos)
    ? source.photos.slice(0, 5).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const photo = item as { id?: unknown; url?: unknown };
        if (typeof photo.url !== "string" || !/^https?:\/\//i.test(photo.url) || photo.url.length > 2000) return [];
        return [{ id: idOf(photo.id, `photo-${index}`), url: photo.url }];
      })
    : [];
  return { photos };
}
