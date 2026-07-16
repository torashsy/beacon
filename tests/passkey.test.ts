import { describe, expect, it } from "vitest";
import { passkeyCreationOptions } from "../lib/beacon/passkey";

describe("passkeyCreationOptions", () => {
  it("keeps server identifiers but replaces the visible account name with the public ID", () => {
    const options = passkeyCreationOptions({
      rp: { id: "via-mi.com", name: "via-mi" },
      user: { id: "AQID", name: "long@internal.example", displayName: "long@internal.example" },
      challenge: "BAUG",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ id: "BwgJ", type: "public-key" }],
    }, "via_me");

    expect(options.user.name).toBe("@via_me");
    expect(options.user.displayName).toBe("@via_me");
    expect(Array.from(new Uint8Array(options.user.id as ArrayBuffer))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(options.challenge as ArrayBuffer))).toEqual([4, 5, 6]);
    expect(Array.from(new Uint8Array(options.excludeCredentials?.[0].id as ArrayBuffer))).toEqual([7, 8, 9]);
    expect(options.rp.id).toBe("via-mi.com");
  });
});
