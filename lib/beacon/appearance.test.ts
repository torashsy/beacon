import { describe, expect, it } from "vitest";
import {
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  normalizeColorTheme,
  parseAppearance,
} from "./appearance";

describe("appearance", () => {
  it("offers the six base colors plus a sweet pink variation", () => {
    expect(COLOR_THEMES).toHaveLength(7);
    expect(new Set(COLOR_THEMES.map((theme) => theme.id)).size).toBe(7);
    expect(new Set(COLOR_THEMES.map((theme) => theme.colors[0])).size).toBe(7);
    expect(COLOR_THEMES.map((theme) => theme.label)).toEqual([
      "ピンク",
      "甘めピンク",
      "緑",
      "青",
      "紫",
      "オレンジ",
      "黒",
    ]);
  });

  it("restores a valid saved preference", () => {
    expect(parseAppearance('{"mode":"dark","theme":"mono"}')).toEqual({
      mode: "dark",
      theme: "mono",
    });
  });

  it("falls back safely for invalid storage", () => {
    expect(parseAppearance("not-json")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{"mode":"night","theme":"unknown"}')).toEqual(
      DEFAULT_APPEARANCE,
    );
  });

  it("maps removed themes to the closest remaining color", () => {
    expect(normalizeColorTheme("cobalt")).toBe("sky");
    expect(normalizeColorTheme("magenta")).toBe("peach");
    expect(parseAppearance('{"mode":"light","theme":"magenta"}')).toEqual({
      mode: "light",
      theme: "peach",
    });
  });
});
