"use client";

import { useState, type CSSProperties } from "react";
import { renderQrSharePng } from "@/lib/beacon/brand-qr";
import type { ToastFn } from "./appTypes";

export type QrCard = {
  dataUrl: string;
  accent: string;
  accent2: string;
  onAccent: string;
};

export function QrShareModal({
  qr,
  handle,
  name,
  avatarUrl,
  emoji,
  onClose,
  toast,
}: {
  qr: QrCard;
  handle: string;
  name: string;
  avatarUrl?: string;
  emoji?: string;
  onClose: () => void;
  toast: ToastFn;
}) {
  const [sharing, setSharing] = useState(false);

  async function shareImage() {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = await renderQrSharePng({
        qrDataUrl: qr.dataUrl,
        handle,
        name,
        accent: qr.accent,
        accent2: qr.accent2,
        onAccent: qr.onAccent,
        avatarUrl,
        emoji,
      });
      const file = new File([blob], `via-mi-${handle}.png`, {
        type: "image/png",
      });
      const shareData = {
        title: `@${handle} · via-mi`,
        text: `@${handle} のvia-mi`,
        files: [file],
      };

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast("QR画像を保存しました");
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        toast("QR画像を共有できませんでした");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="modalScrim qrScrim" onClick={onClose}>
      <div
        className="qrModal"
        role="dialog"
        aria-modal="true"
        aria-label="共有用QRコード"
        onClick={(event) => event.stopPropagation()}
        style={
          {
            "--qr-accent": qr.accent,
            "--qr-accent-2": qr.accent2,
            "--qr-on-accent": qr.onAccent,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="qrClose"
          aria-label="閉じる"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="qrShareCard">
          <div className="qrBrand">
            <span className="qrBrandIcon" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="" />
            </span>
            <span>via-mi</span>
          </div>
          <div className="qrProfileName">{name.trim() || `@${handle}`}</div>
          <div className="qrProfileId">@{handle}</div>

          <div className="qrCodeShell">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="qrCodeImage"
              src={qr.dataUrl}
              alt={`@${handle} のQRコード`}
            />
            <span className="qrIdentity" aria-hidden="true">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" />
              ) : (
                <span>{emoji || "•"}</span>
              )}
            </span>
          </div>

          <div className="qrPrompt">カメラで読み取ってプロフィールへ</div>
        </div>

        <div className="qrActions">
          <button
            type="button"
            className="btn sig qrShareButton"
            onClick={shareImage}
            disabled={sharing}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v7h14v-7" />
            </svg>
            <span>{sharing ? "画像を作成中…" : "QR画像を共有"}</span>
          </button>
          <button type="button" className="btn ghost qrCloseButton" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
