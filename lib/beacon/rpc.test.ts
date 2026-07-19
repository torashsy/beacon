import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { deleteAccount } from "./rpc";

function clientWithInvoke(
  result: { data: unknown; error: { message: string } | null },
) {
  const invoke = vi.fn().mockResolvedValue(result);
  return {
    client: { functions: { invoke } } as unknown as SupabaseClient,
    invoke,
  };
}

describe("deleteAccount", () => {
  it("uses the server deletion endpoint so owned images are deleted too", async () => {
    const { client, invoke } = clientWithInvoke({
      data: { deleted: true, filesRemoved: 3 },
      error: null,
    });

    await expect(deleteAccount(client, "via_mi", "session-token")).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("delete-account", {
      body: { handle: "via_mi", secret: "session-token" },
    });
  });

  it("does not report success when the endpoint fails", async () => {
    const { client } = clientWithInvoke({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code" },
    });

    await expect(deleteAccount(client, "via_mi", "bad-token")).rejects.toThrow(
      "non-2xx",
    );
  });

  it("requires an explicit deletion result", async () => {
    const { client } = clientWithInvoke({
      data: { error: "account deletion failed" },
      error: null,
    });

    await expect(deleteAccount(client, "via_mi", "session-token")).rejects.toThrow(
      "account deletion failed",
    );
  });
});
