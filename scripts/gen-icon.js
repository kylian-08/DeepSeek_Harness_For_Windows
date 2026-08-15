// Generate a placeholder app icon: SVG -> PNG (sharp) -> ICO (png-to-ico).
// Replace the SVG below with a real brand icon later.
"use strict";

const sharp = require("sharp");
const pngToIco = require("png-to-ico");
const fs = require("node:fs");
const path = require("node:path");

const assetsDir = path.join(__dirname, "..", "assets");
const outPng = path.join(assetsDir, "icon-512.png");
const outIco = path.join(assetsDir, "icon.ico");

const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b4b9b"/>
      <stop offset="1" stop-color="#0d1b3e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="104" fill="url(#bg)"/>
  <path d="M296 88 L152 300 h86 l-22 124 150-212 h-88 z" fill="#4da3ff"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#4da3ff" stroke-width="10" stroke-opacity="0.35"/>
</svg>`;

(async () => {
  fs.mkdirSync(assetsDir, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outPng);

  // Build a multi-size ICO straight from RGBA raw buffers. `imagesToIco`
  // is synchronous and returns a Buffer; `pngToIco` (the default export)
  // reads PNG files itself and is not used here.
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) {
    const { data, info } = await sharp(outPng)
      .resize(size, size)
      .raw()
      .toBuffer({ resolveWithObject: true });
    images.push({ width: info.width, height: info.height, data });
  }
  const ico = pngToIco.imagesToIco(images);
  fs.writeFileSync(outIco, ico);
  console.log("icon written:", outIco, `(${ico.length} bytes)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
