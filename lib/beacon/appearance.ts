export const APPEARANCE_STORAGE_KEY = "via-mi:appearance:v1";
export const APPEARANCE_EVENT = "via-mi:appearance";

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const COLOR_THEMES = [
  { id: "mono", label: "モノクロ", category: "シック", colors: ["#3f464d", "#d8dde3"] },
  { id: "sky", label: "スカイ", category: "パステル", colors: ["#0879ad", "#dff4ff"] },
  { id: "mint", label: "ミント", category: "パステル", colors: ["#137d69", "#dcf7ef"] },
  { id: "lilac", label: "ライラック", category: "パステル", colors: ["#6f54b5", "#eee8ff"] },
  { id: "peach", label: "ピーチ", category: "パステル", colors: ["#b95745", "#ffe8e1"] },
  { id: "cobalt", label: "コバルト", category: "ビビッド", colors: ["#2858d8", "#dce4ff"] },
  { id: "magenta", label: "マゼンタ", category: "ビビッド", colors: ["#b52570", "#ffe0ed"] },
  { id: "citrus", label: "シトラス", category: "ビビッド", colors: ["#b65300", "#ffead0"] },
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
