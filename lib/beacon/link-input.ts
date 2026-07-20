import { detectType } from "./detect";
import { safeUrl } from "./safe";
import { isValidLinkUrl } from "./validate";

type UserIdPlatform = {
  pattern: RegExp;
  example: string;
  toUrl: (id: string) => string;
};

const USER_ID_PLATFORMS: Record<string, UserIdPlatform> = {
  x: {
    pattern: /^[a-z0-9_]{1,15}$/i,
    example: "@ユーザーID",
    toUrl: (id) => `https://x.com/${id}`,
  },
  instagram: {
    pattern: /^[a-z0-9._]{1,30}$/i,
    example: "@ユーザーID",
    toUrl: (id) => `https://www.instagram.com/${id}/`,
  },
  tiktok: {
    pattern: /^[a-z0-9._]{2,24}$/i,
    example: "@ユーザーID",
    toUrl: (id) => `https://www.tiktok.com/@${id}`,
  },
  youtube: {
    pattern: /^[a-z0-9._-]{3,30}$/i,
    example: "@ハンドル",
    toUrl: (id) => `https://www.youtube.com/@${id}`,
  },
  twitch: {
    pattern: /^[a-z0-9_]{4,25}$/i,
    example: "ユーザーID",
    toUrl: (id) => `https://www.twitch.tv/${id}`,
  },
  bluesky: {
    pattern: /^[a-z0-9.-]{3,253}$/i,
    example: "ハンドル.bsky.social",
    toUrl: (id) => `https://bsky.app/profile/${id}`,
  },
  pixiv: {
    pattern: /^\d{1,20}$/,
    example: "数字のユーザーID",
    toUrl: (id) => `https://www.pixiv.net/users/${id}`,
  },
  booth: {
    pattern: /^[a-z0-9-]{1,63}$/i,
    example: "ショップID",
    toUrl: (id) => `https://${id}.booth.pm/`,
  },
};

const KNOWN_HOST = /^(?:www\.)?(?:x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|twitch\.tv|bsky\.app|pixiv\.net)(?:\/|$)|^(?:[a-z0-9-]+\.)?booth\.pm(?:\/|$)/i;

export type NormalizedLinkInput = {
  type: string;
  url: string;
  source: "user-id" | "url";
};

export function supportsUserId(type: string): boolean {
  return type in USER_ID_PLATFORMS;
}

export function userIdExample(type: string): string {
  return USER_ID_PLATFORMS[type]?.example ?? "URL";
}

export function isExplicitUrlInput(raw: string): boolean {
  const value = raw.trim();
  return /^(?:https?:\/\/|mailto:|tel:|www\.)/i.test(value) || KNOWN_HOST.test(value);
}

export function normalizeLinkInput(raw: string, selectedType: string): NormalizedLinkInput | null {
  const value = raw.trim();
  if (!value) return null;

  const platform = USER_ID_PLATFORMS[selectedType];
  if (platform && !isExplicitUrlInput(value)) {
    const id = value.replace(/^@/, "");
    if (!platform.pattern.test(id)) return null;
    return { type: selectedType, url: platform.toUrl(id), source: "user-id" };
  }

  const email = /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(value);
  const normalizedUrl = email ? `mailto:${value}` : safeUrl(value);
  if (!isValidLinkUrl(normalizedUrl)) return null;
  // ホストから判定できない場合は、ユーザーが選んだ種別（Webサイト/その他）を尊重する。
  const detected = detectType(normalizedUrl);
  const type = detected === "other" && (selectedType === "website" || selectedType === "other")
    ? selectedType
    : detected;
  return { type, url: normalizedUrl, source: "url" };
}
