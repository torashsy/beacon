export const APPEARANCE_STORAGE_KEY = "via-mi:appearance:v1";
export const APPEARANCE_EVENT = "via-mi:appearance";

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const COLOR_THEMES = [
  { id: "mono", label: "モノクロ", category: "シック", colors: ["#4d5358", "#c8cdd0"] },
  { id: "sky", label: "ソーダ", category: "淡色", colors: ["#8fcde0", "#c6eaf2"] },
  { id: "mint", label: "ミント", category: "淡色", colors: ["#9fd8c7", "#c8eadf"] },
  { id: "lilac", label: "ラベンダー", category: "淡色", colors: ["#c5b9e4", "#ddd5f0"] },
  { id: "peach", label: "サクラ", category: "パステル", colors: ["#efb7c7", "#f8d6df"] },
  { id: "cobalt", label: "オーシャン", category: "くすみ", colors: ["#9db9d8", "#c9daeb"] },
  { id: "magenta", label: "モーヴ", category: "くすみ", colors: ["#c8afc1", "#dfceda"] },
  { id: "citrus", label: "レモン", category: "淡色", colors: ["#ecd58f", "#f4e4ad"] },
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
