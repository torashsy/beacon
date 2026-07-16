import { describe, expect, it } from "vitest";
import { VAPID_PUBLIC_KEY, vapidApplicationServerKey } from "./push";

describe("web push configuration", () => {
  it("decodes the VAPID public key as an uncompressed P-256 key", () => {
    const key = vapidApplicationServerKey(VAPID_PUBLIC_KEY);
    expect(key).toHaveLength(65);
    expect(key[0]).toBe(4);
  });
});
