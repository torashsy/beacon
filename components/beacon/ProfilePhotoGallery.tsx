"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProfilePhoto } from "@/lib/beacon/profile-content";

export function ProfilePhotoGallery({ photos }: { photos: ProfilePhoto[] }) {
  const [active, setActive] = useState<ProfilePhoto | null>(null);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const railRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const markLoaded = useCallback((id: string) => {
    setLoaded((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);
  const beginClose = useCallback(() => {
    if (!active || closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setActive(null);
      setClosing(false);
    }, 150);
  }, [active, closing]);

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
      if (event.key === "Escape") beginClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [active, beginClose]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  function openPhoto(photo: ProfilePhoto) {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setActive(photo);
  }

  return (
    <>
      <div className="profilePhotoRail" aria-label="写真" ref={railRef}>
        {photos.map((photo, index) => (
          <button
            type="button"
            className={`profilePhotoItem ${loaded.has(photo.id) ? "loaded" : "loading"}`}
            key={photo.id}
            onClick={() => openPhoto(photo)}
            aria-label={`写真 ${index + 1} を拡大`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => markLoaded(photo.id)}
            />
          </button>
        ))}
      </div>
      {active && createPortal(
        <div
          className={`photoLightbox ${closing ? "closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="写真を拡大表示"
          onClick={beginClose}
        >
          <button
            className="photoLightboxClose"
            onClick={beginClose}
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
