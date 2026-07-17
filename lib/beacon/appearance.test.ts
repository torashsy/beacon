import { describe, expect, it } from "vitest";
import {
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  parseAppearance,
} from "./appearance";

describe("appearance", () => {
  it("offers exactly eight color themes", () => {
    expect(COLOR_THEMES).toHaveLength(8);
    expect(new Set(COLOR_THEMES.map((theme) => theme.id)).size).toBe(8);
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
});
