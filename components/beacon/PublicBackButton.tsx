"use client";

import { useRouter } from "next/navigation";

export function PublicBackButton() {
  const router = useRouter();

  function back() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <button type="button" className="publicBack" onClick={back}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      戻る
    </button>
  );
}
