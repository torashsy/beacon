import { describe, expect, it } from "vitest";
import {
  isExplicitUrlInput,
  normalizeLinkInput,
  supportsUserId,
} from "./link-input";

describe("normalizeLinkInput", () => {
  it("converts platform user IDs to canonical URLs", () => {
    expect(normalizeLinkInput("@torashsy", "x")).toMatchObject({
      type: "x",
      url: "https://x.com/torashsy",
      source: "user-id",
    });
    expect(normalizeLinkInput("ideal_user", "instagram")?.url).toBe(
      "https://www.instagram.com/ideal_user/",
    );
    expect(normalizeLinkInput("@ideal_user", "tiktok")?.url).toBe(
      "https://www.tiktok.com/@ideal_user",
    );
  });

  it("lets a pasted URL override the selected platform", () => {
    expect(normalizeLinkInput("https://instagram.com/my_ideal", "x")).toMatchObject({
      type: "instagram",
      source: "url",
    });
  });

  it("detects URL-only platforms and keeps generic support links", () => {
    expect(normalizeLinkInput("discord.gg/example", "discord")?.type).toBe("discord");
    expect(normalizeLinkInput("https://ko-fi.com/example", "support")?.type).toBe("support");
    expect(normalizeLinkInput("hello@example.com", "mail")).toEqual({
      type: "mail",
      url: "mailto:hello@example.com",
      source: "url",
    });
  });

  it("rejects invalid IDs and distinguishes IDs from known URLs", () => {
    expect(normalizeLinkInput("bad/id", "x")).toBeNull();
    expect(isExplicitUrlInput("instagram.com/my_ideal")).toBe(true);
    expect(normalizeLinkInput("ideal-shop.booth.pm", "booth")).toMatchObject({
      type: "booth",
      source: "url",
    });
    expect(supportsUserId("instagram")).toBe(true);
    expect(supportsUserId("discord")).toBe(false);
  });
});
