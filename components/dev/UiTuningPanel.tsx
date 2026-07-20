"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  type ColorThemeId,
} from "@/lib/beacon/appearance";

const STORAGE_KEY = "via-mi:ui-tuning:v1";
const STYLE_ID = "via-mi-ui-tuning-css";

const COLOR_TOKENS = [
  { name: "--page", label: "画面背景" },
  { name: "--surface", label: "カード背景" },
  { name: "--text", label: "本文・見出し" },
  { name: "--muted", label: "補助文字" },
  { name: "--border", label: "枠線" },
  { name: "--em", label: "ボタン・丸数字" },
  { name: "--emd", label: "リンク・アイコン・QR" },
  { name: "--eml", label: "淡い強調背景" },
  { name: "--on-em", label: "強調色上の文字" },
] as const;

const SIZE_TOKENS = [
  { name: "--radius", label: "カード角丸", min: 6, max: 30, unit: "px" },
  { name: "--content-width", label: "画面の最大幅", min: 360, max: 760, unit: "px" },
  { name: "--page-gutter", label: "左右余白", min: 8, max: 40, unit: "px" },
] as const;

type TokenName =
  | (typeof COLOR_TOKENS)[number]["name"]
  | (typeof SIZE_TOKENS)[number]["name"];
type TokenValues = Partial<Record<TokenName, string>>;
type ColorMode = "light" | "dark";

type SavedTuning = {
  theme: ColorThemeId;
  mode: ColorMode;
  values: TokenValues;
  customCss: string;
};

function readTokenValues(): TokenValues {
  const style = getComputedStyle(document.documentElement);
  const values: TokenValues = {};
  for (const token of [...COLOR_TOKENS, ...SIZE_TOKENS]) {
    values[token.name] = style.getPropertyValue(token.name).trim();
  }
  return values;
}

function removeInlineTokens() {
  for (const token of [...COLOR_TOKENS, ...SIZE_TOKENS]) {
    document.documentElement.style.removeProperty(token.name);
  }
}

function setCustomCss(css: string) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function normalizeColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split("").map((part) => part + part).join("")}`;
  }
  return "#000000";
}

export function UiTuningPanel() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ColorThemeId>(DEFAULT_APPEARANCE.theme);
  const [mode, setMode] = useState<ColorMode>("light");
  const [values, setValues] = useState<TokenValues>({});
  const [customCss, setCustomCssValue] = useState("");
  const [message, setMessage] = useState("");
  // このパネルを一度も開かず触っていない限り、実際のダーク/ライト切り替えを
  // 邪魔しないようにするフラグ。true にした後だけ values をインラインstyleとして
  // 固定・永続化する（そうしないと、単にマウントしただけで現在の色をその場で
  // 固定してしまい、後から表示モードを切り替えても反映されなくなる）。
  const explicit = useRef(false);

  useEffect(() => {
    let saved: SavedTuning | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedTuning | null;
    } catch {
      saved = null;
    }

    const initialTheme =
      saved?.theme && COLOR_THEMES.some((item) => item.id === saved.theme)
        ? saved.theme
        : (document.documentElement.dataset.colorTheme as ColorThemeId) || DEFAULT_APPEARANCE.theme;
    const initialMode =
      saved?.mode && ["light", "dark"].includes(saved.mode)
        ? saved.mode
        : document.documentElement.dataset.colorMode === "dark"
          ? "dark"
          : "light";

    setTheme(initialTheme);
    setMode(initialMode);

    if (saved?.values) {
      explicit.current = true;
      document.documentElement.dataset.colorTheme = initialTheme;
      document.documentElement.dataset.colorMode = initialMode;
      for (const [name, value] of Object.entries(saved.values)) {
        document.documentElement.style.setProperty(name, value);
      }
      setValues(saved.values);
    } else {
      setValues(readTokenValues());
    }

    const initialCss = saved?.customCss ?? "";
    setCustomCssValue(initialCss);
    setCustomCss(initialCss);
  }, []);

  useEffect(() => {
    if (!explicit.current) return;
    if (!Object.keys(values).length) return;
    for (const [name, value] of Object.entries(values)) {
      document.documentElement.style.setProperty(name, value);
    }
    setCustomCss(customCss);
    const saved: SavedTuning = { theme, mode, values, customCss };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [customCss, mode, theme, values]);

  const exportedCss = useMemo(() => {
    const declarations = [...COLOR_TOKENS, ...SIZE_TOKENS]
      .map((token) => `  ${token.name}: ${values[token.name] ?? ""};`)
      .join("\n");
    const extra = customCss.trim() ? `\n\n${customCss.trim()}` : "";
    const modeSelector = mode === "dark" ? '[data-color-mode="dark"]' : "";
    return `html[data-color-theme="${theme}"]${modeSelector} {\n${declarations}\n}${extra}`;
  }, [customCss, mode, theme, values]);

  function updateToken(name: TokenName, value: string) {
    explicit.current = true;
    setValues((current) => ({ ...current, [name]: value }));
    setMessage("");
  }

  function changeTheme(nextTheme: ColorThemeId) {
    explicit.current = true;
    removeInlineTokens();
    document.documentElement.dataset.colorTheme = nextTheme;
    setTheme(nextTheme);
    setValues(readTokenValues());
    setMessage("");
  }

  function changeMode(nextMode: ColorMode) {
    explicit.current = true;
    removeInlineTokens();
    document.documentElement.dataset.colorMode = nextMode;
    setMode(nextMode);
    setValues(readTokenValues());
    setMessage("");
  }

  async function copyCss() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(exportedCss);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = exportedCss;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setMessage("CSSをコピーしました");
  }

  function resetTuning() {
    explicit.current = false;
    localStorage.removeItem(STORAGE_KEY);
    removeInlineTokens();
    setCustomCss("");
    setCustomCssValue("");
    setValues(readTokenValues());
    setMessage("調整内容をリセットしました");
  }

  return (
    <aside className={`uiTuning ${open ? "open" : ""}`} aria-label="UI調整パネル">
      <button
        type="button"
        className="uiTuningToggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? "閉じる" : "UI調整"}
      </button>

      {open && (
        <div className="uiTuningPanel">
          <header className="uiTuningHeader">
            <div>
              <strong>UI調整</strong>
              <span>開発環境だけに表示されます</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="閉じる">×</button>
          </header>

          <p className="uiTuningNote">
            変更はこのブラウザだけのプレビューです。確定するときはCSSをコピーしてください。
          </p>

          <div className="uiTuningGrid">
            <label>
              <span>対象テーマ</span>
              <select value={theme} onChange={(event) => changeTheme(event.target.value as ColorThemeId)}>
                {COLOR_THEMES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>表示モード</span>
              <select value={mode} onChange={(event) => changeMode(event.target.value as ColorMode)}>
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
              </select>
            </label>
          </div>

          <section className="uiTuningSection">
            <h2>色</h2>
            <div className="uiTuningColors">
              {COLOR_TOKENS.map((token) => {
                const value = values[token.name] ?? "";
                return (
                  <label key={token.name}>
                    <span>{token.label}</span>
                    <div>
                      <input
                        type="color"
                        value={normalizeColor(value)}
                        onChange={(event) => updateToken(token.name, event.target.value)}
                        aria-label={`${token.label}のカラーピッカー`}
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(event) => updateToken(token.name, event.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="uiTuningSection">
            <h2>大きさ・余白</h2>
            {SIZE_TOKENS.map((token) => {
              const numericValue = Number.parseFloat(values[token.name] ?? "") || token.min;
              return (
                <label className="uiTuningRange" key={token.name}>
                  <span>{token.label}<b>{numericValue}{token.unit}</b></span>
                  <input
                    type="range"
                    min={token.min}
                    max={token.max}
                    value={numericValue}
                    onChange={(event) => updateToken(token.name, `${event.target.value}${token.unit}`)}
                  />
                </label>
              );
            })}
          </section>

          <section className="uiTuningSection">
            <h2>追加CSS</h2>
            <p>特定のボタンや文字だけを変えるときに使います。</p>
            <textarea
              value={customCss}
              onChange={(event) => setCustomCssValue(event.target.value)}
              placeholder={".profileEditButton {\n  font-size: 13px;\n}"}
              spellCheck={false}
            />
          </section>

          <section className="uiTuningSection">
            <h2>出力</h2>
            <pre>{exportedCss}</pre>
          </section>

          <div className="uiTuningActions">
            <button type="button" className="primary" onClick={copyCss}>CSSをコピー</button>
            <button type="button" onClick={resetTuning}>リセット</button>
          </div>
          {message && <p className="uiTuningMessage" role="status">{message}</p>}
        </div>
      )}
    </aside>
  );
}
