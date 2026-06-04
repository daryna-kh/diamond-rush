import { Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";
import {
  CHEST_BROWN_REWARD_FRAME_MS,
  CHEST_BROWN_REWARD_GEM_FRAME_ID,
  CHEST_BROWN_REWARD_GEM_FRAME_INDEXES,
  CHEST_BROWN_REWARD_LOOP_DURATION_MS,
  CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES,
  CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES,
  getChestBrownRewardDurationMs,
} from "./playerAnimations.js";

const PLAYER_ATLAS = "objects";
const PLAYER_TEXTURES = new Map();
const IDLE_ANIMATION_FRAME_MS = 120;
const INTRO_WALK_FRAME_MS = 120;

function frameId(index) {
  return `o.f#0:frame:${index}:palette:0`;
}

function frame(index, { flipX = false } = {}) {
  return { frameId: frameId(index), index, flipX };
}

const HORIZONTAL_DIRECTION_FRAMES = [62, 63, 64, 65, 66, 67];
const HORIZONTAL_WALK_FRAMES = [62, 63, 64, 65, 66, 67, 64, 65];

export const PLAYER_SPRITE_FRAMES = Object.freeze({
  idle: {
    down: frame(73),
    up: frame(72),
    left: HORIZONTAL_DIRECTION_FRAMES.map((index) =>
      frame(index, { flipX: true }),
    ),
    right: HORIZONTAL_DIRECTION_FRAMES.map((index) => frame(index)),
  },
  walk: {
    down: [73, 76, 78, 76, 74, 71, 69, 71].map((index) => frame(index)),
    up: [72, 75, 77, 75, 72, 70, 68, 70].map((index) => frame(index)),
    left: HORIZONTAL_WALK_FRAMES.map((index) => frame(index, { flipX: true })),
    right: HORIZONTAL_WALK_FRAMES.map((index) => frame(index)),
  },
});

function createFrameTexture(assets, frameId) {
  if (PLAYER_TEXTURES.has(frameId)) return PLAYER_TEXTURES.get(frameId);

  const frame = assets.atlases.objects.frames.find(
    (candidate) => candidate.id === frameId,
  );
  if (!frame) throw new Error(`Missing player frame: ${frameId}`);

  const texture = new Texture({
    source: assets.textures[PLAYER_ATLAS].source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    label: frameId,
  });
  PLAYER_TEXTURES.set(frameId, texture);
  return texture;
}

function getDirection(player) {
  if (player.direction && PLAYER_SPRITE_FRAMES.idle[player.direction])
    return player.direction;
  return "down";
}

function getLoopFrame(frames, now, frameMs) {
  const index = Math.floor(now / frameMs) % frames.length;
  return frames[index];
}

function getSpecialAnimationFrame(player, now) {
  const animation = player.specialAnimation;
  if (!animation?.active) return null;

  const frameIndexes =
    animation.frameIndexes || CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES;
  const loopFrameIndexes =
    animation.loopFrameIndexes || CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES;
  const frameMs = animation.frameMs || CHEST_BROWN_REWARD_FRAME_MS;
  const elapsed = Math.max(0, now - animation.startedAt);
  const introDuration = frameIndexes.length * frameMs;
  const loopDuration = animation.loopDurationMs || CHEST_BROWN_REWARD_LOOP_DURATION_MS;
  const duration =
    animation.durationMs || getChestBrownRewardDurationMs(frameMs);

  if (elapsed >= duration) {
    animation.active = false;
    return null;
  }

  if (elapsed < introDuration) {
    const animationFrameIndex = Math.floor(elapsed / frameMs);
    return frame(frameIndexes[animationFrameIndex]);
  }

  const loopElapsed = Math.min(elapsed - introDuration, loopDuration);
  const loopFrameIndex = Math.floor(loopElapsed / frameMs) % loopFrameIndexes.length;
  return frame(loopFrameIndexes[loopFrameIndex]);
}

function getPlayerFrame(player, now) {
  const specialFrame = getSpecialAnimationFrame(player, now);
  if (specialFrame) return specialFrame;

  const direction = getDirection(player);
  if (player.moving || player.visualMoving) {
    const frames = PLAYER_SPRITE_FRAMES.walk[direction];
    const index = (player.walkFrame || 0) % frames.length;
    return frames[index];
  }

  const idleFrame = PLAYER_SPRITE_FRAMES.idle[direction];
  return Array.isArray(idleFrame)
    ? getLoopFrame(idleFrame, now, IDLE_ANIMATION_FRAME_MS)
    : idleFrame;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function updatePlayerRenderPosition(player, now) {
  if (updatePlayerIntro(player, now)) return;

  const duration = player.moveDuration || 0;
  const hasMove = duration > 0 && player.moveStartedAt > 0;
  const progress = hasMove
    ? clamp01((now - player.moveStartedAt) / duration)
    : 1;

  player.renderX = lerp(player.prevX ?? player.x, player.x, progress);
  player.renderY = lerp(player.prevY ?? player.y, player.y, progress);
  player.visualMoving = progress < 1;
}

function updatePlayerIntro(player, now) {
  const intro = player.intro;
  if (!intro?.active) return false;

  if (!intro.moveStartedAt) {
    intro.moveStartedAt = now;
  }

  const progress = clamp01((now - intro.moveStartedAt) / intro.moveDuration);
  player.hidden = false;
  player.direction = "right";
  player.renderX = lerp(intro.startX, intro.targetX, progress);
  player.renderY = lerp(intro.startY, intro.targetY, progress);
  player.walkFrame = Math.floor((now - intro.moveStartedAt) / INTRO_WALK_FRAME_MS);
  player.moving = progress < 1;
  player.visualMoving = progress < 1;
  if (!intro.doorClosed && intro.doorAnimation && player.renderX >= intro.doorX + 1) {
    intro.doorAnimation.state = "closing";
    intro.doorAnimation.startedAt = now;
    intro.doorClosed = true;
  }

  if (progress >= 1) {
    player.x = intro.targetX;
    player.y = intro.targetY;
    player.prevX = intro.targetX;
    player.prevY = intro.targetY;
    player.renderX = intro.targetX;
    player.renderY = intro.targetY;
    player.direction = intro.finalDirection;
    player.walkFrame = 0;
    player.moving = false;
    player.visualMoving = false;
    player.hidden = false;
    intro.active = false;
  }

  return true;
}

function alignPlayerSprite(player) {
  if (!player.sprite) return;
  player.sprite.x = player.renderX * TILE_SIZE + TILE_SIZE / 2;
  player.sprite.y =
    player.renderY * TILE_SIZE + TILE_SIZE - player.sprite.texture.height;
}

function syncPlayerGemSprite(assets, player, nextFrame) {
  if (!player.sprite) return;

  if (!player.gemSprite) {
    const texture = createFrameTexture(assets, CHEST_BROWN_REWARD_GEM_FRAME_ID);
    const sprite = new Sprite({ texture, roundPixels: true });
    sprite.label = "player:gem-red";
    sprite.anchor.set(0.5, 1);
    sprite.x = 0;
    sprite.y = -2;
    sprite.visible = false;
    player.sprite.addChild(sprite);
    player.gemSprite = sprite;
  }

  player.gemSprite.visible =
    player.specialAnimation?.active &&
    player.specialAnimation.type === "chest-brown-reward" &&
    CHEST_BROWN_REWARD_GEM_FRAME_INDEXES.includes(nextFrame.index);
}

export function syncPlayerSprite(assets, player, now = Date.now()) {
  if (!player.sprite) return;

  updatePlayerRenderPosition(player, now);
  const nextFrame = getPlayerFrame(player, now);
  if (player.spriteFrameId !== nextFrame.frameId) {
    player.sprite.texture = createFrameTexture(assets, nextFrame.frameId);
    player.spriteFrameId = nextFrame.frameId;
  }

  player.sprite.scale.x = nextFrame.flipX ? -1 : 1;
  player.sprite.scale.y = 1;
  player.spriteFlipX = nextFrame.flipX;
  player.sprite.visible = !player.hidden && player.alive !== false;
  syncPlayerGemSprite(assets, player, nextFrame);
  alignPlayerSprite(player);
}

export function createPlayerSprite(assets, player) {
  const now = 0;
  const nextFrame = getPlayerFrame(player, now);
  const texture = createFrameTexture(assets, nextFrame.frameId);
  const sprite = new Sprite({ texture, roundPixels: true });
  sprite.label = "player";
  sprite.anchor.set(0.5, 0);
  player.sprite = sprite;
  player.spriteFrameId = nextFrame.frameId;
  player.spriteFlipX = nextFrame.flipX;
  sprite.scale.x = nextFrame.flipX ? -1 : 1;
  sprite.visible = !player.intro?.active && player.alive !== false;
  alignPlayerSprite(player);
  sprite.zIndex = 20;
  return sprite;
}
