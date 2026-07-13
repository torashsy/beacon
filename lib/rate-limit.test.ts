import { beforeEach, describe, expect, it } from "vitest";
import { clearRateLimitsForTests, takeRateLimit } from "./rate-limit";

describe("takeRateLimit", () => {
  beforeEach(clearRateLimitsForTests);

  it("blocks requests over the limit", () => {
    expect(takeRateLimit("a", { limit: 2, windowMs: 1000 }, 0).allowed).toBe(true);
    expect(takeRateLimit("a", { limit: 2, windowMs: 1000 }, 1).allowed).toBe(true);
    expect(takeRateLimit("a", { limit: 2, windowMs: 1000 }, 2).allowed).toBe(false);
  });

  it("starts a new window after expiry", () => {
    takeRateLimit("a", { limit: 1, windowMs: 1000 }, 0);
    expect(takeRateLimit("a", { limit: 1, windowMs: 1000 }, 1000).allowed).toBe(true);
  });
});
