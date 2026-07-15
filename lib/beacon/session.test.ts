import { describe, expect, it } from "vitest";
import { isSessionToken } from "./session";

describe("session token validation", () => {
  it("accepts only the exact server-issued token format", () => {
    expect(isSessionToken(`bst_${"a".repeat(64)}`)).toBe(true);
    expect(isSessionToken(`bst_${"A".repeat(64)}`)).toBe(false);
    expect(isSessionToken("bst_short")).toBe(false);
    expect(isSessionToken(`prefix_bst_${"a".repeat(64)}`)).toBe(false);
  });
});
