import type { Channel } from "./types";
import { COLORS, HEADING_TYPE, typeMeta } from "./constants";

/**
 * X/Instagram に貼れる正方形のシェアカード画像を canvas で生成する。
 * プロフィール（アイコン/名前/ID/主要プラットフォーム/URL）を1枚に。
 * 「凍結時にこの画像を貼る」導線としても使える。
 */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function generateShareCard(opts: {
  name: string;
  handle: string;
  emoji: string;
  theme: number;
  avUrl: string;
  url: string;
  channels: Channel[];
}): Promise<Blob> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  // 背景グラデーション（テーマ色）
  const [c0, c1] = COLORS[opts.theme] ?? COLORS[0];
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c0);
  bg.addColorStop(1, c1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 白カード
  ctx.save();
  ctx.shadowColor = "rgba(23,72,58,.18)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, 90, 150, W - 180, H - 300, 56);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  const cx = W / 2;

  // アバター円
  const avR = 96;
  const avY = 320;
  ctx.save();
  roundRect(ctx, cx - avR, avY - avR, avR * 2, avR * 2, avR);
  ctx.clip();
  const avImg = opts.avUrl ? await loadImage(opts.avUrl) : null;
  if (avImg) {
    ctx.drawImage(avImg, cx - avR, avY - avR, avR * 2, avR * 2);
  } else {
    const g = ctx.createLinearGradient(cx - avR, avY - avR, cx + avR, avY + avR);
    g.addColorStop(0, "#5FD6BC");
    g.addColorStop(1, "#2AA98C");
    ctx.fillStyle = g;
    ctx.fillRect(cx - avR, avY - avR, avR * 2, avR * 2);
    ctx.fillStyle = "#fff";
    ctx.font = "84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.emoji || opts.handle[0]?.toUpperCase() || "?", cx, avY + 4);
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 名前
  ctx.fillStyle = "#17242B";
  ctx.font = '800 62px "Noto Sans JP", sans-serif';
  ctx.fillText(trunc(ctx, opts.name || `@${opts.handle}`, 780), cx, 500);

  // @handle
  ctx.fillStyle = "#6E8580";
  ctx.font = '500 38px "JetBrains Mono", monospace';
  ctx.fillText(`@${opts.handle}`, cx, 556);

  // 主要プラットフォーム
  const platforms = opts.channels
    .filter((c) => c.type !== HEADING_TYPE && c.status === "live")
    .map((c) => typeMeta(c.type).lb)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);
  if (platforms.length) {
    ctx.fillStyle = "#0B9A6D";
    ctx.font = '700 34px "Noto Sans JP", sans-serif';
    ctx.fillText(trunc(ctx, platforms.join("　"), 860), cx, 648);
  }

  // URL ピル
  const urlText = opts.url.replace(/^https?:\/\//, "");
  ctx.font = '600 32px "JetBrains Mono", monospace';
  const uw = ctx.measureText(urlText).width;
  const pillW = Math.min(uw + 64, 900);
  ctx.fillStyle = "#F4FAF8";
  roundRect(ctx, cx - pillW / 2, 700, pillW, 72, 36);
  ctx.fill();
  ctx.fillStyle = "#17242B";
  ctx.fillText(trunc(ctx, urlText, pillW - 48), cx, 746);

  // フッター（ブランド）
  ctx.fillStyle = "#0B9A6D";
  ctx.font = '800 44px "Inter", sans-serif';
  ctx.fillText("Beacon.", cx, 862);
  ctx.fillStyle = "#6E8580";
  ctx.font = '600 28px "Noto Sans JP", sans-serif';
  ctx.fillText("あなたのSNS、全部ひとつに。", cx, 906);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
}

function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
