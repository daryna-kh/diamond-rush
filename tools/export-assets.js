#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const repoRoot = path.resolve(__dirname, "..");
const defaultSourceDir = path.resolve(repoRoot, "../diamondRush/browser/diamond_EUD.jar");
const sourceDir = path.resolve(process.env.DIAMOND_RUSH_SOURCE || process.argv[2] || defaultSourceDir);
const outDir = path.resolve(process.env.DIAMOND_RUSH_EXPORT || process.argv[3] || path.join(repoRoot, "public/assets"));

const worlds = [
  { id: "angkor", stageFile: "w0.bin", mapFile: "map_angkor.out", tileFile: "0.f" },
  { id: "bavaria", stageFile: "w1.bin", mapFile: "map_scotland.out", tileFile: "1.f" },
  { id: "siberia", stageFile: "w2.bin", mapFile: "map_tibet.out", tileFile: "2.f" },
];

const objectFiles = [
  "cm.f",
  "gen0.f",
  "gen1.f",
  "gen2.f",
  "gen3.f",
  "gen4.f",
  "mmv.f",
  "b0.f",
  "b1.f",
  "o.f",
];

const uiFiles = [
  "ui.f",
  "mm0.f",
  "mm1.f",
  "mmv.f",
  "ms.f",
  "demoui.f",
  "spl.f",
  "icon.png",
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readAsset(fileName) {
  return fs.readFileSync(path.join(sourceDir, fileName));
}

function fileExists(fileName) {
  return fs.existsSync(path.join(sourceDir, fileName));
}

function writeJSON(fileName, value) {
  const fullPath = path.join(outDir, fileName);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, JSON.stringify(value, null, 2));
}

function copyAsset(fileName, targetName) {
  if (!fileExists(fileName)) return null;
  const target = path.join(outDir, targetName || fileName);
  ensureDir(path.dirname(target));
  fs.copyFileSync(path.join(sourceDir, fileName), target);
  return target;
}

function u8(buffer) {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function readU16LE(view, ptr) {
  return view.getUint16(ptr, true);
}

function readU16BE(view, ptr) {
  return view.getUint16(ptr, false);
}

function readU32BE(view, ptr) {
  return view.getUint32(ptr, false);
}

function parseChunkedFile(fileName, type) {
  const buffer = readAsset(fileName);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let ptr = 0;
  const chunkCount = view.getUint8(ptr++);
  const chunkArrayPtr = ptr + chunkCount * 8;
  const chunks = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunkOffset = view.getUint32(ptr, true);
    ptr += 4;
    const chunkLength = view.getUint32(ptr, true);
    ptr += 4;
    const start = chunkArrayPtr + chunkOffset;
    chunks.push({
      index: i,
      fileName,
      type,
      buffer: buffer.subarray(start, start + chunkLength),
    });
  }

  return chunks;
}

class ImageData32 {
  constructor(width, height, data) {
    if (width <= 0 || height <= 0) throw new Error("Invalid image size");
    if (!(data instanceof Uint32Array) || data.length !== width * height) {
      throw new Error("Invalid image data");
    }
    this.width = width;
    this.height = height;
    this.data = data;
  }

  static transparent(width, height) {
    return new ImageData32(width, height, new Uint32Array(width * height));
  }

  clone() {
    return new ImageData32(this.width, this.height, this.data.slice());
  }

  hasPixel(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getPixel(x, y) {
    return this.data[x + y * this.width];
  }

  setPixel(x, y, pixel) {
    if (!this.hasPixel(x, y)) return;
    const alpha = (pixel >>> 24) & 0xff;
    if (alpha === 0) return;
    this.data[x + y * this.width] = pixel >>> 0;
  }

  forcePixel(x, y, pixel) {
    if (!this.hasPixel(x, y)) return;
    this.data[x + y * this.width] = pixel >>> 0;
  }
}

function rgbaToNumber(r, g, b, a) {
  return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}

function numberToRGBA(pixel) {
  return [
    pixel & 0xff,
    (pixel >>> 8) & 0xff,
    (pixel >>> 16) & 0xff,
    (pixel >>> 24) & 0xff,
  ];
}

class BSprite {
  static MAGIC = 0xdf03;

  constructor() {
    this.flags = 0;
    this.modules = [];
    this.frameModules = [];
    this.frames = [];
    this.animationFrames = [];
    this.animations = [];
    this.pixelFormat = 0;
    this.paletteCount = 0;
    this.colorsPerPalette = 0;
    this.palettes = [];
    this.dataFormat = 0;
    this.moduleData = [];
  }

  parse(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let ptr = 0;

    const magic = readU16BE(view, ptr);
    ptr += 2;
    if (magic !== BSprite.MAGIC) {
      throw new Error(`Sprite magic mismatch: 0x${magic.toString(16)}`);
    }

    this.flags = readU32BE(view, ptr);
    ptr += 4;

    const moduleCount = readU16LE(view, ptr);
    ptr += 2;
    for (let i = 0; i < moduleCount; i++) {
      this.modules.push({
        width: view.getUint8(ptr++),
        height: view.getUint8(ptr++),
        palettes: [],
      });
    }

    const frameModuleCount = readU16LE(view, ptr);
    ptr += 2;
    for (let i = 0; i < frameModuleCount; i++) {
      this.frameModules.push({
        moduleIndex: view.getUint8(ptr++),
        offsetX: view.getInt8(ptr++),
        offsetY: view.getInt8(ptr++),
        flags: view.getUint8(ptr++),
      });
    }

    const frameCount = readU16LE(view, ptr);
    ptr += 2;
    const frameModuleCounts = [];
    const frameFirstModuleIndices = [];
    for (let i = 0; i < frameCount; i++) {
      frameModuleCounts.push(readU16LE(view, ptr));
      ptr += 2;
      frameFirstModuleIndices.push(readU16LE(view, ptr));
      ptr += 2;
    }
    for (let i = 0; i < frameCount; i++) {
      this.frames.push({
        frameModuleCount: frameModuleCounts[i],
        firstFrameModuleIndex: frameFirstModuleIndices[i],
        bbox: {
          x: view.getInt8(ptr++),
          y: view.getInt8(ptr++),
          w: view.getUint8(ptr++),
          h: view.getUint8(ptr++),
        },
        palettes: [],
      });
    }

    const animationFrameCount = readU16LE(view, ptr);
    ptr += 2;
    for (let i = 0; i < animationFrameCount; i++) {
      this.animationFrames.push({
        frameIndex: view.getUint8(ptr++),
        time: view.getUint8(ptr++),
        offsetX: view.getInt8(ptr++),
        offsetY: view.getInt8(ptr++),
        flags: view.getUint8(ptr++),
      });
    }

    const animationCount = readU16LE(view, ptr);
    ptr += 2;
    for (let i = 0; i < animationCount; i++) {
      this.animations.push({
        animationFrameCount: readU16LE(view, ptr),
        firstAnimationFrameIndex: readU16LE(view, ptr + 2),
      });
      ptr += 4;
    }

    this.pixelFormat = readU16BE(view, ptr);
    ptr += 2;
    this.paletteCount = view.getUint8(ptr++);
    this.colorsPerPalette = view.getUint8(ptr++);
    ptr = this.parsePalettes(view, ptr);

    this.dataFormat = readU16LE(view, ptr);
    ptr += 2;
    for (let i = 0; i < moduleCount; i++) {
      const size = readU16LE(view, ptr);
      ptr += 2;
      this.moduleData[i] = buffer.subarray(ptr, ptr + size);
      ptr += size;

      for (let paletteI = 0; paletteI < this.paletteCount; paletteI++) {
        this.modules[i].palettes[paletteI] = this.parseModuleData(paletteI, i);
      }
    }

    for (let i = 0; i < this.frames.length; i++) {
      for (let paletteI = 0; paletteI < this.paletteCount; paletteI++) {
        this.frames[i].palettes[paletteI] = this.renderFrame(paletteI, i);
      }
    }

    return this;
  }

  parsePalettes(view, ptr) {
    for (let paletteI = 0; paletteI < this.paletteCount; paletteI++) {
      const palette = [];
      for (let colorI = 0; colorI < this.colorsPerPalette; colorI++) {
        let r;
        let g;
        let b;
        let a;

        switch (this.pixelFormat) {
          case 0x8888:
            b = view.getUint8(ptr++);
            g = view.getUint8(ptr++);
            r = view.getUint8(ptr++);
            a = view.getUint8(ptr++);
            break;
          case 0x0888:
            a = 0xff;
            b = view.getUint8(ptr++);
            g = view.getUint8(ptr++);
            r = view.getUint8(ptr++);
            break;
          case 0x4444: {
            const packed = readU16LE(view, ptr);
            ptr += 2;
            a = (packed & 0xf000) >> 8;
            a |= a >> 4;
            r = (packed & 0x0f00) >> 4;
            r |= r >> 4;
            g = packed & 0x00f0;
            g |= g >> 4;
            b = (packed & 0x000f) << 4;
            b |= b >> 4;
            break;
          }
          case 0x1555: {
            const packed = readU16LE(view, ptr);
            ptr += 2;
            a = (packed & 0x8000) ? 0xff : 0x00;
            r = (packed & 0x7c00) >> 7;
            g = (packed & 0x03e0) >> 2;
            b = (packed & 0x001f) << 3;
            break;
          }
          case 0x0565: {
            const packed = readU16LE(view, ptr);
            ptr += 2;
            a = packed === 0xf81f ? 0x00 : 0xff;
            r = (packed & 0xf800) >> 8;
            g = (packed & 0x07e0) >> 3;
            b = (packed & 0x001f) << 3;
            break;
          }
          case 0x0332: {
            const packed = view.getUint8(ptr++);
            a = packed === 0xc0 ? 0x00 : 0xff;
            r = packed & 0xe0;
            g = (packed & 0x1c) << 3;
            b = (packed & 0x03) << 6;
            break;
          }
          default:
            throw new Error(`Unknown pixel format 0x${this.pixelFormat.toString(16)}`);
        }

        palette.push(rgbaToNumber(r, g, b, a));
      }
      this.palettes.push(palette);
    }
    return ptr;
  }

  parseModuleData(paletteI, moduleI) {
    const module = this.modules[moduleI];
    const palette = this.palettes[paletteI];
    const pixels = new Uint32Array(module.width * module.height);
    const view = new DataView(this.moduleData[moduleI].buffer, this.moduleData[moduleI].byteOffset, this.moduleData[moduleI].byteLength);

    switch (this.dataFormat) {
      case 0x1600:
        for (let j = 0; j < pixels.length; j += 2) {
          const packed = view.getUint8(j >> 1);
          pixels[j] = palette[(packed & 0xf0) >> 4] || 0;
          if (j + 1 < pixels.length) pixels[j + 1] = palette[packed & 0x0f] || 0;
        }
        break;
      case 0x27f1: {
        let j = 0;
        let ptr = 0;
        while (j < pixels.length && ptr < view.byteLength) {
          let byte1 = view.getUint8(ptr++);
          if (byte1 > 0x7f) {
            byte1 -= 0x80;
            const byte2 = view.getUint8(ptr++);
            while (byte1-- > 0 && j < pixels.length) pixels[j++] = palette[byte2] || 0;
          } else {
            pixels[j++] = palette[byte1] || 0;
          }
        }
        break;
      }
      case 0x0400:
        for (let j = 0; j < pixels.length;) {
          const packed = view.getUint8(j >> 2);
          pixels[j++] = palette[(packed >> 6) & 0x03] || 0;
          if (j < pixels.length) pixels[j++] = palette[(packed >> 4) & 0x03] || 0;
          if (j < pixels.length) pixels[j++] = palette[(packed >> 2) & 0x03] || 0;
          if (j < pixels.length) pixels[j++] = palette[packed & 0x03] || 0;
        }
        break;
      default:
        throw new Error(`Unknown data format 0x${this.dataFormat.toString(16)}`);
    }

    return new ImageData32(module.width, module.height, pixels);
  }

  renderFrame(paletteI, frameI) {
    const frame = this.frames[frameI];
    if (frame.frameModuleCount === 0) return ImageData32.transparent(1, 1);

    const width = frame.bbox.w;
    const height = frame.bbox.h;
    if (width <= 0 || height <= 0) return ImageData32.transparent(1, 1);

    const image = ImageData32.transparent(width, height);
    const modules = this.frameModules.slice(
      frame.firstFrameModuleIndex,
      frame.firstFrameModuleIndex + frame.frameModuleCount,
    );

    for (const frameModule of modules) {
      const module = this.modules[frameModule.moduleIndex];
      if (!module) continue;
      const moduleImage = transformImage(module.palettes[paletteI], frameModule.flags);
      const targetX = frameModule.offsetX - frame.bbox.x;
      const targetY = frameModule.offsetY - frame.bbox.y;
      blit(image, moduleImage, targetX, targetY);
    }

    return image;
  }
}

function transformImage(image, flags) {
  if (!flags) return image.clone();
  const out = ImageData32.transparent(image.width, image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let sx = x;
      let sy = y;
      if (flags & 1) sx = image.width - 1 - x;
      if (flags & 2) sy = image.height - 1 - y;
      out.forcePixel(x, y, image.getPixel(sx, sy));
    }
  }
  return out;
}

function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      target.setPixel(dx + x, dy + y, source.getPixel(x, y));
    }
  }
}

function parseSpriteChunk(chunk) {
  return new BSprite().parse(chunk.buffer);
}

function parseSpriteFile(fileName) {
  const chunks = parseChunkedFile(fileName, "sprite");
  const parsed = [];
  const skipped = [];

  for (const chunk of chunks) {
    try {
      parsed.push({ chunk, sprite: parseSpriteChunk(chunk) });
    } catch (error) {
      skipped.push({ file: fileName, chunk: chunk.index, reason: error.message });
    }
  }

  return { parsed, skipped };
}

function packAtlas(images, maxWidth = 2048, padding = 1) {
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = maxWidth;

  for (const item of images) {
    if (item.image.width + padding * 2 > width) width = item.image.width + padding * 2;
    if (x + item.image.width + padding > width) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }

    item.x = x;
    item.y = y;
    x += item.image.width + padding;
    rowHeight = Math.max(rowHeight, item.image.height);
  }

  const height = Math.max(1, y + rowHeight + padding);
  const atlas = ImageData32.transparent(width, height);
  for (const item of images) blit(atlas, item.image, item.x, item.y);
  return { atlas, images };
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePNG(image) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    const row = y * (image.width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = numberToRGBA(image.getPixel(x, y));
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function imageMeta(item) {
  return {
    id: item.id,
    source: item.source,
    kind: item.kind,
    chunk: item.chunk,
    index: item.index,
    palette: item.palette,
    x: item.x,
    y: item.y,
    width: item.image.width,
    height: item.image.height,
  };
}

function exportAtlas(name, sourceFiles, options = {}) {
  const images = [];
  const skipped = [];
  const extractedImages = [];

  for (const fileName of sourceFiles) {
    if (!fileExists(fileName)) {
      skipped.push({ file: fileName, reason: "missing" });
      continue;
    }

    if (fileName.endsWith(".png")) {
      copyAsset(fileName, `images/${fileName}`);
      continue;
    }

    const { parsed, skipped: parseSkipped } = parseSpriteFile(fileName);
    skipped.push(...parseSkipped);
    for (const skippedChunk of parseSkipped) {
      try {
        const chunk = parseChunkedFile(fileName, "raw").find((candidate) => candidate.index === skippedChunk.chunk);
        if (chunk && isPng(chunk.buffer)) {
          const outName = `${path.basename(fileName, path.extname(fileName))}-chunk-${chunk.index}.png`;
          fs.writeFileSync(path.join(outDir, "images", outName), chunk.buffer);
          extractedImages.push({ source: fileName, chunk: chunk.index, file: `images/${outName}` });
        }
      } catch {
        // Keep this best-effort; the skipped entry above already records the parse failure.
      }
    }
    for (const { chunk, sprite } of parsed) {
      const paletteLimit = options.allPalettes ? sprite.paletteCount : Math.min(sprite.paletteCount, 1);
      for (let paletteI = 0; paletteI < paletteLimit; paletteI++) {
        sprite.modules.forEach((module, moduleI) => {
          images.push({
            id: `${fileName}#${chunk.index}:module:${moduleI}:palette:${paletteI}`,
            source: fileName,
            kind: "module",
            chunk: chunk.index,
            index: moduleI,
            palette: paletteI,
            image: module.palettes[paletteI],
          });
        });
        sprite.frames.forEach((frame, frameI) => {
          images.push({
            id: `${fileName}#${chunk.index}:frame:${frameI}:palette:${paletteI}`,
            source: fileName,
            kind: "frame",
            chunk: chunk.index,
            index: frameI,
            palette: paletteI,
            bbox: frame.bbox,
            image: frame.palettes[paletteI],
          });
        });
      }
    }
  }

  const { atlas } = packAtlas(images, options.maxWidth || 2048, options.padding || 1);
  const pngName = `${name}.png`;
  const jsonName = `${name}.json`;
  fs.writeFileSync(path.join(outDir, "atlases", pngName), encodePNG(atlas));
  writeJSON(path.join("atlases", jsonName), {
    image: pngName,
    width: atlas.width,
    height: atlas.height,
    frames: images.map(imageMeta),
    skipped,
    extractedImages,
  });

  return { name, imageCount: images.length, skippedCount: skipped.length };
}

function isPng(buffer) {
  return buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
}

function parseStages(fileName, worldId) {
  const buffer = readAsset(fileName);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let ptr = 0;
  const magic = view.getUint8(ptr++);
  if (magic !== 0x01) throw new Error(`${fileName}: stage magic mismatch`);
  const stageCount = view.getUint8(ptr++);
  const stages = [];

  for (let i = 0; i < stageCount; i++) {
    const width = view.getUint16(ptr, true);
    ptr += 2;
    const height = view.getUint16(ptr, true);
    ptr += 2;
    const size = width * height;
    const player = Array.from(u8(buffer.subarray(ptr, ptr + size)));
    ptr += size;
    const background = Array.from(u8(buffer.subarray(ptr, ptr + size)));
    ptr += size;
    const foreground = Array.from(u8(buffer.subarray(ptr, ptr + size)));
    ptr += size;

    stages.push({ id: i, width, height, layers: { background, player, foreground } });
  }

  return { world: worldId, source: fileName, stages };
}

function parseWorldMap(fileName, worldId) {
  const buffer = readAsset(fileName);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let ptr = 0;
  const dataLength = view.getUint16(ptr, true) + 1;
  ptr += 2;
  const end = ptr + dataLength;
  const pointCount = view.getUint8(ptr++);
  const points = [];
  const paths = [];

  for (let i = 0; i < pointCount && ptr < end; i++) {
    const point = {
      id: i,
      x: view.getUint8(ptr++),
      y: view.getUint8(ptr++),
      secret: !!view.getUint8(ptr++),
      stageId: view.getUint8(ptr++),
      paths: [],
    };
    const pathCount = view.getUint8(ptr++);
    for (let j = 0; j < pathCount; j++) {
      const target = { x: view.getUint8(ptr++), y: view.getUint8(ptr++) };
      point.paths.push(target);
      paths.push({ from: { x: point.x, y: point.y }, to: target });
    }
    points.push(point);
  }

  return { world: worldId, source: fileName, points, paths };
}

function parseTextFile(fileName) {
  const buffer = readAsset(fileName);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false });
  const texts = [];
  let ptr = 0;
  const count = view.getUint16(ptr) >> 1;

  while (texts.length < count && ptr + 1 < view.byteLength) {
    const address = view.getUint16(ptr);
    ptr += 2;
    if (address + 2 > view.byteLength) break;
    const length = view.getUint16(address);
    if (address + 2 + length > view.byteLength) break;
    texts.push(decoder.decode(buffer.subarray(address + 2, address + 2 + length)));
  }

  return { source: fileName, texts };
}

function parseTexts() {
  const files = fs.readdirSync(sourceDir).filter((file) => file.startsWith("lang.")).sort();
  const result = {};
  const skipped = [];
  for (const fileName of files) {
    try {
      result[fileName] = parseTextFile(fileName).texts;
    } catch (error) {
      skipped.push({ file: fileName, reason: error.message });
    }
  }

  if (fileExists("tips.f")) {
    try {
      result["tips.f"] = parseTextFile("tips.f").texts;
    } catch (error) {
      skipped.push({ file: "tips.f", reason: error.message });
    }
  }

  return { languages: result, skipped };
}

function worldIndex(worldId) {
  return worlds.findIndex((world) => world.id === worldId);
}

function atlasNameForSource(world, source) {
  return source === world.tileFile ? `tiles-${world.id}` : "objects";
}

function frameRef(world, source, chunk, kind, index, palette, name) {
  return {
    name,
    atlas: atlasNameForSource(world, source),
    source,
    frameId: `${source}#${chunk}:${kind}:${index}:palette:${palette}`,
  };
}

function moduleRef(world, source, chunk, index, palette, name) {
  return frameRef(world, source, chunk, "module", index, palette, name);
}

function spriteFrameRef(world, source, chunk, index, palette, name) {
  return frameRef(world, source, chunk, "frame", index, palette, name);
}

function loadAtlasFrameIndexes() {
  const indexes = new Map();
  const atlasDir = path.join(outDir, "atlases");
  if (!fs.existsSync(atlasDir)) return indexes;

  for (const fileName of fs.readdirSync(atlasDir)) {
    if (!fileName.endsWith(".json")) continue;
    const atlasName = path.basename(fileName, ".json");
    const atlas = JSON.parse(fs.readFileSync(path.join(atlasDir, fileName), "utf8"));
    for (const frame of atlas.frames || []) {
      indexes.set(`${atlasName}:${frame.id}`, {
        atlas: atlasName,
        image: atlas.image,
        frameId: frame.id,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      });
    }
  }

  return indexes;
}

function atlasFrameSize(ref, atlasIndexes) {
  const frame = atlasIndexes.get(`${ref.atlas}:${ref.frameId}`);
  return frame ? { width: frame.width, height: frame.height } : { width: 24, height: 24 };
}

function drawOp(ref, atlasIndexes, layer, dx = 0, dy = 0, options = {}) {
  const frame = atlasIndexes.get(`${ref.atlas}:${ref.frameId}`);
  return {
    layer,
    asset: ref.name,
    atlas: ref.atlas,
    frameId: ref.frameId,
    x: frame ? frame.x : undefined,
    y: frame ? frame.y : undefined,
    width: frame ? frame.width : undefined,
    height: frame ? frame.height : undefined,
    dx,
    dy,
    z: options.z,
    note: options.note,
  };
}

function centeredOffset(ref, atlasIndexes) {
  const size = atlasFrameSize(ref, atlasIndexes);
  return {
    dx: Math.floor(-(size.width - 24) / 2),
    dy: Math.floor(-(size.height - 24) / 2),
  };
}

function buildStageAssetCatalog(world) {
  const wi = worldIndex(world.id);
  const refs = {
    background: moduleRef(world, world.tileFile, 3, 0, 0, "background"),
    boulder: moduleRef(world, world.tileFile, 0, 0, 0, "boulder"),
    leaf: moduleRef(world, world.tileFile, 1, 0, 0, "leaf"),
    checkpoint: spriteFrameRef(world, "cm.f", 6, 0, 0, "checkpoint"),
    gemViolet: spriteFrameRef(world, "cm.f", 2, 0, 0, "gem-violet"),
    gemRed: spriteFrameRef(world, "cm.f", 2, 0, 1, "gem-red"),
    fireSpitterLeft: spriteFrameRef(world, "gen0.f", 9, 0, 0, "fire-spitter-left"),
    fireSpitterRight: spriteFrameRef(world, "gen0.f", 9, 1, 0, "fire-spitter-right"),
    beans: moduleRef(world, "gen0.f", 7, 0, wi === 2 ? 1 : 0, "beans"),
    pressurePlate: moduleRef(world, "gen2.f", 9, 0, 0, "pressure-plate"),
    mysticMallet: moduleRef(world, "gen1.f", 9, 0, 0, "mystic-mallet"),
    grippingHook: moduleRef(world, "gen1.f", 9, 1, 0, "gripping-hook"),
    freezeMallet: moduleRef(world, "gen1.f", 9, 2, 0, "freeze-mallet"),
    mysticPotion: moduleRef(world, "gen2.f", 7, 0, 0, "mystic-potion"),
    exitLeft: moduleRef(world, "cm.f", 0, 1, 0, "exit-left"),
    exitRight: moduleRef(world, "cm.f", 0, 0, 0, "exit-right"),
    magicPadlock: spriteFrameRef(world, "cm.f", 5, 0, 0, "magic-padlock"),
    doorHead: spriteFrameRef(world, "cm.f", 1, 0, wi, "door-head"),
    doorBottom: spriteFrameRef(world, "cm.f", 1, 3, wi, "door-bottom"),
    chestRed: spriteFrameRef(world, "gen2.f", 2, 0, 0, "chest-red"),
    chestBrown: spriteFrameRef(world, "gen3.f", 3, 0, 0, "chest-brown"),
    goldKey: moduleRef(world, "gen0.f", 2, 0, 0, "gold-key"),
    silverKey: moduleRef(world, "gen0.f", 2, 0, 1, "silver-key"),
    oneUp: moduleRef(world, "cm.f", 4, 0, 0, "one-up"),
    revivePotion: moduleRef(world, "cm.f", 4, 1, 0, "revive-potion"),
    goldKeyhole: spriteFrameRef(world, "gen2.f", 8, 0, 0, "gold-keyhole"),
    silverKeyhole: spriteFrameRef(world, "gen2.f", 8, 0, 1, "silver-keyhole"),
    fireball: moduleRef(world, "gen1.f", 4, 0, 0, "fireball"),
    fireCrystal: spriteFrameRef(world, "mmv.f", 3, 0, 0, "fire-crystal"),
    silverDiamond: spriteFrameRef(world, "mmv.f", 2, 0, 0, "silver-diamond"),
    iceCrystal: spriteFrameRef(world, "mmv.f", 1, 0, 0, "ice-crystal"),
    compass: moduleRef(world, "gen3.f", 1, 0, 0, "compass"),
    spikeTopHead: spriteFrameRef(world, "gen1.f", 1, 0, 0, "spike-top-head"),
    spikeTopStick: spriteFrameRef(world, "gen1.f", 1, 1, 0, "spike-top-stick"),
    spikeBottomHead: spriteFrameRef(world, "gen1.f", 1, 3, 0, "spike-bottom-head"),
    spikeBottomStick: spriteFrameRef(world, "gen1.f", 1, 2, 0, "spike-bottom-stick"),
    knightRight: spriteFrameRef(world, "gen1.f", 3, 0, 0, "knight-right"),
    knightLeft: spriteFrameRef(world, "gen1.f", 3, 1, 0, "knight-left"),
    spikeBall: moduleRef(world, "gen1.f", 2, 2, 0, "spike-ball"),
    trapdoorRed: spriteFrameRef(world, "gen2.f", 4, 4, 0, "trapdoor-red"),
    trapdoorBlue: spriteFrameRef(world, "gen2.f", 4, 0, 1, "trapdoor-blue"),
    trapdoorSwitch: spriteFrameRef(world, "gen3.f", 9, 0, 0, "trapdoor-switch"),
    torchUnlit: spriteFrameRef(world, "gen0.f", 8, 0, 0, "torch-unlit"),
    torchLit: spriteFrameRef(world, "gen0.f", 8, 1, 0, "torch-lit"),
    bomb: spriteFrameRef(world, "gen0.f", 5, 0, 0, "bomb"),
    bombCloth: moduleRef(world, "gen2.f", 5, 0, 0, "bomb-cloth"),
    sewer: spriteFrameRef(world, "gen0.f", 6, 0, 0, "sewer"),
    icicle: spriteFrameRef(world, "gen3.f", 4, 0, 0, "icicle"),
    icicleBroken: spriteFrameRef(world, "gen3.f", 4, 3, 0, "icicle-broken"),
    monkey: spriteFrameRef(world, "gen3.f", 5, 1, 0, "monkey"),
    wasp: spriteFrameRef(world, "gen3.f", 7, 12, 0, "wasp"),
    fanPot: spriteFrameRef(world, "gen2.f", 3, 0, 0, "fan-pot"),
    fanPotAir: spriteFrameRef(world, "gen2.f", 3, 5, 0, "fan-pot-air"),
    iceLaserShooterLeft: spriteFrameRef(world, "gen3.f", 2, 0, 0, "ice-laser-shooter-left"),
    iceLaserShooterRight: spriteFrameRef(world, "gen3.f", 2, 1, 0, "ice-laser-shooter-right"),
  };

  refs.snakeNormalDown = wi === 0
    ? spriteFrameRef(world, "gen1.f", 5, 6, 0, "snake-normal-down")
    : wi === 1
      ? spriteFrameRef(world, "gen1.f", 7, 0, 0, "snake-normal-down")
      : spriteFrameRef(world, "gen1.f", 5, 6, 2, "snake-normal-down");
  refs.snakeRedDown = wi === 0
    ? spriteFrameRef(world, "gen1.f", 5, 6, 1, "snake-red-down")
    : spriteFrameRef(world, "gen1.f", 7, 0, 1, "snake-red-down");
  refs.snakeNormalRight = wi === 0
    ? spriteFrameRef(world, "gen1.f", 5, 15, 0, "snake-normal-right")
    : wi === 1
      ? spriteFrameRef(world, "gen1.f", 7, 0, 0, "snake-normal-right")
      : spriteFrameRef(world, "gen1.f", 5, 15, 2, "snake-normal-right");
  refs.snakeRedRight = wi === 0
    ? spriteFrameRef(world, "gen1.f", 5, 15, 1, "snake-red-right")
    : spriteFrameRef(world, "gen1.f", 7, 0, 1, "snake-red-right");

  if (wi === 0) {
    refs.decoration20 = spriteFrameRef(world, "gen0.f", 4, 0, 0, "decoration-top-left");
    refs.decoration21 = spriteFrameRef(world, "gen0.f", 4, 2, 0, "decoration-top-right");
    refs.decoration22 = spriteFrameRef(world, "gen0.f", 4, 4, 0, "decoration-bottom-left");
    refs.decoration23 = spriteFrameRef(world, "gen0.f", 4, 6, 0, "decoration-bottom-right");
    refs.greatAnacondaHead = spriteFrameRef(world, "b0.f", 0, 6, 0, "great-anaconda-head");
    refs.greatAnacondaBlockUp = spriteFrameRef(world, "b0.f", 1, 0, 0, "great-anaconda-block-up");
    refs.greatAnacondaBlockDown = spriteFrameRef(world, "b0.f", 1, 1, 0, "great-anaconda-block-down");
  } else if (wi === 1) {
    refs.decoration20 = spriteFrameRef(world, "gen2.f", 1, 4, 0, "decoration-top-left");
    refs.decoration21 = spriteFrameRef(world, "gen2.f", 1, 6, 0, "decoration-top-right");
    refs.decoration22 = spriteFrameRef(world, "gen2.f", 1, 0, 0, "decoration-bottom-left");
    refs.decoration23 = spriteFrameRef(world, "gen2.f", 1, 2, 0, "decoration-bottom-right");
  } else {
    refs.decoration20 = refs.magicPadlock;
    refs.decoration21 = refs.magicPadlock;
    refs.decoration22 = refs.magicPadlock;
    refs.decoration23 = refs.magicPadlock;
    refs.turtleDown = spriteFrameRef(world, "gen4.f", 1, 5, 0, "turtle-down");
    refs.turtleUp = spriteFrameRef(world, "gen4.f", 1, 1, 0, "turtle-up");
  }

  return refs;
}

function wallTileRef(world, value) {
  return spriteFrameRef(world, world.tileFile, 2, value - 80, 0, `wall-${value}`);
}

function buildDrawStackForTriple(world, triple, atlasIndexes) {
  const wi = worldIndex(world.id);
  const refs = buildStageAssetCatalog(world);
  const block = triple.blocks;
  const data = triple.data;
  const specifyingData = triple.specifying_data;
  const draws = [];
  const labels = [];
  const notes = [];
  let backgroundRef = null;
  let playerRef = null;
  let foregroundRef = null;
  let dX2 = 0;
  let dY2 = 0;
  let dX3 = 0;
  let dY3 = 0;
  let unknown = false;

  if (specifyingData === 99 || specifyingData === 255) backgroundRef = refs.background;
  else unknown = true;

  switch (block) {
    case 0: playerRef = refs.boulder; break;
    case 1: playerRef = refs.gemViolet; break;
    case 8: playerRef = refs.bomb; break;
    case 10: playerRef = refs.leaf; break;
    case 11: playerRef = refs.fireball; break;
    case 18: playerRef = refs.trapdoorSwitch; break;
    case 22: playerRef = refs.fireSpitterRight; break;
    case 23: playerRef = refs.fireSpitterLeft; break;
    case 30: playerRef = refs.beans; break;
    case 34: playerRef = refs.trapdoorBlue; break;
    case 35: playerRef = refs.trapdoorRed; break;
    case 37: playerRef = refs.bombCloth; break;
    case 44: playerRef = refs.icicle; break;
    case 45:
      playerRef = refs.monkey;
      ({ dx: dX2, dy: dY2 } = centeredOffset(playerRef, atlasIndexes));
      break;
    case 46:
      playerRef = refs.wasp;
      ({ dx: dX2, dy: dY2 } = centeredOffset(playerRef, atlasIndexes));
      break;
    case 47:
      playerRef = refs.fanPot;
      notes.push("Fan pot can emit fan-pot-air above this cell until blocked; this depends on neighbouring cells, not only this triple.");
      break;
    case 79:
      backgroundRef = refs.background;
      if (data !== 4) labels.push({ layer: "foreground", text: "SPP", meaning: "spawn point" });
      draws.push(drawOp(refs.doorHead, atlasIndexes, "foreground", -48, -24, { z: 2, note: "spawn-door-head" }));
      draws.push(drawOp(refs.doorBottom, atlasIndexes, "foreground", -48, 0, { z: 2, note: "spawn-door-bottom" }));
      break;
    case 255:
      break;
    default:
      if (block >= 80 && block <= 146) playerRef = wallTileRef(world, block);
      else unknown = true;
  }

  switch (data) {
    case 20: foregroundRef = refs.decoration20; break;
    case 21: foregroundRef = refs.decoration21; break;
    case 22: foregroundRef = refs.decoration22; break;
    case 23: foregroundRef = refs.decoration23; break;
    case 34: playerRef = refs.icicleBroken; break;
    case 255:
      break;
    default:
      if (data >= 80 && data <= 146) {
        foregroundRef = wallTileRef(world, data);
        if (wi === 0 && data === 117) {
          dX3 = 9; dY3 = 2;
        } else if (wi === 0 && data === 118) {
          dY3 = 1;
        } else if (wi === 1 && data === 117) {
          dY3 = 4;
        } else if (wi === 1 && data === 120) {
          dX3 = 2; dY3 = 4;
        } else if (wi === 1 && (data === 139 || data === 140)) {
          dX3 = 1;
        } else if (wi === 1 && data === 121) {
          dX3 = 2;
        } else if (wi === 1 && data === 122) {
          dY3 = 2;
        }
      } else {
        unknown = true;
      }
  }

  if (data === 4) {
    backgroundRef = refs.background;
    playerRef = refs.checkpoint;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "checkpoint index from specifying_data" });
  } else if (block === 43 && specifyingData === 0 && refs.greatAnacondaHead) {
    backgroundRef = refs.background;
    playerRef = null;
    draws.push(drawOp(refs.greatAnacondaHead, atlasIndexes, "foreground+1", ...Object.values(centeredOffset(refs.greatAnacondaHead, atlasIndexes)), { z: 3 }));
    draws.push(drawOp(refs.greatAnacondaBlockDown, atlasIndexes, "player", 24 * 9, -24 * 3, { z: 1 }));
    draws.push(drawOp(refs.greatAnacondaBlockDown, atlasIndexes, "player", 24 * 12, -24 * 3, { z: 1 }));
    draws.push(drawOp(refs.greatAnacondaBlockDown, atlasIndexes, "player", 24 * 15, -24 * 3, { z: 1 }));
    draws.push(drawOp(refs.greatAnacondaBlockUp, atlasIndexes, "player", 24 * 9, -24 * 9, { z: 1 }));
    draws.push(drawOp(refs.greatAnacondaBlockUp, atlasIndexes, "player", 24 * 12, -24 * 9, { z: 1 }));
    draws.push(drawOp(refs.greatAnacondaBlockUp, atlasIndexes, "player", 24 * 15, -24 * 9, { z: 1 }));
  } else if (block === 19 || block === 43) {
    const vertical = specifyingData === 1 || specifyingData === 3;
    const isRed = block === 43;
    backgroundRef = refs.background;
    playerRef = vertical
      ? (isRed ? refs.snakeRedDown : refs.snakeNormalDown)
      : (isRed ? refs.snakeRedRight : refs.snakeNormalRight);
    ({ dx: dX2, dy: dY2 } = centeredOffset(playerRef, atlasIndexes));
    if (wi !== 1 && vertical) dY2 *= 2;
    if (wi === 1) labels.push({ layer: "foreground", text: vertical ? "V" : "H", meaning: "snake orientation" });
  } else if (data === 6) {
    backgroundRef = refs.background;
    playerRef = refs.pressurePlate;
    dY2 = 12;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "pressure plate door index from specifying_data" });
  } else if (data === 2) {
    backgroundRef = refs.background;
    playerRef = specifyingData === 0 ? refs.mysticMallet : specifyingData === 1 ? refs.grippingHook : specifyingData === 2 ? refs.freezeMallet : null;
    if (!playerRef) unknown = true;
  } else if (data === 5 || data === 28) {
    backgroundRef = refs.background;
    playerRef = specifyingData === 2 ? refs.exitRight : refs.exitLeft;
    if (data === 28) labels.push({ layer: "foreground", text: "SECRET", meaning: "secret exit" });
  } else if (block === 12) {
    backgroundRef = refs.background;
    playerRef = refs.magicPadlock;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "required purple gem count from specifying_data" });
  } else if (data === 33 || data === 14) {
    backgroundRef = refs.background;
    foregroundRef = data === 14 ? refs.chestRed : refs.chestBrown;
    dY3 = 2;
    const chestContents = {
      2: refs.gemRed,
      4: refs.goldKey,
      5: refs.silverKey,
      6: refs.oneUp,
      7: refs.gemViolet,
      24: refs.mysticMallet,
      26: refs.freezeMallet,
      27: refs.grippingHook,
      40: refs.mysticPotion,
      41: refs.gemViolet,
      42: refs.compass,
      51: refs.silverDiamond,
      52: refs.iceCrystal,
      53: refs.fireCrystal,
    };
    if (chestContents[block]) {
      const contentDy = [51, 52, 53].includes(block) ? -8 : [40, 42].includes(block) ? -8 : [5, 27].includes(block) ? -3 : -6;
      const contentDx = [51, 52, 53].includes(block) ? -2 : [4, 5].includes(block) ? 1 : 0;
      draws.push(drawOp(chestContents[block], atlasIndexes, "foreground+1", contentDx, contentDy, { z: 3, note: "visible chest contents" }));
      if (block === 7 || block === 41) labels.push({ layer: "foreground+1", text: String(block === 7 ? 10 : specifyingData), meaning: "violet gem amount" });
    } else {
      labels.push({ layer: "foreground+1", text: "???", meaning: "unknown chest contents" });
      unknown = true;
    }
  } else if (data === 8 || data === 9) {
    backgroundRef = refs.background;
    playerRef = data === 9 ? refs.goldKeyhole : refs.silverKeyhole;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "keyhole door index from specifying_data" });
  } else if (data === 17) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "DEL", meaning: "defeat everyone label" });
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "defeat everyone group index" });
  } else if (data === 26) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "DET", meaning: "defeat everyone trigger" });
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "defeat everyone group index" });
  } else if (specifyingData === 30 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX1", meaning: "scripted text trigger" });
  } else if (data === 7) {
    backgroundRef = refs.background;
    playerRef = refs.doorBottom;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "door index from specifying_data" });
    notes.push("Door head is drawn above this cell when the cell above is not a keyhole.");
  } else if (data === 1) {
    labels.push({ layer: "foreground", text: "SHK", meaning: "shake up/down animation trigger" });
  } else if (specifyingData === 3 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "FSF", meaning: "fire statues fall animation trigger" });
  } else if (specifyingData === 33 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX2", meaning: "scripted text trigger" });
  } else if (specifyingData === 29 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX3", meaning: "scripted text trigger" });
  } else if (specifyingData === 10 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX4", meaning: "scripted text trigger" });
  } else if (specifyingData === 13 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX5", meaning: "scripted text trigger" });
  } else if (specifyingData === 16 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX6", meaning: "scripted text trigger" });
  } else if (specifyingData === 28 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX7", meaning: "scripted text trigger" });
  } else if (specifyingData === 34 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX8", meaning: "scripted text trigger" });
  } else if (specifyingData === 35 && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "TX9", meaning: "scripted text trigger" });
  } else if (block === 28) {
    const facingDown = specifyingData === 3 || specifyingData === 33;
    backgroundRef = refs.background;
    playerRef = facingDown ? refs.spikeTopStick : refs.spikeBottomStick;
    dX2 = 5;
    draws.push(drawOp(facingDown ? refs.spikeTopHead : refs.spikeBottomHead, atlasIndexes, "player", 2, 24 * (facingDown ? 1 : -1), { z: 2 }));
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "spike direction/timing data" });
  } else if (block === 16 && (specifyingData === 2 || specifyingData === 4)) {
    const left = specifyingData === 4;
    backgroundRef = refs.background;
    playerRef = left ? refs.knightLeft : refs.knightRight;
    dX2 = left ? -4 : -6;
    dY2 = -24;
  } else if (block === 14 && (specifyingData === 2 || specifyingData === 4 || specifyingData === 255)) {
    backgroundRef = refs.background;
    playerRef = refs.spikeBall;
    labels.push({ layer: "foreground", text: specifyingData === 4 ? "L" : "R", meaning: "spike ball direction" });
  } else if ((specifyingData === 4 || specifyingData === 6 || specifyingData === 19) && data === 0) {
    backgroundRef = refs.background;
    labels.push({ layer: "foreground", text: "SOA", meaning: "scene overview animation trigger" });
  } else if (block === 36 && (specifyingData === 0 || specifyingData === 255)) {
    const unlit = specifyingData === 0 || specifyingData === 255;
    backgroundRef = refs.background;
    playerRef = unlit ? refs.torchUnlit : refs.torchLit;
    dY2 = unlit ? -10 : -22;
  } else if (block === 38) {
    backgroundRef = refs.background;
    playerRef = refs.sewer;
    labels.push({ layer: "foreground", text: String(specifyingData), meaning: "sewer water block count from specifying_data" });
  } else if (block === 33) {
    playerRef = null;
    labels.push({ layer: "foreground", text: "NFB", meaning: "fireball stopper" });
  } else if (block === 31) {
    playerRef = null;
    labels.push({ layer: "foreground", text: "NPB", meaning: "player stopper" });
  } else if (block === 49 && refs.turtleUp) {
    backgroundRef = refs.background;
    playerRef = specifyingData === 1 ? refs.turtleDown : refs.turtleUp;
    ({ dx: dX2, dy: dY2 } = centeredOffset(playerRef, atlasIndexes));
    if (specifyingData === 2 || specifyingData === 4) labels.push({ layer: "foreground", text: specifyingData === 2 ? "L" : "R", meaning: "turtle direction" });
  } else if (block === 48 && (specifyingData === 2 || specifyingData === 4 || specifyingData === 255)) {
    const left = specifyingData === 4;
    backgroundRef = refs.background;
    playerRef = left ? refs.iceLaserShooterLeft : refs.iceLaserShooterRight;
    dY2 = -23;
  }

  const knownSpecial =
    data === 4 ||
    (block === 43 && specifyingData === 0 && !!refs.greatAnacondaHead) ||
    block === 19 ||
    block === 43 ||
    data === 6 ||
    (data === 2 && [0, 1, 2].includes(specifyingData)) ||
    data === 5 ||
    data === 28 ||
    block === 12 ||
    data === 33 ||
    data === 14 ||
    data === 8 ||
    data === 9 ||
    data === 17 ||
    data === 26 ||
    data === 7 ||
    data === 1 ||
    (data === 0 && [3, 4, 6, 10, 13, 16, 19, 28, 29, 30, 33, 34, 35].includes(specifyingData)) ||
    block === 28 ||
    (block === 16 && (specifyingData === 2 || specifyingData === 4)) ||
    (block === 14 && (specifyingData === 2 || specifyingData === 4 || specifyingData === 255)) ||
    (block === 36 && (specifyingData === 0 || specifyingData === 255)) ||
    block === 38 ||
    block === 33 ||
    block === 31 ||
    (block === 49 && !!refs.turtleUp) ||
    (block === 48 && (specifyingData === 2 || specifyingData === 4 || specifyingData === 255));
  if (knownSpecial) unknown = false;

  if (backgroundRef) draws.push(drawOp(backgroundRef, atlasIndexes, "background", 0, 0, { z: 0 }));
  if (playerRef) draws.push(drawOp(playerRef, atlasIndexes, "player", dX2, dY2, { z: 1 }));
  if (foregroundRef) draws.push(drawOp(foregroundRef, atlasIndexes, "foreground", dX3, dY3, { z: 2 }));

  return { draws, labels, notes, unknown };
}

function buildStageRenderMap(world, stagesData, atlasIndexes) {
  const tripleCounts = new Map();
  for (const stage of stagesData.stages) {
    const total = stage.width * stage.height;
    for (let i = 0; i < total; i++) {
      const triple = {
        blocks: stage.layers.player[i],
        data: stage.layers.foreground[i],
        specifying_data: stage.layers.background[i],
      };
      const key = `${triple.blocks}/${triple.data}/${triple.specifying_data}`;
      const current = tripleCounts.get(key) || { ...triple, key, occurrences: 0, stages: new Set() };
      current.occurrences++;
      current.stages.add(stage.id);
      tripleCounts.set(key, current);
    }
  }

  const triples = Array.from(tripleCounts.values())
    .sort((a, b) => a.blocks - b.blocks || a.data - b.data || a.specifying_data - b.specifying_data)
    .map((entry) => {
      const { draws, labels, notes, unknown } = buildDrawStackForTriple(world, entry, atlasIndexes);
      return {
        key: entry.key,
        blocks: entry.blocks,
        data: entry.data,
        specifying_data: entry.specifying_data,
        exportedLayerValues: {
          player: entry.blocks,
          foreground: entry.data,
          background: entry.specifying_data,
        },
        occurrences: entry.occurrences,
        stages: Array.from(entry.stages).sort((a, b) => a - b),
        unknown,
        draws,
        labels,
        notes,
      };
    });

  return {
    world: world.id,
    source: world.stageFile,
    tileSize: 24,
    keyFormat: "blocks/data/specifying_data",
    layerAliases: {
      blocks: "stages-*.json layers.player",
      data: "stages-*.json layers.foreground",
      specifying_data: "stages-*.json layers.background",
    },
    atlasLookup: "Use draw.atlas + draw.frameId, or draw.x/y/width/height directly when present.",
    triples,
    unknownTriples: triples.filter((triple) => triple.unknown).map((triple) => triple.key),
  };
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  ensureDir(outDir);
  ensureDir(path.join(outDir, "atlases"));
  ensureDir(path.join(outDir, "data"));
  ensureDir(path.join(outDir, "audio"));
  ensureDir(path.join(outDir, "images"));

  const manifest = {
    sourceDir,
    generatedAt: new Date().toISOString(),
    exports: [],
  };

  const stagesByWorld = new Map();
  for (const world of worlds) {
    const stages = parseStages(world.stageFile, world.id);
    stagesByWorld.set(world.id, stages);
    writeJSON(path.join("data", `stages-${world.id}.json`), stages);
    manifest.exports.push({ type: "stages", world: world.id, file: `data/stages-${world.id}.json`, count: stages.stages.length });

    const map = parseWorldMap(world.mapFile, world.id);
    writeJSON(path.join("data", `world-map-${world.id}.json`), map);
    manifest.exports.push({ type: "world-map", world: world.id, file: `data/world-map-${world.id}.json`, count: map.points.length });

    const atlas = exportAtlas(`tiles-${world.id}`, [world.tileFile], { allPalettes: true });
    manifest.exports.push({ type: "atlas", role: "tiles", world: world.id, file: `atlases/tiles-${world.id}.json`, ...atlas });
  }

  const objects = exportAtlas("objects", objectFiles, { allPalettes: true });
  manifest.exports.push({ type: "atlas", role: "objects", file: "atlases/objects.json", ...objects });

  const ui = exportAtlas("ui", uiFiles, { allPalettes: true });
  manifest.exports.push({ type: "atlas", role: "ui", file: "atlases/ui.json", ...ui });

  const atlasIndexes = loadAtlasFrameIndexes();
  for (const world of worlds) {
    const renderMap = buildStageRenderMap(world, stagesByWorld.get(world.id), atlasIndexes);
    writeJSON(path.join("data", `stage-render-map-${world.id}.json`), renderMap);
    manifest.exports.push({
      type: "stage-render-map",
      world: world.id,
      file: `data/stage-render-map-${world.id}.json`,
      triples: renderMap.triples.length,
      unknownTriples: renderMap.unknownTriples.length,
    });
  }

  const texts = parseTexts();
  writeJSON(path.join("data", "texts.json"), texts);
  manifest.exports.push({ type: "texts", file: "data/texts.json", languages: Object.keys(texts.languages).length, skipped: texts.skipped.length });

  const audio = [];
  for (const fileName of ["snd.amr", "snd.f"]) {
    const copied = copyAsset(fileName, `audio/${fileName}`);
    if (copied) audio.push({ source: fileName, file: `audio/${fileName}` });
  }
  writeJSON(path.join("data", "audio.json"), { audio });
  manifest.exports.push({ type: "audio", file: "data/audio.json", count: audio.length });

  writeJSON("manifest.json", manifest);
  console.log(`Export complete: ${outDir}`);
  for (const item of manifest.exports) console.log("-", item);
}

main();
