import { describe, expect, it } from "vitest";
import { normalizeProfileContent } from "../lib/beacon/profile-content";

describe("normalizeProfileContent", () => {
  it("写真を5枚、メモ本文を1000文字までに制限する", () => {
    const content = normalizeProfileContent({
      photos: Array.from({ length: 7 }, (_, index) => ({
        id: `p${index}`,
        url: `https://example.com/${index}.jpg`,
      })),
      notes: [{
        id: "n1",
        text: "あ".repeat(1100),
        bold: true,
        underline: true,
        align: "center",
      }],
    });
    expect(content.photos).toHaveLength(5);
    expect(content.notes[0]).toMatchObject({
      id: "n1",
      bold: true,
      underline: true,
      align: "center",
    });
    expect(content.notes[0].text).toHaveLength(1000);
  });

  it("不正な画像URLと空メモを公開データから除外する", () => {
    expect(normalizeProfileContent({
      photos: [{ id: "x", url: "javascript:alert(1)" }],
      notes: [{ id: "n", text: " ", align: "wrong" }],
    })).toEqual({ photos: [], notes: [] });
  });
});
