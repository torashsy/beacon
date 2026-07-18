import { describe, expect, it } from "vitest";
import { normalizeProfileContent } from "../lib/beacon/profile-content";

describe("normalizeProfileContent", () => {
  it("写真を5枚までに制限する", () => {
    const content = normalizeProfileContent({
      photos: Array.from({ length: 7 }, (_, index) => ({
        id: `p${index}`,
        url: `https://example.com/${index}.jpg`,
      })),
    });
    expect(content.photos).toHaveLength(5);
  });

  it("不正な画像URLを公開データから除外する", () => {
    expect(normalizeProfileContent({
      photos: [{ id: "x", url: "javascript:alert(1)" }],
    })).toEqual({ photos: [] });
  });
});
