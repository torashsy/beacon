import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const layout = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "via-mi-campaign-layout-v3.json"), "utf8"));
const { width, height } = layout.canvas;

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const cards = layout.conditions.map((item) => `
  <g>
    <rect x="840" y="${item.y}" width="690" height="145" rx="34" fill="#ffffff" fill-opacity="0.94" filter="url(#shadow)"/>
    <circle cx="930" cy="${item.y + 72}" r="52" fill="url(#number)"/>
    <text x="930" y="${item.y + 91}" text-anchor="middle" class="number">${esc(item.number)}</text>
    <text x="1004" y="${item.y + 89}" class="condition">${esc(item.text)}</text>
  </g>`).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.58" stop-color="#f7fcff"/>
      <stop offset="1" stop-color="#e8fff9"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2494f4"/>
      <stop offset="1" stop-color="#4bd8c2"/>
    </linearGradient>
    <linearGradient id="amount" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#62cdf0"/>
      <stop offset="1" stop-color="#147fe7"/>
    </linearGradient>
    <linearGradient id="number" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5bd6da"/>
      <stop offset="1" stop-color="#2189ee"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#3b91ba" flood-opacity="0.12"/>
    </filter>
    <style>
      text { font-family: "Yu Gothic", "Meiryo", sans-serif; fill: #08245c; }
      .headline { font-size: 56px; font-weight: 800; }
      .amount { font-size: 168px; font-weight: 800; fill: url(#amount); letter-spacing: -7px; }
      .unit { font-size: 70px; font-weight: 800; fill: #3d9ee9; }
      .label { font-size: 70px; font-weight: 800; }
      .title { font-size: 49px; font-weight: 800; }
      .condition { font-size: 39px; font-weight: 750; }
      .number { font-size: 66px; font-weight: 700; fill: white; }
    </style>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1455" cy="95" r="255" fill="#cffff4" fill-opacity="0.22"/>
  <circle cx="1180" cy="855" r="330" fill="#bcecff" fill-opacity="0.20"/>
  <path d="M1080 92 C1190 10 1235 165 1345 78 S1510 110 1600 34" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" opacity="0.78"/>
  <path d="M675 880 C790 780 870 930 990 835 S1175 890 1300 812 S1490 880 1605 792" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" opacity="0.70"/>

  <rect x="${layout.badge.x}" y="${layout.badge.y}" width="${layout.badge.width}" height="${layout.badge.height}" rx="36" fill="url(#accent)"/>
  <text x="${layout.badge.x + layout.badge.width / 2}" y="${layout.badge.y + 50}" text-anchor="middle" font-size="39" font-weight="800" fill="#ffffff">${esc(layout.badge.text)}</text>
  <text x="${layout.headline.x}" y="${layout.headline.y}" class="headline">${esc(layout.headline.text)}</text>
  <text x="${layout.reward.x}" y="${layout.reward.y}" class="amount">${esc(layout.reward.amount)}</text>
  <text x="590" y="${layout.reward.y}" class="unit">${esc(layout.reward.unit)}</text>
  <text x="82" y="664" class="label">${esc(layout.reward.label)}</text>

  <text x="${layout.conditionsTitle.x}" y="${layout.conditionsTitle.y}" class="title">${esc(layout.conditionsTitle.text)}</text>
  ${cards}

  <rect x="${layout.dm.x}" y="${layout.dm.y}" width="${layout.dm.width}" height="${layout.dm.height}" rx="41" fill="url(#accent)"/>
  <circle cx="135" cy="771" r="27" fill="#ffffff"/>
  <path d="M119 760h32v23h-32z M119 760l16 12 16-12" fill="none" stroke="#278fe9" stroke-width="4" stroke-linejoin="round"/>
  <text x="184" y="784" font-size="38" font-weight="800" fill="#ffffff">${esc(layout.dm.text)}</text>
  <text x="${layout.url.x}" y="${layout.url.y}" font-size="30" font-weight="650">${esc(layout.url.text)}</text>
</svg>`;

const base = await sharp(Buffer.from(svg)).png().toBuffer();
const composites = [];
for (const asset of [layout.brand.logo]) {
  composites.push({
    input: await sharp(path.join(root, asset.path)).resize(asset.width, asset.height, { fit: "contain" }).png().toBuffer(),
    left: asset.x,
    top: asset.y,
  });
}

await sharp(base)
  .composite(composites)
  .png()
  .toFile(path.join(import.meta.dirname, "via-mi-campaign-1000yen-v3.png"));
