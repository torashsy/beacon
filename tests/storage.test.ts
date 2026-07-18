import { describe, expect, it } from "vitest";
import { IMAGE_SETTINGS } from "../lib/beacon/storage";

describe("gallery image quality", () => {
  it("keeps gallery photos substantially larger and less compressed than avatars", () => {
    expect(IMAGE_SETTINGS.photo.maxEdge).toBe(2560);
    expect(IMAGE_SETTINGS.photo.quality).toBe(0.92);
    expect(IMAGE_SETTINGS.photo.maxEdge).toBeGreaterThan(IMAGE_SETTINGS.bn.maxEdge);
    expect(IMAGE_SETTINGS.photo.quality).toBeGreaterThan(IMAGE_SETTINGS.bn.quality);
  });
});
