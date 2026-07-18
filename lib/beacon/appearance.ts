export const APPEARANCE_STORAGE_KEY = "via-mi:appearance:v1";
export const APPEARANCE_EVENT = "via-mi:appearance";

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const COLOR_THEMES = [
  { id: "peach", label: "ピンク", category: "パステル", colors: ["#efb7c7", "#f8d6df"] },
  { id: "mint", label: "緑", category: "パステル", colors: ["#9fd8c7", "#c8eadf"] },
  { id: "sky", label: "青", category: "爽やか", colors: ["#8fcde0", "#c6eaf2"] },
  { id: "lilac", label: "紫", category: "パステル", colors: ["#c5b9e4", "#ddd5f0"] },
  { id: "citrus", label: "オレンジ", category: "やわらか", colors: ["#e7b98c", "#f3d8bd"] },
  { id: "mono", label: "黒", category: "シック", colors: ["#303338", "#adb2b6"] },
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

const LEGACY_COLOR_THEMES: Record<string, ColorThemeId> = {
  cobalt: "sky",
  magenta: "peach",
};

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode);
}

export function isColorTheme(value: unknown): value is ColorThemeId {
  return COLOR_THEMES.some((theme) => theme.id === value);
}

export function normalizeColorTheme(value: unknown): ColorThemeId {
  if (isColorTheme(value)) return value;
  return typeof value === "string"
    ? LEGACY_COLOR_THEMES[value] ?? DEFAULT_APPEARANCE.theme
    : DEFAULT_APPEARANCE.theme;
}

export function parseAppearance(value: string | null): AppearancePreference {
  if (!value) return DEFAULT_APPEARANCE;
  try {
    const parsed = JSON.parse(value) as Partial<AppearancePreference>;
    return {
      mode: isAppearanceMode(parsed.mode) ? parsed.mode : DEFAULT_APPEARANCE.mode,
      theme: normalizeColorTheme(parsed.theme),
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
