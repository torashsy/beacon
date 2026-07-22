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
    <rect x="840" y="${item.y}" width="690" height="136" rx="30" fill="#ffffff" fill-opacity="0.97" stroke="#dff2fb" stroke-width="2" filter="url(#shadow)"/>
    <circle cx="922" cy="${item.y + 68}" r="48" fill="url(#number)"/>
    <text x="922" y="${item.y + 87}" text-anchor="middle" class="number">${esc(item.number)}</text>
    <text x="994" y="${item.y + 84}" class="condition">${esc(item.text)}</text>
  </g>`).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f8fcff"/>
      <stop offset="1" stop-color="#e9fbf8"/>
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
      <feDropShadow dx="0" dy="9" stdDeviation="16" flood-color="#3b91ba" flood-opacity="0.13"/>
    </filter>
    <style>
      text { font-family: "Noto Sans JP", "BIZ UDPGothic", sans-serif; fill: #12365f; font-kerning: normal; font-feature-settings: "palt" 1; }
      .white { fill: #ffffff; }
      .headline { font-size: 56px; font-weight: 700; letter-spacing: 0; }
      .amount { font-size: 176px; font-weight: 780; fill: url(#amount); letter-spacing: -8px; }
      .unit { font-size: 64px; font-weight: 700; fill: #3196df; letter-spacing: 0; }
      .label { font-size: 66px; font-weight: 700; letter-spacing: 1px; }
      .title { font-size: 46px; font-weight: 700; letter-spacing: 0; }
      .condition { font-size: 37px; font-weight: 650; letter-spacing: 0; }
      .number { font-size: 62px; font-weight: 700; fill: #ffffff; }
    </style>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1455" cy="95" r="255" fill="#cffff4" fill-opacity="0.28"/>
  <circle cx="1180" cy="855" r="330" fill="#bcecff" fill-opacity="0.24"/>
  <circle cx="735" cy="110" r="75" fill="#dff7ff" fill-opacity="0.45"/>
  <path d="M1080 92 C1190 10 1235 165 1345 78 S1510 110 1600 34" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" opacity="0.78"/>
  <path d="M675 880 C790 780 870 930 990 835 S1175 890 1300 812 S1490 880 1605 792" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" opacity="0.70"/>

  <rect x="${layout.badge.x}" y="${layout.badge.y}" width="${layout.badge.width}" height="${layout.badge.height}" rx="36" fill="url(#accent)"/>
  <text x="${layout.badge.x + layout.badge.width / 2}" y="${layout.badge.y + 46}" text-anchor="middle" font-size="36" font-weight="750" class="white">${esc(layout.badge.text)}</text>
  <text x="${layout.headline.x}" y="${layout.headline.y}" class="headline">${esc(layout.headline.text)}</text>
  <text x="${layout.reward.x}" y="${layout.reward.y}"><tspan class="amount">${esc(layout.reward.amount)}</tspan><tspan class="unit" dx="18">${esc(layout.reward.unit)}</tspan></text>
  <text x="82" y="676" class="label">${esc(layout.reward.label)}</text>

  <text x="${layout.conditionsTitle.x}" y="${layout.conditionsTitle.y}" text-anchor="middle" class="title">${esc(layout.conditionsTitle.text)}</text>
  ${cards}

  <rect x="${layout.dm.x}" y="${layout.dm.y}" width="${layout.dm.width}" height="${layout.dm.height}" rx="41" fill="url(#accent)"/>
  <circle cx="124" cy="762" r="25" fill="#ffffff"/>
  <path d="M110 752h28v20h-28z M110 752l14 10 14-10" fill="none" stroke="#278fe9" stroke-width="3.2" stroke-linejoin="round"/>
  <text x="160" y="773" font-size="25" font-weight="700" class="white">${esc(layout.dm.text)}</text>
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
