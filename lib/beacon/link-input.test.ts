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
    expect(normalizeLinkInput("https://instagram.com/via_mi", "x")).toMatchObject({
      type: "instagram",
      source: "url",
    });
  });

  it("detects URL-only platforms and keeps generic website links", () => {
    expect(normalizeLinkInput("discord.gg/example", "discord")?.type).toBe("discord");
    expect(normalizeLinkInput("https://example.com", "website")?.type).toBe("website");
    expect(normalizeLinkInput("hello@example.com", "mail")).toEqual({
      type: "mail",
      url: "mailto:hello@example.com",
      source: "url",
    });
  });

  it("detects Google Maps links by path, not just host", () => {
    expect(normalizeLinkInput("https://maps.google.com/?q=喫茶みほん", "other")?.type).toBe("map");
    expect(normalizeLinkInput("https://maps.app.goo.gl/abc123", "other")?.type).toBe("map");
    expect(normalizeLinkInput("https://www.google.com/maps/place/x", "other")?.type).toBe("map");
    expect(normalizeLinkInput("https://www.google.com/search?q=x", "other")?.type).toBe("other");
  });

  it("rejects invalid IDs and distinguishes IDs from known URLs", () => {
    expect(normalizeLinkInput("bad/id", "x")).toBeNull();
    expect(isExplicitUrlInput("instagram.com/via_mi")).toBe(true);
    expect(normalizeLinkInput("ideal-shop.booth.pm", "booth")).toMatchObject({
      type: "booth",
      source: "url",
    });
    expect(supportsUserId("instagram")).toBe(true);
    expect(supportsUserId("discord")).toBe(false);
  });
});
