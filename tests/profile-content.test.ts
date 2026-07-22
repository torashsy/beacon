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
    })).toEqual({ photos: [], memo: "" });
  });

  it("メモを最大800字に丸め、文字列以外は空にする", () => {
    expect(normalizeProfileContent({ photos: [], memo: "こんにちは" }).memo).toBe("こんにちは");
    expect(normalizeProfileContent({ photos: [], memo: "あ".repeat(1000) }).memo).toHaveLength(800);
    expect(normalizeProfileContent({ photos: [], memo: 123 }).memo).toBe("");
    expect(normalizeProfileContent({ photos: [] }).memo).toBe("");
  });
});
