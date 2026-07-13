import { beforeEach, describe, expect, it } from "vitest";
import {
  addFollow,
  diffFollow,
  loadFollows,
  removeFollow,
  type FollowSnapshot,
} from "./follows";
import type { PublicPage } from "./rpc";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: storage },
  configurable: true,
});

function snapshot(handle: string): FollowSnapshot {
  return {
    handle,
    name: handle,
    emoji: "🙂",
    theme: 0,
    av_url: "",
    bn_url: "",
    channels: [],
    pubcal: [],
    updated: 1,
  };
}

describe("account-scoped follow cache", () => {
  beforeEach(() => storage.clear());

  it("keeps guest and account caches isolated", () => {
    addFollow(snapshot("guest_target"), null);
    addFollow(snapshot("alice_target"), "alice");
    addFollow(snapshot("bob_target"), "bob");

    expect(loadFollows(null).map((item) => item.handle)).toEqual(["guest_target"]);
    expect(loadFollows("alice").map((item) => item.handle)).toEqual(["alice_target"]);
    expect(loadFollows("bob").map((item) => item.handle)).toEqual(["bob_target"]);
  });

  it("removes a follow only from the selected account", () => {
    addFollow(snapshot("same_target"), "alice");
    addFollow(snapshot("same_target"), "bob");
    removeFollow("same_target", "alice");

    expect(loadFollows("alice")).toEqual([]);
    expect(loadFollows("bob")).toHaveLength(1);
  });

  it("migrates the legacy shared cache to guest only", () => {
    storage.setItem("beacon:myfollows:v1", JSON.stringify([snapshot("legacy_target")]));

    expect(loadFollows(null).map((item) => item.handle)).toEqual(["legacy_target"]);
    expect(loadFollows("alice")).toEqual([]);
    expect(storage.getItem("beacon:myfollows:v1")).toBeNull();
  });
});

describe("follow update detection", () => {
  const base = snapshot("target");
  const page: PublicPage = {
    profile: {
      handle: "target",
      name: "target",
      bio: "",
      emoji: "🙂",
      theme: 0,
      av_theme: 0,
      av_url: "",
      bn_url: "",
    },
    channels: [],
    cal: [],
    follower_count: 0,
  };

  it("detects profile and calendar changes", () => {
    expect(diffFollow(base, page).state).toBe("same");
    expect(
      diffFollow(base, {
        ...page,
        profile: { ...page.profile, name: "new name" },
      }).state,
    ).toBe("changed");
    expect(diffFollow(base, { ...page, cal: [{ d: "2026-08-01", memo: "event" }] }).state)
      .toBe("changed");
  });

  it("marks newly added live links as new", () => {
    expect(
      diffFollow(base, {
        ...page,
        channels: [{ type: "x", url: "https://x.com/test", label: "", descr: "", status: "live" }],
      }).state,
    ).toBe("new");
  });
});
