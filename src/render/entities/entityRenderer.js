import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import {
  CHEST_BROWN_CLOSED_FRAME_ID,
  CHEST_BROWN_FRAME_MS,
  CHEST_BROWN_OPEN_FRAMES,
  LEAF_FRAME_COUNT,
  LEAF_FRAME_MS,
} from "../../game/entityAnimations.js";
import { syncDoorSprite } from "../../game/doorSprite.js";
import { syncPlayerSprite } from "../../game/playerSprite.js";
import { TILE_SIZE } from "../StageRenderer.js";
import {
  FIRE_SPITTER_FRAME_COUNT,
  FIRE_SPITTER_FRAME_MS,
} from "../../simulation/entities/fireSpitters.js";

const CHECKPOINT_FRAME_MS = 120;
const CHECKPOINT_FRAME_COUNT = 8;
const CHECKPOINT_FRAME_PREFIX = "cm.f#6";
const CHECKPOINT_IDLE_FRAME_ID = `${CHECKPOINT_FRAME_PREFIX}:frame:0:palette:0`;
const GEM_LOCK_FRAME_ID = "cm.f#5:frame:0:palette:0";
const HUD_DIGIT_FRAME_PREFIX = "ui.f#2";
const DIAMOND_FRAME_MS = 120;
const DIAMOND_FRAME_COUNT = 4;
const DIAMOND_FRAME_PREFIX = "cm.f#2";
const DIAMOND_PAUSE_MS = 1000;
const BOULDER_FRAME_PREFIX = "0.f#0";
const BOULDER_CRUSH_DROP_MS = 600;
const ROLL_PENDING_WOBBLE_CYCLES = 5;
const ROLL_PENDING_WOBBLE_X = 0.08;
const ROLL_PENDING_WOBBLE_Y = 0.025;
const SNAKE_FRAME_MS = 120;
const SNAKE_FRAME_PREFIX = "gen1.f#5";
const SNAKE_FRAME_RANGES = {
  "x:1": [15, 16, 17, 18, 19, 20, 21],
  "x:-1": [24, 25, 26, 27, 28, 29, 30],
  "y:1": [5, 6, 7, 8],
  "y:-1": [11, 12, 13, 14],
};
const SNAKE_PLAYER_TARGET_FRAME_RANGES = {
  "x:1": [22, 23],
  "x:-1": [31, 32],
  "y:1": [9, 10],
};

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

function addGemLockRequirementDigits(sprite, assets, requiredDiamonds, textureCache) {
  const text = String(Math.max(0, Number(requiredDiamonds) || 0));
  const digitSprites = [];
  let totalWidth = 0;
  let maxHeight = 0;

  for (const char of text) {
    const texture = createAtlasFrameTexture(
      assets,
      "ui",
      `${HUD_DIGIT_FRAME_PREFIX}:module:${char}:palette:0`,
      textureCache,
    );
    if (!texture) continue;

    const digit = new Sprite({ texture, roundPixels: true });
    digit.label = `gem-lock-required:${char}`;
    digitSprites.push(digit);
    totalWidth += texture.width;
    maxHeight = Math.max(maxHeight, texture.height);
  }

  if (!digitSprites.length) return;

  const iconWidth = sprite.texture?.width || TILE_SIZE;
  const iconHeight = sprite.texture?.height || TILE_SIZE;
  let offsetX = Math.max(0, iconWidth - totalWidth - 1);
  const offsetY = Math.max(0, iconHeight - maxHeight - 2);

  for (const digit of digitSprites) {
    digit.x = offsetX;
    digit.y = offsetY;
    offsetX += digit.texture.width;
    sprite.addChild(digit);
  }
}

function getLeafAnimationFrameId(draw, frameIndex) {
  const match = draw.frameId?.match(
    /^(.+#1:)(?:module|frame):\d+(:palette:\d+)$/,
  );
  if (!match) return null;
  return `${match[1]}frame:${frameIndex}${match[2]}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function getEntityRenderPosition(entity, now) {
  const duration = entity.moveDuration || 0;
  const hasMove = duration > 0 && entity.moveStartedAt > 0;
  const progress = hasMove
    ? clamp01((now - entity.moveStartedAt) / duration)
    : 1;
  const rollOffset = hasMove ? { x: 0, y: 0 } : getRollPendingRenderOffset(entity, now);

  return {
    x: lerp(entity.prevX ?? entity.x, entity.x, progress) + rollOffset.x,
    y: lerp(entity.prevY ?? entity.y, entity.y, progress) + rollOffset.y,
  };
}

function getRollPendingRenderOffset(entity, now) {
  if (
    !(entity.rollPendingStartedAt > 0) ||
    !(entity.rollPendingDuration > 0) ||
    !entity.rollDirectionX
  ) {
    return { x: 0, y: 0 };
  }

  const progress = clamp01(
    (now - entity.rollPendingStartedAt) / entity.rollPendingDuration,
  );
  if (progress >= 1) return { x: 0, y: 0 };

  const wave = Math.sin(progress * Math.PI * 2 * ROLL_PENDING_WOBBLE_CYCLES);
  const amplitude = 0.35 + progress * 0.65;
  return {
    x: entity.rollDirectionX * wave * ROLL_PENDING_WOBBLE_X * amplitude,
    y: Math.abs(wave) * ROLL_PENDING_WOBBLE_Y * amplitude,
  };
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
  if (entity.type === "gem-lock" && draw.frameId === GEM_LOCK_FRAME_ID) {
    addGemLockRequirementDigits(
      sprite,
      assets,
      entity.requiredDiamonds,
      textureCache,
    );
  }
  container.addChild(sprite);
  entity.sprites.push(sprite);
  if (!entity.sprite) entity.sprite = sprite;
}

function getFireSpitterEffectFrameId(effect, now) {
  const elapsed = Math.max(0, now - effect.startedAt);
  const frameMs = effect.frameMs || FIRE_SPITTER_FRAME_MS;
  const frameCount = effect.frameCount || FIRE_SPITTER_FRAME_COUNT;
  const frameIndex = Math.min(Math.floor(elapsed / frameMs), frameCount - 1);
  return `${effect.framePrefix}:frame:${frameIndex}:palette:${effect.palette || 0}`;
}

function getFireSpitterEffectPosition(effect) {
  return {
    x: effect.originX ?? effect.x,
    y: effect.originY ?? effect.y,
  };
}

function getFireSpitterEffectSpriteX(effect, position, flipX) {
  if (flipX) return (position.x + 1) * TILE_SIZE;
  return position.x * TILE_SIZE;
}

function syncFireSpitterEffects(assets, levelState, now) {
  const effectLayer = levelState.effectLayer;
  const textureCache = levelState.effectTextureCache;
  if (!effectLayer || !textureCache) return;

  for (const effect of levelState.effects) {
    if (effect.type !== "fire-spitter-flame") continue;

    if (!effect.active) {
      if (effect.sprite) effect.sprite.visible = false;
      continue;
    }

    const frameId = getFireSpitterEffectFrameId(effect, now);
    const texture = createAtlasFrameTexture(
      assets,
      effect.atlas,
      frameId,
      textureCache,
    );
    if (!texture) continue;

    if (!effect.sprite) {
      effect.sprite = new Sprite({ texture, roundPixels: true });
      effect.sprite.label = effect.id;
      effectLayer.addChild(effect.sprite);
    } else if (effect.sprite.effectFrameId !== frameId) {
      effect.sprite.texture = texture;
    }

    effect.sprite.effectFrameId = frameId;
    const position = getFireSpitterEffectPosition(effect);
    const flipX = effect.sourceType === "fire-spitter-left";
    effect.sprite.scale.x = flipX ? -1 : 1;
    effect.sprite.scale.y = 1;
    effect.sprite.x = getFireSpitterEffectSpriteX(effect, position, flipX);
    effect.sprite.y =
      position.y * TILE_SIZE + Math.floor((TILE_SIZE - texture.height) / 2);
    effect.sprite.visible = true;
  }
}

function syncLeafSprite(assets, entity, sprite, now) {
  if (entity.type !== "leaf") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  if (!entity.vanishing) {
    if (sprite.entityAnimatedFrameId) {
      sprite.texture = createFrameTexture(
        assets,
        draw,
        sprite.entityTextureCache,
      );
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
    sprite.visible = false;
    return true;
  }

  const frameId = getLeafAnimationFrameId(draw, frameIndex);
  const texture = frameId
    ? createAtlasFrameTexture(
        assets,
        draw.atlas,
        frameId,
        sprite.entityTextureCache,
      )
    : null;
  if (texture) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  sprite.x =
    entity.x * TILE_SIZE + Math.floor((TILE_SIZE - sprite.texture.width) / 2);
  sprite.y =
    entity.y * TILE_SIZE + Math.floor((TILE_SIZE - sprite.texture.height) / 2);
  sprite.visible = true;
  return true;
}

function getSnakeDelta(entity) {
  const direction = entity.snakeDirection < 0 ? -1 : 1;
  return entity.snakeAxis === "y"
    ? { dx: 0, dy: direction }
    : { dx: direction, dy: 0 };
}

function getSnakeTrajectoryOrigin(entity) {
  const isMoving = entity.moveStartedAt > 0 && entity.moveDuration > 0;
  return {
    x: isMoving ? entity.prevX : entity.x,
    y: isMoving ? entity.prevY : entity.y,
  };
}

function isPlayerInSnakeTargetPath(entity, levelState) {
  const player = levelState.player;
  const origin = getSnakeTrajectoryOrigin(entity);
  const delta = getSnakeDelta(entity);
  return (
    player.alive !== false &&
    ((origin.x + delta.dx === player.x &&
      origin.y + delta.dy === player.y) ||
      (origin.x + delta.dx * 2 === player.x &&
        origin.y + delta.dy * 2 === player.y))
  );
}

function getSnakeFrameIndex(entity, range, now) {
  if (entity.moveStartedAt > 0 && entity.moveDuration > 0) {
    const progress = clamp01((now - entity.moveStartedAt) / entity.moveDuration);
    return range[Math.min(Math.floor(progress * range.length), range.length - 1)];
  }

  return range[Math.floor(now / SNAKE_FRAME_MS) % range.length];
}

function getSnakeFrameId(entity, draw, now, levelState) {
  const direction = entity.snakeDirection < 0 ? -1 : 1;
  const directionKey = `${entity.snakeAxis}:${direction}`;
  const range = isPlayerInSnakeTargetPath(entity, levelState)
    ? SNAKE_PLAYER_TARGET_FRAME_RANGES[directionKey] ||
      SNAKE_FRAME_RANGES[directionKey]
    : SNAKE_FRAME_RANGES[directionKey];
  if (!range) return null;

  const paletteMatch = draw.frameId?.match(/:palette:(\d+)$/);
  const palette = paletteMatch ? Number(paletteMatch[1]) : 0;
  const frameIndex = getSnakeFrameIndex(entity, range, now);
  return `${SNAKE_FRAME_PREFIX}:frame:${frameIndex}:palette:${palette}`;
}

function alignSnakeSprite(entity, sprite, draw, x, y) {
  const centeredX = Math.floor((TILE_SIZE - sprite.texture.width) / 2);
  sprite.scale.x = 1;
  sprite.scale.y = 1;

  if (entity.snakeAxis === "y") {
    sprite.x = x * TILE_SIZE + centeredX;
    sprite.y = y * TILE_SIZE + TILE_SIZE - sprite.texture.height;
    return;
  }

  sprite.x = x * TILE_SIZE + centeredX;
  sprite.y = y * TILE_SIZE + draw.dy;
}

function syncSnakeSprite(assets, levelState, entity, sprite, now) {
  if (entity.type !== "snake") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  const frameId = getSnakeFrameId(entity, draw, now, levelState);
  const texture = frameId
    ? createAtlasFrameTexture(
        assets,
        draw.atlas,
        frameId,
        sprite.entityTextureCache,
      )
    : null;
  if (texture && sprite.entityAnimatedFrameId !== frameId) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  const { x, y } = getEntityRenderPosition(entity, now);
  alignSnakeSprite(entity, sprite, draw, x, y);
  return true;
}

function getChestBrownFrameId(entity, now) {
  if (!entity.opening) {
    return entity.opened
      ? CHEST_BROWN_OPEN_FRAMES[CHEST_BROWN_OPEN_FRAMES.length - 1]
      : CHEST_BROWN_CLOSED_FRAME_ID;
  }

  const elapsed = Math.max(0, now - entity.openStartedAt);
  const frameIndex = Math.min(
    Math.floor(elapsed / CHEST_BROWN_FRAME_MS),
    CHEST_BROWN_OPEN_FRAMES.length - 1,
  );
  return CHEST_BROWN_OPEN_FRAMES[frameIndex];
}

function syncChestBrownSprite(assets, entity, sprite, now) {
  if (entity.type !== "chest-brown") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  if (draw.asset !== "chest-brown") {
    sprite.visible = false;
    return true;
  }

  const frameId = getChestBrownFrameId(entity, now);
  const texture = createAtlasFrameTexture(
    assets,
    draw.atlas,
    frameId,
    sprite.entityTextureCache,
  );
  if (texture && sprite.entityAnimatedFrameId !== frameId) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  const { x, y } = getEntityRenderPosition(entity, now);
  sprite.scale.x = 1;
  sprite.scale.y = 1;
  sprite.x = x * TILE_SIZE + Math.floor((TILE_SIZE - sprite.texture.width) / 2);
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.visible = entity.active;
  return true;
}

function getCheckpointFrameId(entity, now) {
  if (entity.activated) return CHECKPOINT_IDLE_FRAME_ID;
  const frameIndex =
    Math.floor(now / CHECKPOINT_FRAME_MS) % CHECKPOINT_FRAME_COUNT;
  return `${CHECKPOINT_FRAME_PREFIX}:frame:${frameIndex}:palette:0`;
}

function syncCheckpointSprite(assets, entity, sprite, now) {
  if (entity.type !== "checkpoint") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  if (draw.asset !== "checkpoint") return false;

  const frameId = getCheckpointFrameId(entity, now);
  const texture = createAtlasFrameTexture(
    assets,
    draw.atlas,
    frameId,
    sprite.entityTextureCache,
  );
  if (texture && sprite.entityAnimatedFrameId !== frameId) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  const { x, y } = getEntityRenderPosition(entity, now);
  sprite.scale.x = 1;
  sprite.scale.y = 1;
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.visible = entity.active;
  return true;
}

function getBoulderFrameId(entity, draw) {
  const match = draw.frameId?.match(
    /^0\.f#0:(?:module|frame):0:palette:(\d+)$/,
  );
  if (!match) return null;

  const palette = Number(match[1]);
  const frameIndex = Number.isInteger(entity.boulderFrameIndex)
    ? entity.boulderFrameIndex
    : 0;
  return `${BOULDER_FRAME_PREFIX}:frame:${frameIndex}:palette:${palette}`;
}

function syncBoulderSprite(assets, entity, sprite, now) {
  if (entity.type !== "boulder") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  const frameId = getBoulderFrameId(entity, draw);
  if (!frameId) return false;

  const texture = createAtlasFrameTexture(
    assets,
    draw.atlas,
    frameId,
    sprite.entityTextureCache,
  );
  if (texture && sprite.entityAnimatedFrameId !== frameId) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  const crush = entity.levelState?.player?.boulderCrush;
  const crushingPlayer = crush?.active && crush.boulderId === entity.id;
  const { x, y } = crushingPlayer
    ? getBoulderCrushRenderPosition(entity, entity.levelState.player, crush, now)
    : getEntityRenderPosition(entity, now);
  sprite.scale.x = 1;
  sprite.scale.y = 1;
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.visible = entity.active;
  return true;
}

function getBoulderCrushRenderPosition(entity, player, crush, now) {
  const progress = clamp01((now - crush.startedAt) / BOULDER_CRUSH_DROP_MS);
  return {
    x: lerp(entity.x, player.x, progress),
    y: lerp(entity.y, player.y, progress),
  };
}

function getDiamondFrameId(draw, now) {
  const match = draw.frameId?.match(/^cm\.f#2:frame:0:palette:(\d+)$/);
  if (!match) return null;

  const palette = Number(match[1]);
  const animationDuration = DIAMOND_FRAME_MS * DIAMOND_FRAME_COUNT;
  const cycleDuration = animationDuration + DIAMOND_PAUSE_MS;
  const cycleTime = now % cycleDuration;
  const frameIndex =
    cycleTime < animationDuration
      ? Math.floor(cycleTime / DIAMOND_FRAME_MS)
      : 0;
  return `${DIAMOND_FRAME_PREFIX}:frame:${frameIndex}:palette:${palette}`;
}

function syncDiamondSprite(assets, entity, sprite, now) {
  if (entity.type !== "diamond") return false;

  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  const frameId = getDiamondFrameId(draw, now);
  if (!frameId) return false;

  const texture = createAtlasFrameTexture(
    assets,
    draw.atlas,
    frameId,
    sprite.entityTextureCache,
  );
  if (texture && sprite.entityAnimatedFrameId !== frameId) {
    sprite.texture = texture;
    sprite.entityAnimatedFrameId = frameId;
  }

  const { x, y } = getEntityRenderPosition(entity, now);
  sprite.scale.x = 1;
  sprite.scale.y = 1;
  sprite.x = x * TILE_SIZE + draw.dx;
  sprite.y = y * TILE_SIZE + draw.dy;
  sprite.visible = entity.active && !entity.collected;
  return true;
}

function alignEntitySprite(entity, sprite, now) {
  const draw = sprite.entityDraw || { dx: 0, dy: 0 };
  const { x, y } = getEntityRenderPosition(entity, now);
  sprite.scale.x = 1;
  sprite.scale.y = 1;
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
    for (const draw of entity.draws)
      addEntityDraw(itemLayer, assets, entity, draw, textureCache);
  }

  levelState.effectLayer = effectLayer;
  levelState.effectTextureCache = textureCache;

  return {
    itemLayer,
    actorLayer,
    effectLayer,
  };
}

export function syncLevelStateSprites(assets, levelState, now = Date.now()) {
  for (const entity of levelState.entities) {
    entity.levelState = levelState;
    const visible = entity.active && !entity.collected;
    for (const sprite of entity.sprites) {
      if (syncDoorSprite(assets, entity, sprite, now)) {
        sprite.visible = visible;
        continue;
      }
      if (syncLeafSprite(assets, entity, sprite, now)) continue;
      if (syncSnakeSprite(assets, levelState, entity, sprite, now)) {
        sprite.visible = visible;
        continue;
      }
      if (syncChestBrownSprite(assets, entity, sprite, now)) continue;
      if (syncCheckpointSprite(assets, entity, sprite, now)) continue;
      if (syncBoulderSprite(assets, entity, sprite, now)) continue;
      if (syncDiamondSprite(assets, entity, sprite, now)) continue;
      alignEntitySprite(entity, sprite, now);
      sprite.visible = visible;
    }
  }

  syncPlayerSprite(assets, levelState.player, now);
  syncFireSpitterEffects(assets, levelState, now);
}
