"use client";

import { useEffect, useState } from "react";
import type { ProfilePhoto } from "@/lib/beacon/profile-content";

export function ProfilePhotoGallery({ photos }: { photos: ProfilePhoto[] }) {
  const [active, setActive] = useState<ProfilePhoto | null>(null);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [active]);

  return (
    <>
      <div className="profilePhotoRail" aria-label="写真">
        {photos.map((photo, index) => (
          <button
            type="button"
            className="profilePhotoItem"
            key={photo.id}
            onClick={() => setActive(photo)}
            aria-label={`写真 ${index + 1} を拡大`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" />
          </button>
        ))}
      </div>
      {active && (
        <div
          className="photoLightbox"
          role="dialog"
          aria-modal="true"
          aria-label="写真を拡大表示"
          onClick={() => setActive(null)}
        >
          <button
            className="photoLightboxClose"
            onClick={() => setActive(null)}
            aria-label="閉じる"
            autoFocus
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.url} alt="" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </>
  );
}
