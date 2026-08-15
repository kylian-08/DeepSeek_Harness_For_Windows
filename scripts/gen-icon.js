// Generate the app icon from the official DeepSeek whale SVG:
// SVG -> PNG (sharp) -> multi-size ICO (png-to-ico).
"use strict";

const sharp = require("sharp");
const pngToIco = require("png-to-ico");
const fs = require("node:fs");
const path = require("node:path");

const assetsDir = path.join(__dirname, "..", "assets");
const srcSvg = path.join(assetsDir, "deepseek-whale.svg");
const outPng = path.join(assetsDir, "icon-512.png");
const outIco = path.join(assetsDir, "icon.ico");

(async () => {
  fs.mkdirSync(assetsDir, { recursive: true });
  const svg = fs.readFileSync(srcSvg);
  await sharp(svg).resize(512, 512).png().toFile(outPng);

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
