import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";

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

function addEntityDraw(container, assets, entity, draw, textureCache) {
  if (
    draw.asset === "background" ||
    draw.x === undefined ||
    draw.y === undefined ||
    draw.width === undefined ||
    draw.height === undefined
  ) {
    return;
  }

  const sprite = new Sprite({
    texture: createFrameTexture(assets, draw, textureCache),
    roundPixels: true,
  });
  sprite.x = entity.x * TILE_SIZE + draw.dx;
  sprite.y = entity.y * TILE_SIZE + draw.dy;
  sprite.label = `${entity.id}:${draw.asset}`;
  container.addChild(sprite);
}

export function createEntityLayers(assets, classification) {
  const itemLayer = new Container();
  const actorLayer = new Container();
  const effectLayer = new Container();
  const textureCache = new Map();

  itemLayer.label = "items";
  actorLayer.label = "actors";
  effectLayer.label = "effects";

  for (const entity of classification.entities) {
    for (const draw of entity.draws) addEntityDraw(itemLayer, assets, entity, draw, textureCache);
  }

  return {
    itemLayer,
    actorLayer,
    effectLayer,
  };
}
