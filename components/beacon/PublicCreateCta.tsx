"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadStoredSession } from "@/lib/beacon/session";

/**
 * 公開ページ(/@handle)の閲覧者を登録に誘導するCTA。
 * このアプリは検索インデックスも横断発見も持たないため、成長は「共有→閲覧→登録」
 * のループに依存する。閲覧者＝見込みユーザーなので、各公開ページに控えめな
 * 「無料でつくる」導線を置く。すでにこの端末でログイン済みの人には出さない。
 */
export function PublicCreateCta() {
  // SSR/初期表示ではログイン状態が不明なので、判定できるまでは出さない
  // （ログイン済みユーザーに一瞬でもCTAが見えるのを避ける）。
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!loadStoredSession());
  }, []);

  if (!show) return null;

  return (
    <Link href="/?start=create" className="publicCta">
      <span className="publicCtaText">
        <strong>あなたも無料でリンクページを</strong>
        <span>SNS・連絡先・予定をひとつにまとめて、URL / QR で共有できます。</span>
      </span>
      <span className="publicCtaButton">無料でつくる</span>
    </Link>
  );
}
