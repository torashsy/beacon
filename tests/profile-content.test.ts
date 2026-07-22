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
    })).toEqual({ photos: [], memo: [] });
  });

  it("旧形式（文字列メモ）を1ブロックへ移行する", () => {
    const memo = normalizeProfileContent({ photos: [], memo: "こんにちは" }).memo;
    expect(memo).toHaveLength(1);
    expect(memo[0].text).toBe("こんにちは");
    expect(memo[0].align).toBe("left");
    expect(memo[0].color).toBe("");
    // 空文字・非文字列は空配列
    expect(normalizeProfileContent({ photos: [], memo: "" }).memo).toEqual([]);
    expect(normalizeProfileContent({ photos: [], memo: 123 }).memo).toEqual([]);
    expect(normalizeProfileContent({ photos: [] }).memo).toEqual([]);
  });

  it("メモブロックの書式・上限を正規化する", () => {
    const memo = normalizeProfileContent({
      photos: [],
      memo: [
        { id: "a", text: "見出し", heading: true, bold: false, underline: false, align: "center", color: "red" },
        { text: "あ".repeat(500), align: "diagonal", color: "rainbow" },
      ],
    }).memo;
    expect(memo).toHaveLength(2);
    expect(memo[0]).toMatchObject({ text: "見出し", heading: true, align: "center", color: "red" });
    // 不正な align/color は既定へ、テキストは300字に丸める
    expect(memo[1].align).toBe("left");
    expect(memo[1].color).toBe("");
    expect(memo[1].text).toHaveLength(300);
    // ブロック数は20まで
    expect(
      normalizeProfileContent({
        photos: [],
        memo: Array.from({ length: 30 }, (_, i) => ({ text: `l${i}` })),
      }).memo,
    ).toHaveLength(20);
  });
});
