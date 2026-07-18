export const APPEARANCE_STORAGE_KEY = "via-mi:appearance:v1";
export const APPEARANCE_EVENT = "via-mi:appearance";

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const COLOR_THEMES = [
  { id: "mono", label: "モノクロ", category: "シック", colors: ["#4d5358", "#c8cdd0"] },
  { id: "sky", label: "ソーダ", category: "爽やか", colors: ["#087fa9", "#72d9f7"] },
  { id: "mint", label: "ミント", category: "爽やか", colors: ["#12836d", "#7ae1bc"] },
  { id: "lilac", label: "ラベンダー", category: "パステル", colors: ["#7658c7", "#c4adff"] },
  { id: "peach", label: "ピーチ", category: "キュート", colors: ["#bd5149", "#ffab98"] },
  { id: "cobalt", label: "オーシャン", category: "爽やか", colors: ["#3468cf", "#63c5f4"] },
  { id: "magenta", label: "ベリー", category: "キュート", colors: ["#b9437d", "#f58db7"] },
  { id: "citrus", label: "レモン", category: "フレッシュ", colors: ["#946b00", "#f5d44c"] },
] as const;

export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"];

export type AppearancePreference = {
  mode: AppearanceMode;
  theme: ColorThemeId;
};

export const DEFAULT_APPEARANCE: AppearancePreference = {
  mode: "system",
  theme: "sky",
};

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode);
}

export function isColorTheme(value: unknown): value is ColorThemeId {
  return COLOR_THEMES.some((theme) => theme.id === value);
}

export function parseAppearance(value: string | null): AppearancePreference {
  if (!value) return DEFAULT_APPEARANCE;
  try {
    const parsed = JSON.parse(value) as Partial<AppearancePreference>;
    return {
      mode: isAppearanceMode(parsed.mode) ? parsed.mode : DEFAULT_APPEARANCE.mode,
      theme: isColorTheme(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function loadAppearance(): AppearancePreference {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(preference: AppearancePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.colorMode = preference.mode;
  root.dataset.colorTheme = preference.theme;
  root.style.colorScheme =
    preference.mode === "system" ? "light dark" : preference.mode;
}

export function saveAppearance(preference: AppearancePreference): void {
  applyAppearance(preference);
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(preference),
    );
  } catch {
    /* Appearance still applies for the current page when storage is unavailable. */
  }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}
