"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * アイコン(円)/ヘッダー(帯)の切り抜き位置・拡大率を指定するモーダル。
 * 外部ライブラリを使わず canvas + Pointer Events だけで完結する
 * （ドラッグでパン、スライダーまたは指2本のピンチでズーム）。
 *
 * 表示座標系での計算方針:
 *   baseScale = frame を隙間なく覆う最小倍率（object-fit: cover 相当）
 *   totalScale = baseScale * zoom（zoom は 1 以上のスライダー値）
 *   pan は画像中心からのずれ（px）。frame からはみ出ない範囲にクランプする。
 * 確定時は表示座標から元画像のピクセル座標へ逆算して canvas に描画する。
 */

export type CropShape = "circle" | "rect";

export function ImageCropper({
  file,
  shape,
  aspect,
  title,
  onCancel,
  onConfirm,
}: {
  file: File;
  shape: CropShape;
  /** frame の 幅/高さ 比（circle は常に1として扱われる）。 */
  aspect: number;
  title: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [imgUrl] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef<number | null>(null);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  function onImgLoad() {
    const img = imgRef.current;
    if (img) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  const frameSize = useCallback(() => {
    const r = frameRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }, []);

  const baseScale = useCallback(() => {
    if (!natural) return 1;
    const { w: fw, h: fh } = frameSize();
    return Math.max(fw / natural.w, fh / natural.h);
  }, [natural, frameSize]);

  const clampPan = useCallback(
    (x: number, y: number, z: number) => {
      if (!natural) return { x: 0, y: 0 };
      const { w: fw, h: fh } = frameSize();
      const s = baseScale() * z;
      const maxX = Math.max(0, (natural.w * s - fw) / 2);
      const maxY = Math.max(0, (natural.h * s - fh) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [natural, frameSize, baseScale],
  );

  function pinchDistance(): number {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) lastDist.current = pinchDistance();
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, cur);
      const dist = pinchDistance();
      if (lastDist.current) {
        const factor = dist / lastDist.current;
        setZoom((z) => {
          const nz = Math.min(4, Math.max(1, z * factor));
          setPan((p) => clampPan(p.x, p.y, nz));
          return nz;
        });
      }
      lastDist.current = dist;
      return;
    }

    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    pointers.current.set(e.pointerId, cur);
    setPan((p) => clampPan(p.x + dx, p.y + dy, zoom));
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) lastDist.current = null;
  }

  function onZoomChange(v: number) {
    setZoom(v);
    setPan((p) => clampPan(p.x, p.y, v));
  }

  async function confirm() {
    if (!natural) return;
    setBusy(true);
    try {
      const { w: fw, h: fh } = frameSize();
      const s = baseScale() * zoom;
      const imgLeft = (fw - natural.w * s) / 2 + pan.x;
      const imgTop = (fh - natural.h * s) / 2 + pan.y;
      const srcX = -imgLeft / s;
      const srcY = -imgTop / s;
      const srcW = fw / s;
      const srcH = fh / s;

      const outW = shape === "circle" ? 512 : 1200;
      const outH = shape === "circle" ? 512 : Math.round(1200 / aspect);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      const img = imgRef.current;
      if (!img) throw new Error("image not ready");
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          0.9,
        ),
      );
      onConfirm(blob);
    } catch {
      // 失敗時はモーダルを開いたままにする（ユーザーが再試行/キャンセルできる）
    } finally {
      setBusy(false);
    }
  }

  const s = baseScale() * zoom;
  const imgStyle: React.CSSProperties = natural
    ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: natural.w * s,
        height: natural.h * s,
        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
        userSelect: "none",
      }
    : { opacity: 0 };

  return (
    <div
      className="modalScrim cropScrim"
    >
      <div
        className="card cropModal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{title}</div>
        <div
          ref={frameRef}
          className={`cropFrame ${shape}`}
          style={{ aspectRatio: shape === "circle" ? "1 / 1" : `${aspect} / 1` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            style={imgStyle}
            onLoad={onImgLoad}
            draggable={false}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 4px" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>−</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>+</span>
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          ドラッグで位置を移動、スライダー（またはピンチ）で拡大できます。
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button
            className="btn sig"
            style={{ flex: 1 }}
            onClick={confirm}
            disabled={busy || !natural}
          >
            {busy ? "処理中…" : "適用"}
          </button>
        </div>
      </div>
    </div>
  );
}
