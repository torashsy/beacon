import { describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "../lib/beacon/phone";

describe("normalizePhoneNumber", () => {
  it("converts a Japanese local number to E.164", () => {
    expect(normalizePhoneNumber("81", "090 1234-5678")).toBe("+819012345678");
  });

  it("keeps an international national number without a Japanese trunk prefix", () => {
    expect(normalizePhoneNumber("1", "415 555 0123")).toBe("+14155550123");
  });

  it("rejects incomplete numbers", () => {
    expect(normalizePhoneNumber("81", "09012")).toBe("");
  });
});
