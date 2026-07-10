"use client";

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { bumpClick } from "@/lib/beacon/rpc";

/**
 * 公開ページのリンク。trackHandle が渡された時だけ、クリックで bump_click を
 * fire-and-forget 発火してクリック数を+1する（本人だけが集計を見られる）。
 * プレビュー用途では trackHandle 無しで普通のリンクとして描画される。
 */
export function TrackedLink({
  href,
  rawUrl,
  trackHandle,
  className,
  children,
}: {
  href: string;
  rawUrl: string;
  trackHandle?: string;
  className?: string;
  children: ReactNode;
}) {
  function onClick() {
    if (!trackHandle) return;
    // 集計は失敗しても遷移を妨げない
    try {
      void bumpClick(createClient(), trackHandle, rawUrl);
    } catch {
      /* noop */
    }
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
