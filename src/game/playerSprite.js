import { Rectangle, Sprite, Texture } from "pixi.js";
import { TILE_SIZE } from "../render/StageRenderer.js";

const PLAYER_ATLAS = "objects";
const PLAYER_TEXTURES = new Map();

function frameId(index) {
  return `o.f#0:frame:${index}:palette:0`;
}

function frame(index, { flipX = false } = {}) {
  return { frameId: frameId(index), flipX };
}

const HORIZONTAL_WALK_FRAMES = [62, 63, 64, 65, 66, 67, 64, 65];

export const PLAYER_SPRITE_FRAMES = Object.freeze({
  idle: {
    down: frame(73),
    up: frame(72),
    left: frame(62),
    right: frame(62, { flipX: true }),
  },
  walk: {
    down: [73, 76, 78, 76, 74, 71, 69, 71].map((index) => frame(index)),
    up: [72, 75, 77, 75, 72, 70, 68, 70].map((index) => frame(index)),
    left: HORIZONTAL_WALK_FRAMES.map((index) => frame(index)),
    right: HORIZONTAL_WALK_FRAMES.map((index) => frame(index, { flipX: true })),
  },
});

function createFrameTexture(assets, frameId) {
  if (PLAYER_TEXTURES.has(frameId)) return PLAYER_TEXTURES.get(frameId);

  const frame = assets.atlases.objects.frames.find((candidate) => candidate.id === frameId);
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
  if (player.direction && PLAYER_SPRITE_FRAMES.idle[player.direction]) return player.direction;
  return "down";
}

function getPlayerFrame(player) {
  const direction = getDirection(player);
  if (player.moving) {
    const frames = PLAYER_SPRITE_FRAMES.walk[direction];
    const index = (player.walkFrame || 0) % frames.length;
    return frames[index];
  }
  return PLAYER_SPRITE_FRAMES.idle[direction];
}

function alignPlayerSprite(player) {
  if (!player.sprite) return;
  player.sprite.x = player.x * TILE_SIZE + TILE_SIZE / 2;
  player.sprite.y = player.y * TILE_SIZE + TILE_SIZE - player.sprite.texture.height;
}

export function syncPlayerSprite(assets, player) {
  if (!player.sprite) return;

  const nextFrame = getPlayerFrame(player);
  if (player.spriteFrameId !== nextFrame.frameId) {
    player.sprite.texture = createFrameTexture(assets, nextFrame.frameId);
    player.spriteFrameId = nextFrame.frameId;
  }

  player.sprite.scale.x = nextFrame.flipX ? -1 : 1;
  player.sprite.scale.y = 1;
  player.spriteFlipX = nextFrame.flipX;
  alignPlayerSprite(player);
}

export function createPlayerSprite(assets, player) {
  const nextFrame = getPlayerFrame(player);
  const texture = createFrameTexture(assets, nextFrame.frameId);
  const sprite = new Sprite({ texture, roundPixels: true });
  sprite.label = "player";
  sprite.anchor.set(0.5, 0);
  player.sprite = sprite;
  player.spriteFrameId = nextFrame.frameId;
  player.spriteFlipX = nextFrame.flipX;
  syncPlayerSprite(assets, player);
  sprite.zIndex = 20;
  return sprite;
}
