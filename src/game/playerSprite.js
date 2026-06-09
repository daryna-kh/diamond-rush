import { Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";
import {
  CHEST_BROWN_REWARD_FRAME_MS,
  CHEST_BROWN_REWARD_GEM_FRAME_ID,
  CHEST_BROWN_REWARD_GEM_FRAME_INDEXES,
  CHEST_BROWN_REWARD_LOOP_DURATION_MS,
  CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES,
  CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES,
  DIAMOND_COLLECT_PLAYER_FRAME_INDEXES,
  DIAMOND_COLLECT_PLAYER_FRAME_PREFIX,
  getChestBrownRewardDurationMs,
} from "./playerAnimations.js";

const PLAYER_ATLAS = "objects";
const PLAYER_TEXTURES = new Map();
const IDLE_ANIMATION_FRAME_MS = 120;
const INTRO_WALK_FRAME_MS = 120;
const EXIT_CURTAIN_DURATION_MS = 1000;
const BOULDER_HOLD_FRAME_MS = 140;
const BOULDER_CRUSH_FRAME_MS = 140;
const BOULDER_CRUSH_HOLD_WARNING_MS = 1000;
const BOULDER_CRUSH_STRUGGLE_MS = 600;
const BOULDER_HOLD_EARLY_FRAMES = [23, 24];
const BOULDER_HOLD_LATE_FRAMES = [8, 9];
const BOULDER_CRUSH_FRAMES = [10, 11, 12, 13];

function frameId(index, prefix = "o.f#0") {
  return `${prefix}:frame:${index}:palette:0`;
}

function frame(index, { flipX = false, prefix } = {}) {
  return { frameId: frameId(index, prefix), index, flipX };
}

const HORIZONTAL_DIRECTION_FRAMES = [62, 63, 64, 65, 66, 67];
const HORIZONTAL_WALK_FRAMES = [0, 1, 2];
const HORIZONTAL_PUSH_FRAMES = [3, 4, 5];

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
    down: [77, 71, 73, 74, 76, 78].map((index) => frame(index)),
    up: [68, 70, 72, 75, 77].map((index) => frame(index)),
    left: HORIZONTAL_WALK_FRAMES.map((index) => frame(index, { flipX: true })),
    right: HORIZONTAL_WALK_FRAMES.map((index) => frame(index)),
  },
  push: {
    left: HORIZONTAL_PUSH_FRAMES.map((index) => frame(index, { flipX: true })),
    right: HORIZONTAL_PUSH_FRAMES.map((index) => frame(index)),
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
  if (animation.type === "diamond-collect") return null;

  const frameIndexes =
    animation.frameIndexes || CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES;
  const loopFrameIndexes =
    animation.loopFrameIndexes || CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES;
  const framePrefix = animation.framePrefix || "o.f#0";
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
    return frame(frameIndexes[animationFrameIndex], { prefix: framePrefix });
  }

  const loopElapsed = Math.min(elapsed - introDuration, loopDuration);
  const loopFrameIndex = Math.floor(loopElapsed / frameMs) % loopFrameIndexes.length;
  return frame(loopFrameIndexes[loopFrameIndex], { prefix: framePrefix });
}

function getBoulderHoldFrame(player, now) {
  if (player.boulderCrush?.active) {
    const elapsed = Math.max(0, now - player.boulderCrush.startedAt);
    if (elapsed >= BOULDER_CRUSH_STRUGGLE_MS) return frame(14);

    const frameIndex = Math.min(
      Math.floor(elapsed / BOULDER_CRUSH_FRAME_MS),
      BOULDER_CRUSH_FRAMES.length - 1,
    );
    return frame(BOULDER_CRUSH_FRAMES[frameIndex]);
  }

  const hold = player.boulderHold;
  if (!hold?.active) return null;

  const elapsed = Math.max(0, now - hold.startedAt);
  const frames =
    elapsed >= BOULDER_CRUSH_HOLD_WARNING_MS
      ? BOULDER_HOLD_LATE_FRAMES
      : BOULDER_HOLD_EARLY_FRAMES;
  const frameIndex = Math.floor(elapsed / BOULDER_HOLD_FRAME_MS) % frames.length;
  return frame(frames[frameIndex]);
}

function getDiamondCollectEffectFrame(player, now) {
  const animation = player.specialAnimation;
  if (!animation?.active || animation.type !== "diamond-collect") return null;

  const frameIndexes =
    animation.frameIndexes || DIAMOND_COLLECT_PLAYER_FRAME_INDEXES;
  const framePrefix = animation.framePrefix || DIAMOND_COLLECT_PLAYER_FRAME_PREFIX;
  const frameMs = animation.frameMs || 80;
  const duration = animation.durationMs || frameIndexes.length * frameMs;
  const elapsed = Math.max(0, now - animation.startedAt);

  if (elapsed >= duration) {
    animation.active = false;
    return null;
  }

  const frameIndex = frameIndexes[
    Math.min(Math.floor(elapsed / frameMs), frameIndexes.length - 1)
  ];
  return frame(frameIndex, { prefix: framePrefix });
}

function getPlayerFrame(player, now) {
  const boulderFrame = getBoulderHoldFrame(player, now);
  if (boulderFrame) return boulderFrame;

  const specialFrame = getSpecialAnimationFrame(player, now);
  if (specialFrame) return specialFrame;

  const direction = getDirection(player);
  if (player.pushing && PLAYER_SPRITE_FRAMES.push[direction]) {
    const frames = PLAYER_SPRITE_FRAMES.push[direction];
    const index = (player.walkFrame || 0) % frames.length;
    return frames[index];
  }

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
  if (updatePlayerExitAutoMove(player, now)) return;

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

function updatePlayerExitAutoMove(player, now) {
  const exitAutoMove = player.exitAutoMove;
  if (!exitAutoMove?.active) return false;

  if (!exitAutoMove.moveStartedAt) {
    exitAutoMove.moveStartedAt = now;
  }

  const progress = clamp01(
    (now - exitAutoMove.moveStartedAt) / exitAutoMove.moveDuration,
  );
  player.hidden = false;
  player.direction = exitAutoMove.direction;
  player.renderX = lerp(exitAutoMove.startX, exitAutoMove.targetX, progress);
  player.renderY = lerp(exitAutoMove.startY, exitAutoMove.targetY, progress);
  player.walkFrame = Math.floor(
    (now - exitAutoMove.moveStartedAt) / INTRO_WALK_FRAME_MS,
  );
  player.moving = progress < 1;
  player.visualMoving = progress < 1;

  if (progress >= 1) {
    player.x = exitAutoMove.targetX;
    player.y = exitAutoMove.targetY;
    player.prevX = exitAutoMove.targetX;
    player.prevY = exitAutoMove.targetY;
    player.renderX = exitAutoMove.targetX;
    player.renderY = exitAutoMove.targetY;
    player.walkFrame = 0;
    player.moving = false;
    player.visualMoving = false;
    player.hidden = true;
    player.exitCurtain = {
      active: true,
      startedAt: now,
      duration: EXIT_CURTAIN_DURATION_MS,
    };
    exitAutoMove.active = false;
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

function syncPlayerDiamondCollectSprite(assets, player, now) {
  if (!player.sprite) return;

  const effectFrame = getDiamondCollectEffectFrame(player, now);
  if (!effectFrame) {
    if (player.diamondCollectSprite) {
      player.diamondCollectSprite.visible = false;
    }
    return;
  }

  if (!player.diamondCollectSprite) {
    const texture = createFrameTexture(assets, effectFrame.frameId);
    const sprite = new Sprite({ texture, roundPixels: true });
    sprite.label = "player:diamond-collect";
    sprite.anchor.set(0.5, 1);
    sprite.x = 0;
    sprite.y = TILE_SIZE;
    sprite.visible = false;
    player.sprite.addChild(sprite);
    player.diamondCollectSprite = sprite;
    player.diamondCollectFrameId = null;
  }

  if (player.diamondCollectFrameId !== effectFrame.frameId) {
    player.diamondCollectSprite.texture = createFrameTexture(
      assets,
      effectFrame.frameId,
    );
    player.diamondCollectFrameId = effectFrame.frameId;
  }

  player.diamondCollectSprite.visible = true;
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
  syncPlayerDiamondCollectSprite(assets, player, now);
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
