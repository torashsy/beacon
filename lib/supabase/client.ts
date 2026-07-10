"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用 Supabase クライアント。
 * anon キーのみ使用。書き込み・認証は RPC 経由でサーバー検証される
 * （lib/beacon/rpc.ts を参照）。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
