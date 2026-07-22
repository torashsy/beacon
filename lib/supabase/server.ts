import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function supabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * 公開読み取り専用（cookie 非依存）クライアント。
 * 公開ページ（/@handle）はログイン状態に依存しないため、cookie を参照しない。
 * これにより `unstable_cache` の中から呼べる（＝取得結果をキャッシュして
 * DB 直撃を減らせる）。書き込みや本人限定読み取りには使わないこと。
 */
export function createPublicClient() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey(), {
    cookies: { getAll() { return []; }, setAll() {} },
  });
}

/**
 * サーバーコンポーネント / Route Handler 用 Supabase クライアント。
 * 公開ページ（/@handle）のSSR・OGP生成で profiles / channels / cal_public を読む。
 * これらは RLS で `select using (true)`（公開読み取り）が張られている。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Parameters<typeof cookieStore.set>[2];
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からの呼び出しでは set が無視されることがある（想定内）
          }
        },
      },
    },
  );
}
