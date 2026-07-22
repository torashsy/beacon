export const MAX_PROFILE_TAGS = 5;
export const MAX_PROFILE_TAG_LENGTH = 20;

export function normalizeHashtags(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : value.split(/[\s,、]+/u);
  const unique: string[] = [];
  for (const raw of parts) {
    const tag = raw.trim().replace(/^#+/u, "").toLocaleLowerCase("ja-JP");
    if (!tag || tag.length > MAX_PROFILE_TAG_LENGTH) continue;
    if (!/^[\p{L}\p{N}_]+$/u.test(tag) || unique.includes(tag)) continue;
    unique.push(tag);
    if (unique.length === MAX_PROFILE_TAGS) break;
  }
  return unique;
}
