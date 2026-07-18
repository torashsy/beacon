export type NoteAlignment = "left" | "center" | "right";

export interface ProfilePhoto {
  id: string;
  url: string;
}

export interface ProfileNote {
  id: string;
  text: string;
  bold: boolean;
  underline: boolean;
  align: NoteAlignment;
}

export interface ProfileContent {
  photos: ProfilePhoto[];
  notes: ProfileNote[];
}

export const EMPTY_PROFILE_CONTENT: ProfileContent = { photos: [], notes: [] };

function idOf(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length <= 100 && value ? value : fallback;
}

/** DBの旧データや壊れたJSONも安全な公開表示用データへ丸める。 */
export function normalizeProfileContent(value: unknown): ProfileContent {
  const source = value && typeof value === "object"
    ? value as { photos?: unknown; notes?: unknown }
    : {};
  const photos = Array.isArray(source.photos)
    ? source.photos.slice(0, 5).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const photo = item as { id?: unknown; url?: unknown };
        if (typeof photo.url !== "string" || !/^https?:\/\//i.test(photo.url) || photo.url.length > 2000) return [];
        return [{ id: idOf(photo.id, `photo-${index}`), url: photo.url }];
      })
    : [];
  const notes = Array.isArray(source.notes)
    ? source.notes.slice(0, 10).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const note = item as Record<string, unknown>;
        if (typeof note.text !== "string" || !note.text.trim()) return [];
        const align: NoteAlignment =
          note.align === "center" || note.align === "right" ? note.align : "left";
        return [{
          id: idOf(note.id, `note-${index}`),
          text: note.text.slice(0, 1000),
          bold: note.bold === true,
          underline: note.underline === true,
          align,
        }];
      })
    : [];
  return { photos, notes };
}
