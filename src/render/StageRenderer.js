import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

export const TILE_SIZE = 24;

function getStageCell(stage, x, y, index) {
  const blocks = stage.layers.player[index];
  const data = stage.layers.foreground[index];
  const specifying_data = stage.layers.background[index];
  return {
    x,
    y,
    blocks,
    data,
    specifying_data,
    key: [blocks, data, specifying_data].join("/"),
  };
}

function createFrameTexture(assets, draw, textureCache) {
  const cacheKey = `${draw.atlas}:${draw.frameId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const baseTexture = assets.textures[draw.atlas];
  if (!baseTexture) throw new Error(`Missing atlas texture: ${draw.atlas}`);

  const texture = new Texture({
    source: baseTexture.source,
    frame: new Rectangle(draw.x, draw.y, draw.width, draw.height),
    label: cacheKey,
  });

  textureCache.set(cacheKey, texture);
  return texture;
}

function addDraw(stageLayers, assets, draw, x, y, textureCache) {
  if (
    draw.x === undefined ||
    draw.y === undefined ||
    draw.width === undefined ||
    draw.height === undefined
  ) {
    return;
  }

  const layer = stageLayers[draw.layer] || stageLayers.foreground;
  const sprite = new Sprite({
    texture: createFrameTexture(assets, draw, textureCache),
    roundPixels: true,
  });
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.label = `${draw.asset}:${x}:${y}`;
  layer.addChild(sprite);
}

function addUnknownMarker(stageLayers, x, y) {
  const marker = new Graphics()
    .rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    .fill({ color: 0x000000, alpha: 0.9 })
    .stroke({ color: 0xff4060, width: 1, alpha: 0.9 });
  marker.label = `unknown:${x}:${y}`;
  stageLayers.debug.addChild(marker);
}

export function renderStage(stage, renderMap, assets, options = {}) {
  const stageRoot = new Container();
  const stageLayers = {
    background: new Container(),
    player: new Container(),
    foreground: new Container(),
    "foreground+1": new Container(),
    debug: new Container(),
  };

  stageRoot.addChild(
    stageLayers.background,
    stageLayers.player,
    stageLayers.foreground,
    stageLayers["foreground+1"],
    stageLayers.debug,
  );

  const renderRules = new Map(renderMap.triples.map((triple) => [triple.key, triple]));
  const textureCache = new Map();
  const unknownTriples = new Map();
  const unknownCells = [];

  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const index = x + y * stage.width;
      const cell = getStageCell(stage, x, y, index);
      const key = cell.key;
      const rule = renderRules.get(key);

      if (!rule) {
        unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
        unknownCells.push({ x, y, key, reason: "missing-rule" });
        if (options.highlightUnknown) addUnknownMarker(stageLayers, x, y);
        continue;
      }

      for (const draw of rule.draws) {
        if (options.skipDraw?.(draw, cell, rule)) continue;
        addDraw(stageLayers, assets, draw, x, y, textureCache);
      }
      if (rule.unknown) {
        unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
        unknownCells.push({ x, y, key, reason: "unknown-render-rule" });
        if (options.highlightUnknown) addUnknownMarker(stageLayers, x, y);
      }
    }
  }

  stageRoot.stagePixelWidth = stage.width * TILE_SIZE;
  stageRoot.stagePixelHeight = stage.height * TILE_SIZE;
  stageRoot.unknownTriples = unknownTriples;
  stageRoot.unknownCells = unknownCells;
  stageRoot.stageLayers = stageLayers;

  return stageRoot;
}
