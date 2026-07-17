"use client";

import { useEffect, useState } from "react";
import {
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  type AppearanceMode,
  type AppearancePreference,
  loadAppearance,
  saveAppearance,
} from "@/lib/beacon/appearance";

const MODES: { id: AppearanceMode; label: string }[] = [
  { id: "system", label: "端末に合わせる" },
  { id: "light", label: "ライト" },
  { id: "dark", label: "ダーク" },
];

export function AppearanceSettings() {
  const [preference, setPreference] =
    useState<AppearancePreference>(DEFAULT_APPEARANCE);

  useEffect(() => {
    setPreference(loadAppearance());
  }, []);

  function update(next: AppearancePreference) {
    setPreference(next);
    saveAppearance(next);
  }

  return (
    <div className="card appearanceSettings">
      <div className="appearanceHeading">
        <div>
          <h2>表示</h2>
          <p>画面の明るさと色を選べます。</p>
        </div>
      </div>

      <div className="appearanceGroup">
        <div className="appearanceLabel">モード</div>
        <div className="appearanceModes" role="group" aria-label="表示モード">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={preference.mode === mode.id ? "on" : ""}
              aria-pressed={preference.mode === mode.id}
              onClick={() => update({ ...preference, mode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearanceGroup">
        <div className="appearanceLabel">カラーテーマ</div>
        <div className="themeChoices" role="group" aria-label="カラーテーマ">
          {COLOR_THEMES.map((theme) => {
            const selected = preference.theme === theme.id;
            return (
              <button
                type="button"
                className={`themeChoice ${selected ? "on" : ""}`}
                key={theme.id}
                aria-pressed={selected}
                aria-label={`${theme.label}（${theme.category}）`}
                onClick={() => update({ ...preference, theme: theme.id })}
              >
                <span
                  className="themeSwatch"
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(135deg, ${theme.colors[0]} 0 50%, ${theme.colors[1]} 50% 100%)`,
                  }}
                />
                <span className="themeChoiceText">
                  <strong>{theme.label}</strong>
                  <small>{theme.category}</small>
                </span>
                {selected && (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6.5 12.5 3.5 3.5 7.5-8" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
