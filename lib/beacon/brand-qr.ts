import type { BitMatrix } from "qrcode";

type QrMatrix = Pick<BitMatrix, "size" | "get">;

export type QrShareImageOptions = {
  qrDataUrl: string;
  handle: string;
  name: string;
  accent: string;
  accent2: string;
  onAccent: string;
  avatarUrl?: string;
  emoji?: string;
  avatarAccent?: string;
  avatarAccent2?: string;
};

const FALLBACK_ACCENT = "#0879ad";
const FALLBACK_ACCENT_2 = "#60c8f3";

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function isFinderCell(x: number, y: number, size: number): boolean {
  return (
    (x < 7 && y < 7) ||
    (x >= size - 7 && y < 7) ||
    (x < 7 && y >= size - 7)
  );
}

export function createBrandQrSvg(matrix: QrMatrix, color: string): string {
  const accent = safeColor(color, FALLBACK_ACCENT);
  const margin = 4;
  const total = matrix.size + margin * 2;
  const modules: string[] = [];

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.get(y, x) || isFinderCell(x, y, matrix.size)) continue;
      modules.push(
        `<rect x="${x + margin + 0.08}" y="${y + margin + 0.08}" width=".84" height=".84" rx=".32"/>`,
      );
    }
  }

  const finders = [
    [margin, margin],
    [margin + matrix.size - 7, margin],
    [margin, margin + matrix.size - 7],
  ]
    .map(
      ([x, y]) =>
        `<g><rect x="${x}" y="${y}" width="7" height="7" rx="1.35"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx=".9" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".65"/></g>`,
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="QRコード">`,
    `<rect width="${total}" height="${total}" rx="3" fill="#fff"/>`,
    `<g fill="${accent}">${modules.join("")}${finders}</g>`,
    "</svg>",
  ].join("");
}

export function qrSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  startSize: number,
  weight = 800,
): number {
  let size = startSize;
  do {
    context.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    if (context.measureText(value).width <= maxWidth) return size;
    size -= 2;
  } while (size > 30);
  return size;
}

function drawCenteredGlyph(
  context: CanvasRenderingContext2D,
  glyph: string,
  centerX: number,
  centerY: number,
) {
  const bufferSize = 160;
  const glyphCanvas = document.createElement("canvas");
  glyphCanvas.width = bufferSize;
  glyphCanvas.height = bufferSize;
  const glyphContext = glyphCanvas.getContext("2d", { willReadFrequently: true });

  if (!glyphContext) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(glyph, centerX, centerY);
    return;
  }

  glyphContext.font = context.font;
  glyphContext.fillStyle = context.fillStyle;
  glyphContext.textAlign = "center";
  glyphContext.textBaseline = "middle";
  glyphContext.fillText(glyph, bufferSize / 2, bufferSize / 2);

  const pixels = glyphContext.getImageData(0, 0, bufferSize, bufferSize).data;
  let minX = bufferSize;
  let minY = bufferSize;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bufferSize; y += 1) {
    for (let x = 0; x < bufferSize; x += 1) {
      if (pixels[(y * bufferSize + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(glyph, centerX, centerY);
    return;
  }

  const glyphWidth = maxX - minX + 1;
  const glyphHeight = maxY - minY + 1;
  context.drawImage(
    glyphCanvas,
    minX,
    minY,
    glyphWidth,
    glyphHeight,
    Math.round(centerX - glyphWidth / 2),
    Math.round(centerY - glyphHeight / 2),
    glyphWidth,
    glyphHeight,
  );
}

function drawShareBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  foreground: string,
) {
  context.save();

  const glow = context.createRadialGradient(width * 0.9, 80, 0, width * 0.9, 80, 430);
  glow.addColorStop(0, "rgba(255,255,255,.72)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, 520);

  context.globalAlpha = 0.045;
  context.fillStyle = foreground;
  context.beginPath();
  context.moveTo(-100, 865);
  context.bezierCurveTo(210, 730, 390, 955, 620, 910);
  context.bezierCurveTo(845, 865, 940, 695, 1180, 760);
  context.lineTo(1180, 1125);
  context.bezierCurveTo(850, 1040, 690, 1190, 440, 1115);
  context.bezierCurveTo(205, 1045, 85, 1135, -100, 1090);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.34;
  context.fillStyle = "#fff";
  context.beginPath();
  context.moveTo(-120, 1110);
  context.bezierCurveTo(190, 980, 400, 1210, 660, 1135);
  context.bezierCurveTo(870, 1075, 1010, 970, 1200, 1030);
  context.lineTo(1200, height + 80);
  context.lineTo(-120, height + 80);
  context.closePath();
  context.fill();

  context.restore();
}

export async function renderQrSharePng(
  options: QrShareImageOptions,
): Promise<Blob> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");

  const accent = safeColor(options.accent, FALLBACK_ACCENT);
  const accent2 = safeColor(options.accent2, FALLBACK_ACCENT_2);
  const avatarAccent = safeColor(options.avatarAccent ?? "", FALLBACK_ACCENT);
  const avatarAccent2 = safeColor(options.avatarAccent2 ?? "", FALLBACK_ACCENT_2);
  const foreground = safeColor(options.onAccent, "#ffffff");
  const gradient = context.createLinearGradient(70, 40, width - 40, height);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(1, accent2);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawShareBackdrop(context, width, height, foreground);

  let brandIcon: HTMLImageElement | null = null;
  try {
    brandIcon = await loadImage("/icon-192.png");
  } catch {
    brandIcon = null;
  }
  let brandWordmark: HTMLImageElement | null = null;
  try {
    brandWordmark = await loadImage("/via-mi-logo.png");
  } catch {
    brandWordmark = null;
  }

  if (brandIcon) {
    context.save();
    roundedRect(context, 88, 58, 60, 60, 17);
    context.clip();
    context.drawImage(brandIcon, 88, 58, 60, 60);
    context.restore();
  }
  const wordmarkX = brandIcon ? 168 : 88;
  if (brandWordmark) {
    const wordmarkHeight = 46;
    const wordmarkWidth =
      wordmarkHeight * (brandWordmark.width / brandWordmark.height);
    context.drawImage(brandWordmark, wordmarkX, 65, wordmarkWidth, wordmarkHeight);
  } else {
    context.fillStyle = foreground;
    context.font = '800 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = "left";
    context.fillText("via-mi", wordmarkX, 108);
  }

  const displayName = options.name.trim() || `@${options.handle}`;
  fitText(context, displayName, 860, 64);
  context.textAlign = "center";
  context.fillText(displayName, width / 2, 218);
  context.font = '650 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.globalAlpha = 0.86;
  context.fillText(`@${options.handle}`, width / 2, 270);
  context.globalAlpha = 1;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, .18)";
  context.shadowBlur = 38;
  context.shadowOffsetY = 12;
  roundedRect(context, 160, 330, 760, 760, 72);
  context.fillStyle = "#fff";
  context.fill();
  context.restore();

  const qrImage = await loadImage(options.qrDataUrl);
  context.drawImage(qrImage, 200, 370, 680, 680);

  const identitySize = 112;
  const identityX = width / 2 - identitySize / 2;
  const identityY = 710 - identitySize / 2;
  context.save();
  context.shadowColor = "rgba(0, 0, 0, .22)";
  context.shadowBlur = 18;
  context.beginPath();
  context.arc(width / 2, identityY + identitySize / 2, identitySize / 2 + 8, 0, Math.PI * 2);
  context.fillStyle = "#fff";
  context.fill();
  context.restore();

  let avatar: HTMLImageElement | null = null;
  if (options.avatarUrl) {
    try {
      avatar = await loadImage(options.avatarUrl);
    } catch {
      avatar = null;
    }
  }

  context.save();
  context.beginPath();
  context.arc(width / 2, identityY + identitySize / 2, identitySize / 2, 0, Math.PI * 2);
  context.clip();
  const avatarGradient = context.createLinearGradient(
    identityX,
    identityY,
    identityX + identitySize,
    identityY + identitySize,
  );
  avatarGradient.addColorStop(0, avatarAccent);
  avatarGradient.addColorStop(1, avatarAccent2);
  context.fillStyle = avatarGradient;
  context.fillRect(identityX, identityY, identitySize, identitySize);
  if (avatar) {
    const scale = Math.max(identitySize / avatar.width, identitySize / avatar.height);
    const drawWidth = avatar.width * scale;
    const drawHeight = avatar.height * scale;
    context.drawImage(
      avatar,
      identityX + (identitySize - drawWidth) / 2,
      identityY + (identitySize - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  } else {
    context.fillStyle = "#ffffff";
    context.font = '58px -apple-system, BlinkMacSystemFont, "Segoe UI Emoji", sans-serif';
    drawCenteredGlyph(
      context,
      options.emoji || (options.handle[0] ?? "?").toUpperCase(),
      width / 2,
      identityY + identitySize / 2,
    );
  }
  context.restore();

  context.fillStyle = foreground;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = '750 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText("カメラで読み取ってプロフィールへ", width / 2, 1190);
  context.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.globalAlpha = 0.82;
  context.fillText(`via-mi.com/@${options.handle}`, width / 2, 1244);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image export failed"))),
      "image/png",
    );
  });
}
