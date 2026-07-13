import { describe, expect, it } from "vitest";
import { safeUrl } from "./safe";
import { isValidLinkUrl } from "./validate";

describe("safeUrl", () => {
  it("allows supported schemes and normalizes bare domains", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("example.com/path")).toBe("https://example.com/path");
    expect(safeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
  });

  it("blocks script and protocol-relative URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,test")).toBe("#");
    expect(safeUrl("//evil.example/path")).toBe("#");
  });
});

describe("isValidLinkUrl", () => {
  it("rejects malformed hosts", () => {
    expect(isValidLinkUrl("not-a-host")).toBe(false);
    expect(isValidLinkUrl("https://example.com")).toBe(true);
  });
});
