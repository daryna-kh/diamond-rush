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
  sprite.entityDraw = draw;
  container.addChild(sprite);
  entity.sprites.push(sprite);
  if (!entity.sprite) entity.sprite = sprite;
}

export function createEntityLayers(assets, levelState) {
  const itemLayer = new Container();
  const actorLayer = new Container();
  const effectLayer = new Container();
  const textureCache = new Map();

  itemLayer.label = "itemLayer";
  actorLayer.label = "actorLayer";
  effectLayer.label = "effectLayer";

  for (const entity of levelState.entities) {
    for (const draw of entity.draws) addEntityDraw(itemLayer, assets, entity, draw, textureCache);
  }

  return {
    itemLayer,
    actorLayer,
    effectLayer,
  };
}

export function syncLevelStateSprites(levelState) {
  for (const entity of levelState.entities) {
    const visible = entity.active && !entity.collected;
    for (const sprite of entity.sprites) {
      const draw = sprite.entityDraw || { dx: 0, dy: 0 };
      sprite.x = entity.x * TILE_SIZE + draw.dx;
      sprite.y = entity.y * TILE_SIZE + draw.dy;
      sprite.visible = visible;
    }
  }

  if (levelState.player.sprite) {
    levelState.player.sprite.x = levelState.player.x * TILE_SIZE;
    levelState.player.sprite.y =
      levelState.player.y * TILE_SIZE + TILE_SIZE - levelState.player.sprite.texture.height;
  }
}
