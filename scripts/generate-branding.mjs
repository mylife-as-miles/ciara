#!/usr/bin/env node
/**
 * Generates Windows installer assets under build/.
 * Run before `electron-builder --win` (wired into npm run build:win).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const pngPath = path.join(root, "icon.png");

/** NSIS wizard sidebar BMP: 164×24-bit RGB, padded rows (electron-builder convention). */
function writeSidebarBmp(filePath, rgb) {
  const W = 164;
  const H = 314;
  const { r: R, g: G, b: B } = rgb;
  const rowStride = ((W * 3 + 3) >> 2) << 2;
  const imageSize = rowStride * H;
  const pixelOffset = 14 + 40;
  const fileSize = pixelOffset + imageSize;

  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt16LE(0, 6); // bfReserved1
  buf.writeUInt16LE(0, 8); // bfReserved2
  buf.writeUInt32LE(pixelOffset, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeUInt32LE(W, 18);
  buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  const row = Buffer.alloc(rowStride);
  for (let x = 0; x < W; x++) {
    const i = x * 3;
    row[i] = B;
    row[i + 1] = G;
    row[i + 2] = R;
  }
  for (let y = 0; y < H; y++) {
    const dst = pixelOffset + (H - 1 - y) * rowStride;
    row.copy(buf, dst);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });

  if (fs.existsSync(pngPath)) {
    const squaredPng = await sharp(pngPath)
      .resize(256, 256, {
        fit: "contain",
        background: { r: 0, g: 122, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
    const ico = await pngToIco(squaredPng);
    fs.writeFileSync(path.join(buildDir, "icon.ico"), ico);
    fs.copyFileSync(path.join(buildDir, "icon.ico"), path.join(buildDir, "installerIcon.ico"));
    console.log("[branding] Wrote build/icon.ico and build/installerIcon.ico from icon.png");
  } else {
    console.warn("[branding] icon.png missing — add it at repo root for CIARA.ico branding");
  }

  writeSidebarBmp(path.join(buildDir, "installerSidebar.bmp"), {
    r: 0,
    g: 122,
    b: 255,
  });
  console.log("[branding] Wrote build/installerSidebar.bmp (164×314)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
