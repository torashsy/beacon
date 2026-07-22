"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderQrShareImage } from "@/lib/beacon/brand-qr";
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
  avatarAccent,
  avatarAccent2,
  onClose,
  toast,
}: {
  qr: QrCard;
  handle: string;
  name: string;
  avatarUrl?: string;
  emoji?: string;
  avatarAccent: string;
  avatarAccent2: string;
  onClose: () => void;
  toast: ToastFn;
}) {
  const [busy, setBusy] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 140);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // 端末が画像ファイルの共有に対応しているときだけ「共有」ボタンを出す。
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function"
    ) return;
    const probe = new File([new Uint8Array([0])], "via-mi.jpg", { type: "image/jpeg" });
    setCanShareFiles(navigator.canShare({ files: [probe] }));
  }, []);

  function buildImage() {
    return renderQrShareImage({
      qrDataUrl: qr.dataUrl,
      handle,
      name,
      accent: qr.accent,
      accent2: qr.accent2,
      onAccent: qr.onAccent,
      avatarUrl,
      emoji,
      avatarAccent,
      avatarAccent2,
    });
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `via-mi-${handle}.jpg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function saveImage() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await buildImage();
      if (canShareFiles) {
        const file = new File([blob], `via-mi-${handle}.jpg`, { type: "image/jpeg" });
        await navigator.share({ files: [file], title: `@${handle} · via-mi` });
      } else {
        downloadBlob(blob);
        toast("QR画像を保存しました");
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        toast("QR画像を保存できませんでした");
      }
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await buildImage();
      const file = new File([blob], `via-mi-${handle}.jpg`, { type: "image/jpeg" });
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
      } else {
        // 共有できない端末では保存にフォールバック。
        downloadBlob(blob);
        toast("QR画像を保存しました");
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        toast("QR画像を共有できませんでした");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`modalScrim qrScrim${closing ? " closing" : ""}`} onClick={requestClose}>
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
            "--qr-avatar-accent": avatarAccent,
            "--qr-avatar-accent-2": avatarAccent2,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="qrClose"
          aria-label="閉じる"
          onClick={requestClose}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qrBrandWordmark" src="/via-mi-wordmark.png" alt="via-mi" />
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
                <img src={avatarUrl} alt="" decoding="async" />
              ) : (
                <span>{emoji || (handle[0] ?? "?").toUpperCase()}</span>
              )}
            </span>
          </div>

          <div className="qrPrompt">カメラで読み取ってプロフィールへ</div>
        </div>

        <div className="qrActions">
          <button
            type="button"
            className="btn sig qrShareButton"
            onClick={saveImage}
            disabled={busy}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
            </svg>
            <span>{busy ? "画像を作成中…" : canShareFiles ? "写真アプリに保存" : "画像を保存"}</span>
          </button>
          {canShareFiles && (
            <button
              type="button"
              className="btn line qrShareSecondary"
              onClick={shareImage}
              disabled={busy}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v7h14v-7" />
              </svg>
              <span>共有</span>
            </button>
          )}
          <button type="button" className="btn ghost qrCloseButton" onClick={requestClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
