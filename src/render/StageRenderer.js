import { Container, Rectangle, Sprite, Texture } from "pixi.js";

export const TILE_SIZE = 24;

function getStageTriple(stage, index) {
  return [
    stage.layers.player[index],
    stage.layers.foreground[index],
    stage.layers.background[index],
  ].join("/");
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

export function renderStage(stage, renderMap, assets) {
  const stageRoot = new Container();
  const stageLayers = {
    background: new Container(),
    player: new Container(),
    foreground: new Container(),
    "foreground+1": new Container(),
  };

  stageRoot.addChild(
    stageLayers.background,
    stageLayers.player,
    stageLayers.foreground,
    stageLayers["foreground+1"],
  );

  const renderRules = new Map(renderMap.triples.map((triple) => [triple.key, triple]));
  const textureCache = new Map();
  const unknownTriples = new Map();

  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const index = x + y * stage.width;
      const key = getStageTriple(stage, index);
      const rule = renderRules.get(key);

      if (!rule) {
        unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
        continue;
      }

      for (const draw of rule.draws) addDraw(stageLayers, assets, draw, x, y, textureCache);
      if (rule.unknown) unknownTriples.set(key, (unknownTriples.get(key) || 0) + 1);
    }
  }

  stageRoot.stagePixelWidth = stage.width * TILE_SIZE;
  stageRoot.stagePixelHeight = stage.height * TILE_SIZE;
  stageRoot.unknownTriples = unknownTriples;

  return stageRoot;
}
