"use client";

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { bumpClick } from "@/lib/beacon/rpc";

/** 公開ページのリンク。遷移を妨げず、指定された場合だけクリックを集計する。 */
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
    try {
      void bumpClick(createClient(), trackHandle, rawUrl);
    } catch {
      // 集計失敗でリンク遷移を止めない。
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
