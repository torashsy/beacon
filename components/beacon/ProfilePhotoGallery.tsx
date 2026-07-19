"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProfilePhoto } from "@/lib/beacon/profile-content";

export function ProfilePhotoGallery({ photos }: { photos: ProfilePhoto[] }) {
  const [active, setActive] = useState<ProfilePhoto | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const railRef = useRef<HTMLDivElement>(null);
  const markLoaded = useCallback((id: string) => {
    setLoaded((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    railRef.current?.querySelectorAll<HTMLImageElement>("img").forEach((image, index) => {
      if (image.complete && image.naturalWidth > 0) markLoaded(photos[index].id);
    });
  }, [markLoaded, photos]);

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
      <div className="profilePhotoRail" aria-label="写真" ref={railRef}>
        {photos.map((photo, index) => (
          <button
            type="button"
            className={`profilePhotoItem ${loaded.has(photo.id) ? "loaded" : "loading"}`}
            key={photo.id}
            onClick={() => setActive(photo)}
            aria-label={`写真 ${index + 1} を拡大`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              onLoad={() => markLoaded(photo.id)}
            />
          </button>
        ))}
      </div>
      {active && createPortal(
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
        </div>,
        document.body,
      )}
    </>
  );
}
