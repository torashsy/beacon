import { describe, expect, it } from "vitest";
import { createBrandQrSvg, profileQrTheme, qrSvgDataUrl } from "./brand-qr";

function matrix(size = 21) {
  return {
    size,
    get(row: number, column: number) {
      return (row + column) % 2 === 0 ? 1 : 0;
    },
  };
}

describe("brand QR", () => {
  it("renders rounded modules and three distinct finder patterns", () => {
    const svg = createBrandQrSvg(matrix(), "#b52570");
    expect(svg).toContain('fill="#b52570"');
    expect(svg).toContain('rx=".32"');
    expect(svg.match(/<g><rect/g)).toHaveLength(3);
    expect(svg).toContain('aria-label="QRコード"');
  });

  it("falls back to a safe color and emits an SVG data URL", () => {
    const svg = createBrandQrSvg(matrix(), "not-a-color");
    expect(svg).toContain('fill="#0879ad"');
    expect(qrSvgDataUrl(svg)).toMatch(/^data:image\/svg\+xml/);
  });

  it("uses the profile color theme for the share card and QR modules", () => {
    expect(profileQrTheme("peach")).toMatchObject({
      accent: "#fff0f5",
      module: "#a92f5d",
    });
    expect(profileQrTheme("unknown")).toEqual(profileQrTheme("sky"));
  });
});
