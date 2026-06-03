import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";
import { syncDoorSprite } from "./doorSprite.js";
import { syncPlayerSprite } from "./playerSprite.js";

const LEAF_FRAME_MS = 45;
const LEAF_FRAME_COUNT = 7;

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

function createAtlasFrameTexture(assets, atlasId, frameId, textureCache) {
  const cacheKey = `${atlasId}:${frameId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const atlas = assets.atlases[atlasId];
  const frame = atlas?.frames.find((candidate) => candidate.id === frameId);
  const baseTexture = assets.textures[atlasId];
  if (!atlas || !baseTexture || !frame) return null;

  const texture = new Texture({
    source: baseTexture.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    label: cacheKey,
  });

  textureCache.set(cacheKey, texture);
  return texture;
}

function getLeafAnimationFrameId(draw, frameIndex) {
  const match = draw.frameId?.match(/^(.+#1:)(?:module|frame):\d+(:palette:\d+)$/);
  if (!match) return null;
  return `${match[1]}frame:${frameIndex}${match[2]}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function updateEntityRenderPosition(entity, now) {
  const duration = entity.moveDuration || 0;
  const hasMove = duration > 0 && entity.moveStartedAt > 0;
  const progress = hasMove ? clamp01((now - entity.moveStartedAt) / duration) : 1;

  entity.renderX = lerp(entity.prevX ?? entity.x, entity.x, progress);
  entity.renderY = lerp(entity.prevY ?? entity.y, entity.y, progress);
  if (progress >= 1) {
    entity.prevX = entity.x;
    entity.prevY = entity.y;
    if (entity.disappearAfterMove) {
      entity.active = false;
      entity.collected = true;
      entity.disappearAfterMove = false;
    }
  }
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
  sprite.entityTextureCache = textureCache;
  container.addChild(sprite);
  entity.sprites.push(sprite);
  if (!entity.sprite) entity.sprite = sprite;
}

function syncLeafSprite(assets, entity, sprite, now) {
  if (entity.type !== "leaf") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  if (!entity.vanishing) {
    if (sprite.entityAnimatedFrameId) {
      sprite.texture = createFrameTexture(assets, draw, sprite.entityTextureCache);
      sprite.entityAnimatedFrameId = null;
    }
    sprite.x = entity.x * TILE_SIZE + draw.dx;
    sprite.y = entity.y * TILE_SIZE + draw.dy;
    sprite.visible = entity.active;
    return true;
  }

  const elapsed = Math.max(0, now - entity.vanishStartedAt);
  const frameIndex = Math.floor(elapsed / LEAF_FRAME_MS) + 1;
  if (frameIndex > LEAF_FRAME_COUNT) {
    entity.active = false;
    entity.vanished = true;
    sprite.visible = false;
    return true;
  }

  const frameId = getLeafAnimationFrameId(draw, frameIndex);
  const texture = frameId
    ? createAtlasFrameTexture(assets, draw.atlas, frameId, sprite.entityTextureCache)
    : null;
  if (texture) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  sprite.x = entity.x * TILE_SIZE + Math.floor((TILE_SIZE - sprite.texture.width) / 2);
  sprite.y = entity.y * TILE_SIZE + Math.floor((TILE_SIZE - sprite.texture.height) / 2);
  sprite.visible = true;
  return true;
}

function alignEntitySprite(entity, sprite) {
  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  const x = entity.renderX ?? entity.x;
  const y = entity.renderY ?? entity.y;
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
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

export function syncLevelStateSprites(assets, levelState, now = Date.now()) {
  for (const entity of levelState.entities) {
    updateEntityRenderPosition(entity, now);
    const visible = entity.active && !entity.collected;
    for (const sprite of entity.sprites) {
      if (syncDoorSprite(assets, entity, sprite, now)) {
        sprite.visible = visible;
        continue;
      }
      if (syncLeafSprite(assets, entity, sprite, now)) continue;
      alignEntitySprite(entity, sprite);
      sprite.visible = visible;
    }
  }

  syncPlayerSprite(assets, levelState.player, now);
}
